/* ════════════════════════════════════════════════════════════════════════════════════════════════
   PROSPECT PREVIEW — the LOCAL driver: render previews and photograph them with headless Chrome.

     npx tsx scripts/prospect-preview-local.ts --out <dir> [--fixture ees|ees-nologo|keyline|all]

   Same pipeline as the edge function — planPreview → copyImages (only the images the template
   shows, validated, stored) → generatePreview → withShotCap → shotWithinCap — with a local folder
   standing in for the private bucket and local Chrome (DevTools protocol) standing in for
   Cloudflare Browser Rendering. Images are served from the local "bucket", never from their site.
   Touches no database, sends nothing. `startLocal` is exported so a validation script can render
   real leads' inputs through exactly this path.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve, extname, dirname } from 'node:path';
import { tmpdir } from 'node:os';
import { pathToFileURL } from 'node:url';
import { planPreview, generatePreview, buildCardHtml, type GenerateInput, type GeneratedPreview } from '../src/lib/prospectPreview/generate.ts';
import { copyImages, resolveStoredAssets, type CopiedImage } from '../src/lib/prospectPreview/assets.ts';
import { SHOTS, QA_SHOTS, SHOT_SETTLE_MS, withShotCap, shotWithinCap, type ShotSpec } from '../src/lib/prospectPreview/shots.ts';
import { eesFacts, eesHeadline, eesResearch, keylineFacts, keylineHeadline, EES_LOGO_SVG } from './prospect-preview-fixtures.ts';

const PORT = 4777;
const BASE = `http://127.0.0.1:${PORT}`;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36';

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((p) => existsSync(p));

const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.avif': 'image/avif' };

/* ── minimal CDP client ── */
type Cdp = { send: (method: string, params?: Record<string, unknown>) => Promise<any>; once: (event: string) => Promise<any>; close: () => void };
async function cdp(wsUrl: string): Promise<Cdp> {
  const ws = new WebSocket(wsUrl);
  await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
  let id = 0;
  const pending = new Map<number, (v: any) => void>();
  const waiters = new Map<string, Array<(v: any) => void>>();
  ws.onmessage = (m) => {
    const msg = JSON.parse(String(m.data));
    if (msg.id && pending.has(msg.id)) { pending.get(msg.id)!(msg.error ? Promise.reject(new Error(msg.error.message)) : msg.result); pending.delete(msg.id); }
    else if (msg.method && waiters.has(msg.method)) { const w = waiters.get(msg.method)!; waiters.delete(msg.method); w.forEach((fn) => fn(msg.params)); }
  };
  return {
    send: (method, params = {}) => new Promise((r) => { const i = ++id; pending.set(i, r); ws.send(JSON.stringify({ id: i, method, params })); }),
    once: (event) => new Promise((r) => { const w = waiters.get(event) ?? []; w.push(r); waiters.set(event, w); }),
    close: () => ws.close(),
  };
}

