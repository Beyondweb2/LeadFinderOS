/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE DASHBOARDS REDESIGN (2026-10-02, docs/dashboards-redesign.md).
   Paul: the Sales dashboard looked "weak, messy, old"; the Admin dashboard was messy too. Both now draw
   from ONE design system (src/components/salesDash/ui.tsx) so they read as one product built for two
   jobs. This pins what the redesign decided, so a later change cannot quietly undo it:
   the shared system, the Sales dashboard's order and naming, what was removed, the nav.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync, readdirSync } from "node:fs";
import { SALES_NAV_ORDER, homeFor } from "../src/lib/access.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, "").replace(/\{\/\*[\s\S]*?\*\/\}/g, "");

/* 2026-10-06: the props-only primitives and the tones moved to a leaf (salesDash/primitives.tsx, re-exported by ui.tsx)
   so a component rendered from plain data can use them without the app's auth wiring. Still ONE design system. */
const ui = read("src/components/salesDash/ui.tsx") + "\n" + read("src/components/salesDash/primitives.tsx");
const sales = code("src/pages/SalesDashboard.tsx");
const admin = code("src/pages/Dashboard.tsx");
const cc = code("src/components/admin/controlCentre.tsx");

console.log("── one design system ──");
{
  for (const name of ["PageHeader", "SectionHeading", "Segmented", "Panel", "KpiCard", "Figure", "Empty"]) ok(new RegExp(`export function ${name}\\b`).test(ui), `ui.tsx exports ${name}`);
  ok(/export const SURFACE = /.test(ui) && (ui.match(/SURFACE/g) ?? []).length >= 4, "one card surface, used by the panels and the figures");
  ok(/TONE\[tone\]\.solid/.test(ui.slice(ui.indexOf("function PanelHeader"))), "a panel's icon sits on its colour's solid tile");
  ok(["green", "blue", "amber", "purple", "red", "grey"].every((t) => new RegExp(`${t}:\\s+\\{[^}]*solid: '[^']+'[^}]*tint: '[^']+'`).test(ui)), "every tone has a solid and a tint");
  ok(/from '@\/components\/salesDash\/ui'/.test(sales) && /<PageHeader/.test(sales), "the Sales dashboard uses the shared page header");
  ok(/from '@\/components\/salesDash\/ui'/.test(admin) && /<PageHeader/.test(admin), "the Admin dashboard uses the same page header");
  ok(/<Segmented label="Period"/.test(admin) && /<Segmented label="Follow-up lists"/.test(read("src/components/salesDash/sections.tsx")), "one segmented control: the admin period and the sales follow-up lists");
  ok(/<SectionHeading title=\{title\}/.test(cc), "the admin's sections use the shared section heading");
  ok(!/function Figure\b/.test(cc) && /import \{[^}]*\bFigure\b[^}]*\} from '@\/components\/salesDash\/ui'/.test(cc), "the admin's figures are the shared Figure (no local copy)");
  const admins = readdirSync(new URL("../src/components/admin", import.meta.url)).filter((n) => n.endsWith(".tsx")).map((n) => code(`src/components/admin/${n}`)).join("\n");
  ok(!/divide-y divide-border\/60 overflow-hidden rounded-xl border/.test(admins), "admin list frames all use the one rounded-2xl treatment");
}

