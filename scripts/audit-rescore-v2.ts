/* ════════════════════════════════════════════════════════════════════════════════════════════════
   RE-SCORE AN AUDIT ON RULES v2 FROM ITS STORED ANSWERS (Paul, 2026-11-15; docs/AUDIT_RULES.md).

   ⛔ A DB TOOL: never run casually. It asks NO AI and runs NO Apify: it only reads the stored answers.
   It WRITES NOTHING itself. It writes, for each short code given:
     • <out>/rescore-<code>.sql — ONE atomic statement that copies the audit, its runs and its queue rows into a NEW
       audit with a NEW short code (the old audit and its link are untouched). The copy's runs carry
       results.report_rules = 2 (the renderer then reads it on v2) and the latest run a verdicts_v2 snapshot
       (every search's verdict, internal label and reason).
     • <out>/rescore-table.md — search, old verdict, new verdict, reason, and old vs new named %.
   Apply a .sql with `npx supabase db query --remote=<ref> -f <file>` (an insert, nothing deleted or changed).

   Usage: npx tsx scripts/audit-rescore-v2.ts <outDir> [--refresh] <code> ...
   --refresh: the codes are existing v2 copies; only their verdicts_v2 snapshot is rewritten (refresh-<code>.sql).
   Reads with `supabase db query --read-only` (no secret handled here).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { theirAreas, type OppContext, type OppRow } from '../src/lib/reportOpportunity.ts';
import { buildReportModel, type ReportModel } from '../src/lib/reportModel.ts';
import { chooseReportDesign, winnableOf } from '../src/lib/reportDesign.ts';
import { cellNamed } from '../src/lib/namedSignal.ts';
import { isRealCompetitor } from '../src/lib/auditReport.ts';
import { isAggregatorUrl } from '../src/lib/aggregators.ts';
import { SHORT_CODE_ALPHABET, SHORT_CODE_LEN } from '../src/lib/reportSlug.ts';
import { randomInt } from 'node:crypto';

const REF = 'ruusxpkkmwtljxxulhbq';
const [outDir, ...args] = process.argv.slice(2);
/* --refresh: the codes are existing v2 copies; write refresh-<code>.sql (snapshot only) instead of a new copy. */
const refresh = args.includes('--refresh');
const codes = args.filter((x) => x !== '--refresh');
if (!outDir || !codes.length) { console.error('usage: audit-rescore-v2.ts <outDir> <code> ...'); process.exit(2); }
mkdirSync(outDir, { recursive: true });

function readOnly<T>(sql: string): T[] {
  const f = join(outDir, '_q.sql');
  writeFileSync(f, sql);
  const out = execSync(`npx supabase db query --remote=${REF} --read-only -o json -f "${f}"`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], maxBuffer: 1 << 28 });
  return JSON.parse(out).rows as T[];
}
const lit = (s: string) => `'${s.replace(/'/g, "''")}'`;
const newCode = () => Array.from({ length: SHORT_CODE_LEN }, () => SHORT_CODE_ALPHABET[randomInt(SHORT_CODE_ALPHABET.length)]).join('');

type Audit = { id: string; short_code: string; business_name: string; business_type: string | null; location_text: string | null; website: string | null; audit_purpose: string | null; lead_id: string | null; created_at: string };
const AUDIT_COPY_COLS = ['user_id', 'business_name', 'business_type', 'location_text', 'business_address', 'business_phone', 'business_email', 'website', 'has_website', 'specialism', 'credentials', 'country', 'is_market', 'is_measurement', 'lead_id', 'baseline_target_runs', 'baseline', 'baseline_completed_at', 'baseline_error', 'baseline_last_attempt_at', 'baseline_contract', 'free_check_result', 'audit_purpose', 'business_scope', 'location_source', 'location_note', 'client_links', 'archived_at'];
const RUN_COPY_COLS = ['user_id', 'run_number', 'status', 'mention_rate', 'results_summary', 'results_crawl_check', 'results_seo_grade', 'actor_cost_usd', 'scored_at', 'score_dirty_at', 'hook_score', 'created_at'];
const Q_COPY_COLS = ['user_id', 'question', 'status', 'result', 'result_niche', 'attempts', 'engines', 'chatgpt_answered', 'gemini_answered', 'overview_answered', 'chatgpt_self_named', 'gemini_self_named', 'overview_self_named', 'created_at', 'updated_at'];

