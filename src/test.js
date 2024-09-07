import {Foundry, Node} from '@adraffy/blocksmith';
import {EthProver} from '@unruggable/evmgateway';
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


const labelhash_chonk = ethers.id('chonk');
await foundry.confirm(nft.mint(labelhash_chonk));

await foundry.confirm(linker.setNamespace(foundry.wallets.admin, 0, ns_raffy));
await foundry.confirm(linker.setNamespace(nft, labelhash_chonk, ns_chonk));


await foundry.confirm(linker.setRecord(ns_raffy, dnsEncode(''), ethers.id('avatar'), ethers.toUtf8Bytes('https://raffy.antistupid.com/ens.jpg')));
await foundry.confirm(linker.setRecord(ns_raffy, dnsEncode('sub'), ethers.id('description'), ethers.toUtf8Bytes('I am subdomain')));

await foundry.confirm(linker.setRecord(ns_chonk, dnsEncode(''), ethers.id('description'), ethers.toUtf8Bytes('I am Chonk #1')));


const prover = await EthProver.latest(foundry.provider);



await foundry.shutdown();
