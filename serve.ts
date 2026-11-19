/* Vice Cover Studio — local static server for trying the app.
 * Serves app/ at http://localhost:8080 with no network use of its own.
 * Node 22 standard library only. Run: node serve.ts
 */
import { createReadStream, existsSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const APP_DIR = join(dirname(fileURLToPath(import.meta.url)), 'app');
const PORT = Number(process.env.PORT || 8080);

const MIME_TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.ttf': 'font/ttf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8'
};

const server = createServer((req, res) => {
  const rawPath = decodeURIComponent((req.url || '/').split('?')[0]);
  const safePath = normalize(join(APP_DIR, rawPath === '/' ? 'index.html' : rawPath));
  if (!safePath.startsWith(resolve(APP_DIR))) {
    res.writeHead(403, { 'content-type': 'text/plain' });
    res.end('forbidden');
    return;
  }
  if (!existsSync(safePath) || !statSync(safePath).isFile()) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
    return;
  }
  res.writeHead(200, { 'content-type': MIME_TYPES[extname(safePath)] || 'application/octet-stream' });
  createReadStream(safePath).pipe(res);
});

server.on('error', (err) => {
  console.error('server error: ' + (err as Error).message);
  process.exitCode = 1;
});

process.on('SIGINT', () => {
  server.close(() => process.exit(0));
});

server.listen(PORT, () => {
  console.log('Vice Cover Studio at http://localhost:' + PORT);
});
