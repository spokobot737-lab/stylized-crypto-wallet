import { contextBridge, ipcRenderer } from 'electron';
import type { WalletAPI } from './types';
async function call(name:string,...args:unknown[]){const result=await ipcRenderer.invoke(`wallet:${name}`,...args);if(!result.ok)throw new Error(result.error);return result.value;}
const api:WalletAPI={
 initialize:pin=>call('initialize',pin),migrate:input=>call('migrate',input),switchWallet:(id,network)=>call('switchWallet',id,network),renameWallet:(id,name,network)=>call('renameWallet',id,name,network),changePin:(oldPin,newPin)=>call('changePin',oldPin,newPin),
 status:network=>call('status',network),generate:()=>call('generate'),create:input=>call('create',input),import:input=>call('import',input),
 unlock:(password,network)=>call('unlock',password,network),lock:()=>call('lock'),balances:network=>call('balances',network),quote:input=>call('quote',input),
 send:id=>call('send',id),history:()=>call('history'),reveal:password=>call('reveal',password),openExplorer:transfer=>call('openExplorer',transfer),
 onLock:callback=>{const handler=()=>callback();ipcRenderer.on('wallet:locked',handler);return()=>ipcRenderer.removeListener('wallet:locked',handler);},
};
contextBridge.exposeInMainWorld('wallet',api);
