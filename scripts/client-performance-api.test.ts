/* ════════════════════════════════════════════════════════════════════════════════════════════
   CLIENT PERFORMANCE — the contract the two edge functions and the migration must keep (2026-09-22).

   Deno is not installed here, so `deno check` cannot run and the deploy is the only real gate for
   an edge function (CLAUDE.md §0/§3). What CAN be proved locally is the set of properties whose
   absence has actually broken this codebase before, and each of these is one of those:

     · a function missing from config.toml deploys with the platform default verify_jwt = TRUE,
       which killed three internal call paths in August;
     · an edge closure reaching src/lib must use relative imports with an EXPLICIT .ts extension —
       tsc and vite resolve the extensionless form happily and only the deploy says no;
     · a read that is not scoped on user_id is another operator's data;
     · an upsert without its conflict target duplicates every row it re-syncs.

   The idempotency and state rules themselves are executed, not merely grepped, because the fold
   that guarantees them lives in the shared library on purpose.
   ════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import {
  foldDailyRows,
  resolvePerformanceState,
  type RawAnalyticsRow,
} from '../src/lib/searchPerformance.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8');

const SYNC = read('supabase/functions/performance-sync/index.ts');
const API = read('supabase/functions/client-performance/index.ts');
const GOOGLE = read('supabase/functions/_shared/google-search-console.ts');
const CONFIG = read('supabase/config.toml');
const MIGRATION = read('supabase/migrations/20260922000000_client_performance.sql');
const PAGE = read('src/pages/ClientPerformance.tsx');

/* Scan EFFECTIVE code and copy, not the comments that explain it. A comment saying "GA4 is
   deliberately absent" is the documentation of the rule, not a breach of it — and stripping is the
   same thing client-copy-claims.test.ts does for the operator-screen sweep. */
const stripTs = (src: string) => src
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/^\s*\/\/.*$/gm, '');
const stripSql = (src: string) => src.replace(/^\s*--.*$/gm, '');

console.log('── DEPLOY WIRING: both functions are in config.toml, in this commit ──');
/* 🔴 A function absent from config.toml deploys with verify_jwt = TRUE. For performance-sync that
   means pg_cron's CRON_SECRET call is refused at the gateway and the only symptom is a Performance
   page that quietly stops updating. */