const table: string[] = [];
for (const code of codes) {
  const [a] = readOnly<Audit>(`select id, short_code, business_name, business_type, location_text, website, audit_purpose, lead_id, created_at from ai_audits where short_code = ${lit(code)}`);
  if (!a) { console.error(`no audit ${code}`); process.exit(1); }
  const lead = a.lead_id ? readOnly<{ website: string | null; place_id: string | null }>(`select website, place_id from outreach_leads where id = ${lit(a.lead_id)}`)[0] ?? null : null;
  const runs = readOnly<{ id: string; run_number: number; crawl: { insights?: { services?: { name?: string; coverage?: string }[] }; signals?: { checkedPages?: { url?: string }[] } } | null }>(
    `select id, run_number, results->'crawl_check' as crawl from ai_audit_runs where audit_id = ${lit(a.id)} order by run_number`);
  const q = readOnly<{ question: string; status: string; result: Record<string, unknown> | null }>(
    `select q.question, q.status, q.result from ai_audit_queue q join ai_audit_runs r on r.id = q.run_id where r.audit_id = ${lit(a.id)} order by q.created_at`);

  // The same context the renderer builds (supabase/functions/render-audit-report).
  const bizName = a.business_name, trade = a.business_type ?? '', town = a.location_text ?? '';
  const nctx = { businessName: bizName, trade: trade || null, town: town || null };
  const crawl = runs.map((r) => r.crawl).find((c) => Array.isArray(c?.insights?.services) && c!.insights!.services!.length) ?? null;
  const services = crawl ? crawl.insights!.services!.map((x) => ({ name: String(x.name ?? ''), dedicated: x.coverage === 'dedicated' })) : [];
  const pageUrls = crawl ? (crawl.signals?.checkedPages ?? []).map((x) => String(x.url ?? '')) : [];
  const ownWebsite = (a.website ?? '').trim() || (lead?.website ?? '').trim();
  const kind = chooseReportDesign({ auditPurpose: a.audit_purpose, paidKind: null, hookComplete: false, measuring: false, nameNotJudgeable: false, classic: false }) ?? 'opportunity';
  const build = (rules: 1 | 2): ReportModel => {
    const rows: OppRow[] = q.filter((r) => r.status === 'done' || r.result || (rules === 2 && r.status === 'failed')).map((r) => ({ question: r.question, result: r.result }));
    const questions = [...new Set(rows.map((r) => r.question.trim()))];
    const ctx: OppContext = {
      businessName: bizName, services, pageUrls, town,
      siteText: crawl ? [bizName, trade, ...services.map((x) => x.name), ...pageUrls].join(' ').toLowerCase() : undefined,
      areas: theirAreas({ locationText: town, pageUrls, questions, fromDiscovery: true }),
      isDirectoryHost: (h: string) => isAggregatorUrl('https://' + h),
      isNamed: (c: unknown) => cellNamed(c as never, nctx),
      isRival: (n: string) => isRealCompetitor(n, town),
      rules,
      identity: rules === 2 ? { name: bizName, domains: ownWebsite ? [ownWebsite] : [], placeIds: lead?.place_id ? [lead.place_id] : [] } : undefined,
    };
    return buildReportModel(rows, ctx, { kind, businessName: bizName, town, dateLabel: '', website: { state: 'not_checked', issues: [] }, order: questions, bestCount: 10 });
  };
  const m1 = build(1), m2 = build(2);
  const all2 = new Map(m2.all.map((x) => [x.question, x]));
  const all1 = new Map(m1.all.map((x) => [x.question, x]));
  const snapshot = [...all2.values()].map((x) => ({ question: x.question, ...x.verdict }));

  const latest = Math.max(...runs.map((r) => r.run_number));
  const tag = `$v2snap${randomInt(1e9)}$`;
  /* REFRESH: an audit that is ALREADY a v2 copy (its runs carry report_rules = 2) keeps its link; only its stored
     verdicts_v2 snapshot is rewritten from today's rules (one key on its latest run; nothing else changes). */
  if (refresh) {
    writeFileSync(join(outDir, `refresh-${code}.sql`), `-- Refresh the verdicts_v2 snapshot of the v2 copy ${code}. Changes only that key on its latest run.
update ai_audit_runs set results = jsonb_set(results, '{verdicts_v2}', ${tag}${JSON.stringify(snapshot)}${tag}::jsonb) || jsonb_build_object('verdicts_refreshed_at', now())
where audit_id = ${lit(a.id)} and run_number = ${latest} and results->>'report_rules' = '2'
returning id, jsonb_array_length(results->'verdicts_v2') as searches;
`);
  }
  // The copy: one statement, all or nothing.
  const code2 = refresh ? code : newCode();
  const sql = `-- Re-score of ${code} on rules v2 -> new short code ${code2}. Inserts only; nothing is changed or deleted.
with src_runs as materialized (
  select r.*, gen_random_uuid() as new_id from ai_audit_runs r where r.audit_id = ${lit(a.id)}
), new_a as (
  insert into ai_audits (short_code, ${AUDIT_COPY_COLS.join(', ')})
  select ${lit(code2)}, ${AUDIT_COPY_COLS.join(', ')} from ai_audits where id = ${lit(a.id)}
  returning id
), ins_runs as (
  insert into ai_audit_runs (id, audit_id, results, ${RUN_COPY_COLS.join(', ')})
  select sr.new_id, (select id from new_a),
    sr.results || jsonb_build_object('report_rules', 2, 'rescored_from', ${lit(a.id)}, 'rescored_at', now())
      || case when sr.run_number = ${latest} then jsonb_build_object('verdicts_v2', ${tag}${JSON.stringify(snapshot)}${tag}::jsonb) else '{}'::jsonb end,
    ${RUN_COPY_COLS.map((c) => `sr.${c}`).join(', ')}
  from src_runs sr
  returning id
), ins_q as (
  insert into ai_audit_queue (audit_id, run_id, ${Q_COPY_COLS.join(', ')})
  select (select id from new_a), sr.new_id, ${Q_COPY_COLS.map((c) => `q.${c}`).join(', ')}
  from ai_audit_queue q join src_runs sr on sr.id = q.run_id
  returning 1
)
select (select id from new_a) as new_audit_id, ${lit(code2)} as short_code, (select count(*) from ins_runs) as runs, (select count(*) from ins_q) as queue_rows;
`;
  if (!refresh) writeFileSync(join(outDir, `rescore-${code}.sql`), sql);

  // The table for Paul.
  const pct = (m: ReportModel) => m.score.value === null ? '—' : `${m.score.value}% (${m.score.named}/${m.score.denominator})`;
  const word = (v: string | null | undefined) => v === 'winnable' ? 'Winnable' : v === 'not_winnable' ? 'Not winnable' : 'not shown';
  table.push(`\n### ${bizName} — ${a.audit_purpose} \`${code}\` → new \`${code2}\`\n`, `Named: old ${pct(m1)} → new ${pct(m2)}\n`,
    '| Search | Old | New | Reason (internal) |', '|---|---|---|---|');
  const qs = [...new Set([...all1.keys(), ...all2.keys()])].sort((x, y) => x.localeCompare(y));
  for (const s of qs) {
    const o = all1.get(s), n = all2.get(s);
    table.push(`| ${s} | ${o ? word(winnableOf(o)) : 'left out'} | ${n ? word(winnableOf(n)) : 'left out'} | ${n?.verdict ? `${n.verdict.label}. ${n.verdict.reason}`.replace(/\|/g, '/') : ''} |`);
  }
  console.log(`${code}: ${m2.all.length} searches; sql -> rescore-${code}.sql (new code ${code2})`);
}
writeFileSync(join(outDir, 'rescore-table.md'), table.join('\n') + '\n');
