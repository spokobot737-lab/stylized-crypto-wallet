import { Connection } from '@solana/web3.js';
import { FetchRequest, JsonRpcProvider } from 'ethers';
import { endpoints, chainId } from '../chains';
import type { Network } from '../types';
import type { IntegrationKeys } from './types';

// Oficjalne adresy Circle; USDC.e i tokeny o podobnej nazwie nie są USDC.
// https://developers.circle.com/stablecoins/usdc-contract-addresses
export const USDC = {
 mainnet:{ETH:'0xA0b86991c6218b36c1d19D4a2e9Eb0cE3606eB48',SOL:'EPjFWdd5AufqSSqeM2qN1xzybapC8G4wEGGkZwyTDt1v'},
 testnet:{ETH:'0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238',SOL:'4zMMC9srt5Ri5X14GAgXhaHii3GnPAEERYPJgZJDncDU'},
} as const;
export const ERC20 = ['function balanceOf(address) view returns (uint256)','function decimals() view returns (uint8)','function transfer(address,uint256) returns (bool)'];
export const ERC721 = ['function ownerOf(uint256) view returns (address)','function supportsInterface(bytes4) view returns (bool)','function tokenURI(uint256) view returns (string)','function safeTransferFrom(address,address,uint256)'];
export const ERC1155 = ['function balanceOf(address,uint256) view returns (uint256)','function supportsInterface(bytes4) view returns (bool)','function uri(uint256) view returns (string)','function safeTransferFrom(address,address,uint256,uint256,bytes)'];
export function solRpc(network:Network,keys:IntegrationKeys={}){return keys.helius?`https://${network==='mainnet'?'mainnet':'devnet'}.helius-rpc.com/?api-key=${encodeURIComponent(keys.helius)}`:endpoints[network].SOL;}
export const SOLANA_GENESIS={mainnet:'5eykt4UsFv8P8NJdTREpY1vzqKqZKvdpKuc147dw2N9d',testnet:'EtWTRABZaYq6iMfeYKouRu166VU2xqa1wcaWoxPkrZBG'} as const;
export async function checkSolana(connection:Pick<Connection,'getGenesisHash'>,network:Network){if(await connection.getGenesisHash()!==SOLANA_GENESIS[network])throw Error('Niezgodna sieć RPC Solana. Operacja zablokowana.');}
export function solana(network:Network,keys:IntegrationKeys={}){return new Connection(solRpc(network,keys),{commitment:'confirmed',fetch:(url,init)=>fetch(url,{...init,signal:AbortSignal.timeout(20000)})});}
export function ethereum(network:Network,chain:string='ETH'){const request=new FetchRequest(endpoints[network][chain==='RH'?'RH':'ETH']);request.timeout=20000;return new JsonRpcProvider(request,undefined,{batchMaxCount:1});}
export async function checkEthereum(provider:JsonRpcProvider,network:Network,chain:string='ETH'){if((await provider.getNetwork()).chainId!==chainId(network,chain))throw new Error('Niezgodna sieć RPC.');}
export async function apiJson(url:string,init?:RequestInit){
 try{const response=await fetch(url,{...init,redirect:'error',signal:AbortSignal.timeout(20000)});if(!response.ok)throw Object.assign(new Error(`HTTP ${response.status}`),{status:response.status});const reader=response.body?.getReader();if(!reader)throw new Error('Brak odpowiedzi.');const chunks:Uint8Array[]=[];let size=0;try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>8*1024*1024)throw new Error('Limit odpowiedzi.');chunks.push(value);}}finally{await reader.cancel().catch(()=>{});}return JSON.parse(Buffer.concat(chunks).toString('utf8'));}
 catch(e:any){if(e.status)throw Object.assign(new Error(`Usługa zwróciła HTTP ${e.status}. Sprawdź uprawnienia, limit i dostępność usługi.`),{status:e.status});throw new Error('Dostawca danych jest niedostępny. Sprawdź klucz API, limit zapytań i wybraną sieć.');}
}
