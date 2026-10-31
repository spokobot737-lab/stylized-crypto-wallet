import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { generateMnemonic, validateMnemonic, seedFrom, accounts } from './keys';
import { atomicWrite, createVault, readVault } from './vault';
import { balances, prepare, sign, broadcast, explorer, type Prepared } from './chains';
import type { Network, Quote, Transfer } from './types';
export const networkSchema=z.enum(['mainnet','testnet']);
const passwordSchema=z.string().min(12).max(256);
const setupSchema=z.object({password:passwordSchema,passphrase:z.string().max(256)}).strict();
const quoteSchema=z.object({chain:z.enum(['SOL','ETH','BTC']),network:networkSchema,to:z.string().min(1).max(128),amount:z.string().max(40)}).strict();
const transferSchema=z.object({hash:z.string(),chain:z.enum(['SOL','ETH','BTC']),network:networkSchema,to:z.string(),amount:z.string(),at:z.number(),explorer:z.string(),status:z.enum(['broadcast','unknown'])});
export class WalletService {
 private vaultPath:string; private historyPath:string;
 private seed?:Buffer; private pendingMnemonic?:string;private pendingAt=0;
 private epoch=0;private busy=false;private authBusy=false; private failures=0;private retryAt=0;
 private drafts=new Map<string,{quote:Quote;prepared:Prepared;epoch:number}>();
 constructor(directory:string){this.vaultPath=join(directory,'wallet.vault');this.historyPath=join(directory,'transfers.json');}
 status(network:Network){network=networkSchema.parse(network);return {exists:existsSync(this.vaultPath),unlocked:!!this.seed,accounts:this.seed?accounts(this.seed,network):[]};}
 generate(){if(existsSync(this.vaultPath))throw new Error('Portfel już istnieje.');this.pendingMnemonic=generateMnemonic();this.pendingAt=Date.now();return this.pendingMnemonic;}
 async create(input:unknown){
  const data=setupSchema.extend({word3:z.string(),word8:z.string()}).parse(input);
  if(!this.pendingMnemonic||Date.now()-this.pendingAt>15*60000)throw new Error('Wygeneruj nową frazę. Poprzednia sesja wygasła.');
  const words=this.pendingMnemonic.split(' ');if(words[2]!==data.word3.trim().toLowerCase()||words[7]!==data.word8.trim().toLowerCase())throw new Error('Słowo 3 lub 8 nie zgadza się z kopią zapasową.');
  return this.setup({mnemonic:this.pendingMnemonic,...data});
 }
 async import(input:unknown){const data=setupSchema.extend({mnemonic:z.string().max(512)}).parse(input);return this.setup({...data,mnemonic:validateMnemonic(data.mnemonic)});}
 private async setup(data:{mnemonic:string;password:string;passphrase:string}){
  if(this.busy)throw new Error('Inna operacja jest w toku.');this.busy=true;const epoch=this.epoch;
  try{await createVault(this.vaultPath,{mnemonic:data.mnemonic,passphrase:data.passphrase},data.password);this.pendingMnemonic=undefined;if(epoch===this.epoch)this.seed=seedFrom(data.mnemonic,data.passphrase);return this.status('testnet');}finally{this.busy=false;}
 }
 private async authenticate(password:string){
  passwordSchema.parse(password);if(this.authBusy)throw new Error('Weryfikacja hasła jest w toku.');if(Date.now()<this.retryAt)throw new Error('Zbyt wiele prób. Odczekaj chwilę.');this.authBusy=true;
  try{const data=await readVault(this.vaultPath,password);this.failures=0;return data;}
  catch(e){this.failures++;this.retryAt=Date.now()+Math.min(30000,1000*2**Math.min(5,this.failures-1));throw e;}finally{this.authBusy=false;}
 }
 async unlock(password:string,network:Network){network=networkSchema.parse(network);const epoch=this.epoch;const data=await this.authenticate(password);if(epoch!==this.epoch)throw new Error('Sesja została zablokowana.');this.seed?.fill(0);this.seed=seedFrom(data.mnemonic,data.passphrase);return this.status(network);}
 lock(){this.epoch++;this.seed?.fill(0);this.seed=undefined;this.pendingMnemonic=undefined;this.drafts.clear();}
 private requireSeed(){if(!this.seed)throw new Error('Portfel jest zablokowany.');return this.seed;}
 async balances(network:Network){network=networkSchema.parse(network);const epoch=this.epoch;const copy=Buffer.from(this.requireSeed());try{const result=await balances(copy,network);if(epoch!==this.epoch)throw new Error('Sesja została zablokowana.');return result;}finally{copy.fill(0);}}
 async quote(input:unknown){const data=quoteSchema.parse(input);const epoch=this.epoch,copy=Buffer.from(this.requireSeed());try{
  const prepared=await prepare(copy,data.chain,data.network,data.to,data.amount);if(epoch!==this.epoch)throw new Error('Sesja została zablokowana.');
  const quote:Quote={id:randomUUID(),chain:data.chain,network:data.network,networkLabel:accounts(copy,data.network).find(a=>a.chain===data.chain)!.networkLabel,from:prepared.from,to:prepared.to,amount:prepared.amount,fee:prepared.fee,feeLabel:prepared.feeLabel,expires:Date.now()+90000};
  this.drafts.clear();this.drafts.set(quote.id,{quote,prepared,epoch});return quote;
 }finally{copy.fill(0);}}
 async send(id:string,password:string,confirm:(quote:Quote)=>Promise<boolean>){
  if(this.busy)throw new Error('Inna operacja jest w toku.');z.string().uuid().parse(id);const draft=this.drafts.get(id);
  if(!draft||draft.quote.expires<Date.now())throw new Error('Wycena wygasła. Przygotuj transakcję ponownie.');this.requireSeed();this.busy=true;
  const valid=()=>{if(draft.epoch!==this.epoch||draft.quote.expires<Date.now())throw new Error('Sesja lub wycena wygasła.');};
  try{
   await this.authenticate(password);valid();if(!await confirm(draft.quote))throw new Error('Przelew anulowany.');valid();
   const copy=Buffer.from(this.requireSeed());let signed;try{signed=await sign(copy,draft.prepared);}finally{copy.fill(0);}valid();
   // Consume the draft before any network side effect. Never automatically retry a broadcast.
   this.drafts.delete(id);
   const transfer:Transfer={hash:signed.hash,chain:draft.quote.chain,network:draft.quote.network,to:draft.quote.to,amount:draft.quote.amount,at:Date.now(),explorer:explorer(draft.quote.chain,draft.quote.network,signed.hash),status:'unknown'};
   // Persist the known hash first so an ambiguous RPC error cannot hide a submitted transaction.
   const history=await this.history();await atomicWrite(this.historyPath,[transfer,...history].slice(0,200));valid();
   try {const returned=await broadcast(draft.prepared,signed);if(returned!==signed.hash)throw new Error('RPC zwrócił inny identyfikator.');}
   catch {throw new Error(`Niepewny wynik rozgłoszenia. Sprawdź hash ${signed.hash} w historii i eksploratorze przed ponowną próbą. Transakcja mogła zostać wysłana.`);}
   transfer.status='broadcast';
   await atomicWrite(this.historyPath,[transfer,...history].slice(0,200)).catch(()=>{});
   return transfer;
  }finally{this.busy=false;}
 }
 async history():Promise<Transfer[]>{this.requireSeed();try{return z.array(transferSchema).max(200).parse(JSON.parse(await readFile(this.historyPath,'utf8')));}catch(e:any){if(e.code==='ENOENT')return [];throw new Error('Nie można odczytać lokalnej historii przelewów.');}}
 async reveal(password:string){this.requireSeed();const epoch=this.epoch;const secret=await this.authenticate(password);if(epoch!==this.epoch)throw new Error('Sesja została zablokowana.');return secret;}
}
