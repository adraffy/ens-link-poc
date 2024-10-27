// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

contract LinkConfig {
	struct Bytes {
		bytes value;
	}
	function _setNamespaceProgram(bytes memory v) internal {
		Bytes storage p;
		assembly {
			// uint256 constant SLOT_NFT_NS_PROGRAM = uint256(keccak256("namespace.program")) - 1;
			p.slot := 0xbf3b585a3809e864ea9ae7057f6477773ba75b063ed1399c40e8d62ac301a513
		}
		p.value = v;
	}
	function _setBasenameNamespace(uint256 ns) internal {
		assembly {
			sstore(
				// uint256 constant SLOT_NFT_BASE_NS = uint256(keccak256("namespace.base")) - 1;
				0x301b08b0d4d53d3b16af3441fbd8e638e5a449ccba3453b8e0666ba16b6e12cc,
				ns
			)
		}
	}
}
