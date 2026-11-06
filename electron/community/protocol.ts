import {z} from 'zod';
import {verifyEvent} from 'nostr-tools/pure';
import {invitationSchema,verifyInvitation} from '../chat/protocol';
export const TOPIC='frame-wallet-community-v1';
export const forumPayload=z.discriminatedUnion('type',[
 z.object({version:z.literal(1),type:z.literal('post'),text:z.string().trim().min(1).max(1600),parent:z.string().regex(/^[a-f0-9]{64}$/).optional(),identity:invitationSchema}).strict(),
 z.object({version:z.literal(1),type:z.literal('presence'),expires:z.number().int(),identity:invitationSchema}).strict(),
 z.object({version:z.literal(1),type:z.literal('profile'),identity:invitationSchema}).strict()
]);
export function verifyForumEvent(event:any,now=Date.now()){
 if(event.kind!==30078||!verifyEvent(event)||event.content.length>24000||event.tags.length>6||!event.tags.some((t:string[])=>t[0]==='t'&&t[1]===TOPIC)||!event.tags.some((t:string[])=>t[0]==='d'&&t[1]?.startsWith('frame-community:'))||event.created_at>now/1000+60)throw Error('Nieprawidłowy wpis społeczności.');
 const payload=forumPayload.parse(JSON.parse(event.content)),invite=verifyInvitation(payload.identity,true),b=invite.binding;
 if(b.publicKey!==event.pubkey||!invite.profile||event.created_at*1000<Date.parse(b.createdAt)-1000||event.created_at*1000>Date.parse(b.expiresAt))throw Error('Nieprawidłowe powiązanie autora.');
 if(payload.type==='presence'&&(payload.expires<=now/1000||payload.expires>event.created_at+120||event.created_at<now/1000-120))throw Error('Status online wygasł.');
 return payload;
}
