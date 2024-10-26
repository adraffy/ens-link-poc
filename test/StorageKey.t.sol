// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { StorageKey, ITextResolver, IAddressResolver, IContentHashResolver } from "../contracts/StorageKey.sol";
import { Test } from "forge-std/Test.sol";

contract Test_StorageKey is Test {
	function testFuzz_parse_text(string memory key) external pure {
		assertEq(
			StorageKey.text(key),
			StorageKey.parse(
				abi.encodeCall(ITextResolver.text, (bytes32(0), key))
			)
		);
	}
	function testFuzz_parse_addr(uint256 x) external pure {
		assertEq(
			StorageKey.addr(x),
			StorageKey.parse(
				abi.encodeCall(IAddressResolver.addr, (bytes32(0), x))
			)
		);
	}
	function test_parse_contenthash() external pure {
		assertEq(
			StorageKey.CHASH,
			StorageKey.parse(
				abi.encodeCall(IContentHashResolver.contenthash, (bytes32(0)))
			)
		);
	}
}
