/* ════════════════════════════════════════════════════════════════════════════════════════════════
   RE-SCORE AN AUDIT ON RULES v3 FROM ITS STORED ANSWERS (Paul, 2026-11-16; docs/AUDIT_RULES.md "Re-scoring").

   ⛔ A DB TOOL: never run casually. It asks NO AI and runs NO Apify: it only reads the stored answers (read-only) and
   WRITES NOTHING itself. For each short code it writes:
     • <out>/rescore3-<code>.sql — ONE atomic, insert-only statement copying the audit, its runs and its queue rows to a
       NEW short code (the old audit and its link are untouched). The copy's runs carry results.report_rules = 3 and the
       latest run a verdicts_v3 snapshot. An answer on the copy is marked `firms_read` ONLY when its run's firm-reading
       receipt (results.competitor_cleaning) says complete — every answer read. Any other answer stays unmarked, so v3
       shows it as "Couldn't measure", never as "AI named nobody".
     • <out>/rescore3-table.md — old vs new counts per verdict, then every search: old verdict, new verdict, reason.
   Apply a .sql with `npx supabase db query --remote=<ref> -f <file>` (an insert; nothing deleted or changed).

   Usage: npx tsx scripts/audit-rescore-v3.ts <outDir> <code> ...
   Targets the NEWEST rules (AUDIT_RULES_VERSION: v4 since 2026-11-16, locked spots); the copy is stamped with that number
   and its snapshot key is verdicts_v<N>.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { execSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomInt } from 'node:crypto';
import { theirAreas, type OppContext, type OppQuestion, type OppRow } from '../src/lib/reportOpportunity.ts';
import { buildReportModel, type ReportModel } from '../src/lib/reportModel.ts';
import { chooseReportDesign, splitLine, verdictSplitOf, winnableOf } from '../src/lib/reportDesign.ts';
import { AUDIT_RULES_VERSION, auditRulesFor, type AuditRules } from '../src/lib/auditVerdict.ts';
const TARGET: AuditRules = AUDIT_RULES_VERSION;
import { cellNamed } from '../src/lib/namedSignal.ts';
import { isRealCompetitor } from '../src/lib/auditReport.ts';
import { isAggregatorUrl } from '../src/lib/aggregators.ts';
import { SHORT_CODE_ALPHABET, SHORT_CODE_LEN } from '../src/lib/reportSlug.ts';

const REF = 'ruusxpkkmwtljxxulhbq';
const [outDir, ...codes] = process.argv.slice(2);
if (!outDir || !codes.length) { console.error('usage: audit-rescore-v3.ts <outDir> <code> ...'); process.exit(2); }
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
type Crawl = { insights?: { services?: { name?: string; coverage?: string }[] }; signals?: { checkedPages?: { url?: string }[] } } | null;
const AUDIT_COPY_COLS = ['user_id', 'business_name', 'business_type', 'location_text', 'business_address', 'business_phone', 'business_email', 'website', 'has_website', 'specialism', 'credentials', 'country', 'is_market', 'is_measurement', 'lead_id', 'baseline_target_runs', 'baseline', 'baseline_completed_at', 'baseline_error', 'baseline_last_attempt_at', 'baseline_contract', 'free_check_result', 'audit_purpose', 'business_scope', 'location_source', 'location_note', 'client_links', 'archived_at'];
const RUN_COPY_COLS = ['user_id', 'run_number', 'status', 'mention_rate', 'results_summary', 'results_crawl_check', 'results_seo_grade', 'actor_cost_usd', 'scored_at', 'score_dirty_at', 'hook_score', 'created_at'];
const Q_COPY_COLS = ['user_id', 'question', 'status', 'result_niche', 'attempts', 'engines', 'chatgpt_answered', 'gemini_answered', 'overview_answered', 'chatgpt_self_named', 'gemini_self_named', 'overview_self_named', 'created_at', 'updated_at'];

/** The verdict word for the table. */
export function groupOf(q: OppQuestion | undefined): string {
  if (!q) return 'left out';
  const v = q.verdict;
  if (v?.rule === 'unmeasured' || v?.rule === 'rerun') return "Couldn't measure";
  if (v?.rule === 'visible') return 'Already named';
  const w = winnableOf(q);
  return w === 'winnable' ? 'Winnable' : w === 'not_winnable' ? 'Not winnable' : w === 'no_names' ? "AI doesn't name businesses" : 'not shown';
}

