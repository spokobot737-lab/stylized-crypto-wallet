// @ts-nocheck
import {paymentSchema} from '../../shared/payment';
// Odzyskano z instalatora 0.5.0; format danych i podpisów zachowany.
import {z} from 'zod';
import {imageSize} from 'image-size';
import {getAddress,verifyMessage} from 'ethers';
import {finalizeEvent,getPublicKey,verifyEvent,getEventHash} from 'nostr-tools/pure';
import {wrapManyEvents} from 'nostr-tools/nip59';
import {unwrapEvent} from 'nostr-tools/nip17';
import * as nip49 from 'nostr-tools/nip49';
import {bech32} from '@scure/base';
var CHAT_RELAYS = ["wss://nos.lol", "wss://auth.nostr1.com"];
var hexKey = z.string().regex(/^[a-f0-9]{64}$/);
var eventSchema = z.object({ id: hexKey, pubkey: hexKey, created_at: z.number().int().nonnegative(), kind: z.number().int(), tags: z.array(z.array(z.string().max(2048)).max(8)).max(16), content: z.string().max(24e3), sig: z.string().regex(/^[a-f0-9]{128}$/) }).strict();
var bindingSchema = z.object({ app: z.literal("app.frame.wallet"), purpose: z.literal("FRAME_CHAT_IDENTITY"), version: z.literal(1), address: z.string().regex(/^0x[a-fA-F0-9]{40}$/), publicKey: hexKey, createdAt: z.string().datetime(), expiresAt: z.string().datetime(), relays: z.array(z.enum(CHAT_RELAYS)).min(2).max(3), inboxId: hexKey }).strict();
var invitationSchema = z.object({ binding: bindingSchema, signature: z.string().regex(/^0x[a-fA-F0-9]{130}$/), inbox: eventSchema, profile: eventSchema.optional() }).strict();
function statement(b) {
  return ["FRAME Wallet: upowa\u017Cnienie klucza czatu", `Aplikacja: ${b.app}`, `Cel: ${b.purpose}`, `Wersja: ${b.version}`, `Portfel EVM: ${b.address}`, `Klucz publiczny Nostr: ${b.publicKey}`, `Utworzono: ${b.createdAt}`, `Wygasa: ${b.expiresAt}`, `Relaye: ${b.relays.join(",")}`, `Lista skrzynki Nostr: ${b.inboxId}`, "Ten podpis upowa\u017Cnia osobny klucz wy\u0142\u0105cznie do czatu. Nie jest transakcj\u0105 i nie wymaga \u015Brodk\xF3w."].join("\n");
}
function newBinding(key2, address2, now = Date.now()) {
  const inbox = finalizeEvent({ kind: 10050, created_at: Math.floor(now / 1e3), content: "", tags: CHAT_RELAYS.map((url) => ["relay", url]) }, key2);
  const binding = { app: "app.frame.wallet", purpose: "FRAME_CHAT_IDENTITY", version: 1, address: getAddress(address2), publicKey: getPublicKey(key2), createdAt: new Date(now).toISOString(), expiresAt: new Date(now + 180 * 864e5).toISOString(), relays: [...CHAT_RELAYS], inboxId: inbox.id };
  return { binding, inbox };
}
function verifyInvitation(raw, allowExpired = false, now = Date.now()) {
  try {
    const invite = invitationSchema.parse(raw), b = invite.binding, created = Date.parse(b.createdAt), expires = Date.parse(b.expiresAt);
    if (new Date(created).toISOString() !== b.createdAt || new Date(expires).toISOString() !== b.expiresAt || created > now + 6e4 || expires <= created || expires - created > 180 * 864e5 || getAddress(b.address) !== b.address || new Set(b.relays).size !== b.relays.length) throw 0;
    const inbox = invite.inbox;
    if (inbox.kind !== 10050 || inbox.id !== b.inboxId || inbox.pubkey !== b.publicKey || inbox.content !== "" || Math.abs(inbox.created_at * 1e3 - created) > 1e3 || JSON.stringify(inbox.tags) !== JSON.stringify(b.relays.map((url) => ["relay", url])) || !verifyEvent(inbox) || getAddress(verifyMessage(statement(b), invite.signature)) !== b.address) throw 0;
    if(invite.profile)verifyProfile(invite.profile,b.publicKey);
    if (!allowExpired && expires <= now) throw new Error("Zaproszenie wygas\u0142o. Popro\u015B o nowe.");
    return invite;
  } catch (e) {
    if (e instanceof Error && e.message === "Zaproszenie wygas\u0142o. Popro\u015B o nowe.") throw e;
    throw new Error("Nieprawid\u0142owe zaproszenie lub podpis portfela.");
  }
}
function encode(prefix, value) {
  return prefix + Buffer.from(JSON.stringify(value)).toString("base64url");
}
function decode(prefix, value) {
  if (!value.startsWith(prefix) || value.length > 24e3 || !/^[A-Za-z0-9_-]+$/.test(value.slice(prefix.length))) throw new Error("Nieprawid\u0142owy format zaproszenia lub kopii.");
  return JSON.parse(Buffer.from(value.slice(prefix.length), "base64url").toString("utf8"));
}
var encodeInvitation = (invite) => encode("framechat1:", invite);
var decodeInvitation = (value) => verifyInvitation(decode("framechat1:", value));
function wrapMessage(key2, peer, text2, nonce, application=false, at=Math.floor(Date.now()/1000)) {
  const events = wrapManyEvents({ kind: 14, created_at: at, content: z.string().min(1).max(application?14000:4000).parse(text2), tags: [["p", hexKey.parse(peer)], ["d", nonce],...(application?[["frame","2"]]:[])] }, key2, [peer]);
  const rumor=readMessage(events[0],key2); return { events, id: rumor.id, at:rumor.created_at*1000 };
}
function readMessage(event, key2) {
  if (event.kind !== 1059 || !verifyEvent(event) || event.tags.filter((t) => t[0] === "p").length !== 1 || event.tags.find((t) => t[0] === "p")?.[1] !== getPublicKey(key2)) throw new Error("Nieprawid\u0142owa koperta.");
  const rumor = unwrapEvent(event, key2);
  if (rumor.kind !== 14 || rumor.id !== getEventHash(rumor) || rumor.tags.filter((t) => t[0] === "p").length !== 1 || !hexKey.safeParse(rumor.tags.find((t) => t[0] === "p")?.[1]).success || typeof rumor.content !== "string" || !rumor.content.trim() || Buffer.byteLength(rumor.content)> (rumor.tags.some(t=>t[0]==="frame"&&t[1]==="2")?14000:16000) || !Number.isSafeInteger(rumor.created_at) || rumor.created_at < 0 || rumor.created_at > Date.now() / 1e3 + 300) throw new Error("Nieprawid\u0142owa wiadomo\u015B\u0107.");
  return rumor;
}
var backupSchema = z.object({ version: z.literal(1), invitation: invitationSchema, key: z.string().max(500) }).strict();
var passwordSchema = z.string().min(12, "Has\u0142o kopii musi mie\u0107 co najmniej 12 znak\xF3w.").max(128);
function exportKey(key2, invite, password) {
  return encode("framechat-key1:", { version: 1, invitation: invite, key: nip49.encrypt(key2, passwordSchema.parse(password), 16) });
}
function importKey(value, password) {
  let key2;
  try {
    const data = backupSchema.parse(decode("framechat-key1:", value));
    passwordSchema.parse(password);
    const decoded = bech32.decode(data.key, 500), bytes = bech32.fromWords(decoded.words);
    if (decoded.prefix !== "ncryptsec" || bytes.length !== 91 || bytes[0] !== 2 || bytes[1] !== 16) throw 0;
    const invitation = verifyInvitation(data.invitation, true);
    key2 = nip49.decrypt(data.key, password);
    if (getPublicKey(key2) !== invitation.binding.publicKey) throw 0;
    return { key: key2, invitation };
  } catch {
    key2?.fill(0);
    throw new Error("Nieprawid\u0142owa kopia klucza lub has\u0142o.");
  }
}


