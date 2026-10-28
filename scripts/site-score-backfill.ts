/* Site score backfill (2026-10-23, docs/site-score.md). Scores every stored website check that has no score yet, from the
   check ALREADY STORED on the row (result.websiteCheck) — it starts no crawl, fetches no website and sends nothing.

   npx tsx scripts/site-score-backfill.ts --token-file <path> [--write]
     without --write: prints what it would store (counts, bands, unreadable reasons) and changes nothing.
     with --write:    stores the score columns, a page at a time.

   ⛔ The token is the Supabase Management API token, read from a file OUTSIDE the repo; never printed.
   ⛔ A row is only written while its site_score_version is still null: a crawl that stores a newer check (and its own
      score) between this read and this write is never overwritten with the older one.

   --rescore-unverified (2026-10-28, fix/crawl-one-standard): re-scores rows that ALREADY have a score but whose stored check
     came from the old impostor crawl — no readable homepage recorded (readableAs null), a "blocked" list without robots.txt
     evidence, or the old search_crawler_refused issue. Scored the way the app reads them now (unread → couldn't check, the
     refused-crawler issue dropped). Still no crawl, no fetch. A row is written only while its site_score_at is unchanged
     since the read, so a fresh crawl's score is never replaced. Dry run without --write, as above. */
import { readFileSync } from 'node:fs';
import { SITE_SCORE_VERSION, siteScoreColumns, siteScoreForRow, siteScoreFromSummary, siteScoreBand, type SiteScore } from '../src/lib/siteScore.ts';
import { storedCrawlUnread } from '../src/lib/siteAudit.ts';
import { summariseWebsiteCheck } from '../src/lib/websiteCheck.ts';

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

if (args.includes('--rescore-unverified')) {
  type RRow = Row & { mode: string | null; signals: unknown; home_fetch: unknown; audit_version: string | null; prev_at: string | null; prev_state: string | null; prev_score: number | null };
  let after2 = '00000000-0000-0000-0000-000000000000';
  let seen = 0, changed = 0, wrote = 0;
  const moves: Record<string, number> = {};
  for (;;) {
    const rows = await sql<RRow>(`select id, result->'websiteCheck' as wc, result->>'checked_at' as checked_at, created_at, mode,
        result->'signals' as signals, result->'homeFetch' as home_fetch, full_evidence->'audit'->>'version' as audit_version,
        site_score_at as prev_at, site_score_state as prev_state, site_score as prev_score
      from public.lead_crawl_checks
      where site_score_version is not null and id > ${lit(after2)}::uuid
        and ((result->'signals') is not null and (result->'signals'->>'readableAs') is null
          or (jsonb_typeof(result->'signals'->'searchBlocked') = 'array' and jsonb_array_length(result->'signals'->'searchBlocked') > 0
              and (result->'signals'->>'blockEvidence') is distinct from 'robots')
          or (result->'websiteCheck'->'issues') @> '[{"id":"search_crawler_refused"}]'::jsonb)
      order by id limit ${PAGE}`);
    if (!rows.length) break;
    after2 = rows[rows.length - 1].id;
    seen += rows.length;
    const updates: Array<Record<string, unknown>> = [];
    for (const r of rows) {
      const row = { mode: r.mode, created_at: r.created_at, full_evidence: r.audit_version ? { audit: { version: Number(r.audit_version) } } : null,
        result: { websiteCheck: r.wc, checked_at: r.checked_at ?? undefined, signals: r.signals, homeFetch: r.home_fetch } } as never;
      /* Read as the app reads it now: an unread homepage is summarised afresh (couldn't check), never from its stored summary. */
      let score: SiteScore | null;
      if (storedCrawlUnread(row)) { const s = summariseWebsiteCheck(row); score = s ? siteScoreFromSummary(s) : null; }
      else score = siteScoreForRow(row);
      if (score?.state === r.prev_state && (score?.score ?? null) === (r.prev_score ?? null)) continue;
      changed++;
      const k = `${r.prev_state} -> ${score?.state ?? 'none'}`;
      moves[k] = (moves[k] ?? 0) + 1;
      updates.push({ id: r.id, prev_at: r.prev_at, ...siteScoreColumns(score, new Date().toISOString()) });
    }
    if (write && updates.length) {
      const done = await sql<{ n: number }>(`with v as (
          select * from jsonb_to_recordset(${lit(JSON.stringify(updates))}::jsonb) as x(id uuid, prev_at timestamptz, site_score smallint, site_score_state text,
            site_score_version smallint, site_score_reasons jsonb, site_score_detail jsonb, site_score_at timestamptz)
        ), u as (
          update public.lead_crawl_checks l set site_score = v.site_score, site_score_state = v.site_score_state, site_score_version = v.site_score_version,
            site_score_reasons = v.site_score_reasons, site_score_detail = v.site_score_detail, site_score_at = v.site_score_at
          from v where l.id = v.id and l.site_score_at is not distinct from v.prev_at returning 1
        ) select count(*)::int as n from u`);
      wrote += done[0]?.n ?? 0;
    }
  }
  console.log(JSON.stringify({ version: SITE_SCORE_VERSION, mode: write ? 'write' : 'dry-run', rescore: 'unverified', rowsMatched: seen, wouldChange: changed, written: wrote, moves }, null, 1));
  process.exit(0);
}

let after = '00000000-0000-0000-0000-000000000000';
let read = 0, written = 0, skippedNoSummary = 0, partial = 0;
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
    else if (score.state === 'partial' || score.score == null) partial++;
    else { scores.push(score.score); const b = siteScoreBand(score.score); bands[b] = (bands[b] ?? 0) + 1; }
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
  scored: scores.length, partial, bands, median: pct(0.5), p10: pct(0.1), p90: pct(0.9), min: scores[0] ?? null, max: scores[scores.length - 1] ?? null,
  unreadable,
}, null, 1));