async function launch(): Promise<{ page: Cdp; kill: () => void }> {
  if (!CHROME) throw new Error('No Chrome/Edge found for local screenshots.');
  const profile = join(tmpdir(), `pp-chrome-${Date.now()}`);
  const proc = spawn(CHROME, ['--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`, '--hide-scrollbars', '--no-first-run', '--no-default-browser-check', '--disable-gpu', 'about:blank'], { stdio: ['ignore', 'ignore', 'pipe'] });
  const wsBrowser: string = await new Promise((r, j) => {
    let buf = '';
    proc.stderr!.on('data', (d) => { buf += String(d); const m = /DevTools listening on (ws:\/\/\S+)/.exec(buf); if (m) r(m[1]); });
    setTimeout(() => j(new Error('Chrome did not start')), 15000);
  });
  const port = new URL(wsBrowser).port;
  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json() as Array<{ type: string; webSocketDebuggerUrl: string }>;
  const page = await cdp(targets.find((t) => t.type === 'page')!.webSocketDebuggerUrl);
  await page.send('Page.enable');
  await page.send('Runtime.enable');
  return { page, kill: () => { page.close(); proc.kill(); } };
}

/** Photograph `url` per the shared policy. The height cap is already inside the document. */
async function shoot(page: Cdp, url: string, s: ShotSpec): Promise<{ png: Buffer; overflow: string[]; cssHeight: number; capped: boolean }> {
  await page.send('Emulation.setDeviceMetricsOverride', { width: s.width, height: s.height, deviceScaleFactor: s.deviceScaleFactor, mobile: s.mobile });
  await page.send('Emulation.setTouchEmulationEnabled', { enabled: s.mobile });
  const loaded = page.once('Page.loadEventFired');
  await page.send('Page.navigate', { url });
  await loaded;
  await page.send('Runtime.evaluate', { expression: 'document.fonts.ready.then(() => true)', awaitPromise: true });
  await new Promise((r) => setTimeout(r, SHOT_SETTLE_MS));
  const probe = await page.send('Runtime.evaluate', { returnByValue: true, expression: `(() => {
    const vw = document.documentElement.clientWidth; const bad = [];
    for (const el of document.querySelectorAll('body *')) { const r = el.getBoundingClientRect(); if (r.width && (r.right > vw + 1 || r.left < -1)) { const cs = getComputedStyle(el); if (cs.position !== 'fixed') bad.push(el.tagName + '.' + (el.className || '') + ' ' + Math.round(r.left) + '..' + Math.round(r.right)); } }
    const capped = document.documentElement.getAttribute('data-shot-height');
    return { overflow: bad.slice(0, 8), sw: document.documentElement.scrollWidth, vw, h: Math.min(document.documentElement.scrollHeight, capped ? Number(capped) : 1e9), removed: !!capped };
  })()` });
  const v = probe.result.value as { overflow: string[]; sw: number; vw: number; h: number; removed: boolean };
  const overflow = [...(v.sw > v.vw ? [`page scrollWidth ${v.sw} > viewport ${v.vw}`] : []), ...v.overflow];
  let height = s.height;
  if (s.fullPage) {
    height = Math.min(v.h, s.maxCssHeight);
    await page.send('Emulation.setDeviceMetricsOverride', { width: s.width, height, deviceScaleFactor: s.deviceScaleFactor, mobile: s.mobile });
    await new Promise((r) => setTimeout(r, 300));
  }
  const shot = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, clip: { x: 0, y: 0, width: s.width, height, scale: 1 } });
  return { png: Buffer.from(shot.data, 'base64'), overflow, cssHeight: height, capped: s.fullPage && height >= s.maxCssHeight };
}

export interface LocalResult { ok: boolean; stage?: string; reason?: string; dir?: string; preview?: GeneratedPreview; images?: CopiedImage[]; timings?: Record<string, number>; shots?: Record<string, unknown>; detail?: unknown }

