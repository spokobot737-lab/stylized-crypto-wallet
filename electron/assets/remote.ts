import { lookup } from 'node:dns/promises';
import { request } from 'node:https';
import { isIP } from 'node:net';
import ipaddr from 'ipaddr.js';

export function publicAddress(address:string){try{const parsed=ipaddr.process(address);return parsed.range()==='unicast';}catch{return false;}}
export function metadataUrl(input:string){
 if(input.startsWith('ipfs://'))input=`https://ipfs.io/ipfs/${input.slice(7).replace(/^ipfs\//,'')}`;
 const url=new URL(input);if(url.protocol!=='https:'||url.username||url.password||(url.port&&url.port!=='443')||input.length>2048)throw new Error('Wymagany jest publiczny adres HTTPS lub IPFS.');
 const host=url.hostname.replace(/^\[|\]$/g,'');if(host==='localhost'||host.endsWith('.local')||host.endsWith('.internal')||(isIP(host)&&!publicAddress(host)))throw new Error('Prywatny adres jest zablokowany.');return url;
}
// Adres IP jest przypięty do żądania po sprawdzeniu DNS; przekierowania są sprawdzane od nowa.
export async function remoteBytes(input:string,limit:number,redirects=0):Promise<{bytes:Buffer;mime:string}>{
 const url=metadataUrl(input),hostname=url.hostname.replace(/^\[|\]$/g,'');const addresses=isIP(hostname)?[{address:hostname,family:isIP(hostname)}]:await lookup(hostname,{all:true});
 if(!addresses.length||addresses.some(a=>!publicAddress(a.address)))throw new Error('Adres metadanych prowadzi do prywatnej sieci.');const chosen=addresses.find(a=>a.family===4)||addresses[0];
 return new Promise((resolve,reject)=>{
  const req=request(url,{method:'GET',headers:{Accept:'application/json,image/png,image/jpeg,image/webp','User-Agent':'FRAME-Wallet/0.4'},lookup:((_host:any,options:any,callback:any)=>options.all?callback(null,[chosen]):callback(null,chosen.address,chosen.family)) as any},response=>{
   if(response.statusCode&&[301,302,303,307,308].includes(response.statusCode)){response.resume();if(!response.headers.location||redirects>=3){reject(new Error('Zbyt wiele przekierowań.'));return;}remoteBytes(new URL(response.headers.location,url).href,limit,redirects+1).then(resolve,reject);return;}
   if(response.statusCode!==200){response.resume();reject(new Error('Nie można pobrać metadanych.'));return;}
   const chunks:Buffer[]=[];let length=0;response.on('data',chunk=>{length+=chunk.length;if(length>limit){response.destroy(new Error('Plik przekracza dozwolony rozmiar.'));return;}chunks.push(chunk);});response.on('error',reject);response.on('end',()=>resolve({bytes:Buffer.concat(chunks),mime:String(response.headers['content-type']||'').split(';')[0].trim().toLowerCase()}));
  });const deadline=setTimeout(()=>req.destroy(new Error('Upłynął czas pobierania metadanych.')),15000);req.on('close',()=>clearTimeout(deadline));req.setTimeout(12000,()=>req.destroy(new Error('Upłynął czas pobierania metadanych.')));req.on('error',reject);req.end();
 });
}
export async function remoteMetadata(uri:string){const {bytes}=await remoteBytes(uri,1024*1024);return JSON.parse(bytes.toString('utf8'));}
export async function remoteImage(uri:string){const {bytes,mime}=await remoteBytes(uri,4*1024*1024);if(!['image/png','image/jpeg','image/webp'].includes(mime))throw new Error('Miniatura musi być obrazem PNG, JPEG lub WebP.');return `data:${mime};base64,${bytes.toString('base64')}`;}
