/* Refreshes that re-download less (2026-09-27, site-wide speed pass):
     1. the AI Audit landing poll re-reads only the in-flight audits, and the whole book at most once
        a minute and when the last run settles — never every 5 s;
     2. a small hydrate (the poll, a name search's matches) reads only its own audits' runs;
     3. the book's three reads run side by side;
     4. opening an already-finished audit does not reload the book;
     5. bulk "set product" / "set trade" count only writes that landed, and do not reload every lead;
     6. a crawl check does not trigger a second full refetch on top of its own invalidation;
     7. the Outreach table reads Apify usage only when the bulk-audit dialog opens. */
import fs from "node:fs";
import path from "node:path";
import { bulkWriteLanded } from "../src/lib/bulkWriteResult.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const root = path.resolve(import.meta.dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");

// 1–4. AI Audit.
{
  const src = read("src/pages/AiAudit.tsx");
  const poll = src.slice(src.indexOf("const refreshInFlight = useCallback"), src.indexOf("// One-shot fetch of a run's queue rows"));
  ok(poll.length > 500, "the landing poll found");
  ok(/if \(ticks % LIST_FULL_RELOAD_EVERY === 0\) loadSaved\(\);\s*\n\s*else void refreshInFlight\(\);/.test(poll), "a tick refreshes the in-flight audits; only every Nth tick reloads the book");
  ok(!/setInterval\(\(\) => \{ loadSaved\(\); \}, LIST_POLL_MS\)/.test(src), "the every-5-seconds whole-book reload is gone");
  ok(/const LIST_FULL_RELOAD_EVERY = 12;/.test(src) && /const LIST_POLL_MS = 5000;/.test(src), "whole book at most once a minute while draining (12 × 5 s)");
  ok(/if \(wasInFlight\.current && !anyRunInFlight\) loadSaved\(\);/.test(poll), "the book reloads once when the last run settles");
  ok(/\.from\('ai_audits'\)\.select\(cached\?\.archivedReady \? AUDIT_SELECT : AUDIT_SELECT_BASE\)\.in\('id', ids\)/.test(poll), "the in-flight refresh reads those audits by id, with the list's own select");

  const parts = src.slice(src.indexOf("const loadRunParts = useCallback"), src.indexOf("const assembleAudits"));
  ok((parts.match(/if \(scope\) q = q\.in\('audit_id', scope\);/g) ?? []).length === 1, "a scoped hydrate filters the runs to its own audits");
  ok(/const scope = auditRows\.length <= SCOPED_HYDRATE_MAX \? auditRows\.map\(\(a\) => a\.id\) : null;/.test(src), "small sets are scoped; the whole book is read straight through");
  ok(!/business_reports/.test(parts), "no business_reports read: the listing pill it fed was retired 2026-10-01 (docs/r-profile-pages-audit.md)");
  ok(/seo_grade:results_seo_grade/.test(parts) && !/select\([^)]*results->seo/.test(src),"the SEO grade comes from the plain column, never by opening results (migration 20260927130000)");
  ok(/const \[fetched, parts\] = await Promise\.all\(\[readAudits\(\), loadRunParts\(null\)\]\);/.test(src), "the book's audits read no longer waits in front of runs/reports");

  const results = src.slice(src.indexOf("let sawLive = false;"), src.indexOf("pollRef.current = setInterval(tick, 3000);"));
  ok(/if \(r && !TERMINAL\.has\(r\.status\)\) sawLive = true;/.test(results) && /if \(sawLive\) loadSaved\(\);/.test(results), "opening a finished audit does not reload the book (only a run SEEN draining does)");
  ok(/settleRef\.current = setTimeout\(\(\) => \{ if \(!stop\) pollRun\(runId\); \}, 10_000\);/.test(results), "the one delayed re-read of the run (cleaned competitor lists) is kept");
}

