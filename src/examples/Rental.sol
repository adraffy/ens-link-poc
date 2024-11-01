// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { LinkConfig } from "../LinkConfig.sol";
import { INamespace } from "../INamespace.sol";
import { StorageKey } from "../StorageKey.sol";

contract Rental is ERC721, LinkConfig {
	event NamespaceChanged(uint256 indexed token, uint256 indexed ns);

	struct TokenData {
		uint256 exp;
		uint256 ns;
	}

	INamespace immutable _namespace;

	mapping(uint256 token => TokenData) _datas; // #6

	constructor(INamespace namespace) ERC721("Rental", "RENT") {
		_namespace = namespace;
		_setBasenameNamespace(namespace.create(msg.sender));
		_setNamespaceProgram(hex"5a010646483c7b7836010101473c");
	}

	modifier onlyTokenOperator(uint256 token) {
		address owner = _ownerOf(token);
		if (owner != msg.sender && !isApprovedForAll(owner, msg.sender)) {
			revert ERC721InsufficientApproval(msg.sender, token);
		}
		_;
	}

	function _isExpired(uint256 token) internal view returns (bool) {
		return _datas[token].exp < block.timestamp;
	}

	function _ownerOf(
		uint256 tokenId
	) internal view override(ERC721) returns (address owner) {
		owner = _isExpired(tokenId) ? address(0) : super._ownerOf(tokenId);
	}

	function _tokenFromLabel(
		string memory label
	) internal pure returns (uint256) {
		return uint256(keccak256(bytes(label)));
	}

	function mint(string memory label, uint256 ns, uint256 sec) external {
		uint256 token = _tokenFromLabel(label);
		require(_isExpired(token), "unavailable");
		_datas[token].exp = block.timestamp + sec;
		if (super._ownerOf(token) != address(0)) {
			_burn(token);
		}
		_safeMint(msg.sender, token);
		if (ns == 0) {
			ns = _namespace.create(address(this));
			_namespace.setRecord(
				ns,
				bytes32(0),
				StorageKey.addr(0x80000000),
				abi.encodePacked(msg.sender)
			);
			_namespace.transfer(ns, msg.sender);
		}
		_datas[token].ns = ns;
	}

	function available(string memory label) external view returns (bool) {
		return !_isExpired(_tokenFromLabel(label));
	}

	function expires(uint256 token) external view returns (uint256) {
		return _isExpired(token) ? 0 : _datas[token].exp;
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
