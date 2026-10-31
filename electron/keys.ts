import { randomBytes } from 'node:crypto';
import * as bip39 from 'bip39';
import { derivePath } from 'ed25519-hd-key';
import { Keypair } from '@solana/web3.js';
import { HDNodeWallet } from 'ethers';
import { BIP32Factory } from 'bip32';
import * as ecc from 'tiny-secp256k1';
import { payments, networks } from 'bitcoinjs-lib';
import type { Network, Account } from './types';
const bip32 = BIP32Factory(ecc);
export function normalizeMnemonic(text: string) { return text.normalize('NFKD').trim().toLowerCase().split(/\s+/).join(' '); }
export function validateMnemonic(text: string) {
 const normalized = normalizeMnemonic(text);
 if (!bip39.validateMnemonic(normalized, bip39.wordlists.english)) throw new Error('Nieprawidłowa fraza BIP39. Obsługiwany jest angielski słownik.');
 return normalized;
}
export function generateMnemonic() { return bip39.entropyToMnemonic(randomBytes(32).toString('hex')); }
export function seedFrom(mnemonic: string, passphrase = '') { return bip39.mnemonicToSeedSync(validateMnemonic(mnemonic), passphrase.normalize('NFKD')); }
export const btcNetwork = (network: Network) => network === 'mainnet' ? networks.bitcoin : networks.testnet;
export const btcPath = (network: Network) => `m/84'/${network === 'mainnet' ? 0 : 1}'/0'/0/0`;
export function solKey(seed: Buffer) { const derived = derivePath("m/44'/501'/0'/0'", seed.toString('hex')).key; try { return Keypair.fromSeed(derived); } finally { derived.fill(0); } }
export function ethKey(seed: Buffer) { return HDNodeWallet.fromSeed(seed).derivePath("m/44'/60'/0'/0/0"); }
export function btcKey(seed: Buffer, network: Network) { return bip32.fromSeed(seed, btcNetwork(network)).derivePath(btcPath(network)); }
export function accounts(seed: Buffer, network: Network): Account[] {
 const sol = solKey(seed); const solAddress = sol.publicKey.toBase58(); sol.secretKey.fill(0);
 const btc = btcKey(seed, network);
 return [
  { chain:'SOL', address:solAddress,path:"m/44'/501'/0'/0'",networkLabel:network === 'mainnet' ? 'Solana Mainnet' : 'Solana Devnet' },
  { chain:'ETH', address:ethKey(seed).address,path:"m/44'/60'/0'/0/0",networkLabel:network === 'mainnet' ? 'Ethereum Mainnet' : 'Ethereum Sepolia' },
  { chain:'BTC', address:payments.p2wpkh({pubkey:btc.publicKey,network:btcNetwork(network)}).address!,path:btcPath(network),networkLabel:network === 'mainnet' ? 'Bitcoin Mainnet' : 'Bitcoin Testnet3' },
 ];
}
