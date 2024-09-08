// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {EVMFetchTarget, IEVMVerifier} from "@unruggable/evmgateway/contracts/EVMFetchTarget.sol";
import {EVMFetcher, EVMRequest} from "@unruggable/evmgateway/contracts/EVMFetcher.sol";

import {ENS} from "@ensdomains/ens-contracts/contracts/registry/ENS.sol";
import {BytesUtils} from "@ensdomains/ens-contracts/contracts/utils/BytesUtils.sol";
import {IExtendedResolver} from "@ensdomains/ens-contracts/contracts/resolvers/profiles/IExtendedResolver.sol";
import {IAddrResolver} from "@ensdomains/ens-contracts/contracts/resolvers/profiles/IAddrResolver.sol";
import {IAddressResolver} from "@ensdomains/ens-contracts/contracts/resolvers/profiles/IAddressResolver.sol";
import {ITextResolver} from "@ensdomains/ens-contracts/contracts/resolvers/profiles/ITextResolver.sol";
import {IContentHashResolver} from "@ensdomains/ens-contracts/contracts/resolvers/profiles/IContentHashResolver.sol";

abstract contract AbstractLinkResolver is EVMFetchTarget, IExtendedResolver {

	using BytesUtils for bytes;

	uint256 constant SLOT_MEDIATORS = 2;
	uint256 constant SLOT_LINKS = 3;
	uint256 constant SLOT_RECORDS = 4;

	error Unreachable(bytes name); 
	error UnsupportedProfile(bytes4 selector);
	
	ENS immutable _ens;
	IEVMVerifier immutable _verifier;
	address immutable _linker;
	constructor(ENS ens, IEVMVerifier verifier, address linker) {
		_ens = ens;
		_verifier = verifier;
		_linker = linker;
	}

	function supportsInterface(bytes4 x) external pure returns (bool) {
		return x == type(IERC165).interfaceId
			|| x == type(IExtendedResolver).interfaceId;
	}

	function _determineKey(bytes calldata v) internal pure returns (bytes32) {
		bytes4 selector = bytes4(v);
		if (selector == IAddrResolver.addr.selector) {
			return bytes32(uint256(60));
		} else if (selector == IAddressResolver.addr.selector) {
			(, uint256 coinType) = abi.decode(v[4:], (bytes32, uint256));
			return bytes32(coinType);
		} else if (selector == ITextResolver.text.selector) {
			(, string memory key) = abi.decode(v[4:], (bytes32, string));
			return keccak256(bytes(key));
		} else if (selector == IContentHashResolver.contenthash.selector) {
			return bytes32(uint256(keccak256("contenthash")) - 1);
		} else {
			revert UnsupportedProfile(selector);
		}
	}

	function _takeFragment(bytes memory dnsname, uint256 offset) internal pure returns (bytes memory fragment) {
		fragment = dnsname.substring(0, offset + 1);
		fragment[offset] = bytes1(0);
		// uint256 save;
		// assembly {
		// 	save := mload(dnsname)
		// 	mstore(dnsname, add(offset, 1))
		// }
		// fragment = abi.encode(dnsname);
		// assembly { 
		// 	mstore(dnsname, save) 
		// 	mstore8(add(fragment, offset), 0)
		// }
	}

	function _findSelf(bytes memory dnsname) internal view returns (bytes32 node, uint256 offset) {
		unchecked {
			while (true) {
				node = dnsname.namehash(offset);
				if (_ens.resolver(node) == address(this)) break;
				uint256 size = uint256(uint8(dnsname[offset]));
				if (size == 0) revert Unreachable(dnsname);
				offset += 1 + size;
			}
		}
	}

}