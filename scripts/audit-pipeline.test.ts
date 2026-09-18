import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const queue = readFileSync(resolve(root, "supabase/functions/process-ai-audit-queue/index.ts"), "utf8");
const crawl = readFileSync(resolve(root, "supabase/functions/crawl-check/index.ts"), "utf8");
const report = readFileSync(resolve(root, "supabase/functions/render-audit-report/index.ts"), "utf8");

const checks: Array<[string, boolean]> = [
  ["queue claims processing before final completion", queue.includes('status: "processing"')],
  ["queue discovers resumable processing runs", queue.includes('["pending", "running", "processing"]')],
  ["queue invokes competitor cleanup", queue.includes('extract-competitors')],
  ["queue invokes crawl with audit and run identity", queue.includes("audit_id: auditId") && queue.includes("run_id: runId")],
  ["crawl resolves standalone audit websites", crawl.includes('from("ai_audits")') && crawl.includes('eq("id", auditId)')],
  ["crawl stores findings on the exact audit run", crawl.includes("crawl_check") && crawl.includes('eq("id", runId)')],
  ["report prefers exact-run crawl findings", report.includes("runCrawl") && report.includes("data.crawlFaults")],
  ["queue gates terminal status on readiness", queue.includes("readyRuns") && queue.includes('status: "pending"'),],
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
