// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import {
	AbstractLinkResolver, 
	ENS,
	BytesUtils,
	IEVMVerifier,
	EVMFetcher,
	EVMRequest,
	IAddrResolver,
	IAddressResolver,
	ITextResolver,
	IContentHashResolver
} from "./AbstractLinkResolver.sol";

contract LabelhashLinkResolver is AbstractLinkResolver {

	using EVMFetcher for EVMRequest;
	using BytesUtils for bytes;

	constructor(ENS ens, IEVMVerifier verifier, address linker) AbstractLinkResolver(ens, verifier, linker) {}
	
	function resolve(bytes memory dnsname, bytes calldata data) external view returns (bytes memory) {
		
		// translate calldata into universal key
		// revert if unsupported
		bytes32 key = _determineKey(data);

		// parse [fragment].[basename]
		(bytes32 baseNode, uint256 baseOffset) = _findSelf(dnsname);

		if (baseOffset == 0) {
			// TODO: basename
		}

		uint256 fragOffset = _most(dnsname, baseOffset);
		(bytes32 labelHash, ) = dnsname.readLabel(fragOffset);
		bytes32 fragNode = _take(dnsname, fragOffset).namehash(0);

		// determine basename controller
		address controller = _ens.owner(baseNode);

		EVMRequest memory req = EVMFetcher.newRequest(3);
		req.setTarget(_linker);
		
		// read mediator
		req.setSlot(SLOT_MEDIATORS)
			.push(controller).follow()
			.push(baseNode).follow()
			.read().setOutput(0);

		// read namespace
		req.setSlot(SLOT_LINKS)
			.pushOutput(0).follow()
			.push(labelHash).follow()
			.read().setOutput(1);
		
		// read record
		req.setSlot(SLOT_RECORDS)
			.pushOutput(1).follow()
			.push(fragNode).follow()
			.push(key).follow()
			.readBytes().setOutput(2);

		fetch(_verifier, req, this.resolveCallback.selector, data);
	}

	function resolveCallback(bytes[] memory values, uint8, bytes calldata carry) external pure returns (bytes memory) {
			bytes4 selector = bytes4(carry);
			if (selector == IAddrResolver.addr.selector) {
				return abi.encode(bytes20(values[2]));
			} else if (selector == IAddressResolver.addr.selector) {
				return values[2];
			} else if (selector == ITextResolver.text.selector) {
				return values[2];
			} else if (selector == IContentHashResolver.contenthash.selector) {
				return values[2];
			} else {
				revert UnsupportedProfile(selector);
			}
		}


}