export async function startLocal(out: string) {
  mkdirSync(out, { recursive: true });
  const files = new Map<string, { body: Buffer | string; type: string }>();
  files.set('/fixture/ees-logo.svg', { body: EES_LOGO_SVG, type: TYPES['.svg'] });
  const server = createServer((req, res) => {
    const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
    let f = files.get(path);
    if (!f && path.startsWith('/assets/')) {
      const p = join(process.cwd(), 'public/mockup-stock', path.slice('/assets/'.length));
      if (existsSync(p)) f = { body: readFileSync(p), type: TYPES[extname(p)] ?? 'application/octet-stream' };
    }
    if (!f && path.startsWith('/bucket/')) {
      const p = join(out, 'bucket', path.slice('/bucket/'.length));
      if (existsSync(p)) f = { body: readFileSync(p), type: TYPES[extname(p)] ?? 'application/octet-stream' };
    }
    if (!f) { res.writeHead(404); res.end(); return; }
    res.writeHead(200, { 'Content-Type': f.type }); res.end(f.body);
  });
  await new Promise<void>((r) => server.listen(PORT, '127.0.0.1', () => r()));
  const { page, kill } = await launch();

  const renderOne = async (key: string, input: Omit<GenerateInput, 'images'>): Promise<LocalResult> => {
    const t0 = Date.now();
    const timings: Record<string, number> = {};
    const planned = planPreview(input.facts, input.registry);
    if (planned.ok === false) return { ok: false, stage: planned.stage, reason: planned.reason };
    const dir = `${key}/preview`;
    const t1 = Date.now();
    const images = await copyImages(planned.imagesToCopy, dir, {
      fetchBytes: async (url, max) => {
        try {
          const ctl = new AbortController(); const t = setTimeout(() => ctl.abort(), 8000);
          const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'image/avif,image/webp,image/*;q=0.9,*/*;q=0.5' }, signal: ctl.signal, redirect: 'follow' });
          clearTimeout(t);
          if (!r.ok) return null;
          const buf = new Uint8Array(await r.arrayBuffer());
          return { bytes: buf.subarray(0, Math.min(buf.length, max)), contentType: r.headers.get('content-type') };
        } catch { return null; }
      },
      store: async (path, bytes) => { const p = join(out, 'bucket', path); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, bytes); },
    });
    timings.imagesMs = Date.now() - t1;
    const t2 = Date.now();
    const g = generatePreview({ ...input, images });
    timings.buildMs = Date.now() - t2;
    if (!g.ok) return { ok: false, stage: g.stage, reason: g.reason, detail: g.contamination ?? g.problems, images };
    const outDir = join(out, key); mkdirSync(outDir, { recursive: true });
    const live = (html: string) => resolveStoredAssets(html, (path) => `${BASE}/bucket/${path}`);
    writeFileSync(join(outDir, 'homepage.html'), g.preview.homepageHtml);
    const shots: Record<string, unknown> = {};
    let mobileHero: Buffer | null = null;
    const t3 = Date.now();
    for (const s of [...SHOTS, ...QA_SHOTS]) {
      let html = live(g.preview.homepageHtml);
      if (s.doc === 'card') {
        const card = buildCardHtml(g.preview, mobileHero ? `data:image/png;base64,${mobileHero.toString('base64')}` : null);
        if (!card.ok) return { ok: false, stage: 'building', reason: 'card contamination', detail: card.contamination };
        html = card.html;
        writeFileSync(join(outDir, 'card.html'), card.html);
      }
      files.set(`/${key}/${s.asset}.html`, { body: withShotCap(html, s), type: TYPES['.html'] });
      const r = await shoot(page, `${BASE}/${key}/${s.asset}.html`, s);
      const cap = shotWithinCap(new Uint8Array(r.png), s);
      if (s.asset === 'mobile_hero') mobileHero = r.png;
      writeFileSync(join(outDir, `${s.asset}.png`), r.png);
      shots[s.asset] = { px: cap.ok ? `${cap.width}x${cap.height}` : null, withinCap: cap.ok ? true : cap.reason, cappedAtMax: r.capped, kb: Math.round(r.png.length / 1024), overflow: r.overflow };
    }
    timings.renderMs = Date.now() - t3;
    timings.totalMs = Date.now() - t0;
    writeFileSync(join(outDir, 'message.txt'), g.preview.message);
    return { ok: true, dir: outDir, preview: g.preview, images, timings, shots };
  };
  /** Read-only: photograph a live page (e.g. their CURRENT homepage, for side-by-side QA). */
  const shootExternal = async (url: string, file: string) => {
    const r = await shoot(page, url, SHOTS[0]);
    writeFileSync(file, r.png);
  };
  return { renderOne, shootExternal, close: () => { kill(); server.close(); } };
}

const FIXTURES = {
  ees: () => ({ facts: eesFacts({ assetBase: BASE }), headline: eesHeadline(), research: eesResearch('strong') }),
  'ees-nologo': () => ({ facts: eesFacts({ assetBase: BASE, logo: false }), headline: eesHeadline(), research: eesResearch('clean') }),
  keyline: () => ({ facts: keylineFacts({ assetBase: BASE }), headline: keylineHeadline(), research: eesResearch('content') }),
} as const;

async function main() {
  const arg = (k: string, d: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
  const out = resolve(arg('out', join(tmpdir(), 'prospect-preview-out')));
  const which = arg('fixture', 'all');
  const local = await startLocal(out);
  const report: Record<string, unknown> = {};
  try {
    for (const [key, make] of Object.entries(FIXTURES)) {
      if (which !== 'all' && which !== key) continue;
      const r = await local.renderOne(key, { ...make(), year: 2026 });
      report[key] = r.ok ? { template: r.preview!.template.key, timings: r.timings, images: r.images, notes: r.preview!.notes, shots: r.shots } : r;
      console.log(r.ok ? `OK ${key}: ${r.timings!.totalMs} ms → ${r.dir}` : `FAIL ${key}: ${r.stage} ${r.reason}`);
    }
  } finally { local.close(); }
  writeFileSync(join(out, 'report.json'), JSON.stringify(report, null, 2));
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) main().catch((e) => { console.error(e); process.exit(1); });
