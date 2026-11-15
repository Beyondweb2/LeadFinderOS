/* The LeadFinderOS report style (Paul, 2026-11-15; src/lib/reportBrand.ts, src/lib/leadfinderReport.ts).
   Pins: no "Findable" anywhere in the page (text, logo, footer, meta, PDF), no price / guarantee / sign-up, the exact CTA to
   leadfinderos.com, the "not guarantees" line, desktop + phone + print CSS, the per-campaign style read at render time, the
   LeadFinderOS address serving only LeadFinderOS-style reports and never falling to the Findable classic page, the link chosen
   by campaign (webdev_report {{2}} and Copy Report Link), the admin-only setting, and the web-dev hook questions.
   Run: npx tsx scripts/leadfinder-report-brand.test.ts */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildReportModel, type WebsiteSection } from "../src/lib/reportModel.ts";
import type { OppContext, OppRow } from "../src/lib/reportOpportunity.ts";
import { renderLeadfinderReport, renderLeadfinderMeasuring, renderLeadfinderUnavailable } from "../src/lib/leadfinderReport.ts";
import { isLfosReportHost, lfosReportUrl, reportStyleOf, LFOS_CTA_LINE } from "../src/lib/reportBrand.ts";
import { isWebdevTrade, webdevHookQuestions } from "../src/lib/webdevReport.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const read = (p: string) => readFileSync(resolve(import.meta.dirname, "..", p), "utf8").replace(/\r\n/g, "\n");

const cell = (firms: string[], named = false, text = "") => ({ named, self_named: named, competitors: firms, citations: [], answer_text: text });
const rows: OppRow[] = [
  { question: "Who is the best web designer in Sutton UK?", result: { chatgpt: cell(["Pixel Forge", "Sutton Web Co"], false, "Pixel Forge and Sutton Web Co are popular web designers in Sutton, known for clean modern sites."), gemini: cell(["Pixel Forge"], false) } },
  { question: "Who is the best SEO agency in Sutton UK?", result: { chatgpt: cell(["RankRight"], false), gemini: cell(["CBBR Web & Marketing", "RankRight"], true) } },
];
const ctx: OppContext = { businessName: "CBBR Web & Marketing", services: [], town: "Sutton", isNamed: (c: unknown) => !!(c as { named?: boolean })?.named };
const website: WebsiteSection = { state: "issues", issues: [{ title: "Pages load slowly on phones", serious: true }, { title: "No page for SEO services", serious: false }] };
const model = buildReportModel(rows, ctx, { kind: "hook", businessName: "CBBR Web & Marketing", town: "Sutton", dateLabel: "14 Nov 2026", shareUrl: lfosReportUrl("hz9ut7"), website, hookQuestions: rows.map((r) => r.question) });
model.signupUrl = "https://findable.live/onboarding/x/?lead=1"; // even if a caller left one on the model, the page never shows it

const pages = { report: renderLeadfinderReport(model), print: renderLeadfinderReport(model, { print: true }), measuring: renderLeadfinderMeasuring("CBBR Web & Marketing", "14 Nov 2026", 1, 3), unavailable: renderLeadfinderUnavailable("This report link is no longer valid."), notJudgeable: renderLeadfinderReport(model, { nameNotJudgeable: true }) };
for (const [k, html] of Object.entries(pages)) {
  ok(!/findable/i.test(html), `${k}: no "Findable" anywhere (text, meta, links, CSS)`);
  ok(!/£|\bprice\b|guarantee(?!d)|sign[- ]?up|onboarding|19\.99|\b99\b/i.test(html.replace(/it cannot be guaranteed|measurements, not guarantees/g, "")), `${k}: no price, guarantee offer or sign-up`);
  ok(/LeadFinder<b>OS<\/b>|LeadFinderOS/.test(html), `${k}: LeadFinderOS name and logo`);
  ok(html.includes('name="robots" content="noindex'), `${k}: noindex`);
}
const r = pages.report;
ok(r.includes(LFOS_CTA_LINE) && LFOS_CTA_LINE === "Run reports like this for your clients. Start free at leadfinderos.com", "the CTA line, word for word");
ok(r.includes('href="https://leadfinderos.com"'), "the CTA links to https://leadfinderos.com");
ok(/not guarantees/.test(r) && /cannot be guaranteed/.test(r), 'the "not guarantees" line is on the page');
ok(!/Prepared by|Prepared for/i.test(r), "no organisation name");
ok(r.includes("Pixel Forge") && r.includes("RankRight"), "rivals from the stored answers");
ok(r.includes("✓ Named you") && r.includes("✕ Not named"), "per-AI named / not named lanes");
ok(r.includes("Named in 1 of the"), "the score sentence carries its evidence");
ok(/@media \(min-width:760px\)/.test(r) && /@media print/.test(r) && /@page\{size:A4/.test(r), "desktop, phone and PDF layouts");
ok(r.includes('name="viewport" content="width=device-width, initial-scale=1"'), "phone viewport");
ok(pages.print.includes("window.print()") && pages.print.includes("setTimeout"), "?print=1 opens the print dialog");
ok(!pages.notJudgeable.includes("✕ Not named") && pages.notJudgeable.includes("could not tell"), "a name that cannot be judged never says Not named");
ok(!/<script(?![^>]*>addEventListener)/.test(r.replace(/onclick="window\.print\(\)"/g, "")), "no scripts besides print");

/* The style and the address. */
ok(reportStyleOf({ report_style: "leadfinderos" }) === "leadfinderos" && reportStyleOf({ report_style: "findable" }) === "findable" && reportStyleOf(null) === "findable" && reportStyleOf({ report_style: "x" }) === "findable", "anything but leadfinderos is Findable");
ok(lfosReportUrl("hz9ut7") === "https://app.leadfinderos.com/r/hz9ut7", "the LeadFinderOS link");
ok(isLfosReportHost("app.leadfinderos.com") && isLfosReportHost("APP.leadfinderos.com:443") && !isLfosReportHost("yoursites.uk") && !isLfosReportHost("findable.live") && !isLfosReportHost("x.app.leadfinderos.com") && !isLfosReportHost(""), "only the app's address serves LeadFinderOS reports");
const fn = read("functions/r/[slug].ts");
ok(/isLfosReportHost \} from "\.\.\/\.\.\/src\/lib\/reportBrand\.ts"/.test(fn) &&!/function isLfosReportHost/.test(fn), "the Pages Function uses the one host check (reportBrand.ts)");
ok(fn.includes("preview") && fn.includes('"user-agent"'), "opens still tracked through the proxy (UA forwarded, preview passes through)");

