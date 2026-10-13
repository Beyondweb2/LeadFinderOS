/* Find Leads "Error loading leads [object Object]" (2026-10-13; src/lib/leadLoadError.ts).
   The failure (a supabase-js plain-object error from the 8 s statement timeout), the readable message, the
   page retry that stops one slow page sinking the list, an add made during the load surviving it, and one
   add per business at a time. Run: npx tsx scripts/lead-load-error.test.ts */
import { readFileSync } from "node:fs";
import { errorMessageOf, leadLoadErrorKind, leadLoadErrorText, addInFlightKey } from "../src/lib/leadLoadError.ts";
import { fetchAllRowsParallel } from "../src/lib/fetchAllRows.ts";
import { mergeAfterBackgroundLoad } from "../src/lib/outreachLoad.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };
const norm = (p: string) => readFileSync(new URL(p, import.meta.url), "utf8").replace(/\r\n/g, "\n");

/* What PostgREST hands back when a page passes the statement timeout — a plain object, not an Error. */
const TIMEOUT = { code: "57014", details: null, hint: null, message: "canceling statement due to statement timeout" };

console.log("── the message is never [object Object] ──");
ok(String(TIMEOUT) === "[object Object]", "the old String(reason) really did print [object Object] (the bug)");
ok(errorMessageOf(TIMEOUT) === "canceling statement due to statement timeout", "a plain-object error gives its message");
ok(errorMessageOf(new Error("boom")) === "boom", "an Error gives its message");
ok(errorMessageOf("plain") === "plain", "a string is itself");
ok(errorMessageOf({ code: "PGRST000" }) === "Error PGRST000", "code only → 'Error <code>'");
ok(errorMessageOf({}) !== "[object Object]" && errorMessageOf({}).length > 0, "an empty object is still words");
ok(errorMessageOf(null) === "Unknown error" && errorMessageOf(undefined) === "Unknown error", "null / undefined → Unknown error");
const circ: Record<string, unknown> = {}; circ.self = circ;
ok(!errorMessageOf(circ).includes("[object Object]"), "a circular object never prints [object Object]");

console.log("── the readable toast ──");
ok(leadLoadErrorKind(TIMEOUT) === "timeout", "57014 is a timeout");
ok(leadLoadErrorKind({ message: "upstream_timeout" }) === "timeout", "upstream_timeout is a timeout");
ok(leadLoadErrorKind(new TypeError("Failed to fetch")) === "network", "Failed to fetch is the network");
ok(leadLoadErrorKind({ code: "PGRST301", message: "JWT expired" }) === "signed_out", "an expired JWT is signed out");
ok(leadLoadErrorKind({ message: "something else" }) === "other", "anything else is other");
for (const e of [TIMEOUT, new TypeError("Failed to fetch"), { code: "PGRST301" }, { weird: 1 }, null]) {
  const t = leadLoadErrorText(e);
  ok(!/\[object Object\]/.test(t.title + t.description), `no [object Object] for ${JSON.stringify(e)}`);
  ok(/reload|sign in/i.test(t.description), `says what to do for ${JSON.stringify(e)}`);
  ok(t.title !== "Error loading leads", "the title says what failed in words, not the old bare label");
}
ok(/database was busy/i.test(leadLoadErrorText(TIMEOUT).description), "the timeout says the database was busy");
ok(/search results are fine/i.test(leadLoadErrorText(TIMEOUT).description), "the timeout reassures the search is untouched");
ok(leadLoadErrorText({ message: "odd" }).description.includes("odd"), "an unknown failure quotes the real error");