// 5. Bulk writes.
ok(bulkWriteLanded({ status: "fulfilled", value: { id: "x" } }, false), "a returned row counts as written");
ok(!bulkWriteLanded({ status: "fulfilled", value: null }, false), "updateLead's null (a refused write) is NOT counted as written");
ok(!bulkWriteLanded({ status: "rejected", reason: new Error("x") }, false), "a rejection is not written");
ok(bulkWriteLanded({ status: "fulfilled", value: null }, true), "a demo lead (no database row) is not a failure");
{
  const src = read("src/components/OutreachTable.tsx");
  const product = src.slice(src.indexOf("const setProductOn = async"), src.indexOf("const confirmSetTrade = async"));
  const trade = src.slice(src.indexOf("const confirmSetTrade = async"), src.indexOf("const handleBulkRunAudit"));
  for (const [name, body] of [["set product", product], ["set trade", trade]] as const) {
    ok(body.length > 200 && /bulkWriteLanded\(r, isDemoLead\(ids\[i\]\)\)/.test(body), `bulk ${name} counts only writes that landed`);
    ok(!/onRefreshLeads\?\.\(\)/.test(body), `bulk ${name} does not reload every lead afterwards`);
  }
  ok(/useApifyUsage\(\{ enabled: auditDialogOpen \}\)/.test(src), "Apify usage is read when the bulk-audit dialog opens, not on every visit");
  ok(/!apifyUsageLoaded &&[\s\S]{0,120}Checking the Apify monthly budget/.test(src), "while it is being read the dialog says so — never 'couldn't read'");
  ok(!/<CrawlCheckButton[^>]*onDone=\{\(\) => void refetchCrawls\(\)\}/.test(src), "the Outreach crawl button does not refetch on top of its own invalidation");
}

// 6. Crawl check refreshes once.
{
  const btn = read("src/components/CrawlCheckButton.tsx");
  ok(/invalidateQueries\(\{ queryKey: \['lead-crawls'\] \}\)/.test(btn) && /invalidateQueries\(\{ queryKey: \['inbox'\] \}\)/.test(btn), "the crawl button invalidates the crawl rows and the Inbox itself");
  const inbox = read("src/pages/Inbox.tsx");
  const tag = inbox.slice(inbox.indexOf("<CrawlCheckButton"), inbox.indexOf("/>", inbox.indexOf("<CrawlCheckButton")));
  ok(tag.length > 50 && !/onDone=\{refetch\}/.test(tag), "the Inbox does not add a second full six-read refetch");
  const dlg = read("src/components/LeadDetailDialog.tsx");
  ok(!/onDone=\{\(\) => void refetch\(\)\}/.test(dlg), "the lead dialog's crawl button does not refetch twice");
}

// 8. Outreach starts the table's own reads when the page opens, not after every lead has arrived.
{
  const page = read("src/pages/Outreach.tsx");
  ok(/void prefetchOutreachAuditMap\(queryClient, user\.id\);/.test(page) && /getQueueStatus\(queryClient\)\.catch\(/.test(page), "the Outreach page starts the audit map and the queue status on open");
  const tbl = read("src/components/OutreachTable.tsx");
  ok(/queryKey: outreachAuditMapKey\(user\?\.id\),\s*\n\s*queryFn: fetchOutreachAuditMap,/.test(tbl), "the table reads the SAME cached audit map");
  ok(!/setAuditsByLead\(/.test(tbl) && !/'Outreach \(audit map\)'/.test(tbl), "the table no longer fetches the audit map itself");
  const lib = read("src/lib/outreachAuditMap.ts");
  ok(/fetchAllRowsParallel<\{ id: string \}>\('Outreach \(audit map\)'/.test(lib) && /\.order\('created_at', \{ ascending: false \}\)\.order\('id', \{ ascending: true \}\)/.test(lib), "the audit map is still paged in full, newest first, id tiebreaker");
  ok(/if \(!row\.lead_id \|\| map\[row\.lead_id\]\) continue;/.test(lib) && /\(b\.run_number \?\? 0\) - \(a\.run_number \?\? 0\)/.test(lib), "latest audit per lead, latest run per audit — the same rule");
}

// 7. The Dashboard's reads come from the one column list (see outreach-list-columns.test.ts) — and
//    useApifyUsage keeps its default for the AI Audit page.
{
  const hook = read("src/hooks/useApifyUsage.ts");
  ok(/export function useApifyUsage\(\{ enabled = true \}/.test(hook) && /useEffect\(\(\) => \{ if \(enabled\) load\(\); \}, \[load, enabled\]\);/.test(hook), "useApifyUsage reads on mount by default (AI Audit unchanged), deferred only when asked");
}

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log("\nALL PASS");
