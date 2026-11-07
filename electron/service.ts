import {Contract,formatEther,formatUnits,Transaction as EvmTransaction} from 'ethers';
import {ethereum,checkEthereum,checkSolana,solana} from './assets/config';
import {CommunityStore} from './community/store';
import {USDC as importUSDC,ERC20,ERC721,ERC1155} from './assets/config';
import {paymentSchema,type PaymentCard} from '../shared/payment';
import {verifyPayment} from './chat/payments';
import {robinhoodView,robinhoodHistory,readImports,saveImports} from './assets/robinhood';
import {createMetadata} from './assets/creation';
import {readActivityCache,writeActivityCache,mergeActivityCache} from './activity-cache';
import {verifyNftOwnership} from './assets/nfts';
import {verifyProfile} from './chat/protocol';
import {ChatStore} from './chat/store';
import {chatCommandSchema} from './chat/commands';
import {newBinding,statement,verifyInvitation,exportKey,importKey} from './chat/protocol';
import {generateSecretKey,getPublicKey} from 'nostr-tools/pure';
import { existsSync } from 'node:fs';
import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import {createHash} from 'node:crypto';
import {remoteBytes,remoteMetadata} from './assets/remote';
import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { generateMnemonic, validateMnemonic, seedFrom, accounts, ethKey } from './keys';
import { atomicWrite, readVault } from './vault';
import { newCollection, openCollection, sealCollection, pinSchema, type Collection, type DeviceProtector, type Envelope } from './app-vault';
import { balances, prepare, sign, broadcast, explorer,revalidateNative, type Prepared } from './chains';
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
const quoteSchema=z.object({chain:z.enum(['SOL','ETH','BTC','RH']),network:networkSchema,to:z.string().min(1).max(128),amount:z.string().max(40)}).strict();
const transferSchema=z.object({hash:z.string(),chain:z.enum(['SOL','ETH','BTC','RH']),network:networkSchema,to:z.string(),amount:z.string(),at:z.number(),explorer:z.string(),status:z.enum(['broadcast','unknown'])});
type Session={collection:Collection;key:Buffer;envelope:Envelope};
export class WalletService {
 readonly integrations:Integrations;
 private chatStore?:InstanceType<typeof ChatStore>; private chatOpening?:Promise<InstanceType<typeof ChatStore>>; private chatDraining=Promise.resolve();
 private communityStore?:CommunityStore;private communityOpening?:Promise<CommunityStore>;
 private closeChat(){this.communityStore?.close();this.communityStore=undefined;this.communityOpening=undefined;if(this.chatStore)this.chatDraining=this.chatStore.close();this.chatStore=undefined;this.chatOpening=undefined;}
 private chatDrafts=new Map<string,{address:string;publicKey:string;walletId:string;intent:any}>();
 private assetDrafts=new Map<string,{quote:AssetQuote;prepared:AssetPrepared;epoch:number}>();
 private nftCache=new Map<string,{at:number;promise:Promise<import('./assets/types').NftPage>}>();
 private imageCache=new Map<string,{at:number;promise:Promise<string>}>();
 private vaultPath:string;private legacyPath:string;private attemptsPath:string;
 private session?:Session;private pendingMnemonic?:string;private pendingAt=0;
 private epoch=0;private busy=false;private authBusy=false;private failures=0;private retryAt=0;
 private activitySerial:Promise<unknown>=Promise.resolve();
 private activityCache=new Map<string,{at:number;value:Promise<ActivityPage>}>();
 private drafts=new Map<string,{quote:Quote;prepared:Prepared;epoch:number}>();
 constructor(private directory:string,private protector:DeviceProtector,private chatRelayFactory?:any,private chatImageProcessor?:(input:string,avatar?:boolean)=>string){this.integrations=new Integrations(directory,protector);this.vaultPath=join(directory,'app.vault');this.legacyPath=join(directory,'wallet.vault');this.attemptsPath=join(directory,'pin-attempts.json');}
 status(network:Network):Status{network=networkSchema.parse(network);const active=this.session?.collection.wallets.find(w=>w.id===this.session!.collection.activeId);let derived:ReturnType<typeof accounts>=[];if(active){const seed=seedFrom(active.mnemonic,active.passphrase);try{derived=accounts(seed,network);}finally{seed.fill(0);}}return {exists:existsSync(this.vaultPath)||existsSync(this.legacyPath),needsMigration:!existsSync(this.vaultPath)&&existsSync(this.legacyPath),unlocked:!!this.session,accounts:derived,wallets:this.session?.collection.wallets.map(({id,name})=>({id,name}))||[],activeWalletId:this.session?.collection.activeId||null};}
 private clearDrafts(){this.chatDrafts.clear();this.drafts.clear();for(const draft of this.assetDrafts.values())disposeAsset(draft.prepared);this.assetDrafts.clear();}
 private stable(epoch:number){this.requireSession();if(epoch!==this.epoch)throw new Error('Aktywny portfel lub sesja uległy zmianie.');}
 async configure(raw:unknown){const input=z.object({network:networkSchema.optional(),language:z.enum(['pl','en']).optional()}).strict().parse(raw);if(input.language)this.integrations.language=input.language;if(input.network!==undefined)await this.exclusive(async()=>{this.requireSession();if(input.network!==this.integrations.network){this.integrations.network=input.network!;this.closeChat();this.epoch++;this.clearDrafts();this.activityCache.clear();this.nftCache.clear();this.imageCache.clear();}});}
 async integrationStatus(){this.requireSession();const epoch=this.epoch;const result=await this.integrations.status();this.stable(epoch);return result;}
 async saveIntegrations(raw:unknown){return this.exclusive(async()=>{this.requireSession();const epoch=this.epoch;const result=await this.integrations.save(raw);this.stable(epoch);this.clearDrafts();this.nftCache.clear();return result;});}
 async nfts(raw:unknown){const input=nftQuerySchema.parse(raw),epoch=this.epoch;const account=this.status(input.network).accounts.find(a=>a.chain===(input.chain==='RH'?'ETH':input.chain));this.requireSession();if(!account)throw Error('Dodaj portfel.');const id=this.active().id,key=JSON.stringify([id,account.address,input]);let cached=this.nftCache.get(key);if(!cached||Date.now()-cached.at>30000){if(this.nftCache.size>=24)this.nftCache.clear();cached={at:Date.now(),promise:(async()=>{const keys=await this.integrations.keys();if(input.mode==='explore')return fetchNfts(input,account.address,keys);let page:import('./assets/types').NftPage={items:[]};if(input.chain!=='RH'){try{page=await fetchNfts(input,account.address,keys);}catch(e){page.warning=(e as Error).message;}}else page.warning='Robinhood: tylko zaimportowane i utworzone NFT; brak kompletnego indeksu.';if(input.cursor)return page;
 const imports=input.chain==='RH'?(await readImports(this.directory,id,input.network)).nfts:[];const created=(await this.assetOperations()).filter(o=>o.chain===input.chain&&o.network===input.network).flatMap(o=>o.createdAddresses.map(address=>({address,...input.chain==='SOL'?{}:{tokenId:'1'}})));const local=[...new Map([...imports,...created].map(n=>[(input.chain==='SOL'?n.address:n.address.toLowerCase())+':'+n.tokenId,n])).values()].slice(-30);const results=await Promise.allSettled(local.map(async n=>{const found=await fetchNfts({...input,mode:'explore',scope:'asset',query:n.address,tokenId:n.tokenId},account.address,keys);if(!found.items[0])throw Error();await verifyNftOwnership(found.items[0],account.address,keys);return {...found.items[0],owned:true,transferable:true};}));this.stable(epoch);return {...page,items:[...new Map([...page.items,...results.flatMap(r=>r.status==='fulfilled'?[r.value]:[])].map(n=>[n.chain+':'+(input.chain==='SOL'?n.address:n.address.toLowerCase())+':'+n.tokenId,n])).values()]};})().catch(e=>{this.nftCache.delete(key);throw e;})};this.nftCache.set(key,cached);}const result=await cached.promise;this.stable(epoch);return structuredClone(result);}
 async nftFileHash(raw:unknown){const input=z.object({uri:z.string().max(7*1024*1024),hash:z.string().regex(/^[a-f0-9]{64}$/)}).strict().parse(raw);this.requireSession();const epoch=this.epoch,{bytes}=await remoteBytes(input.uri,5*1024*1024);this.stable(epoch);const hash=createHash('sha256').update(bytes).digest('hex');return {hash,matches:hash===input.hash,size:bytes.length};}
 async nftImage(uri:string,retry=false){uri=z.string().max(1500000).parse(uri);this.requireSession();const epoch=this.epoch,key=this.active().id+':'+this.integrations.network+':'+uri;const old=this.imageCache.get(key);if(old&&!retry&&Date.now()-old.at<300000)return old.promise;const promise=remoteImage(uri).then(result=>{this.stable(epoch);return result;}).catch(e=>{this.imageCache.delete(key);throw e;});if(this.imageCache.size>=32)this.imageCache.delete(this.imageCache.keys().next().value!);this.imageCache.set(key,{at:Date.now(),promise});return promise;}

