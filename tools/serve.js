#!/usr/bin/env node
// Minimal zero-dependency static server for local development.
// Usage: node tools/serve.js [port]
import http from 'node:http';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import url from 'node:url';

const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
// Static assets live in ./public (the same directory Cloudflare Workers serves).
const ROOT = path.resolve(__dirname, '..', 'public');
const PORT = Number(process.env.PORT) || Number(process.argv[2]) || 5173;

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.ico': 'image/x-icon',
  '.wav': 'audio/wav',
  '.woff2': 'font/woff2',
};

const server = http.createServer(async (req, res) => {
  try {
    let reqPath = decodeURIComponent(new URL(req.url, `http://${req.headers.host}`).pathname);
    if (reqPath === '/') reqPath = '/index.html';
    const filePath = path.join(ROOT, path.normalize(reqPath));
    if (!filePath.startsWith(ROOT)) {
      res.writeHead(403).end('Forbidden');
      return;
    }
    const data = await fs.readFile(filePath);
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, {
      'Content-Type': MIME[ext] || 'application/octet-stream',
      'Cache-Control': 'no-cache',
      'Service-Worker-Allowed': '/',
    });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type': 'text/plain' }).end('404 Not Found');
  }
});

server.listen(PORT, () => {
  console.log(`Starfall dev server running → http://localhost:${PORT}`);
});
