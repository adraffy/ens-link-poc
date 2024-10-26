import {
  solidityPackedKeccak256,
  toUtf8Bytes,
  type BigNumberish,
  type BytesLike,
} from "ethers";

export function addr(coinType: BigNumberish) {
  return solidityPackedKeccak256(["uint256", "uint256"], [coinType, 0]);
}
export function text(key: string) {
  return solidityPackedKeccak256(["string", "uint256"], [key, 1]);
}
export function mono(selector: string) {
  return solidityPackedKeccak256(["bytes4", "uint256"], [selector, 2]);
}

export const CHASH_KEY = mono("0xbc1c58d1");
export const PUBKEY_KEY = mono("0xc8690233");

export function addrValue(coinType: BigNumberish, value: BytesLike) {
  return [addr(coinType), value] as const;
}
export function textValue(key: string, value: string) {
  return [text(key), toUtf8Bytes(value)] as const;
}
