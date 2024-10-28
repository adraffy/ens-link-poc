import { Foundry } from "@adraffy/blocksmith";
import {
  EthProver,
  fetchBlock,
  GatewayProgram,
  GatewayRequest,
} from "@unruggable/gateways";
import { hexlify } from "ethers";

const foundry = await Foundry.launch({ infoLog: false });

const Namespace = await foundry.deploy({ file: "Namespace" });
const Rental = await foundry.deploy({
  file: "Rental",
  args: [Namespace],
});

const label = "raffy";
const sec = 60;
const [{ ns }] = foundry.getEventResults(
  await foundry.confirm(Rental.mint(label, 0, sec)),
  "NamespaceTransfer"
);

const program = new GatewayProgram()
  .keccak()
  .dup()
  .setSlot(6)
  .follow()
  .read()
  .pushStack(0)
  .gte()
  .assertNonzero(1)
  .offset(1)
  .read();

console.log({ program: hexlify(program.encode()) });

const block = await fetchBlock(foundry.provider, "latest");
console.log(await exec(parseInt(block.timestamp)));
console.log(await exec(parseInt(block.timestamp) + sec));
console.log(await exec(parseInt(block.timestamp) + sec + 1));

await foundry.shutdown();

async function exec(t: number) {
  const req = new GatewayRequest(1);
  req.setTarget(Rental.target);
  req.push(t); // input 0 = block.timestamp (sec)
  req.pushStr(label); // input 1 = label (string)
  req.pushProgram(program); // gateway program
  req.eval();
  req.setOutput(0);
  const prover = await EthProver.latest(foundry.provider);
  const state = await prover.evalRequest(req);
  const [ns] = await state.resolveOutputs();
  return ns == '0x' ? undefined : BigInt(ns);
}
