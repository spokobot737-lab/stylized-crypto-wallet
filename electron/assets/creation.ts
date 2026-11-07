import {createHash} from 'node:crypto';
import {z} from 'zod';
import {apiJson} from './config';
import type {IntegrationKeys} from './types';
export const fileInput=z.object({name:z.string().trim().min(1).max(32),description:z.string().max(1000),filename:z.string().min(1).max(160).refine(v=>!/[\/\\\x00-\x1f]/.test(v)),base64:z.string().max(7*1024*1024).regex(/^[A-Za-z0-9+/]*={0,2}$/),storage:z.enum(['embedded','pinata']),publicConsent:z.literal(true)}).strict();
export function inspectFile(bytes:Buffer){
 if(!bytes.length||bytes.length>5*1024*1024)throw Error('Plik musi mieć od 1 bajta do 5 MB.');
 if(bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])))return 'image/png';
 if(bytes[0]===255&&bytes[1]===216&&bytes[2]===255)return 'image/jpeg';
 if(bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP')return 'image/webp';
 if(bytes.subarray(0,5).toString()==='%PDF-')return 'application/pdf';
 if(bytes.subarray(0,4).equals(Buffer.from([80,75,3,4])))return 'application/zip';
 try{const text=new TextDecoder('utf-8',{fatal:true}).decode(bytes);if(!/[\x00-\x08\x0e-\x1f]/.test(text))return 'text/plain';}catch{}
 return 'application/octet-stream';
}
export async function createMetadata(raw:unknown,keys:IntegrationKeys){
 const input=fileInput.parse(raw),bytes=Buffer.from(input.base64,'base64');if(bytes.toString('base64')!==input.base64)throw Error('Nieprawidłowe kodowanie pliku.');
 const mime=inspectFile(bytes),hash=createHash('sha256').update(bytes).digest('hex');
 async function pin(data:Buffer,type:string,filename:string){if(!keys.pinata)throw Error('Plik wymaga publicznego zapisu. Dodaj własny token Pinata w Integracjach albo użyj pliku do 8 KiB i zapisu w Ethereum.');const form=new FormData();form.set('network','public');form.set('file',new Blob([new Uint8Array(data)],{type}),filename);let r:any;try{r=await apiJson('https://uploads.pinata.cloud/v3/files',{method:'POST',headers:{Authorization:`Bearer ${keys.pinata}`},body:form});}catch(e:any){throw Error(e.status===401||e.status===403?'Zapis IPFS odrzucony. Sprawdź token Pinata i uprawnienie do publicznego zapisu w Ustawieniach → Integracje.':e.status===429?'Limit bezpłatnego hostingu IPFS. Odczekaj i ponów zapis; NFT nie zostało podpisane.':'Nie udało się zapisać pliku w IPFS. Sprawdź połączenie, konto i limit hostingu. NFT nie zostało podpisane.');}return 'ipfs://'+z.string().regex(/^[A-Za-z0-9]{30,120}$/).parse(r.data?.cid);}
 let fileUri:string;
 if(input.storage==='embedded'){if(bytes.length>8192)throw Error('Zapis w łańcuchu obsługuje pliki do 8 KiB. Większe pliki wymagają hostingu.');fileUri=`data:${mime};base64,${input.base64}`;}
 else{if(['application/octet-stream','application/zip'].includes(mime))throw Error('Pinata ogranicza pliki binarne. Dla tego formatu użyj pliku do 8 KiB w Ethereum albo własnego publicznego URI w Zaawansowanych.');fileUri=await pin(bytes,mime,input.filename);}
 const metadata={name:input.name,description:input.description,...mime.startsWith('image/')?{image:fileUri}:{},animation_url:fileUri,properties:{files:[{uri:fileUri,type:mime,size:bytes.length}],frame_original:{version:1,algorithm:'sha256',hash,size:bytes.length,mime,filename:input.filename}}};
 const data=Buffer.from(JSON.stringify(metadata));const uri=input.storage==='embedded'?'data:application/json;base64,'+data.toString('base64'):await pin(data,'application/json','metadata.json');
 if(uri.length>24000)throw Error('Metadane przekraczają limit 24 000 znaków.');
 return {version:1 as const,uri,hash,mime,size:bytes.length,filename:input.filename,name:input.name,storage:input.storage,fileUri};
}
