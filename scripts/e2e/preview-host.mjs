/**
 * Serves dist-preview/ the way a single-page artifact host does, to test the review preview locally:
 * page.html is wrapped in a minimal document skeleton, static files are served next to it, there is
 * no backend (so /api/inquiry is a 404), and a strict Content-Security-Policy blocks external
 * requests.
 *
 *   npm run build:preview
 *   node scripts/e2e/preview-host.mjs            # http://localhost:4174
 *   BASE_URL=http://localhost:4174 PREVIEW=1 ONLY=layout,hero,viz,catalog,forms npm run test:e2e
 */
import { createServer } from 'node:http';
import { readFileSync, existsSync, statSync } from 'node:fs';
import { join, extname, normalize } from 'node:path';

const dir = new URL('../../dist-preview/', import.meta.url).pathname;
const port = Number(process.env.PORT ?? 4174);
const types = {
  '.webp': 'image/webp',
  '.jpg': 'image/jpeg',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.mp4': 'video/mp4',
  '.json': 'application/json',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};
const csp = [
  "default-src 'none'",
  "script-src 'unsafe-inline' https://cdnjs.cloudflare.com",
  "style-src 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com data:',
  "img-src 'self' data: blob:",
  "media-src 'self' data: blob:",
  "connect-src 'self'",
].join('; ');
const skeleton = (body) =>
  '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover">' +
  '<style>:root{color-scheme:light;padding:env(safe-area-inset-top,0px) 0 env(safe-area-inset-bottom,0px)}body{margin:0;font:14px system-ui,sans-serif}img{max-width:100%}[hidden]{display:none!important}</style>' +
  `</head><body>${body}</body></html>`;

createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (path === '/' || path === '/index.html') {
    res.writeHead(200, { 'content-type': 'text/html; charset=utf-8', 'content-security-policy': csp });
    res.end(skeleton(readFileSync(join(dir, 'page.html'), 'utf8')));
    return;
  }
  const file = normalize(join(dir, path));
  if (!file.startsWith(dir) || !existsSync(file) || statSync(file).isDirectory() || path.startsWith('/assets/')) {
    res.writeHead(404, { 'content-type': 'text/plain' });
    res.end('not found');
    return;
  }
  const data = readFileSync(file);
  const range = req.headers.range && /bytes=(\d+)-(\d*)/.exec(req.headers.range);
  const type = types[extname(file)] ?? 'application/octet-stream';
  if (range) {
    const start = Number(range[1]);
    const end = range[2] ? Number(range[2]) : data.length - 1;
    res.writeHead(206, { 'content-type': type, 'content-range': `bytes ${start}-${end}/${data.length}`, 'accept-ranges': 'bytes', 'content-length': end - start + 1 });
    res.end(data.subarray(start, end + 1));
    return;
  }
  res.writeHead(200, { 'content-type': type, 'accept-ranges': 'bytes', 'content-length': data.length });
  res.end(data);
}).listen(port, () => console.log(`preview host on http://localhost:${port}`));
