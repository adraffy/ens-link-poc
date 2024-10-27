import { ZeroHash, namehash as namehash0 } from "ethers";

export function namehash(name: string) {
  return name ? namehash0(name) : ZeroHash;
}
