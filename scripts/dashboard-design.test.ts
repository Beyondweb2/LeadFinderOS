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

const ui = read("src/components/salesDash/ui.tsx");
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
  const order = ["<MonthlyLadder ", "<EarningsStats ", "<NextActions ", '<KpiCard label="Calls made"', "<CommissionForecastCard ", "<RecentWins ", "<CommissionExplainer ", "<PaymentsTable "];
  ok(order.every((s) => at(s) > -1) && order.every((s, i) => i === 0 || at(order[i - 1]) < at(s)), `order: the month + money → what to do next → work → next six months + wins → rules → payments`);
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
  ok(/<Section title="Website & system"/.test(admin) && !/<Section title="Traffic"/.test(admin) && !/<Section title="System"/.test(admin), 'Traffic, usage and running costs are one section, "Website & system"');
  const sections = [...admin.matchAll(/<Section title="([^"]+)" tone="(\w+)" hint="[^"]+"/g)].map((m) => m[1]);
  ok(sections.length === [...admin.matchAll(/<Section title=/g)].length && sections.length >= 7, `every admin section has a colour and a one-line purpose (${sections.join(", ")})`);
  /* 2026-10-02 control centre (Paul: "my business / sales control centre", one metric one home). */
  const at = (s: string) => admin.indexOf(s);
  const order = ["<BusinessGlance ", "<AttentionQueue items={needs}", "<HandoffsPanel ", "<TeamPerformanceTable ", "<MoneyPanel ", "<LostReasonsPanel ", "<FindableFunnelPanel "];
  ok(order.every((s) => at(s) > -1) && order.every((s, i) => i === 0 || at(order[i - 1]) < at(s)), "order: glance → what needs you → new sales & handoffs → sales team → money → intelligence → website & system");
  for (const gone of ["<SinceYesterday ", "<TeamComparison ", "<FunnelPanel ", "<CallsPanel ", "<RevenuePanel ", "<ContributionPanel ", "<CommissionPanel "]) ok(!admin.includes(gone), `removed from the page: ${gone.trim()}`);
  /* 2026-10-02: the toggle now reaches the server (scripts/admin-my-activity.test.ts has the figures). */
  ok(/usePersistedState<boolean>\('admin\.hideMyActivity', true/.test(admin) && /useAdminOverview\(choice, isAdmin, hideMine\)/.test(admin), "Hide my activity: default hidden, remembered, and sent to the server for every activity figure");
  ok(/usePaidClientList\(isAdmin\)/.test(admin) && /invokeEdge<\{ clients: PaidClientListRow\[\] \}>\('paid-client-hub', \{ action: 'list' \}\)/.test(read("src/hooks/useAdminTeamControl.ts")), "New sales & handoffs reads the Paid Clients page's own list (no second status system)");
  ok(/exclude=\{handoffIds\}/.test(admin), "a client under New sales & handoffs is not repeated in Clients in delivery");
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
