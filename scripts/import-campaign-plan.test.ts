/* One campaign per trade on import (2026-10-16). Fake rows only — no real lead, no network, nothing sent. */
import { readFileSync } from "node:fs";
import { normaliseTrade, planTradeCampaigns, tradePlanSummary, runImportPerTrade, TRADE_CAMPAIGN_MAX } from "../src/lib/importCampaignPlan.ts";
import type { ImportRow, ImportRpc } from "../src/lib/csvLeadImport.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const row = (n: number, trade?: string): ImportRow => ({ row: n, business_name: `Fake ${n}`, phone: "07700 900000", ...(trade !== undefined ? { trade } : {}) }) as ImportRow;

console.log("── normalising ──");
ok(normaliseTrade("  Dental   clinics ") === "Dental clinics", "trim + collapse spaces");
ok(normaliseTrade(null) === "" && normaliseTrade(undefined) === "", "absent is empty");

console.log("── plan: multiple trades, whitespace variants, blank ──");
{
  const rows = [row(2, "Dental clinics "), row(3, "Dental clinics"), row(4, "dental  clinics"), row(5, "Plumbers"), row(6, ""), row(7), row(8, "Vets"), row(9, "Plumbers")];
  const p = planTradeCampaigns(rows, []);
  ok(p.groups.length === 3, "three campaigns from eight rows");
  const d = p.groups.find((g) => g.name === "Dental clinics");
  ok(!!d && d.count === 3 && d.rowNumbers.join() === "2,3,4", "whitespace and case variants land in ONE campaign, named as first written");
  ok(p.groups.find((g) => g.name === "Plumbers")?.count === 2, "plumbers 2");
  ok(p.fallbackRows.join() === "6,7", "blank trades use the chosen campaign");
  ok(p.groups.every((g) => g.existingId === null), "none exist: all new");
  const s = tradePlanSummary(p, "General");
  ok(s.startsWith("Will use 4 campaigns: Dental clinics (3, new), Plumbers (2, new), Vets (1, new)"), "summary names each campaign with count and new");
  ok(/General \(2,/.test(s), "summary names the fallback campaign");
}
console.log("── plan: existing campaign reused, never duplicated ──");
{
  const existing = [
    { id: "c-other", name: "Dental clinics", created_by: "someone-else" },
    { id: "c-mine", name: "dental clinics", created_by: "me" },
    { id: "c-old", name: "Plumbers", created_by: "me", archived_at: "2026-10-01" },
  ];
  const p = planTradeCampaigns([row(2, "Dental clinics"), row(3, "Plumbers")], existing, "me");
  ok(p.groups.find((g) => g.name === "Dental clinics")?.existingId === "c-mine", "exact-name campaign reused (mine preferred)");
  ok(p.groups.find((g) => g.name === "Plumbers")?.existingId === null, "an archived campaign is not reused: new");
  ok(/Dental clinics \(1, existing\)/.test(tradePlanSummary(p, null)), "summary says existing");
}
console.log("── plan: too long, none at all ──");
{
  const long = "x".repeat(TRADE_CAMPAIGN_MAX + 1);
  const p = planTradeCampaigns([row(2, long), row(3, "Vets")], []);
  ok(p.groups.length === 1 && p.fallbackRows.join() === "2" && p.tooLong[0] === long, "a too-long trade falls back, and is reported");
  ok(tradePlanSummary(planTradeCampaigns([], []), null) === "No rows to import.", "empty plan");
}

console.log("── run: one call per campaign, right campaign id, merged report ──");
{
  const rows = [row(2, "Vets"), row(3, "Plumbers"), row(4, ""), row(5, "Vets")];
  const plan = planTradeCampaigns(rows, [{ id: "c-vets", name: "Vets" }]);
  const calls: { campaign: string | null; rows: number[]; commit: boolean }[] = [];
  const rpc: ImportRpc = async (a) => {
    calls.push({ campaign: a._campaign_id, rows: a._rows.map((r) => r.row), commit: a._commit });
    const n = a._rows.length;
    return { data: { ok: true, counts: { rows: n, valid: n, invalid: 0, duplicate_in_file: 0, existing: 0, possible_match: 0, held: 0, new: n, update: 0, skipped: 0, created: n, updated: 0, failed: 0 }, rows: a._rows.map((r) => ({ i: 0, row: r.row, outcome: "created", lead_id: `L${r.row}` })), joined_campaign: n }, error: null };
  };
  const ids = new Map([["vets", "c-vets"], ["plumbers", "c-new-plumbers"]]);
  const rep = await runImportPerTrade({ rpc, rows, plan, fileName: "fake.csv", campaignIds: ids, fallbackCampaignId: "c-fallback", importPossible: false, tags: { batch: "b" } });
  ok(calls.length === 3 && calls.every((c) => c.commit), "three committed calls");
  ok(calls[0].campaign === "c-vets" && calls[0].rows.join() === "2,5", "vets rows to the existing vets campaign");
  ok(calls[1].campaign === "c-new-plumbers" && calls[1].rows.join() === "3", "plumbers to the new campaign");
  ok(calls[2].campaign === "c-fallback" && calls[2].rows.join() === "4", "blank trade to the chosen campaign");
  ok(rep.counts.created === 4 && rep.joinedCampaign === 4 && rep.createdIds.length === 4 && !rep.stopped, "reports merged");
}
console.log("── run: a failing campaign stops the rest, earlier ones stand ──");
{
  const rows = [row(2, "A"), row(3, "B"), row(4, "C")];
  const plan = planTradeCampaigns(rows, []);
  let n = 0;
  const rpc: ImportRpc = async (a) => (++n === 2
    ? { data: { ok: false, error: "unknown_campaign" }, error: null }
    : { data: { ok: true, counts: { rows: 1, valid: 1, invalid: 0, duplicate_in_file: 0, existing: 0, possible_match: 0, held: 0, new: 1, update: 0, skipped: 0, created: 1, updated: 0, failed: 0 }, rows: [{ i: 0, row: a._rows[0].row, outcome: "created", lead_id: "x" }], joined_campaign: 1 }, error: null });
  const rep = await runImportPerTrade({ rpc, rows, plan, fileName: null, campaignIds: new Map([["a", "1"], ["b", "2"], ["c", "3"]]), fallbackCampaignId: null, importPossible: false, tags: {} });
  ok(n === 2 && rep.counts.created === 1 && rep.stopped?.fromRow === 3, "stopped at B; A stands; C not attempted");
}

console.log("── the dialog uses the existing paths only ──");
{
  const d = readFileSync(new URL("../src/components/CSVImportDialog.tsx", import.meta.url), "utf8");
  ok(/method: 'whatsapp'/.test(d) && /campaignActions\.create\(/.test(d), "campaigns are made by campaign_new via useCampaignActions, WhatsApp channel");
  ok(/Create a campaign for each trade \(WhatsApp\)/.test(d), "the option's wording");
  const lib = readFileSync(new URL("../src/lib/importCampaignPlan.ts", import.meta.url), "utf8");
  ok(!/queue|send-whatsapp|sales_queue_opener/i.test(lib.replace(/\/\*[\s\S]*?\*\//, "")), "the planner never queues or sends");
}
if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
