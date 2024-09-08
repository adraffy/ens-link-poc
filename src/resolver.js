import {Foundry} from '@adraffy/blocksmith';
import {EthProver, EVMRequest, ABI_CODER, ProgramReader} from '@unruggable/evmgateway';
import {ethers, ZeroHash} from 'ethers';
import {namehash} from './utils.js';

const foundry = await Foundry.launch();

const linker = await foundry.deploy({file: 'Linker'});

async function createNamespace(owner) {
	const receipt = await foundry.confirm(linker.createNamespace(owner));
	return receipt.logs[0].args[1];
}
function textEntry(key, value) {
	return [ethers.id(key), ethers.toUtf8Bytes(value)];
}
function addrEntry(coinType, value) {
	return [ethers.toBeHex(coinType, 32), value];
}

const ens = await foundry.deploy({sol: `
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
`});

const verifier = await foundry.deploy({sol: `
	//import "@unruggable/evmgateway/contracts/IEVMVerifier.sol";
	contract NullVerifier { //is IEVMVerifier {
		function gatewayURLs() external pure returns (string[] memory) {
			return new string[](0);
		}
		function getLatestContext() external pure returns (bytes memory) {
			return '';
		}
	}
`});

const resolver = await foundry.deploy({
	file: 'OwnedLinkResolver',
	args: [ens, verifier, linker]
});

let controller = foundry.wallets.admin.address;
await foundry.confirm(ens.set(namehash('raffy.eth'), controller, resolver));
let ns_raffy = await createNamespace(controller);
await foundry.confirm(linker.setNamespace(controller, namehash('raffy.eth'), ns_raffy));
await foundry.confirm(linker.setRecords(
	ns_raffy, 
	[
		[namehash('sub'), [
			textEntry('avatar', 'https://raffy.antistupid.com/ens.jpg'),
			addrEntry(60, '0x51050ec063d393217B436747617aD1C2285Aeeee'),
		]],
		[namehash('a.b.c'), [
			textEntry('description', 'ABC')
		]]
	]
));

const prover = await EthProver.latest(foundry.provider);

const RESOLVER_IFACE = new ethers.Interface([
	`function addr(bytes32, uint256 coinType) view returns (bytes)`,
	`function text(bytes32, string key) view returns (string)`,
]);

async function resolve(name, call, ...args) {
	let revert;
	try {
		await resolver.resolve(ethers.dnsEncode(name), RESOLVER_IFACE.encodeFunctionData(call, [ethers.ZeroHash, ...args]));
		throw 1;
	} catch (cause) {
		revert = cause.revert;
		if (!revert || !revert.name === 'OffchainLookup') {
			throw new Error('expected OffchainLookup', {cause});
		}
	}
	//console.log(revert.args);

	let [_context, [ops, inputs]] = ABI_CODER.decode(['bytes', 'tuple(bytes, bytes[])'], ethers.dataSlice(revert.args[2], 4));
	let [[_target, __context, __req, selector, carry]] = ABI_CODER.decode(['tuple(address, bytes, tuple(bytes, bytes[]), bytes4, bytes)'], revert.args[4]);

	//console.log(new ProgramReader(ethers.getBytes(ops), inputs).readActions());

	let state = await prover.evalDecoded(ops, inputs);
	let outputs = await state.resolveOutputs();

	let answer = ethers.concat([selector, ABI_CODER.encode(
		['bytes[]', 'uint8', 'bytes'], 
		[outputs, state.exitCode, carry]
	)]);
	//console.log({answer});

	let response = await foundry.provider.call({
		to: revert.args[0],
		data: answer,
	});
	//console.log({response});

	let [value] = RESOLVER_IFACE.decodeFunctionResult(call, response);

	console.log({name, call, args, value});
}

await resolve('sub.raffy.eth', 'addr', 60);
await resolve('sub.raffy.eth', 'text', 'avatar');
await resolve('a.b.c.raffy.eth', 'text', 'description');

await foundry.shutdown();