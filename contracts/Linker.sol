// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {BytesUtils} from "@ensdomains/ens-contracts/contracts/utils/BytesUtils.sol";

contract Linker {

	event NamespaceCreated(address indexed owner, uint256 ns);
	event LinkChanged(address indexed controller, bytes32 indexed basenameNode, bytes basename, uint256 link);
	event RecordChanged(uint256 indexed ns, bytes32 indexed fragmentNode, bytes32 indexed key);

	uint256 _nsCount;
	mapping (uint256 ns => address owner) _nsOwners;
	mapping (address controller => mapping(bytes basename => uint256)) _links;
	mapping (address mediator => mapping(uint256 token => uint256 ns)) _nsLinks;
	mapping (uint256 ns => mapping(bytes fragment => mapping(bytes32 key => bytes value))) _records;

	function namespaceCount() external view returns (uint256) {
		return _nsCount;
	}
	function createNamespace(address owner) external {
		uint256 ns = ++_nsCount;
		_nsOwners[ns] = owner;
		emit NamespaceCreated(owner, ns);
	}

	function _setLink(address controller, bytes memory basename, uint256 link) internal {
		_links[controller][basename] = link;
		emit LinkChanged(controller, BytesUtils.namehash(basename, 0), basename, link);
	}

	function deleteLink(bytes memory basename) external {
		_setLink(msg.sender, basename, 0);
	}
	function createLink(bytes memory basename, address mediator) external {
		_setLink(msg.sender, basename, uint256(uint160(mediator)) | (1 << 255));
	}
	function setOwnedNamespace(bytes memory basename, uint256 ns) external {
		_setLink(msg.sender, basename, ns);
	}
	function setTokenNamespace(address mediator, uint256 token, uint256 ns) external {
		if (IERC165(mediator).supportsInterface{gas: 30000}(type(IERC721).interfaceId)) {
			require(msg.sender == IERC721(mediator).ownerOf(token), "owner");
		} else if (IERC165(mediator).supportsInterface{gas: 30000}(type(IERC1155).interfaceId)) {
			require(IERC721(mediator).balanceOf(msg.sender) != 0, "owner");
		} else {
			revert("unknown mediator");
		}
		_nsLinks[mediator][token] = ns;
	}

	function setRecord(uint256 ns, bytes memory fragment, bytes32 key, bytes memory value) external {
		require(msg.sender == _nsOwners[ns], "not owner");
		_records[ns][fragment][key] = value;
		emit RecordChanged(ns, BytesUtils.namehash(fragment, 0), key);
	}


}