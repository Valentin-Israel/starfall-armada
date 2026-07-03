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

async function renderPng(src, size, outPath, { transparent = false, scale = 1, bg = null } = {}) {
  // For very large outputs (e.g. 2732² splash) Chrome caps the paintable
  // viewport and pads the screenshot with the default background color —
  // render via device-scale factor and set that default color explicitly
  // (transparent for icon layers, splash color for splashes).
  const cssSize = Math.round(size / scale);
  const dataUri = 'data:image/svg+xml;base64,' + Buffer.from(src).toString('base64');
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    html,body{margin:0;padding:0;background:${bg ? '#' + bg.slice(0, 6) : 'transparent'}}
    img{display:block;width:${cssSize}px;height:${cssSize}px}
  </style></head><body><img src="${dataUri}"></body></html>`;
  const htmlPath = path.join(tmp, `r${size}-${path.basename(outPath)}.html`);
  await fs.writeFile(htmlPath, html);
  const bgFlag = transparent ? '00000000' : bg;
  await exec(CHROME, [
    '--headless=new', '--no-sandbox', '--disable-gpu', '--hide-scrollbars',
    `--force-device-scale-factor=${scale}`,
    ...(bgFlag ? [`--default-background-color=${bgFlag}`] : []),
    `--screenshot=${outPath}`, `--window-size=${cssSize},${cssSize}`, `file://${htmlPath}`,
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

// NOTE: The web icons in public/assets/icons and public/favicon.ico are
// HAND-CURATED (uploaded manually) — this tool must NOT touch them anymore.
// It only produces the mobile source assets below (splash / adaptive layers).

// ---- Mobile source assets for `npx capacitor-assets generate` ----
// Convention (capacitorjs.com/docs/guides/splash-screens-and-icons):
//   assets/icon-only.png (1024²), icon-foreground.png + icon-background.png
//   (Android adaptive layers, 1024²), splash.png + splash-dark.png (2732²).
const MOBILE_DIR = path.join(ROOT, 'assets');
await fs.mkdir(MOBILE_DIR, { recursive: true });

// Shared defs from the master icon.
const DEFS = svg.slice(svg.indexOf('<defs>'), svg.indexOf('</defs>') + 7);
const SHIP = svg.slice(svg.indexOf('<!-- ship -->'), svg.lastIndexOf('</svg>'));

// icon-only: full-bleed background (stores apply their own corner masks).
const iconOnly = svg.replace('rx="112"', 'rx="0"');
await renderPng(iconOnly, 1024, path.join(MOBILE_DIR, 'icon-only.png'));
console.log('✓ wrote assets/icon-only.png (1024²)');

// Adaptive-icon foreground: ship only, transparent, scaled into the safe zone.
const fg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  ${DEFS}
  <g transform="translate(256 256) scale(0.62) translate(-256 -252)">${SHIP.replace('<!-- ship -->', '')}</g>
</svg>`;
await renderPng(fg, 1024, path.join(MOBILE_DIR, 'icon-foreground.png'), { transparent: true });
console.log('✓ wrote assets/icon-foreground.png (1024², transparent)');

// Adaptive-icon background: the nebula gradient, full bleed.
const bg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  ${DEFS}
  <rect width="512" height="512" fill="url(#bg)"/>
</svg>`;
await renderPng(bg, 1024, path.join(MOBILE_DIR, 'icon-background.png'));
console.log('✓ wrote assets/icon-background.png (1024²)');

// Splash: dark space background with the ship centered (safe for any crop).
const splash = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 2732 2732" width="2732" height="2732">
  ${DEFS}
  <rect width="2732" height="2732" fill="#02030a"/>
  <rect width="2732" height="2732" fill="url(#bg)" opacity="0.75"/>
  <g transform="translate(1366 1366) scale(1.35) translate(-256 -252)">${SHIP.replace('<!-- ship -->', '')}</g>
</svg>`;
await renderPng(splash, 2732, path.join(MOBILE_DIR, 'splash.png'), { scale: 2, bg: '02030aff' });
await fs.copyFile(path.join(MOBILE_DIR, 'splash.png'), path.join(MOBILE_DIR, 'splash-dark.png'));
console.log('✓ wrote assets/splash.png + splash-dark.png (2732²)');

await fs.rm(tmp, { recursive: true, force: true });
console.log('Icons generated.');
