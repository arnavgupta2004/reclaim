// Adapts the core app to Node's (req, res) signature — used by the local server and the Vercel function.

import type { IncomingMessage, ServerResponse } from 'node:http';
import type { App } from './app.js';

const MAX_BODY_BYTES = 1_000_000;

function readBody(req: IncomingMessage): Promise<string | null> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let size = 0;
    req.on('data', (c: Buffer) => {
      size += c.length;
      if (size > MAX_BODY_BYTES) {
        resolve(null);
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export function createNodeHandler(app: App) {
  return async (req: IncomingMessage, res: ServerResponse): Promise<void> => {
    try {
      const rawBody = await readBody(req);
      if (rawBody === null) {
        res.writeHead(413, { 'content-type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ error: 'MOCK: request body too large' }));
        return;
      }
      const headers: Record<string, string | undefined> = {};
      for (const [k, v] of Object.entries(req.headers)) headers[k.toLowerCase()] = Array.isArray(v) ? v.join(', ') : v;
      const out = await app.handle({ method: req.method ?? 'GET', url: req.url ?? '/', headers, rawBody });
      if (res.destroyed) return; // client gave up (e.g. its own timeout fired)
      res.writeHead(out.status, out.headers);
      res.end(out.body);
    } catch (e) {
      console.error(JSON.stringify({ level: 'error', msg: 'unhandled error', error: (e as Error).message }));
      if (!res.headersSent) res.writeHead(500, { 'content-type': 'application/json; charset=utf-8' });
      res.end(JSON.stringify({ error: 'MOCK: internal error' }));
    }
  };
}
