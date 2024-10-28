// SPDX-License-Identifier: MIT
pragma solidity ^0.8.0;

import { GatewayFetcher, GatewayRequest } from "@unruggable/gateways/contracts/GatewayFetcher.sol";
import { Script, console } from "forge-std/Script.sol";

contract Script_LabelhashProgram is Script {
	using GatewayFetcher for GatewayRequest;
	function run() external pure {
		console.log("[labelhash(#0)]");
		console.logBytes(
			GatewayFetcher
				.newCommand()
				.keccak()
				.setSlot(6)
				.follow()
				.read()
				.debug("chonk")
				.encode()
		);

		console.log();
		console.log("[labelhash(#0) && map[token].expired >= #1]");
		console.logBytes(
			GatewayFetcher
				.newCommand()
				.keccak()
				.dup()
				.setSlot(6)
				.follow()
				.read()
				.pushStack(0)
				.gte()
				.assertNonzero(1)
				.offset(1)
				.read()
				.encode()
		);
	}
}
