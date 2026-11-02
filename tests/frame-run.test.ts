import {submission} from '../shared/frame-run/protocol';
import { Worker } from 'node:worker_threads';
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { initial, step, replay, reward, RULES } from '../shared/frame-run/simulation';
import { RunStore } from '../server/frame-run/store';
function play(seed: number) { const s = initial(seed), inputs: number[] = []; while (!s.ended) {
    const o = s.obstacles.find(o => o.x + o.width > 12000), speed = 600 + Math.floor(s.tick / 900) * 60;
    const jump = s.y === 0 && !!o && o.x - 15200 < speed * 12;
    if (jump)
        inputs.push(s.tick);
    step(s, jump);
} return { s, inputs }; }
const payload = (run: any) => { const p = play(run.seed); return { runId: run.runId, version: 1, generator: 1, inputFormat: 1, endTick: p.s.tick, inputs: p.inputs }; };
test('FRAME Run deterministic integer replay, collisions, solvable generator and exact reward boundaries', () => { for (let seed = 1; seed <= 40; seed++) {
    const p = play(seed);
    assert.deepEqual(replay(seed, p.inputs), p.s);
    assert.equal(p.s.tick, 5400, 'generated obstacles remain passable');
} assert.ok(replay(1, []).tick < 900); for (const [ticks, n] of [[899, 0], [900, 1], [1199, 1], [1200, 2], [5399, 8], [5400, 9]])
    assert.equal(reward(ticks), n); });
test('server owns score, enforces clock/expiry, binds account, cancels, settles idempotently and caps grants atomically', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'frame-run-'));
    let now = Date.UTC(2026, 10, 2);
    const path = join(dir, 'ledger.sqlite'), a = new RunStore(path, () => now), b = new RunStore(path, () => now), account = randomUUID();
    try {
        const early = a.start(account);
        assert.throws(() => b.start(account));
        assert.throws(() => a.settle(randomUUID(), payload(early)));
        const bad = a.settle(account, payload(early));
        assert.equal(bad.state, 'rejected');
        assert.equal(a.status(account).balance, 0);
        const expired = a.start(account);
        now += RULES.expiryMs + 1;
        assert.equal(a.settle(account, payload(expired)).state, 'expired');
        const cancelled = a.start(account);
        a.cancel(account, cancelled.runId);
        assert.throws(() => a.settle(account, payload(cancelled)));
        const r = a.start(account);
        now += 90000;
        const p = payload(r), one = a.settle(account, p), two = b.settle(account, p);
        assert.deepEqual(two, one);
        assert.equal(one.frame, 9);
        assert.throws(() => b.settle(account, { ...p, inputs: [] }));
        for (let i = 0; i < 3; i++) {
            const run = b.start(account);
            now += 90000;
            await Promise.all([Promise.resolve().then(() => a.settle(account, payload(run))), Promise.resolve().then(() => b.settle(account, payload(run)))]);
        }
        assert.equal(a.status(account).balance, 30);
        assert.equal(a.status(account).remaining, 0);
        assert.throws(() => a.start(account));
        const id = randomUUID();
        a.reserve(account, id, { id: 'future-test', cost: 10 });
        a.reserve(account, id, { id: 'future-test', cost: 10 });
        assert.equal(a.status(account).balance, 20);
        b.fulfill(id, false);
        b.fulfill(id, false);
        assert.equal(a.status(account).balance, 30);
        assert.equal(a.status(account).remaining, 0);
        now = Date.UTC(2026, 10, 3);
        assert.equal(a.status(account).remaining, 30);
        const correction=randomUUID();a.adjust(account,correction,2,'Test correction');a.adjust(account,correction,2,'Test correction');assert.equal(a.status(account).balance,32);assert.equal(a.status(account).remaining,30);assert.throws(()=>a.adjust(account,correction,3,'Test correction'));
        const delivered=randomUUID();a.reserve(account,delivered,{id:'future-delivered',cost:1});a.fulfill(delivered,true);a.fulfill(delivered,false);assert.equal(a.status(account).balance,31);
        const tampered = a.start(account);
        now += 90000;
        assert.equal(a.settle(account, { ...payload(tampered), endTick: 1 }).state, 'rejected');
        assert.throws(() => a.settle(account, { ...payload(tampered), balance: 999 }));
    }
    finally {
        a.db.close();
        b.db.close();
        await rm(dir, { recursive: true, force: true });
    }
});
test('independent SQLite workers race at the daily cap without double granting', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'frame-race-'));
    let now = Date.UTC(2026, 10, 2);
    const path = join(directory, 'ledger.sqlite'), store = new RunStore(path, () => now), account = randomUUID();
    try {
        for (let i = 0; i < 3; i++) {
            const run = store.start(account);
            now += 90000;
            store.settle(account, payload(run));
        }
        const run = store.start(account);
        now += 90000;
        const input = payload(run);
        const source = `require('tsx/cjs');const {workerData,parentPort}=require('node:worker_threads');const {RunStore}=require(workerData.module);const s=new RunStore(workerData.path,()=>workerData.now);parentPort.postMessage({ready:true});parentPort.once('message',()=>{try{parentPort.postMessage({result:s.settle(workerData.account,workerData.input)});}catch(e){parentPort.postMessage({error:e.message});}finally{s.db.close();}});`;
        const workers = Array.from({ length: 6 }, () => new Worker(source, { eval: true, workerData: { module: join(process.cwd(), 'server/frame-run/store.ts'), path, now, account, input } }));
        try {
            await Promise.all(workers.map(w => new Promise<void>((resolve, reject) => { w.once('message', () => resolve()); w.once('error', reject); })));
            const results = await Promise.all(workers.map(w => new Promise<any>((resolve, reject) => { w.once('message', resolve); w.once('error', reject); w.postMessage('settle'); })));
            for (const r of results) {
                assert.equal(r.error, undefined);
                assert.equal(r.result.frame, 3);
            }
            assert.equal(store.status(account).balance, 30);
            assert.equal(store.status(account).remaining, 0);
            assert.equal(store.db.prepare('SELECT COUNT(*) AS n FROM ledger WHERE run=?').get(run.runId)!.n, 1);
        }
        finally {
            await Promise.all(workers.map(w => w.terminate()));
        }
    }
    finally {
        store.db.close();
        await rm(directory, { recursive: true, force: true });
    }
});

test('collision boundaries and untrusted input limits',()=>{
 const edge=initial(1);edge.obstacles=[{x:15800,width:2800,height:5000}];step(edge,false);assert.equal(edge.ended,false,'touching horizontal edges is not overlap');
 const hit=initial(1);hit.obstacles=[{x:15799,width:2800,height:5000}];step(hit,false);assert.equal(hit.ended,true);
 const top=initial(1);top.y=5000;top.obstacles=[{x:15000,width:2800,height:5000}];step(top,false);assert.equal(top.ended,false,'touching obstacle top is not overlap');
 const valid={runId:randomUUID(),version:1,generator:1,inputFormat:1,endTick:5400,inputs:[]};
 for(const data of [{...valid,inputs:[2,2]},{...valid,inputs:[3,2]},{...valid,inputs:Array.from({length:601},(_,i)=>i)},{...valid,endTick:5401},{...valid,version:2},{...valid,score:999},{...valid,inputs:[-1]}])assert.equal(submission.safeParse(data).success,false);
 assert.throws(()=>replay(1,[5399]),/po zakończeniu/);
});
