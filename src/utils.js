import {ethers} from 'ethers';

export function namehash(name) {
	return name ? ethers.namehash(name) : ethers.ZeroHash;
}

export function parse_ns(receipt) {
	return receipt.logs[0].args[1];
}

export function deploy_erc_721(foundry, {name = 'Chonk', from} = {}) {
	return foundry.deploy({
		sol: `
			import {ERC721} from "@openzeppelin/contracts/token/ERC721/ERC721.sol";
			contract NFT is ERC721 {
				constructor() ERC721("${name}", "${name.replaceAll(/[^a-z0-9]/ig, '').toUpperCase()}") {}
				function mint(string memory label) external {
					_safeMint(msg.sender, uint256(keccak256(bytes(label))));
				}
			}
		`,
		from
	});
}