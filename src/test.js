import {Foundry} from '@adraffy/blocksmith';
import {EthProver, EVMRequest, ABI_CODER} from '@unruggable/evmgateway';
import {ethers} from 'ethers';
import {namehash, deploy_erc_721, parse_ns} from './utils.js';

const foundry = await Foundry.launch();
const {admin} = foundry.wallets;

const linker = await foundry.deploy({file: 'Linker'});

function rareKey(key) {
	return ethers.toBeHex(BigInt(ethers.id(key)) - 1n, 32);
}

const CONTENTHASH_KEY = rareKey('contenthash');
const PUBKEY_KEY = rareKey('pubkey');

function textEntry(key, value) {
	return [ethers.id(key), ethers.toUtf8Bytes(value)];
}
function addrEntry(coinType, value) {
	return [ethers.toBeHex(coinType, 32), value];
}

// ************************************************************

// raffy.eth -> raffy namespace
// no link required: default link is owned namespace
const ns_raffy = parse_ns(await foundry.confirm(linker.createNamespace(admin)));
await foundry.confirm(linker.setNamespace(admin, namehash('raffy.eth'), ns_raffy));

await foundry.confirm(linker.setRecords(
	ns_raffy, 
	[
		[namehash(''), [
			textEntry('avatar', 'https://raffy.antistupid.com/ens.jpg'),
			addrEntry(60, '0x51050ec063d393217B436747617aD1C2285Aeeee'),
		]],
		[namehash('sub'), [
			textEntry('description', 'I am subdomain')
		]]
	]
));

// ************************************************************

// create nft
const nft = await deploy_erc_721(foundry);

// mint subdomain
await foundry.confirm(nft.mint('raffy'));

// chonk.eth -> nft -> token
await foundry.confirm(linker.createLink(namehash('chonk.eth'), nft));
const ns_chonk = parse_ns(await foundry.confirm(linker.createNamespace(admin)));

await foundry.confirm(linker.setNamespace(nft, ethers.id('raffy'), ns_chonk));

await foundry.confirm(linker.setRecords(
	ns_chonk,
	[
		[namehash(''), [
			textEntry('description', 'I am Chonk #1')
		]],
		[namehash('a.b.c'), [
			textEntry('description', 'Chonk ABC!')
		]]
	],	
));

// ************************************************************

const prover = await EthProver.latest(foundry.provider);

const basenames = new Map([
	['raffy.eth', admin.address],
	['chonk.eth', admin.address]
]);

async function resolve(name, recordType, recordKey) {

	let key_hash;
	let utf8;
	switch (recordType) {
		case 'text': 
			utf8 = true; 
			key_hash = ethers.id(recordKey);
			break;
		case 'pubkey':
			key_hash = PUBKEY_KEY;
			break;
		case 'contenthash': 
			key_hash = CONTENTHASH_KEY;
			break;
		default:
			key_hash = recordKey;
	}
	key_hash = ethers.toBeHex(key_hash, 32);

	//console.log({name, type, key, key_hash, utf8});

	let parts = name.split('.');
	let basename;
	let controller;
	let drop = parts.length;
	for (; drop > 0; drop--) {
		basename = parts.slice(-drop).join('.');
		controller = basenames.get(basename);
		if (controller) break;
	}
	if (!drop) throw new Error('no basename');

	//console.log({basename, controller, drop});

	let owned_fragment = parts.slice(0, -drop).join('.');

	let token;
	let token_label;
	let token_fragment;
	if (drop < parts.length) {
		let index = parts.length - drop - 1;
		token_label = parts[index];
		token_fragment = parts.slice(0, index).join('.');
		token = ethers.id(token_label);
	}
	

	let req = new EVMRequest(5);
	req.setTarget(linker.target);
	// uint256 _nsCount;
	// mapping (uint256 ns => address) _ns;
	// mapping (address controller => mapping(bytes32 baseNode => address)) _mediators;
	// mapping (address mediator => mapping(uint256 id => uint256 ns)) _links;
	// mapping (uint256 ns => mapping(bytes32 fragNode => mapping(bytes32 key => Record))) _records;
	let iController = req.addInput(controller);
	let iKeyHash = req.addInput(key_hash);
	let iBaseNode = req.addInput(namehash(basename));

	// read link type
	req.setSlot(2)
		.pushInput(iController).follow()
		.pushInput(iBaseNode).follow()
		.read().setOutput(0);

	// assume link is owned, read ns
	req.setSlot(3)
		.pushInput(iController).follow()
		.pushInput(iBaseNode).follow()
		.read().setOutput(1)

	// read owned record
	req.setSlot(4)
		.pushOutput(1).follow()
		.pushBytes(namehash(owned_fragment)).follow()
		.pushInput(iKeyHash).follow()
		.readBytes().setOutput(2)
	
	if (token) {

		// assume link is tokenized, read ns
		req.setSlot(3)
			.pushOutput(0).follow()
			.push(token).follow()
			.read().setOutput(3);
	
		// read record
		req.setSlot(4)
			.pushOutput(3).follow()
			.pushBytes(namehash(token_fragment)).follow()
			.pushInput(iKeyHash).follow()
			.readBytes().setOutput(4);
	}
	
	
	let state = await prover.evalRequest(req);
	let outputs = await state.resolveOutputs();
	
	// let proofSeq = await prover.prove(state.needs);
	// let proofSize = ethers.dataLength(ABI_CODER.encode(['bytes[]', 'bytes'], [proofSeq.proofs, proofSeq.order]));

	let link = outputs[0];
	let tokenized = BigInt(link) != 0;

	let out = {
		name,
		recordType,
		recordKey,
		basename,
		controller,
		tokenized,
	};
	let value;
	if (tokenized) {
		out.label = token_label;
		out.token = token;
		out.ns = BigInt(outputs[3]);
		out.fragment = token_fragment;
		value = outputs[4];
	} else {
		out.ns = BigInt(outputs[1]);
		out.fragment = owned_fragment;
		value = outputs[2];
	}
	if (out.ns) {
		out.value = utf8 ? ethers.toUtf8String(value) : value;
	}
	console.log(out);
}


await resolve('raffy.eth', 'text', 'avatar');
await resolve('raffy.eth', 'addr', 60);
await resolve('sub.raffy.eth', 'text', 'description');
await resolve('raffy.chonk.eth', 'text', 'description');
await resolve('a.b.c.raffy.chonk.eth', 'text', 'description');
await resolve('alice.chonk.eth', 'text', 'description');


await foundry.shutdown();
