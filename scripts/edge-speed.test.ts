/* Server-side speed changes (2026-09-27, site-wide speed pass, part 2):
     1. the stuck-cleaning sweep runs on exactly one cron tick per two minutes — and nothing else in
        the audit-queue tick is gated by it;
     2. coverage / page-generator verify sign-in ONCE (the shared resolver), and read independent
        tables side by side;
     3. the Team list reads every member at once;
     4. the AI Audit SEO grade column is filled by the parts trigger (migration read back live). */
import fs from "node:fs";
import path from "node:path";
import { cleaningSweepDue, CLEANING_SWEEP_EVERY_MS } from "../supabase/functions/_shared/cleaning-sweep.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const root = path.resolve(import.meta.dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");

// 1. Exactly one due tick per two minutes, for the cron's real phase and for others ±10 s around it.
for (const offsetMs of [4_500, 0, 9_000, 14_000, 1_000, 29_000]) {
  let due = 0;
  const start = Date.UTC(2026, 8, 27, 14, 0, 0) + offsetMs;
  const ticks = 240; // 2 hours of 30 s ticks
  for (let i = 0; i < ticks; i++) if (cleaningSweepDue(start + i * 30_000)) due++;
  ok(due === ticks / 4, `cron phase +${offsetMs / 1000}s: ${due} sweeps in 2 h (${ticks / 4} = once per ${CLEANING_SWEEP_EVERY_MS / 60000} min)`);
}
ok(cleaningSweepDue(Date.UTC(2026, 8, 27, 14, 0, 34, 500)) && !cleaningSweepDue(Date.UTC(2026, 8, 27, 14, 0, 4, 500)) && !cleaningSweepDue(Date.UTC(2026, 8, 27, 14, 1, 34, 500)), "the :34.5 tick of each even minute runs it; the others do not");
{
  const src = read("supabase/functions/process-ai-audit-queue/index.ts");
  const tick = src.slice(src.indexOf("Deno.serve("), src.indexOf("async function maybeRunSeoStep"));
  ok((tick.match(/cleaningSweepDue\(/g) ?? []).length === 1 && /if \(cleaningSweepDue\(Date\.now\(\)\)\) \{\s*\n\s*try \{\s*\n\s*cleaningRetries = await retryStuckCleanings\(service\);/.test(tick), "only retryStuckCleanings sits behind the gate");
  for (const always of ["const startResults = await Promise.allSettled(toStart.map(startRow));", "const finalised = await finaliseSettledRuns(service, [...touchedRuns], estCost, cappedRuns, apifyToken);", "seoRan = await maybeRunSeoStep(service, apifyToken);", "await fireDueRemeasures(service);"]) {
    const at = tick.indexOf(always);
    const gate = tick.indexOf("if (cleaningSweepDue(");
    ok(at > 0 && !(at > gate && at < tick.indexOf("}", tick.indexOf("cleaningRetries = await retryStuckCleanings")) + 40), `still every tick: ${always.slice(0, 60)}`);
  }
  ok(/import \{ cleaningSweepDue \} from "\.\.\/_shared\/cleaning-sweep\.ts";/.test(src), "the gate is the one shared rule");
}

// 2. One sign-in check; independent reads side by side.
{
  const cov = read("supabase/functions/coverage/index.ts");
  ok(!/auth\.getUser\(/.test(cov) && /const who = await resolveActor\(req, service\);/.test(cov) && /let userId = who\.actor\.id;/.test(cov), "coverage: one sign-in check (resolveActor), no second getUser");
  ok(/await Promise\.all\(\[timed\("audits", marketAuditsP\), timed\("runs", completedP\), timed\("leads", leadsP\), timed\("history", historyP\), timed\("cache", cacheRowsP\)\]\)/.test(cov), "coverage: the four source reads run together");
  ok(/const leadsP = allInWaves\(/.test(cov) && /\.order\("id", \{ ascending: true \}\)\.range\(from, to\)\);\s*\n\s*const historyP/.test(cov), "coverage: the ~5,300-lead read pages in waves, ordered by id");
  ok(/await Promise\.all\(chunks\.map\(/.test(cov), "coverage: the completed-run chunks run together");
  ok((cov.match(/\.order\("id", \{ ascending: true \}\)\.range\(from, to\)/g) ?? []).length === 5, "coverage: every paged read has the id tiebreaker (5 reads)");
  const pg = read("supabase/functions/page-generator/index.ts");
  ok(!/auth\.getUser\(/.test(pg) && /const userId = gate\.actor\.id;/.test(pg), "page-generator: one sign-in check (requireAdmin)");
  ok(/const \[measured, \{ data: obRow \}, \{ data: leadRow \}\] = await Promise\.all\(\[/.test(pg), "page-generator: the plan's three inputs are read together");
  ok(/const perAudit = await Promise\.all\(audits\.map/.test(pg), "page-generator: each audit's runs are read together");
  const clientsBlock = pg.slice(pg.indexOf('if (action === "clients") {'), pg.indexOf("const leadId = typeof body.lead_id"));
  ok(/pointedLeads/.test(clientsBlock) && (pg.match(/pointedLeads/g) ?? []).length === 2, "page-generator: the clients list is read only by the clients action");
  const refusals = pg.slice(pg.indexOf("const [measured,"), pg.indexOf("const services = Array.isArray"));
  ok(refusals.indexOf("measured.reason") < refusals.indexOf("no_questionnaire_for_lead"), "page-generator: refusals keep their order (no baseline before no questionnaire)");
}

// 3. Team.
{
  const au = read("supabase/functions/admin-users/index.ts");
  const list = au.slice(au.indexOf("if (action === 'team_list')"), au.indexOf("return jsonResponse({ ok: true, team: out }"));
  ok(/const out = await Promise\.all\(\(members \?\? \[\]\)\.map\(async \(m\) =>/.test(list) && !/for \(const m of members/.test(list), "Team: every member read at once");
  ok(/\.eq\('role', 'admin'\)/.test(au) && /checkRateLimit\(/.test(au), "Team: the admin gate and the rate limit are untouched");
}

// 4. The SEO grade column.
{
  const mig = read("supabase/migrations/20260927130000_ai_audit_runs_seo_grade.sql");
  ok(/add column if not exists results_seo_grade text/.test(mig) && /new\.results_seo_grade := \(new\.results -> 'seo'\) ->> 'overallGrade';/.test(mig), "migration: plain column, filled by the existing parts trigger");
  ok(!/generated always/i.test(mig.replace(/--.*$/gm, "").replace(/\/\*[\s\S]*?\*\//g, "")), "migration: never a generated (table-rewriting) column");
  ok(/new\.results_summary := new\.results -> 'summary';/.test(mig) && /new\.results_crawl_check := new\.results -> 'crawl_check';/.test(mig), "migration: the trigger still fills the two Inbox columns");
}

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log("\nALL PASS");
