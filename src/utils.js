import {ethers} from 'ethers';

export function namehash(name) {
	return name ? ethers.namehash(name) : ethers.ZeroHash;
}
