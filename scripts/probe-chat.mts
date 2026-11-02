// Opt-in network probe. Ephemeral keys and neutral encrypted payloads, no wallet secrets.
import WebSocket from 'ws';
import {HttpsProxyAgent} from 'https-proxy-agent';
import {generateSecretKey,getPublicKey,finalizeEvent} from 'nostr-tools/pure';
import {relayFactory} from '../electron/chat/transport';
import {wrapMessage,readMessage,CHAT_RELAYS} from '../electron/chat/protocol';
const proxy=process.env.HTTPS_PROXY||process.env.https_proxy;
class Socket extends WebSocket{constructor(url:string){super(url,{...(proxy?{agent:new HttpsProxyAgent(proxy)}:{}),maxPayload:65536,handshakeTimeout:12000});}}
const a=generateSecretKey(),b=generateSecretKey(),bpub=getPublicKey(b),pending=new Map<string,{id:string,size:number,received:boolean}>();
const result:any[]=[];
for(const url of CHAT_RELAYS){
 const sent=wrapMessage(a,bpub,JSON.stringify({version:2,type:'probe',text:'FRAME neutral connectivity test',padding:'a'.repeat(13000)}),'probe',true);
 let received=false;const sender=relayFactory(Socket)(url,a,getPublicKey(a),()=>{}),receiver=relayFactory(Socket)(url,b,bpub,event=>{try{if(readMessage(event,b).id===sent.id)received=true;}catch{}});
 try{await receiver.connect();await sender.connect();await sender.publish(sent.events[1]);for(let i=0;i<40&&!received;i++)await new Promise(r=>setTimeout(r,250));const inbox=finalizeEvent({kind:10050,created_at:Math.floor(Date.now()/1000),content:'',tags:CHAT_RELAYS.map(r=>['relay',r])},b);await receiver.publish(inbox);const list=await sender.inbox(bpub);result.push({url,outerBytes:Buffer.byteLength(JSON.stringify(sent.events[1])),published:true,received,dmList:list,historyWarning:receiver.historyWarning});}
 catch(e){result.push({url,error:(e as Error).message});}finally{sender.close();receiver.close();}
}
a.fill(0);b.fill(0);console.log(JSON.stringify(result,null,2));if(result.some(r=>!r.received))process.exitCode=1;
