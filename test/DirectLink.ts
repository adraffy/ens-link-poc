import { Foundry } from "@adraffy/blocksmith";
import * as StorageKey from "./storage-key.js";
import { namehash } from "./utils.js";
import { deploySelfVerifier } from "./deploy-self.js";
import { deployENS } from "./deploy-ens.js";
import { toPaddedHex } from "@unruggable/gateways";

const foundry = await Foundry.launch({ infoLog: false });

const ENS = await deployENS(foundry);
const Namespace = await foundry.deploy({ file: "Namespace" });
const { ccip, SelfVerifier } = await deploySelfVerifier(foundry);
const LinkedResolver = await foundry.deploy({
  file: "LinkedResolver",
  args: [ENS, SelfVerifier, Namespace],
});

// create namespace
const walletRaffy = await foundry.ensureWallet("raffy");
const [{ ns: nsRaffy }] = foundry.getEventResults(
  await foundry.confirm(Namespace.create(walletRaffy)),
  "NamespaceTransfer"
);

// setup records
await foundry.confirm(
  Namespace.connect(walletRaffy).setRecords(nsRaffy, [
    [
      namehash(""),
      [
        StorageKey.addrValue(60, "0xC973b97c1F8f9E3b150E2C12d4856A24b3d563cb"),
        StorageKey.addrValue(
          0x8000_0000, // fallback address
          "0x51050ec063d393217B436747617aD1C2285Aeeee"
        ),
      ],
    ],
    [
      namehash("sub"),
      [
        StorageKey.addrValue(
          0x8000_0000,
          "0xEB4200f750335eFb67E726485445d302D64B1c8A"
        ),
      ],
    ],
  ])
);

// change resolver
await ENS.$register("raffy.eth", walletRaffy, LinkedResolver);
// directly link to namespace
await foundry.confirm(
  LinkedResolver.connect(walletRaffy).setLink(
    namehash("raffy.eth"),
    toPaddedHex(nsRaffy)
  )
);

await resolve("raffy.eth");
await resolve("sub.raffy.eth");

await ccip.shutdown();
await foundry.shutdown();

async function resolve(name: string) {
  const resolver = await foundry.provider.getResolver(name);
  if (!resolver) throw new Error("bug");
  const address = await resolver.getAddress();
  const address139 = await resolver.getAddress(139);
  const address8453 = await resolver.getAddress(8453);
  console.log({ name, address, address139, address8453 });
}
