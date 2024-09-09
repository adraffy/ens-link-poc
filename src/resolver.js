import {Foundry} from '@adraffy/blocksmith';
import {EthProver, ABI_CODER} from '@unruggable/evmgateway';
import {ethers} from 'ethers';
import {namehash, deploy_erc_721, parse_ns} from './utils.js';

const foundry = await Foundry.launch();
const {admin} = foundry.wallets;

const linker = await foundry.deploy({file: 'Linker'});

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

// set as global in ethers
foundry.provider.getNetwork = async () => foundry.provider._network;
foundry.provider._network.attachPlugin(new ethers.EnsPlugin(ens.target, foundry.chain));

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

// ************************************************************

{
	const resolver = await foundry.deploy({
		file: 'OwnedLinkResolver',
		args: [ens, verifier, linker]
	});

	const basename = 'raffy.eth';

	// owner setup ens on L1
	await foundry.confirm(ens.set(namehash(basename), admin, resolver));
	// owner create namespace on L2
	const ns = parse_ns(await foundry.confirm(linker.createNamespace(admin)));
	// owner setup link on L2
	await foundry.confirm(linker.setNamespace(admin, namehash(basename), ns));
	// owner create namespace
	await foundry.confirm(linker.setRecords(
		ns, 
		[
			[namehash(''), [
				textEntry('description', 'I AM ROOT'),
			]],
			[namehash('sub'), [
				textEntry('avatar', 'https://raffy.antistupid.com/ens.jpg'),
				addrEntry(60, '0x51050ec063d393217B436747617aD1C2285Aeeee'),
			]],
			[namehash('a.b.c'), [
				textEntry('description', 'ABC')
			]]
		]
	));
}

// ************************************************************

{
	const resolver = await foundry.deploy({
		file: 'LabelhashLinkResolver',
		args: [ens, verifier, linker]
	});

	const deployer = await foundry.ensureWallet('chonk');
	const basename = 'chonk.eth';
	const sublabel = 'raffy';

	// deploy nft from deployer
	const nft = await deploy_erc_721(foundry, {from: deployer});
	// mint token to admin
	await foundry.confirm(nft.connect(admin).mint(sublabel));
	// deployer setup ens on L1
	await foundry.confirm(ens.set(namehash(basename), deployer, resolver));
	// deployer setup link on L2
	await foundry.confirm(linker.connect(deployer).createLink(namehash(basename), nft));
	// admin create namespace
	const ns = parse_ns(await foundry.confirm(linker.createNamespace(admin)));
	// admin set namespace for minted token
	await foundry.confirm(linker.setNamespace(nft, ethers.id(sublabel), ns));
	// admin set records under namespace
	await foundry.confirm(linker.setRecords(
		ns,
		[
			[namehash(''), [
				textEntry('description', 'Raffy dot Chonk')
			]],
			[namehash('a.b.c'), [
				textEntry('description', 'Chonk ABC!')
			]]
		],	
	));
}



const prover = await EthProver.latest(foundry.provider);

const RESOLVER_IFACE = new ethers.Interface([
	`function resolve(bytes, bytes) view returns (bytes)`,
	`function addr(bytes32, uint256 coinType) view returns (bytes)`,
	`function text(bytes32, string key) view returns (string)`,

	`error OffchainLookup(address from, string[] urls, bytes request, bytes4 callback, bytes carry)`
]);


async function resolve(name, call, ...args) {
	let revert;
	try {
		const {address} = await foundry.provider.getResolver(name);
		const resolver = new ethers.Contract(address, RESOLVER_IFACE, foundry.provider);
		await resolver.resolve(ethers.dnsEncode(name), RESOLVER_IFACE.encodeFunctionData(call, [ethers.ZeroHash, ...args]));
		throw 'bug';
	} catch (cause) {
		revert = cause.revert;
		if (!revert || !revert.selector === '0x556f1830') {
			throw new Error('expected OffchainLookup', {cause});
		}
	}
	//console.log(revert.args);

	let [_context, [ops, inputs]] = ABI_CODER.decode(['bytes', 'tuple(bytes, bytes[])'], ethers.dataSlice(revert.args[2], 4));
	let [[_target, __context, __req, selector, carry]] = ABI_CODER.decode(['tuple(address, bytes, tuple(bytes, bytes[]), bytes4, bytes)'], revert.args[4]);

	//console.log(new ProgramReader(ethers.getBytes(ops), inputs).readActions());

	let state = await prover.evalDecoded(ops, inputs);
	let outputs = await state.resolveOutputs();
	//console.log({outputs});

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

await resolve('raffy.eth', 'text', 'description');
await resolve('sub.raffy.eth', 'addr', 60);
await resolve('raffy.eth', 'text', 'namespace');
await resolve('sub.raffy.eth', 'text', 'avatar');
await resolve('a.b.c.raffy.eth', 'text', 'description');
await resolve('raffy.chonk.eth', 'text', 'description');
await resolve('a.b.c.raffy.chonk.eth', 'text', 'description');

await foundry.shutdown();
