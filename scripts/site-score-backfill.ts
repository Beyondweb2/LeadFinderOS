/* Site score backfill (2026-10-23, docs/site-score.md). Scores every stored website check that has no score yet, from the
   check ALREADY STORED on the row (result.websiteCheck) — it starts no crawl, fetches no website and sends nothing.

   npx tsx scripts/site-score-backfill.ts --token-file <path> [--write]
     without --write: prints what it would store (counts, bands, unreadable reasons) and changes nothing.
     with --write:    stores the score columns, a page at a time.

   ⛔ The token is the Supabase Management API token, read from a file OUTSIDE the repo; never printed.
   ⛔ A row is only written while its site_score_version is still null: a crawl that stores a newer check (and its own
      score) between this read and this write is never overwritten with the older one. */
import { readFileSync } from 'node:fs';
import { SITE_SCORE_VERSION, siteScoreColumns, siteScoreForRow, siteScoreBand, type SiteScore } from '../src/lib/siteScore.ts';

const PROJECT = 'ruusxpkkmwtljxxulhbq';
const PAGE = 200;
const args = process.argv.slice(2);
const tokenFile = args[args.indexOf('--token-file') + 1];
const write = args.includes('--write');
if (!tokenFile || args.indexOf('--token-file') < 0) { console.error('usage: --token-file <path> [--write]'); process.exit(2); }
const token = readFileSync(tokenFile, 'utf8').trim();

async function sql<T>(query: string): Promise<T[]> {
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT}/database/query`, {
    method: 'POST', headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ query }),
  });
  const text = await res.text();
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${text.slice(0, 500)}`);
  return JSON.parse(text) as T[];
}

const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;
type Row = { id: string; wc: unknown; checked_at: string | null; created_at: string };

let after = '00000000-0000-0000-0000-000000000000';
let read = 0, written = 0, skippedNoSummary = 0;
const bands: Record<string, number> = {};
const unreadable: Record<string, number> = {};
const scores: number[] = [];
for (;;) {
  const rows = await sql<Row>(`select id, result->'websiteCheck' as wc, result->>'checked_at' as checked_at, created_at
    from public.lead_crawl_checks where site_score_version is null and id > ${lit(after)}::uuid order by id limit ${PAGE}`);
  if (!rows.length) break;
  after = rows[rows.length - 1].id;
  read += rows.length;
  const updates: Array<Record<string, unknown>> = [];
  for (const r of rows) {
    /* The stored summary only: a row without one is counted and left (no full-row read, no crawl). */
    const score: SiteScore | null = r.wc ? siteScoreForRow({ result: { websiteCheck: r.wc, checked_at: r.checked_at ?? undefined } as never, created_at: r.created_at } as never) : null;
    if (!score) { skippedNoSummary++; continue; }
    if (score.state === 'unreadable') { const k = score.reasons[0]?.text ?? '?'; unreadable[k] = (unreadable[k] ?? 0) + 1; }
    else { scores.push(score.score!); const b = siteScoreBand(score.score!); bands[b] = (bands[b] ?? 0) + 1; }
    updates.push({ id: r.id, ...siteScoreColumns(score, new Date().toISOString()) });
  }
  if (write && updates.length) {
    const payload = lit(JSON.stringify(updates));
    const done = await sql<{ n: number }>(`with v as (
        select * from jsonb_to_recordset(${payload}::jsonb) as x(id uuid, site_score smallint, site_score_state text, site_score_version smallint,
          site_score_reasons jsonb, site_score_detail jsonb, site_score_at timestamptz)
      ), u as (
        update public.lead_crawl_checks l set site_score = v.site_score, site_score_state = v.site_score_state, site_score_version = v.site_score_version,
          site_score_reasons = v.site_score_reasons, site_score_detail = v.site_score_detail, site_score_at = v.site_score_at
        from v where l.id = v.id and l.site_score_version is null returning 1
      ) select count(*)::int as n from u`);
    written += done[0]?.n ?? 0;
  }
  if (!write) continue;
}
scores.sort((a, b) => a - b);
const pct = (p: number) => scores.length ? scores[Math.min(scores.length - 1, Math.floor(p * scores.length))] : null;
console.log(JSON.stringify({
  version: SITE_SCORE_VERSION, mode: write ? 'write' : 'dry-run', read, written, skippedNoSummary,
  scored: scores.length, bands, median: pct(0.5), p10: pct(0.1), p90: pct(0.9), min: scores[0] ?? null, max: scores[scores.length - 1] ?? null,
  unreadable,
}, null, 1));