export {CHAT_RELAYS,hexKey,eventSchema,invitationSchema,statement,newBinding,verifyInvitation,encodeInvitation,decodeInvitation,wrapMessage,readMessage,exportKey,importKey};

// Profil jest podpisany, ale publikowany wyłącznie w zaproszeniu lub E2EE.
export const nftAvatarSchema=z.object({chain:z.enum(['ETH','SOL','RH']),network:z.enum(['mainnet','testnet']),address:z.string().max(128),tokenId:z.string().max(78).optional(),standard:z.string().max(20),checkedAt:z.number().int()}).strict();
export const profileDataSchema=z.object({version:z.literal(1),name:z.string().trim().min(1).max(32),independent:z.boolean().optional(),bio:z.string().max(280).optional(),banner:z.string().max(4500).refine(validSmallImage).optional(),html:z.string().max(2500).optional(),favorites:z.array(z.enum(['ETH','SOL','BTC','RH'])).max(4).optional(),avatar:z.string().max(4500).refine(validSmallImage).optional(),nft:nftAvatarSchema.optional()}).strict().refine(v=>JSON.stringify(v).length<=10500,'Profil przekracza limit 10 500 znaków.');
export function makeProfile(key,data,at=Math.floor(Date.now()/1000)){return finalizeEvent({kind:0,created_at:at,tags:[['frame-profile','1']],content:JSON.stringify(profileDataSchema.parse(data))},key);}
export function verifyProfile(event,pubkey){event=eventSchema.parse(event);if(event.kind!==0||event.pubkey!==pubkey||!verifyEvent(event)||event.created_at>Date.now()/1000+300||JSON.stringify(event.tags)!==JSON.stringify([['frame-profile','1']]))throw Error('Nieprawidłowy podpis profilu.');return profileDataSchema.parse(JSON.parse(event.content));}
export const appPayloadSchema=z.discriminatedUnion('type',[
 z.object({version:z.literal(2),type:z.enum(['request','accept']),invitation:invitationSchema}).strict(),
 z.object({version:z.literal(2),type:z.literal('profile'),profile:eventSchema}).strict(),
 z.object({version:z.literal(2),type:z.literal('transfer'),payment:paymentSchema}).strict(),
 z.object({version:z.literal(2),type:z.literal('image'),image:z.string().max(11000).refine(validSmallImage),text:z.string().max(1000)}).strict()
]);
export function readPayload(rumor){if(!rumor.tags.some(t=>t[0]==='frame'&&t[1]==='2'))return null;return appPayloadSchema.parse(JSON.parse(rumor.content));}
export function compareMessages(a,b){return a.at-b.at||(a.id<b.id?-1:a.id>b.id?1:0);}

function validSmallImage(value){try{const m=/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(value);if(!m)return false;const bytes=Buffer.from(m[2],'base64');const s=imageSize(bytes);return ['jpg','png','webp'].includes(s.type)&&bytes.length<=7680&&s.width>0&&s.height>0&&s.width<=768&&s.height<=768;}catch{return false;}}

export function inboxCapability(key,identity){return finalizeEvent({kind:10050,created_at:Math.max(Math.floor(Date.now()/1000),identity.inbox.created_at+1),content:'',tags:[...identity.binding.relays.map(url=>['relay',url]),['frame','2']]},key);}
