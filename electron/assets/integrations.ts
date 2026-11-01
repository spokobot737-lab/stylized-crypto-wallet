import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { atomicWrite } from '../vault';
import type { DeviceProtector } from '../app-vault';
import type { IntegrationKeys, IntegrationStatus, Language } from './types';
import type { Network } from '../types';

const key=z.string().trim().min(1).max(4096).regex(/^[A-Za-z0-9_.=-]+$/);
const schema=z.object({alchemy:key.optional(),helius:key.optional(),pinata:key.optional()}).strict();
export const integrationUpdate=z.object({alchemy:key.nullable().optional(),helius:key.nullable().optional(),pinata:key.nullable().optional()}).strict();
export class Integrations {
 network:Network='mainnet'; language:Language='pl'; private path:string;
 constructor(directory:string,private protector:DeviceProtector){this.path=join(directory,'integrations.vault');}
 async keys():Promise<IntegrationKeys>{try{const envelope=z.object({sealed:z.string().max(32768)}).strict().parse(JSON.parse(await readFile(this.path,'utf8')));return schema.parse(JSON.parse(await this.protector.open(Buffer.from(envelope.sealed,'base64'))));}catch(e:any){if(e.code==='ENOENT')return {};throw new Error('Nie można otworzyć zapisanych kluczy API.');}}
 async status():Promise<IntegrationStatus>{const k=await this.keys();return {alchemy:!!k.alchemy,helius:!!k.helius,pinata:!!k.pinata};}
 async save(raw:unknown){const update=integrationUpdate.parse(raw),keys=await this.keys();for(const name of ['alchemy','helius','pinata'] as const){if(update[name]===null)delete keys[name];else if(update[name]!==undefined)keys[name]=update[name]!;}const sealed=await this.protector.seal(JSON.stringify(schema.parse(keys)));await atomicWrite(this.path,{sealed:sealed.toString('base64')});return this.status();}
}
