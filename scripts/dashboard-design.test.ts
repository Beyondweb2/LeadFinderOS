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
  const order = ["<MonthlyLadder ", '<KpiCard label="Calls made"', "<NextActions ", "<CommissionForecastCard ", "<RecentWins ", "<CommissionExplainer ", "<PaymentsTable "];
  ok(order.every((s) => at(s) > -1) && order.every((s, i) => i === 0 || at(order[i - 1]) < at(s)), `order: the month → work → what to do next → earnings → wins + rules → payments`);
  ok(!/SalesByWeek|week by week/i.test(sales + code("src/components/salesDash/earningsParts.tsx")), '"This month, week by week" is gone (page and parts)');
  const explainer = code("src/components/salesDash/earningsParts.tsx");
  const ex = explainer.slice(explainer.indexOf("export function CommissionExplainer"), explainer.indexOf("export function PaymentsTable"));
  ok(!/MONTHLY_TIERS|monthlyTracker|totals\./.test(ex), "the commission rules card repeats no rate, tier or total (the hero and Your earnings hold them)");
  const ladder = read("src/components/salesDash/MonthlyLadder.tsx");
  ok(/bg-gradient-to-br from-emerald-500/.test(ladder) && /data-testid="ladder-earned"/.test(ladder), "the month is a solid green hero with what was earned on it");
  ok(/<Check /.test(ladder) && /<Lock /.test(ladder), "each rate step shows unlocked (tick), current, or locked");
  const card = read("src/components/salesDash/CommissionForecastCard.tsx");
  ok(/grid-cols-3 gap-1 sm:grid-cols-6/.test(card) && /BAR_PX/.test(card), "the six months are one bar chart (three columns on a phone, six from sm)");
  ok(/from-emerald-400 to-emerald-600/.test(card) && /from-violet-400/.test(card), "collected is solid green, expected pale purple — never mixed");
}

console.log("\n── the Admin dashboard ──");
{
  ok(/title="Admin dashboard"/.test(admin), 'it is called "Admin dashboard"');
  ok(/<Section title="Website & usage"/.test(admin) && !/<Section title="Traffic"/.test(admin) && !/<Section title="System"/.test(admin), 'Traffic and System are one section, "Website & usage"');
  const sections = [...admin.matchAll(/<Section title="([^"]+)" tone="(\w+)" hint="[^"]+"/g)].map((m) => m[1]);
  ok(sections.length === [...admin.matchAll(/<Section title=/g)].length && sections.length >= 7, `every admin section has a colour and a one-line purpose (${sections.join(", ")})`);
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
