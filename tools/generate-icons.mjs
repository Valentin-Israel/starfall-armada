#!/usr/bin/env node
// Render PNG app icons from the master SVG using the headless Chromium that
// ships with this environment (no extra npm dependencies required).
import { promises as fs } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import url from 'node:url';
import os from 'node:os';

const exec = promisify(execFile);
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const ICON_DIR = path.join(ROOT, 'assets', 'icons');

const CHROME = process.env.CHROME_BIN ||
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const svg = await fs.readFile(path.join(ICON_DIR, 'icon.svg'), 'utf8');
// Maskable variant: square full-bleed background, ship scaled into the safe zone.
const maskableSvg = svg
  .replace('rx="112"', 'rx="0"')
  .replace('translate(256 252)', 'translate(256 256) scale(0.72)');

const targets = [
  { name: 'icon-192.png', size: 192, src: svg },
  { name: 'icon-512.png', size: 512, src: svg },
  { name: 'icon-maskable-512.png', size: 512, src: maskableSvg },
  { name: 'apple-touch-icon.png', size: 180, src: svg },
];

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'starfall-icons-'));

for (const t of targets) {
  const dataUri = 'data:image/svg+xml;base64,' + Buffer.from(t.src).toString('base64');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:transparent}
    img{display:block;width:${t.size}px;height:${t.size}px}
  </style></head><body><img src="${dataUri}"></body></html>`;
  const htmlPath = path.join(tmp, t.name + '.html');
  await fs.writeFile(htmlPath, html);
  const out = path.join(ICON_DIR, t.name);
  await exec(CHROME, [
    '--headless=new',
    '--no-sandbox',
    '--disable-gpu',
    '--hide-scrollbars',
    '--force-device-scale-factor=1',
    `--screenshot=${out}`,
    `--window-size=${t.size},${t.size}`,
    `file://${htmlPath}`,
  ]);
  console.log('✓ wrote', t.name, `(${t.size}×${t.size})`);
}

await fs.rm(tmp, { recursive: true, force: true });
console.log('Icons generated in', ICON_DIR);
