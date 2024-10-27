// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { LinkConfig } from "../contracts/LinkConfig.sol";
import { INamespace } from "../contracts/INamespace.sol";

contract Rental is ERC721, LinkConfig {
	event NamespaceChanged(uint256 indexed token, uint256 indexed ns);

	struct TokenData {
		uint256 exp;
		uint256 ns;
	}
	mapping(uint256 token => TokenData) _datas; // #6

	constructor() ERC721("Rental", "RENT") {
		_setNamespaceProgram(hex"5a0050010646483c00297a7836010101473c");
	}

	function _tokenFromLabel(
		string memory label
	) internal pure returns (uint256) {
		return uint256(keccak256(bytes(label)));
	}

	function mint(string memory label, uint256 sec) external {
		uint256 token = _tokenFromLabel(label);
		_safeMint(msg.sender, token);
		_datas[token].exp = block.timestamp + sec;
	}

	function available(string memory label) external view returns (bool) {
		return !_isExpired(_tokenFromLabel(label));
	}

	function _isExpired(uint256 token) internal view returns (bool) {
		return _datas[token].exp < block.timestamp;
	}

	function _ownerOf(
		uint256 tokenId
	) internal view override(ERC721) returns (address owner) {
		owner = _isExpired(tokenId) ? address(0) : super._ownerOf(tokenId);
	}

	modifier onlyTokenOperator(uint256 token) {
		address owner = _ownerOf(token);
		if (owner != msg.sender && !isApprovedForAll(owner, msg.sender)) {
			revert ERC721InsufficientApproval(msg.sender, token);
		}
		_;
	}

	function setNamespace(
		uint256 token,
		uint256 ns
	) external onlyTokenOperator(token) {
		_datas[token].ns = ns;
		emit NamespaceChanged(token, ns);
	}

	function getNamespace(uint256 token) external view returns (uint256) {
		return _datas[token].ns;
	}
}