ok(/\[functions\.client-performance\]\s*\r?\n(?:#[^\n]*\r?\n)*verify_jwt = true/.test(CONFIG), 'client-performance: verify_jwt = true (SPA caller with the operator JWT)');
ok(/\[functions\.performance-sync\]\s*\r?\n(?:#[^\n]*\r?\n)*verify_jwt = false/.test(CONFIG), 'performance-sync: verify_jwt = false (cron caller, handler-side secret)');

console.log('── EDGE IMPORTS: relative, with the explicit .ts, and no @/ ──');
for (const [name, src] of [['performance-sync', SYNC], ['client-performance', API], ['google-search-console', GOOGLE]] as const) {
  const imports = [...src.matchAll(/from\s+"([^"]+)"/g)].map((m) => m[1]);
  ok(!imports.some((i) => i.startsWith('@/')), `${name}: no '@/' import (the bundler cannot resolve it)`);
  ok(imports.filter((i) => i.startsWith('.')).every((i) => i.endsWith('.ts')), `${name}: every relative import carries the explicit .ts`);
}
ok(SYNC.includes('"../../../src/lib/searchPerformance.ts"'), 'the sync reaches the shared rules module');
ok(API.includes('"../../../src/lib/searchPerformance.ts"'), 'the read API reaches the SAME shared rules module');
/* 🔴 ONE NORMALISER, TWO RUNTIMES. If the sync and the read ever normalise differently, the join
   matches nothing and every page on the screen reads "untracked". */
const LIB = read('src/lib/searchPerformance.ts');
ok(!/^\s*import\s/m.test(LIB), 'the shared module has NO imports of its own, so Deno and Vite both take it as-is');
ok((LIB.match(/export function normaliseUrl/g) ?? []).length === 1, 'there is exactly ONE normaliseUrl in the codebase');
ok(!/function normaliseUrl/.test(SYNC) && !/function normaliseUrl/.test(API), 'neither edge function defines its own copy');
ok((LIB.match(/export function finaliseTotals/g) ?? []).length === 1, 'there is exactly ONE place CTR and average position are computed');

console.log('── SQL AGGREGATES SUM; THEY NEVER COMPUTE A RATE ──');
/* If SQL returned a ctr or a position, the rule would exist in two places and one would drift. */
const fnBodies = MIGRATION.split('create or replace function').slice(1).join('\n');
ok(/sum\(d\.position \* d\.impressions\)/.test(fnBodies), 'the aggregate returns Σ(position × impressions), the additive quantity');
ok(!/avg\(/i.test(fnBodies), 'no avg() anywhere — a plain mean of positions is the bug this feature is most likely to ship');
ok(!/sum\(d\.clicks\)\s*\/\s*sum/i.test(fnBodies), 'no CTR division in SQL');
ok(/position_impressions/.test(MIGRATION) && /position_impressions/.test(API), 'the API reads the raw sum and finalises it in TS');

console.log('── OWNERSHIP: a read is scoped to the caller ──');
ok(/\.eq\("user_id", user\.id\)/.test(API), 'the lead lookup is scoped on user_id — another operator\'s lead id cannot be read');
ok(/auth\.getUser\(\)/.test(API), 'the handler verifies the caller\'s own JWT rather than trusting the gateway');
ok(/"client_not_found"/.test(API), 'a lead that is not the caller\'s returns not-found, not someone else\'s traffic');
/* Every subsequent read is keyed on the lead that just passed the ownership gate. */
for (const table of ['client_search_connections', 'client_tracked_pages']) {
  const re = new RegExp(`from\\("${table}"\\)[\\s\\S]{0,240}?\\.eq\\("lead_id", leadId\\)`);
  ok(re.test(API), `${table} is read only for the verified lead`);
}
for (const rpc of ['search_console_page_totals', 'search_console_query_totals', 'search_console_coverage']) {
  ok(new RegExp(`"${rpc}", \\{ p_lead: leadId`).test(API), `${rpc} is called with the verified lead id`);
}
ok(/security invoker/.test(MIGRATION), 'the aggregates are SECURITY INVOKER, so a browser calling them directly is still held by RLS');

console.log('── RLS: enabled WITH policies, in the same migration ──');
/* RLS enabled with no policy reads as 200 [] — a feature that silently does nothing. */
const TABLES = ['client_search_connections', 'client_tracked_pages', 'search_console_page_daily', 'search_console_query_daily'];
for (const t of TABLES) {
  ok(new RegExp(`alter table public\\.${t}\\s+enable row level security`).test(MIGRATION), `${t}: RLS enabled`);
  ok(new RegExp(`create policy ${t}_owner_all on public\\.${t}`).test(MIGRATION), `${t}: …and an owner policy in the SAME migration`);
}
ok(!/service_role_key|private_key|refresh_token/i.test(MIGRATION), 'no credential column anywhere in the schema');
ok(/GOOGLE_SERVICE_ACCOUNT_JSON/.test(MIGRATION), 'the migration says out loud where the credential actually lives');

console.log('── UPSERTS: every write names its conflict target ──');
const upserts = [...SYNC.matchAll(/upsertAll\(service, "([a-z_]+)", \w+, "([a-z_,]+)"\)/g)].map((m) => [m[1], m[2]]);
ok(upserts.length === 2, 'the sync performs exactly two upserts');
ok(upserts.some(([t, c]) => t === 'search_console_page_daily' && c === 'lead_id,date,page'), 'page rows conflict on (lead_id, date, page)');
ok(upserts.some(([t, c]) => t === 'search_console_query_daily' && c === 'lead_id,date,page,query'), 'query rows conflict on (lead_id, date, page, query)');
/* The conflict targets must be the unique indexes the migration actually creates, or the upsert
   throws at runtime and the whole night's sync is lost. */
ok(/unique \(lead_id, date, page\)/.test(MIGRATION), 'the page table has that exact unique key');
ok(/unique \(lead_id, date, page, query\)/.test(MIGRATION), 'the query table has that exact unique key');
ok(/ignoreDuplicates: false/.test(SYNC), 'a re-synced day UPDATES rather than being skipped — that is how a revised day is corrected');

console.log('── IDEMPOTENCY, EXECUTED: re-syncing cannot duplicate a daily row ──');
const raw: RawAnalyticsRow[] = [
  { date: '2026-09-18', page: 'https://mc-locksmiths.com/car-keys/', clicks: 3, impressions: 100, position: 5 },
  // The same page by our rule, reported separately by Google. Two rows, one unique key.
  { date: '2026-09-18', page: 'https://mc-locksmiths.com/car-keys/?utm_source=gbp', clicks: 2, impressions: 60, position: 9 },
  { date: '2026-09-18', page: 'http://www.mc-locksmiths.com/car-keys', clicks: 1, impressions: 40, position: 7 },
  { date: '2026-09-19', page: 'https://mc-locksmiths.com/car-keys/', clicks: 4, impressions: 80, position: 4 },
];
const folded = foldDailyRows(raw, 'mc-locksmiths.com', false);
/* 🔴 WITHOUT THE FOLD THIS IS A HARD POSTGRES ERROR — "ON CONFLICT DO UPDATE command cannot affect
   row a second time" — and the entire day's write is lost, not just the duplicate. */
const keys = folded.map((r) => `${r.date} ${r.page}`);
ok(new Set(keys).size === keys.length, 'the folded batch has no repeated (date, page) key');
ok(folded.length === 2, 'three rows for one page on one day collapse to one; a second day stays separate');
const d18 = folded.find((r) => r.date === '2026-09-18');
ok(!!d18 && d18.clicks === 6 && d18.impressions === 200, 'the collapsed row SUMS — the page really did get those clicks between the variants');
ok(!!d18 && Math.abs((d18.position ?? 0) - (5 * 100 + 9 * 60 + 7 * 40) / 200) < 1e-9, '…and re-weights position by impressions, not by row count');
ok(!!d18 && Math.abs((d18.ctr ?? 0) - 6 / 200) < 1e-12, '…and recomputes CTR from the summed totals');
/* Folding the same input twice is the same output — the write is a pure function of the window. */
ok(JSON.stringify(foldDailyRows(raw, 'mc-locksmiths.com', false)) === JSON.stringify(folded), 'the fold is deterministic, so a re-sync writes byte-identical rows');
const q = foldDailyRows([
  { date: '2026-09-18', page: 'https://mc-locksmiths.com/car-keys/', query: 'car key replacement', clicks: 1, impressions: 10, position: 4 },
  { date: '2026-09-18', page: 'https://mc-locksmiths.com/car-keys/?x=1', query: 'car key replacement', clicks: 2, impressions: 20, position: 6 },
  { date: '2026-09-18', page: 'https://mc-locksmiths.com/car-keys/', query: 'car key cutting', clicks: 1, impressions: 5, position: 8 },
], 'mc-locksmiths.com', true);
ok(q.length === 2, 'query rows fold on (date, page, query) — a different query stays its own row');
ok(new Set(q.map((r) => `${r.date} ${r.page} ${r.query}`)).size === 2, 'no repeated query key');
/* ⛔ Nothing is dropped, even when it will not normalise. A dropped row is traffic that silently
   never existed — and it would also hide a broken normaliser. */
const odd = foldDailyRows([{ date: '2026-09-18', page: 'android-app://com.example/', clicks: 1, impressions: 2, position: 1 }], 'mc-locksmiths.com', false);
ok(odd.length === 1 && odd[0].page === 'android-app://com.example/', 'a URL that will not normalise keeps its raw string rather than vanishing');

console.log('── THE FIVE STATES ARE RENDERED, each as its own arm ──');
for (const state of ['not_connected', 'property_missing', 'no_data', 'error', 'populated'] as const) {
  ok(PAGE.includes(`'${state}'`), `the page handles ${state} explicitly`);
  ok(resolvePerformanceState({ status: state === 'error' ? 'error' : 'connected', gsc_property: 'sc-domain:x.com' }, 1) !== undefined, `${state} is a real state`);
}
/* A catch-all error message is worse than none: it is the only thing distinguishing "the service
   account is not a user on that property" from "the property string is wrong". */
ok(/last_sync_error/.test(PAGE), 'the error state prints the REAL last_sync_error');
ok(/last_sync_error/.test(SYNC) && /status: "error"/.test(SYNC), 'the sync STORES its failure — the CLI has no functions logs, so a console-only error is undiagnosable');

console.log('── COVERAGE IS max(date), NEVER last_synced_at ──');
/* A sync that ran five minutes ago and returned nothing must not imply there is data for today. */
ok(/Data through \{day\(data\.coverage\.last_date\)\}|coverage\.last_date \? `Data through/.test(PAGE), 'the header reports coverage from the data');
ok(!/Data through[\s\S]{0,80}last_synced_at/.test(PAGE), '…and never derives coverage from the sync timestamp');
ok(/search_console_coverage/.test(MIGRATION) && /search_console_coverage/.test(API), 'coverage comes from min/max over the stored rows');

console.log('── NO CLAIM THAT DATA BEGINS AT VERIFICATION ──');
/* Google can collect for a property before it is verified. Phase 1 states only what is stored. */
for (const [name, src] of [['the page', PAGE], ['the sync', SYNC], ['the API', API], ['the lib', LIB]] as const) {
  ok(!/verifi(ed|cation)/i.test(stripTs(src)), `${name}: no code or copy ties data availability to a verification date`);
}

console.log('── PHASE 1 IS SEARCH CONSOLE ONLY ──');
ok(!/\bga4\b|analyticsdata|analytics\.readonly/i.test(stripSql(MIGRATION)), 'the migration: no GA4 column — it arrives in its own phase, not as a dead field nothing writes');
for (const [name, src] of [['the sync', SYNC], ['the API', API], ['the page', PAGE]] as const) {
  ok(!/\bga4\b|analyticsdata|analytics\.readonly/i.test(stripTs(src)), `${name}: no GA4 surface`);
}
ok(/webmasters\.readonly/.test(GOOGLE), 'the Google client requests the READONLY Search Console scope');
ok(!/webmasters['"]\s*$|auth\/webmasters"/m.test(GOOGLE), '…and never the read-write one');

console.log('── THE CREDENTIAL IS NEVER PERSISTED, RETURNED OR LOGGED ──');
ok(/GOOGLE_SERVICE_ACCOUNT_JSON/.test(GOOGLE), 'the key is read from the edge secret');
ok(!/console\.log[^\n]*private_key|console\.log[^\n]*account\./i.test(GOOGLE), 'no log statement touches the account object');
ok(!/private_key/.test(SYNC) && !/private_key/.test(API), 'neither handler names the key material at all');
ok(!/access_token/.test(SYNC), 'the access token is never stored or echoed by the sync');
/* Naming the SHAPE of a bad secret, never its value (CLAUDE.md §4). */
ok(/is not valid JSON|has no client_email|has no private_key|not a PKCS#8 PEM/.test(GOOGLE), 'a malformed key produces a message about what is MISSING, never about what was found');

console.log('── BOUNDEDNESS ──');
ok(/MAX_CLIENTS_PER_RUN/.test(SYNC), 'the daily run is capped at a number of clients');
ok(/BACKFILL_CHUNK_DAYS/.test(SYNC) && /chunkWindow/.test(SYNC), 'the backfill walks bounded chunks rather than 90 days in one request');
ok(/chunks_total/.test(SYNC) && /next_chunk/.test(SYNC), '…and tells the caller how many remain, so the loop lives outside the wall clock');
ok(/backfill_requires_lead_id/.test(SYNC), 'a backfill without a lead id is refused — it is a one-client operation by design');

console.log('── AI VISIBILITY AND GOOGLE PERFORMANCE ARE NOT COMBINED ──');
ok(!/named|visibility.*score|combined/i.test(PAGE.replace(/AI visibility is measured separately and is not combined with these figures\./g, '').replace(/[\s\S]*?\*\//, '')), 'the screen computes nothing from the AI side');
ok(!/ai_audits|namedSignal|measurementCompare/.test(PAGE + API + SYNC), 'no performance surface reads the AI measurement tables at all');

if (f > 0) { console.log(`\n${f} FAILURE${f === 1 ? '' : 'S'}`); process.exit(1); }
console.log('\nALL PASS');
