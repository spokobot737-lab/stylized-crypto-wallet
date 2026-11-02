import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm,readFile,writeFile} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {randomUUID} from 'node:crypto';
import {Wallet} from 'ethers';
import {generateSecretKey,getPublicKey,getEventHash,finalizeEvent} from 'nostr-tools/pure';
import {createSeal,createWrap} from 'nostr-tools/nip59';
import {encrypt,getConversationKey} from 'nostr-tools/nip44';
import {newBinding,statement,verifyInvitation,encodeInvitation,makeProfile,wrapMessage,readMessage,compareMessages} from '../electron/chat/protocol';
import {ChatStore} from '../electron/chat/store';
const avatar='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
async function identity(key:Uint8Array,name:string,wallet=Wallet.createRandom()) {const draft=newBinding(key,wallet.address);return verifyInvitation({...draft,signature:await wallet.signMessage(statement(draft.binding)),profile:makeProfile(key,{version:1,name})});}
function bus(){const receivers=new Map<string,(e:any)=>void>(),events:any[]=[];let failing=false;return{events,set failing(v:boolean){failing=v;},factory:(url:string,_key:Uint8Array,pub:string,receive:(e:any)=>void)=>{let connected=false;return{historyWarning:'',async inbox(){return undefined;},get connected(){return connected;},async connect(){connected=true;receivers.set(url+pub,receive);},async publish(e:any){if(failing)throw Error('offline');events.push(e);if(e.kind===1059){const p=e.tags.find((t:string[])=>t[0]==='p')[1];const callback=receivers.get(url+p);if(callback)queueMicrotask(()=>callback(e));}return '';},close(){connected=false;receivers.delete(url+pub);}};}};}
async function wait(fn:()=>boolean,stores:any[]=[]){for(let i=0;i<300;i++){for(const s of stores)await s.serial;if(fn())return;await new Promise(r=>setTimeout(r,10));}assert.ok(fn(),'condition timed out');}
async function fixture(fn:(a:any,b:any,network:ReturnType<typeof bus>,keys:Uint8Array[],directory:string,wallets:ReturnType<typeof Wallet.createRandom>[])=>Promise<void>){const dir=await mkdtemp(join(tmpdir(),'frame-chat-')),keys=[generateSecretKey(),generateSecretKey()],net=bus(),wallets=[Wallet.createRandom(),Wallet.createRandom()],i=[await identity(keys[0],'Portfel A',wallets[0]),await identity(keys[1],'Portfel B',wallets[1])];const stores=i.map((invite,index)=>new ChatStore(join(dir,index+'.vault'),keys[index],randomUUID(),invite.binding.address,()=>{},net.factory));try{for(let x=0;x<2;x++)await stores[x].initialize(i[x]);await wait(()=>stores.every(s=>[...s.peers.values()].some((p:any)=>p.relay.connected)),stores);await fn(stores[0],stores[1],net,keys,dir,wallets);}finally{await Promise.all(stores.map(s=>s.close()));keys.forEach(k=>k.fill(0));await rm(dir,{recursive:true,force:true});}}
async function connect(a:any,b:any){await b.requestContact(await a.share());await wait(()=>a.view().requests.length===1,[a,b]);assert.equal(a.view().contacts.length,0);assert.equal(a.view().messages.length,0);await a.answerRequest(a.view().requests[0].id,true);await a.flush();await wait(()=>b.view().contacts[0]?.pending===false,[a,b]);}
test('one invitation: unknown sender request, verified binding, consent, acceptance and private profile',async()=>fixture(async(a,b)=>{
 await connect(a,b);assert.equal(a.view().contacts[0].invitation.binding.address,b.address);assert.equal(JSON.parse(a.view().contacts[0].invitation.profile.content).name,'Portfel B');assert.equal(a.view().requests.length,0);assert.equal(b.view().messages.length,0);
 await b.send(a.address,'Wiadomość testowa');await b.flush();await wait(()=>a.view().messages.length===1,[a,b]);assert.equal(a.view().messages[0].text,'Wiadomość testowa');
}));
test('timeline uses inner second timestamps and IDs, random relay order and duplicate wrappers, stable after restart',async()=>fixture(async(a,b,_net,keys,dir)=>{
 await connect(a,b);const t=Math.floor(Date.now()/1000);const rows=[wrapMessage(keys[1],a.pubkey,'Pierwsza','one',false,t-1),wrapMessage(keys[0],b.pubkey,'Druga','two',false,t),wrapMessage(keys[1],a.pubkey,'Trzecia','three',false,t)];
 for(const index of[2,0,1,2,1])await a.receive(rows[index].events[index===1?0:1]);
 const rumor=readMessage(rows[2].events[1],keys[0]);await a.receive(createWrap(createSeal(rumor,keys[1],a.pubkey),a.pubkey));
 const expected=rows.map(x=>({id:x.id,at:x.at})).sort(compareMessages);assert.deepEqual(a.view().messages.map((m:any)=>({id:m.id,at:m.at})),expected);assert.ok(rows.some(x=>x.events[0].created_at!==x.at/1000));
 const params=[a.path,keys[0],a.walletId,a.address,()=>{},bus().factory] as const;await a.close();const reopened=new ChatStore(...params);try{await reopened.load();assert.deepEqual(reopened.view().messages.map((m:any)=>m.id),expected.map(m=>m.id));}finally{await reopened.close();}
}));
test('retry keeps the original inner ID/time and pending local echo merges once',async()=>fixture(async(a,b,net)=>{
 await connect(a,b);net.failing=true;await b.send(a.address,'Ponowienie');await wait(()=>b.state.outbox.some((q:any)=>!q.control&&q.attempts>0),[a,b]);const old=b.view().messages[0],q=b.state.outbox.find((q:any)=>q.id===old.id),serialized=JSON.stringify(q.targets.map((t:any)=>t.event));await b.receive(q.targets[0].event);assert.equal(b.view().messages.length,1);
 net.failing=false;await b.retry(old.id);await b.flush();await wait(()=>a.view().messages.length===1,[a,b]);assert.equal(a.view().messages[0].id,old.id);assert.equal(a.view().messages[0].at,old.at);assert.equal(b.view().messages.length,1);assert.equal(serialized,JSON.stringify(q.targets.map((t:any)=>t.event)));
}));
test('nickname/avatar updates propagate encrypted, local alias wins and blocks stop updates/messages',async()=>fixture(async(a,b,net)=>{
 await connect(a,b);await a.alias(b.address,'Lokalny kontakt');await b.updateProfile({version:1,name:'Nowy nick',avatar});await b.flush();await wait(()=>JSON.parse(a.view().contacts[0].invitation.profile.content).name==='Nowy nick',[a,b]);assert.equal(a.view().contacts[0].alias,'Lokalny kontakt');assert.equal(JSON.parse(a.view().contacts[0].invitation.profile.content).avatar,avatar);assert.equal(net.events.filter(e=>e.kind===0).length,0);
 await a.block(b.address,true);await b.send(a.address,'Zablokowana wiadomość');await b.flush();await new Promise(r=>setTimeout(r,20));await a.serial;assert.equal(a.view().messages.length,0);
}));
test('reject and deduplicate requests, never auto-replace a known key or accept forged wallet binding',async()=>fixture(async(a,b,net,keys)=>{
 await b.requestContact(await a.share());await wait(()=>a.view().requests.length===1,[a,b]);for(const e of net.events.filter(e=>e.kind===1059&&e.tags[0][1]===a.pubkey))await a.receive(e);assert.equal(a.view().requests.length,1);await a.answerRequest(a.view().requests[0].id,false);assert.equal(a.view().contacts.length,0);assert.equal(a.view().messages.length,0);
 const forged={...b.identity(),signature:a.identity().signature};assert.throws(()=>verifyInvitation(forged));
 const unknown=generateSecretKey();const altered={...b.identity(),profile:makeProfile(unknown,{version:1,name:'Fałszywy profil'})};assert.throws(()=>verifyInvitation(altered));
 await a.accept(await b.share());const wallet=Wallet.createRandom(),oldKey=generateSecretKey(),old=await identity(oldKey,'B',wallet),next=await identity(unknown,'B',wallet);await a.accept(encodeInvitation(old));await assert.rejects(a.accept(encodeInvitation(next)),/zmianie/);await a.accept(encodeInvitation(next),old.binding.publicKey);unknown.fill(0);
}));
test('seal author must match rumor author and future/skew limits are enforced',async()=>{
 const a=generateSecretKey(),b=generateSecretKey(),evil=generateSecretKey();const msg=wrapMessage(a,getPublicKey(b),'Neutralna','id');const rumor=readMessage(msg.events[1],b);const seal=createSeal(rumor,evil,getPublicKey(b));assert.throws(()=>readMessage(createWrap(seal,getPublicKey(b)),b),/does not match/);
 const future={...rumor,created_at:Math.floor(Date.now()/1000)+600};future.id=getEventHash(future);assert.throws(()=>readMessage(createWrap(createSeal(future,a,getPublicKey(b)),getPublicKey(b)),b));[a,b,evil].forEach(k=>k.fill(0));
});
test('v0.5 encrypted history migrates conservatively, original bytes backed up, chat key and original queued rumor survive',async()=>fixture(async(a,b,net,keys,dir)=>{
 await a.accept(await b.share());net.failing=true;await a.send(b.address,'Migracja');await wait(()=>!a.flushing,[a,b]);const state=structuredClone(a.state),event=state.outbox.find((q:any)=>!q.control).targets[0].event,rumor=readMessage(event,keys[0]);state.version=1;delete state.requests;delete state.rejected;delete state.controlSeen;delete state.shared;delete state.identitySince;state.messages[0].at+=456;const path=join(dir,'legacy.vault'),old=JSON.stringify({version:1,data:encrypt(JSON.stringify(state),getConversationKey(keys[0],a.pubkey))});await writeFile(path,old);
 const restored=new ChatStore(path,keys[0],a.walletId,a.address,()=>{},bus().factory);try{await restored.load();assert.equal(await readFile(path+'.v1.bak','utf8'),old);assert.equal(restored.pubkey,a.pubkey);assert.equal(restored.view().messages[0].at,rumor.created_at*1000);assert.equal(restored.view().messages[0].id,rumor.id);assert.equal(restored.state.version,2);}finally{await restored.close();}
}));
test('image extension is private, size bounded and deduplicated with its local echo',async()=>fixture(async(a,b)=>{
 await connect(a,b);await b.send(a.address,'Mały obraz',avatar);await b.flush();await wait(()=>a.view().messages.length===1,[a,b]);assert.equal(a.view().messages[0].image,avatar);assert.equal(a.view().messages[0].text,'Mały obraz');await assert.rejects(b.send(a.address,'',avatar+'a'.repeat(14000)));
}));

