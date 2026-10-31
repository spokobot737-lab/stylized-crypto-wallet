import { test } from 'node:test';
import assert from 'node:assert/strict';
import { copyPublicText, isPublicClipboardText } from '../electron/clipboard';
import { decodeBitcoin, decodeEthereum, decodeSolana, mergeLocalActivity, fetchActivity, activityInput } from '../electron/activity';
import { readActivity, loadPreferences } from '../src/lib/preferences';
import type { Account, Transfer } from '../electron/types';
const own='0x9858EfFD232B4033E47d90003D41EC34EcaEda94',other='0x0000000000000000000000000000000000000001';
const btcOwn='tb1qexample',btcOther='tb1qsender',hash='a'.repeat(64),sig='3'.repeat(88);
const eth={hash:'0x'+hash,from:other,to:own,value:'1234567890123456789',timeStamp:'1700000000',blockNumber:'100',confirmations:'6',gasUsed:'21000',gasPrice:'1000000000',isError:'0',txreceipt_status:'1'};
const btc={txid:hash,vin:[{prevout:{scriptpubkey_address:btcOther,value:200000}}],vout:[{scriptpubkey_address:btcOwn,value:100000},{scriptpubkey_address:btcOther,value:99000}],fee:1000,status:{confirmed:true,block_height:100,block_time:1700000000}};
const solOwn='11111111111111111111111111111111',solOther='So11111111111111111111111111111111111111112';
const instruction={program:'system',parsed:{type:'transfer',info:{source:solOther,destination:solOwn,lamports:123456789}}};
function sol(instructions:unknown[]=[],inner:unknown[]=[]){return {slot:100,blockTime:1700000000,meta:{err:null,fee:5000,preBalances:[999999999,0],postBalances:[876538210,123456789],innerInstructions:[{instructions:inner}]},transaction:{message:{accountKeys:[solOther,solOwn],instructions}}};}
test('clipboard verifies async OS completion, serializes clicks and recovers from failure',async()=>{
 let value='',writes=0;const clipboard={async writeText(text:string){await new Promise(r=>setTimeout(r,5));value=text;writes++;},async readText(){await Promise.resolve();return value;}};
 await Promise.all([copyPublicText(own,clipboard),copyPublicText(other,clipboard)]);assert.equal(value,other);assert.equal(writes,2);
 await assert.rejects(copyPublicText(own,{writeText(){},readText(){return 'old';}}),/System nie zapisał/);
 await copyPublicText(own,clipboard);assert.equal(value,own);
 for(const bad of ['abandon '.repeat(12),'secret passphrase','https://example.com','x'.repeat(200),null])assert.equal(isPublicClipboardText(bad),false);
 await assert.rejects(copyPublicText('seed words are never copied',clipboard));
 assert.equal(isPublicClipboardText(sig),true);assert.equal(isPublicClipboardText('0x'+hash),true);
});
test('BTC incoming is owned output only; outgoing excludes change and counts confirmations',()=>{
 const incoming=decodeBitcoin(btc,btcOwn,'testnet',105)!;assert.equal(incoming.direction,'in');assert.equal(incoming.amount,'0.001');assert.equal(incoming.confirmations,6);assert.equal(incoming.feePaidByWallet,false);
 const outgoing=decodeBitcoin({...btc,vin:[{prevout:{scriptpubkey_address:btcOwn,value:200000}}]},btcOwn,'mainnet',105)!;assert.equal(outgoing.direction,'out');assert.equal(outgoing.amount,'0.00099');assert.equal(outgoing.feePaidByWallet,true);
 const pending=decodeBitcoin({...btc,status:{confirmed:false}},btcOwn,'testnet',null)!;assert.equal(pending.confirmations,0);assert.equal(pending.at,null);assert.equal(pending.status,'pending');
});
test('BTC mixed ownership reports balance delta without claiming ownership of all fees',()=>{
 const tx=decodeBitcoin({...btc,vin:[...btc.vin,{prevout:{scriptpubkey_address:btcOwn,value:150000}}]},btcOwn,'testnet',null)!;
 assert.equal(tx.amount,'0.0005');assert.equal(tx.direction,'out');assert.equal(tx.amountBasis,'balance-change');assert.equal(tx.feePaidByWallet,false);
 assert.throws(()=>decodeBitcoin({...btc,fee:Number.MAX_SAFE_INTEGER+1},btcOwn,'testnet',null));
});
test('ETH keeps wei precision; failed transfers move zero; internal traces have separate IDs and no invented fees',()=>{
 const incoming=decodeEthereum(eth,own.toLowerCase(),'testnet')!;assert.equal(incoming.amount,'1.234567890123456789');assert.equal(incoming.fee,'0.000021');assert.equal(incoming.direction,'in');
 const failed=decodeEthereum({...eth,isError:'1'},own,'testnet')!;assert.equal(failed.amount,'0');assert.equal(failed.attemptedAmount,incoming.amount);assert.equal(failed.status,'failed');
 const a=decodeEthereum({...eth,traceId:'0'},own,'mainnet',true)!,b=decodeEthereum({...eth,traceId:'1'},own,'mainnet',true)!;assert.notEqual(a.id,b.id);assert.equal(a.fee,null);assert.equal(a.feePaidByWallet,false);
 assert.equal(decodeEthereum({...eth,to:other},own,'mainnet'),null);assert.throws(()=>decodeEthereum({...eth,hash:'https://evil.invalid'},own,'mainnet'));
});
test('SOL parses inner native transfers and never mistakes the fee payer for a sender',()=>{
 const incoming=decodeSolana(sol([], [instruction]),sig,solOwn,'testnet')!;assert.equal(incoming.direction,'in');assert.equal(incoming.amount,'0.123456789');assert.deepEqual(incoming.from,[solOther]);assert.equal(incoming.confirmations,null);
 const fallback=decodeSolana(sol(),sig,solOwn,'testnet')!;assert.equal(fallback.amountBasis,'balance-change');assert.deepEqual(fallback.from,[]);
 const failedTx=sol([instruction]);failedTx.meta.err={InstructionError:[0,'failed']} as never;assert.equal(decodeSolana(failedTx,sig,solOwn,'testnet')!.amount,'0');
 const self=sol();self.transaction.message.accountKeys=[solOwn,solOther];self.meta.preBalances=[10000,0];self.meta.postBalances=[5000,0];assert.equal(decodeSolana(self,sig,solOwn,'mainnet')!.amount,'0');
});
test('local broadcasts merge once with network records; preserve internal traces and network separation',()=>{
 const network=decodeEthereum(eth,own,'testnet')!;const local:Transfer={chain:'ETH',network:'testnet',hash:eth.hash,to:other,amount:'1',at:1,status:'broadcast',explorer:''};
 assert.equal(mergeLocalActivity([network],[local],[],'testnet').length,1);
 const trace=decodeEthereum({...eth,traceId:'0'},own,'testnet',true)!;assert.equal(mergeLocalActivity([trace],[local],[],'testnet').length,2);
 assert.equal(mergeLocalActivity([], [local],[],'mainnet').length,0);
 const solNetwork=decodeSolana(sol([instruction]),sig,solOwn,'testnet')!;
 assert.equal(mergeLocalActivity([solNetwork],[{...local,chain:'SOL',hash:sig}],[],'testnet').length,1);
});
test('public history fetch preserves successful chains when another provider fails',async()=>{
 const original=globalThis.fetch;globalThis.fetch=async(input)=>{const url=String(input);if(url.includes('/txs'))return Response.json([btc]);if(url.includes('/tip/height'))return new Response('105');throw new Error('Provider unavailable');};
 try{const accounts:Account[]=[{chain:'BTC',address:btcOwn,path:'',networkLabel:''},{chain:'SOL',address:solOwn,path:'',networkLabel:''}];const page=await fetchActivity(accounts,'testnet');assert.equal(page.items.length,1);assert.equal(page.warnings[0].chain,'SOL');assert.equal(page.next.BTC,null);}finally{globalThis.fetch=original;}
 assert.equal(activityInput.safeParse({network:'testnet',cursor:'1'}).success,false);assert.equal(activityInput.safeParse({network:'testnet',chain:'ETH',cursor:'1'}).success,true);
});
test('v0.2 appearance settings migrate with new activity and motion defaults; invalid filters normalize',()=>{
 const original=Object.getOwnPropertyDescriptor(globalThis,'localStorage');Object.defineProperty(globalThis,'localStorage',{configurable:true,value:{getItem:()=>JSON.stringify({theme:'alien',assetOrder:['BTC','SOL','ETH'],motion:false})}});
 try{const p=loadPreferences();assert.equal(p.theme,'alien');assert.equal(p.motion,false);assert.equal(p.motionSpeed,'normal');assert.equal(p.activity.incoming,true);assert.deepEqual(p.assetOrder,['BTC','SOL','ETH']);}finally{if(original)Object.defineProperty(globalThis,'localStorage',original);else delete (globalThis as any).localStorage;}
 const p=readActivity({chains:['BTC','BTC','fake'],fields:{fee:true,hash:'yes'},visible:false});assert.deepEqual(p.chains,['BTC']);assert.equal(p.visible,false);assert.equal(p.fields.fee,true);assert.equal(p.fields.hash,false);
});
