import { Foundry } from "@adraffy/blocksmith";
import * as StorageKey from "./storage-key.js";
import { namehash } from "./utils.js";
import { deploySelfVerifier } from "./deploy-self.js";
import { deployENS } from "./deploy-ens.js";

const foundry = await Foundry.launch({ infoLog: false });

const walletRaffy = await foundry.ensureWallet("raffy");
const walletDeployer = await foundry.ensureWallet("deployer");

const ENS = await deployENS(foundry);
const Namespace = await foundry.deploy({ file: "Namespace" });
const { ccip, SelfVerifier } = await deploySelfVerifier(foundry);
const LinkedResolver = await foundry.deploy({
  file: "LinkedResolver",
  args: [ENS, SelfVerifier, Namespace],
});

const Rental = await foundry.deploy({
  file: "Rental",
  from: walletDeployer,
  args: [Namespace],
  abis: [Namespace],
});
await ENS.$register("rental.eth", walletDeployer, LinkedResolver);
await foundry.confirm(
  LinkedResolver.connect(walletDeployer).setLink(
    namehash("rental.eth"),
    Rental.target
  )
);

// rent for 1 second
// name comes with a namespace
const receipt = await foundry.confirm(
  Rental.connect(walletRaffy).mint("raffy", 0, 1)
);
//const [{ tokenId: tokenRaffy }] = foundry.getEventResults(receipt, "Transfer");
const [{ ns: nsRaffy }] = foundry.getEventResults(receipt, "NamespaceTransfer");

// set some records on the namespace
await foundry.confirm(
  Namespace.connect(walletRaffy).setRecords(nsRaffy, [
    [
      namehash(""),
      [
        StorageKey.addrValue(60, walletRaffy.address),
        StorageKey.textValue("description", "raffy!"),
      ],
    ],
  ])
);

// confirm we own it
await foundry.nextBlock();
console.log(await Rental.available("raffy"));
console.log(await resolve("raffy.rental.eth"));

// wait for expiration
await foundry.nextBlock({ blocks: 5 });

// confirm it expired
console.log(await Rental.available("raffy"));
console.log(await resolve("raffy.rental.eth"));

// rerent, reuse namespace
await foundry.confirm(Rental.connect(walletRaffy).mint("raffy", nsRaffy, 10000));
await foundry.nextBlock();

// confirm restored
console.log(await Rental.available("raffy"));
console.log(await resolve("raffy.rental.eth"));

await ccip.shutdown();
await foundry.shutdown();

async function resolve(name: string) {
  const resolver = await foundry.provider.getResolver(name);
  if (!resolver) throw new Error("bug");
  const address = await resolver.getAddress();
  const description = await resolver.getText("description");
  return { name, address, description };
}