const rar = read("supabase/functions/render-audit-report/index.ts");
ok(rar.includes('.from("campaigns").select("report_style")') && rar.includes("reportStyleOf("), "renderer reads the lead's campaign style at render time");
ok(rar.includes('if (lfosHost && !lfos) return no('), "the LeadFinderOS address refuses a Findable-style report");
ok(rar.includes("if (lfos) return no(") && rar.indexOf("if (lfos) return no(") < rar.indexOf("return htmlResponse(renderReportHtml(data)"), "a LeadFinderOS lead never falls through to the Findable classic page");
ok(rar.includes("renderLeadfinderMeasuring("), "still measuring: the LeadFinderOS waiting page");
ok(/if \(lfos\) \{\s*if \(auditShortCode\) data\.shareUrl = lfosReportUrl/.test(rar) && rar.includes("data.showOffer = false;"), "LeadFinderOS: its own share link, no offer");

const ar = read("supabase/functions/_shared/audit-reply.ts");
ok(ar.includes('style === "leadfinderos" ? lfosReportUrl(code) : shortReportUrl(code)'), "webdev_report {{2}}: the link for the lead's campaign");
ok(read("src/pages/Inbox.tsx").includes("reportLinkFor(activeReport.shortCode, activeReportStyle)") && read("src/pages/AiAudit.tsx").includes("reportLinkFor(openAuditRow.short_code, openReportStyle)"), "Copy report link: the link for the lead's campaign (Inbox and audit page)");

const mig = read("supabase/migrations/20261216090000_campaign_report_style.sql");
ok(/add column if not exists report_style text not null default 'findable'/.test(mig), "additive column, Findable by default");
ok(/my_role\(\) is distinct from 'admin'/.test(mig) && /revoke all on function public\.campaign_set_report_style\(uuid, text\) from public, anon/.test(mig), "the setter is admin only");
ok(/where id = '17c5cff4-83a7-4fab-ba07-3182c4c8324c'/.test(mig), "Web devs/agencies · WhatsApp set by id");
ok(read("src/components/campaigns/CampaignEditDialog.tsx").includes("campaign_set_report_style") && /function ReportStyleSetting[\s\S]*?if \(!isAdmin\) return null;/.test(read("src/components/campaigns/CampaignEditDialog.tsx")), "the setting shows to the admin only");

/* The web-dev audit questions. */
for (const t of ["web designers", "Web Design", "website designer", "SEO agency", "Web developer", "digital marketing agency", "WordPress developer"]) ok(isWebdevTrade(t), `web-dev trade: ${t}`);
for (const t of ["plumber", "electrician", "hair salon", "accountants", "web of life church"]) ok(!isWebdevTrade(t), `not web-dev: ${t}`);
const wq = webdevHookQuestions("Sutton UK");
ok(wq.length === 3 && wq[0] === "Who is the best web designer in Sutton UK?" && /SEO/.test(wq[1]) && /website/.test(wq[2]) && wq.every((q) => q.includes("Sutton UK")), "three searches about their trade, in their area");
const caa = read("supabase/functions/create-ai-audit/index.ts");
ok(caa.includes("if (isWebdevTrade(ctx.trade) && hookPlace.trim()) return webdevHookQuestions(hookPlace);"), "the hook plan uses them for a web-dev trade");

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log("\nall passed");