 private async openCommunity(walletId:string){await this.openChat(walletId);if(this.communityStore)return this.communityStore;if(this.communityOpening)return this.communityOpening;const epoch=this.epoch;this.communityOpening=(async()=>{const key=Uint8Array.from(Buffer.from(this.active().chatSecretKey!,'hex'));const store=new CommunityStore(this.directory,walletId,key,()=>this.stable(epoch));key.fill(0);try{await store.load();this.stable(epoch);this.communityStore=store;store.start();return store;}catch(e){store.close();throw e;}finally{this.communityOpening=undefined;}})();return this.communityOpening;}
 async community(raw:unknown){const input=z.object({walletId:z.string().uuid(),action:z.enum(['view','post','older','online','mute','unmute','report']),text:z.string().max(1600).optional(),parent:z.string().regex(/^[a-f0-9]{64}$/).optional(),id:z.string().regex(/^[a-f0-9]{64}$/).optional(),online:z.boolean().optional()}).strict().parse(raw);if(this.active().id!==input.walletId||!this.active().chatSecretKey)throw Error('Najpierw aktywuj czat dla tego portfela.');const epoch=this.epoch,store=await this.openCommunity(input.walletId);this.stable(epoch);switch(input.action){case 'post':await store.post(input.text!,input.parent);break;case 'older':await store.older();break;case 'online':await store.setOnline(input.online===true);break;case 'mute':case 'unmute':case 'report':await store.moderate(input.action,input.id!);break;}this.stable(epoch);return store.view();}
 private async paymentNotices(){const path=join(this.directory,`payments-${this.active().id}.vault`);let rows:any[]=[];try{rows=JSON.parse(await this.protector.open(Buffer.from(JSON.parse(await readFile(path,'utf8')).sealed,'base64')));if(!Array.isArray(rows)||rows.length>500)throw Error();}catch(e:any){if(e.code!=='ENOENT')throw Error('Nie można odczytać kart przelewów.');}return {path,rows};}
 private async recordPayment(id:string,hash:string,from:string){const draft=this.chatDrafts.get(id);if(!draft)return;const intent=draft.intent;const asset=intent.kind==='native'?{kind:'native',amount:intent.amount}:intent.kind==='usdc'?{kind:'token',address:importUSDC[intent.network as Network].ETH,amount:intent.amount}:intent.kind==='token'?{kind:'token',address:intent.address,amount:intent.amount}:{kind:'nft',address:intent.address,standard:intent.standard,tokenId:intent.tokenId,amount:intent.amount};const payment=paymentSchema.parse({version:1,chain:intent.chain,network:intent.network,hash,from,to:draft.address,asset});const {path,rows}=await this.paymentNotices();if(!rows.some(r=>r.payment.hash===hash))rows.push({address:draft.address,payment,published:false});await atomicWrite(path,{version:1,sealed:(await this.protector.seal(JSON.stringify(rows.slice(-500)))).toString('base64')});}
 private checkChatDraft(id:string){const draft=this.chatDrafts.get(id);if(!draft)return;const contact=this.chatStore?.view().contacts.find((c:any)=>c.invitation.binding.address===draft.address);if(draft.walletId!==this.active().id||!contact||contact.blocked||contact.pending||contact.invitation.binding.publicKey!==draft.publicKey)throw Error('Kontakt lub portfel zmienił się. Przygotuj przelew ponownie.');verifyInvitation(contact.invitation);}
 async networkAssets(raw:unknown){return this.exclusive(async()=>{const input=z.object({action:z.enum(['view','import-token','import-nft','history']),network:networkSchema,address:z.string().max(42).optional(),tokenId:z.string().regex(/^\d{1,78}$/).optional(),cursor:z.string().max(2048).optional()}).strict().parse(raw),epoch=this.epoch,id=this.active().id,address=this.status(input.network).accounts.find(a=>a.chain==='ETH')!.address;const imports=await readImports(this.directory,id,input.network);if(input.action==='history'){const result=await robinhoodHistory(input.network,address,input.cursor);this.stable(epoch);return result;}
 if(input.action==='import-token'){const result=await robinhoodView(input.network,address,[input.address!]);if(result.tokens[0]?.error)throw Error('Nieprawidłowy kontrakt ERC-20 w wybranej sieci.');this.stable(epoch);imports.tokens=[...new Set([...imports.tokens,input.address!])];await saveImports(this.directory,id,input.network,imports);}
 if(input.action==='import-nft'){const page=await fetchNfts({chain:'RH',network:input.network,mode:'explore',query:input.address,tokenId:input.tokenId},address,{});await verifyNftOwnership(page.items[0],address,{});this.stable(epoch);imports.nfts=[...new Map([...imports.nfts,{address:input.address!,tokenId:input.tokenId!}].map(n=>[n.address.toLowerCase()+':'+n.tokenId,n])).values()];await saveImports(this.directory,id,input.network,imports);this.nftCache.clear();}
 const result=await robinhoodView(input.network,address,imports.tokens);this.stable(epoch);return {...result,address};});}
 async creation(raw:unknown){return this.exclusive(async()=>{const s=this.requireSession(),epoch=this.epoch,walletId=this.active().id,path=join(this.directory,`creation-${walletId}.vault`);const input=z.object({action:z.enum(['prepare','list','recover','status']),id:z.string().uuid().optional(),file:z.unknown().optional(),chain:z.enum(['ETH','SOL','RH']).optional(),network:networkSchema.optional()}).strict().parse(raw);
 let rows:any[]=[];try{rows=JSON.parse(await this.protector.open(Buffer.from(JSON.parse(await readFile(path,'utf8')).sealed,'base64')));if(!Array.isArray(rows))throw Error();}catch(e:any){if(e.code!=='ENOENT')throw Error('Nie można odczytać operacji tworzenia NFT.');}
 if(input.action==='list')return rows.map(({signed,...r})=>({...r,hasSigned:!!signed}));
 if(input.action==='status'){
 const row=rows.find(r=>r.id===input.id);if(!row)throw Error('Nie znaleziono zapisanej operacji NFT.');if(row.network!==this.integrations.network)throw Error('Wybierz środowisko zapisanej operacji.');if(!row.signed)return {state:row.state,hash:null,addresses:[],message:row.operationId?'Przerwano podpisywanie. Sprawdź historię; automatyczny nowy mint jest zablokowany.':'Plik i metadane zapisane. Mintowanie nie zostało podpisane.'};let state='pending',message='Oczekiwanie na potwierdzenie w sieci.';const history=await this.assetOperations(),addresses=row.createdAddresses||history.find(r=>r.id===row.operationId)?.createdAddresses||[];
 if(row.chain!=='SOL'){const p=ethereum(row.network,row.chain);try{await checkEthereum(p,row.network,row.chain);const receipt=await p.getTransactionReceipt(row.signed.hash);if(receipt){const block=await p.getBlock(receipt.blockNumber);if(block?.hash!==receipt.blockHash){state='unknown';message='Zmienił się blok transakcji. Sprawdź ponownie.';}else if(receipt.status===0){state='failed';message='Kontrakt odrzucił transakcję. Sprawdź eksplorator przed nową operacją.';}else{state='confirmed';message='Mintowanie potwierdzone w sieci.';if(receipt.contractAddress&&!addresses.length)addresses.push(receipt.contractAddress);}}}finally{p.destroy();}}
 else{const p=solana(row.network,await this.integrations.keys());await checkSolana(p,row.network);const status=(await p.getSignatureStatuses([row.signed.hash],{searchTransactionHistory:true})).value[0];if(status?.err){state='failed';message='Program Solana odrzucił transakcję.';}else if(status?.confirmationStatus==='confirmed'||status?.confirmationStatus==='finalized'){state='confirmed';message='Mintowanie potwierdzone w Solana.';}else if(!status&&await p.getBlockHeight()>row.signed.lastValidBlockHeight){state='expired';message='Podpis wygasł lub historia RPC jest niedostępna. Sprawdź eksplorator; nie tworzymy automatycznie drugiego NFT.';}}
 this.stable(epoch);let metadata='unchecked',metadataError='';if(state==='confirmed'){try{const value=await remoteMetadata(row.uri);if(value.properties?.frame_original?.hash!==row.hash)throw Error('Hash w metadanych nie pasuje do oryginału.');metadata='available';}catch(e){metadata='unavailable';metadataError=(e as Error).message;}row.state=state;row.createdAddresses=addresses;await atomicWrite(path,{version:1,sealed:(await this.protector.seal(JSON.stringify(rows))).toString('base64')});this.nftCache.clear();}this.stable(epoch);return {state,hash:row.signed.hash,chain:row.chain,network:row.network,addresses,tokenId:row.chain==='SOL'?undefined:'1',uri:row.uri,metadata,metadataError,message};
 }
 if(input.action==='recover'){const row=rows.find(r=>r.id===input.id);if(!row?.signed||!row.operationId)throw Error('Brak zapisanego podpisu. Sprawdź historię przed kolejnym mintowaniem.');if(row.network!==this.integrations.network)throw Error('Wybierz środowisko zapisanej operacji.');this.stable(epoch);
 if(row.chain!=='SOL'){const tx=EvmTransaction.from(row.signed.raw),p=ethereum(row.network,row.chain);try{await checkEthereum(p,row.network,row.chain);if(tx.hash!==row.signed.hash||tx.from?.toLowerCase()!==this.status(row.network).accounts.find(a=>a.chain==='ETH')!.address.toLowerCase())throw Error('Podpis nie pasuje do operacji.');const existing=await p.getTransactionReceipt(tx.hash!);this.stable(epoch);if(existing?.status===0)throw Error('Transakcja została wykonana z błędem. Nie ponawiaj mintowania automatycznie.');if(!existing){this.stable(epoch);await p.broadcastTransaction(row.signed.raw);}}finally{p.destroy();}}
 else{const p=solana(row.network,await this.integrations.keys());await checkSolana(p,row.network);const status=(await p.getSignatureStatuses([row.signed.hash],{searchTransactionHistory:true})).value[0];this.stable(epoch);if(status?.err)throw Error('Transakcja Solana zakończona błędem.');if(!status){if(await p.getBlockHeight()>row.signed.lastValidBlockHeight)throw Error('Podpis Solana wygasł; wymagane sprawdzenie historii, bez automatycznego nowego mintu.');this.stable(epoch);await p.sendRawTransaction(Buffer.from(row.signed.raw,'base64'),{skipPreflight:false,maxRetries:3});}}
 this.stable(epoch);return {id:row.operationId,hash:row.signed.hash,message:'Ponowiono wyłącznie identyczną podpisaną transakcję. Sprawdź potwierdzenie w sieci.'};}

 if(!input.chain||!input.network)throw Error('Wybierz sieć tworzenia NFT.');if(input.network!==this.integrations.network)throw Error('Zmieniono środowisko sieciowe.');const result=await createMetadata(input.file,await this.integrations.keys());this.stable(epoch);
 if(input.chain==='SOL'&&result.uri.length>200)throw Error('Solana wymaga krótkiego URI: wybierz zapis IPFS. Plik nie został zmintowany.');
 const row={...result,id:randomUUID(),walletId,chain:input.chain,network:input.network,at:Date.now(),state:'stored'};rows.unshift(row);await atomicWrite(path,{version:1,sealed:(await this.protector.seal(JSON.stringify(rows.slice(0,50)))).toString('base64')});return row;});}
 private async bindCreation(intent:any,quoteId:string){if(intent.kind!=='mint'||!intent.creationId)return;const path=join(this.directory,`creation-${this.active().id}.vault`);const rows=JSON.parse(await this.protector.open(Buffer.from(JSON.parse(await readFile(path,'utf8')).sealed,'base64')));const row=rows.find((r:any)=>r.id===intent.creationId);if(!row||row.uri!==intent.uri||row.chain!==intent.chain||row.network!==intent.network)throw Error('Operacja tworzenia nie pasuje do wyceny.');if(row.operationId)throw Error('Mintowanie tej operacji już rozpoczęto. Sprawdź historię, nie twórz duplikatu.');row.quoteId=quoteId;await atomicWrite(path,{version:1,sealed:(await this.protector.seal(JSON.stringify(rows))).toString('base64')});}
 private async recordCreationSigned(prepared:AssetPrepared,id:string,signed:{raw:string;hash:string}){const intent=prepared.intent;if(intent.kind!=='mint'||!intent.creationId)return;const path=join(this.directory,`creation-${this.active().id}.vault`);const rows=JSON.parse(await this.protector.open(Buffer.from(JSON.parse(await readFile(path,'utf8')).sealed,'base64')));const row=rows.find((r:any)=>r.id===intent.creationId);if(!row||row.operationId!==id)throw Error('Nieprawidłowa operacja tworzenia.');row.createdAddresses=prepared.createdAddresses;row.signed={...signed,...prepared.payload.kind==='sol'?{lastValidBlockHeight:prepared.payload.lastValidBlockHeight}:{}};row.state='signed';await atomicWrite(path,{version:1,sealed:(await this.protector.seal(JSON.stringify(rows))).toString('base64')});}
 private async claimCreation(intent:any,id:string){if(intent.kind!=='mint'||!intent.creationId)return;const path=join(this.directory,`creation-${this.active().id}.vault`);const rows=JSON.parse(await this.protector.open(Buffer.from(JSON.parse(await readFile(path,'utf8')).sealed,'base64')));const row=rows.find((r:any)=>r.id===intent.creationId);if(!row||row.operationId||row.quoteId!==id)throw Error('Ta operacja NFT jest już rozpoczęta.');row.operationId=id;row.state='signing';await atomicWrite(path,{version:1,sealed:(await this.protector.seal(JSON.stringify(rows))).toString('base64')});}
 async uploadMetadata(raw:MetadataUpload){this.requireSession();const epoch=this.epoch;const result=await uploadMetadata(raw,await this.integrations.keys());this.stable(epoch);return result;}
 async usdc(network:Network){network=networkSchema.parse(network);const epoch=this.epoch,seed=this.seed();try{const result=await usdcBalances(seed,network,await this.integrations.keys());this.stable(epoch);return result;}finally{seed.fill(0);}}
 async assetQuote(input:unknown){return this.exclusive(async()=>{const epoch=this.epoch,walletId=this.active().id,seed=this.seed();let prepared:AssetPrepared|undefined;try{prepared=await prepareAsset(seed,input,await this.integrations.keys());this.stable(epoch);if(prepared.intent.network!==this.integrations.network)throw new Error('Zmieniono środowisko sieciowe. Przygotuj operację ponownie.');this.clearDrafts();const quote:AssetQuote={id:randomUUID(),walletId,chain:prepared.intent.chain,network:prepared.intent.network,from:prepared.from,to:prepared.to,title:prepared.title,details:prepared.details,fee:prepared.fee,feeLabel:prepared.feeLabel,createdAddresses:prepared.createdAddresses,transactions:prepared.payload.kind==='evm'?1:prepared.payload.txs.length,expires:Date.now()+90000};await this.bindCreation(prepared.intent,quote.id);this.assetDrafts.set(quote.id,{quote,prepared,epoch});return quote;}catch(e){if(prepared)disposeAsset(prepared);throw e;}finally{seed.fill(0);}});}
 async assetSend(id:string,confirm:(quote:AssetQuote)=>Promise<boolean>){return this.exclusive(async()=>{z.string().uuid().parse(id);const draft=this.assetDrafts.get(id);if(!draft)throw new Error('Wycena wygasła. Przygotuj operację ponownie.');const valid=()=>{this.stable(draft.epoch);if(draft.quote.walletId!==this.active().id||draft.quote.expires<Date.now()||draft.quote.network!==this.integrations.network)throw new Error('Sesja lub wycena wygasła.');};
  try{valid();this.checkChatDraft(id);if(!await confirm(draft.quote))throw new Error('Operacja anulowana.');valid();this.checkChatDraft(id);await revalidateAsset(draft.prepared);valid();await this.claimCreation(draft.prepared.intent,id);valid();const seed=this.seed();let signed;try{signed=await signAsset(seed,draft.prepared);}finally{seed.fill(0);}valid();this.assetDrafts.delete(id);
   const operation:AssetOperation={id,walletId:draft.quote.walletId,chain:draft.quote.chain,network:draft.quote.network,title:draft.quote.title,at:Date.now(),hashes:[],createdAddresses:draft.quote.createdAddresses,state:'prepared'};const path=join(this.directory,`asset-operations-${operation.walletId}.json`),history=await this.assetOperations();valid();
   for(let i=0;i<signed.length;i++){try{valid();operation.hashes.push(signed[i].hash);operation.state='unknown';await this.recordCreationSigned(draft.prepared,id,signed[i]);valid();await this.recordPayment(id,signed[i].hash,draft.quote.from);valid();await atomicWrite(path,[operation,...history].slice(0,200));valid();await broadcastAsset(draft.prepared,signed[i],i);operation.state=i===signed.length-1?'broadcast':'partial';await atomicWrite(path,[operation,...history].slice(0,200));}catch(e:any){operation.state=i>0?'partial':'unknown';operation.error='Rozgłoszenie niepotwierdzone: '+String(e.shortMessage||e.message||'Brak odpowiedzi RPC.').slice(0,400)+' Sprawdź zapisany hash. Ponów wyłącznie tę samą podpisaną transakcję.';await atomicWrite(path,[operation,...history].slice(0,200)).catch(()=>{});return operation;}}
   return operation;
  }finally{this.assetDrafts.delete(id);disposeAsset(draft.prepared);}
 });}
 async assetOperations():Promise<AssetOperation[]>{const wallet=this.active(),epoch=this.epoch;try{const schema=z.array(z.object({id:z.string().uuid(),walletId:z.string().uuid(),chain:z.enum(['ETH','SOL','RH']),network:networkSchema,title:z.string().max(200),at:z.number(),hashes:z.array(z.string().max(128)).max(20),createdAddresses:z.array(z.string().max(128)).max(20),state:z.enum(['prepared','broadcast','partial','unknown']),error:z.string().max(1000).optional()}).strict()).max(200);const result=schema.parse(JSON.parse(await readFile(join(this.directory,`asset-operations-${wallet.id}.json`),'utf8')));this.stable(epoch);return result;}catch(e:any){if(e.code==='ENOENT')return [];throw new Error('Nie można odczytać historii operacji NFT i USDC.');}}
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
 private async persist(collection:Collection){const s=this.requireSession(),epoch=this.epoch;const envelope=sealCollection(collection,s.key,s.envelope);await atomicWrite(this.vaultPath,envelope);if(epoch!==this.epoch)throw new Error('Sesja została zablokowana.');s.collection=collection;s.envelope=envelope;this.closeChat();this.epoch++;this.nftCache.clear();this.imageCache.clear();this.clearDrafts();}
 async switchWallet(id:string,network:Network){z.string().uuid().parse(id);network=networkSchema.parse(network);return this.exclusive(async()=>{const s=this.requireSession();if(!s.collection.wallets.some(w=>w.id===id))throw new Error('Nie znaleziono portfela.');if(s.collection.activeId!==id)await this.persist({...s.collection,activeId:id});return this.status(network);});}
 async renameWallet(id:string,name:string,network:Network){z.string().uuid().parse(id);name=z.string().trim().min(1).max(32).parse(name);network=networkSchema.parse(network);return this.exclusive(async()=>{const s=this.requireSession();if(!s.collection.wallets.some(w=>w.id===id))throw new Error('Nie znaleziono portfela.');await this.persist({...s.collection,wallets:s.collection.wallets.map(w=>w.id===id?{...w,name}:w)});if(this.active().id===id&&this.active().chatSecretKey)await this.openChat(id);return this.status(network);});}
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
 async unlock(pin:string,network:Network){network=networkSchema.parse(network);if(this.busy)throw new Error('Inna operacja jest w toku.');const epoch=this.epoch;const state=await this.authenticate(pin);if(epoch!==this.epoch){state.key.fill(0);throw new Error('Sesja została zablokowana.');}this.session?.key.fill(0);this.session=state;this.closeChat();this.epoch++;this.clearDrafts();return this.status(network);}
 async changePin(oldPin:string,newPin:string){pinSchema.parse(newPin);return this.exclusive(async()=>{const s=this.requireSession(),epoch=this.epoch;const proof=await this.authenticate(oldPin);proof.key.fill(0);if(epoch!==this.epoch)throw new Error('Sesja została zablokowana.');const replacement=await newCollection(s.collection,newPin,this.protector);try{if(epoch!==this.epoch)throw new Error('Sesja została zablokowana.');await atomicWrite(this.vaultPath,replacement.envelope);if(epoch!==this.epoch)throw new Error('Sesja została zablokowana.');s.key.fill(0);this.session={...replacement,collection:s.collection};this.closeChat();this.epoch++;this.clearDrafts();}catch(e){replacement.key.fill(0);throw e;}});}
 lock(){this.closeChat();this.epoch++;this.session?.key.fill(0);this.session=undefined;this.pendingMnemonic=undefined;this.clearDrafts();this.activityCache.clear();this.nftCache.clear();this.imageCache.clear();}
 async balances(network:Network){network=networkSchema.parse(network);const epoch=this.epoch,seed=this.seed();try{const result=await balances(seed,network);if(epoch!==this.epoch)throw new Error('Aktywny portfel lub sesja uległy zmianie.');return result;}finally{seed.fill(0);}}
 async quote(input:unknown){const data=quoteSchema.parse(input);const epoch=this.epoch,seed=this.seed(),walletId=this.active().id;try{const prepared=await prepare(seed,data.chain,data.network,data.to,data.amount);if(epoch!==this.epoch)throw new Error('Aktywny portfel lub sesja uległy zmianie.');const quote:Quote={id:randomUUID(),walletId,chain:data.chain,network:data.network,networkLabel:data.chain==='RH'?`Robinhood Chain ${data.network}`:accounts(seed,data.network).find(a=>a.chain===data.chain)!.networkLabel,from:prepared.from,to:prepared.to,amount:prepared.amount,fee:prepared.fee,feeLabel:prepared.feeLabel,expires:Date.now()+90000};this.clearDrafts();this.drafts.set(quote.id,{quote,prepared,epoch});return quote;}finally{seed.fill(0);}}
 async send(id:string,confirm:(quote:Quote)=>Promise<boolean>){return this.exclusive(async()=>{
  z.string().uuid().parse(id);const draft=this.drafts.get(id);if(!draft||draft.quote.expires<Date.now())throw new Error('Wycena wygasła. Przygotuj transakcję ponownie.');this.requireSession();
  const valid=()=>{if(draft.epoch!==this.epoch||draft.quote.walletId!==this.active().id||draft.quote.expires<Date.now())throw new Error('Sesja lub wycena wygasła.');};valid();this.checkChatDraft(id);if(!await confirm(draft.quote))throw new Error('Przelew anulowany.');valid();this.checkChatDraft(id);await revalidateNative(draft.prepared);valid();
  const seed=this.seed();let signed;try{signed=await sign(seed,draft.prepared);}finally{seed.fill(0);}valid();this.drafts.delete(id);
  await this.recordPayment(id,signed.hash,draft.quote.from);valid();const transfer:Transfer={hash:signed.hash,chain:draft.quote.chain,network:draft.quote.network,to:draft.quote.to,amount:draft.quote.amount,at:Date.now(),explorer:explorer(draft.quote.chain,draft.quote.network,signed.hash),status:'unknown'};
  const path=this.historyPath(),history=await this.history();await atomicWrite(path,[transfer,...history].slice(0,200));valid();
  try{if(await broadcast(draft.prepared,signed)!==signed.hash)throw new Error('Niezgodny hash.');}catch{throw new Error(`Niepewny wynik rozgłoszenia. Sprawdź hash ${signed.hash} w historii i eksploratorze przed ponowną próbą.`);}
  transfer.status='broadcast';await atomicWrite(path,[transfer,...history].slice(0,200)).catch(()=>{});return transfer;
 });}
 private historyPath(){const wallet=this.active();return join(this.directory,wallet.legacyHistory?'transfers.json':`transfers-${wallet.id}.json`);}
 async history():Promise<Transfer[]>{const path=this.historyPath();try{return z.array(transferSchema).max(200).parse(JSON.parse(await readFile(path,'utf8')));}catch(e:any){if(e.code==='ENOENT')return [];throw new Error('Nie można odczytać lokalnej historii przelewów.');}}
 async activity(input:unknown):Promise<ActivityPage>{
  const data=activityInput.parse(input),epoch=this.epoch,wallet=this.active(),publicAccounts=this.status(data.network).accounts;const key=JSON.stringify([wallet.id,data.network,data.chain||'',data.cursor||'']);let cached=this.activityCache.get(key);
  if(!cached||Date.now()-cached.at>30000){if(this.activityCache.size>=24)this.activityCache.clear();cached={at:Date.now(),value:fetchActivity(publicAccounts,data.network,data.chain,data.cursor)};this.activityCache.set(key,cached);}
  const page=await cached.value;this.stable(epoch);const local=await this.history();this.stable(epoch);
  const path=join(this.directory,`activity-${wallet.id}-${data.network}.vault`),identity={walletId:wallet.id,network:data.network,addresses:publicAccounts.map(a=>a.chain+':'+a.address).sort().join('|')};
  const task=this.activitySerial.then(async()=>{this.stable(epoch);const old=await readActivityCache(path,this.protector,wallet.id,data.network,identity.addresses);this.stable(epoch);const merged=mergeActivityCache(old,page,identity,data.chain,data.cursor);await writeActivityCache(path,merged,this.protector);this.stable(epoch);return {...merged.page,items:mergeLocalActivity(merged.page.items.filter(x=>!data.chain||x.chain===data.chain),local.filter(t=>!data.chain||t.chain===data.chain),publicAccounts,data.network)};});this.activitySerial=task.catch(()=>{});return task;
 }
  async openChat(walletId:string):Promise<InstanceType<typeof ChatStore>> {
    const epoch = this.epoch, active = this.active();
    if (active.id !== walletId) throw new Error("Aktywny portfel uleg\u0142 zmianie.");
    if (this.chatStore) return this.chatStore;
    if (this.chatOpening) return this.chatOpening;
    const opening = (async () => {
      await this.chatDraining;
      this.stable(epoch);
      const key2 = active.chatSecretKey ? Uint8Array.from(Buffer.from(active.chatSecretKey, "hex")) : void 0;
      if (!key2) throw new Error("Najpierw aktywuj czat.");
      const address2 = this.status("mainnet").accounts.find((a) => a.chain === "ETH")!.address;
      const store = new ChatStore(join(this.directory, `chat-${walletId}-${getPublicKey(key2)}.vault`), key2, walletId, address2, () => {
        this.stable(epoch);
        if (this.active().id !== walletId) throw new Error("Aktywny portfel uleg\u0142 zmianie.");
      }, this.chatRelayFactory);
      key2.fill(0);
      try {
        const loaded=await store.load();
        if(loaded){const current=store.identity().profile;const data=current?verifyProfile(current,store.pubkey):{version:1};if(!('independent' in data&&data.independent))await store.updateProfile({...data,name:active.name});}
        this.stable(epoch);
        this.chatStore = store;
        return store;
      } catch (e) {
        store.close();
        throw e;
      }
    })();
    this.chatOpening = opening;
    try {
      return await opening;
    } finally {
      if (this.chatOpening === opening) this.chatOpening = void 0;
    }
  }
  async chat(raw:unknown, confirm:(text:string)=>Promise<boolean>) {
    const input = chatCommandSchema.parse(raw);
    const wallet2 = this.active();
    if (wallet2.id !== input.walletId) throw new Error("Aktywny portfel uleg\u0142 zmianie.");
    if (input.action === "view" && !wallet2.chatSecretKey) return { active: false, address: this.status("mainnet").accounts.find((a) => a.chain === "ETH")!.address, connection: "brak po\u0142\u0105czenia", relays: [], contacts: [], messages: [] };
    if (input.action === "activate" || input.action === "import") return this.exclusive(async () => {
      const epoch2 = this.epoch;
      let key2:Uint8Array|undefined,recoveredIdentity:ReturnType<typeof verifyInvitation>|undefined;
      try {
        if (input.action === "import") {
          const proof = await this.authenticate(input.pin);
          proof.key.fill(0);
          this.stable(epoch2);
          const imported = importKey(input.backup, input.password);
          key2 = imported.key;recoveredIdentity=imported.invitation;
          const address3 = this.status("mainnet").accounts.find((a) => a.chain === "ETH")!.address;
          if (imported.invitation.binding.address !== address3) throw new Error("Kopia nale\u017Cy do innego portfela EVM.");
          if (wallet2.chatSecretKey && wallet2.chatSecretKey !== Buffer.from(key2!).toString("hex") && !input.replace) throw new Error("Zmiana klucza wymaga zgody. Dotychczasowa skrzynka zostanie od\u0142\u0105czona. Zachowaj kopi\u0119 jej klucza.");
        } else key2 = wallet2.chatSecretKey ? Uint8Array.from(Buffer.from(wallet2.chatSecretKey, "hex")) : generateSecretKey();
        this.stable(epoch2);
        const address2 = this.status("mainnet").accounts.find((a) => a.chain === "ETH")!.address, draft = newBinding(key2, address2);
        if (!await confirm(statement(draft.binding))) throw new Error("Aktywacja czatu anulowana.");
        this.stable(epoch2);
        const seed = this.seed();
        let identity;
        try {
          identity = verifyInvitation({ ...draft,...recoveredIdentity?.profile?{profile:recoveredIdentity.profile}:{}, signature: await ethKey(seed).signMessage(statement(draft.binding)) });
          this.stable(epoch2);
        } finally {
          seed.fill(0);
        }
        const changed = wallet2.chatSecretKey !== void 0 && wallet2.chatSecretKey !== Buffer.from(key2!).toString("hex");
        if (changed) {
          this.closeChat();
          await this.chatDraining;
        }
        await this.persist({ ...this.requireSession().collection, wallets: this.requireSession().collection.wallets.map((w) => w.id === wallet2.id ? { ...w, chatSecretKey: Buffer.from(key2!).toString("hex") } : w) });
        const store2 = await this.openChat(wallet2.id);
        await store2.initialize(identity,false,recoveredIdentity?Date.parse(recoveredIdentity.binding.createdAt):undefined);
        const oldProfile=store2.identity().profile;const data=oldProfile?verifyProfile(oldProfile,store2.pubkey):{version:1,name:wallet2.name};await store2.updateProfile(('independent' in data&&data.independent)?data:{...data,name:wallet2.name});
        return store2.view();
      } finally {
        key2?.fill(0);
      }
    });
    const epoch = this.epoch, store = await this.openChat(input.walletId);
    this.stable(epoch);
    switch (input.action) {
      case 'profile-draft':return store.saveDraft(input.profile);
      case 'profile-publish':{await store.publishDraft();this.stable(epoch);const community=await this.openCommunity(input.walletId);await community.publishProfile(store.identity());return store.view();}
      case 'payment-balance':{
        if(input.network!==this.integrations.network)throw Error('Zmieniono środowisko sieciowe.');const from=this.status(input.network).accounts.find(a=>a.chain==='ETH')!.address,p=ethereum(input.network,input.chain);try{await checkEthereum(p,input.network,input.chain);const gas=await p.getBalance(from,'pending');let balance=gas,decimals=18,symbol='ETH';if(input.kind!=='native'){if(input.kind==='usdc'&&input.chain!=='ETH')throw Error('USDC nie jest skonfigurowane dla tej sieci.');const address=input.kind==='usdc'?importUSDC[input.network].ETH:input.address;if(!address)throw Error('Wybierz aktywo.');if(await p.getCode(address)==='0x')throw Error('Brak kontraktu w tej sieci.');if(input.kind==='nft'){if(!input.tokenId||!input.standard)throw Error('Wybierz NFT.');const c=new Contract(address,input.standard==='ERC721'?ERC721:ERC1155,p);if(!await c.supportsInterface(input.standard==='ERC721'?'0x80ac58cd':'0xd9b67a26'))throw Error('Nieprawidłowy standard NFT.');balance=input.standard==='ERC721'?((await c.ownerOf(input.tokenId)).toLowerCase()===from.toLowerCase()?1n:0n):await c.balanceOf(from,input.tokenId);decimals=0;symbol=input.standard;}else{const c=new Contract(address,ERC20,p);decimals=Number(await c.decimals());if(!Number.isInteger(decimals)||decimals<0||decimals>36)throw Error('Nieprawidłowa precyzja tokena.');balance=await c.balanceOf(from);symbol=input.kind==='usdc'?'USDC':'ERC-20';}}this.stable(epoch);return {from,chain:input.chain,network:input.network,balance:formatUnits(balance,decimals),gas:formatEther(gas),decimals,symbol};}finally{p.destroy();}
      }
      case 'payment-quote':{
        const c=store.view().contacts.find((c:any)=>c.invitation.binding.address===input.address);if(!c||c.blocked||c.pending)throw Error('Brak zweryfikowanego kontaktu.');verifyInvitation(c.invitation);const intent=z.object({kind:z.enum(['native','usdc','token','nft']),chain:z.enum(['ETH','RH']),network:networkSchema,amount:z.string().max(78),address:z.string().max(42).optional(),tokenId:z.string().max(78).optional(),standard:z.enum(['ERC721','ERC1155']).optional()}).strict().parse(input.intent);if(intent.network!==this.integrations.network)throw Error('Zmieniono środowisko sieciowe.');const to=c.invitation.binding.address;
        const q=intent.kind==='native'?await this.quote({chain:intent.chain,network:intent.network,to,amount:intent.amount}):await this.assetQuote({...intent,to});this.chatDrafts.set(q.id,{address:to,publicKey:c.invitation.binding.publicKey,walletId:input.walletId,intent:{...intent,amount:intent.kind==='native'?(q as Quote).amount:intent.amount}});return {quote:q,native:intent.kind==='native'};
      }
      case 'payment-pending':return (await this.paymentNotices()).rows.filter(r=>!r.published);
      case 'payment-publish':{const {path,rows}=await this.paymentNotices();const row=rows.find(r=>r.payment.hash===input.hash);if(!row)throw Error('Brak własnej operacji do opublikowania.');await store.send(row.address,'',undefined,row.payment);row.published=true;await atomicWrite(path,{version:1,sealed:(await this.protector.seal(JSON.stringify(rows))).toString('base64')});return;}
      case 'payment-verify':{const result=await verifyPayment(input.payment);this.stable(epoch);return result;}
      case "view":
        return store.view();
      case "share":
        return store.share();
      case "preview":
        return store.preview(input.invitation);
      case "accept":
        return store.accept(input.invitation, input.previousKey);
      case "block":
        return store.block(input.address, input.blocked);
      case "send":
        return store.send(input.address,input.text,input.image?this.processImage(input.image):undefined);
      case 'retry-request':return store.retryRequest(input.address);
      case 'request':return store.requestContact(input.invitation,input.previousKey);
      case 'answer':return store.answerRequest(input.id,input.accept);
      case 'alias':return store.alias(input.address,input.alias);
      case 'profile-avatar':
      case 'avatar':{
        const old=store.identity().profile;const profile:ReturnType<typeof verifyProfile>=input.action==='profile-avatar'&&store.view().draft?store.view().draft:old?verifyProfile(old,store.pubkey):{version:1,name:wallet2.name};delete profile.avatar;delete profile.nft;
        if(input.nft&&input.nft.network!==this.integrations.network)throw Error('Zmieniono środowisko NFT.');
        if(input.nft){const n=input.nft;const account=this.status(n.network).accounts.find(a=>a.chain===(n.chain==='RH'?'ETH':n.chain))!;const found=await fetchNfts({chain:n.chain,network:n.network,mode:'explore',query:n.address,tokenId:n.tokenId,scope:'asset'},account.address,await this.integrations.keys());this.stable(epoch);const nft=found.items.find(x=>(n.chain!=='SOL'?x.address.toLowerCase()===n.address.toLowerCase():x.address===n.address)&&x.tokenId===n.tokenId);if(!nft||!nft.image)throw Error('Nie znaleziono obrazu NFT.');await verifyNftOwnership(nft,account.address,await this.integrations.keys());const img=await this.nftImage(nft.image);this.stable(epoch);profile.avatar=this.processImage(img,true);profile.nft={chain:n.chain,network:n.network,address:nft.address,tokenId:nft.tokenId,standard:nft.standard,checkedAt:Date.now()};}
        else if(input.image)profile.avatar=this.processImage(input.image,true);
        this.stable(epoch);if(input.action==='profile-avatar')await store.saveDraft(profile);else await store.updateProfile(profile);return store.view();
      }
      case "retry":
        return store.retry(input.id);
      case "export": {
        const proof = await this.authenticate(input.pin);
        proof.key.fill(0);
        this.stable(epoch);
        const key2 = Uint8Array.from(Buffer.from(this.active().chatSecretKey!, "hex"));
        try {
          return exportKey(key2, store.identity(), input.password);
        } finally {
          key2.fill(0);
        }
      }
    }
  }

 private processImage(input:string,avatar=false){if(!this.chatImageProcessor)throw Error('Przetwarzanie obrazów jest niedostępne.');return this.chatImageProcessor(input,avatar);}
 async reveal(pin:string){this.requireSession();const epoch=this.epoch;const proof=await this.authenticate(pin);proof.key.fill(0);if(epoch!==this.epoch)throw new Error('Sesja została zmieniona.');const {mnemonic,passphrase}=this.active();return {mnemonic,passphrase};}
}
