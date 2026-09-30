/* The lead LIST downloads OUTREACH_LIST_COLUMNS, not '*' (2026-09-27, site-wide speed pass).
   This suite is the reason a field left out of that list cannot go quiet:
     1. every live column read by code that holds LIST rows is in the list (parser-based walk of the
        four useOutreach callers — casts, helper-local types and destructuring cannot hide a read);
     2. the exceptions to (1) are pinned to a column AND a file, each hand-checked, and go stale loudly;
     3. every caller of useOutreach is walked (a new caller cannot slip past);
     4. the detail dialog renders only from the complete row it reads by id;
     5. the list query really uses the list, and the dev guard really shouts. */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { columnReads } from "./lib/lead-field-reads.ts";
import { OUTREACH_LIST_COLUMNS, OUTREACH_LIST_SELECT, DASHBOARD_LEAD_COLUMNS, guardListRows, leadSourceFor, SALES_LIST_SELECT, SALES_DETAIL_SELECT } from "../src/lib/outreachLeadColumns.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const root = path.resolve(import.meta.dirname, "..");
const read = (p: string) => fs.readFileSync(path.join(root, p), "utf8");
const { columns: LIVE } = JSON.parse(read("scripts/fixtures/outreach-leads-columns.json")) as { columns: string[] };
const LIST = new Set<string>(OUTREACH_LIST_COLUMNS);

/* ── The files that hold LIST rows: every caller of useOutreach, and the hook itself. ─────────── */
const ENTRIES = [
  "src/hooks/useOutreach.ts",
  "src/pages/Outreach.tsx",
  "src/pages/Index.tsx",
  "src/components/NichePanel.tsx",
  "src/components/LeadDetailFromInbox.tsx",
];
/* The dialog reads its own complete row (useFullLeadRow) — the walk stops there. The column lists
   themselves are declarations (every string in them is a column name), not reads. */
const COLUMN_LISTS = "src/lib/outreachLeadColumns.ts";
/* The row audit popup (2026-09-28) takes only id + business_name off the list row; the panel inside it
   reads its own row by id (useLeadCrmRow), exactly as the detail dialog does — the walk stops there. */
const STOP_AT = ["src/components/LeadDetailDialog.tsx", "src/components/HookAuditDialog.tsx", COLUMN_LISTS];

/* ── Hand-checked 2026-09-27: these files NAME the column, but never read it off a list row. ──────
   Pinned per FILE: the same column read in any other file still fails. */
