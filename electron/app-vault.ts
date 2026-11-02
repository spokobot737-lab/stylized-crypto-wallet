import { randomBytes, scrypt as scryptCallback, createCipheriv, createDecipheriv } from 'node:crypto';
import { z } from 'zod';
export interface DeviceProtector { seal(text:string):Promise<Buffer>; open(bytes:Buffer):Promise<string>; }
export const pinSchema=z.string().regex(/^\d{6,12}$/, 'PIN musi zawierać od 6 do 12 cyfr.');
export const storedWalletSchema=z.object({id:z.string().uuid(),name:z.string().trim().min(1).max(32),mnemonic:z.string().max(512),passphrase:z.string().max(256),legacyHistory:z.boolean().optional(),chatSecretKey:z.string().regex(/^[a-f0-9]{64}$/).optional()}).strict();
export const collectionSchema=z.object({wallets:z.array(storedWalletSchema).max(50),activeId:z.string().uuid().nullable()}).strict().superRefine((value,ctx)=>{
 const ids=new Set(value.wallets.map(w=>w.id));if(ids.size!==value.wallets.length|| (value.activeId!==null&&!ids.has(value.activeId)) || (value.wallets.length>0&&value.activeId===null))ctx.addIssue({code:'custom',message:'Nieprawidłowa kolekcja portfeli.'});
});
export type Collection=z.infer<typeof collectionSchema>;
const envelopeSchema=z.object({version:z.literal(2),kdf:z.literal('scrypt-65536-8-1-device'),salt:z.string().regex(/^[a-f0-9]{32}$/),device:z.string().min(16).max(32768),iv:z.string().regex(/^[a-f0-9]{24}$/),tag:z.string().regex(/^[a-f0-9]{32}$/),ciphertext:z.string().regex(/^[a-f0-9]+$/).max(262144)}).strict();
export type Envelope=z.infer<typeof envelopeSchema>;
const aad=Buffer.from('FRAME:COLLECTION:2');
async function derive(pin:string,salt:Buffer,device:string):Promise<Buffer>{pinSchema.parse(pin);if(!/^[a-f0-9]{64}$/.test(device))throw new Error('Nieprawidłowy klucz urządzenia.');return new Promise((resolve,reject)=>scryptCallback(`${pin}:${device}`,salt,32,{N:65536,r:8,p:1,maxmem:128*1024*1024},(e,key)=>e?reject(e):resolve(key)));}
export function sealCollection(value:Collection,key:Buffer,header:Pick<Envelope,'salt'|'device'>):Envelope{
 const plain=Buffer.from(JSON.stringify(collectionSchema.parse(value))),iv=randomBytes(12);try{const cipher=createCipheriv('aes-256-gcm',key,iv);cipher.setAAD(aad);const ciphertext=Buffer.concat([cipher.update(plain),cipher.final()]);return {version:2,kdf:'scrypt-65536-8-1-device',...header,iv:iv.toString('hex'),tag:cipher.getAuthTag().toString('hex'),ciphertext:ciphertext.toString('hex')};}finally{plain.fill(0);}
}
export async function newCollection(value:Collection,pin:string,protector:DeviceProtector){
 pinSchema.parse(pin);const device=randomBytes(32).toString('hex');const salt=randomBytes(16);const sealed=await protector.seal(device);const key=await derive(pin,salt,device);
 try{return {key,envelope:sealCollection(value,key,{salt:salt.toString('hex'),device:sealed.toString('base64')})};}catch(e){key.fill(0);throw e;}
}
export async function openCollection(raw:unknown,pin:string,protector:DeviceProtector){
 pinSchema.parse(pin);const envelope=envelopeSchema.parse(raw);const device=await protector.open(Buffer.from(envelope.device,'base64'));const key=await derive(pin,Buffer.from(envelope.salt,'hex'),device);let plain:Buffer|undefined;
 try{const decipher=createDecipheriv('aes-256-gcm',key,Buffer.from(envelope.iv,'hex'));decipher.setAAD(aad);decipher.setAuthTag(Buffer.from(envelope.tag,'hex'));plain=Buffer.concat([decipher.update(Buffer.from(envelope.ciphertext,'hex')),decipher.final()]);return {key,envelope,collection:collectionSchema.parse(JSON.parse(plain.toString()))};}
 catch{key.fill(0);throw new Error('Nieprawidłowy PIN lub uszkodzony sejf aplikacji.');}finally{plain?.fill(0);}
}
