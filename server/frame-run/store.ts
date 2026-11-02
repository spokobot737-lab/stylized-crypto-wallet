import { DatabaseSync } from 'node:sqlite';
import { randomUUID, randomBytes, createHash, timingSafeEqual } from 'node:crypto';
import { z } from 'zod';
import { RULES, replay, reward, score, type RunSession } from '../../shared/frame-run/simulation';
import {submission} from '../../shared/frame-run/protocol';
export class RunStore {
    db: DatabaseSync;
    constructor(path: string, private now = () => Date.now()) {
        this.db = new DatabaseSync(path);
        this.db.exec(`PRAGMA journal_mode=WAL;PRAGMA busy_timeout=5000;
 CREATE TABLE IF NOT EXISTS runs(id TEXT PRIMARY KEY,account TEXT NOT NULL,seed INTEGER NOT NULL,start INTEGER NOT NULL,expires INTEGER NOT NULL,status TEXT NOT NULL,config TEXT NOT NULL,result TEXT,payload TEXT);
 CREATE UNIQUE INDEX IF NOT EXISTS one_active ON runs(account) WHERE status='active';
 CREATE TABLE IF NOT EXISTS ledger(id TEXT PRIMARY KEY,account TEXT NOT NULL,delta INTEGER NOT NULL,type TEXT NOT NULL,reason TEXT NOT NULL,at INTEGER NOT NULL,run TEXT UNIQUE,redemption TEXT);
 CREATE TABLE IF NOT EXISTS redemptions(id TEXT PRIMARY KEY,account TEXT NOT NULL,reward TEXT NOT NULL,cost INTEGER NOT NULL,status TEXT NOT NULL);
 CREATE INDEX IF NOT EXISTS ledger_account_date ON ledger(account,at);
 CREATE INDEX IF NOT EXISTS runs_account_status ON runs(account,status);
 CREATE TABLE IF NOT EXISTS limits(account TEXT NOT NULL,bucket TEXT NOT NULL,n INTEGER NOT NULL,PRIMARY KEY(account,bucket));`);
    }
    atomic<T>(fn: () => T) { this.db.exec('BEGIN IMMEDIATE'); try {
        const r = fn();
        this.db.exec('COMMIT');
        return r;
    }
    catch (e) {
        this.db.exec('ROLLBACK');
        throw e;
    } }
    private limit(account: string) { const bucket = String(Math.floor(this.now() / 60000)); this.db.prepare('DELETE FROM limits WHERE bucket < ?').run(String(Number(bucket) - 2)); this.db.prepare('INSERT INTO limits VALUES(?,?,1) ON CONFLICT(account,bucket) DO UPDATE SET n=n+1').run(account, bucket); const n = this.db.prepare('SELECT n FROM limits WHERE account=? AND bucket=?').get(account, bucket)!.n as number; if (n > 40)
        throw Error('Limit żądań. Spróbuj za minutę.'); }
    private day() { return new Date(this.now()).toISOString().slice(0, 10); }
    private earned(account: string) { return (this.db.prepare("SELECT COALESCE(SUM(delta),0) AS n FROM ledger WHERE account=? AND type='grant' AND at>=? AND at<?").get(account, Date.parse(this.day() + 'T00:00:00Z'), Date.parse(this.day() + 'T00:00:00Z')+86400000)!.n as number); }
    status(account: string) { return { accountId: account, balance: this.db.prepare('SELECT COALESCE(SUM(delta),0) AS n FROM ledger WHERE account=?').get(account)!.n as number, remaining: Math.max(0, RULES.dailyCap - this.earned(account)), resetAt: Date.parse(this.day() + 'T00:00:00Z') + 86400000, best: this.db.prepare("SELECT result FROM runs WHERE account=? AND status='approved'").all(account).reduce((n, r) => Math.max(n, JSON.parse(r.result as string).score), 0), rules: RULES }; }
    start(account: string): RunSession { this.limit(account); return this.atomic(() => { this.db.prepare("UPDATE runs SET status='expired' WHERE account=? AND status='active' AND expires<?").run(account, this.now()); if (this.db.prepare("SELECT id FROM runs WHERE account=? AND status='active'").get(account))
        throw Error('Konto ma już aktywną rundę.'); if (this.status(account).remaining <= 0)
        throw Error('Wykorzystano limit dzienny. Wybierz trening.'); const session = { runId: randomUUID(), seed: randomBytes(4).readUInt32LE(), rules: RULES, startedAt: this.now(), expiresAt: this.now() + RULES.expiryMs, accountId: account }; this.db.prepare('INSERT INTO runs VALUES(?,?,?,?,?,?,?,?,?)').run(session.runId, account, session.seed, session.startedAt, session.expiresAt, 'active', JSON.stringify(RULES), null, null); return session; }); }
    cancel(account: string, id: string) { z.string().uuid().parse(id); this.db.prepare("UPDATE runs SET status='cancelled' WHERE id=? AND account=? AND status='active'").run(id, account); return { state: 'rejected', reason: 'Runda opuszczona. Bez nagrody.' }; }
    settle(account: string, raw: unknown) {
        this.limit(account);
        const input = submission.parse(raw), digest = createHash('sha256').update(JSON.stringify(input)).digest('hex');
        return this.atomic(() => {
            const r = this.db.prepare('SELECT * FROM runs WHERE id=? AND account=?').get(input.runId, account);
            if (!r)
                throw Error('Nieznana runda dla tego konta.');
            if (r.result) {
                if (r.payload !== digest)
                    throw Error('Zmieniona historia rozliczonej rundy.');
                return JSON.parse(r.result as string);
            }
            if (r.status !== 'active')
                throw Error('Runda została anulowana.');
            let result: any;
            if (this.now() > Number(r.expires))
                result = { state: 'expired', frame: 0, score: 0, reason: 'Sesja wygasła.' };
            else {
                try {
                    if (r.config !== JSON.stringify(RULES))
                        throw Error('Nieobsługiwana wersja zasad.');
                    const end = replay(Number(r.seed), input.inputs);
                    if (end.tick !== input.endTick || end.tick * 1000 / RULES.hz > this.now() - Number(r.start) + 35)
                        throw Error('Niezgodny wynik lub czas serwera.');
                    const grant = Math.min(reward(end.tick), this.status(account).remaining);
                    result = { state: 'approved', frame: grant, score: score(end.tick), seconds: end.tick / RULES.hz };
                    if (grant)
                        this.db.prepare('INSERT INTO ledger VALUES(?,?,?,?,?,?,?,?)').run(randomUUID(), account, grant, 'grant', 'FRAME Run v1', this.now(), r.id, null);
                }
                catch (e) {
                    result = { state: 'rejected', frame: 0, score: 0, reason: (e as Error).message };
                }
            }
            this.db.prepare('UPDATE runs SET status=?,result=?,payload=? WHERE id=?').run(result.state, JSON.stringify(result), digest, r.id);
            const final = { ...result, ...this.status(account) };
            this.db.prepare('UPDATE runs SET result=? WHERE id=?').run(JSON.stringify(final), r.id);
            return final;
        });
    }
    adjust(account: string, id: string, delta: number, reason: string) { return this.atomic(() => { z.string().uuid().parse(id); z.number().int().min(-1000000).max(1000000).parse(delta); z.string().min(1).max(200).parse(reason); const old = this.db.prepare('SELECT * FROM ledger WHERE id=?').get(id); if (old) {
        if (old.account !== account || old.delta !== delta || old.reason !== reason)
            throw Error('Niezgodna korekta.');
        return;
    } if (this.status(account).balance + delta < 0)
        throw Error('Korekta poniżej zera.'); this.db.prepare('INSERT INTO ledger VALUES(?,?,?,?,?,?,?,?)').run(id, account, delta, 'correction', reason, this.now(), null, null); }); }
    // Future catalog entries are server-owned. No catalog or redemption buttons are exposed yet.
    reserve(account: string, id: string, item: {
        id: string;
        cost: number;
    }) { return this.atomic(() => { z.string().uuid().parse(id); z.number().int().positive().parse(item.cost);
            z.string().min(1).max(200).parse(item.id); const old = this.db.prepare('SELECT * FROM redemptions WHERE id=?').get(id); if (old) {
        if (old.account !== account || old.reward !== item.id || old.cost !== item.cost)
            throw Error('Niezgodna rezerwacja.');
        return old;
    } if (this.status(account).balance < item.cost)
        throw Error('Za mało punktów.'); this.db.prepare('INSERT INTO redemptions VALUES(?,?,?,?,?)').run(id, account, item.id, item.cost, 'reserved'); this.db.prepare('INSERT INTO ledger VALUES(?,?,?,?,?,?,?,?)').run(randomUUID(), account, -item.cost, 'spend', 'Rezerwacja ' + item.id, this.now(), null, id); return { id, status: 'reserved' }; }); }
    fulfill(id: string, success: boolean) { return this.atomic(() => { const r = this.db.prepare('SELECT * FROM redemptions WHERE id=?').get(id); if (!r || r.status !== 'reserved')
        return r; this.db.prepare('UPDATE redemptions SET status=? WHERE id=?').run(success ? 'confirmed' : 'refunded', id); if (!success)
        this.db.prepare('INSERT INTO ledger VALUES(?,?,?,?,?,?,?,?)').run(randomUUID(), r.account, r.cost, 'refund', 'Zwrot rezerwacji', this.now(), null, id); return { status: success ? 'confirmed' : 'refunded' }; }); }
}
export function tokenMatches(a: string, b: string) { const hash = (s: string) => createHash('sha256').update(s).digest(); return timingSafeEqual(hash(a), hash(b)); }
