// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { ERC721 } from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import { LinkedNFT } from "../contracts/LinkedNFT.sol";
import { INamespace } from "../contracts/INamespace.sol";
import { StorageKey } from "../contracts/StorageKey.sol";

contract TeamNick is ERC721, LinkedNFT {
	event NamespaceChanged(uint256 indexed token, uint256 indexed ns);

	INamespace immutable _namespace;
	mapping(uint256 token => uint256) _ns; // slot #6
	constructor(INamespace namespace) ERC721("TeamNick", "NICK") {
		_namespace = namespace;
		_setBasenameNamespace(namespace.create(msg.sender));
		_setNamespaceProgram(hex"5a010646483c");
	}

	function mint(string memory label) external {
		uint256 token = uint256(keccak256(bytes(label)));
		_safeMint(msg.sender, token);
		uint256 ns = _namespace.create(address(this));
		_namespace.setRecord(
			ns,
			bytes32(0),
			StorageKey.addr(60),
			abi.encodePacked(msg.sender)
		);
		_namespace.transfer(ns, msg.sender);
		_ns[token] = ns;
		emit NamespaceChanged(token, ns);
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
		_ns[token] = ns;
		emit NamespaceChanged(token, ns);
	}

	function getNamespace(uint256 token) external view returns (uint256) {
		return _ns[token];
	}
}