console.log("\n── the Sales dashboard ──");
{
  ok(/title="Sales dashboard"/.test(sales), 'it is called "Sales dashboard"');
  const at = (s: string) => sales.indexOf(s);
  /* 2026-10-04 (fix workstream 5, Session A A-18): for a SALESPERSON "What to do next" comes first (on a phone it sat
     ~1,600 px down under commission); the admin's overview keeps month → what to do next. */
  const order = ["<MonthlyLadder ", "<EarningsStats ", '<KpiCard label="Calls made"', "<CommissionForecastCard ", "<RecentWins ", "<CommissionExplainer ", "<PaymentsTable "];
  ok(order.every((s) => at(s) > -1) && order.every((s, i) => i === 0 || at(order[i - 1]) < at(s)), `order: the month + money → work → next six months + wins → rules → payments`);
  ok(/const todoFirst = role === 'sales';/.test(sales) && at("{todoFirst && todo}") > -1 && at("{todoFirst && todo}") < at("<MonthlyLadder ") && at("{!todoFirst && todo}") > at("<EarningsStats ") && at("{!todoFirst && todo}") < at('<KpiCard label="Calls made"'),
    'what to do next: first for a salesperson, after the month for the admin');
  ok(!/SalesByWeek|week by week/i.test(sales + code("src/components/salesDash/earningsParts.tsx")), '"This month, week by week" is gone (page and parts)');
  const explainer = code("src/components/salesDash/earningsParts.tsx");
  const ex = explainer.slice(explainer.indexOf("export function CommissionExplainer"), explainer.indexOf("export function PaymentsTable"));
  ok(!/monthlyTracker|totals\./.test(ex) && /collapseKey="sales\.commission-rules" defaultOpen=\{false\}/.test(ex), "the commission rules are folded fine print: no tracker, no totals");
  const ladder = read("src/components/salesDash/MonthlyLadder.tsx");
  const card = read("src/components/salesDash/CommissionForecastCard.tsx");
  /* 2026-10-02 (Paul): the dark card language of the work tiles, NOT a solid green hero. */
  ok(/from-indigo-500\/30 via-violet-600/.test(ladder) && !/emerald/.test(ladder), "the month is a dark indigo card — no green at all");
  ok(/state === 'here' \? 'border-amber-400/.test(ladder) && /state === 'done' \? 'border-teal-400/.test(ladder), "the current rate step is amber, unlocked steps teal");
  ok(/<Check /.test(ladder) && /<Lock /.test(ladder), "each rate step shows unlocked (tick), current, or locked");
  ok(/export function EarningsStats/.test(card) && (card.match(/<KpiCard /g) ?? []).length === 3 && /data-testid="ladder-earned"/.test(card), "the three money figures sit beside the month, each once");
  ok(/grid-cols-3 gap-1\.5 sm:grid-cols-6/.test(card) && /BAR_PX/.test(card), "the six months are one bar chart (three columns on a phone, six from sm)");
  ok(/from-teal-300 to-teal-500/.test(card) && /from-violet-400 to-violet-600/.test(card), "collected teal, expected violet — never mixed");
  ok(/NEXT_ACTIONS_SHOWN/.test(read("src/components/salesDash/sections.tsx")), "what to do next shows the most urgent few, the rest one tap away");
}