const table: string[] = [];
for (const code of codes) {
  const [a] = readOnly<Audit>(`select id, short_code, business_name, business_type, location_text, website, audit_purpose, lead_id, created_at from ai_audits where short_code = ${lit(code)}`);
  if (!a) { console.error(`no audit ${code}`); process.exit(1); }
  const lead = a.lead_id ? readOnly<{ website: string | null; place_id: string | null }>(`select website, place_id from outreach_leads where id = ${lit(a.lead_id)}`)[0] ?? null : null;
  const runs = readOnly<{ id: string; run_number: number; crawl: Crawl; rules: unknown; complete: boolean | null }>(
    `select id, run_number, results->'crawl_check' as crawl, results->'report_rules' as rules, (results->'competitor_cleaning'->>'complete')::boolean as complete from ai_audit_runs where audit_id = ${lit(a.id)} order by run_number`);
  const q = readOnly<{ run_id: string; question: string; status: string; result: Record<string, unknown> | null }>(
    `select q.run_id, q.question, q.status, q.result from ai_audit_queue q join ai_audit_runs r on r.id = q.run_id where r.audit_id = ${lit(a.id)} order by q.created_at`);
  const readRuns = new Set(runs.filter((r) => r.complete === true).map((r) => r.id));
  /* The same marking the SQL below applies to the copy: firms_read on ChatGPT / Gemini cells of fully-read runs only. */
  const marked = q.map((r) => {
    if (!readRuns.has(r.run_id) || !r.result) return r;
    const res: Record<string, unknown> = { ...r.result };
    for (const e of ['chatgpt', 'gemini']) { const c = res[e]; if (c && typeof c === 'object') res[e] = { ...(c as Record<string, unknown>), firms_read: true }; }
    return { ...r, result: res };
  });

  // The same context the renderer builds (supabase/functions/render-audit-report).
  const bizName = a.business_name, trade = a.business_type ?? '', town = a.location_text ?? '';
  const nctx = { businessName: bizName, trade: trade || null, town: town || null };
  const crawl = runs.map((r) => r.crawl).find((c) => Array.isArray(c?.insights?.services) && c!.insights!.services!.length) ?? null;
  const services = crawl ? crawl.insights!.services!.map((x) => ({ name: String(x.name ?? ''), dedicated: x.coverage === 'dedicated' })) : [];
  const pageUrls = crawl ? (crawl.signals?.checkedPages ?? []).map((x) => String(x.url ?? '')) : [];
  const ownWebsite = (a.website ?? '').trim() || (lead?.website ?? '').trim();
  const kind = chooseReportDesign({ auditPurpose: a.audit_purpose, paidKind: null, hookComplete: false, measuring: false, nameNotJudgeable: false, classic: false }) ?? 'opportunity';
  const build = (rules: AuditRules, src: typeof q): ReportModel => {
    const rows: OppRow[] = src.filter((r) => r.status === 'done' || r.result || (rules >= 2 && r.status === 'failed')).map((r) => ({ question: r.question, result: r.result }));
    const questions = [...new Set(rows.map((r) => r.question.trim()))];
    const ctx: OppContext = {
      businessName: bizName, services, pageUrls, town,
      siteText: crawl ? [bizName, trade, ...services.map((x) => x.name), ...pageUrls].join(' ').toLowerCase() : undefined,
      areas: theirAreas({ locationText: town, pageUrls, questions, fromDiscovery: true }),
      isDirectoryHost: (h: string) => isAggregatorUrl('https://' + h),
      isNamed: (c: unknown) => cellNamed(c as never, nctx),
      isRival: (n: string) => isRealCompetitor(n, town),
      rules,
      identity: rules >= 2 ? { name: bizName, domains: ownWebsite ? [ownWebsite] : [], placeIds: lead?.place_id ? [lead.place_id] : [] } : undefined,
    };
    return buildReportModel(rows, ctx, { kind, businessName: bizName, town, dateLabel: '', website: { state: 'not_checked', issues: [] }, order: questions, bestCount: 10 });
  };
  const oldRules = auditRulesFor({ createdAt: a.created_at, runRules: runs.map((r) => r.rules) });
  const mOld = build(oldRules, q), mNew = build(TARGET, marked);
  const allOld = new Map(mOld.all.map((x) => [x.question, x]));
  const allNew = new Map(mNew.all.map((x) => [x.question, x]));
  const snapshot = [...allNew.values()].map((x) => ({ question: x.question, ...x.verdict }));

  const latest = Math.max(...runs.map((r) => r.run_number));
  const tag = `$v3snap${randomInt(1e9)}$`;
  const code2 = newCode();
  const sql = `-- Re-score of ${code} on rules v${TARGET} -> new short code ${code2}. Inserts only; nothing is changed or deleted.
-- firms_read is set on a copied answer only when its run's firm-reading receipt says complete.
with src_runs as materialized (
  select r.*, gen_random_uuid() as new_id, coalesce((r.results->'competitor_cleaning'->>'complete')::boolean, false) as read_all
  from ai_audit_runs r where r.audit_id = ${lit(a.id)}
), new_a as (
  insert into ai_audits (short_code, ${AUDIT_COPY_COLS.join(', ')})
  select ${lit(code2)}, ${AUDIT_COPY_COLS.join(', ')} from ai_audits where id = ${lit(a.id)}
  returning id
), ins_runs as (
  insert into ai_audit_runs (id, audit_id, results, ${RUN_COPY_COLS.join(', ')})
  select sr.new_id, (select id from new_a),
    sr.results || jsonb_build_object('report_rules', ${TARGET}, 'rescored_from', ${lit(a.id)}, 'rescored_at', now())
      || case when sr.run_number = ${latest} then jsonb_build_object('verdicts_v${TARGET}',${tag}${JSON.stringify(snapshot)}${tag}::jsonb) else '{}'::jsonb end,
    ${RUN_COPY_COLS.map((c) => `sr.${c}`).join(', ')}
  from src_runs sr
  returning id
), ins_q as (
  insert into ai_audit_queue (audit_id, run_id, result, ${Q_COPY_COLS.join(', ')})
  select (select id from new_a), sr.new_id, m2.r, ${Q_COPY_COLS.map((c) => `q.${c}`).join(', ')}
  from ai_audit_queue q join src_runs sr on sr.id = q.run_id
  cross join lateral (select case when sr.read_all and jsonb_typeof(q.result->'chatgpt') = 'object' then jsonb_set(q.result, '{chatgpt,firms_read}', 'true'::jsonb) else q.result end as r) m1
  cross join lateral (select case when sr.read_all and jsonb_typeof(m1.r->'gemini') = 'object' then jsonb_set(m1.r, '{gemini,firms_read}', 'true'::jsonb) else m1.r end as r) m2
  returning 1
)
select (select id from new_a) as new_audit_id, ${lit(code2)} as short_code, (select count(*) from ins_runs) as runs, (select count(*) from ins_q) as queue_rows;
`;
  writeFileSync(join(outDir, `rescore3-${code}.sql`), sql);

  // The table for Paul: counts per verdict, old vs new, then every search.
  const qs = [...new Set([...allOld.keys(), ...allNew.keys()])].sort((x, y) => x.localeCompare(y));
  const tally = (m: Map<string, OppQuestion>) => { const t: Record<string, number> = {}; for (const s of qs) { const g = groupOf(m.get(s)); t[g] = (t[g] ?? 0) + 1; } return t; };
  const tOld = tally(allOld), tNew = tally(allNew);
  const groups = ['Already named', 'Winnable', 'Not winnable', "AI doesn't name businesses", "Couldn't measure", 'not shown', 'left out'];
  const pct = (m: ReportModel) => m.score.value === null ? '—' : `${m.score.value}% (${m.score.named} of ${m.score.denominator})`;
  const splitNew = verdictSplitOf([...allNew.values()]);
  table.push(`\n### ${bizName} — ${a.audit_purpose} \`${code}\` (rules v${oldRules}) → new \`${code2}\` (rules v${TARGET})\n`,
    `Named: old ${pct(mOld)} → new ${pct(mNew)}. Runs fully read: ${readRuns.size} of ${runs.length}.${mNew.incomplete ? ` **Audit incomplete** (${mNew.incomplete.unmeasured} of ${mNew.incomplete.answers} answers unmeasured).` : ''}\n`,
    splitNew ? `Report line: ${splitLine(splitNew)}\n` : '',
    '| Verdict | Old | New |', '|---|---|---|',
    ...groups.filter((g) => tOld[g] || tNew[g]).map((g) => `| ${g} | ${tOld[g] ?? 0} | ${tNew[g] ?? 0} |`),
    '', '| Search | Old | New | Reason (internal) |', '|---|---|---|---|');
  for (const s of qs) {
    const n = allNew.get(s);
    table.push(`| ${s} | ${groupOf(allOld.get(s))} | ${groupOf(n)} | ${n?.verdict ? `${n.verdict.label}. ${n.verdict.reason}`.replace(/\|/g, '/') : ''} |`);
  }
  console.log(`${code}: ${mNew.all.length} searches; old ${JSON.stringify(tOld)} new ${JSON.stringify(tNew)}; sql -> rescore3-${code}.sql (new code ${code2})`);
}
writeFileSync(join(outDir, 'rescore3-table.md'), table.join('\n') + '\n');
