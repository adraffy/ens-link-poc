// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

library Format {

	function getWidth(uint256 value, uint256 base) internal pure returns (uint256) {
		uint256 width = 1;
		while (value >= base) {
			value /= base;
			width += 1;
		}
		return width;
	}

	function toString(uint256 value, uint256 base) internal pure returns (string memory) {
		uint256 width = getWidth(value, base);
		bytes memory v = new bytes(width);
		uint256 ptr;
		assembly { ptr := add(v, 32) }
		write(ptr, value, width, base);
		return string(v);
	}

	function write(uint256 ptr, uint256 value, uint256 width, uint256 base) private pure {
		uint256 i = ptr + width;
		while (i > ptr) {
			i -= 1;
			uint256 x = value % base;
			value /= base;
			x = x < 10 ? 48 + x : 87 + x;
			assembly { mstore8(i, x) }
		}
	}

}
