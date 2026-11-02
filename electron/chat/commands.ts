import {z} from 'zod';
import {pinSchema} from '../app-vault';
var base = { walletId: z.string().uuid() };
var chatCommandSchema = z.discriminatedUnion("action", [
  z.object({ ...base, action: z.literal("view") }).strict(),
  z.object({ ...base, action: z.literal("activate") }).strict(),
  z.object({ ...base, action: z.literal("share") }).strict(),
  z.object({ ...base, action: z.literal("preview"), invitation: z.string().max(24e3) }).strict(),
  z.object({ ...base, action: z.literal("accept"), invitation: z.string().max(24e3), previousKey: z.string().regex(/^[a-f0-9]{64}$/).optional() }).strict(),
  z.object({ ...base, action: z.literal("block"), address: z.string().max(42), blocked: z.boolean() }).strict(),
  z.object({ ...base, action: z.literal("send"), address: z.string().max(42), text: z.string().trim().max(4e3),image:z.string().max(5600000).optional() }).strict(),
  z.object({ ...base, action: z.literal("retry"), id: z.string().regex(/^[a-f0-9]{64}$/) }).strict(),
  z.object({ ...base, action: z.literal("export"), pin: pinSchema, password: z.string().min(12).max(128) }).strict(),
  z.object({ ...base, action: z.literal("import"), pin: pinSchema, password: z.string().min(12).max(128), backup: z.string().max(24e3), replace: z.boolean() }).strict(),
  z.object({...base,action:z.literal('retry-request'),address:z.string().max(42)}).strict(),
  z.object({...base,action:z.literal('request'),invitation:z.string().max(24000),previousKey:z.string().regex(/^[a-f0-9]{64}$/).optional()}).strict(),
  z.object({...base,action:z.literal('answer'),id:z.string().regex(/^[a-f0-9]{64}$/),accept:z.boolean()}).strict(),
  z.object({...base,action:z.literal('alias'),address:z.string().max(42),alias:z.string().max(32)}).strict(),
  z.object({...base,action:z.literal('avatar'),image:z.string().max(5600000).nullable().optional(),nft:z.object({chain:z.enum(['ETH','SOL']),network:z.enum(['mainnet','testnet']),address:z.string().max(128),tokenId:z.string().regex(/^\d{1,78}$/).optional()}).strict().optional()}).strict()

]);


export {chatCommandSchema};
