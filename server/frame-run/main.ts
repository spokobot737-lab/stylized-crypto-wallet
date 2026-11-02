import { createServer } from 'node:http';
import { z } from 'zod';
import { RunStore, tokenMatches } from './store';
const accounts = z.array(z.object({ id: z.string().uuid(), token: z.string().min(32).max(256) }).strict()).min(1).parse(JSON.parse(process.env.FRAME_RUN_ACCOUNTS || '[]'));
if (new Set(accounts.map(a => a.id)).size !== accounts.length || new Set(accounts.map(a => a.token)).size !== accounts.length)
    throw Error('Powielone konta lub tokeny.');
const store = new RunStore(process.env.FRAME_RUN_DB || 'frame-run.sqlite');
const buckets = new Map<string, {
    at: number;
    n: number;
}>();
const server = createServer(async (req, res) => {
    const ip = req.socket.remoteAddress || 'unknown';
    const now = Date.now();
    for (const [k, v] of buckets)
        if (now - v.at > 60000)
            buckets.delete(k);
    const bucket = buckets.get(ip) || { at: now, n: 0 };
    if (buckets.size >= 1000 && !buckets.has(ip) || ++bucket.n > 120) {
        res.writeHead(429);
        res.end();
        return;
    }
    buckets.set(ip, bucket);
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    try {
        const token = req.headers.authorization?.replace(/^Bearer /, '') || '';
        const account = accounts.find(a => tokenMatches(token, a.token));
        if (!account) {
            res.writeHead(401);
            res.end('{"error":"Wymagane konto serwera."}');
            return;
        }
        let size = 0, body = '';
        for await (const chunk of req) {
            size += chunk.length;
            if (size > 32768) {
                res.writeHead(413);
                res.end();
                return;
            }
            body += chunk;
        }
        const input = body ? JSON.parse(body) : {};
        const result = req.method === 'GET' && req.url === '/status' ? store.status(account.id) : req.method === 'POST' && req.url === '/start' ? store.start(account.id) : req.method === 'POST' && req.url === '/settle' ? store.settle(account.id, input) : req.method === 'POST' && req.url === '/cancel' ? store.cancel(account.id, z.object({ runId: z.string().uuid() }).strict().parse(input).runId) : undefined;
        if (!result) {
            res.writeHead(404);
            res.end('{}');
            return;
        }
        res.end(JSON.stringify(result));
    }
    catch (e) {
        res.writeHead(400);
        res.end(JSON.stringify({ error: (e as Error).message.slice(0, 300) }));
    }
});
server.requestTimeout = 10000;
server.headersTimeout = 10000;
server.setTimeout(10000);
server.maxHeadersCount = 64;
server.maxConnections = 50;
server.listen(Number(process.env.PORT || 8787), process.env.HOST || '127.0.0.1', () => console.log('FRAME Run server listening ' + (server.address() as {
    port: number;
}).port));
