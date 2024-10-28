// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { GatewayFetchTarget, IGatewayVerifier } from "@unruggable/gateways/contracts/GatewayFetchTarget.sol";
import { GatewayFetcher, GatewayRequest } from "@unruggable/gateways/contracts/GatewayFetcher.sol";
import { ENS } from "@ensdomains/ens-contracts/contracts/registry/ENS.sol";
import { BytesUtils, BytesUtilsExt } from "./BytesUtilsExt.sol";
import { Ownable } from "@openzeppelin/contracts/access/Ownable.sol";
import { IERC165 } from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import { IExtendedResolver } from "@ensdomains/ens-contracts/contracts/resolvers/profiles/IExtendedResolver.sol";
import { StorageKey, IAddrResolver } from "./StorageKey.sol";
import { ILastModifiedResolver } from "./ILastModifiedResolver.sol";
import { NamespaceLayout } from "./INamespace.sol";

//import "forge-std/console2.sol";

contract LinkedResolver is
	IERC165,
	IExtendedResolver,
	GatewayFetchTarget,
	Ownable
{
	error NotAuthorized();
	error Unreachable(bytes dnsname);

	event LinkChanged(bytes32 indexed node, bytes link);

	uint256 constant SLOT_NFT_NS_PROGRAM =
		uint256(keccak256("namespace.program")) - 1;
	uint256 constant SLOT_NFT_BASE_NS =
		uint256(keccak256("namespace.base")) - 1;

	uint256 constant EVM_BIT = 0x80000000;
	uint256 constant EVM_FALLBACK_COIN_TYPE = EVM_BIT;

	uint8 constant EXIT_CODE_NS_PROGRAM = 1;
	uint8 constant EXIT_CODE_MISSING_NS = 2;

	using GatewayFetcher for GatewayRequest;
	using BytesUtils for bytes;
	using BytesUtilsExt for bytes;

	ENS immutable _ens;
	IGatewayVerifier immutable _verifier;
	address immutable _namespace;

	string[] _gateways;
	mapping(bytes32 node => bytes) _links;

	constructor(
		ENS ens,
		IGatewayVerifier verifier,
		address namespace
	) Ownable(msg.sender) {
		_ens = ens;
		_verifier = verifier;
		_namespace = namespace;
	}

	function setGatewayURLs(string[] memory urls) external onlyOwner {
		_gateways = urls;
	}

	// IERC165

	function supportsInterface(bytes4 x) external pure returns (bool) {
		return
			x == type(IERC165).interfaceId ||
			x == type(IExtendedResolver).interfaceId;
	}

	// IExtendedResolver

	enum Mode {
		DEFAULT,
		EVM_FALLBACK,
		LAST_MOD
	}

	function resolve(
		bytes memory dnsname,
		bytes calldata data
	) external view returns (bytes memory) {
		(bytes32 baseNode, uint256 baseOffset) = _findSelf(dnsname);
		bytes memory link = _links[baseNode];
		if (link.length == 0) {
			return new bytes(64);
		}

		bytes32 key;
		Mode mode;
		if (bytes4(data) == ILastModifiedResolver.lastModified.selector) {
			mode = Mode.LAST_MOD;
			key = StorageKey.parse(abi.decode(data[4:], (bytes)));
		} else {
			(bool ok, uint256 coinType) = StorageKey.parseAddr(data);
			if (
				ok &&
				(coinType == 60 || (coinType & EVM_BIT) != 0) &&
				coinType != EVM_FALLBACK_COIN_TYPE
			) {
				mode = Mode.EVM_FALLBACK;
			}
			key = StorageKey.parse(data);
		}

		GatewayRequest memory req = GatewayFetcher.newRequest(2);
		bytes32 path;
		if (link.length == 20) {
			req.push(link).target();
			if (baseOffset == 0) {
				req.setSlot(SLOT_NFT_BASE_NS);
				req.read().setOutput(0);
			} else {
				uint256 pathOffset = dnsname.prevOffset(baseOffset);
				path = dnsname.take(pathOffset).namehash(0);

				bytes memory label = dnsname.substring(
					pathOffset + 1,
					baseOffset - pathOffset - 1
				);
				req.push(block.timestamp);
				req.push(label);
				req.setSlot(SLOT_NFT_NS_PROGRAM).readBytes();
				req.requireNonzero(EXIT_CODE_NS_PROGRAM).eval();
				req.setOutput(0);
			}
		} else if (link.length == 32) {
			req.push(link).setOutput(0);
			path = dnsname.take(baseOffset).namehash(0);
		}
		req.pushOutput(0).requireNonzero(EXIT_CODE_MISSING_NS);

		req.setTarget(_namespace);
		req.setSlot(NamespaceLayout.SLOT_RECORDS);
		req.pushOutput(0).follow(); // records[ns]
		req.push(path).follow(); // records[ns][path]
		req.getSlot(); // save
		req.push(key).follow(); // records[ns][path][key]

		if (mode == Mode.LAST_MOD) {
			req.read(); // .time
		} else {
			req.offset(1).read(); // .hash
			if (mode == Mode.EVM_FALLBACK) {
				GatewayRequest memory cmd = GatewayFetcher.newCommand();
				cmd.pop(); // remove zero hash
				cmd.slot(); // load saved slot
				cmd.push(StorageKey.addr(EVM_FALLBACK_COIN_TYPE)).follow(); // fallback address
				cmd.offset(1).read(); // .hash
				req.push(cmd).dup(1).isZero().evalIf();
			}
			req.requireNonzero(0);
			req.offset(1).readHashedBytes(); // .value
		}
		req.setOutput(1);

		fetch(_verifier, req, this.resolveCallback.selector, data, _gateways);
	}

	function resolveCallback(
		bytes[] memory values,
		uint8 /*exitCode*/,
		bytes calldata carry
	) external pure returns (bytes memory) {
		bytes4 selector = bytes4(carry);
		if (bytes4(carry) == ILastModifiedResolver.lastModified.selector) {
			return abi.encode(bytes32(values[1]));
		} else if (selector == IAddrResolver.addr.selector) {
			return abi.encode(address(bytes20(values[1])));
		} else {
			return abi.encode(values[1]);
		}
	}

	function _findSelf(
		bytes memory dnsname
	) internal view returns (bytes32 node, uint256 offset) {
		unchecked {
			while (true) {
				node = dnsname.namehash(offset);
				if (_ens.resolver(node) == address(this)) break;
				uint256 size = uint8(dnsname[offset]);
				if (size == 0) revert Unreachable(dnsname);
				offset += 1 + size;
			}
		}
	}

	// links

	function setLink(bytes32 node, bytes memory link) external {
		if (!_canModifyNode(node, msg.sender)) revert NotAuthorized();
		_links[node] = link;
		emit LinkChanged(node, link);
	}

	function getLink(bytes32 node) external view returns (bytes memory) {
		return _links[node];
	}

	function _canModifyNode(
		bytes32 node,
		address op
	) internal view returns (bool) {
		address owner = _ens.owner(node);
		return
			owner == op ||
			(owner != address(0) && _ens.isApprovedForAll(owner, op));
	}
}
