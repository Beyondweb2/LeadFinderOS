/* The Coverage niche lookup reads ai_audit_queue.result_niche, a trimmed copy of result (2026-09-28,
   migration 20260928090000). The PROOF that the live column matches is the zero-difference check run
   over every row before the switch; this test pins the SHAPE: a mirror of niche_result_slim(), folded
   back by nicheFoldResult(), must give the fold helpers exactly what the full result gives them.
   Run: npx tsx scripts/niche-result-slim.test.ts */
import { readFileSync } from "node:fs";
import { nicheFoldResult } from "../supabase/functions/_shared/niche-result.ts";
import { classifyWinnability, runIsModelRead, unwrapCitationUrl, DISPLAY_ENGINES, type EngineMap, type QueueRow } from "../src/lib/auditReport.ts";
import { cellNamed } from "../src/lib/namedSignal.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const norm = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

/** A line-for-line JS mirror of public.niche_result_slim (JSON null wherever SQL's -> finds nothing). */
const truthy = (v: unknown) => typeof v === "string" ? v !== "" : typeof v === "number" ? v !== 0
  : typeof v === "boolean" ? v : (v !== null && typeof v === "object");
function slimMirror(r: unknown): unknown {
  if (r == null) return null;
  if (typeof r !== "object" || Array.isArray(r)) return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r as Record<string, unknown>)) {
    if (!["chatgpt", "gemini", "ai_overview", "google_organic"].includes(k)) continue;
    if (!v || typeof v !== "object" || Array.isArray(v)) { out[k] = v; continue; }
    const e = v as Record<string, unknown>;
    const cits = Array.isArray(e.citations)
      ? e.citations.map((c) => (c && typeof c === "object" && !Array.isArray(c)) ? { url: (c as { url?: unknown }).url ?? null } : c)
      : e.citations ?? null;
    out[k] = { named: e.named ?? null, self_named: e.self_named ?? null, position: e.position ?? null,
      competitors: e.competitors ?? null, citations: cits, answer_present: truthy(e.answer_text) };
  }
  return out;
}
// Through JSON both ways, as PostgREST would carry it.
const viaDb = (r: unknown) => nicheFoldResult(JSON.parse(JSON.stringify(slimMirror(JSON.parse(JSON.stringify(r))))));

let seed = 7;
const rnd = () => ((seed = (seed * 1103515245 + 12345) % 2 ** 31) / 2 ** 31);
const pick = <T,>(xs: T[]): T => xs[Math.floor(rnd() * xs.length)];
function engine(): Record<string, unknown> | undefined {
  if (rnd() < 0.15) return undefined;
  const e: Record<string, unknown> = {
    answer_text: pick(["", "Try Acme Plumbing in Leeds, or Bob's.", "A long answer ".repeat(40), null, undefined]),
    competitors: pick([[], ["Acme Plumbing", "Bob's Plumbing"], ["Leeds Heating Ltd"], ["x"]]),
    citations: pick([[], [{ url: "https://www.checkatrade.com/trades/acme", title: "Acme", snippet: "…" }],
      [{ url: "https://acmeplumbing.co.uk/", title: "Home" }, { url: "https://www.google.com/url?q=https%3A%2F%2Fyell.com%2Fx" }], [{ title: "no url" }]]),
  };
  if (rnd() < 0.8) e.named = rnd() < 0.3;
  if (rnd() < 0.6) e.self_named = rnd() < 0.3;
  if (rnd() < 0.5) e.position = Math.ceil(rnd() * 5);
  if (rnd() < 0.3) e.extra_noise = { big: "y".repeat(500) };
  for (const k of Object.keys(e)) if (e[k] === undefined) delete e[k];
  return e;
}
const isAgg = (u: string) => /checkatrade|yell/.test(u);
const safe = (fn: () => unknown) => { try { return JSON.stringify(fn()); } catch (e) { return `THROW ${(e as Error).message}`; } };

