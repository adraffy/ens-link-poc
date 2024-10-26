// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

interface ILastModifiedResolver {
	function lastModified(
		bytes memory data
	) external view returns (uint256);
}