const NOT_A_LIST_READ: Record<string, { files: string[]; why: string }> = {
  rating: { files: ["src/hooks/useOutreach.ts", "src/lib/auditReport.ts", "supabase/functions/_shared/place-details.ts", "src/lib/salesAddPayload.ts"], why: "written from Place Details; `lead.rating` in addLead is the SEARCH result; auditReport/place-details are other objects; salesAddPayload maps a SEARCH result + Place Details into the sales add" },
  review_count: { files: ["src/hooks/useOutreach.ts"], why: "written from Place Details; named in HAND_MIGRATED_LEAD_COLS" },
  contact_name: { files: ["src/lib/leadRpc.ts", "src/lib/salesPatchPlan.ts", "src/lib/coldCallPlaybook.ts"], why: "a PATCH key a salesperson's edit may carry, sent to lead_set_details — never read off a list row; coldCallPlaybook: the LinkedIn/email greeting reads the playbook's OWN lead row (useColdCallPlaybook LEAD_COLUMNS selects contact_name by id), never a list row (2026-09-30)" },
  next_action_note: { files: ["src/lib/leadRpc.ts", "src/lib/nextActionView.ts"], why: "nextActionView: the Next Action pill reads a note when the row carries one (the popup's CRM row, the Inbox, Focus) and shows none on a list row, which does not download it (2026-09-29); leadRpc: read from sales_leads by id before a follow-up write (so the note is not wiped) — not a list row" },
  whatsapp_checked_at: { files: ["src/lib/salesPatchPlan.ts"], why: "a server-written PATCH key the sales translator accepts as a no-op" },
  town_fetched_at: { files: ["src/hooks/useOutreach.ts"], why: "written from Place Details; named in HAND_MIGRATED_LEAD_COLS" },
  email_status: { files: ["src/hooks/useOutreach.ts"], why: "addLead carryKeys — copied FROM search enrichment onto the insert" },
  email_method: { files: ["src/hooks/useOutreach.ts"], why: "addLead carryKeys" },
  facebook_status: { files: ["src/hooks/useOutreach.ts"], why: "addLead carryKeys" },
  facebook_method: { files: ["src/hooks/useOutreach.ts"], why: "addLead carryKeys" },
  facebook_last_checked_at: { files: ["src/hooks/useOutreach.ts"], why: "addLead carryKeys" },
  instagram_status: { files: ["src/hooks/useOutreach.ts"], why: "addLead carryKeys" },
  instagram_method: { files: ["src/hooks/useOutreach.ts"], why: "addLead carryKeys" },
  instagram_last_checked_at: { files: ["src/hooks/useOutreach.ts"], why: "addLead carryKeys" },
  enrichment_source: { files: ["src/hooks/useOutreach.ts"], why: "addLead carryKeys" },
  user_id: { files: ["src/hooks/useOutreach.ts", "src/hooks/useSalesCrm.ts", "src/hooks/useSubscription.tsx", "src/components/BulkAssignSelect.tsx"], why: "`.eq('user_id', …)` filters and team members' user_id — never a lead's" },
  updated_at: { files: ["src/hooks/useOutreach.ts", "src/components/TemplatePicker.tsx", "src/hooks/useBulkJobs.ts"], why: "`.order('updated_at')` strings and other tables' rows" },
  website_build: { files: ["src/lib/fullCrawl.ts"], why: "the crawl request-source constant 'website_build'" },
  call_booked_at: { files: ["src/lib/salesCrm.ts"], why: "read off SALES rows (sales_leads view); Find Leads imports salesCrm only for refusalText" },
  lead_source: { files: ["src/lib/salesPerformance.ts"], why: "the Sales Dashboard fold's own rows, read on the server by sales-performance; Outreach imports it only for LEAD_SOURCE_LABELS (2026-09-28)" },
  sold_by_user_id: { files: ["src/lib/salesPerformance.ts"], why: "the same fold: who made the sale, read on the server by sales-performance (2026-09-28)" },
};

// 1–2. Every column the list-side code reads is downloaded, or is a pinned, hand-checked exception.
const { files, reads } = columnReads(root, ENTRIES, STOP_AT, LIVE);
ok(files.length > 100, `the walk reached ${files.length} files (an empty walk is a broken scanner)`);
for (const [col, readers] of [...reads.entries()].sort()) {
  if (LIST.has(col)) continue;
  const ex = NOT_A_LIST_READ[col];
  const unexplained = readers.filter((r) => !ex?.files.includes(r));
  ok(unexplained.length === 0, unexplained.length === 0
    ? `${col}: named only where hand-checked (${readers.join(", ")})`
    : `${col} is READ by list code but NOT downloaded — add it to OUTREACH_LIST_COLUMNS: ${unexplained.join(", ")}`);
}
for (const [col, ex] of Object.entries(NOT_A_LIST_READ)) {
  const now = reads.get(col) ?? [];
  const stale = ex.files.filter((file) => !now.includes(file));
  ok(stale.length === 0, stale.length === 0 ? `exception ${col} still needed` : `exception ${col} is stale for ${stale.join(", ")} — remove it`);
}
// The known reads the earlier (type-checker-only) audit MISSED must be caught by this one.
for (const col of ["place_id", "instantly_pushed_at", "derived_town", "town_fetch_note", "whatsapp_message_id", "previous_status", "email_last_checked_at"]) {
  ok(reads.has(col) && LIST.has(col), `${col}: found by the walk and downloaded`);
}

