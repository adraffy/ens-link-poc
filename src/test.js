import {Foundry} from '@adraffy/blocksmith';
import {EthProver, EVMRequest, EVMProgram} from '@unruggable/evmgateway';
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

const ns_raffy = await createNamespace();
const ns_chonk = await createNamespace();

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

await foundry.confirm(linker.createLink(dnsEncode('chonk.eth'), 1, nft));


const labelhash_raffy = ethers.id('raffy');
await foundry.confirm(nft.mint(labelhash_raffy));

await foundry.confirm(linker.setNamespace(foundry.wallets.admin, 0, ns_raffy));
await foundry.confirm(linker.setNamespace(nft, labelhash_raffy, ns_chonk));


await foundry.confirm(linker.setRecord(ns_raffy, dnsEncode(''), ethers.id('avatar'), ethers.toUtf8Bytes('https://raffy.antistupid.com/ens.jpg')));
await foundry.confirm(linker.setRecord(ns_raffy, dnsEncode(''), ethers.toBeHex(60, 32), '0x51050ec063d393217B436747617aD1C2285Aeeee'));
await foundry.confirm(linker.setRecord(ns_raffy, dnsEncode('sub'), ethers.id('description'), ethers.toUtf8Bytes('I am subdomain')));
await foundry.confirm(linker.setRecord(ns_chonk, dnsEncode(''), ethers.id('description'), ethers.toUtf8Bytes('I am Chonk #1')));

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

	let fragment_owned = parts.slice(0, -drop).join('.');

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
	// mapping (address mediator => mapping(uint256 token => uint256 ns)) _nsLinks;
	// mapping (uint256 ns => mapping(bytes fragment => mapping(bytes32 key => bytes value))) _records;

	// read link type
	req.setSlot(2).push(controller).follow().pushBytes(dnsEncode(basename)).follow().read().setOutput(0);

	// assume link is owner, read owned ns
	req.setSlot(3).push(controller).follow().push(0).follow().read().setOutput(1);

	// read owned record
	req.setSlot(4)
		.pushOutput(1).follow()
		.pushBytes(dnsEncode(fragment_owned)).follow()
		.push(key_hash).follow()
		.readBytes().setOutput(2);
	
	if (token) {

		// assume link is tokenized, read token ns
		req.setSlot(3)
			.pushBytes(new Uint8Array(12)).pushOutput(0).slice(12, 20).concat().follow()
			.push(token).follow().read().setOutput(3);
	
		// read record
		req.pushProgram(new EVMProgram()
			.pushOutput(3)
			.requireNonzero()
			.setSlot(4).follow()
			.pushBytes(dnsEncode(token_fragment)).follow()
			.push(key_hash).follow()
			.readBytes().setOutput(4)).eval();
	}
	
	
	let state = await prover.evalRequest(req);
	let outputs = await state.resolveOutputs();
	let link = outputs[0];
	let linkType = BigInt(link) >> 160n;

	let out = {
		name,
		recordType,
		recordKey,
		basename, 
		controller,
		linkType
	};
	let value;
	if (linkType) {
		out.label = token_label;
		out.token = token;
		out.ns = BigInt(outputs[3]);
		value = outputs[4];
	} else {
		out.ns = BigInt(outputs[1]);
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
await resolve('alice.chonk.eth', 'text', 'description');


await foundry.shutdown();
