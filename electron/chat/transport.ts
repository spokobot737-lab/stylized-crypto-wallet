// @ts-nocheck
import WebSocket from 'ws';
import {AbstractRelay} from 'nostr-tools/abstract-relay';
import {finalizeEvent,verifyEvent} from 'nostr-tools/pure';
import {CHAT_RELAYS} from './protocol';
class LimitedWebSocket extends WebSocket {constructor(url){super(url,{maxPayload:65536,handshakeTimeout:10000});}}
export const HISTORY_OVERLAP=3*86400; // NIP-59 randomizes both outer timestamps up to two days.
export const relayFactory=(implementation=LimitedWebSocket)=>(url,key,pubkey,receive)=>{
 class TransportSocket extends implementation {constructor(address,protocols){super(address,protocols);this.addEventListener('error',()=>{});}}
 const relay=new AbstractRelay(url,{verifyEvent,websocketImplementation:TransportSocket,enablePing:true,enableReconnect:false});relay.publishTimeout=8000;
 let sub,closed=false,authAttempts=0,authTimer,historyTimer,historySub,historyRunning=false,historyWarning='';
 const sign=async template=>{if(closed)throw Error('Czat zablokowany.');return finalizeEvent(template,key);};
 async function page(filter){return new Promise((resolve,reject)=>{
   const rows=[];let finished=false,request;const finish=()=>{if(finished)return;finished=true;request?.close();resolve(rows);};
   request=relay.subscribe([filter],{onevent:e=>rows.push(e),oneose:finish,eoseTimeout:8000,onclose:reason=>{if(finished)return;finished=true;if(reason.includes('auth-required'))authenticate();reject(Error(reason||'Przerwano pobieranie historii.'));}});historySub=request;
 });}
 async function history(full=false){if(closed||historyRunning||!relay.connected)return;historyRunning=true;
   try{let until,limit=256,previous;const maxLimit=url==='wss://nos.lol'?500:2048;const since=full?undefined:Math.max(0,Math.floor(Date.now()/1000)-HISTORY_OVERLAP);
    for(let n=0;n<30&&!closed;n++){
     const rows=await page({kinds:[1059],'#p':[pubkey],limit,...since!==undefined?{since}:{},...until!==undefined?{until}:{}});
     for(const event of rows)receive(event);
     if(rows.length<limit){historyWarning='';break;}
     const min=Math.min(...rows.map(e=>e.created_at));
     // Inclusive second overlap. Grow a tied page instead of skipping the boundary second.
     if(min===previous){if(limit>=maxLimit){historyWarning='Historia relaya przekracza limit jednej sekundy; sprawdź drugi relay.';break;}limit=Math.min(limit*2,maxLimit);}else{previous=min;until=min;limit=256;}
     if(n===29)historyWarning='Historia wymaga kolejnego połączenia; osiągnięto limit 30 stron.';
    }
   }catch{if(!closed)historyWarning='Nie udało się pobrać pełnej historii z tego relaya.';}finally{historyRunning=false;}
 }
 function subscribe(){if(closed||!relay.connected)return;sub?.close();sub=relay.subscribe([{kinds:[1059],'#p':[pubkey],limit:1}],{onevent:receive,onclose:reason=>{if(reason.includes('auth-required'))authenticate();}});void history(true);clearInterval(historyTimer);historyTimer=setInterval(()=>void history(),60000);historyTimer.unref?.();}
 function authenticate(){if(closed)return;clearTimeout(authTimer);authTimer=setTimeout(()=>{if(closed)return;if(++authAttempts>2){relay.close();return;}void relay.auth(sign).then(subscribe).catch(()=>relay.close());},100);}
 relay.onauth=async template=>{authenticate();return sign(template);};
 return {
  get connected(){return !closed&&relay.connected;},get historyWarning(){return historyWarning;},
  async connect(){await relay.connect({timeout:10000});if(closed){relay.close();return;}subscribe();},
  async inbox(author){if(closed||!relay.connected)return;const rows=await page({kinds:[10050],authors:[author],limit:5});return rows.filter(e=>e.pubkey===author&&e.kind===10050&&verifyEvent(e)&&e.created_at<=Date.now()/1000+300).sort((a,b)=>b.created_at-a.created_at||b.id.localeCompare(a.id)).map(e=>({relays:e.tags.filter(t=>t[0]==='relay'&&CHAT_RELAYS.includes(t[1])).map(t=>t[1]),frameVersion:e.tags.some(t=>t[0]==='frame'&&t[1]==='2')?2:1}))[0];},
  async publish(event){if(closed)throw Error('Czat zablokowany.');try{return await relay.publish(event);}catch(e){if(e instanceof Error&&e.message.includes('auth-required')){await relay.auth(sign);if(closed)throw Error('Czat zablokowany.');return relay.publish(event);}throw e;}},
  close(){closed=true;clearTimeout(authTimer);clearInterval(historyTimer);sub?.close();historySub?.close();relay.close();}
 };
};
export const createRelay=relayFactory();
