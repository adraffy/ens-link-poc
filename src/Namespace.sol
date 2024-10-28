// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./INamespace.sol";

contract Namespace is INamespace {
	struct Record {
		uint256 since;
		bytes32 hash;
		bytes value;
	}

	uint256 _count;
	mapping(uint256 ns => address) _owners;
	mapping(uint256 ns => mapping(bytes32 path => mapping(bytes32 key => Record))) _records;

	function count() external view returns (uint256) {
		return _count;
	}

	function create(address owner) external returns (uint256 ns) {
		if (owner == address(0)) revert InvalidOwner();
		ns = ++_count;
		_owners[ns] = owner;
		emit NamespaceTransfer(ns, address(0), owner);
	}

	function transfer(uint256 ns, address owner) external {
		if (owner == address(0)) revert InvalidOwner();
		address prior = _owners[ns];
		if (prior == owner) revert InvalidOwner();
		if (prior != msg.sender) revert NotAuthorized();
		_owners[ns] = owner;
		emit NamespaceTransfer(ns, prior, owner);
	}

	function _createRecord(
		bytes memory v
	) internal view returns (Record memory) {
		return
			Record(
				v.length == 0 ? 0 : block.timestamp,
				v.length == 0 ? bytes32(0) : keccak256(v),
				v
			);
	}

	function setRecord(
		uint256 ns,
		bytes32 path,
		bytes32 key,
		bytes memory value
	) external {
		if (msg.sender != _owners[ns]) revert NotAuthorized();
		_records[ns][path][key] = _createRecord(value);
		emit NamespaceRecordChanged(ns, path, key, value);
	}
	function setRecords(uint256 ns, RecordList[] calldata lists) external {
		if (msg.sender != _owners[ns]) revert NotAuthorized();
		for (uint256 i; i < lists.length; i += 1) {
			RecordList calldata list = lists[i];
			mapping(bytes32 => Record) storage map = _records[ns][list.path];
			for (uint256 j; j < list.records.length; j += 1) {
				RecordEntry memory record = list.records[j];
				map[record.key] = _createRecord(record.value);
				emit NamespaceRecordChanged(
					ns,
					list.path,
					record.key,
					record.value
				);
			}
		}
	}

	function getRecord(
		uint256 ns,
		bytes32 path,
		bytes32 key
	) external view returns (bytes memory) {
		return _records[ns][path][key].value;
	}
	function getRecords(
		uint256 ns,
		bytes32 path,
		bytes32[] memory keys
	) external view returns (bytes[] memory m) {
		m = new bytes[](keys.length);
		mapping(bytes32 => Record) storage map = _records[ns][path];
		for (uint256 i; i < keys.length; i++) {
			m[i] = map[keys[i]].value;
		}
	}
}
