/* Find Leads asks about the results on screen only (2026-10-13; src/lib/findLeadsCrmMatch.ts).
   Already-added results are marked, new ones are not, the old match rules hold row for row, big result
   sets are batched, odd names survive the filter quoting, a failed lookup fails loudly, and the page never
   loads the whole book again. Run: npx tsx scripts/find-leads-crm-match.test.ts */
import { readFileSync } from "node:fs";
import {
  matchBatches, leadOrFilter, historyOrFilter, lookupCrmMatches, withLocalChanges, sortNewestFirst,
  crmMatchFor, inOutreachFor, crmMatchSelect, quoteFilterValue, CRM_MATCH_BATCH,
  type CrmMatchRow, type HistoryMatchRow, type ResultIdentity,
} from "../src/lib/findLeadsCrmMatch.ts";
/* isFreshLead (src/lib/leadStatus.ts) imports the Supabase client, so the freshness fields are checked as fetched. */

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const norm = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

/* ── A tiny stand-in for PostgREST's or=(col.in.("a","b"),…): parses exactly what the lib sends. ── */
function parseOr(or: string): Array<{ col: string; vals: string[] }> {
  const out: Array<{ col: string; vals: string[] }> = [];
  let i = 0;
  while (i < or.length) {
    const m = /^([a-z_]+)\.in\.\(/.exec(or.slice(i));
    if (!m) throw new Error(`bad filter at ${i}: ${or.slice(i, i + 40)}`);
    i += m[0].length;
    const vals: string[] = [];
    while (or[i] !== ")") {
      if (or[i] !== '"') throw new Error(`unquoted value at ${i}`);
      i++;
      let v = "";
      while (or[i] !== '"') { if (or[i] === "\\") i++; v += or[i++]; }
      i++;
      vals.push(v);
      if (or[i] === ",") i++;
    }
    i++;
    out.push({ col: m[1], vals });
    if (or[i] === ",") i++;
  }
  return out;
}
function fakeDb(leads: CrmMatchRow[], history: HistoryMatchRow[]) {
  const calls: string[] = [];
  const pick = <T extends Record<string, unknown>>(rows: T[], or: string) => {
    const conds = parseOr(or);
    return rows.filter((r) => conds.some((c) => c.vals.includes(String(r[c.col] ?? "\u0000"))));
  };
  return {
    calls,
    q: {
      leads: async (or: string) => { calls.push(`L:${or}`); return pick(leads as unknown as Record<string, unknown>[], or) as unknown as CrmMatchRow[]; },
      history: async (or: string) => { calls.push(`H:${or}`); return pick(history as unknown as Record<string, unknown>[], or) as unknown as HistoryMatchRow[]; },
    },
  };
}

const fresh = { status: "not_contacted", next_action: "none" };
const LEADS: CrmMatchRow[] = [
  { id: "L1", business_name: "Acme Plumbing", google_maps_url: "https://maps.google.com/?cid=1", place_id: "P1", is_archived: false, created_at: "2026-10-01T00:00:00Z", campaign_id: "C1", ...fresh },
  { id: "L2", business_name: "Worked Ltd", google_maps_url: "https://maps.google.com/?cid=2", place_id: "P2", is_archived: false, created_at: "2026-10-02T00:00:00Z", status: "contacted", next_action: "none" },
  { id: "L3", business_name: "Archived Co", google_maps_url: "https://maps.google.com/?cid=3", place_id: "P3", is_archived: true, created_at: "2026-09-01T00:00:00Z", ...fresh },
  { id: "L4", business_name: "Smith & Sons (Roofing), Ltd. \"The Best\" \\ 1", google_maps_url: null, place_id: "P4", is_archived: false, created_at: "2026-10-03T00:00:00Z", ...fresh },
  { id: "L5", business_name: "Unrelated", google_maps_url: "https://maps.google.com/?cid=9", place_id: "P9", is_archived: false, created_at: "2026-10-04T00:00:00Z", ...fresh },
];
const HISTORY: HistoryMatchRow[] = [{ business_name: "Deleted Once", google_maps_url: "https://maps.google.com/?cid=7" }];

console.log("── already-added results are marked; new ones are not ──");
{
  const results: ResultIdentity[] = [
    { id: "P1", name: "Acme Plumbing", googleMapsUrl: "https://maps.google.com/?cid=1" },
    { id: "P2", name: "Worked Ltd", googleMapsUrl: "https://maps.google.com/?cid=2" },
    { id: "P3", name: "Archived Co", googleMapsUrl: "https://maps.google.com/?cid=3" },
    { id: "P4", name: "Smith & Sons (Roofing), Ltd. \"The Best\" \\ 1", googleMapsUrl: null },
    { id: "P7", name: "Deleted Once", googleMapsUrl: "https://maps.google.com/?cid=7" },
    { id: "PNEW", name: "Brand New Ltd", googleMapsUrl: "https://maps.google.com/?cid=100" },
  ];
  const db = fakeDb(LEADS, HISTORY);
  const res = await lookupCrmMatches(results, db.q);
  const idx = { leads: sortNewestFirst(res.leads), history: res.history };
  ok(!res.leads.some((r) => r.id === "L5"), "a lead that is not in the results is never fetched");
  const s = (i: number) => crmMatchFor(results[i], idx);
  ok(s(0)?.id === "L1" && s(0)?.status === "not_contacted" && s(0)?.next_action === "none", "an untouched lead in the CRM: matched, with the fields isFreshLead reads (Remove)");
  ok(s(1)?.id === "L2" && s(1)?.status === "contacted", "a worked lead: matched, status contacted (In CRM)");
  ok(s(2) === null && inOutreachFor(results[2].name, results[2].googleMapsUrl, idx), "an ARCHIVED lead: not 'In CRM' (active only, as before) but marked previously added");
  ok(s(3)?.id === "L4", "a name full of commas, brackets, dots, quotes and a backslash matches exactly (filter quoting)");
  ok(s(4) === null && inOutreachFor(results[4].name, results[4].googleMapsUrl, idx), "a business in outreach_history only (deleted lead): marked previously added");
  ok(s(5) === null && !inOutreachFor(results[5].name, results[5].googleMapsUrl, idx), "a NEW result is not marked");
  ok(res.requests === 2 && db.calls.length === 2, `6 results = 1 batch = 2 requests (got ${res.requests})`);
}

console.log("\n── the old match rules, row for row ──");
{
  const idx = { leads: sortNewestFirst(LEADS), history: HISTORY };
  ok(crmMatchFor({ id: "PX", name: "Other", googleMapsUrl: "https://maps.google.com/?cid=1" }, idx)?.id === "L1", "by Maps link");
  ok(crmMatchFor({ id: "PX", name: "Acme Plumbing", googleMapsUrl: null }, idx)?.id === "L1", "by name");
  ok(crmMatchFor({ id: "P1", name: "Renamed", googleMapsUrl: null }, idx)?.id === "L1", "by place id");
  ok(!inOutreachFor("Renamed", null, idx), "isInOutreach never matched on place id, and still does not");
  const twin: CrmMatchRow[] = [
    { id: "OLD", business_name: "Same Name", google_maps_url: null, is_archived: false, created_at: "2026-01-01T00:00:00Z" },
    { id: "NEW", business_name: "Same Name", google_maps_url: null, is_archived: false, created_at: "2026-06-01T00:00:00Z" },
  ];
  ok(crmMatchFor({ id: "", name: "Same Name" }, { leads: sortNewestFirst(twin), history: [] })?.id === "NEW", "two matches: the newest wins (the old list's order)");
  ok(!crmMatchSelect("sales").includes("notes") && crmMatchSelect("sales").includes("place_id") && crmMatchSelect("admin").includes("notes"),
    "a salesperson reads only what the safe view has");
}

console.log("\n── large result sets are batched ──");
{
  const many: ResultIdentity[] = Array.from({ length: 130 }, (_, i) => ({ id: `P${i}`, name: `Biz ${i}`, googleMapsUrl: `https://maps.google.com/?cid=${i}` }));
  const batches = matchBatches(many);
  ok(batches.length === Math.ceil(130 / CRM_MATCH_BATCH), `130 results → ${batches.length} batches of ≤ ${CRM_MATCH_BATCH}`);
  ok(batches.every((b) => b.placeIds.length <= CRM_MATCH_BATCH && b.names.length <= CRM_MATCH_BATCH), "no batch is larger than the limit");
  ok(batches.every((b) => leadOrFilter(b).length < 6000), "every request URL stays small");
  let inFlight = 0, peak = 0;
  const slow = async <T,>(v: T) => { inFlight++; peak = Math.max(peak, inFlight); await new Promise((r) => setTimeout(r, 5)); inFlight--; return v; };
  const res = await lookupCrmMatches(many, { leads: () => slow([]), history: () => slow([]) });
  ok(res.requests === batches.length * 2, `one lead + one history request per batch (${res.requests})`);
  ok(peak <= 4, `at most 2 batches (4 requests) in flight at once (peak ${peak})`);
  const dupes = matchBatches([{ id: "A", name: "X" }, { id: "A", name: "X" }, { id: "", name: "  " }]);
  ok(dupes.length === 1 && dupes[0].placeIds.length === 1 && dupes[0].names.length === 1, "duplicates are sent once; blank keys are never sent");
  ok(matchBatches([]).length === 0, "no results, no requests");
  ok(historyOrFilter({ placeIds: ["P"], mapsUrls: [], names: ["N"] }) === 'business_name.in.("N")', "history has no place id column, so none is sent");
  ok(quoteFilterValue('a"b\\c') === '"a\\"b\\\\c"', "quotes and backslashes are escaped");
}

console.log("\n── a failure is retried, then reported — never a silent empty answer ──");
{
  let n = 0;
  const flaky = await lookupCrmMatches([{ id: "P1", name: "Acme Plumbing" }], {
    leads: async () => { n++; if (n < 2) throw { code: "57014", message: "canceling statement due to statement timeout" }; return [LEADS[0]]; },
    history: async () => [],
  });
  ok(flaky.leads.length === 1 && n === 2, "a timed-out request is retried and the answer used");
  let threw = false;
  try { await lookupCrmMatches([{ id: "P1", name: "A" }], { leads: async () => { throw new Error("down"); }, history: async () => [] }, { retries: 1 }); } catch { threw = true; }
  ok(threw, "a request that keeps failing fails the lookup (the page keeps its markers and says so)");
}

console.log("\n── an add or removal on the page shows at once ──");
{
  const base = { leads: sortNewestFirst([LEADS[0]]), history: [{ business_name: "Acme Plumbing", google_maps_url: "https://maps.google.com/?cid=1" }] };
  const added: CrmMatchRow = { id: "N1", business_name: "Brand New Ltd", google_maps_url: "u100", place_id: "PNEW", is_archived: false, created_at: "2026-10-13T00:00:00Z", ...fresh };
  const after = withLocalChanges(base, [added], new Set());
  ok(crmMatchFor({ id: "PNEW", name: "Brand New Ltd", googleMapsUrl: "u100" }, after)?.id === "N1", "a just-added result is In CRM before any re-check (no duplicate add offered)");
  const gone = withLocalChanges(base, [], new Set(["L1"]));
  ok(crmMatchFor({ id: "P1", name: "Acme Plumbing" }, gone) === null && !inOutreachFor("Acme Plumbing", null, gone), "a removed lead is unmarked at once (and its history with it)");
}

console.log("\n── the page never loads the whole book ──");
{
  const index = norm("../src/pages/Index.tsx");
  const hook = norm("../src/hooks/useOutreach.ts");
  const crm = norm("../src/hooks/useFindLeadsCrm.ts");
  ok(/useOutreach\(\{ preload: false \}\)/.test(index), "Find Leads mounts useOutreach with preload: false");
  ok(!/crmLeads|leads: crm|isInOutreach[,\s]*\}\s*=\s*useOutreach/.test(index), "…and takes no lead list or in-memory isInOutreach from it");
  ok(/if \(!preload\) return; \/\/ Find Leads/.test(hook) && /if \(!preload\) \{ setIsLoading\(false\); return; \}/.test(hook), "preload: false downloads nothing on mount and fetchLeads does nothing");
  ok(/if \(!preload\) \{\s*const \{ data: byName[\s\S]{0,200}from\('outreach_history'\)/.test(hook), "addLead still refuses a business in outreach_history (asked in the database)");
  ok(/useFindLeadsCrm\(leads, viewerRole\)/.test(index) && /lookupCrmMatches\(identities/.test(crm), "the markers come from the targeted lookup");
  ok(/if \(row\) noteAdded\(args\[0\], row, args\[3\] \?\? null\)/.test(index), "every add on the page is marked the moment it answers");
  ok(/if \(res\.ok\) noteRemoved\(p\.id\)/.test(index), "a removal is unmarked the moment it answers");
  ok(!/fetchAllRows/.test(crm), "the lookup never pages through the table");
  ok(/addToOutreach\(lead, lastSearchCountry, 'no_website', activeCampaign,/.test(index), "Add to CRM call sites unchanged");
}

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log("\nALL PASS");
