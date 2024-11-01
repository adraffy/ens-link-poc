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
const sec = 25;
const [{ ns }] = foundry.getEventResults(
  await foundry.confirm(Rental.mint(label, 0, sec)),
  "NamespaceTransfer"
);

const program = new GatewayProgram()
  .keccak() // token = labelhash(label)
  .setSlot(6).follow().read() // _datas[token].exp
  .lte() // block.timestamp < .exp
  .assertNonzero(1) // if expired, exit(1)
  .offset(1).read(); // .ns, return this value

console.log({ program: hexlify(program.encode()) });

const block = await fetchBlock(foundry.provider, "latest");
console.log("ns =", ns);
console.log(" t ns");
for (const t of [0, sec, sec + 1]) {
  console.log(
    t.toString().padStart(2, " "),
    await exec(parseInt(block.timestamp) + t)
  );
}

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
  return ns == "0x" ? undefined : BigInt(ns);
}
