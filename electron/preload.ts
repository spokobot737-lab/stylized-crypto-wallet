import { contextBridge, ipcRenderer } from 'electron';
import type { WalletAPI } from './types';
async function call(name:string,...args:unknown[]){const result=await ipcRenderer.invoke(`wallet:${name}`,...args);if(!result.ok)throw new Error(result.error);return result.value;}
const api:WalletAPI={
 status:network=>call('status',network),generate:()=>call('generate'),create:input=>call('create',input),import:input=>call('import',input),
 unlock:(password,network)=>call('unlock',password,network),lock:()=>call('lock'),balances:network=>call('balances',network),quote:input=>call('quote',input),
 send:(id,password)=>call('send',id,password),history:()=>call('history'),reveal:password=>call('reveal',password),openExplorer:transfer=>call('openExplorer',transfer),
 onLock:callback=>{const handler=()=>callback();ipcRenderer.on('wallet:locked',handler);return()=>ipcRenderer.removeListener('wallet:locked',handler);},
};
contextBridge.exposeInMainWorld('wallet',api);
