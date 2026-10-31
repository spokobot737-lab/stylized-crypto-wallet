import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes,createCipheriv,createDecipheriv } from 'node:crypto';
import { mkdtemp,readFile,writeFile,rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { Keypair } from '@solana/web3.js';
import { WalletService } from '../electron/service';
import { createVault } from '../electron/vault';
import { newCollection, openCollection, type DeviceProtector } from '../electron/app-vault';
import { numberText, moveAsset, normalizeOrder } from '../src/lib/preferences';
const mnemonic='abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about',password='Legacy-test-password-123!',pin='735291';
// Test-only keystore double. Production always uses Electron's OS-protected safeStorage.
function device():DeviceProtector{const key=randomBytes(32);return {async seal(text){const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',key,iv);return Buffer.concat([iv,cipher.update(text),cipher.final(),cipher.getAuthTag()]);},async open(bytes){const decipher=createDecipheriv('aes-256-gcm',key,bytes.subarray(0,12));decipher.setAuthTag(bytes.subarray(-16));return Buffer.concat([decipher.update(bytes.subarray(12,-16)),decipher.final()]).toString();}};}
async function fixture(fn:(s:WalletService,directory:string,protector:DeviceProtector)=>Promise<void>){const directory=await mkdtemp(join(tmpdir(),'frame-multi-')),protector=device(),s=new WalletService(directory,protector);try{await fn(s,directory,protector);}finally{s.lock();await rm(directory,{recursive:true,force:true});}}
const delay=()=>new Promise(resolve=>setTimeout(resolve,1050));
test('application PIN format, authenticated vault and device binding',async()=>{
 const protector=device();await assert.rejects(newCollection({wallets:[],activeId:null},'1234',protector));const state=await newCollection({wallets:[],activeId:null},pin,protector);try{assert.equal((await openCollection(state.envelope,pin,protector)).collection.wallets.length,0);await assert.rejects(openCollection(state.envelope,'735292',protector));await assert.rejects(openCollection(state.envelope,pin,device()));await assert.rejects(openCollection({...state.envelope,tag:'0'.repeat(32)},pin,protector));assert.ok(!JSON.stringify(state.envelope).includes(pin));}finally{state.key.fill(0);}
});
test('one PIN unlocks multiple independent wallets and preserves the active wallet across restart',async()=>fixture(async(s,dir,protector)=>{
 assert.throws(()=>s.generate(),/zablokowana/);const initialized=await s.initialize(pin);assert.equal(initialized.unlocked,true);assert.equal(initialized.wallets.length,0);
 const generated=s.generate().split(' ');await assert.rejects(s.create({name:'Wrong',passphrase:'',word3:'wrong',word8:'wrong'}));
 const a=await s.import({name:'Główny',mnemonic,passphrase:''});const idA=a.activeWalletId!,addressA=a.accounts[1].address;
 const b=await s.import({name:'Drugi',mnemonic,passphrase:'second-wallet'});const idB=b.activeWalletId!;assert.notEqual(b.accounts[1].address,addressA);assert.equal(b.wallets.length,2);
 await assert.rejects(s.import({name:'Duplicate',mnemonic,passphrase:''}),/już dodany/);
 const back=await s.switchWallet(idA,'testnet');assert.equal(back.accounts[1].address,addressA);assert.equal(back.activeWalletId,idA);
 const entry={hash:'0x'+'a'.repeat(64),chain:'ETH',network:'testnet',to:addressA,amount:'0.01',at:1,explorer:'',status:'broadcast'};
 await writeFile(join(dir,`transfers-${idA}.json`),JSON.stringify([entry]));assert.equal((await s.history()).length,1);await s.switchWallet(idB,'testnet');assert.equal((await s.history()).length,0);
 await s.renameWallet(idB,'Oszczędności','testnet');s.lock();assert.deepEqual(s.status('testnet').wallets,[]);await assert.rejects(s.import({name:'Locked',mnemonic,passphrase:'x'}),/zablokowana/);
 const reopened=new WalletService(dir,protector);try{const result=await reopened.unlock(pin,'mainnet');assert.equal(result.activeWalletId,idB);assert.equal(result.wallets[1].name,'Oszczędności');assert.match(result.accounts[2].address,/^bc1/);const restored=await reopened.switchWallet(idA,'testnet');assert.equal(restored.accounts[1].address,addressA);assert.equal((await reopened.history()).length,1);const encrypted=await readFile(join(dir,'app.vault'),'utf8');assert.ok(!encrypted.includes(mnemonic));assert.ok(!encrypted.includes('Oszczędności'));}finally{reopened.lock();}
}));
test('new wallet creation verifies backup words and requires no per-wallet password',async()=>fixture(async s=>{await s.initialize(pin);const words=s.generate().split(' ');const result=await s.create({name:'Nowy',passphrase:'',word3:words[2],word8:words[7]});assert.equal(result.wallets[0].name,'Nowy');assert.equal(result.accounts.length,3);}));
test('v0.1 migration preserves addresses, legacy vault bytes and transaction history',async()=>fixture(async(s,dir,protector)=>{
 await createVault(join(dir,'wallet.vault'),{mnemonic,passphrase:'original'},password);const original=await readFile(join(dir,'wallet.vault'));await writeFile(join(dir,'transfers.json'),'[]');assert.equal(s.status('testnet').needsMigration,true);await assert.rejects(s.initialize(pin),/przenieś/);await assert.rejects(s.migrate({password:password+'wrong',pin}));assert.equal(s.status('testnet').needsMigration,true);
 const status=await s.migrate({password,pin});assert.equal(status.needsMigration,false);assert.equal(status.wallets.length,1);assert.deepEqual(await readFile(join(dir,'wallet.vault')),original);assert.equal((await s.history()).length,0);const address=status.accounts[1].address;s.lock();const next=new WalletService(dir,protector);try{assert.equal((await next.unlock(pin,'testnet')).accounts[1].address,address);await assert.rejects(next.migrate({password,pin}),/już wykonana/);}finally{next.lock();}
}));
test('PIN change applies to every wallet and failed attempts survive application restart',async()=>fixture(async(s,dir,protector)=>{
 await s.initialize(pin);await s.import({name:'A',mnemonic,passphrase:''});await s.import({name:'B',mnemonic,passphrase:'other'});await s.changePin(pin,'946283');s.lock();await assert.rejects(s.unlock(pin,'testnet'));
 const next=new WalletService(dir,protector);await assert.rejects(next.unlock('946283','testnet'),/Zbyt wiele prób/);await delay();try{const status=await next.unlock('946283','testnet');assert.equal(status.wallets.length,2);await next.switchWallet(status.wallets[0].id,'testnet');assert.equal((await next.reveal('946283')).mnemonic,mnemonic);}finally{next.lock();}
}));
test('locking while PIN verification is pending never restores a session',async()=>fixture(async s=>{await s.initialize(pin);s.lock();const pending=s.unlock(pin,'testnet');s.lock();await assert.rejects(pending,/zablokowana/);assert.equal(s.status('testnet').unlocked,false);}));
test('switching wallet invalidates the previous immutable transaction quote',async()=>fixture(async s=>{
 await s.initialize(pin);const a=await s.import({name:'A',mnemonic,passphrase:''});await s.import({name:'B',mnemonic,passphrase:'B'});await s.switchWallet(a.activeWalletId!,'testnet');const original=globalThis.fetch;
 globalThis.fetch=async(_input,init)=>{const body=JSON.parse(init!.body as string);const results:Record<string,unknown>={getLatestBlockhash:{context:{slot:1},value:{blockhash:Keypair.generate().publicKey.toBase58(),lastValidBlockHeight:200}},getFeeForMessage:{context:{slot:1},value:5000},getBalance:{context:{slot:1},value:1000000000},getAccountInfo:{context:{slot:1},value:null},getMinimumBalanceForRentExemption:890880};return Response.json({jsonrpc:'2.0',id:body.id,result:results[body.method]});};
 try{const quote=await s.quote({chain:'SOL',network:'testnet',to:Keypair.generate().publicKey.toBase58(),amount:'0.001'});assert.equal(quote.walletId,a.activeWalletId);await s.switchWallet(s.status('testnet').wallets[1].id,'testnet');let confirmed=false;await assert.rejects(s.send(quote.id,async()=>{confirmed=true;return true;}),/Wycena wygasła/);assert.equal(confirmed,false);}finally{globalThis.fetch=original;}
}));
test('balance formatting removes only trailing decimal zeroes and retains tiny amounts',()=>{for(const v of ['0','0.0','0.00000000','0.000000000000000000'])assert.equal(numberText(v),'0');assert.equal(numberText('1.230000000'),'1,23');assert.equal(numberText('100.000'),'100');assert.equal(numberText('0.000000000000000001'),'0,000000000000000001');assert.equal(numberText(null),'Niedostępne');});
test('asset order stays a complete permutation and can move in both directions',()=>{assert.deepEqual(normalizeOrder(['BTC','BTC','invalid']),['BTC','SOL','ETH']);assert.deepEqual(moveAsset(['SOL','ETH','BTC'],'BTC','SOL'),['BTC','SOL','ETH']);assert.deepEqual(moveAsset(['SOL','ETH','BTC'],'SOL','BTC'),['ETH','BTC','SOL']);});
test('history rejects late wallet responses, caches per wallet and clears on lock',async()=>fixture(async s=>{
 await s.initialize(pin);const a=await s.import({name:'A',mnemonic,passphrase:''});const b=await s.import({name:'B',mnemonic,passphrase:'B'});await s.switchWallet(a.activeWalletId!,'testnet');
 const original=globalThis.fetch;let release!:()=>void,started!:()=>void;const gate=new Promise<void>(r=>release=r),request=new Promise<void>(r=>started=r);const urls:string[]=[];
 globalThis.fetch=async input=>{const url=String(input);urls.push(url);if(url.includes('/txs')){started();await gate;return Response.json([]);}return new Response('100');};
 try{const late=s.activity({network:'testnet',chain:'BTC'});await request;await s.switchWallet(b.activeWalletId!,'testnet');release();await assert.rejects(late,/uległy zmianie/);
  await s.activity({network:'testnet',chain:'BTC'});const count=urls.length;await s.activity({network:'testnet',chain:'BTC'});assert.equal(urls.length,count);assert.ok(urls.some(url=>url.includes(b.accounts[2].address)));s.lock();await assert.rejects(s.activity({network:'testnet',chain:'BTC'}),/zablokowana/);
 }finally{release();globalThis.fetch=original;}
}));