console.log("── one slow page no longer fails the whole list ──");
{
  // 2,500 rows in pages of 1,000; page 1 times out once, then answers.
  const ROWS = Array.from({ length: 2500 }, (_, i) => ({ id: `r${i}` }));
  const tries = new Map<number, number>();
  const build = (from: number, to: number) => {
    const n = (tries.get(from) ?? 0) + 1; tries.set(from, n);
    if (from === 1000 && n === 1) return Promise.resolve({ data: null, error: TIMEOUT });
    return Promise.resolve({ data: ROWS.slice(from, to + 1), error: null });
  };
  const r = await fetchAllRowsParallel<{ id: string }>("test-retry-" + Date.now(), build, (x) => x.id);
  ok(r.rows.length === 2500, "a page that times out once is retried and the list completes (2,500 rows)");
  ok(tries.get(1000) === 2, "the slow page was asked twice");
}
{
  // Page 0 itself stalls once — the first page is retried too.
  let first = 0;
  const build = (from: number, to: number) => {
    if (from === 0 && ++first === 1) return Promise.resolve({ data: null, error: TIMEOUT });
    return Promise.resolve({ data: Array.from({ length: Math.max(0, Math.min(to, 9) - from + 1) }, (_, i) => ({ id: `p${from + i}` })), error: null });
  };
  const r = await fetchAllRowsParallel<{ id: string }>("test-first-" + Date.now(), build, (x) => x.id);
  ok(r.rows.length === 10, "page 0 timing out once is retried too");
}
{
  // A page that keeps failing still throws — a partial list is never complete — and the thrown value reads.
  const build = () => Promise.resolve({ data: null, error: TIMEOUT });
  let thrown: unknown = null;
  try { await fetchAllRowsParallel<{ id: string }>("test-fail-" + Date.now(), build, (x) => x.id); } catch (e) { thrown = e; }
  ok(thrown === TIMEOUT, "a page that keeps failing throws the real error");
  ok(leadLoadErrorKind(thrown) === "timeout" && !leadLoadErrorText(thrown).description.includes("[object Object]"),
    "…and the toast built from it is readable");
}

console.log("── an Add to CRM during the load survives the load ──");
{
  const old = { id: "old" }, added = { id: "new" };
  // The load started with nothing on screen; the add landed while it ran; the fetch predates the insert.
  const m = mergeAfterBackgroundLoad({
    shownActive: [], shownArchived: [], localActive: [added], localArchived: [],
    fetchedActive: [old], fetchedArchived: [],
  });
  ok(m.active.map((r) => r.id).join(",") === "new,old", "the lead added during the load is kept, first");
  const m2 = mergeAfterBackgroundLoad({
    shownActive: [old], shownArchived: [], localActive: [added, old], localArchived: [],
    fetchedActive: [added, old], fetchedArchived: [],
  });
  ok(m2.active.map((r) => r.id).join(",") === "new,old", "once the fetch has it too, it appears once (no duplicate row)");
}
const hook = norm("../src/hooks/useOutreach.ts");
const fetchLeads = hook.slice(hook.indexOf("const fetchLeads = useCallback"), hook.indexOf("const fetchOutreachHistory"));
ok(/const shownAtStart = latestRef\.current;/.test(fetchLeads), "the whole-list load remembers what was on screen when it started");
ok(/mergeAfterBackgroundLoad\(\{/.test(fetchLeads) && !/setLeads\(\(activeData/.test(fetchLeads),
  "…and merges, never overwrites the list with the stale result");
ok(!/String\(act\.reason\)|String\(arc\.reason\)/.test(hook), "no String(reason) left on the load path");
ok(!/'Error loading leads'/.test(hook), "the bare 'Error loading leads' toast is gone");
ok((hook.match(/leadLoadErrorText\(/g) ?? []).length >= 2, "both load paths toast through leadLoadErrorText");
ok(/latestRef\.current = \{ \.\.\.latestRef\.current, active: \[newLead, \.\.\.latestRef\.current\.active\] \}/.test(hook),
  "an admin add is visible to a load that lands before the next render");

console.log("── one add per business at a time ──");
ok(addInFlightKey({ id: "ChIJ1", name: "A" }) === addInFlightKey({ id: "ChIJ1", name: "B" }), "the place id is the key");
ok(addInFlightKey({ id: "", googleMapsUrl: "u", name: "A" }) === "maps:u", "else the Maps link");
ok(addInFlightKey({ name: " Acme " }) === addInFlightKey({ name: "acme" }), "else the name, trimmed and lower-cased");
ok(/const addLeadSingleFlight = useCallback\(\(lead: Lead[\s\S]{0,200}addInFlightKey\(lead\)[\s\S]{0,120}if \(running\) return running;/.test(hook),
  "a repeat press joins the running add (same answer, no second insert, never dropped)");
ok(/addsInFlightRef\.current\.delete\(key\)/.test(hook), "the key is released when the add answers, so a later press works");
const table = norm("../src/components/LeadsTable.tsx");
ok(/if \(addingIds\.has\(lead\.id\)\) return;/.test(table), "the table ignores a press on a row already adding");
ok((table.match(/disabled=\{addingIds\.has\(lead\.id\)\}/g) ?? []).length >= 2, "both Add buttons are disabled while their add runs");
ok(/'Adding…' : 'Add to CRM'/.test(table), "the desktop button says Adding… while it runs");

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log("\nALL PASS");
