// A LOCAL BROWSER FOR THE BENCH (2026-11-15). Production reads a JavaScript site's pages in Cloudflare Browser Rendering
// (_shared/site-render.ts); the bench answers the same request from headless Edge on this machine, under the same honest
// name, so recording a site costs nothing. Only used while RECORDING; a replay never starts a browser.
import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const EDGE = ['C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find((p) => existsSync(p));

/* Captured at load, before the bench routes fetch through its recorder: the browser's own control calls are never recorded. */
const realFetch = globalThis.fetch.bind(globalThis);
let proc: ChildProcess | null = null;
let profile = '';
let wsBase = '';

let starting: Promise<void> | null = null;
function start(): Promise<void> {
  return (starting ??= launch());
}
async function launch(): Promise<void> {
  if (!EDGE) throw new Error('no Edge found');
  profile = mkdtempSync(path.join(tmpdir(), 'lfos-bench-edge-'));
  proc = spawn(EDGE, ['--headless=new', '--disable-gpu', '--no-first-run', '--no-default-browser-check', '--remote-debugging-port=0', `--user-data-dir=${profile}`, 'about:blank'], { stdio: 'ignore' });
  for (let i = 0; i < 100; i++) {
    const f = path.join(profile, 'DevToolsActivePort');
    if (existsSync(f)) {
      const [port] = readFileSync(f, 'utf8').split(/\r?\n/);
      if (port) { wsBase = `http://127.0.0.1:${port}`; return; }
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('Edge did not start');
}

function cdp(wsUrl: string) {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const waiting = new Map<number, (v: any) => void>();
  const listeners: Array<(m: any) => void> = [];
  ws.onmessage = (ev) => {
    const m = JSON.parse(String(ev.data));
    if (m.id && waiting.has(m.id)) { waiting.get(m.id)!(m); waiting.delete(m.id); } else listeners.forEach((l) => l(m));
  };
  const open = new Promise<void>((r, j) => { ws.onopen = () => r(); ws.onerror = () => j(new Error('cdp socket')); });
  return {
    open,
    send: (method: string, params: any = {}) => new Promise<any>((r) => { const n = ++id; waiting.set(n, r); ws.send(JSON.stringify({ id: n, method, params })); }),
    on: (l: (m: any) => void) => listeners.push(l),
    close: () => ws.close(),
  };
}

/** The page's HTML after its scripts ran, or null. Never throws. */
export async function renderLocally(url: string, userAgent: string): Promise<string | null> {
  const r = await inBrowser(url, userAgent, 'document.documentElement.outerHTML');
  return typeof r?.value === 'string' ? '<!DOCTYPE html>' + r.value : null;
}

/** Runs `expression` in the loaded page and returns its value (JSON), the final address and the HTTP status. Never throws. */
export async function inBrowser(url: string, userAgent: string, expression: string): Promise<{ value: any; finalUrl: string; status: number | null } | null> {
  try {
    await start();
    const t = await (await realFetch(`${wsBase}/json/new?about:blank`, { method: 'PUT' })).json() as { id: string; webSocketDebuggerUrl: string };
    const c = cdp(t.webSocketDebuggerUrl);
    await c.open;
    try {
      await c.send('Network.enable');
      await c.send('Network.setUserAgentOverride', { userAgent });
      await c.send('Network.setBlockedURLs', { urls: ['*.png', '*.jpg', '*.jpeg', '*.gif', '*.webp', '*.woff', '*.woff2', '*.ttf', '*.mp4'] });
      await c.send('Page.enable');
      let inflight = 0, lastChange = Date.now();
      let status: number | null = null;
      c.on((m) => {
        if (m.method === 'Network.responseReceived' && m.params?.type === 'Document' && status === null) status = m.params.response?.status ?? null;
        if (m.method === 'Network.requestWillBeSent') { inflight++; lastChange = Date.now(); }
        if (m.method === 'Network.loadingFinished' || m.method === 'Network.loadingFailed') { inflight = Math.max(0, inflight - 1); lastChange = Date.now(); }
      });
      await c.send('Page.navigate', { url });
      const t0 = Date.now();
      // networkidle2-ish: at most 2 requests in flight for 500 ms, within 20 s (Cloudflare's gotoOptions in site-render.ts).
      while (Date.now() - t0 < 20_000) {
        await new Promise((r) => setTimeout(r, 250));
        if (Date.now() - t0 > 1_500 && inflight <= 2 && Date.now() - lastChange > 500) {
          // Quiet network is not the same as drawn: an app shell keeps an empty body for a moment after its bundle loads.
          const t = await c.send('Runtime.evaluate', { expression: '(document.body && document.body.innerText || "").length', returnByValue: true });
          if (Number(t?.result?.result?.value ?? 0) > 200 || Date.now() - t0 > 12_000) break;
        }
      }
      const r = await c.send('Runtime.evaluate', { expression, returnByValue: true });
      const fin = await c.send('Runtime.evaluate', { expression: 'location.href', returnByValue: true });
      return { value: r?.result?.result?.value ?? null, finalUrl: String(fin?.result?.result?.value ?? url), status };
    } finally {
      c.close();
      await realFetch(`${wsBase}/json/close/${t.id}`).catch(() => {});
    }
  } catch (e) { if (process.env.BENCH_DEBUG) console.error("[edge-render]", e);
    return null;
  }
}

export function stopRenderer(): void {
  if (proc?.pid) {
    // Edge spawns children; kill the tree we started (by our own PID), never by name.
    try { spawn('taskkill', ['/PID', String(proc.pid), '/T', '/F'], { stdio: 'ignore' }); } catch { /* gone */ }
  }
  proc = null;
  starting = null;
  if (profile) setTimeout(() => { try { rmSync(profile, { recursive: true, force: true }); } catch { /* locked */ } }, 1500);
}
