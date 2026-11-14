/* Outreach "Remove" ARCHIVES (Paul, 2026-11-14): it used to delete the lead rows, its notes and its History. */
import { readFileSync } from "node:fs";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

const src = readFileSync(new URL("../src/hooks/useOutreach.ts", import.meta.url), "utf8");
const start = src.indexOf("const deleteMultiple = useCallback(");
const body = src.slice(start, src.indexOf("}, []);", start));
ok(start > 0, "deleteMultiple (the Remove button) exists");
ok(!/\.delete\(\)/.test(body), "Remove never deletes rows");
ok(/leadRpc\('lead_set_archived', \{ _lead_id: id, _archived: true \}\)/.test(body), "Remove archives through lead_set_archived (History records archived_set)");
ok(/setArchivedLeads/.test(body) && /notifyLeadChanged/.test(body), "removed leads move to the Archived view and every reader is told");
ok(/refuseForSales\('Removing leads'\)/.test(body), "a salesperson is still refused");

const table = readFileSync(new URL("../src/components/OutreachTable.tsx", import.meta.url), "utf8");
ok(/title="Archives these leads: nothing is deleted, History is kept/.test(table), "the Remove button says what it does");

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log("\nall passed");
