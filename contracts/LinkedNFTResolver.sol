// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import "./AbstractNamespaceResolver.sol";
import { GatewayFetcher, GatewayRequest } from "@unruggable/gateways/contracts/GatewayFetcher.sol";
import { StorageKey, IAddrResolver } from "./StorageKey.sol";
import { ILastModifiedResolver } from "./ILastModifiedResolver.sol";

//import "forge-std/console2.sol";

contract LinkedNFTResolver is AbstractNamespaceResolver {
	event LinkCreated(bytes32 indexed node, address indexed nft);

	uint256 constant SLOT_NFT_NS_PROGRAM =
		uint256(keccak256("namespace.program"));
	uint256 constant SLOT_NFT_BASE_NS = uint256(keccak256("namespace.base"));

	uint256 constant SLOT_NAMESPACE_RECORDS = 2;

	using GatewayFetcher for GatewayRequest;
	using BytesUtils for bytes;

	mapping(bytes32 node => address) _links;

	uint8 constant EXIT_CODE_NS_PROGRAM = 1;
	uint8 constant EXIT_CODE_MISSING_NS = 2;

	constructor(
		address ens,
		address verifier,
		address namespace
	) AbstractNamespaceResolver(ens, verifier, namespace) {}

	function resolve(
		bytes memory dnsname,
		bytes calldata data
	) external view returns (bytes memory) {
		(bytes32 baseNode, uint256 baseOffset) = _findSelf(dnsname);
		address nft = _links[baseNode];
		if (nft == address(0)) {
			return _nullResponse();
		}
		bytes32 key;
		bool lastMod;
		if (bytes4(data) == ILastModifiedResolver.lastModified.selector) {
			lastMod = true;
			key = StorageKey.parse(abi.decode(data[4:], (bytes)));
		} else {
			key = StorageKey.parse(data);
		}

		GatewayRequest memory req = GatewayFetcher.newRequest(2);
		req.setTarget(nft);
		bytes32 path;
		if (baseOffset == 0) {
			req.setSlot(SLOT_NFT_BASE_NS);
			req.read().setOutput(0);
		} else {
			uint256 fragOffset = _prevOffset(dnsname, baseOffset);
			bytes memory label = dnsname.substring(
				fragOffset + 1,
				baseOffset - fragOffset - 1
			);
			path = _pathhash(dnsname, fragOffset);

			req.push(block.timestamp);
			req.push(label);
			req.setSlot(SLOT_NFT_NS_PROGRAM).readBytes();
			req.requireNonzero(EXIT_CODE_NS_PROGRAM).eval();
			req.setOutput(0);
		}
		req.pushOutput(0).requireNonzero(EXIT_CODE_MISSING_NS);

		req.setTarget(_namespace);
		req.setSlot(SLOT_NAMESPACE_RECORDS);
		req.pushOutput(0).follow(); // records[ns]
		req.push(path).follow(); // records[ns][path]
		req.push(key).follow(); // records[ns][path][key]
		if (lastMod) {
			req.read(); // .time
		} else {
			req.offset(1).read().requireNonzero(0); // .hash
			req.offset(1).readHashedBytes(); // .value
		}
		req.setOutput(1);

		fetch(
			_verifier,
			req,
			this.resolveCallback.selector,
			data,
			new string[](0)
		);
	}

	function resolveCallback(
		bytes[] memory values,
		uint8 /*exitCode*/,
		bytes calldata carry
	) external pure returns (bytes memory) {
		bytes4 selector = bytes4(carry);
		if (bytes4(carry) == ILastModifiedResolver.lastModified.selector) {
			return abi.encode(bytes32(values[1]));
		} else if (selector == IAddrResolver.addr.selector) {
			return abi.encode(address(bytes20(values[1])));
		} else {
			return abi.encode(values[1]);
		}
	}

	function setLink(bytes32 node, address nft) external {
		if (!_canModifyNode(node, msg.sender)) revert NotAuthorized();
		_links[node] = nft;
		emit LinkCreated(node, nft);
	}

	function getLink(bytes32 node) external view returns (address) {
		return _links[node];
	}
}