// The list columns are real, live columns, listed once.
for (const col of OUTREACH_LIST_COLUMNS) ok(LIVE.includes(col), `${col} is a live outreach_leads column`);
ok(LIST.size === OUTREACH_LIST_COLUMNS.length, "no column listed twice");
ok(OUTREACH_LIST_SELECT === OUTREACH_LIST_COLUMNS.join(", ") && !OUTREACH_LIST_SELECT.includes("*"), "the select string is the list, not '*'");

// The fixture is current: every field the OutreachLead type declares is a live column in it.
{
  const src = read("src/types/outreach.ts");
  const sf = ts.createSourceFile("outreach.ts", src, ts.ScriptTarget.Latest, true);
  let declared: string[] = [];
  sf.forEachChild((n) => { if (ts.isInterfaceDeclaration(n) && n.name.text === "OutreachLead") declared = n.members.map((m) => (m.name && ts.isIdentifier(m.name) ? m.name.text : "")).filter(Boolean); });
  const missing = declared.filter((d) => !LIVE.includes(d));
  ok(declared.length > 50 && missing.length === 0, missing.length ? `OutreachLead declares ${missing.join(", ")} which the column fixture lacks — refresh scripts/fixtures/outreach-leads-columns.json` : `fixture covers all ${declared.length} OutreachLead fields`);
}

