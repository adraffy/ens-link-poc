// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

error NotAuthorized();
error InvalidOwner();

event NamespaceTransfer(
	uint256 indexed ns,
	address indexed oldOwner,
	address indexed newOwner
);
event NamespaceRecordChanged(
	uint256 indexed ns,
	bytes32 indexed path,
	bytes32 indexed key,
	bytes value
);

struct RecordList {
	bytes32 path;
	RecordEntry[] records;
}
struct RecordEntry {
	bytes32 key;
	bytes value;
}

interface INamespace {
	function create(address owner) external returns (uint256 ns);
	function transfer(uint256 ns, address owner) external;
	function setRecord(
		uint256 ns,
		bytes32 path,
		bytes32 key,
		bytes memory value
	) external;
	function setRecords(uint256 ns, RecordList[] calldata lists) external;
	function getRecord(
		uint256 ns,
		bytes32 path,
		bytes32 key
	) external view returns (bytes memory);
	function getRecords(
		uint256 ns,
		bytes32 path,
		bytes32[] memory keys
	) external view returns (bytes[] memory m);
}
