/* Site score backfill (v1 2026-10-23; v2 2026-10-30, docs/site-score.md). Re-scores every stored website check with the
   CURRENT rubric (SITE_SCORE_VERSION) from the crawl ALREADY STORED on the row — it starts no crawl, fetches no website,
   spends nothing (no Apify, no model) and sends nothing.

   npx tsx scripts/site-score-backfill.ts --token-file <path> [--write]
     without --write: prints what it would store (bands, states, the calibration leads) and changes nothing.
     with --write:    stores the score columns and the evidence, a page at a time.

   ⛔ The token is the Supabase Management API token, read from a file OUTSIDE the repo; never printed.
   ⛔ A row is written only while its site_score_at is unchanged since the read: a crawl that stores a newer check (and its
      own score) between this read and this write is never overwritten with the older one.
   ⛔ The v1 score is kept: a row still on v1 whose site_score_v1 is empty has it copied in the same write (the migration
      copied every v1 row once; this covers a row scored by the old crawl code in between).
   Read the way every screen reads a row (siteScoreForRow): an unread homepage is "couldn't reach", never a number. */
import { readFileSync } from 'node:fs';
import { classifyLeadWebsite } from '../src/lib/leadWebsiteKind.ts';
import { SITE_SCORE_VERSION, siteScoreColumns, siteScoreForRow, siteScoreGroupOf, siteScoreViewFor, type SiteScore } from '../src/lib/siteScore.ts';

const PROJECT = 'ruusxpkkmwtljxxulhbq';
const PAGE = 150;
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
type Row = { id: string; lead_id: string | null; mode: string | null; created_at: string; result: unknown; audit_version: string | null; prev_at: string | null };

/** Calibration leads Paul named (2026-10-30): where each lands. */
const WATCH = ['NS Elec', 'Tribeca Plumbing', 'WSH Electrical', 'Great Ouse Plumbing', 'locksmith rotherham', 'L J Rainford'];
const scoreByLead = new Map<string, SiteScore>();
let after = '00000000-0000-0000-0000-000000000000';
let read = 0, written = 0, nothing = 0;
for (;;) {
  const rows = await sql<Row>(`select id, lead_id, mode, created_at, result, full_evidence->'audit'->>'version' as audit_version, site_score_at as prev_at
    from public.lead_crawl_checks where id > ${lit(after)}::uuid order by id limit ${PAGE}`);
  if (!rows.length) break;
  after = rows[rows.length - 1].id;
  read += rows.length;
  const updates: Array<Record<string, unknown>> = [];
  for (const r of rows) {
    const full = r.audit_version ? { audit: { version: Number(r.audit_version) } } : null;
    const score = siteScoreForRow({ result: r.result, mode: r.mode, created_at: r.created_at, full_evidence: full } as never);
    if (!score) { nothing++; continue; }
    if (r.lead_id) scoreByLead.set(r.lead_id, score);
    updates.push({ id: r.id, prev_at: r.prev_at, ...siteScoreColumns(score, new Date().toISOString()) });
  }
  if (write && updates.length) {
    const done = await sql<{ n: number }>(`with v as (
        select * from jsonb_to_recordset(${lit(JSON.stringify(updates))}::jsonb) as x(id uuid, prev_at timestamptz, site_score smallint, site_score_state text,
          site_score_version smallint, site_score_reasons jsonb, site_score_detail jsonb, site_score_evidence jsonb, site_score_at timestamptz)
      ), u as (
        update public.lead_crawl_checks l set
          site_score_v1 = coalesce(l.site_score_v1, case when l.site_score_version = 1 then jsonb_build_object('score', l.site_score, 'state', l.site_score_state,
            'version', l.site_score_version, 'reasons', l.site_score_reasons, 'detail', l.site_score_detail, 'at', l.site_score_at) end),
          site_score = v.site_score, site_score_state = v.site_score_state, site_score_version = v.site_score_version,
          site_score_reasons = v.site_score_reasons, site_score_detail = v.site_score_detail, site_score_evidence = v.site_score_evidence, site_score_at = v.site_score_at
        from v where l.id = v.id and l.site_score_at is not distinct from v.prev_at returning 1
      ) select count(*)::int as n from u`);
    written += done[0]?.n ?? 0;
  }
}

/* Every live lead, as the screens show it: its website on file, then its stored score (the same siteScoreViewFor the pill uses). */
type Lead = { id: string; business_name: string; website: string | null };
const leads: Lead[] = [];
let lAfter = '00000000-0000-0000-0000-000000000000';
for (;;) {
  const page = await sql<Lead>(`select id, business_name, website from public.outreach_leads where not coalesce(is_archived, false) and id > ${lit(lAfter)}::uuid order by id limit 2000`);
  if (!page.length) break;
  lAfter = page[page.length - 1].id;
  leads.push(...page);
}
const groups: Record<string, number> = {};
const scores: number[] = [];
let capped = 0;
const watch: Record<string, string> = {};
for (const l of leads) {
  const s = scoreByLead.get(l.id) ?? null;
  const view = siteScoreViewFor(l.website, s ? { site_score: s.score, site_score_state: s.state, site_score_version: s.version, site_score_reasons: s.reasons, site_score_detail: s.detail } : null);
  const g = siteScoreGroupOf(view);
  groups[g] = (groups[g] ?? 0) + 1;
  if (view.kind === 'scored') { scores.push(view.score); if (view.capped) capped++; }
  const w = WATCH.find((x) => l.business_name.toLowerCase().startsWith(x.toLowerCase()));
  if (w) watch[l.business_name] = view.kind === 'scored' ? `${view.score} ${g}${view.capped ? ` (capped from ${s?.evidence?.cap?.uncapped})` : ''} · ${classifyLeadWebsite(l.website).host}` : g;
}
scores.sort((a, b) => a - b);
const pct = (p: number) => (scores.length ? scores[Math.min(scores.length - 1, Math.floor(p * scores.length))] : null);
const hist: Record<string, number> = {};
for (const s of scores) { const k = `${Math.floor(s / 10) * 10}s`; hist[k] = (hist[k] ?? 0) + 1; }
console.log(JSON.stringify({
  version: SITE_SCORE_VERSION, mode: write ? 'write' : 'dry-run', crawlRowsRead: read, crawlRowsWritten: written, crawlRowsWithNothingToScore: nothing,
  liveLeads: leads.length, byBandAndState: groups, capped, median: pct(0.5), p10: pct(0.1), p90: pct(0.9), histogram: hist, calibration: watch,
}, null, 1));