// 3. Every caller of useOutreach is walked.
{
  const walk = (d: string): string[] => fs.readdirSync(path.join(root, d), { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(`${d}/${e.name}`) : /\.tsx?$/.test(e.name) ? [`${d}/${e.name}`] : []);
  const callers = walk("src").filter((p) => p !== "src/hooks/useOutreach.ts" && /\buseOutreach\(/.test(read(p)));
  const unwalked = callers.filter((c) => !ENTRIES.includes(c));
  ok(callers.length >= 4 && unwalked.length === 0, unwalked.length ? `useOutreach() is called in ${unwalked.join(", ")} — add it to ENTRIES` : `all ${callers.length} callers of useOutreach are walked`);
  // A caller that opts out of the history must not use its two readers.
  for (const c of callers) {
    const src = read(c);
    if (!/useOutreach\(\{\s*history:\s*false\s*\}\)/.test(src)) continue;
    ok(!/\baddLead\b|\bisInOutreach\b/.test(src), `${c} opts out of outreach_history and uses neither addLead nor isInOutreach`);
  }
}

// The Dashboard's leads: every column its code reads is downloaded; the dead reads stay gone.
{
  const DASH = new Set<string>(DASHBOARD_LEAD_COLUMNS);
  /* 2026-09-29: the Dashboard also draws the Sales dashboard's panels. Those read the sales-performance
     response and the team directory (server-folded rows), never the Dashboard's lead list — so the walk
     stops at them, as it stops at the column lists. */
  const SALES_SURFACES = ["src/components/salesDash/sections.tsx", "src/components/salesDash/ui.tsx", "src/lib/salesWorkspace.ts", "src/lib/salesLinks.ts", "src/hooks/useSalesCrm.ts"];
  const d = columnReads(root, ["src/pages/Dashboard.tsx", "src/hooks/useDashboardMetrics.ts"], [COLUMN_LISTS, ...SALES_SURFACES], LIVE);
  ok(d.files.length > 50, `the Dashboard walk reached ${d.files.length} files`);
  const missing = [...d.reads.keys()].filter((c) => !DASH.has(c));
  ok(missing.length === 0, missing.length ? `Dashboard code reads ${missing.map((c) => `${c} (${d.reads.get(c)!.join(", ")})`).join("; ")} — add to DASHBOARD_LEAD_COLUMNS` : `all ${d.reads.size} lead columns the Dashboard reads are downloaded`);
  for (const col of DASHBOARD_LEAD_COLUMNS) ok(LIVE.includes(col), `dashboard column ${col} is live`);
  ok(DASH.has("delivery_checklist"), "delivery_checklist is downloaded (the client card's checklist is read-modify-write)");
  const src = read("src/hooks/useDashboardMetrics.ts");
  ok(/\.select\(DASHBOARD_LEAD_SELECT\)/.test(src) && !/from\('outreach_leads'\)\.select\('\*'\)/.test(src), "the Dashboard leads read selects DASHBOARD_LEAD_SELECT");
  for (const dead of ["copied_phones", "outreach_activities", "lead_contacts", "search_history", "outreach_events"]) ok(!src.includes(`from('${dead}')`), `the Dashboard no longer reads ${dead} (its numbers were never shown)`);
  ok(!/\bfetchAllRows</.test(src), "every Dashboard list is paged in parallel");
}

// The Coverage niche panel downloads the lead list ONCE, not once per town row.
{
  const src = read("src/components/NichePanel.tsx");
  const row = src.slice(src.indexOf("function TownRow("), src.indexOf("export default function NichePanel("));
  ok(row.length > 100 && !/useOutreach\(/.test(row), "TownRow has no useOutreach of its own");
  ok((src.match(/useOutreach\(/g) ?? []).length === 1, "NichePanel mounts exactly one useOutreach");
}

// 4. The detail dialog renders only from the complete row.
{
  const src = read("src/components/LeadDetailDialog.tsx");
  ok(/export function useFullLeadRow\(/.test(src) && /const src = leadSourceFor\(role\);/.test(src) && /\.from\(src\.table\)\.select\(src\.detailSelect\)\.eq\('id', id\)/.test(src), "useFullLeadRow reads the complete row by id, from the caller's own source");
  ok(leadSourceFor("admin").table === "outreach_leads" && leadSourceFor("admin").detailSelect === "*", "…the admin's is the whole table row, as before");
  ok(leadSourceFor("sales").table === "sales_leads" && leadSourceFor("sales").detailSelect === SALES_DETAIL_SELECT && !SALES_DETAIL_SELECT.includes("*"), "…a salesperson's is the safe view's named columns");
  ok(/const \{ row: fullLead, error: fullLeadError \} = useFullLeadRow\(lead, open\);/.test(src), "the dialog asks for the complete row");
  ok(/lead=\{fullLead\}/.test(src) && !/<LeadDetailBody[\s\S]{0,80}lead=\{lead\}/.test(src), "the body is only ever given the complete row");
  ok(/\{ \.\.\.fetched\.row, \.\.\.lead \}/.test(src), "the live list row is laid over the fetched row (its edits win)");
}

// 5. The list query uses the list; the dev guard names an undownloaded field.
{
  const src = read("src/hooks/useOutreach.ts");
  const fetchLeads = src.slice(src.indexOf("const fetchLeads = useCallback"), src.indexOf("const fetchOutreachHistory"));
  ok((fetchLeads.match(/\.from\(src\.table\)\.select\(src\.listSelect\)/g) ?? []).length === 2 && /const src = leadSourceFor\(roleRef\.current\);/.test(fetchLeads) && !/select\('\*'\)/.test(fetchLeads), "active and archived leads both select the role's LIST columns");
  ok(leadSourceFor("admin").listSelect === OUTREACH_LIST_SELECT && leadSourceFor(null).listSelect === OUTREACH_LIST_SELECT, "…the admin's list is OUTREACH_LIST_SELECT, unchanged");
  ok(leadSourceFor("sales").listSelect === SALES_LIST_SELECT && !SALES_LIST_SELECT.includes("*") && SALES_LIST_SELECT.split(", ").every((c) => LIST.has(c)), "…a salesperson's is the same list, cut to the safe view (never '*')");
  ok((fetchLeads.match(/guardListRows\(/g) ?? []).length === 2, "both lists pass through the dev guard");

  const errors: string[] = [];
  const orig = console.error;
  console.error = (...a: unknown[]) => { errors.push(a.map(String).join(" ")); };
  const [row] = guardListRows([{ id: "x", status: "new" } as Record<string, unknown>], "test", true);
  void row.status; void row.then; void row.delivery_checklist; void row.delivery_checklist;
  console.error = orig;
  ok(errors.length === 1 && errors[0].includes('"delivery_checklist"'), `dev guard: reading an undownloaded field logs once, naming it (${errors.length})`);
  const plain = [{ id: "y" }];
  ok(guardListRows(plain, "test", false) === plain, "production: rows returned untouched, no Proxy");
}

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log("\nALL PASS");
