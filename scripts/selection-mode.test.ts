/* ════════════════════════════════════════════════════════════════════════════════════════════════
   SELECT THIS PAGE vs SELECT ALL (2026-10-14, Paul). The mode is derived from the ticked ids
   (src/lib/selectionMode.ts); the bar (SelectionModeBar) sits on Outreach and Find Leads results and only
   changes the ticks — bulk actions keep reading the same selection, with every existing gate.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from "node:fs";
import { selectionModeOf, selectionModeText } from "../src/lib/selectionMode.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), "utf8").replace(/\r\n/g, "\n");

const page = ["a", "b", "c"];
const all = ["a", "b", "c", "d", "e"];
ok(selectionModeOf(new Set(), page, all) === "none", "nothing ticked = none");
ok(selectionModeOf(new Set(page), page, all) === "page", "exactly this page = page");
ok(selectionModeOf(new Set(all), page, all) === "all", "every matching row = all");
ok(selectionModeOf(new Set(["a", "b"]), page, all) === "custom", "part of the page = ticked by hand");
ok(selectionModeOf(new Set(["a", "b", "c", "d"]), page, all) === "custom", "the page plus another row = ticked by hand");
ok(selectionModeOf(new Set(["a", "b", "x"]), page, all) === "custom", "same count as the page but a different row = ticked by hand");
ok(selectionModeOf(new Set(page), page, page) === "all", "one page only: the page IS everything");
ok(/this page only/.test(selectionModeText("page", 15, 200)) && /all 200 matching, every page/.test(selectionModeText("all", 200, 200)), "the line names the mode");
ok(selectionModeText("custom", 1, 9) === "1 lead selected · ticked by hand", "singular wording");

const bar = read("src/components/SelectionModeBar.tsx");
ok(/onChange\(new Set\(pageIds\)\)/.test(bar) && /onChange\(new Set\(allIds\)\)/.test(bar), "Select this page REPLACES the ticks with this page; Select all ticks every matching row");
ok(!/supabase|rpc\(|invoke\(/.test(bar), "the bar never acts on a lead");

const ot = read("src/components/OutreachTable.tsx");
ok(/<SelectionModeBar[^>]*pageIds=\{pageLeadIds\} allIds=\{allLeadIds\} selected=\{selectedIds\}/.test(ot), "Outreach: the bar reads the scope-filtered selection");
ok(/allDisabled=\{!listComplete\}/.test(ot), "Outreach: Select all still waits for the whole list");
ok(/const pageLeadIds = paginatedLeads\.map/.test(ot) && /filteredAndSortedLeads\.map\(\(l\) => l\.id\)/.test(ot), "Outreach: this page = the rows showing; all = every filtered row");

const lt = read("src/components/LeadsTable.tsx");
ok(/<SelectionModeBar[^>]*pageIds=\{pagePoolIds\} allIds=\{selectAllIds\}/.test(lt), "Find Leads: the bar is wired");
ok(/paginatedLeads\.filter\(\(l\) => pool\.has\(l\.id\)\)/.test(lt), "Find Leads: this page uses the Select-all pool (no rows already in Outreach, no high-confidence agencies)");

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log("\nall passed");
