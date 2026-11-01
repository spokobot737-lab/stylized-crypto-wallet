import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { generateMnemonic, validateMnemonic, seedFrom, accounts } from './keys';
import { atomicWrite, readVault } from './vault';
import { newCollection, openCollection, sealCollection, pinSchema, type Collection, type DeviceProtector, type Envelope } from './app-vault';
import { balances, prepare, sign, broadcast, explorer, type Prepared } from './chains';
import type { Network, Quote, Transfer, Status, ActivityPage } from './types';
import { Integrations } from './assets/integrations';
import { prepareAsset,disposeAsset,signAsset,broadcastAsset,revalidateAsset,usdcBalances,type AssetPrepared } from './assets/transactions';
import { fetchNfts,nftQuerySchema } from './assets/nfts';
import { remoteImage } from './assets/remote';
import { uploadMetadata } from './assets/upload';
import type { AssetQuote,AssetOperation,MetadataUpload } from './assets/types';
import { activityInput, fetchActivity, mergeLocalActivity } from './activity';
export const networkSchema=z.enum(['mainnet','testnet']);
const walletSchema=z.object({name:z.string().trim().min(1).max(32),passphrase:z.string().max(256)}).strict();
const quoteSchema=z.object({chain:z.enum(['SOL','ETH','BTC']),network:networkSchema,to:z.string().min(1).max(128),amount:z.string().max(40)}).strict();
const transferSchema=z.object({hash:z.string(),chain:z.enum(['SOL','ETH','BTC']),network:networkSchema,to:z.string(),amount:z.string(),at:z.number(),explorer:z.string(),status:z.enum(['broadcast','unknown'])});
type Session={collection:Collection;key:Buffer;envelope:Envelope};
export class WalletService {
 readonly integrations:Integrations;
 private assetDrafts=new Map<string,{quote:AssetQuote;prepared:AssetPrepared;epoch:number}>();
 private imageCache=new Map<string,string>();
 private vaultPath:string;private legacyPath:string;private attemptsPath:string;
 private session?:Session;private pendingMnemonic?:string;private pendingAt=0;
 private epoch=0;private busy=false;private authBusy=false;private failures=0;private retryAt=0;
 private activityCache=new Map<string,{at:number;value:Promise<ActivityPage>}>();
 private drafts=new Map<string,{quote:Quote;prepared:Prepared;epoch:number}>();
 constructor(private directory:string,private protector:DeviceProtector){this.integrations=new Integrations(directory,protector);this.vaultPath=join(directory,'app.vault');this.legacyPath=join(directory,'wallet.vault');this.attemptsPath=join(directory,'pin-attempts.json');}
 status(network:Network):Status{network=networkSchema.parse(network);const active=this.session?.collection.wallets.find(w=>w.id===this.session!.collection.activeId);let derived:ReturnType<typeof accounts>=[];if(active){const seed=seedFrom(active.mnemonic,active.passphrase);try{derived=accounts(seed,network);}finally{seed.fill(0);}}return {exists:existsSync(this.vaultPath)||existsSync(this.legacyPath),needsMigration:!existsSync(this.vaultPath)&&existsSync(this.legacyPath),unlocked:!!this.session,accounts:derived,wallets:this.session?.collection.wallets.map(({id,name})=>({id,name}))||[],activeWalletId:this.session?.collection.activeId||null};}
 private clearDrafts(){this.drafts.clear();for(const draft of this.assetDrafts.values())disposeAsset(draft.prepared);this.assetDrafts.clear();}
 private stable(epoch:number){this.requireSession();if(epoch!==this.epoch)throw new Error('Aktywny portfel lub sesja uległy zmianie.');}
 async configure(raw:unknown){const input=z.object({network:networkSchema.optional(),language:z.enum(['pl','en']).optional()}).strict().parse(raw);if(input.language)this.integrations.language=input.language;if(input.network!==undefined)await this.exclusive(async()=>{this.requireSession();if(input.network!==this.integrations.network){this.integrations.network=input.network!;this.epoch++;this.clearDrafts();this.activityCache.clear();this.imageCache.clear();}});}
 async integrationStatus(){this.requireSession();const epoch=this.epoch;const result=await this.integrations.status();this.stable(epoch);return result;}
 async saveIntegrations(raw:unknown){return this.exclusive(async()=>{this.requireSession();const epoch=this.epoch;const result=await this.integrations.save(raw);this.stable(epoch);this.clearDrafts();return result;});}
 async nfts(raw:unknown){const input=nftQuerySchema.parse(raw),epoch=this.epoch;const account=this.status(input.network).accounts.find(a=>a.chain===input.chain);this.requireSession();if(!account)throw new Error('Dodaj portfel.');const result=await fetchNfts(input,account.address,await this.integrations.keys());this.stable(epoch);return result;}
 async nftImage(uri:string){uri=z.string().max(2048).parse(uri);this.requireSession();const epoch=this.epoch;if(this.imageCache.has(uri))return this.imageCache.get(uri)!;const result=await remoteImage(uri);this.stable(epoch);if(this.imageCache.size>=16)this.imageCache.clear();this.imageCache.set(uri,result);return result;}
 async uploadMetadata(raw:MetadataUpload){this.requireSession();const epoch=this.epoch;const result=await uploadMetadata(raw,await this.integrations.keys());this.stable(epoch);return result;}
 async usdc(network:Network){network=networkSchema.parse(network);const epoch=this.epoch,seed=this.seed();try{const result=await usdcBalances(seed,network,await this.integrations.keys());this.stable(epoch);return result;}finally{seed.fill(0);}}
 async assetQuote(input:unknown){return this.exclusive(async()=>{const epoch=this.epoch,walletId=this.active().id,seed=this.seed();let prepared:AssetPrepared|undefined;try{prepared=await prepareAsset(seed,input,await this.integrations.keys());this.stable(epoch);if(prepared.intent.network!==this.integrations.network)throw new Error('Zmieniono środowisko sieciowe. Przygotuj operację ponownie.');this.clearDrafts();const quote:AssetQuote={id:randomUUID(),walletId,chain:prepared.intent.chain,network:prepared.intent.network,from:prepared.from,to:prepared.to,title:prepared.title,details:prepared.details,fee:prepared.fee,feeLabel:prepared.feeLabel,createdAddresses:prepared.createdAddresses,transactions:prepared.payload.kind==='evm'?1:prepared.payload.txs.length,expires:Date.now()+90000};this.assetDrafts.set(quote.id,{quote,prepared,epoch});return quote;}catch(e){if(prepared)disposeAsset(prepared);throw e;}finally{seed.fill(0);}});}
 async assetSend(id:string,confirm:(quote:AssetQuote)=>Promise<boolean>){return this.exclusive(async()=>{z.string().uuid().parse(id);const draft=this.assetDrafts.get(id);if(!draft)throw new Error('Wycena wygasła. Przygotuj operację ponownie.');const valid=()=>{this.stable(draft.epoch);if(draft.quote.walletId!==this.active().id||draft.quote.expires<Date.now()||draft.quote.network!==this.integrations.network)throw new Error('Sesja lub wycena wygasła.');};
  try{valid();if(!await confirm(draft.quote))throw new Error('Operacja anulowana.');valid();await revalidateAsset(draft.prepared);valid();const seed=this.seed();let signed;try{signed=await signAsset(seed,draft.prepared);}finally{seed.fill(0);}valid();this.assetDrafts.delete(id);
   const operation:AssetOperation={id,walletId:draft.quote.walletId,chain:draft.quote.chain,network:draft.quote.network,title:draft.quote.title,at:Date.now(),hashes:[],createdAddresses:draft.quote.createdAddresses,state:'prepared'};const path=join(this.directory,`asset-operations-${operation.walletId}.json`),history=await this.assetOperations();valid();
   for(let i=0;i<signed.length;i++){try{valid();operation.hashes.push(signed[i].hash);operation.state='unknown';await atomicWrite(path,[operation,...history].slice(0,200));valid();await broadcastAsset(draft.prepared,signed[i],i);operation.state=i===signed.length-1?'broadcast':'partial';await atomicWrite(path,[operation,...history].slice(0,200));}catch{operation.state=i>0?'partial':'unknown';operation.error='Sprawdź zapisane identyfikatory w eksploratorze przed ponowną próbą. Seria została zatrzymana.';await atomicWrite(path,[operation,...history].slice(0,200)).catch(()=>{});return operation;}}
   return operation;
  }finally{this.assetDrafts.delete(id);disposeAsset(draft.prepared);}
 });}
 async assetOperations():Promise<AssetOperation[]>{const wallet=this.active(),epoch=this.epoch;try{const schema=z.array(z.object({id:z.string().uuid(),walletId:z.string().uuid(),chain:z.enum(['ETH','SOL']),network:networkSchema,title:z.string().max(200),at:z.number(),hashes:z.array(z.string().max(128)).max(20),createdAddresses:z.array(z.string().max(128)).max(20),state:z.enum(['prepared','broadcast','partial','unknown']),error:z.string().max(1000).optional()}).strict()).max(200);const result=schema.parse(JSON.parse(await readFile(join(this.directory,`asset-operations-${wallet.id}.json`),'utf8')));this.stable(epoch);return result;}catch(e:any){if(e.code==='ENOENT')return [];throw new Error('Nie można odczytać historii operacji NFT i USDC.');}}
 private requireSession(){if(!this.session)throw new Error('Aplikacja jest zablokowana.');return this.session;}
 private active(){const s=this.requireSession();const wallet=s.collection.wallets.find(w=>w.id===s.collection.activeId);if(!wallet)throw new Error('Dodaj portfel.');return wallet;}
 private seed(){const wallet=this.active();return seedFrom(wallet.mnemonic,wallet.passphrase);}
 private async exclusive<T>(fn:()=>Promise<T>){if(this.busy||this.authBusy)throw new Error('Inna operacja jest w toku.');this.busy=true;try{return await fn();}finally{this.busy=false;}}
 private async firstStore(collection:Collection,pin:string,epoch:number){
  if(existsSync(this.vaultPath))throw new Error('Sejf aplikacji już istnieje.');const state=await newCollection(collection,pin,this.protector);
  try{if(epoch!==this.epoch)throw new Error('Sesja została zablokowana.');await mkdir(this.directory,{recursive:true,mode:0o700});await writeFile(this.vaultPath,JSON.stringify(state.envelope),{flag:'wx',mode:0o600});if(epoch!==this.epoch)throw new Error('Sesja została zablokowana.');this.session={...state,collection};return this.status('testnet');}catch(e){state.key.fill(0);throw e;}
 }
 async initialize(pin:string){pinSchema.parse(pin);if(existsSync(this.legacyPath))throw new Error('Najpierw przenieś istniejący portfel.');return this.exclusive(()=>this.firstStore({wallets:[],activeId:null},pin,this.epoch));}
 async migrate(input:unknown){const data=z.object({password:z.string().min(12).max(256),pin:pinSchema}).strict().parse(input);return this.exclusive(async()=>{const epoch=this.epoch;if(existsSync(this.vaultPath))throw new Error('Migracja została już wykonana.');const secret=await readVault(this.legacyPath,data.password);validateMnemonic(secret.mnemonic);const id=randomUUID();return this.firstStore({wallets:[{id,name:'Portfel 1',...secret,legacyHistory:true}],activeId:id},data.pin,epoch);});}
 generate(){this.requireSession();if(this.busy)throw new Error('Inna operacja jest w toku.');this.pendingMnemonic=generateMnemonic();this.pendingAt=Date.now();return this.pendingMnemonic;}
 async create(input:unknown){const data=walletSchema.extend({word3:z.string(),word8:z.string()}).parse(input);if(!this.pendingMnemonic||Date.now()-this.pendingAt>15*60000)throw new Error('Wygeneruj ponownie frazę.');const words=this.pendingMnemonic.split(' ');if(words[2]!==data.word3.trim().toLowerCase()||words[7]!==data.word8.trim().toLowerCase())throw new Error('Słowo 3 lub 8 nie zgadza się z kopią zapasową.');return this.add({name:data.name,mnemonic:this.pendingMnemonic,passphrase:data.passphrase});}
 async import(input:unknown){const data=walletSchema.extend({mnemonic:z.string().max(512)}).parse(input);return this.add({...data,mnemonic:validateMnemonic(data.mnemonic)});}
 private async add(data:{name:string;mnemonic:string;passphrase:string}){return this.exclusive(async()=>{
  const s=this.requireSession();if(s.collection.wallets.length>=50)throw new Error('Limit: 50 portfeli.');
  if(s.collection.wallets.some(w=>w.mnemonic===data.mnemonic&&w.passphrase.normalize('NFKD')===data.passphrase.normalize('NFKD')))throw new Error('Ten portfel jest już dodany.');
  const id=randomUUID();await this.persist({...s.collection,wallets:[...s.collection.wallets,{id,...data}],activeId:id});this.pendingMnemonic=undefined;return this.status('testnet');
 });}
 private async persist(collection:Collection){const s=this.requireSession(),epoch=this.epoch;const envelope=sealCollection(collection,s.key,s.envelope);await atomicWrite(this.vaultPath,envelope);if(epoch!==this.epoch)throw new Error('Sesja została zablokowana.');s.collection=collection;s.envelope=envelope;this.epoch++;this.clearDrafts();}
 async switchWallet(id:string,network:Network){z.string().uuid().parse(id);network=networkSchema.parse(network);return this.exclusive(async()=>{const s=this.requireSession();if(!s.collection.wallets.some(w=>w.id===id))throw new Error('Nie znaleziono portfela.');if(s.collection.activeId!==id)await this.persist({...s.collection,activeId:id});return this.status(network);});}
 async renameWallet(id:string,name:string,network:Network){z.string().uuid().parse(id);name=z.string().trim().min(1).max(32).parse(name);network=networkSchema.parse(network);return this.exclusive(async()=>{const s=this.requireSession();if(!s.collection.wallets.some(w=>w.id===id))throw new Error('Nie znaleziono portfela.');await this.persist({...s.collection,wallets:s.collection.wallets.map(w=>w.id===id?{...w,name}:w)});return this.status(network);});}
 private async authenticate(pin:string){
  pinSchema.parse(pin);if(this.authBusy)throw new Error('Weryfikacja PIN jest w toku.');this.authBusy=true;
  try{
   let stored:{failures:number;retryAt:number}|undefined;try{stored=z.object({failures:z.number().int().min(0).max(1000),retryAt:z.number().finite().nonnegative()}).parse(JSON.parse(await readFile(this.attemptsPath,'utf8')));}catch(e:any){if(e.code!=='ENOENT')throw new Error('Nie można odczytać limitu prób PIN.');}
   this.failures=stored?.failures||0;this.retryAt=stored?.retryAt||0;
   if(Date.now()<this.retryAt)throw new Error(`Zbyt wiele prób. Spróbuj za ${Math.ceil((this.retryAt-Date.now())/1000)} s.`);
   let state;try{state=await openCollection(JSON.parse(await readFile(this.vaultPath,'utf8')),pin,this.protector);}
   catch(e){this.failures++;this.retryAt=Date.now()+(this.failures<5?1000:Math.min(1800000,60000*2**Math.min(5,this.failures-5)));await atomicWrite(this.attemptsPath,{failures:Math.min(1000,this.failures),retryAt:this.retryAt});throw e;}
   try{await atomicWrite(this.attemptsPath,{failures:0,retryAt:0});}catch(e){state.key.fill(0);throw e;}this.failures=0;return state;
  }finally{this.authBusy=false;}
 }
 async unlock(pin:string,network:Network){network=networkSchema.parse(network);if(this.busy)throw new Error('Inna operacja jest w toku.');const epoch=this.epoch;const state=await this.authenticate(pin);if(epoch!==this.epoch){state.key.fill(0);throw new Error('Sesja została zablokowana.');}this.session?.key.fill(0);this.session=state;this.epoch++;this.clearDrafts();return this.status(network);}
 async changePin(oldPin:string,newPin:string){pinSchema.parse(newPin);return this.exclusive(async()=>{const s=this.requireSession(),epoch=this.epoch;const proof=await this.authenticate(oldPin);proof.key.fill(0);if(epoch!==this.epoch)throw new Error('Sesja została zablokowana.');const replacement=await newCollection(s.collection,newPin,this.protector);try{if(epoch!==this.epoch)throw new Error('Sesja została zablokowana.');await atomicWrite(this.vaultPath,replacement.envelope);if(epoch!==this.epoch)throw new Error('Sesja została zablokowana.');s.key.fill(0);this.session={...replacement,collection:s.collection};this.epoch++;this.clearDrafts();}catch(e){replacement.key.fill(0);throw e;}});}
 lock(){this.epoch++;this.session?.key.fill(0);this.session=undefined;this.pendingMnemonic=undefined;this.clearDrafts();this.activityCache.clear();this.imageCache.clear();}
 async balances(network:Network){network=networkSchema.parse(network);const epoch=this.epoch,seed=this.seed();try{const result=await balances(seed,network);if(epoch!==this.epoch)throw new Error('Aktywny portfel lub sesja uległy zmianie.');return result;}finally{seed.fill(0);}}
 async quote(input:unknown){const data=quoteSchema.parse(input);const epoch=this.epoch,seed=this.seed(),walletId=this.active().id;try{const prepared=await prepare(seed,data.chain,data.network,data.to,data.amount);if(epoch!==this.epoch)throw new Error('Aktywny portfel lub sesja uległy zmianie.');const quote:Quote={id:randomUUID(),walletId,chain:data.chain,network:data.network,networkLabel:accounts(seed,data.network).find(a=>a.chain===data.chain)!.networkLabel,from:prepared.from,to:prepared.to,amount:prepared.amount,fee:prepared.fee,feeLabel:prepared.feeLabel,expires:Date.now()+90000};this.clearDrafts();this.drafts.set(quote.id,{quote,prepared,epoch});return quote;}finally{seed.fill(0);}}
 async send(id:string,confirm:(quote:Quote)=>Promise<boolean>){return this.exclusive(async()=>{
  z.string().uuid().parse(id);const draft=this.drafts.get(id);if(!draft||draft.quote.expires<Date.now())throw new Error('Wycena wygasła. Przygotuj transakcję ponownie.');this.requireSession();
  const valid=()=>{if(draft.epoch!==this.epoch||draft.quote.walletId!==this.active().id||draft.quote.expires<Date.now())throw new Error('Sesja lub wycena wygasła.');};valid();if(!await confirm(draft.quote))throw new Error('Przelew anulowany.');valid();
  const seed=this.seed();let signed;try{signed=await sign(seed,draft.prepared);}finally{seed.fill(0);}valid();this.drafts.delete(id);
  const transfer:Transfer={hash:signed.hash,chain:draft.quote.chain,network:draft.quote.network,to:draft.quote.to,amount:draft.quote.amount,at:Date.now(),explorer:explorer(draft.quote.chain,draft.quote.network,signed.hash),status:'unknown'};
  const path=this.historyPath(),history=await this.history();await atomicWrite(path,[transfer,...history].slice(0,200));valid();
  try{if(await broadcast(draft.prepared,signed)!==signed.hash)throw new Error('Niezgodny hash.');}catch{throw new Error(`Niepewny wynik rozgłoszenia. Sprawdź hash ${signed.hash} w historii i eksploratorze przed ponowną próbą.`);}
  transfer.status='broadcast';await atomicWrite(path,[transfer,...history].slice(0,200)).catch(()=>{});return transfer;
 });}
 private historyPath(){const wallet=this.active();return join(this.directory,wallet.legacyHistory?'transfers.json':`transfers-${wallet.id}.json`);}
 async history():Promise<Transfer[]>{const path=this.historyPath();try{return z.array(transferSchema).max(200).parse(JSON.parse(await readFile(path,'utf8')));}catch(e:any){if(e.code==='ENOENT')return [];throw new Error('Nie można odczytać lokalnej historii przelewów.');}}
 async activity(input:unknown):Promise<ActivityPage>{
  const data=activityInput.parse(input),epoch=this.epoch,wallet=this.active(),publicAccounts=this.status(data.network).accounts;const key=JSON.stringify([wallet.id,data.network,data.chain||'',data.cursor||'']);let cached=this.activityCache.get(key);
  if(!cached||Date.now()-cached.at>30000){if(this.activityCache.size>=24)this.activityCache.clear();cached={at:Date.now(),value:fetchActivity(publicAccounts,data.network,data.chain,data.cursor)};this.activityCache.set(key,cached);}
  const page=await cached.value;if(epoch!==this.epoch)throw new Error('Aktywny portfel lub sesja uległy zmianie.');const local=await this.history();if(epoch!==this.epoch)throw new Error('Aktywny portfel lub sesja uległy zmianie.');return {...page,items:mergeLocalActivity(page.items,local.filter(t=>!data.chain||t.chain===data.chain),publicAccounts,data.network)};
 }
 async reveal(pin:string){this.requireSession();const epoch=this.epoch;const proof=await this.authenticate(pin);proof.key.fill(0);if(epoch!==this.epoch)throw new Error('Sesja została zmieniona.');const {mnemonic,passphrase}=this.active();return {mnemonic,passphrase};}
}
