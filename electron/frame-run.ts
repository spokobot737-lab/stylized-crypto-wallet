import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import { atomicWrite } from './vault';
import type { DeviceProtector } from './app-vault';
import {submission} from '../shared/frame-run/protocol';
import type { RunSession } from '../shared/frame-run/simulation';
const credentials = z.object({ url: z.string().url().max(2048), token: z.string().min(32).max(256) }).strict();
type Configuration = z.infer<typeof credentials> & {
    accountId: string;
};
export class FrameRunBridge {
    private active: RunSession | undefined;
    private serial = Promise.resolve();
    constructor(private directory: string, private protector: DeviceProtector, private unlocked: () => boolean) { }
    private async load(name: string) { try {
        const e = JSON.parse(await readFile(join(this.directory, name + '.vault'), 'utf8'));
        return JSON.parse(await this.protector.open(Buffer.from(e.sealed, 'base64')));
    }
    catch (e: any) {
        if (e.code === 'ENOENT')
            return null;
        throw Error('Nie można odczytać konfiguracji FRAME Run.');
    } }
    private async save(name: string, value: unknown) { await atomicWrite(join(this.directory, name + '.vault'), { sealed: (await this.protector.seal(JSON.stringify(value))).toString('base64') }); }
    private async request(c: z.infer<typeof credentials>, path: string, input?: unknown) {
        const u = new URL(c.url);
        if (u.username || u.password || u.hash || u.search || u.pathname !== '/' || !(u.protocol === 'https:' || u.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(u.hostname)))
            throw Error('Wymagany HTTPS lub lokalny serwer HTTP. Podaj sam adres serwera.');
        const r = await fetch(new URL(path, u), { method: input ? 'POST' : 'GET', redirect: 'error', headers: { Authorization: 'Bearer ' + c.token, 'Content-Type': 'application/json' }, body: input ? JSON.stringify(input) : undefined, signal: AbortSignal.timeout(10000) });
        let text = '', size = 0;
        const decoder = new TextDecoder();
        if (r.body) {
            const reader = r.body.getReader();
            try {
                while (true) {
                    const { done, value } = await reader.read();
                    if (done)
                        break;
                    size += value.byteLength;
                    if (size > 65536) {
                        await reader.cancel();
                        throw Error('Zbyt duża odpowiedź serwera.');
                    }
                    text += decoder.decode(value, { stream: true });
                }
                text += decoder.decode();
            }
            finally {
                reader.releaseLock();
            }
        }
        if (!r.ok) {
            let message = 'Błąd serwera FRAME Run.';
            try {
                message = JSON.parse(text).error || message;
            }
            catch { }
            throw Error(message);
        }
        return JSON.parse(text);
    }
    private queue<T>(op: () => Promise<T>) { const result = this.serial.then(op); this.serial = result.then(() => { }, () => { }); return result; }
    call(input: unknown) { return this.queue(() => this.execute(input)); }
    // Native lock/suspend is authorized to cancel even after the PIN gate has closed.
    interrupt() { return this.queue(async () => { if (this.active)
        await this.cancel(await this.load('frame-run-config'), this.active.runId); }).catch(() => { }); }
    private async cancel(config: Configuration, id: string) {
        await this.save('frame-run-pending', { runId: id, cancel: true });
        this.active = undefined;
        await this.save('frame-run-active', null);
        const result = await this.request(config, '/cancel', { runId: id });
        await this.save('frame-run-pending', null);
        return result;
    }
    private async execute(raw: unknown) {
        if (!this.unlocked())
            throw Error('Odblokuj portfel.');
        const input = z.object({ action: z.enum(['configure', 'status', 'start', 'settle', 'retry', 'cancel']), credentials: credentials.optional(), payload: z.unknown().optional(), runId: z.string().uuid().optional() }).strict().parse(raw);
        if (input.action === 'configure') {
            if (this.active || await this.load('frame-run-active') || await this.load('frame-run-pending'))
                throw Error('Najpierw zakończ lub anuluj rundę.');
            const c = credentials.parse(input.credentials);
            const status = await this.request(c, '/status');
            z.string().uuid().parse(status.accountId);
            await this.save('frame-run-config', { ...c, accountId: status.accountId });
            return status;
        }
        const config: Configuration = await this.load('frame-run-config');
        if (!config) {
            if (input.action === 'status')
                return { configured: false };
            throw Error('Skonfiguruj konto serwera.');
        }
        if (input.action === 'status') {
            // A process restart never resumes an unsubmitted rewarded run.
            const orphan = await this.load('frame-run-active'), pending = await this.load('frame-run-pending');
            if (!this.active && orphan && !pending)
                await this.cancel(config, orphan.runId);
            if (pending?.cancel)
                await this.cancel(config, pending.runId);
            const status = await this.request(config, '/status');
            if (status.accountId !== config.accountId)
                throw Error('Konto serwera uległo zmianie. Połącz je ponownie.');
            return { configured: true, ...status, pending: pending && !pending.cancel ? pending : null };
        }
        if (input.action === 'start') {
            if (this.active || await this.load('frame-run-active') || await this.load('frame-run-pending'))
                throw Error('Najpierw rozlicz poprzednią rundę.');
            this.active = await this.request(config, '/start', {});
            if (this.active!.accountId !== config.accountId) {
                this.active = undefined;
                throw Error('Niezgodne konto sesji.');
            }
            await this.save('frame-run-active', { runId: this.active!.runId });
            return this.active;
        }
        if (input.action === 'cancel') {
            const pending = await this.load('frame-run-pending'), orphan = await this.load('frame-run-active');
            const id = input.runId || this.active?.runId || pending?.runId || orphan?.runId;
            if (!id)
                return {};
            if (this.active && this.active.runId !== id)
                throw Error('Niezgodna runda.');
            return this.cancel(config, id);
        }
        const payload = input.action === 'retry' ? await this.load('frame-run-pending') : input.payload as any;
        if (!payload || payload.cancel)
            throw Error('Brak wyniku do ponowienia.');
        if (input.action === 'settle' && payload.runId !== this.active?.runId)
            throw Error('Sesja uległa zmianie.');
        submission.parse(payload);
        await this.save('frame-run-pending', payload);
        this.active = undefined;
        await this.save('frame-run-active', null);
        const result = await this.request(config, '/settle', payload);
        await this.save('frame-run-pending', null);
        return result;
    }
}