console.log("\n── phone polish and the dark colour direction (2026-10-02) ──");
{
  /* Paul: no green hero, no green-on-green; money is drawn teal; the work tiles' dark tinted cards are the language. */
  ok(/green:\s+\{[^}]*solid: 'bg-gradient-to-br from-teal-500 to-cyan-600/.test(ui) && !/emerald/.test(ui.slice(ui.indexOf("export const TONE"), ui.indexOf("export const SURFACE"))), "the money tone is teal, never emerald");

  ok(/data-testid="attention-actions"/.test(cc) && /flex-col sm:flex-row/.test(cc), "phone: attention actions sit in a strip under the row, not beside the text");
  ok(/tone="purple" stackAction/.test(read("src/components/admin/businessSummary.tsx")) && /if \(stackAction\) return/.test(ui), "phone: the plain-English button gets its own row (a shared Panel option)");
  ok(/<Segmented label="Follow-up lists" wrapOnPhone/.test(read("src/components/salesDash/sections.tsx")), "phone: the follow-up pills wrap instead of scrolling sideways");
  ok(/className="grid grid-cols-3 gap-2 sm:gap-3" data-testid="work-numbers"/.test(sales), "phone: the three work tiles stay in one row");
}

console.log("\n── the Admin dashboard ──");
{
  ok(/title="Admin dashboard"/.test(admin), 'it is called "Admin dashboard"');
  /* 2026-10-26 Concept A (Paul: "my dashboard looks good, it's just full of junk"): the home keeps glance → what needs
     you → key numbers → questionnaires → the sign-up desk; the team, money, insight, client-health, traffic and cost
     panels MOVED (not deleted) to /admin/insights (AdminInsights.tsx). docs/design/admin-dashboard/README.md. */
  const insights = code("src/pages/AdminInsights.tsx");
  ok(/<Section title="Website & system"/.test(insights) && !/<Section title="Traffic"/.test(insights) && !/<Section title="System"/.test(insights), 'Traffic, usage and running costs are one section, "Website & system" (on Team, insights and costs)');
  const sections = [...insights.matchAll(/<Section title="([^"]+)" tone="(\w+)" hint="[^"]+"/g)].map((m) => m[1]);
  ok(sections.length === [...insights.matchAll(/<Section title=/g)].length && sections.length >= 5, `every insights section has a colour and a one-line purpose (${sections.join(", ")})`);
  const order = (src: string, list: string[]) => list.every((s) => src.indexOf(s) > -1) && list.every((s, i) => i === 0 || src.indexOf(list[i - 1]) < src.indexOf(s));
  ok(order(admin, ["<BusinessGlance ", "<NeedsMeList ", "<KeyNumbers ", "<QuestionnaireLog ", 'to="/admin/insights"', 'id="signup-desk"']), "home order: glance → what needs you → key numbers → questionnaires → link to insights → sign-up desk");
  ok(order(insights, ["<TeamPerformanceTable ", "<MoneyPanel ", "<LostReasonsPanel ", "<ClientHealthPanel ", "<FindableFunnelPanel ", "<CostPanel "]), "insights order: team → money → intelligence → clients in delivery → website & system");
  for (const moved of ["<TeamPerformanceTable ", "<MoneyPanel ", "<LostReasonsPanel ", "<FindableFunnelPanel ", "<CostPanel ", "<AttentionQueue "]) ok(!admin.includes(moved), `moved off the home page: ${moved.trim()}`);
  ok(!/<ClientSearchPanel/.test(admin + insights), 'the never-connected "Client websites · Google search" panel is not shown');
  for (const gone of ["<SinceYesterday ", "<TeamComparison ", "<FunnelPanel ", "<CallsPanel ", "<RevenuePanel ", "<ContributionPanel ", "<CommissionPanel "]) ok(!admin.includes(gone) && !insights.includes(gone), `removed from the page: ${gone.trim()}`);
  /* My activity: INCLUDED by default (2026-10-26), one key for both pages, still sent to the server. */
  ok([admin, insights].every((s) => /usePersistedState<boolean>\(HIDE_MY_ACTIVITY_KEY, false/.test(s) && /useAdminOverview\(choice, isAdmin, hideMine\)/.test(s)), "My activity: default included, remembered, and sent to the server for every activity figure");
  ok(/usePaidClientList\(isAdmin\)/.test(admin) && /invokeEdge<\{ clients: PaidClientListRow\[\] \}>\('paid-client-hub', \{ action: 'list' \}\)/.test(read("src/hooks/useAdminTeamControl.ts")), "new clients read the Paid Clients page's own list (no second status system)");
  ok(/exclude=\{handoffIds\}/.test(insights), "a client under New sales is not repeated in Clients in delivery");
}

console.log("\n── the nav ──");
{
  ok(SALES_NAV_ORDER[0] === "/sales-dashboard" && homeFor("sales") === "/sales-dashboard", "sales: the Sales dashboard is first and where they land");
  const sidebar = read("src/components/AppSidebar.tsx");
  ok(/title: 'Admin dashboard', url: '\/'/.test(sidebar) && /title: 'Sales dashboard', url: '\/sales-dashboard'/.test(sidebar), "the two dashboards are named as a pair in the sidebar");
  ok(/\{ title: 'Dashboard', url: '\/sales-dashboard', icon: BarChart3 \}/.test(read("src/components/MobileBottomNav.tsx")), "phone: the sales bar starts with Dashboard");
}

console.log(f === 0 ? "\nALL PASS" : `\n${f} FAILURES`);
process.exit(f === 0 ? 0 : 1);
