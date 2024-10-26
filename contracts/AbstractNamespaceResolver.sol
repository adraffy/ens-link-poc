// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { IERC165 } from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import { GatewayFetchTarget, IGatewayVerifier } from "@unruggable/gateways/contracts/GatewayFetchTarget.sol";
import { ENS } from "@ensdomains/ens-contracts/contracts/registry/ENS.sol";
import { BytesUtils } from "@ensdomains/ens-contracts/contracts/utils/BytesUtils.sol";
import { IExtendedResolver } from "@ensdomains/ens-contracts/contracts/resolvers/profiles/IExtendedResolver.sol";

error NotAuthorized();
error Unreachable(bytes dnsname);

abstract contract AbstractNamespaceResolver is
	GatewayFetchTarget,
	IExtendedResolver
{
	using BytesUtils for bytes;

	ENS immutable _ens;
	IGatewayVerifier immutable _verifier;
	address immutable _namespace;
	constructor(address ens, address verifier, address namespace) {
		_ens = ENS(ens);
		_verifier = IGatewayVerifier(verifier);
		_namespace = namespace;
	}

	function supportsInterface(bytes4 x) external pure returns (bool) {
		return
			x == type(IERC165).interfaceId ||
			x == type(IExtendedResolver).interfaceId;
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

	function _pathhash(
		bytes memory dnsname,
		uint256 offset
	) internal pure returns (bytes32) {
		bytes memory v = dnsname.substring(0, offset + 1);
		v[offset] = bytes1(0);
		return v.namehash(0);
	}

	function _prevOffset(
		bytes memory dnsname,
		uint256 end
	) internal pure returns (uint256 offset) {
		unchecked {
			while (true) {
				uint8 size = uint8(dnsname[offset]);
				uint256 next = offset + 1 + size;
				if (next == end) break;
				offset = next;
			}
		}
	}

	function _nullResponse() internal pure returns (bytes memory) {
		//revert("unsupported");
		// NOTE: this abi.decodes for most queries as a null response
		// addr() addr(coinType) text() pubkey() contenthash()
		return new bytes(64);
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