let cells = 0, diffs = 0;
const rowsFull: QueueRow[] = [], rowsSlim: QueueRow[] = [];
for (let i = 0; i < 600; i++) {
  const full: Record<string, unknown> = { raw_payload: { huge: "z".repeat(200) } };
  for (const e of DISPLAY_ENGINES) { const v = engine(); if (v) full[e] = v; }
  const slim = viaDb(full) as EngineMap;
  const opts = { businessName: "Acme Plumbing", locationText: "Leeds", ownWebsite: "https://acmeplumbing.co.uk", isAggregatorUrl: isAgg };
  if (safe(() => classifyWinnability(full as EngineMap, opts)) !== safe(() => classifyWinnability(slim, opts))) diffs++;
  for (const e of DISPLAY_ENGINES) {
    const a = (full as EngineMap)[e], b = slim[e];
    cells++;
    if (!!a !== !!b) { diffs++; continue; }
    if (!a) continue;
    if (cellNamed(a) !== cellNamed(b)) diffs++;
    const urls = (x: typeof a) => JSON.stringify((x.citations ?? []).map((c) => unwrapCitationUrl((c as { url?: string })?.url ?? "")));
    if (urls(a) !== urls(b)) diffs++;
    if (JSON.stringify(a.competitors) !== JSON.stringify(b.competitors)) diffs++;
    if (!!(a as { answer_text?: unknown }).answer_text !== !!(b as { answer_text?: unknown }).answer_text) diffs++;
  }
  rowsFull.push({ id: `q${i}`, question: `q${i % 30}`, status: "done", result: full as EngineMap });
  rowsSlim.push({ id: `q${i}`, question: `q${i % 30}`, status: "done", result: slim });
}
ok(diffs === 0, `600 synthetic results, ${cells} engine cells: winnability, named, citations, competitors, answered — ${diffs} differences`);
for (let k = 0; k < 20; k++) {
  const s = k * 30, part = (r: QueueRow[]) => r.slice(s, s + 30);
  if (runIsModelRead(part(rowsFull)) !== runIsModelRead(part(rowsSlim))) diffs++;
}
ok(diffs === 0, "runIsModelRead agrees on every run");
ok(JSON.stringify(nicheFoldResult(null)) === "{}" && JSON.stringify(nicheFoldResult([])) === "{}", "absent slim value folds to an empty result, as (r.result ?? {}) did");
const big = { chatgpt: { named: true, answer_text: "x".repeat(5000), citations: [{ url: "https://a.com", snippet: "s".repeat(2000) }] } };
ok(JSON.stringify(slimMirror(big)).length < 200, "the trimmed value drops the answer text and citation bodies");

console.log("── the switch is the niche lookup only; result stays the source of truth ──");
const mv = norm("../supabase/functions/market-view/index.ts");
ok(/"audit_id, run_id, question, result:result_niche"/.test(mv) && /result: nicheFoldResult\(r\.result\)/.test(mv), "market-view's niche read selects result_niche and folds it back");
const mig = norm("../supabase/migrations/20260928090000_ai_audit_queue_result_niche.sql");
ok(/add column if not exists result_niche jsonb/.test(mig), "additive nullable column");
ok(/new\.result_niche := public\.niche_result_slim\(new\.result\)/.test(mig), "the existing parts trigger keeps it in step with result");
ok(!/update public\.ai_audit_queue[^;]*set result\s*=/.test(mig), "nothing writes result");
ok(/'chatgpt', 'gemini', 'ai_overview', 'google_organic'/.test(mig), "same four engines as DISPLAY_ENGINES");
ok(JSON.stringify([...DISPLAY_ENGINES]) === JSON.stringify(["chatgpt", "gemini", "ai_overview", "google_organic"]), "DISPLAY_ENGINES unchanged (a new engine needs the SQL function too)");
const grep = (p: string) => { try { return norm(p); } catch { return ""; } };
ok(!/result_niche/.test(grep("../src/lib/auditReport.ts") + grep("../supabase/functions/render-audit-report/index.ts")), "the client report still reads the full result");

console.log(f === 0 ? "\nALL PASS" : `\n${f} FAILED`);
if (f > 0) process.exit(1);
