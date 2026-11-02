// @ts-nocheck
import {copyFile,readFile} from 'node:fs/promises';
import {constants} from 'node:fs';
import {randomUUID} from 'node:crypto';
import {z} from 'zod';
import {getPublicKey} from 'nostr-tools/pure';
import {getConversationKey,encrypt,decrypt} from 'nostr-tools/nip44';
import {atomicWrite} from '../vault';
import {CHAT_RELAYS,invitationSchema,verifyInvitation,encodeInvitation,decodeInvitation,wrapMessage,readMessage} from './protocol';
import {inboxCapability,makeProfile,verifyProfile,profileDataSchema,readPayload,compareMessages,appPayloadSchema} from './protocol';
import {createRelay} from './transport';
var messageSchema = z.object({ id: z.string().regex(/^[a-f0-9]{64}$/), peer: z.string().max(42), peerKey: z.string().regex(/^[a-f0-9]{64}$/), text: z.string().max(4e3), image:z.string().max(11000).optional(), at: z.number().int(), outgoing: z.boolean(), status: z.enum(["oczekuje", "przyj\u0119to przez relay", "b\u0142\u0105d"]), recovered: z.boolean().optional() }).strict();
var targetSchema = z.object({ event: z.custom((e) => !!e && typeof e === "object" && JSON.stringify(e).length < 52000), relays: z.array(z.enum(CHAT_RELAYS)).max(3), accepted: z.array(z.enum(CHAT_RELAYS)).max(3) }).strict();
var stateSchema = z.object({ version: z.literal(2), requests:z.array(z.object({invitation:invitationSchema,id:z.string(),at:z.number(),receivedAt:z.number().optional()}).strict()).max(30).default([]), rejected:z.array(z.string()).max(100).default([]), controlSeen:z.array(z.string()).max(1000).default([]), shared:z.boolean().default(false), identitySince:z.number().optional(), walletId: z.string().uuid(), identity: invitationSchema, contacts: z.array(z.object({ invitation: invitationSchema, blocked: z.boolean(), pending:z.boolean().optional(), alias:z.string().max(32).optional(),since:z.number().optional() }).strict()).max(100), messages: z.array(messageSchema).max(2e3), outbox: z.array(z.object({ id: z.string(), peer: z.string(), targets: z.array(targetSchema).length(2), attempts: z.number().int().nonnegative(), control:z.boolean().optional(), invitation:invitationSchema.optional() }).strict()).max(200) }).strict();
class ChatStore {
  constructor(path, key2, walletId, address2, valid, factory = createRelay) {
    this.path = path;
    this.walletId = walletId;
    this.address = address2;
    this.valid = valid;
    this.factory = factory;
    this.key = Uint8Array.from(key2);
    this.pubkey = getPublicKey(key2);
    this.storageKey = getConversationKey(key2, this.pubkey);
  }
  state;
  key;
  storageKey;
  pubkey;
  closed = false;
  serial = Promise.resolve();
  dmRelays=new Map();
  capabilities=new Set();
  nextDiscovery=0;
  discovering=false;
  peers = /* @__PURE__ */ new Map();
  timer;
  flushing = false;
  started = Date.now();
  deferred=new Map();
  seen = /* @__PURE__ */ new Set();
  remember(id){this.seen.add(id);if(this.seen.size>5000)this.seen.delete(this.seen.values().next().value);}
  replayDeferred(peerKey){for(const [id,value]of this.deferred)if(value.peerKey===peerKey){this.deferred.delete(id);queueMicrotask(()=>void this.receive(value.event).catch(()=>{}));}}
  refreshHistory(){this.seen.clear();for(const p of this.peers.values())p.relay.close();this.peers.clear();void this.tick();}
  guard() {
    if (this.closed) throw new Error("Czat zablokowany.");
    this.valid();
  }
  mutate(fn) {
    const operation = this.serial.then(async () => {
      this.guard();
      return fn();
    });
    this.serial = operation.catch(() => {
    });
    return operation;
  }
  async load() {
    try {
      const file = await readFile(this.path, "utf8");
      this.guard();
      if (file.length > 32e6) throw 0;
      const envelope2 = z.object({ version: z.literal(1), data: z.string().max(32e6) }).strict().parse(JSON.parse(file));
      const raw=JSON.parse(decrypt(envelope2.data,this.storageKey));
      if(raw.version===1){try{await copyFile(this.path,this.path+'.v1.bak',constants.COPYFILE_EXCL);}catch(e){if(e.code!=='EEXIST')throw e;}
        // Kolejka zachowuje oryginalny rumor. Naprawiamy czas tylko tam, gdzie jest dowód.
        for(const q of raw.outbox||[]){const event=q.targets?.[0]?.event;if(event){const rumor=readMessage(event,this.key);const m=raw.messages.find(m=>m.id===rumor.id);if(m)m.at=rumor.created_at*1000;}}
        for(const m of raw.messages||[])m.at=Math.floor(m.at/1000)*1000;raw.version=2;
      }
      const state=stateSchema.parse(raw); state.messages.sort(compareMessages);
      if (state.walletId !== this.walletId || state.identity.binding.publicKey !== this.pubkey || state.identity.binding.address !== this.address) throw 0;
      verifyInvitation(state.identity, true);
      for (const c of state.contacts) verifyInvitation(c.invitation, true);
      this.state = state;
      if(raw.version===2)await this.save();
      this.start();
      return true;
    } catch (e) {
      if (e?.code === "ENOENT") return false;
      throw new Error("Nie mo\u017Cna odszyfrowa\u0107 historii czatu. Przywr\xF3\u0107 w\u0142a\u015Bciwy klucz z kopii.");
    }
  }
  async initialize(identity, replace = false,since=Date.parse(identity.binding.createdAt)) {
    return this.mutate(async () => {
      this.guard();
      if (identity.binding.publicKey !== this.pubkey || identity.binding.address !== this.address) throw new Error("Klucz nie pasuje do portfela.");
      if (this.state && !replace) {this.state.identitySince=Math.min(this.state.identitySince??Date.parse(this.state.identity.binding.createdAt),since);this.state.identity = {...identity,...this.state.identity.profile?{profile:this.state.identity.profile}:{}};if(this.state.shared&&this.state.identity.profile)for(const c of this.state.contacts)if(!c.blocked&&!c.pending&&(c.invitation.profile||this.capabilities.has(c.invitation.binding.publicKey)))this.queueControl(c.invitation,{version:2,type:'request',invitation:this.state.identity});}
      else this.state = { version: 2, identitySince:since, walletId: this.walletId, identity, contacts: [], messages: [], outbox: [], requests:[],rejected:[],controlSeen:[],shared:false };
      await this.save();
      this.start();
    });
  }
  async save() {
    try {
      this.guard();
      const state = stateSchema.parse(this.state);
      const data=encrypt(JSON.stringify(state),this.storageKey);if(data.length>31000000)throw Error('Osiągnięto limit rozmiaru historii czatu. Zapis zatrzymano; dotychczasowy plik zachowano.');await atomicWrite(this.path,{version:1,data});
      this.guard();
    } catch (e) {
      this.close();
      throw e;
    }
  }
  start() {
    if (this.timer) return;
    this.timer = setInterval(() => void this.tick(), 5e3);
    this.timer.unref();
    void this.tick();
  }
  async tick() {
    if (this.closed || !this.state) return;
    for (const url of this.state.identity.binding.relays) {
      const old = this.peers.get(url);
      if (old?.relay.connected || old && old.retryAt > Date.now()) continue;
      old?.relay.close();
      const peer = { relay: this.factory(url, this.key, this.pubkey, (event) => {
        void this.receive(event).catch(() => {
        });
      }), retryAt: Date.now() + 15e3, attempts: (old?.attempts || 0) + 1 };
      this.peers.set(url, peer);
      void peer.relay.connect().then(async () => {
        this.guard();
        peer.attempts = 0;
        await peer.relay.publish(inboxCapability(this.key,this.state.identity));
        await this.discover(peer.relay);

      }).catch(() => {
      }).finally(() => {
        peer.retryAt = Date.now() + Math.min(6e4, 2e3 * 2 ** Math.min(peer.attempts, 5));
      });
    }
    if(Date.now()>=this.nextDiscovery){this.nextDiscovery=Date.now()+60000;const connected=[...this.peers.values()].find(p=>p.relay.connected);if(connected)void this.discover(connected.relay,true).catch(()=>{});}
    await this.flush();
  }
  async discover(relay,onlyLegacy=false){
    if(this.discovering||!relay.inbox||this.closed)return;this.discovering=true;
    try{for(const c of [...this.state.contacts]){if(c.blocked||onlyLegacy&&c.invitation.profile)continue;
      const list=await relay.inbox(c.invitation.binding.publicKey).catch(()=>undefined);this.guard();const relays=Array.isArray(list)?list:list?.relays;
      if(relays?.length)this.dmRelays.set(c.invitation.binding.publicKey,relays.filter(r=>c.invitation.binding.relays.includes(r)));
      if(list?.frameVersion>=2&&!c.invitation.profile&&!this.capabilities.has(c.invitation.binding.publicKey)){this.capabilities.add(c.invitation.binding.publicKey);await this.mutate(async()=>{if(this.state.shared&&this.state.identity.profile&&!c.pending){this.queueControl(c.invitation,{version:2,type:'profile',profile:this.state.identity.profile});await this.save();}});}
    }}finally{this.discovering=false;}
  }
  view() {
    this.guard();
    const relays = CHAT_RELAYS.map((url) => ({ url, connected: !!this.peers.get(url)?.relay.connected })), connected = relays.filter((r) => r.connected).length;
    return structuredClone({ active: !!this.state, address: this.address, publicKey: this.state ? this.pubkey : void 0, expiresAt: this.state?.identity.binding.expiresAt, connection: connected === relays.length ? "po\u0142\u0105czono" : connected ? "cz\u0119\u015Bciowe po\u0142\u0105czenie" : Date.now() - this.started < 12e3 ? "\u0142\u0105czenie" : "brak po\u0142\u0105czenia", relays, historyWarnings:[...this.peers.values()].map(p=>p.relay.historyWarning).filter(Boolean).concat(this.state?.messages.length>=2000?['Osiągnięto limit 2000 wiadomości. Dalszy odbiór historii jest wstrzymany; dotychczasowe dane zachowano.']:[]), contacts: this.state?.contacts || [], requests:this.state?.requests||[], profile:this.state?.identity.profile, shared:this.state?.shared||false, messages: [...(this.state?.messages||[])].sort(compareMessages).map((m) => ({ ...m, retryable: this.state.outbox.some((q) => q.id === m.id) })) || [] });
  }
  identity() {
    this.guard();
    if (!this.state) throw new Error("Najpierw aktywuj czat.");
    return this.state.identity;
  }
  async share() {return this.mutate(async()=>{const first=!this.state.shared;this.state.shared=true;if(first&&this.state.identity.profile)for(const c of this.state.contacts)if(!c.blocked&&!c.pending&&(c.invitation.profile||this.capabilities.has(c.invitation.binding.publicKey)))this.queueControl(c.invitation,{version:2,type:'profile',profile:this.state.identity.profile});await this.save();return encodeInvitation(verifyInvitation(this.identity()));});}
  async updateProfile(data){return this.mutate(async()=>{
    const old=this.state.identity.profile;const clean=profileDataSchema.parse(data);
    if(old&&JSON.stringify(verifyProfile(old,this.pubkey))===JSON.stringify(clean))return;
    const profile=makeProfile(this.key,clean,Math.max(Math.floor(Date.now()/1000),(old?.created_at||0)+1));
    this.state.identity.profile=profile;
    for(const c of this.state.contacts)if(this.state.shared&&!c.blocked&&!c.pending&&(c.invitation.profile||this.capabilities.has(c.invitation.binding.publicKey)))this.queueControl(c.invitation,{version:2,type:'profile',profile});
    await this.save();
  });}
  queueControl(invitation,payload){
    if(this.state.outbox.length>=200)throw Error('Kolejka czatu jest pełna.');
    const b=invitation.binding;const {events,id}=wrapMessage(this.key,b.publicKey,JSON.stringify(appPayloadSchema.parse(payload)),randomUUID(),true);
    this.state.outbox.push({id,peer:b.address,invitation,control:true,attempts:0,targets:[{event:events[0],relays:this.state.identity.binding.relays,accepted:[]},{event:events[1],relays:b.relays,accepted:[]}]});
  }
  async requestContact(value,previousKey){
    const preview=this.preview(value);if(!preview.invitation.profile)throw Error('Starszy kontakt: wymagane zaproszenie zwrotne lub aktualizacja Frame Chat.');
    await this.mutate(async()=>{
     if(preview.previousKey!==previousKey)throw Error('Zmiana klucza wymaga zaakceptowania.');
     let c=this.state.contacts.find(c=>c.invitation.binding.address===preview.invitation.binding.address);
     if(c?.blocked)throw Error('Najpierw odblokuj kontakt.');
     if(c){c.since=preview.previousKey?undefined:c.since??Date.parse(c.invitation.binding.createdAt);c.invitation=preview.invitation;if(preview.previousKey){c.pending=true;this.state.outbox=this.state.outbox.filter(q=>q.peer!==c.invitation.binding.address);}}
     else{if(this.state.contacts.length>=100)throw Error('Limit kontaktów.');c={invitation:preview.invitation,pending:true,blocked:false};this.state.contacts.push(c);}
     this.state.rejected=this.state.rejected.filter(k=>k!==c.invitation.binding.publicKey);
     this.state.shared=true;this.queueControl(c.invitation,{version:2,type:'request',invitation:this.identity()});await this.save();});void this.flush();
  }
  async retryRequest(address){await this.mutate(async()=>{const c=this.state.contacts.find(c=>c.invitation.binding.address===address);if(!c||c.blocked||!c.pending)throw Error('Brak oczekującej prośby.');const queued=this.state.outbox.filter(q=>q.control&&q.peer===address);if(queued.length)for(const q of queued)q.attempts=0;else this.state.shared=true;this.queueControl(c.invitation,{version:2,type:'request',invitation:this.identity()});await this.save();});void this.flush();}
  async answerRequest(id,accept){return this.mutate(async()=>{
    const req=this.state.requests.find(r=>r.id===id);if(!req)throw Error('Prośba jest niedostępna.');const invite=verifyInvitation(req.invitation);const b=invite.binding;
    if(accept){this.state.shared=true;const old=this.state.contacts.find(c=>c.invitation.binding.address===b.address);if(old&&old.invitation.binding.publicKey!==b.publicKey)throw Error('Inny klucz znanego kontaktu: dodaj zaproszenie i jawnie zaakceptuj zmianę klucza.');if(old){old.invitation=invite;old.pending=false;}else{if(this.state.contacts.length>=100)throw Error('Limit kontaktów.');this.state.contacts.push({invitation:invite,blocked:false});}this.queueControl(invite,{version:2,type:'accept',invitation:this.identity()});}
    else this.state.rejected=[...new Set([...this.state.rejected,b.publicKey])].slice(-100);
    if(accept)this.state.rejected=this.state.rejected.filter(k=>k!==b.publicKey);this.state.requests=this.state.requests.filter(r=>r.id!==id);await this.save();if(accept){this.replayDeferred(b.publicKey);this.refreshHistory();}
  });}
  async alias(address,alias){return this.mutate(async()=>{const c=this.state.contacts.find(c=>c.invitation.binding.address===address);if(!c)throw Error('Nie znaleziono kontaktu.');c.alias=z.string().trim().max(32).parse(alias);await this.save();});}

