import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const queue = readFileSync(resolve(root, "supabase/functions/process-ai-audit-queue/index.ts"), "utf8");
const crawl = readFileSync(resolve(root, "supabase/functions/crawl-check/index.ts"), "utf8");
const report = readFileSync(resolve(root, "supabase/functions/render-audit-report/index.ts"), "utf8");
const inbox = readFileSync(resolve(root, "src/hooks/useInbox.ts"), "utf8");
const crawlButton = readFileSync(resolve(root, "src/components/CrawlCheckButton.tsx"), "utf8");

const checks: Array<[string, boolean]> = [
  ["queue claims processing before final completion", queue.includes('status: "processing"')],
  ["queue discovers resumable processing runs", queue.includes('["pending", "running", "processing"]')],
  ["queue invokes competitor cleanup", queue.includes('extract-competitors')],
  ["queue invokes crawl with audit and run identity", queue.includes("audit_id: auditId") && queue.includes("run_id: runId")],
  ["crawl resolves standalone audit websites", crawl.includes('from("ai_audits")') && crawl.includes('eq("id", auditId)')],
  ["crawl stores findings on the exact audit run", crawl.includes("crawl_check") && crawl.includes('eq("id", runId)')],
  ["report prefers exact-run crawl findings", report.includes("runCrawl") && report.includes("data.crawlFaults")],
  ["queue gates terminal status on readiness", queue.includes("readyRuns") && queue.includes('status: "pending"'),],
  ["no-website audits persist an explicit crawl-unavailable reason", queue.includes('reason: "no_website"')],
  ["crawl failures are terminally distinguished from clean results", crawl.includes('status: signals.fetchFailed ? "unavailable" : "complete"')],
  ["Inbox refreshes when persisted crawl or audit-run state changes", inbox.includes("table: 'lead_crawl_checks'") && inbox.includes("table: 'ai_audit_runs'")],
  ["Inbox crawl control exposes running state and blocks duplicate clicks", crawlButton.includes("iconOnly") && crawlButton.includes("disabled={running}") && crawlButton.includes("animate-spin")],
  ["auto-crawl trusts the audit's own (filtered) website before the raw lead row", queue.includes("const site = auditWebsite ||")],
  ["auto-crawl never falls back to an aggregator/booking-platform URL", queue.includes("rawLeadWebsite && !isAggregatorUrl(rawLeadWebsite)")],
];

let failures = 0;
for (const [label, ok] of checks) {
  console.log(`${ok ? "PASS" : "FAIL"} ${label}`);
  if (!ok) failures++;
}
if (failures) {
  console.error(`${failures} FAILURES`);
  process.exit(1);
}
