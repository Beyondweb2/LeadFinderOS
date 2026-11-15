// THE BENCH'S NETWORK (2026-11-15). Every fetch the crawl code makes goes through here:
//   record  → the real site is fetched once (our honest crawler name, as production), and the answer saved;
//   replay  → the saved answer is served, byte for byte, with the time it took — no site is contacted.
// A JavaScript page read "in a browser" is answered by local headless Edge when recording. A model call is answered only
// from saved answers (the key lives in Supabase; scripts/website-check-bench/model-calls.ts fetches them through the
// website-check-bench edge function). The crawl's own start/stop calls to crawl-worker are answered with an empty 200.
import { gunzipSync, gzipSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { renderLocally } from './edge-render.ts';

export const BENCH_DIR = path.resolve(import.meta.dirname);
export const CACHE_DIR = path.join(BENCH_DIR, 'cache');
const MODEL_CACHE = path.join(CACHE_DIR, 'model-answers.json');
const MODEL_PENDING = path.join(CACHE_DIR, 'model-pending.json');

interface Saved { status: number; url: string; ct: string | null; xr: string | null; b64: string; ms: number; err?: string }
export type NetMode = 'record' | 'replay';

const realFetch = globalThis.fetch.bind(globalThis);
const sha = (s: string) => createHash('sha256').update(s).digest('hex').slice(0, 24);

export class SiteNet {
  private saved: Record<string, Saved> = {};
  private dirty = false;
  public misses: string[] = [];
  constructor(public slug: string, public mode: NetMode, public opts: { modelOverride?: string | null; realTime?: boolean } = {}) {
    const f = this.file();
    if (existsSync(f)) this.saved = JSON.parse(gunzipSync(readFileSync(f)).toString('utf8'));
  }
  file() { return path.join(CACHE_DIR, `${this.slug}.json.gz`); }
  save() {
    if (!this.dirty) return;
    mkdirSync(CACHE_DIR, { recursive: true });
    writeFileSync(this.file(), gzipSync(Buffer.from(JSON.stringify(this.saved)), { level: 9 }));
    this.dirty = false;
  }

  private respond(s: Saved): Response {
    if (s.err) throw Object.assign(new Error(s.err), { name: s.err === 'timeout' ? 'AbortError' : 'TypeError' });
    const headers = new Headers();
    if (s.ct) headers.set('content-type', s.ct);
    if (s.xr) headers.set('x-robots-tag', s.xr);
    const res = new Response(s.status === 204 || s.status === 304 ? null : Buffer.from(s.b64, 'base64'), { status: s.status, headers });
    Object.defineProperty(res, 'url', { value: s.url });
    return res;
  }

  async fetch(input: RequestInfo | URL, init: RequestInit = {}): Promise<Response> {
    const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
    const method = (init.method ?? 'GET').toUpperCase();
    if (/\/functions\/v1\/crawl-worker$/.test(url)) return new Response('{}', { status: 200 });
    if (/api\.cloudflare\.com\/.*\/browser-rendering\/content$/.test(url)) return this.render(JSON.parse(String(init.body ?? '{}')));
    if (/api\.openai\.com\/v1\/chat\/completions$/.test(url)) return modelAnswer(String(init.body ?? '{}'), this.opts.modelOverride ?? null);
    if (method !== 'GET') throw new Error(`bench: unexpected ${method} ${url}`);
    const key = `GET ${url}`;
    let s = this.saved[key];
    if (!s) {
      if (this.mode === 'replay') { this.misses.push(url); s = { status: 0, url, ct: null, xr: null, b64: '', ms: 0, err: 'not recorded' }; }
      else {
        const t0 = Date.now();
        try {
          const res = await realFetch(url, { ...init, redirect: 'follow' });
          const buf = Buffer.from(await res.arrayBuffer());
          s = { status: res.status, url: res.url || url, ct: res.headers.get('content-type'), xr: res.headers.get('x-robots-tag'), b64: buf.toString('base64'), ms: Date.now() - t0 };
        } catch (e) {
          const err = (e as Error)?.name === 'AbortError' ? 'timeout' : String((e as Error)?.message ?? e).slice(0, 200);
          s = { status: 0, url, ct: null, xr: null, b64: '', ms: Date.now() - t0, err };
        }
        this.saved[key] = s; this.dirty = true;
      }
    } else if (this.opts.realTime !== false && s.ms > 0) {
      // The page-speed check reads how long a fetch took: replay takes the recorded time (capped by the crawl's own timeout).
      await new Promise((r) => setTimeout(r, Math.min(s.ms, 10_500)));
    }
    return this.respond(s);
  }

  private async render(body: { url?: string; userAgent?: string }): Promise<Response> {
    const url = String(body.url ?? '');
    const key = `RENDER ${url}`;
    let s = this.saved[key];
    if (s && s.status !== 200 && this.mode === 'record') s = undefined as unknown as Saved; // a failed browser read is tried again when recording
    if (!s) {
      if (this.mode === 'replay') { this.misses.push(`render ${url}`); return new Response('not recorded', { status: 502 }); }
      const html = await renderLocally(url, String(body.userAgent ?? ''));
      s = { status: html ? 200 : 502, url, ct: 'application/json', xr: null, b64: Buffer.from(html ? JSON.stringify({ success: true, result: html }) : 'render failed').toString('base64'), ms: 0 };
      this.saved[key] = s; this.dirty = true;
    }
    return this.respond(s);
  }
}

/* ── model answers (shared by every site) ─────────────────────────────────────────────────── */

let answers: Record<string, any> | null = null;
let pending: Record<string, any> = {};
/** Every question asked in this run, answered or not, keyed by the site's business name (for scoring the models). */
const questions: Record<string, any> = {};
const loadAnswers = () => (answers ??= existsSync(MODEL_CACHE) ? JSON.parse(readFileSync(MODEL_CACHE, 'utf8')) : {});
export function modelKey(body: any): string { return sha(JSON.stringify({ model: body.model, messages: body.messages })); }

function modelAnswer(raw: string, override: string | null): Response {
  const body = JSON.parse(raw);
  if (override) body.model = override;
  const key = modelKey(body);
  try { questions[JSON.parse(body.messages[1].content).business ?? key] = body; } catch { /* not JSON */ }
  const a = loadAnswers()[key];
  if (a) return new Response(JSON.stringify(a), { status: 200, headers: { 'content-type': 'application/json' } });
  pending[key] = body;
  return new Response('{"error":"not fetched yet"}', { status: 503 });
}
export function savePendingModelCalls(): number {
  const prev = existsSync(MODEL_PENDING) ? JSON.parse(readFileSync(MODEL_PENDING, 'utf8')) : {};
  const all = { ...prev, ...pending };
  for (const k of Object.keys(loadAnswers())) delete all[k];
  mkdirSync(CACHE_DIR, { recursive: true });
  writeFileSync(MODEL_PENDING, JSON.stringify(all, null, 1));
  if (Object.keys(questions).length) writeFileSync(path.join(CACHE_DIR, 'model-questions.json'), JSON.stringify(questions, null, 1));
  return Object.keys(all).length;
}
export function storeModelAnswers(fresh: Record<string, any>) {
  const all = { ...loadAnswers(), ...fresh };
  answers = all;
  writeFileSync(MODEL_CACHE, JSON.stringify(all, null, 1));
}
export const modelFiles = { MODEL_CACHE, MODEL_PENDING };
