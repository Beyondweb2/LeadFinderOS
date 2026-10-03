/* ════════════════════════════════════════════════════════════════════════════════════════════════
   EVERY "COPY REPORT LINK" IS RECORDED ON THE LEAD (closeout, 2026-10-02). The lead workspace's copy
   records lead_report_link_event 'generated' (channel null = copied); the AI Audit page's copy of the
   same link recorded nothing, so a link copied there never showed in the report-share line.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import fs from "node:fs";
import path from "node:path";
let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const root = path.resolve(import.meta.dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");

const report = read("src/components/AiAuditReport.tsx");
const copyFn = report.slice(report.indexOf("const copyReportLink"), report.indexOf("const copyReportLink") + 400);
ok(/writeText\(reportUrl\);\s*onReportCopied\?\.\(\);/.test(copyFn), "the AI Audit report calls onReportCopied after a successful copy (never on a failed one)");
const page = read("src/pages/AiAudit.tsx");
ok(/onReportCopied=\{openAuditRow\?\.lead_id && auditId \?/.test(page), "the page records only when the audit belongs to a lead");
ok(/leadRpc\('lead_report_link_event', \{ _lead_id: leadId, _audit_id: auditId, _kind: 'generated', _channel: null \}\)/.test(page), "the same event the workspace records");
const crm = read("src/components/LeadCrmPanel.tsx");
ok(/leadRpc\('lead_report_link_event', \{ _lead_id: lead\.id, _audit_id: link\.auditId, _kind: 'generated', _channel: null \}\)/.test(crm), "…which is still what the workspace records");
if (f) { console.log(`\n${f} failure(s)`); process.exit(1); }
console.log("\nall report-copy checks passed");
