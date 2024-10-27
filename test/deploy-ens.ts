import type { DeployedContract, Foundry, WalletLike } from "@adraffy/blocksmith";
import { EnsPlugin, namehash } from "ethers";

export async function deployENS(foundry: Foundry) {
  const ENS = await foundry.deploy(`
    contract ENS {
      struct Node {
        address owner;
        address resolver;
      }
      mapping (bytes32 node => Node) _nodes;
      function owner(bytes32 node) external view returns (address) {
        return _nodes[node].owner;
      }
      function resolver(bytes32 node) external view returns (address) {
        return _nodes[node].resolver;
      }
      function set(bytes32 node, address owner, address resolver) external {
        _nodes[node] = Node({owner: owner, resolver: resolver});
      }
    }
  `);

  // set as global in ethers
  foundry.provider.getNetwork = async () => foundry.provider._network;
  foundry.provider._network.attachPlugin(
    new EnsPlugin(ENS.target, foundry.chain)
  );

  return Object.assign(ENS, {
    async $set(name: string, owner: WalletLike, contract: DeployedContract) {
      return foundry.confirm(ENS.set(namehash(name), owner, contract));
    },
  });
}
