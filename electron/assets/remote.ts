import {Worker} from 'node:worker_threads';
import {join,dirname} from 'node:path';
import {fileURLToPath} from 'node:url';
import {imageSize} from 'image-size';
import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';

export function publicAddress(address:string){try{const parsed=ipaddr.process(address);return parsed.range()==='unicast';}catch{return false;}}
export function metadataUrl(input:string){
 if(input.startsWith('ipfs://'))input=`https://ipfs.io/ipfs/${input.slice(7).replace(/^ipfs\//,'')}`;
 if(input.startsWith('ipns://'))input=`https://ipfs.io/ipns/${input.slice(7)}`;
 if(input.startsWith('ar://'))input=`https://arweave.net/${input.slice(5)}`;
 const url=new URL(input);if(url.protocol!=='https:'||url.username||url.password||(url.port&&url.port!=='443')||input.length>2048)throw new Error('Wymagany jest publiczny adres HTTPS lub IPFS.');
 const host=url.hostname.replace(/^\[|\]$/g,'');if(host==='localhost'||host.endsWith('.local')||host.endsWith('.internal')||(isIP(host)&&!publicAddress(host)))throw new Error('Prywatny adres jest zablokowany.');return url;
}
// Adres IP jest przypięty do żądania po sprawdzeniu DNS; przekierowania są sprawdzane od nowa.
export async function remoteBytes(input:string,limit:number,redirects=0):Promise<{bytes:Buffer;mime:string}>{
 if(input.startsWith('data:'))return dataBytes(input,limit);
 const url=metadataUrl(input),hostname=url.hostname.replace(/^\[|\]$/g,'');let dnsTimer:ReturnType<typeof setTimeout>|undefined;let addresses:{address:string;family:number}[];try{addresses=isIP(hostname)?[{address:hostname,family:isIP(hostname)}]:await Promise.race([lookup(hostname,{all:true}),new Promise<never>((_,reject)=>{dnsTimer=setTimeout(()=>reject(Error('Upłynął czas DNS.')),5000);})]);}finally{clearTimeout(dnsTimer);}
 if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))throw new Error('Adres metadanych prowadzi do prywatnej sieci.');const chosen=addresses.find(a=>a.family===4)||addresses[0];
 return new Promise((resolve,reject)=>{
  const req=request(url,{method:'GET',headers:{Accept:'application/json,image/png,image/jpeg,image/webp','User-Agent':'FRAME-Wallet/0.6'},lookup:((_host:any,options:any,callback:any)=>options.all?callback(null,[chosen]):callback(null,chosen.address,chosen.family)) as any},response=>{
   if(response.statusCode&&[301,302,303,307,308].includes(response.statusCode)){response.resume();if(!response.headers.location||redirects>=3){reject(new Error('Zbyt wiele przekierowań.'));return;}remoteBytes(new URL(response.headers.location,url).href,limit,redirects+1).then(resolve,reject);return;}
   if(response.statusCode!==200){response.resume();reject(new Error('Nie można pobrać metadanych.'));return;}
   const chunks:Buffer[]=[];let length=0;response.on('data',chunk=>{length+=chunk.length;if(length>limit){response.destroy(new Error('Plik przekracza dozwolony rozmiar.'));return;}chunks.push(chunk);});response.on('error',reject);response.on('end',()=>resolve({bytes:Buffer.concat(chunks),mime:String(response.headers['content-type']||'').split(';')[0].trim().toLowerCase()}));
  });const deadline=setTimeout(()=>req.destroy(new Error('Upłynął czas pobierania metadanych.')),15000);req.on('close',()=>clearTimeout(deadline));req.setTimeout(12000,()=>req.destroy(new Error('Upłynął czas pobierania metadanych.')));req.on('error',reject);req.end();
 });
}

export function dataBytes(uri:string,limit:number){
 if(uri.length>limit*2+200)throw Error('Dane URI są zbyt duże.');
 const match=/^data:([^;,]+)(;charset=utf-8)?(;base64)?,([\s\S]*)$/i.exec(uri);if(!match)throw Error('Nieprawidłowe dane URI.');
 const mime=match[1].toLowerCase();if(!['application/json','image/png','image/jpeg','image/webp','image/svg+xml'].includes(mime))throw Error('Nieobsługiwany format danych URI.');
 if(match[3]&&!/^[a-zA-Z0-9+/=\s]*$/.test(match[4]))throw Error('Nieprawidłowe base64.');
 const bytes=match[3]?Buffer.from(match[4],'base64'):Buffer.from(decodeURIComponent(match[4]));if(bytes.length>limit)throw Error('Dane przekraczają dozwolony rozmiar.');return {bytes,mime};
}
export function resolveMediaUri(uri:string,base?:string){
 uri=uri.trim().replace(/\0/g,'');if(uri.startsWith('data:')){dataBytes(uri,1024*1024);return uri;}
 if(!/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(uri)&&base&&!base.startsWith('data:'))return metadataUrl(new URL(uri,metadataUrl(base)).href).href;
 return metadataUrl(uri).href;
}
export function gatewayCandidates(uri:string){const url=resolveMediaUri(uri);if(url.startsWith('https://ipfs.io/ipfs/')||url.startsWith('https://ipfs.io/ipns/'))return [url,url.replace('https://ipfs.io/','https://dweb.link/')];return [url];}
async function fetchMedia(uri:string,limit:number){let last:unknown;for(const url of gatewayCandidates(uri)){try{return await remoteBytes(url,limit);}catch(e){last=e;}}throw last;}
const metadataCache=new Map<string,{at:number;promise:Promise<any>}>();
export async function remoteMetadata(uri:string){
 const key=resolveMediaUri(uri),old=metadataCache.get(key);if(old&&Date.now()-old.at<300000)return old.promise;
 const promise=fetchMedia(key,1024*1024).then(({bytes})=>{const value=JSON.parse(bytes.toString('utf8'));if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Nieprawidłowe metadane NFT.');return value;}).catch(e=>{metadataCache.delete(key);throw e;});
 if(metadataCache.size>=64)metadataCache.delete(metadataCache.keys().next().value!);metadataCache.set(key,{at:Date.now(),promise});return promise;
}
export async function remoteImage(uri:string){
 const {bytes,mime}=await fetchMedia(uri,4*1024*1024);
 if(mime==='image/svg+xml'||/^\s*(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(bytes.toString('utf8',0,200))){
  const png=await new Promise<Buffer>((resolve,reject)=>{const worker=new Worker(join(typeof __dirname==='string'?__dirname:dirname(fileURLToPath(import.meta.url)),'media-worker.cjs'),{workerData:bytes.toString('utf8'),resourceLimits:{maxOldGenerationSizeMb:32}});const timer=setTimeout(()=>{void worker.terminate();reject(Error('Upłynął czas renderowania SVG.'));},2500);worker.once('message',data=>{clearTimeout(timer);void worker.terminate();data.error?reject(Error(data.error)):resolve(Buffer.from(data.png));});worker.once('error',e=>{clearTimeout(timer);reject(e);});});return `data:image/png;base64,${png.toString('base64')}`;
 }
 const size=imageSize(bytes);if(!['png','jpg','webp'].includes(size.type||'')||!size.width||!size.height||size.width>8192||size.height>8192||size.width*size.height>24000000)throw Error('Nieobsługiwany format lub rozmiar obrazu NFT.');
 return `data:image/${size.type==='jpg'?'jpeg':size.type};base64,${bytes.toString('base64')}`;
}
