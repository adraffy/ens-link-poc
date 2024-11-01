// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { IAddrResolver } from "@ensdomains/ens-contracts/contracts/resolvers/profiles/IAddrResolver.sol";
import { IAddressResolver } from "@ensdomains/ens-contracts/contracts/resolvers/profiles/IAddressResolver.sol";
import { ITextResolver } from "@ensdomains/ens-contracts/contracts/resolvers/profiles/ITextResolver.sol";
import { IContentHashResolver } from "@ensdomains/ens-contracts/contracts/resolvers/profiles/IContentHashResolver.sol";

library StorageKey {
	error UnsupportedProfile(bytes4 selector);

	function addr(uint256 coinType) internal pure returns (bytes32) {
		return keccak256(abi.encodePacked(coinType, uint256(0)));
	}
	function text(string memory key) internal pure returns (bytes32) {
		return keccak256(abi.encodePacked(key, uint256(1)));
	}
	function mono(bytes4 selector) internal pure returns (bytes32) {
		return keccak256(abi.encodePacked(selector, uint256(2)));
	}

	// https://adraffy.github.io/keccak.js/test/demo.html#algo=keccak-256&s=0xbc1c58d10000000000000000000000000000000000000000000000000000000000000002&escape=1&encoding=hex
	bytes32 constant CHASH = 0xa2555defb234ce18f77f94de1e86e488f6b01044d1b93e78bf81bc760f30e0c1;

	// https://adraffy.github.io/keccak.js/test/demo.html#algo=keccak-256&s=0xc86902330000000000000000000000000000000000000000000000000000000000000002&escape=1&encoding=hex
	bytes32 constant PUBKEY = 0x09fb8735909dd331237a6beb0776b7175d5f1aba498474ba1681f771a8dfde34;

	function parseAddr(bytes memory v) internal pure returns (bool ok, uint256 coinType) {
		if (bytes4(v) == IAddrResolver.addr.selector) {
			ok = true;
			coinType = 60;
		} else if (bytes4(v) == IAddressResolver.addr.selector) {
			ok = true;
			assembly {
				coinType := mload(add(v, 68))
			}
		}
	}
	function parseText(bytes memory v) internal pure returns (bool ok, string memory key) {
		if (bytes4(v) == ITextResolver.text.selector) {
			ok = true;
			assembly {
				key := add(add(v, 36), mload(add(v, 68)))
			}
		}
	}
	function parse(bytes memory v) internal pure returns (bytes32) {
		(bool ok, uint256 coinType) = parseAddr(v);
		if (ok) return addr(coinType);
		string memory key;
		(ok, key) = parseText(v);
		if (ok) return text(key);
		if (v.length == 36) return mono(bytes4(v));
		revert UnsupportedProfile(bytes4(v));
	}
}
