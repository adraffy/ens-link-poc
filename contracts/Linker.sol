// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {IERC165} from "@openzeppelin/contracts/utils/introspection/IERC165.sol";
import {IERC721} from "@openzeppelin/contracts/token/ERC721/IERC721.sol";
import {IERC1155} from "@openzeppelin/contracts/token/ERC1155/IERC1155.sol";
import {BytesUtils} from "@ensdomains/ens-contracts/contracts/utils/BytesUtils.sol";

contract Linker {

	error NotAuthorized();

	struct Record { bytes value; uint96 blockNumber; }

	event NamespaceCreated(address indexed owner, uint256 indexed ns);
	event NamespaceLinked(uint256 indexed ns, address indexed mediator, uint256 indexed id);
	event LinkChanged(address indexed controller, bytes32 indexed baseNode, address indexed mediator);
	event RecordChanged(uint256 indexed ns, bytes32 indexed fragNode, bytes32 indexed key, bytes value);
	
	uint256 _nsCount;
	mapping (uint256 ns => address) _nsOwners;
	mapping (address controller => mapping(bytes32 baseNode => address)) _mediators;
	mapping (address mediator => mapping(uint256 id => uint256 ns)) _links;
	mapping (uint256 ns => mapping(bytes32 fragNode => mapping(bytes32 key => Record))) _records;

	function namespaceCount() external view returns (uint256) {
		return _nsCount;
	}
	function createNamespace(address owner) external {
		uint256 ns = ++_nsCount;
		_nsOwners[ns] = owner;
		emit NamespaceCreated(owner, ns);
	}

	function deleteLink(bytes32 baseNode) external {
		_setLink(msg.sender, baseNode, address(0));
	}
	function createLink(bytes32 baseNode, address mediator) external {
		_setLink(msg.sender, baseNode, mediator);
	}
	function _setLink(address controller, bytes32 baseNode, address mediator) internal {
		_mediators[controller][baseNode] = mediator;
		emit LinkChanged(controller, baseNode, mediator);
	}

	function setNamespace(address mediator, uint256 id, uint256 ns) external {
		uint256 size;
		assembly { size := extcodesize(mediator) }
		if (size == 0) {
			if (mediator != msg.sender) revert NotAuthorized();
		} else if (IERC165(mediator).supportsInterface{gas: 30000}(type(IERC721).interfaceId)) {
			if (msg.sender != IERC721(mediator).ownerOf(id)) revert NotAuthorized();
		} else if (IERC165(mediator).supportsInterface{gas: 30000}(type(IERC1155).interfaceId)) {
			if (IERC1155(mediator).balanceOf(msg.sender, id) != 0) revert NotAuthorized();
		} else {
			// TODO add interface for contract-controlled stuff
			revert NotAuthorized();
		}
		_links[mediator][id] = ns;
		emit NamespaceLinked(ns, mediator, id);
	}

	struct RecordList {
		bytes32 fragNode;
		RecordEntry[] records;
	}
	struct RecordEntry {
		bytes32 key;
		bytes value;
	}

	function setRecords(uint256 ns, RecordList[] calldata lists) external {
		require(msg.sender == _nsOwners[ns], "not owner");
		for (uint256 i; i < lists.length; i += 1) {
			RecordList calldata list = lists[i];
			mapping (bytes32 => Record) storage map = _records[ns][list.fragNode];
			for (uint256 j; j < list.records.length; j += 1) {
				RecordEntry memory record = list.records[j];
				map[record.key] = Record(record.value, uint96(block.number));
				emit RecordChanged(ns, list.fragNode, record.key, record.value);
			}
		}
	}

}