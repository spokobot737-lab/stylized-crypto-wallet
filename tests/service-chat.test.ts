import {test} from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes,createCipheriv,createDecipheriv} from 'node:crypto';
import {mkdtemp,rm,readFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {WalletService} from '../electron/service';
import {openCollection} from '../electron/app-vault';
const mnemonic='abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon abandon about';
// Test protector only. Production continues to require the OS keystore.
function protector(){const key=randomBytes(32);return{async seal(t:string){const iv=randomBytes(12),c=createCipheriv('aes-256-gcm',key,iv);return Buffer.concat([iv,c.update(t),c.final(),c.getAuthTag()]);},async open(b:Buffer){const c=createDecipheriv('aes-256-gcm',key,b.subarray(0,12));c.setAuthTag(b.subarray(-16));return Buffer.concat([c.update(b.subarray(12,-16)),c.final()]).toString();}};}
const factory=()=>{let connected=false;return{historyWarning:'',get connected(){return connected;},async inbox(){return undefined;},async connect(){connected=true;},async publish(){return '';},close(){connected=false;}};};
test('service preserves chat key across authorization renewal, wallet rename, PIN change and restart; wallets remain isolated',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'frame-chat-service-')),p=protector(),s=new WalletService(dir,p,factory);let next:WalletService|undefined;
 try{await s.initialize('735291');const a=await s.import({mnemonic,passphrase:'',name:'Portfel 1'}),aid=a.activeWalletId!;const ac=(input:any)=>s.chat({walletId:aid,...input},async()=>true);await assert.rejects(s.chat({walletId:aid,action:'activate'},async()=>false),/anulowana/);assert.equal((await ac({action:'view'})as any).active,false);
  const activated:any=await ac({action:'activate'}),pubkey=activated.publicKey;let proof=await openCollection(JSON.parse(await readFile(join(dir,'app.vault'),'utf8')),'735291',p);const key=proof.collection.wallets[0].chatSecretKey;proof.key.fill(0);assert.ok(key);await ac({action:'activate'});assert.equal((await ac({action:'view'})as any).publicKey,pubkey);
  await s.renameWallet(aid,'Nowa nazwa','testnet');assert.equal(JSON.parse((await ac({action:'view'})as any).profile.content).name,'Nowa nazwa');const b=await s.import({mnemonic,passphrase:'second',name:'Drugi'});assert.equal((await s.chat({walletId:b.activeWalletId!,action:'view'},async()=>true)as any).active,false);await assert.rejects(ac({action:'view'}),/zmianie/);await s.switchWallet(aid,'testnet');assert.equal((await ac({action:'view'})as any).publicKey,pubkey);
  await s.changePin('735291','946283');s.lock();next=new WalletService(dir,p,factory);await next.unlock('946283','mainnet');assert.equal((await next.chat({walletId:aid,action:'view'},async()=>true)as any).publicKey,pubkey);proof=await openCollection(JSON.parse(await readFile(join(dir,'app.vault'),'utf8')),'946283',p);assert.equal(proof.collection.wallets.find(w=>w.id===aid)!.chatSecretKey,key);proof.key.fill(0);
 }finally{s.lock();next?.lock();await new Promise(r=>setTimeout(r,20));await rm(dir,{recursive:true,force:true});}
});
