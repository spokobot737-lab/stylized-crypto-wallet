import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';
import { FrameRunBridge } from '../electron/frame-run';
import { RunStore } from '../server/frame-run/store';
import { initial, step } from '../shared/frame-run/simulation';
test('lost settlement response retries persisted payload exactly once; account change, cancel and lock remain isolated', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'frame-bridge-'));
    let now = 0, locked = false, lost = true, loseCancel = false;
    const store = new RunStore(join(dir, 'server.sqlite'), () => now), account = randomUUID(), otherAccount = randomUUID(), original = globalThis.fetch;
    // Test-only protector. Real integration requires existing OS safeStorage.
    const protector = { async seal(s: string) { return Buffer.from(s); }, async open(b: Buffer) { return b.toString(); } };
    const bridge = new FrameRunBridge(dir, protector, () => !locked);
    globalThis.fetch = async (url, options) => { const path = new URL(String(url)).pathname; const input = JSON.parse(String(options?.body || '{}')); const selected = (options?.headers as any).Authorization === 'Bearer '+ 'b'.repeat(32) ? otherAccount : account;
    if(path==='/cancel'&&loseCancel){loseCancel=false;throw Error('Offline cancel');}
    const value = path === '/status' ? store.status(selected) : path === '/start' ? store.start(selected) : path === '/cancel' ? store.cancel(selected, input.runId) : store.settle(selected, input); if (path === '/settle' && lost) {
        lost = false;
        throw Error('Lost response');
    } return Response.json(value); };
    try {
        await bridge.call({ action: 'configure', credentials: { url: 'https://frame.example', token: 'a'.repeat(32) } });
        const run = await bridge.call({ action: 'start' });
        const state = initial(run.seed), inputs: number[] = [];
        while (!state.ended) {
            const o = state.obstacles.find(o => o.x + o.width > 12000);
            const j = state.y === 0 && !!o && o.x - 15200 < (600 + Math.floor(state.tick / 900) * 60) * 12;
            if (j)
                inputs.push(state.tick);
            step(state, j);
        }
        now = 90000;
        await assert.rejects(bridge.call({ action: 'settle', payload: { runId: run.runId, version: 1, generator: 1, inputFormat: 1, endTick: state.tick, inputs } }), /Lost/);
        assert.equal(store.status(account).balance, 9);
        assert.ok((await bridge.call({ action: 'status' })).pending);
        await assert.rejects(bridge.call({ action: 'configure', credentials: { url: 'https://other.example', token: 'b'.repeat(32) } }));
        const resumed = new FrameRunBridge(dir, protector, () => !locked);
        assert.equal((await resumed.call({ action: 'retry' })).frame, 9);
        assert.equal(store.status(account).balance, 9);
        const next = await resumed.call({ action: 'start' });
        await resumed.call({ action: 'cancel', runId: next.runId });
        assert.equal(store.db.prepare('SELECT status FROM runs WHERE id=?').get(next.runId)!.status, 'cancelled');
        const interrupted = await resumed.call({ action: 'start' });
        locked = true;
        await resumed.interrupt();
        assert.equal(store.db.prepare('SELECT status FROM runs WHERE id=?').get(interrupted.runId)!.status, 'cancelled');
        await assert.rejects(resumed.call({ action: 'start' }), /Odblokuj/);
        locked = false;
        const orphan = await resumed.call({ action: 'start' });
        const restarted = new FrameRunBridge(dir, protector, () => true);
        await restarted.call({ action: 'status' });
        assert.equal(store.db.prepare('SELECT status FROM runs WHERE id=?').get(orphan.runId)!.status, 'cancelled');
        const offline = await restarted.call({action:'start'});loseCancel=true;
        await assert.rejects(restarted.call({action:'cancel',runId:offline.runId}),/Offline/);
        const reconnected = new FrameRunBridge(dir,protector,()=>true);await reconnected.call({action:'status'});
        assert.equal(store.db.prepare('SELECT status FROM runs WHERE id=?').get(offline.runId)!.status,'cancelled');
        await reconnected.call({action:'configure',credentials:{url:'https://frame.example',token:'b'.repeat(32)}});
        assert.equal((await reconnected.call({action:'status'})).accountId,otherAccount);
        assert.equal((await reconnected.call({action:'status'})).balance,0);
        const second=await reconnected.call({action:'start'});assert.equal(second.accountId,otherAccount);
        const s=initial(second.seed),moves:number[]=[];
        while(!s.ended){const o=s.obstacles.find(o=>o.x+o.width>12000);const j=s.y===0&&!!o&&o.x-15200<(600+Math.floor(s.tick/900)*60)*12;if(j)moves.push(s.tick);step(s,j);}
        now+=90000;await reconnected.call({action:'settle',payload:{runId:second.runId,version:1,generator:1,inputFormat:1,endTick:s.tick,inputs:moves}});
        assert.equal(store.status(account).balance,9);assert.equal(store.status(otherAccount).balance,9);

    }
    finally {
        globalThis.fetch = original;
        store.db.close();
        await rm(dir, { recursive: true, force: true });
    }
});
