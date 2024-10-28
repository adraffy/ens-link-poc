import { Foundry } from "@adraffy/blocksmith";
import * as StorageKey from "./storage-key.js";
import { namehash } from "./utils.js";
import { deploySelfVerifier } from "./deploy-self.js";
import { deployENS } from "./deploy-ens.js";
import { dnsEncode, Interface, ZeroHash } from "ethers";

const foundry = await Foundry.launch({ infoLog: false });

const ABI = new Interface([
  `function resolve(bytes, bytes) view returns (bytes)`,
  `function addr(bytes32, uint256) view returns (bytes)`,
  `function text(bytes32, string) view returns (string)`,
  `function lastModified(bytes) view returns (uint256)`,
]);

const walletRaffy = await foundry.ensureWallet("raffy");
const walleyDeployer = await foundry.ensureWallet("deployer");

const ENS = await deployENS(foundry);
const Namespace = await foundry.deploy({ file: "Namespace" });
const { ccip, SelfVerifier } = await deploySelfVerifier(foundry);
const LinkedResolver = await foundry.deploy({
  file: "LinkedResolver",
  args: [ENS, SelfVerifier, Namespace],
});
const TeamNick = await foundry.deploy({
  file: "TeamNick",
  from: walleyDeployer,
  args: [Namespace],
});

// setup basename
const [{ ns: nsBasename }] = foundry.getEventResults(
  TeamNick,
  "NamespaceTransfer"
);
await foundry.confirm(
  Namespace.connect(walleyDeployer).setRecords(nsBasename, [
    [
      namehash(""),
      [
        StorageKey.addrValue(60, TeamNick.target),
        StorageKey.textValue("description", "CHONK"),
      ],
    ],
  ])
);

// setup namespace
const [{ ns: nsRaffy }] = foundry.getEventResults(
  await foundry.confirm(TeamNick.connect(walletRaffy).mint("raffy")),
  "NamespaceTransfer"
);
await foundry.confirm(
  Namespace.connect(walletRaffy).setRecords(nsRaffy, [
    [
      namehash(""),
      [
        StorageKey.addrValue(60, walletRaffy.address),
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
await ENS.$register("teamnick.eth", walleyDeployer, LinkedResolver);
await foundry.confirm(
  LinkedResolver.connect(walleyDeployer).setLink(
    namehash("teamnick.eth"),
    TeamNick.target
  )
);

// resolve names
await resolve("teamnick.eth");
await resolve("raffy.teamnick.eth");
await resolve("a.b.c.raffy.teamnick.eth");

// edit a record
await foundry.confirm(
  Namespace.connect(walletRaffy).setRecord(
    nsRaffy,
    namehash(""),
    ...StorageKey.textValue("description", "RAFFY!")
  )
);
await foundry.nextBlock();
await resolve("raffy.teamnick.eth");

// check nonexistent
//await resolve("_dne");
await resolve("_dne.teamnick.eth");

await ccip.shutdown();
await foundry.shutdown();

async function resolve(name: string) {
  const resolver = await foundry.provider.getResolver(name);
  if (!resolver) {
    console.log({ name, error: "no resolver" });
    return;
  }
  const address = await resolver.getAddress();
  const address_t = await lastModified(
    ABI.encodeFunctionData("addr", [ZeroHash, 60])
  );
  const description = await resolver.getText("description");
  const description_t = await lastModified(
    ABI.encodeFunctionData("text", [ZeroHash, "description"])
  );
  console.log({ name, address, address_t, description, description_t });

  async function lastModified(calldata: string) {
    const res = ABI.decodeFunctionResult(
      "lastModified",
      await LinkedResolver.resolve(
        dnsEncode(name, 255),
        ABI.encodeFunctionData("lastModified", [calldata]),
        { enableCcipRead: true }
      )
    );
    return res[0] ? new Date(Number(res[0] * 1000n)) : null;
  }
}
