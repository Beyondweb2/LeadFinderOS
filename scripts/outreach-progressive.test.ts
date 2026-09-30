/* Outreach progressive loading (Paul, 2026-09-28; src/lib/outreachLoad.ts). The first 1,000, the
   background completion, the wording, the gates, both roles, edits during the load, and a failed load
   that never pretends to be complete. Run: npx tsx scripts/outreach-progressive.test.ts */
import { readFileSync } from "node:fs";
import {
  OUTREACH_FIRST_BATCH, LEAD_LOAD_INITIAL, LEAD_LOAD_COMPLETE, datasetComplete, leadLoadNotice,
  leadCountLabel, partialResultsSuffix, mergeAfterBackgroundLoad, visibleWhileLoading, type LeadLoadState,
} from "../src/lib/outreachLoad.ts";
import { fetchAllRows, fetchPagesAfterFirst } from "../src/lib/fetchAllRows.ts";
import { OUTREACH_LIST_COLUMNS, SALES_LIST_COLUMNS, SALES_VIEW_COLUMNS, leadSourceFor } from "../src/lib/outreachLeadColumns.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const norm = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

console.log("── the first batch ──");
ok(OUTREACH_FIRST_BATCH === 1000, "first batch is 1,000");
const hook = norm("../src/hooks/useOutreach.ts");
ok(/select\(src\.listSelect, \{ count: 'exact' \}\)\.eq\('is_archived', false\)/.test(hook), "page 0 reads the role's list shape WITH the exact count, same filter");
ok(/\.range\(0, OUTREACH_FIRST_BATCH - 1\)/.test(hook), "page 0 is rows 0..999");
ok(!/select\(\s*['"]\*['"]/.test(hook.slice(hook.indexOf("const loadRemainingLeads"), hook.indexOf("const fetchLeads = useCallback"))),
  "the progressive path never selects *");
ok(/order\('created_at', \{ ascending: false \}\)\.order\('id', \{ ascending: true \}\)\.range\(from, to\)/.test(hook),
  "the background pages use the SAME order as page 0 (newest first, id tiebreak)");
const callers = ["../src/pages/Outreach.tsx"].map(norm);
ok(/useOutreach\(\{ history: false, progressive: true \}\)/.test(callers[0]), "Outreach opts in");
for (const p of ["../src/pages/Dashboard.tsx", "../src/pages/Inbox.tsx", "../src/pages/Coverage.tsx"]) {
  try { ok(!/progressive: true/.test(norm(p)), `${p.split("/").pop()} does not opt in (loads whole, as before)`); } catch { /* page absent */ }
}

console.log("── wording while incomplete ──");
const partial: LeadLoadState = { phase: "partial", loaded: 1000, total: 5222, error: null };
const n1 = leadLoadNotice(partial);
ok(n1?.tone === "info" && n1.text.startsWith("Showing results so far from the newest 1,000 leads"), `partial notice: "${n1?.text.slice(0, 60)}…"`);
ok(/4,222/.test(n1!.text) && /unlock when it finishes/.test(n1!.text), "names the remaining count and that things unlock");
ok(leadCountLabel(partial, 1000) === "1,000 of 5,222 active, loading", "title count: active loaded of active total, loading");
ok(partialResultsSuffix(partial) === " — partial results: 1,000 of 5,222 active leads loaded so far", "pager/search carry the same active-of-active partial wording");
ok(leadLoadNotice(LEAD_LOAD_INITIAL) === null, "no notice before anything has shown (the page spinner covers it)");

console.log("── completeness gate: positive match only ──");
for (const ph of ["loading", "partial", "failed", "weird", undefined] as const) {
  ok(!datasetComplete(ph === undefined ? undefined : { phase: ph as LeadLoadState["phase"], loaded: 1, total: 2, error: null }), `phase ${String(ph)} is NOT complete`);
}
ok(datasetComplete(LEAD_LOAD_COMPLETE(5222)), "complete is complete");
ok(leadLoadNotice(LEAD_LOAD_COMPLETE(5222)) === null && partialResultsSuffix(LEAD_LOAD_COMPLETE(5222)) === "" && leadCountLabel(LEAD_LOAD_COMPLETE(5222), 5222) === "5,222",
  "once complete: no notice, no suffix, plain count");

const table = norm("../src/components/OutreachTable.tsx");
ok(/<fieldset disabled=\{!listComplete\} data-testid="outreach-bulk-toolbar"/.test(table), "the whole bulk toolbar sits in a fieldset disabled until complete");
const fsOpen = table.indexOf('data-testid="outreach-bulk-toolbar"'), fsClose = table.indexOf("</fieldset>", fsOpen);
const toolbar = table.slice(fsOpen, fsClose);
for (const needle of ["exportToCsv", "Import", "handleBulkRunAudit"]) {
  ok(toolbar.includes(needle), `${needle} is inside the disabled toolbar`);
}
ok(/disabled={!listComplete || !queueTemplate/.test(table), "the WhatsApp queue dialog's send button (bulk WhatsApp and the Sales opener) is off while incomplete");
for (const h of ["handleSelectAll", "handleBulkRunAudit", "confirmBulkAudit", "handleQueueForWhatsApp", "handleSalesQueue", "handleArchiveSelected",
  "handleDeleteSelected", "exportToCsv", "copySelectedPhones", "handleMarkAsContacted", "handleSelectAllWithEmail", "confirmSetTrade"]) {
  const at = table.indexOf(`const ${h} = `);
  ok(at > 0 && /\{\n    if \(needsFullList\(\)\) return;/.test(table.slice(at, at + 200)), `${h} refuses on its own while incomplete`);
}
ok(/onCheckedChange=\{handleSelectAll\}\n\s+disabled=\{!listComplete\}/.test(table), "select-all checkbox disabled while incomplete");
ok(/if \(listComplete\) result = result\.filter\(\(lead\) => isPaidLead\(lead\)\)/.test(table), "Paid filter never applied to a partial list");
ok(/disabled=\{!listComplete && isPaidFilterValue\(opt\.value\)\}/.test(table), "Paid option cannot be chosen while incomplete");
ok(/if \(sharedPhoneOnly && listComplete\)/.test(table) && /Shares a phone \(\{listComplete \? sharedPhoneIds\.size : /.test(table),
  "shared-phone filter and count wait for the whole list");
ok(/\{filteredAndSortedLeads\.length\}\{partialResultsSuffix\(loadState\)\}/.test(table), "pagination line carries the partial wording");
ok(/const loadState = leadLoad \?\? LEAD_LOAD_COMPLETE\(leads\.length\)/.test(table), "other OutreachTable callers (no leadLoad) behave as complete — unchanged");

console.log("── partial counts never mix in archived (Paul, 2026-09-28) ──");
{
  type A = { id: string; is_archived?: boolean | null };
  const active: A[] = Array.from({ length: 1000 }, (_, i) => ({ id: `a${i}`, is_archived: false }));
  const archived: A[] = Array.from({ length: 116 }, (_, i) => ({ id: `z${i}`, is_archived: true }));
  const st: LeadLoadState = { phase: "partial", loaded: 1000, total: 5370, error: null };
  const shown = visibleWhileLoading(st, [...active, ...archived]);
  ok(shown.length === 1000, `partial: the table holds 1,000 visible rows, not 1,116 (${shown.length})`);
  ok(leadCountLabel(st, 1000) === "1,000 of 5,370 active, loading" && partialResultsSuffix(st).includes("1,000 of 5,370 active"),
    "title and pager name the SAME numbers");
  ok(visibleWhileLoading({ ...st, phase: "failed" }, [...active, ...archived]).length === 1000, "failed: still active only");
  ok(visibleWhileLoading(st, [...active, ...archived], true).length === 1116, "the archive view itself is never filtered");
  const done = LEAD_LOAD_COMPLETE(1116);
  ok(visibleWhileLoading(done, [...active, ...archived]).length === 1116 && leadCountLabel(done, 1116) === "1,116" && partialResultsSuffix(done) === "",
    "complete: archived back in, normal counts, no suffix");
  ok(/let result = visibleWhileLoading\(loadState, \[\.\.\.leadsWithOptimistic\], isArchiveView\)/.test(table), "OutreachTable's list starts from visibleWhileLoading");
}

console.log("── background completion (fetchPagesAfterFirst = the full sequential read) ──");
type Row = { id: string };
const rows = (k: number): Row[] => Array.from({ length: k }, (_, i) => ({ id: `r${String(i).padStart(5, "0")}` }));
const server = (all: Row[], cap = 1000, fail?: number) => (from: number, to: number) => {
  if (fail != null && from >= fail) return Promise.resolve({ data: null, error: { message: "boom" } });
  return Promise.resolve({ data: all.slice(from, Math.min(to, from + cap - 1) + 1), error: null });
};
const ids = (r: Row[]) => r.map((x) => x.id).join(",");
for (const [k, cap] of [[1000, 1000], [1001, 1000], [5222, 1000], [12000, 1000], [3000, 500], [1999, 1000]] as const) {
  const all = rows(k);
  const seq = (await fetchAllRows<Row>("seq", server(all, cap))).rows;
  const first = all.slice(0, Math.min(1000, cap));
  const got = await fetchPagesAfterFirst<Row>(server(all, cap), (r) => r.id, first, k);
  ok(ids(got) === ids(seq), `${k} rows (cap ${cap}): first batch + background = full read (${got.length})`);
}
{ // the list grew between the count and the pages: still reads to the end
  const all = rows(2600);
  const got = await fetchPagesAfterFirst<Row>(server(all), (r) => r.id, all.slice(0, 1000), 2400);
  ok(got.length === 2600, `grew past the count: ${got.length} of 2,600`);
}
{ // a page fails → throws, never a quietly short list
  let threw = false;
  try { await fetchPagesAfterFirst<Row>(server(rows(5222), 1000, 3000), (r) => r.id, rows(1000), 5222); } catch { threw = true; }
  ok(threw, "a failed background page throws (the hook turns it into phase 'failed')");
}
ok((await fetchPagesAfterFirst<Row>(server(rows(400)), (r) => r.id, rows(400), 400)).length === 400, "under 1,000 with a matching count: no further request needed");

console.log("── a failed background load ──");
ok(/setLeadLoad\(\(s\) => \(\{ phase: 'failed', loaded: latestRef\.current\.active\.length/.test(hook), "the hook records 'failed', never complete, on a background error");
const failed: LeadLoadState = { phase: "failed", loaded: 1000, total: 5222, error: "boom" };
const nf = leadLoadNotice(failed)!;
ok(nf.tone === "error" && /remaining 4,222 leads failed to load/.test(nf.text) && /newest 1,000 leads only/.test(nf.text), "failure says so plainly");
ok(!datasetComplete(failed) && leadCountLabel(failed, 1000) === "1,000 of 5,222 active, incomplete", "failure stays incomplete — gates stay shut");
const page = norm("../src/pages/Outreach.tsx");
ok(/loadNotice\.tone === 'error' && \([\s\S]{0,200}retryLeadLoad\(\)[\s\S]{0,40}Retry/.test(page), "the error notice offers Retry");

console.log("── Admin and Sales ──");
ok(leadSourceFor("admin").table === "outreach_leads" && leadSourceFor("admin").listSelect.split(", ").length === OUTREACH_LIST_COLUMNS.length,
  `admin: outreach_leads, the ${OUTREACH_LIST_COLUMNS.length}-column list`);
/* 41 → 45 on 2026-09-30: the canonical LinkedIn link + the three social statuses (the Socials line on every row);
   → 46 the same day: call_booked_at, for the row's Meeting line (lead state model). */
ok(OUTREACH_LIST_COLUMNS.length === 46, "admin list is 46 columns");
const sales = leadSourceFor("sales");
ok(sales.table === "sales_leads", "sales: the safe sales_leads view (their own assigned prospects; the view decides)");
const salesView = new Set<string>(SALES_VIEW_COLUMNS);
ok(sales.listSelect.split(", ").every((c) => salesView.has(c)), "sales list asks ONLY for columns the safe view exposes");
const adminOnly = OUTREACH_LIST_COLUMNS.filter((c) => !salesView.has(c));
ok(adminOnly.length > 0 && adminOnly.every((c) => !(SALES_LIST_COLUMNS as readonly string[]).includes(c)), `admin-only fields never in the sales list (${adminOnly.join(", ")})`);
ok(leadSourceFor(null).table === "sales_leads" || leadSourceFor(null).table === "outreach_leads", "unknown role resolves somewhere defined");
ok(!/sales_leads|outreach_leads/.test(hook.slice(hook.indexOf("const progressiveLoad"), hook.indexOf("const retryLeadLoad"))),
  "progressive load names no table — it goes through leadSourceFor(role), so Sales cannot be widened here");

console.log("── edits during the load survive the merge ──");
type L = { id: string; v: string };
const mk = (id: string, v = "orig"): L => ({ id, v });
const a1 = mk("a1"), a2 = mk("a2"), a3 = mk("a3"), r1 = mk("r1");
const shownActive = [a1, a2, a3], shownArchived = [r1];
const edited = { ...a1, v: "edited" };           // edited in place
const moved = { ...a2, v: "archived" };          // archived during the load
const added = mk("new", "added");                // added during the load
const merged = mergeAfterBackgroundLoad<L>({
  shownActive, shownArchived,
  localActive: [added, edited, /* a2 moved */ /* a3 deleted */], localArchived: [moved, r1],
  fetchedActive: [mk("a1", "server"), mk("a2", "server"), mk("a3", "server"), mk("b1", "server"), mk("b2", "server")],
  fetchedArchived: shownArchived,
});
ok(merged.active.map((r) => `${r.id}:${r.v}`).join(",") === "new:added,a1:edited,b1:server,b2:server",
  `active: added first, edit kept, archived row gone, deleted row not resurrected, background rows in (${merged.active.map((r) => r.id).join(",")})`);
ok(merged.archived.map((r) => `${r.id}:${r.v}`).join(",") === "a2:archived,r1:orig", "archived: the move lands, untouched archived kept");
const untouched = mergeAfterBackgroundLoad<L>({ shownActive, shownArchived, localActive: shownActive, localArchived: shownArchived,
  fetchedActive: [mk("a1", "fresh"), a2, a3, mk("b1")], fetchedArchived: shownArchived });
ok(untouched.active[0].v === "fresh" && untouched.active.length === 4, "untouched rows take the fetched copy");

console.log(f === 0 ? "\nALL PASS" : `\n${f} FAILED`);
if (f > 0) process.exit(1);
