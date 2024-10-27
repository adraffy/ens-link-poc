import { Foundry } from "@adraffy/blocksmith";
import * as StorageKey from "./storage-key.js";
import { namehash } from "./utils.js";
import { deploySelfVerifier } from "./deploy-self.js";
import { deployENS } from "./deploy-ens.js";

const foundry = await Foundry.launch({ infoLog: false });

const NFTOwner = await foundry.ensureWallet("NFTOwner");
const NFTDeployer = await foundry.ensureWallet("NFTDeployer");

const ENS = await deployENS(foundry);
const Namespace = await foundry.deploy({ file: "Namespace" });
const { ccip, SelfVerifier } = await deploySelfVerifier(foundry);
const LinkedResolver = await foundry.deploy({
  file: "LinkedResolver",
  args: [ENS, SelfVerifier, Namespace],
});

const [{ ns: nsRaffy }] = foundry.getEventResults(
  await foundry.confirm(Namespace.create(NFTOwner)),
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
  ])
);

const Rental = await foundry.deploy({
  file: "Rental",
  from: NFTDeployer,
  args: [Namespace],
  abis: [Namespace],
});
await ENS.$set("rental.eth", NFTDeployer, LinkedResolver);
await foundry.confirm(
  LinkedResolver.connect(NFTDeployer).setLink(namehash("rental.eth"), Rental)
);

const [{ tokenId: tokenRaffy }] = foundry.getEventResults(
  await foundry.confirm(Rental.connect(NFTOwner).mint("raffy", 5)),
  "Transfer"
);
await foundry.confirm(
  Rental.connect(NFTOwner).setNamespace(tokenRaffy, nsRaffy)
);

await foundry.nextBlock();
console.log(await Rental.available("raffy"));
console.log(await resolve("raffy.rental.eth"));

await foundry.nextBlock({ blocks: 5 });
console.log(await Rental.available("raffy"));
console.log(await resolve("raffy.rental.eth"));

await foundry.confirm(Rental.connect(NFTOwner).mint("raffy", 10000));
await foundry.nextBlock();
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
