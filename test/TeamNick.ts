import { Foundry } from "@adraffy/blocksmith";
import * as StorageKey from "./storage-key.js";
import { namehash, extractEvent } from "./utils.js";
import { deploySelfVerifier } from "./deploy-self.js";
import { deployENS } from "./deploy-ens.js";
import { dnsEncode, Interface, ZeroHash } from "ethers";

const foundry = await Foundry.launch({
  infoLog: false,
});

const ABI = new Interface([
  `function resolve(bytes, bytes) view returns (bytes)`,
  `function addr(bytes32, uint256) view returns (bytes)`,
  `function lastModified(bytes) view returns (uint256)`,
]);

const NFTOwner = await foundry.ensureWallet("NFTOwner");
const NFTDeployer = await foundry.ensureWallet("NFTDeployer");

const ENS = await deployENS(foundry);
const Namespace = await foundry.deploy({ file: "Namespace" });
const { ccip, SelfVerifier } = await deploySelfVerifier(foundry);
const LinkedNFTResolver = await foundry.deploy({
  file: "LinkedNFTResolver",
  args: [ENS, SelfVerifier, Namespace],
});

const TeamNick = await foundry.deploy({
  file: "TeamNick",
  from: NFTDeployer,
  args: [Namespace],
  abis: [Namespace],
});
const nsBasename = BigInt(TeamNick.__receipt.logs[0].topics[1]);
// const { ns: nsBasename } = extractEvent(
//   TeamNick.__receipt,
//   "NamespaceTransfer"
// );
await foundry.confirm(
  Namespace.connect(NFTDeployer).setRecords(nsBasename, [
    [
      namehash(""),
      [
        StorageKey.addrValue(60, TeamNick.target),
        StorageKey.textValue("description", "CHONK"),
      ],
    ],
  ])
);

const { ns: nsRaffy } = extractEvent(
  await foundry.confirm(TeamNick.connect(NFTOwner).mint("raffy")),
  "NamespaceTransfer"
);
await foundry.confirm(
  Namespace.connect(NFTOwner).setRecords(nsRaffy, [
    [
      namehash(""),
      [
        StorageKey.addrValue(60, NFTOwner.address),
        StorageKey.textValue("description", "raffy!"),
      ],
    ],
    [
      namehash("a.b.c"),
      [
        StorageKey.addrValue(60, "0x51050ec063d393217B436747617aD1C2285Aeeee"),
        StorageKey.textValue("description", "my sub!"),
      ],
    ],
  ])
);

// create link
await ENS.$set("teamnick.eth", NFTDeployer, LinkedNFTResolver);
await foundry.confirm(
  LinkedNFTResolver.connect(NFTDeployer).setLink(
    namehash("teamnick.eth"),
    TeamNick
  )
);

console.log(await resolve("teamnick.eth"));
console.log(await resolve("raffy.teamnick.eth"));
console.log(await resolve("a.b.c.raffy.teamnick.eth"));

await ccip.shutdown();
await foundry.shutdown();

async function resolve(name: string) {
  const resolver = await foundry.provider.getResolver(name);
  if (!resolver) throw new Error("bug");
  const address = await resolver.getAddress();
  const address_t = await lastModified(
    ABI.encodeFunctionData("addr", [ZeroHash, 60])
  );
  const description = await resolver.getText("description");
  return { name, address, address_t, description };

  async function lastModified(calldata: string) {
    const res = ABI.decodeFunctionResult(
      "lastModified",
      await LinkedNFTResolver.resolve(
        dnsEncode(name, 255),
        ABI.encodeFunctionData("lastModified", [calldata]),
        { enableCcipRead: true }
      )
    );
	return new Date(Number(res[0] * 1000n));
  }
}
