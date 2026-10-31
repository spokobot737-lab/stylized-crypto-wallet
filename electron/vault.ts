import { randomBytes, scrypt as scryptCallback, createCipheriv, createDecipheriv } from 'node:crypto';
import { readFile, writeFile, rename, mkdir, open } from 'node:fs/promises';
import { dirname } from 'node:path';
import { z } from 'zod';
const envelope = z.object({ version:z.literal(1), kdf:z.literal('scrypt-65536-8-1'), salt:z.string().regex(/^[a-f0-9]{32}$/), iv:z.string().regex(/^[a-f0-9]{24}$/), tag:z.string().regex(/^[a-f0-9]{32}$/), ciphertext:z.string().regex(/^[a-f0-9]+$/).max(8192) }).strict();
const content = z.object({mnemonic:z.string().max(512),passphrase:z.string().max(256)}).strict();
export type Secret = z.infer<typeof content>;
export function checkPassword(password: string) { if (typeof password !== 'string' || password.length < 12 || password.length > 256) throw new Error('Hasło musi mieć od 12 do 256 znaków.'); }
function derive(password: string, salt: Buffer): Promise<Buffer> { return new Promise((resolve,reject)=>scryptCallback(password.normalize('NFKC'),salt,32,{N:65536,r:8,p:1,maxmem:128*1024*1024},(err,key)=>err?reject(err):resolve(key))); }
export async function encrypt(secret: Secret, password: string) {
 checkPassword(password); const salt=randomBytes(16),iv=randomBytes(12),key=await derive(password,salt);
 const plain=Buffer.from(JSON.stringify(content.parse(secret)));
 try { const cipher=createCipheriv('aes-256-gcm',key,iv); cipher.setAAD(Buffer.from('FRAME:VAULT:1')); const ciphertext=Buffer.concat([cipher.update(plain),cipher.final()]); return {version:1 as const,kdf:'scrypt-65536-8-1' as const,salt:salt.toString('hex'),iv:iv.toString('hex'),tag:cipher.getAuthTag().toString('hex'),ciphertext:ciphertext.toString('hex')}; }
 finally { key.fill(0); plain.fill(0); }
}
export async function decrypt(raw: unknown, password: string): Promise<Secret> {
 checkPassword(password); const data=envelope.parse(raw),key=await derive(password,Buffer.from(data.salt,'hex')); let plain: Buffer|undefined;
 try { const cipher=createDecipheriv('aes-256-gcm',key,Buffer.from(data.iv,'hex')); cipher.setAAD(Buffer.from('FRAME:VAULT:1')); cipher.setAuthTag(Buffer.from(data.tag,'hex')); plain=Buffer.concat([cipher.update(Buffer.from(data.ciphertext,'hex')),cipher.final()]); return content.parse(JSON.parse(plain.toString())); }
 catch { throw new Error('Nieprawidłowe hasło lub uszkodzony plik portfela.'); }
 finally { key.fill(0); plain?.fill(0); }
}
export async function atomicWrite(path: string, value: unknown) { await mkdir(dirname(path),{recursive:true,mode:0o700}); const temp=`${path}.${randomBytes(8).toString('hex')}.tmp`; const handle=await open(temp,'wx',0o600); try { await handle.writeFile(JSON.stringify(value)); await handle.sync(); } finally {await handle.close();} await rename(temp,path); }
export async function createVault(path: string, secret: Secret, password: string) {
 const value=await encrypt(secret,password); await mkdir(dirname(path),{recursive:true,mode:0o700});
 // Exclusive create: never replace a pre-existing wallet, including after two simultaneous requests.
 await writeFile(path,JSON.stringify(value),{flag:'wx',mode:0o600});
}
export async function readVault(path: string, password: string) { return decrypt(JSON.parse(await readFile(path,'utf8')),password); }
