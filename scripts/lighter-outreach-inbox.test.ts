/* Lighter Outreach + Inbox (perf, 2026-10-22): the lists read the website-check SUMMARY, the Inbox's tab-focus
   refresh reads only what changed, and the Inbox reads only the message columns it uses. */
import { readFileSync } from 'node:fs';
import {
  auditIdsToRefresh, inboxFocusRefreshPlan, INBOX_DELTA_OVERLAP_MS, INBOX_FOCUS_REFRESH_MIN_MS, INBOX_FULL_RECONCILE_MAX_AGE_MS,
} from '../src/lib/inboxCache.ts';
import { runSettled } from '../src/lib/queueAuditStatus.ts';

let failures = 0;
const ok = (condition: boolean, label: string) => { if (!condition) failures++; console.log(`${condition ? 'PASS' : 'FAIL'} ${label}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

/* ── the focus plan ── */
const now = 10_000_000;
ok(inboxFocusRefreshPlan(now, 0, 0).kind === 'skip', 'no sync yet → nothing (the first load covers it)');
ok(inboxFocusRefreshPlan(now, now - INBOX_FOCUS_REFRESH_MIN_MS + 1, now - 1000).kind === 'skip', 'under a minute since the last sync → nothing');
const delta = inboxFocusRefreshPlan(now, now - INBOX_FOCUS_REFRESH_MIN_MS, now - INBOX_FOCUS_REFRESH_MIN_MS);
ok(delta.kind === 'delta' && delta.sinceMs === now - INBOX_FOCUS_REFRESH_MIN_MS - INBOX_DELTA_OVERLAP_MS, 'a minute on → a delta from just before the last sync started');
ok(inboxFocusRefreshPlan(now, now - 120_000, now - INBOX_FULL_RECONCILE_MAX_AGE_MS).kind === 'full', 'last full read too old → a full reconcile');
ok(inboxFocusRefreshPlan(now, now - 120_000, 0).kind === 'full', 'no full read recorded → a full reconcile (absent is not "recent")');

/* ── which audits a delta re-reads ── */
const cached = [
  { id: 'done', ai_audit_runs: [{ status: 'complete' }, { status: 'failed' }] },
  { id: 'running', ai_audit_runs: [{ status: 'complete' }, { status: 'running' }] },
  { id: 'unknown', ai_audit_runs: [{ status: null }] },
  { id: 'none', ai_audit_runs: [] },
  { id: 'nulled', ai_audit_runs: null },
];
const ids = new Set(auditIdsToRefresh(cached, ['new1', 'done'], runSettled));
ok(ids.has('new1') && ids.has('done'), 'every audit the server says changed is re-read');
ok(ids.has('running') && ids.has('unknown'), 'a cached in-flight or unknown-status run is re-read');
ok(!ids.has('none') && !ids.has('nulled') && ids.size === 4, 'settled and run-less cached audits are not re-read');
ok(['complete', 'capped', 'failed', 'cancelled'].every(runSettled) && !runSettled('pending') && !runSettled(null) && !runSettled(undefined), 'runSettled is a positive list');

/* ── the summary read ── */
const crawls = read('src/hooks/useLeadCrawls.ts');
ok(/LEAD_CRAWL_LIST_SELECT = 'lead_id, result:result_slim, created_at'/.test(crawls), 'the lists read result_slim, aliased to result');
ok(/select\('result, created_at'\)\.eq\('lead_id'/.test(crawls), 'the one-lead popup read still reads the FULL result');
const inbox = read('src/hooks/useInbox.ts');
ok(!/from\('lead_crawl_checks'\)/.test(inbox), "the Inbox no longer reads lead_crawl_checks itself (it shares useLeadCrawls)");
ok(/useLeadCrawls\('Inbox \(crawl checks\)'\)/.test(inbox), 'the Inbox reads the shared summary');
ok(/table: 'lead_crawl_checks' \}, \(\) => \{\n\s*refreshLeadCrawlsSoon\(queryClient\);/.test(inbox), 'a website-check change refreshes the summary, debounced — not the whole Inbox');
const button = read('src/components/CrawlCheckButton.tsx');
ok(/useLeadCrawl\(open && lead && !urlMode \? lead\.id : null\)/.test(button), 'the crawl popup reads the full row when it opens');
for (const f of ['src/components/CrawlCheckButton.tsx', 'src/components/LeadCrawlPanel.tsx', 'src/components/ProspectAuditDialog.tsx']) {
  ok(!/queryKey: \['inbox'\]/.test(read(f)), `${f}: a finished crawl does not re-read the whole Inbox`);
}
const mig = read('supabase/migrations/20261121090000_lead_crawl_result_slim.sql');
ok(/before insert or update of result on public\.lead_crawl_checks/.test(mig), 'the summary is kept by a trigger on every write of result');
ok(/exception when others then[\s\S]*new\.result_slim := new\.result;/.test(mig), 'a summary error never fails a crawl write');

/* ── the message columns ── */
const cols = new Set((/WA_MESSAGE_COLUMNS = '([^']+)'/.exec(inbox)?.[1] ?? '').split(',').map((c) => c.trim()));
const iface = /export interface WaMessage \{([\s\S]*?)\n\}/.exec(inbox)?.[1] ?? '';
const fields = [...iface.matchAll(/^\s+(\w+)\??:/gm)].map((m) => m[1]);
ok(fields.length > 10 && fields.every((f) => cols.has(f)), `every WaMessage field is read (${fields.filter((f) => !cols.has(f)).join(', ') || 'all'})`);
for (const c of ['error_code', 'error_title', 'error_details', 'reply_kind']) ok(cols.has(c), `the Inbox still reads ${c}`);
ok(!cols.has('wa_message_id') && !cols.has('findings_shown'), 'the two unread columns are left out');
ok(!/from\(msgTable\)\.select\('\*'\)/.test(inbox) && !/from\(messageTableFor\(channel\)\)\.select\('\*'\)/.test(inbox), "no WhatsApp message read is select('*')");

if (failures) process.exit(1);
