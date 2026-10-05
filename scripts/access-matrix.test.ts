/* ════════════════════════════════════════════════════════════════════════════════════════════════
   EVERY ROUTE AGAINST THE PERMISSION MATRIX (multi-user, 2026-09-27).

   ⛔ A new page is admin-only by DEFAULT (src/lib/access.ts lists what sales may open, positively).
   This suite reads the real route table in src/App.tsx, so a route added tomorrow is checked
   without anyone remembering to add it here: the admin opens it, a salesperson does not — unless
   it is deliberately listed as a sales route.
   ⚠️ This is the PRESENTATION layer. The data boundary is RLS + the edge functions
   (scripts/role-rules.test.ts, supabase/tests/multi-user-rls.sql).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from "node:fs";
import { canOpenRoute, homeFor, leadPermissions, maySetStatus, PERMISSION_MATRIX, SALES_ROUTE_PATTERNS } from "../src/lib/access.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const app = readFileSync(new URL("../src/App.tsx", import.meta.url), "utf8").replace(/\r\n/g, "\n");

const shellStart = app.indexOf("<RequireAccess>");
const shellEnd = app.indexOf("</Route>", app.indexOf('<Route path="/admin/api-usage"'));
ok(shellStart > 0, "the shell is wrapped in RequireAccess");
ok(!/<RequireAdmin>/.test(app), "RequireAdmin no longer wraps the shell (it would lock sales out of their own routes)");
const shell = app.slice(shellStart, shellEnd);
const routes = [...shell.matchAll(/<Route path="([^"]+)"/g)].map((m) => m[1]);
ok(routes.length >= 20, `found the shell's routes (${routes.length})`);

const fill = (p: string) => p.replace(/:[A-Za-z]+/g, "x123");
for (const r of routes) {
  const path = fill(r);
  ok(canOpenRoute("admin", path), `admin opens ${r}`);
  const salesListed = SALES_ROUTE_PATTERNS.includes(r);
  ok(canOpenRoute("sales", path) === salesListed, `sales ${salesListed ? "opens" : "is refused"} ${r}`);
  ok(!canOpenRoute(null, path), `no role is refused ${r}`);
}
for (const p of SALES_ROUTE_PATTERNS) ok(routes.includes(p), `sales route ${p} exists in App.tsx`);

console.log("\n── the admin-only screens the brief names ──");
for (const p of ["/", "/dashboard", "/paid-clients", "/paid-clients/x", "/paid-clients/x/website-build", "/baseline/x", "/baseline-setup/x",
  "/compare/x", "/playbook/x", "/page-generator", "/page-plan", "/mockups", "/templates", "/ai-audit",
  "/admin/api-usage", "/team", "/review-replies"]) {
  ok(!canOpenRoute("sales", p), `sales cannot open ${p}`);
}

console.log("\n── ONE workflow: Sales uses the same Outreach and Inbox (2026-09-27) ──");
for (const p of ["/outreach", "/inbox", "/find-leads", "/coverage"]) ok(canOpenRoute("sales", p), `sales opens ${p}`);
ok(!canOpenRoute("sales", "/review-replies"), "Review Replies is refused for sales at the route");
ok(canOpenRoute("admin", "/review-replies"), "…and still open to the admin");
ok(/<Route path="\/sales" element=\{<Navigate to="\/outreach" replace \/>\} \/>/.test(app), "/sales redirects to /outreach");
ok(/<Route path="\/sales\/lead\/:leadId" element=\{<LegacySalesLeadRedirect \/>\} \/>/.test(app), "/sales/lead/:id goes through the legacy redirect");
const legacy = readFileSync(new URL("../src/components/LegacySalesLeadRedirect.tsx", import.meta.url), "utf8");
ok(/<Navigate to=\{outreachLeadLink\(leadId\)\} replace \/>/.test(legacy), "…which opens THAT lead in Outreach (/outreach?lead=, 2026-09-30)");
ok(!/\bSalesHome\b|\bSalesLead\b|pages\/Sales(Home|Lead)\b/.test(app), "the separate My Leads pages are not routed any more");
ok(/<Route path="\/sales-dashboard" element=\{<SalesDashboard \/>\} \/>/.test(app) && canOpenRoute("sales", "/sales-dashboard"), "the Sales Dashboard is routed and open to sales (their own numbers, scoped by the server)");
ok(!canOpenRoute("sales", "/sales/lead"), "a malformed legacy path is refused (no id)");
ok(!canOpenRoute("sales", "/sales/lead/x/extra"), "…and an over-long one");
ok(canOpenRoute("sales", "/sales/lead/abc?x=1#y"), "query and hash do not change the answer");
const sidebar = readFileSync(new URL("../src/components/AppSidebar.tsx", import.meta.url), "utf8");
ok(!/'My leads'|url: '\/sales'/.test(sidebar), "My Leads is gone from the sidebar");
const mobile = readFileSync(new URL("../src/components/MobileBottomNav.tsx", import.meta.url), "utf8");
ok(!/'My leads'|url: '\/sales'|review-replies/.test(mobile), "…and from the mobile nav (and Review Replies with it)");
ok(/orderNavForRole\(/.test(sidebar), "the sidebar orders its items through orderNavForRole (the order is pinned in sales-flow-reliability.test.ts)");

console.log("\n── what each role may do on the shared screens ──");
const A = leadPermissions("admin"), S = leadPermissions("sales"), N = leadPermissions(null);
const adminOnly = ["editLeadRecord", "removeLeads", "enrichLeads", "bulkAudits", "campaigns", "product", "crawlSite", "clientDelivery", "queueControls", "assignOwner", "auditAdmin", "privateNote", "exportData"] as const;
for (const k of adminOnly) ok(A[k] === true && S[k] === false && N[k] === false, `${k}: admin yes, sales no, no role no`);
/* CSV import (2026-10-05, fix/csv-lead-import): both roles — import_leads makes the importer the owner. */
ok(A.importLeads === true && S.importLeads === true && leadPermissions("sales", false).importLeads === false && N.importLeads === false, "importLeads: admin yes, ready sales yes (own leads), not-ready sales no, no role no");
ok(!("claimPool" in S) && !("claimPool" in A), "no Available-to-claim permission any more (Paul, 2026-09-28: the claim workflow is gone from Sales)");
ok(A.settableStatuses === null && maySetStatus(A, "payment_received"), "the admin sets every status");
for (const st of ["interested", "price_given", "not_interested", "won_pending_onboarding"]) ok(maySetStatus(S, st), `sales may set ${st}`);
for (const st of ["payment_received", "in_delivery", "completed", "refunded", "queued", "replied", "closed"]) ok(!maySetStatus(S, st), `sales may not set ${st}`);
ok(!maySetStatus(N, "interested"), "no role sets nothing");
const stage = readFileSync(new URL("../supabase/migrations/20260927100100_multi_user_sales.sql", import.meta.url), "utf8");
ok(/if _status not in \('interested', 'price_given', 'not_interested', 'won_pending_onboarding'\)/.test(stage), "…the same four the server's lead_set_stage allows");

console.log("\n── homes ──");
/* 2026-10-02 (Paul): a salesperson lands on their Sales dashboard, the first item in their menu. */
ok(homeFor("admin") === "/" && homeFor("sales") === "/sales-dashboard" && homeFor(null) === "/auth", "admin → /, sales → /sales-dashboard, none → /auth");
ok(canOpenRoute("sales", homeFor("sales")), "sales can open its own home (no redirect loop)");

console.log("\n── the matrix names the brief's rows ──");
const feats = PERMISSION_MATRIX.map((r) => r.feature.toLowerCase()).join(" | ");
for (const w of ["paid clients", "full measurement", "coverage", "find leads", "team", "billing", "notes", "assign", "claim", "review replies", "outreach", "inbox"]) {
  ok(feats.includes(w), `matrix has a row for "${w}"`);
}
ok(PERMISSION_MATRIX.filter((r) => /paid clients|billing|team|api usage|review replies/i.test(r.feature)).every((r) => r.sales === "no"), "money, delivery, review replies, team and system rows say 'no' for sales");

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log("\nALL PASS");
