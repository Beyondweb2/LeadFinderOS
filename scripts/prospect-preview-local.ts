/* ════════════════════════════════════════════════════════════════════════════════════════════════
   PROSPECT PREVIEW — the LOCAL driver: render the fixtures and photograph them with headless Chrome.

     npx tsx scripts/prospect-preview-local.ts --out <dir> [--fixture ees|ees-nologo|keyline|all]

   Same generator (src/lib/prospectPreview/generate.ts) and same shot policy (shots.ts) as the edge
   function; only the browser differs (local Chrome over the DevTools protocol instead of
   Cloudflare Browser Rendering). Serves the rendered HTML + fixture assets from 127.0.0.1 so the
   page loads exactly as it would from storage. Writes PNGs, the HTML, the message and a QA report.
   Touches no database, sends nothing.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import { createServer } from 'node:http';
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs';
import { join, resolve, extname } from 'node:path';
import { tmpdir } from 'node:os';
import { generatePreview, buildCardHtml } from '../src/lib/prospectPreview/generate.ts';
import { SHOTS, QA_SHOTS, SHOT_SETTLE_MS, SHOT_MAX_HEIGHT_PX, type ShotSpec } from '../src/lib/prospectPreview/shots.ts';
import { eesFacts, eesHeadline, eesResearch, keylineFacts, keylineHeadline, EES_LOGO_SVG } from './prospect-preview-fixtures.ts';

const PORT = 4777;
const BASE = `http://127.0.0.1:${PORT}`;
const arg = (k: string, d: string) => { const i = process.argv.indexOf(`--${k}`); return i > 0 ? process.argv[i + 1] : d; };
const OUT = resolve(arg('out', join(tmpdir(), 'prospect-preview-out')));
const WHICH = arg('fixture', 'all');

const CHROME = [
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/usr/bin/google-chrome', '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
].find((p) => existsSync(p));

const FIXTURES = {
  ees: () => ({ facts: eesFacts({ assetBase: BASE }), headline: eesHeadline(), research: eesResearch('strong') }),
  'ees-nologo': () => ({ facts: eesFacts({ assetBase: BASE, logo: false }), headline: eesHeadline(), research: eesResearch('clean') }),
  keyline: () => ({ facts: keylineFacts({ assetBase: BASE }), headline: keylineHeadline(), research: eesResearch('content') }),
} as const;

/* ── static server ── */
const files = new Map<string, { body: Buffer | string; type: string }>();
const TYPES: Record<string, string> = { '.html': 'text/html; charset=utf-8', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png' };
files.set('/fixture/ees-logo.svg', { body: EES_LOGO_SVG, type: TYPES['.svg'] });
const server = createServer((req, res) => {
  const path = decodeURIComponent((req.url ?? '/').split('?')[0]);
  let f = files.get(path);
  if (!f && path.startsWith('/assets/')) {
    const p = join(process.cwd(), 'public/mockup-stock', path.slice('/assets/'.length));
    if (existsSync(p)) f = { body: readFileSync(p), type: TYPES[extname(p)] ?? 'application/octet-stream' };
  }
  if (!f) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Content-Type': f.type }); res.end(f.body);
});

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

async function shoot(page: Cdp, url: string, s: ShotSpec): Promise<{ png: Buffer; overflow: string[]; height: number }> {
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
    return { overflow: bad.slice(0, 8), sw: document.documentElement.scrollWidth, vw, h: document.documentElement.scrollHeight };
  })()` });
  const v = probe.result.value as { overflow: string[]; sw: number; vw: number; h: number };
  const overflow = [...(v.sw > v.vw ? [`page scrollWidth ${v.sw} > viewport ${v.vw}`] : []), ...v.overflow];
  let height = s.height;
  if (s.fullPage) {
    height = Math.min(v.h, SHOT_MAX_HEIGHT_PX);
    await page.send('Emulation.setDeviceMetricsOverride', { width: s.width, height, deviceScaleFactor: s.deviceScaleFactor, mobile: s.mobile });
    await new Promise((r) => setTimeout(r, 300));
  }
  const shot = await page.send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false, clip: { x: 0, y: 0, width: s.width, height, scale: 1 } });
  return { png: Buffer.from(shot.data, 'base64'), overflow, height };
}

async function run() {
  mkdirSync(OUT, { recursive: true });
  await new Promise<void>((r) => server.listen(PORT, '127.0.0.1', () => r()));
  const { page, kill } = await launch();
  const report: Record<string, unknown> = {};
  try {
    for (const [key, make] of Object.entries(FIXTURES)) {
      if (WHICH !== 'all' && WHICH !== key) continue;
      const t0 = Date.now();
      const input = make();
      const g = generatePreview({ facts: input.facts, headline: input.headline, research: input.research, year: 2026 });
      if (!g.ok) { report[key] = { failed: g }; console.log(`FAIL ${key}: ${g.stage} ${g.reason}`); continue; }
      const genMs = Date.now() - t0;
      const dir = join(OUT, key); mkdirSync(dir, { recursive: true });
      files.set(`/${key}/index.html`, { body: g.preview.homepageHtml, type: TYPES['.html'] });
      writeFileSync(join(dir, 'homepage.html'), g.preview.homepageHtml);
      const shots: Record<string, unknown> = {};
      let mobileHero: Buffer | null = null;
      for (const s of [...SHOTS, ...QA_SHOTS]) {
        if (s.doc === 'card') {
          const card = buildCardHtml(g.preview, mobileHero ? `data:image/png;base64,${mobileHero.toString('base64')}` : null);
          if (!card.ok) throw new Error(`card contamination: ${JSON.stringify(card.contamination)}`);
          files.set(`/${key}/card.html`, { body: card.html, type: TYPES['.html'] });
          writeFileSync(join(dir, 'card.html'), card.html);
        }
        const url = `${BASE}/${key}/${s.doc === 'card' ? 'card' : 'index'}.html`;
        const r = await shoot(page, url, s);
        if (s.asset === 'mobile_hero') mobileHero = r.png;
        writeFileSync(join(dir, `${s.asset}.png`), r.png);
        shots[s.asset] = { px: `${s.width * s.deviceScaleFactor}x${r.height * s.deviceScaleFactor}`, kb: Math.round(r.png.length / 1024), overflow: r.overflow };
      }
      writeFileSync(join(dir, 'message.txt'), g.preview.message);
      const totalMs = Date.now() - t0;
      report[key] = { template: g.preview.template.key, generateMs: genMs, totalMs, card: g.preview.card, notes: g.preview.notes, shots };
      console.log(`OK ${key}: generate ${genMs} ms, with screenshots ${totalMs} ms → ${dir}`);
    }
  } finally {
    kill();
    server.close();
  }
  writeFileSync(join(OUT, 'report.json'), JSON.stringify(report, null, 2));
  console.log(`report: ${join(OUT, 'report.json')}`);
}

run().catch((e) => { console.error(e); process.exit(1); });
