import { contextBridge, ipcRenderer } from 'electron';
import type { WalletAPI } from './types';
async function call(name:string,...args:unknown[]){const result=await ipcRenderer.invoke(`wallet:${name}`,...args);if(!result.ok)throw new Error(result.error);return result.value;}
const api:WalletAPI={
 nftFileHash:input=>call('nftFileHash',input),
 community:input=>call('community',input),
 networkAssets:input=>call('networkAssets',input),
 creation:input=>call('creation',input),
 frameRun:input=>call('frameRun',input),
 chat:input=>call('chat',input),copyChat:value=>call('copyChat',value),chatImage:(value,avatar)=>call('chatImage',value,avatar),
 integrations:()=>call('integrations'),saveIntegrations:input=>call('saveIntegrations',input),configure:input=>call('configure',input),nfts:input=>call('nfts',input),nftImage:(uri,retry)=>call('nftImage',uri,retry),uploadMetadata:input=>call('uploadMetadata',input),usdc:network=>call('usdc',network),assetQuote:input=>call('assetQuote',input),assetSend:id=>call('assetSend',id),assetOperations:()=>call('assetOperations'),
 copyText:value=>call('copyText',value),activity:input=>call('activity',input),
 initialize:pin=>call('initialize',pin),migrate:input=>call('migrate',input),switchWallet:(id,network)=>call('switchWallet',id,network),renameWallet:(id,name,network)=>call('renameWallet',id,name,network),changePin:(oldPin,newPin)=>call('changePin',oldPin,newPin),
 status:network=>call('status',network),generate:()=>call('generate'),create:input=>call('create',input),import:input=>call('import',input),
 unlock:(password,network)=>call('unlock',password,network),lock:()=>call('lock'),balances:network=>call('balances',network),quote:input=>call('quote',input),
 send:id=>call('send',id),history:()=>call('history'),reveal:password=>call('reveal',password),openExplorer:transfer=>call('openExplorer',transfer),
 onLock:callback=>{const handler=()=>callback();ipcRenderer.on('wallet:locked',handler);return()=>ipcRenderer.removeListener('wallet:locked',handler);},
};
contextBridge.exposeInMainWorld('wallet',api);
