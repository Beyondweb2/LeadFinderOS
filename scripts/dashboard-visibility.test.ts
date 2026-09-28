/* The Sales Dashboard's per-person hide/show (2026-09-28). Display only — pinned here: new rows are
   visible by default, Show all restores, hiding changes no number, and the store is one own-row per
   person. The live per-person proof is supabase/tests/dashboard-visibility.sql (rolled back). */
import fs from "node:fs";
import path from "node:path";
import { campaignKey, templateKey, visibleRows, toggleHidden, inactiveKeys, parseHidden, EMPTY_HIDDEN, INACTIVE_DAYS } from "../src/lib/dashboardVisibility.ts";
import { foldSalesPerformance } from "../src/lib/salesPerformance.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const root = path.resolve(import.meta.dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8").replace(/\r\n/g, "\n");

const rows = [
  { campaignId: "c1", name: "Plumbers", lastActivityAt: "2026-09-27T10:00:00Z" },
  { campaignId: "c2", name: "Barbers (old)", lastActivityAt: "2026-07-01T10:00:00Z" },
  { campaignId: null, name: "No campaign", lastActivityAt: null },
];
const now = Date.parse("2026-09-28T12:00:00Z");

let hidden = toggleHidden([], "c2", true);
ok(visibleRows(rows, hidden, campaignKey).map((r) => r.name).join() === "Plumbers,No campaign", "Sales A hides a campaign: it leaves their table");
const withNew = [...rows, { campaignId: "c9", name: "Roofers (new)", lastActivityAt: "2026-09-28T09:00:00Z" }];
ok(visibleRows(withNew, hidden, campaignKey).some((r) => r.campaignId === "c9"), "a campaign created after the list was saved is visible by default (the list stores HIDDEN, never shown)");
ok(visibleRows(rows, [], campaignKey).length === 3 && visibleRows(rows, EMPTY_HIDDEN.campaigns, campaignKey).length === 3, "nothing saved = everything shown");
hidden = toggleHidden(hidden, "c2", false);
ok(hidden.length === 0, "unticking a hidden row shows it again");
ok(JSON.stringify(inactiveKeys(rows, campaignKey, now)) === JSON.stringify(["c2", "none"]), `Hide inactive picks rows with nothing in ${INACTIVE_DAYS} days (or none at all), keeps current work`);
ok(JSON.stringify(parseHidden({ campaigns: ["a", "a", 3, ""], templates: "x" })) === JSON.stringify({ campaigns: ["a"], templates: [] }), "a malformed saved row hides nothing unexpected");
ok(visibleRows([{ template: "initial_contact" }, { template: "old_barber" }], ["old_barber"], templateKey).length === 1, "templates hide the same way");

// Show all, as the control does it: drop every hidden key that belongs to this table.
const saved = ["c1", "c2", "t-elsewhere"];
const shownAll = saved.filter((k) => !rows.some((r) => campaignKey(r) === k));
ok(JSON.stringify(shownAll) === JSON.stringify(["t-elsewhere"]) && visibleRows(rows, shownAll, campaignKey).length === 3, "Show all restores every row of that table");

// Hiding changes no number: the fold never sees the preference, and the page filters only rows.
const input = {
  personId: null, sinceMs: null,
  leads: [{ id: "a", business_name: "A", campaign_id: "c1", status: "replied", amount_paid: null, is_potential_work: false, lead_source: null },
          { id: "b", business_name: "B", campaign_id: "c2", status: "replied", amount_paid: null, is_potential_work: false, lead_source: null }],
  messages: [{ lead_id: "a", direction: "outbound", template_name: "initial_contact", status: "read", created_at: "2026-09-27T10:00:00Z", body: "hi", sent_by_user_id: null },
             { lead_id: "b", direction: "outbound", template_name: "old_barber", status: "read", created_at: "2026-07-01T10:00:00Z", body: "hi", sent_by_user_id: null }],
  activity: [], linkEvents: [], hits: [], campaignNames: new Map([["c1", "Plumbers"], ["c2", "Barbers"]]),
};
const r1 = foldSalesPerformance(input);
const visible = visibleRows(r1.campaigns, ["c2"], campaignKey);
ok(r1.funnel.contacted === 2 && r1.campaigns.length === 2 && visible.length === 1, "a hidden campaign still counts in the totals; only its row is not drawn");
ok(JSON.stringify(foldSalesPerformance(input)) === JSON.stringify(r1), "the fold is untouched by any preference (same input, same numbers)");
ok(r1.campaigns.find((c) => c.campaignId === "c2")?.lastActivityAt === "2026-07-01T10:00:00.000Z" && r1.templates.find((t) => t.template === "old_barber")?.lastActivityAt === "2026-07-01T10:00:00Z", "rows carry a last-activity date for Hide inactive");

const fold = read("src/lib/salesPerformance.ts"), fn = read("supabase/functions/sales-performance/index.ts");
ok(!/dashboard_hidden|user_preferences/.test(fold + fn), "the server's numbers never read the preference");
const page = read("src/pages/SalesDashboard.tsx");
ok(/<Funnel f=\{d\.funnel\} \/>/.test(page), "the funnel is drawn from the unfiltered totals");
const mig = read("supabase/migrations/20260928150000_user_preferences.sql");
ok((mig.match(/user_id = \(select auth\.uid\(\)\)/g) ?? []).length === 4 && /revoke all on public\.user_preferences from public, anon/.test(mig), "one own row per person: read, insert and update only your own; anon has nothing");
ok(!/for delete|grant[^;]*delete/.test(mig), "…and nobody deletes through the browser");

if (f) { console.log(`\n${f} FAILURES`); process.exit(1); }
console.log("\nALL PASS");
