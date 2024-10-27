import type { Foundry } from "@adraffy/blocksmith";
import { serve } from "@resolverworks/ezccip/serve";
import { EthSelfRollup, Gateway } from "@unruggable/gateways";

function getArtifactPath(name: string) {
  return `node_modules/@unruggable/gateways/artifacts/${name}.sol/${name}.json`;
}

export async function deploySelfVerifier(foundry: Foundry, log = false) {
  const gateway = new Gateway(new EthSelfRollup(foundry.provider));
  gateway.latestCache.cacheMs = 0;
  gateway.rollup.latestBlockTag = "latest";
  const ccip = await serve(gateway, { protocol: "raw", log });
  const GatewayVM = await foundry.deploy({
    file: getArtifactPath("GatewayVM"),
  });
  const EthVerifierHooks = await foundry.deploy({
    file: getArtifactPath("EthVerifierHooks"),
  });
  const SelfVerifier = await foundry.deploy({
    file: getArtifactPath("SelfVerifier"),
    args: [[ccip.endpoint], 1000, EthVerifierHooks],
    libs: { GatewayVM },
  });
  return { gateway, ccip, GatewayVM, EthVerifierHooks, SelfVerifier };
}
