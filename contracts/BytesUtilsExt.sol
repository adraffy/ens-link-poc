// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

library BytesUtilsExt {
	function prevOffset(
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
}