  preview(value) {
    const invitation = decodeInvitation(value), b = invitation.binding;
    if (b.address === this.address || b.publicKey === this.pubkey) throw new Error("Nie mo\u017Cna doda\u0107 w\u0142asnego kontaktu.");
    const known = this.state?.contacts.find((c) => c.invitation.binding.address === b.address);
    if (this.state?.contacts.some((c) => c.invitation.binding.publicKey === b.publicKey && c.invitation.binding.address !== b.address)) throw new Error("Ten klucz jest ju\u017C przypisany do innego kontaktu.");
    return { invitation, ...known && known.invitation.binding.publicKey !== b.publicKey ? { previousKey: known.invitation.binding.publicKey } : {} };
  }
  async accept(value, previousKey) {
    return this.mutate(async () => {
      const preview = this.preview(value);
      if (!this.state) throw new Error("Najpierw aktywuj czat.");
      if (preview.previousKey !== previousKey) throw new Error("Klucz kontaktu uleg\u0142 zmianie. Sprawd\u017A go i zaakceptuj zmian\u0119.");
      const i = this.state.contacts.findIndex((c) => c.invitation.binding.address === preview.invitation.binding.address);
      if (i < 0) {
        if (this.state.contacts.length >= 100) throw new Error("Limit: 100 kontakt\xF3w.");
        this.state.contacts.push({ invitation: preview.invitation, blocked: false });
      } else {
        const old = this.state.contacts[i];
        this.state.contacts[i] = { ...old, since:preview.previousKey?undefined:old.since??Date.parse(old.invitation.binding.createdAt), invitation: preview.invitation };
        if (preview.previousKey) {
          this.state.outbox = this.state.outbox.filter((q) => q.peer !== preview.invitation.binding.address);
          for (const m of this.state.messages) if (m.peer === preview.invitation.binding.address && m.status === "oczekuje") m.status = "b\u0142\u0105d";
        }
      }
      this.state.rejected=this.state.rejected.filter(k=>k!==preview.invitation.binding.publicKey);await this.save();
      this.seen.clear();
      for (const p of this.peers.values()) p.relay.close();
      this.peers.clear();
      void this.tick();
    });
  }
  async block(address2, blocked) {
    return this.mutate(async () => {
      const c = this.state?.contacts.find((c2) => c2.invitation.binding.address === address2);
      if (!c) throw new Error("Nie znaleziono kontaktu.");
      c.blocked = blocked;
      if (blocked) {
        this.state.outbox = this.state.outbox.filter((q) => q.peer !== address2);
        for (const m of this.state.messages) if (m.peer === address2 && m.status === "oczekuje") m.status = "b\u0142\u0105d";
      }
      await this.save();
    });
  }
  async send(address2, text2, image:string|undefined=undefined) {
    await this.mutate(async () => {
      const s = this.state;
      if (!s) throw new Error("Najpierw aktywuj czat.");
      verifyInvitation(s.identity);
      const contact = s.contacts.find((c) => c.invitation.binding.address === address2);
      if (!contact || contact.blocked || contact.pending) throw new Error("Kontakt jest niedost\u0119pny lub zablokowany.");
      verifyInvitation(contact.invitation);
      text2 = z.string().trim().max(4e3).parse(text2);if(!image&&!text2)throw Error("Napisz wiadomość.");
      if (s.outbox.length >= 200 || s.messages.length >= 2e3) throw new Error("Osi\u0105gni\u0119to lokalny limit wiadomo\u015Bci. Wys\u0142anie zatrzymane.");
      const peer = contact.invitation.binding, { id, events,at } = wrapMessage(this.key, peer.publicKey, image?JSON.stringify(appPayloadSchema.parse({version:2,type:"image",image,text:text2})):text2, randomUUID(),!!image);
      s.messages.push({ id, peer: address2, peerKey: peer.publicKey, text: text2, ...(image?{image}:{}),at, outgoing: true, status: "oczekuje" });
      s.messages.sort(compareMessages);
      s.outbox.push({ id, peer: address2, attempts: 0, targets: [{ event: events[0], relays: s.identity.binding.relays, accepted: [] }, { event: events[1], relays: this.dmRelays.get(peer.publicKey)?.length?this.dmRelays.get(peer.publicKey):peer.relays, accepted: [] }] });
      await this.save();
    });
    void this.flush();
  }
  async retry(id) {
    await this.mutate(async () => {
      const q = this.state?.outbox.find((q2) => q2.id === id);
      if (!q) throw new Error("Brak wiadomo\u015Bci w kolejce.");
      q.attempts = 0;
      const m = this.state.messages.find((m2) => m2.id === id);
      if (m) m.status = "oczekuje";
      await this.save();
    });
    void this.flush();
  }
  async flush() {
    if (this.flushing || this.closed || !this.state) return;
    this.flushing = true;
    try {
      for (const queued of [...this.state.outbox]) {
        this.guard();
        if (queued.attempts >= 6) continue;
        const contact = queued.control?{invitation:queued.invitation,blocked:this.state.contacts.some(c=>c.invitation.binding.address===queued.peer&&c.blocked)}:this.state.contacts.find((c) => c.invitation.binding.address === queued.peer);
        if (!contact || contact.blocked || Date.parse(contact.invitation.binding.expiresAt) <= Date.now() || Date.parse(this.state.identity.binding.expiresAt) <= Date.now()) continue;
        let attempted = false;
        const successes = [];
        await Promise.all(queued.targets.flatMap((target, index) => target.relays.filter((url) => !target.accepted.includes(url)).map(async (url) => {
          const relay = this.peers.get(url)?.relay;
          if (!relay?.connected) return;
          this.guard();
          attempted = true;
          try {
            await relay.publish(target.event);
            this.guard();
            successes.push({ target: index, url });
          } catch {
          }
        })));
        if (!attempted) continue;
        await this.mutate(async () => {
          const q = this.state.outbox.find((q2) => q2.id === queued.id);
          if (!q) return;
          q.attempts++;
          for (const success of successes) if (!q.targets[success.target].accepted.includes(success.url)) q.targets[success.target].accepted.push(success.url);
          const m = this.state.messages.find((m2) => m2.id === q.id);
          if (m) m.status = q.targets[1].accepted.length ? "przyj\u0119to przez relay" : "b\u0142\u0105d";
          if (q.targets.every((t) => t.accepted.length === t.relays.length)) this.state.outbox = this.state.outbox.filter((x) => x !== q);
          await this.save();
        });
      }
    } catch {
    } finally {
      this.flushing = false;
    }
  }
  async receive(event) {
    this.guard();if(this.seen.has(event.id)||event.content.length>52000)return;
    const rumor=readMessage(event,this.key);
    await this.mutate(async()=>{
      const s=this.state;if(!s)return;
      const outgoing=rumor.pubkey===this.pubkey,peerKey=outgoing?rumor.tags.find(t=>t[0]==='p')[1]:rumor.pubkey;
      if(!outgoing&&rumor.tags.find(t=>t[0]==='p')?.[1]!==this.pubkey)return;
      const at=rumor.created_at*1000;let contact=s.contacts.find(c=>c.invitation.binding.publicKey===peerKey);
      if(contact?.blocked||s.rejected.includes(peerKey))return;
      const payload=readPayload(rumor);
      if(payload&&payload.type!=='image'){
        if(s.controlSeen.includes(rumor.id)||outgoing){this.remember(event.id);return;}
        if(payload.type==='request'||payload.type==='accept'){
          const invite=verifyInvitation(payload.invitation);const b=invite.binding;
          if(contact&&contact.invitation.binding.address!==b.address)return;
          if(b.publicKey!==rumor.pubkey||b.address===this.address||!invite.profile||at<Date.parse(b.createdAt)-300000||at>Date.parse(b.expiresAt))return;
          const known=s.contacts.find(c=>c.invitation.binding.address===b.address);
          if(known&&known.invitation.binding.publicKey!==b.publicKey)return;
          if(payload.type==='request'){
            if(s.requests.some(r=>r.invitation.binding.publicKey===peerKey)||s.requests.length>=30||s.requests.filter(r=>(r.receivedAt??r.at)>Date.now()-60000).length>=5)return;
            if(contact&&!contact.pending&&s.shared){if(Date.parse(b.createdAt)>=Date.parse(contact.invitation.binding.createdAt)){contact.since??=Date.parse(contact.invitation.binding.createdAt);contact.invitation=invite;}this.queueControl(invite,{version:2,type:'accept',invitation:this.identity()});}
            else s.requests.push({id:rumor.id,at,receivedAt:Date.now(),invitation:invite});
          }else if(contact?.pending){contact.pending=false;contact.invitation=invite;this.replayDeferred(peerKey);if(s.shared&&s.identity.profile)this.queueControl(invite,{version:2,type:'profile',profile:s.identity.profile});}
        }else if(payload.type==='profile'){
          if(!contact||contact.pending)return;
          verifyInvitation(contact.invitation);verifyProfile(payload.profile,peerKey);
          const old=contact.invitation.profile;
          if(!old||payload.profile.created_at>old.created_at||(payload.profile.created_at===old.created_at&&payload.profile.id>old.id))contact.invitation.profile=payload.profile;
        }
        s.controlSeen.push(rumor.id);s.controlSeen=s.controlSeen.slice(-1000);await this.save();this.remember(event.id);return;
      }
      if(!contact||contact.pending){if((contact?.pending||s.requests.some(r=>r.invitation.binding.publicKey===peerKey))&&this.deferred.size<100)this.deferred.set(event.id,{event,peerKey});return;}
      const binding=verifyInvitation(contact.invitation,true).binding;
      if(at<(contact.since??Date.parse(binding.createdAt))-300000||at>Date.parse(binding.expiresAt)||at<(s.identitySince??Date.parse(s.identity.binding.createdAt))-300000||at>Date.parse(s.identity.binding.expiresAt))return;
      const existing=s.messages.find(m=>m.id===rumor.id);
      if(existing){if(existing.peerKey!==peerKey||existing.outgoing!==outgoing)return;existing.at=at;s.messages.sort(compareMessages);await this.save();this.remember(event.id);return;}
      if(s.messages.length>=2000)return;
      s.messages.push({id:rumor.id,peer:binding.address,peerKey,text:payload?payload.text:rumor.content,...(payload?{image:payload.image}:{}),at,outgoing,status:'przyjęto przez relay',...(outgoing?{recovered:true}:{})});
      s.messages.sort(compareMessages);await this.save();this.remember(event.id);
    });
  }
  close() {
    this.closed = true;
    clearInterval(this.timer);
    for (const p of this.peers.values()) p.relay.close();
    this.peers.clear();
    this.key.fill(0);
    this.storageKey.fill(0);
    this.state = void 0;
    this.seen.clear();this.deferred.clear();
    return this.serial;
  }
}

export {ChatStore};
