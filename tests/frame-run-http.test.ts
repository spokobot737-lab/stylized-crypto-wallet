import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { randomUUID, randomBytes } from 'node:crypto';
test('real HTTP server authenticates accounts, bounds requests and exposes no client balance mutation', async () => {
    const directory = await mkdtemp(join(tmpdir(), 'frame-http-')), token = randomBytes(32).toString('hex'), account = randomUUID();
    const child = spawn(process.execPath, ['--import', 'tsx', 'server/frame-run/main.ts'], { env: { ...process.env, PORT: '0', HOST: '127.0.0.1', FRAME_RUN_DB: join(directory, 'server.sqlite'), FRAME_RUN_ACCOUNTS: JSON.stringify([{ id: account, token }]) }, stdio: ['ignore', 'pipe', 'pipe'] });
    let stderr = '';
    child.stderr.on('data', b => stderr += b);
    try {
        const port = await new Promise<number>((resolve, reject) => { const timeout = setTimeout(() => reject(Error('Server timeout ' + stderr)), 10000); child.once('exit', code => { clearTimeout(timeout); reject(Error('Server exited ' + code + ' ' + stderr)); }); child.stdout.on('data', b => { const match = String(b).match(/listening (\d+)/); if (match) {
            clearTimeout(timeout);
            resolve(Number(match[1]));
        } }); });
        const origin = 'http://127.0.0.1:' + port, headers = { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
        assert.equal((await fetch(origin + '/status')).status, 401);
        const status = await (await fetch(origin + '/status', { headers })).json();
        assert.equal(status.accountId, account);
        assert.equal(status.balance, 0);
        const run = await (await fetch(origin + '/start', { method: 'POST', headers, body: '{}' })).json();
        assert.equal(run.accountId, account);
        assert.equal((await fetch(origin + '/start', { method: 'POST', headers, body: '{}' })).status, 400);
        assert.equal((await fetch(origin + '/settle', { method: 'POST', headers, body: JSON.stringify({ runId: run.runId, balance: 99999 }) })).status, 400);
        assert.equal((await fetch(origin + '/settle', { method: 'POST', headers, body: 'x'.repeat(33000) })).status, 413);
        assert.equal((await fetch(origin + '/cancel', { method: 'POST', headers, body: JSON.stringify({ runId: run.runId }) })).status, 200);
        assert.equal((await (await fetch(origin + '/status', { headers })).json()).balance, 0);
        const codes: number[] = [];
        for (let i = 0; i < 120; i++)
            codes.push((await fetch(origin + '/status', { headers })).status);
        assert.ok(codes.includes(429));
    }
    finally {
        child.kill();
        await new Promise<void>(r => { if (child.exitCode !== null)
            r();
        else
            child.once('exit', () => r()); });
        await rm(directory, { recursive: true, force: true });
    }
});
