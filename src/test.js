import {Foundry} from '@adraffy/blocksmith';
import {EthProver, EVMRequest, ABI_CODER} from '@unruggable/evmgateway';
import {ethers} from 'ethers';

const foundry = await Foundry.launch();

const linker = await foundry.deploy({file: 'Linker'});

async function createNamespace(owner = foundry.wallets.admin) {
	const receipt = await foundry.confirm(linker.createNamespace(owner));
	return receipt.logs[0].args[1];
}

function dnsEncode(name) {
	return name ? ethers.dnsEncode(name) : `0x00`;
}

// ************************************************************

// raffy.eth -> raffy namespace
// no link required: default link is owned namespace
const ns_raffy = await createNamespace();
await foundry.confirm(linker.setNamespace(foundry.wallets.admin, ethers.namehash('raffy.eth'), ns_raffy));

await foundry.confirm(linker.setRecord(
	ns_raffy, 
	dnsEncode(''), 
	ethers.id('avatar'), 
	ethers.toUtf8Bytes('https://raffy.antistupid.com/ens.jpg')
));
await foundry.confirm(linker.setRecord(
	ns_raffy, 
	dnsEncode(''), 
	ethers.toBeHex(60, 32), 
	'0x51050ec063d393217B436747617aD1C2285Aeeee'
));
await foundry.confirm(linker.setRecord(
	ns_raffy, 
	dnsEncode('sub'), 
	ethers.id('description'), 
	ethers.toUtf8Bytes('I am subdomain')
));

// ************************************************************

// create nft
const nft = await foundry.deploy({
	sol: `
		import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
		contract ChonkNFT is ERC721 {
			constructor() ERC721("Chonk", "CHONK") {}
			function mint(uint256 token) external {
				_safeMint(msg.sender, token);
			}
		}
	`,
});

// mint subdomain
await foundry.confirm(nft.mint(ethers.id('raffy')));

// chonk.eth -> nft -> token
await foundry.confirm(linker.createLink(dnsEncode('chonk.eth'), nft));
const ns_chonk = await createNamespace();
await foundry.confirm(linker.setNamespace(nft, ethers.id('raffy'), ns_chonk));

await foundry.confirm(linker.setRecord(
	ns_chonk, 
	dnsEncode(''), 
	ethers.id('description'), 
	ethers.toUtf8Bytes('I am Chonk #1')
));
await foundry.confirm(linker.setRecord(
	ns_chonk, 
	dnsEncode('a.b.c'), 
	ethers.id('description'), 
	ethers.toUtf8Bytes('chonk!!!')
));

// ************************************************************

const prover = await EthProver.latest(foundry.provider);

const basenames = new Map([
	['raffy.eth', foundry.wallets.admin.address],
	['chonk.eth', foundry.wallets.admin.address]
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
		case 'contenthash': 
			key_hash = BigInt(ethers.id(recordType)) - 1n;
			break;
		default:
			key_hash = recordKey;
	}
	key_hash = ethers.toBeHex(key_hash);

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
	// mapping (uint256 ns => address owner) _nsOwners;
	// mapping (address controller => mapping(bytes basename => uint256)) _links;
	// mapping (address mediator => mapping(uint256 token => uint256 ns)) _tokenLinks;
	// mapping (uint256 ns => mapping(bytes fragment => mapping(bytes32 key => bytes value))) _records;
	let iController = req.addInput(controller);
	let iKeyHash = req.addInput(key_hash);

	// read link type
	req.setSlot(2)
		.pushInput(iController).follow()
		.pushBytes(dnsEncode(basename)).follow()
		.read().setOutput(0);

	// assume link is owned, read ns
	req.setSlot(3)
		.pushInput(iController).follow()
		.pushBytes(ethers.namehash(basename)).follow()
		.read().setOutput(1)

	// read owned record
	req.setSlot(4)
		.pushOutput(1).follow()
		.pushBytes(dnsEncode(owned_fragment)).follow()
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
			.pushBytes(dnsEncode(token_fragment)).follow()
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