test('updated legacy contacts exchange private profiles through authenticated capability discovery, key stays unchanged on renewal',async()=>fixture(async(a,b)=>{
 const ai=structuredClone(a.identity()),bi=structuredClone(b.identity());delete ai.profile;delete bi.profile;await a.accept(encodeInvitation(bi));await b.accept(encodeInvitation(ai));const before=a.pubkey;
 await a.share();await a.discover({inbox:async()=>({relays:a.identity().binding.relays,frameVersion:2})});await a.flush();await wait(()=>!!b.view().contacts[0].invitation.profile,[a,b]);assert.equal(JSON.parse(b.view().contacts[0].invitation.profile.content).name,'Portfel A');
 const oldProfile=a.identity().profile;await a.initialize({...a.identity(),profile:undefined});assert.equal(a.pubkey,before);assert.deepEqual(a.identity().profile,oldProfile);
}));

test('renewed wallet authorization propagates to an existing contact without changing keys or old history',async()=>fixture(async(a,b,_net,keys,_dir,wallets)=>{
 await connect(a,b);await b.send(a.address,'Zachowana historia');await b.flush();await wait(()=>a.view().messages.length===1,[a,b]);const before=b.view().contacts[0].invitation.binding.inboxId;
 const draft=newBinding(keys[0],a.address);await a.initialize(verifyInvitation({...draft,signature:await wallets[0].signMessage(statement(draft.binding))}));await a.flush();await wait(()=>b.view().contacts[0].invitation.signature===a.identity().signature,[a,b]);assert.equal(a.view().messages.length,1);assert.equal(a.pubkey,getPublicKey(keys[0]));
}));

test('a chat key already bound to one contact cannot silently switch that contact to a different EVM address',async()=>fixture(async(a,b,_net,keys)=>{
 await connect(a,b);const other=await identity(keys[1],'Inny portfel');const payload=wrapMessage(keys[1],a.pubkey,JSON.stringify({version:2,type:'request',invitation:other}),'test-key-address',true);await a.receive(payload.events[1]);assert.equal(a.view().contacts[0].invitation.binding.address,b.address);assert.equal(a.view().requests.length,0);
}));
