//import type { Foundry, WalletLike } from "@adraffy/blocksmith";
import {
  ZeroHash,
  EventLog,
  namehash as namehash0,
  type TransactionReceipt,
} from "ethers";

export function namehash(name: string) {
  return name ? namehash0(name) : ZeroHash;
}

// export function deploy_erc_721(
//   foundry: Foundry,
//   {
//     name = "Chonk",
//     from,
//   }: {
//     name?: string;
//     from?: WalletLike;
//   } = {}
// ) {
//   const symbol = name.replaceAll(/[^a-z0-9]/gi, "").toUpperCase();
//   return foundry.deploy({
//     sol: `
//       import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
//       contract NFT is ERC721 {
//         constructor() ERC721("${name}", "${symbol}") {}
//         function mint(string memory label) external {
//           _safeMint(msg.sender, uint256(keccak256(bytes(label))));
//         }
//       }
//     `,
//     from,
//   });
// }

export function extractEvent(receipt: TransactionReceipt, event: string) {
  for (const x of receipt.logs) {
    if (x instanceof EventLog) {
      if (x.eventName === event) {
        return x.args;
      }
    }
  }
  throw new Error(`unknown event: ${event}`);
}
