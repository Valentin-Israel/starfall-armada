#!/usr/bin/env node
// Render PNG app icons from the master SVG using the headless Chromium that
// ships with this environment (no extra npm dependencies required), then pack a
// real multi-resolution favicon.ico (16/32/48) from PNG payloads.
import { promises as fs } from 'node:fs';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';
import url from 'node:url';
import os from 'node:os';

const exec = promisify(execFile);
const __dirname = path.dirname(url.fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const PUBLIC = path.join(ROOT, 'public');
const ICON_DIR = path.join(PUBLIC, 'assets', 'icons');

const CHROME = process.env.CHROME_BIN ||
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';

const svg = await fs.readFile(path.join(ICON_DIR, 'icon.svg'), 'utf8');
// Maskable variant: square full-bleed background, ship scaled into the safe zone.
const maskableSvg = svg
  .replace('rx="112"', 'rx="0"')
  .replace('translate(256 252)', 'translate(256 256) scale(0.72)');

const tmp = await fs.mkdtemp(path.join(os.tmpdir(), 'starfall-icons-'));

async function renderPng(src, size, outPath) {
  const dataUri = 'data:image/svg+xml;base64,' + Buffer.from(src).toString('base64');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:transparent}
    img{display:block;width:${size}px;height:${size}px}
  </style></head><body><img src="${dataUri}"></body></html>`;
  const htmlPath = path.join(tmp, `r${size}-${path.basename(outPath)}.html`);
  await fs.writeFile(htmlPath, html);
  await exec(CHROME, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
    '--force-device-scale-factor=1',
    `--screenshot=${outPath}`, `--window-size=${size},${size}`, `file://${htmlPath}`,
  ]);
}

// Pack an array of PNG buffers (square) into a single .ico file.
function packIco(images) {
  const count = images.length;
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);       // reserved
  header.writeUInt16LE(1, 2);       // type: 1 = icon
  header.writeUInt16LE(count, 4);   // image count

  const dir = Buffer.alloc(count * 16);
  let offset = 6 + count * 16;
  const chunks = [];
  images.forEach((img, i) => {
    const b = i * 16;
    dir.writeUInt8(img.size >= 256 ? 0 : img.size, b + 0); // width (0 = 256)
    dir.writeUInt8(img.size >= 256 ? 0 : img.size, b + 1); // height
    dir.writeUInt8(0, b + 2);                 // palette count
    dir.writeUInt8(0, b + 3);                 // reserved
    dir.writeUInt16LE(1, b + 4);              // color planes
    dir.writeUInt16LE(32, b + 6);             // bits per pixel
    dir.writeUInt32LE(img.data.length, b + 8); // image size
    dir.writeUInt32LE(offset, b + 12);        // image offset
    offset += img.data.length;
    chunks.push(img.data);
  });
  return Buffer.concat([header, dir, ...chunks]);
}

// PNGs referenced by the manifest / <head>.
const targets = [
  { name: 'icon-192.png', size: 192, src: svg },
  { name: 'icon-512.png', size: 512, src: svg },
  { name: 'icon-maskable-512.png', size: 512, src: maskableSvg },
  { name: 'apple-touch-icon.png', size: 180, src: svg },
];
for (const t of targets) {
  await renderPng(t.src, t.size, path.join(ICON_DIR, t.name));
  console.log('✓ wrote assets/icons/' + t.name, `(${t.size}²)`);
}

// favicon.ico — multi-resolution (16/32/48) at the well-known root path.
const icoSizes = [16, 32, 48];
const icoImages = [];
for (const size of icoSizes) {
  const p = path.join(tmp, `fav-${size}.png`);
  await renderPng(svg, size, p);
  icoImages.push({ size, data: await fs.readFile(p) });
}
const icoPath = path.join(PUBLIC, 'favicon.ico');
await fs.writeFile(icoPath, packIco(icoImages));
console.log('✓ wrote favicon.ico (16/32/48 multi-res)');

await fs.rm(tmp, { recursive: true, force: true });
console.log('Icons generated.');
