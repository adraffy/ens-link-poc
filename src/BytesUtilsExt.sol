// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { BytesUtils } from "@ensdomains/ens-contracts/contracts/utils/BytesUtils.sol";

library BytesUtilsExt {
	using BytesUtils for bytes;

	// prevOffset(1a2bb3ccc, 5) = 2
	function prevOffset(
		bytes memory dnsname,
		uint256 end
	) internal pure returns (uint256 offset) {
		unchecked {
			while (true) {
				uint8 size = uint8(dnsname[offset]);
				uint256 next = offset + 1 + size;
				if (next == end) break;
				if (next > end) revert("invalid offset");
				offset = next;
			}
		}
	}


	// take("5raffy3eth0", 6) = "5raffy0"
	function take(
		bytes memory dnsname,
		uint256 offset
	) internal pure returns (bytes memory ret) {
		ret = dnsname.substring(0, offset + 1);
		ret[offset] = bytes1(0);
	}
}
