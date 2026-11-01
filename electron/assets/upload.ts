import { z } from 'zod';
import { apiJson } from './config';
import type { IntegrationKeys } from './types';

const schema=z.object({name:z.string().trim().min(1).max(32),description:z.string().max(1000),imageBase64:z.string().max(7*1024*1024).regex(/^[A-Za-z0-9+/]*={0,2}$/),mime:z.enum(['image/png','image/jpeg','image/webp'])}).strict();
export async function uploadMetadata(raw:unknown,keys:IntegrationKeys){
 const input=schema.parse(raw);if(!keys.pinata)throw new Error('Dodaj token Pinata w Ustawieniach → Integracje albo użyj istniejącego adresu metadanych.');const bytes=Buffer.from(input.imageBase64,'base64');if(!bytes.length||bytes.length>5*1024*1024)throw new Error('Obraz musi mieć od 1 bajta do 5 MB.');
 const valid=input.mime==='image/png'?bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):input.mime==='image/jpeg'?bytes[0]===255&&bytes[1]===216&&bytes[2]===255:bytes.subarray(0,4).toString()==='RIFF'&&bytes.subarray(8,12).toString()==='WEBP';if(!valid)throw new Error('Zawartość pliku nie zgadza się z formatem obrazu.');
 async function upload(data:Uint8Array,type:string,name:string){const form=new FormData();form.set('network','public');form.set('file',new Blob([new Uint8Array(data)],{type}),name);const response=await apiJson('https://uploads.pinata.cloud/v3/files',{method:'POST',headers:{Authorization:`Bearer ${keys.pinata}`},body:form});const cid=z.string().regex(/^[A-Za-z0-9]{30,120}$/).parse(response.data?.cid);return `ipfs://${cid}`;}
 const image=await upload(bytes,input.mime,`grafika.${input.mime.split('/')[1]}`);const uri=await upload(Buffer.from(JSON.stringify({name:input.name,description:input.description,image,properties:{files:[{uri:image,type:input.mime}]}})),'application/json','metadane.json');return {uri,image};
}
