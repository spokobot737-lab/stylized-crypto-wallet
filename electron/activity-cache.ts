import {readFile} from 'node:fs/promises';
import {z} from 'zod';
import {atomicWrite} from './vault';
import type {DeviceProtector} from './app-vault';
import type {ActivityPage,Chain,Network} from './types';
const text=z.string().max(1000),chain=z.enum(['SOL','ETH','BTC']);
const item=z.object({id:text,hash:text,chain,network:z.enum(['mainnet','testnet']),networkLabel:text,direction:z.enum(['in','out','self','other']),amount:text,attemptedAmount:text.optional(),from:z.array(text).max(100),to:z.array(text).max(100),fee:text.nullable(),feePaidByWallet:z.boolean(),at:z.number().nullable(),status:z.enum(['confirmed','pending','failed','unknown']),confirmations:z.number().nullable(),block:z.number().nullable(),source:z.enum(['network','local']),kind:text,amountBasis:z.enum(['transfer','balance-change']),explorer:text,asset:z.object({standard:text,address:text,tokenId:text.optional(),symbol:text}).optional()}).strict();
const pageSchema=z.object({unavailable:z.array(chain).max(3).optional(),items:z.array(item).max(5000),next:z.object({SOL:z.string().max(16000).nullable().optional(),ETH:z.string().max(16000).nullable().optional(),BTC:z.string().max(16000).nullable().optional()}).strict(),warnings:z.array(z.object({chain,message:text})).max(100),fetchedAt:z.number()}).strict();
const schema=z.object({version:z.literal(1),walletId:z.string().uuid(),network:z.enum(['mainnet','testnet']),addresses:z.string().max(500),advanced:z.array(chain).max(3),page:pageSchema}).strict();
export type CachedActivity=z.infer<typeof schema>;
export async function readActivityCache(path:string,protector:DeviceProtector,walletId:string,network:Network,addresses:string):Promise<CachedActivity|undefined>{
 try{const raw=await readFile(path,'utf8');if(raw.length>16000000)throw Error();const envelope=z.object({version:z.literal(1),sealed:z.string().max(16000000)}).strict().parse(JSON.parse(raw));const value=schema.parse(JSON.parse(await protector.open(Buffer.from(envelope.sealed,'base64'))));if(value.walletId!==walletId||value.network!==network||value.addresses!==addresses)throw Error();return value;}catch(e:any){if(e.code==='ENOENT')return;throw Error('Nie można odczytać trwałej historii; oryginalny plik pozostawiono bez zmian.');}
}
export function mergeActivityCache(old:CachedActivity|undefined,incoming:ActivityPage,identity:{walletId:string;network:Network;addresses:string},selected?:Chain,cursor?:string):CachedActivity{
 const rows=new Map(old?.page.items.map(x=>[x.id,x])||[]);for(const row of incoming.items)rows.set(row.id,row);
 const items=[...rows.values()].sort((a,b)=>Number(b.status==='pending')-Number(a.status==='pending')||(b.at||0)-(a.at||0)||a.id.localeCompare(b.id));
 const advanced=new Set(old?.advanced||[]);const oldRows=old?.page.items||[];const group=(x:ActivityPage['items'][number])=>x.chain+':'+(x.asset?x.asset.standard+':'+x.asset.address.toLowerCase():x.id.includes(':internal:')?'internal':'native');const groups=new Map<string,boolean>();for(const x of incoming.items){const k=group(x);groups.set(k,!!groups.get(k)||oldRows.some(o=>o.id===x.id));}const gaps=new Set(incoming.items.filter(x=>groups.get(group(x))===false).map(x=>x.chain));if(selected&&cursor)advanced.add(selected);const next={...old?.page.next};
 for(const c of ['SOL','ETH','BTC'] as const)if(c in incoming.next){const failed=incoming.unavailable?.includes(c);if(!failed&&(cursor||!advanced.has(c)||!(c in next)||gaps.has(c)))next[c]=incoming.next[c];}
 const warnings=[...(old?.page.warnings||[]).filter(w=>!(w.chain in incoming.next)),...incoming.warnings];if(items.length>5000)warnings.push({chain:selected||'ETH',message:'Cache obejmuje 5000 najnowszych rekordów. Starsze dane sprawdź w eksploratorze.'});
 return {version:1,...identity,advanced:[...advanced],page:{unavailable:incoming.unavailable,items:items.slice(0,5000),next,warnings:warnings.slice(-100),fetchedAt:incoming.fetchedAt}};
}
export async function writeActivityCache(path:string,value:CachedActivity,protector:DeviceProtector){const sealed=await protector.seal(JSON.stringify(schema.parse(value)));await atomicWrite(path,{version:1,sealed:sealed.toString('base64')});}
