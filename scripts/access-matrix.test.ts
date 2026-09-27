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
import { canOpenRoute, homeFor, PERMISSION_MATRIX, SALES_ROUTE_PATTERNS } from "../src/lib/access.ts";

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
  "/compare/x", "/playbook/x", "/page-generator", "/page-plan", "/mockups", "/templates", "/inbox", "/outreach", "/ai-audit",
  "/admin/api-usage", "/team"]) {
  ok(!canOpenRoute("sales", p), `sales cannot open ${p}`);
}
ok(!canOpenRoute("sales", "/sales/lead"), "a malformed sales path is refused (no id)");
ok(!canOpenRoute("sales", "/sales/lead/x/extra"), "…and an over-long one");
ok(canOpenRoute("sales", "/sales/lead/abc?x=1#y"), "query and hash do not change the answer");

console.log("\n── homes ──");
ok(homeFor("admin") === "/" && homeFor("sales") === "/sales" && homeFor(null) === "/auth", "admin → /, sales → /sales, none → /auth");
ok(canOpenRoute("sales", homeFor("sales")), "sales can open its own home (no redirect loop)");

console.log("\n── the matrix names the brief's rows ──");
const feats = PERMISSION_MATRIX.map((r) => r.feature.toLowerCase()).join(" | ");
for (const w of ["paid clients", "full measurement", "coverage", "find leads", "team", "billing", "notes", "assign", "claim"]) {
  ok(feats.includes(w), `matrix has a row for "${w}"`);
}
ok(PERMISSION_MATRIX.filter((r) => /paid clients|billing|team|api usage/i.test(r.feature)).every((r) => r.sales === "no"), "money, delivery, team and system rows say 'no' for sales");

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log("\nALL PASS");
