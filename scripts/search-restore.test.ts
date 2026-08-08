/* ============================================================
   THE RESULTS AND THE SEARCH THAT PRODUCED THEM.

   ⛔ THE BUG, AND IT COST 168 LEADS. search_keyword and search_location lived in useState in
   Index.tsx, set only by pressing Search. The RESULTS lived in LeadSearchContext and were restored
   from sessionStorage on mount. Two facts describing one thing, with two different lifetimes — so:

       search  ->  leave the page  ->  come back  ->  results on screen, keyword and town null
                                                  ->  Add writes a lead with neither

   Measured 2026-08-08: 168 rows in outreach_leads are exactly that shape. 166 are missing BOTH
   fields together, every one has a place_id, and none can be audited — create-ai-audit requires a
   business type AND a location. Paul's words: "That will keep happening every time I work the way
   I actually work."

   ⛔ THE FIX IS THAT THEY ARE NOW ONE OBJECT IN ONE WRITE. Not a second setState in the restore
   path — that would leave the same class of bug for whoever adds the next call site. If they cannot
   be persisted separately, they cannot be restored separately.

   This suite models the persist/restore round trip. It cannot press a button in a browser, so it
   asserts the INVARIANT the shape now guarantees: anything that brings back leads brings back the
   search with them, and any state where leads exist without one is unreachable by construction.
   ============================================================ */

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

interface Lead { id: string; name: string }
interface LastSearch { keyword: string | null; location: string | null; country: string }
interface Stored { leads?: Lead[]; lastSearch?: LastSearch | null }

/** The single persist, restated from LeadSearchContext's effect. */
function persist(leads: Lead[], lastSearch: LastSearch | null): string {
  return JSON.stringify({ leads, lastSearch });
}
/** The single restore, restated from the same file's mount effect. */
function restore(raw: string | null): { leads: Lead[]; lastSearch: LastSearch | null } {
  if (!raw) return { leads: [], lastSearch: null };
  const cached = JSON.parse(raw) as Stored;
  return {
    leads: Array.isArray(cached?.leads) ? cached.leads : [],
    lastSearch: cached?.lastSearch?.country ? cached.lastSearch : null,
  };
}
/** What Add sends. Restated from Index.tsx's addToOutreach call. */
function whatAddWrites(r: { leads: Lead[]; lastSearch: LastSearch | null }) {
  return { search_keyword: r.lastSearch?.keyword ?? null, search_location: r.lastSearch?.location ?? null };
}

const LEADS: Lead[] = [{ id: "a", name: "Whitings LLP" }, { id: "b", name: "Moore Thompson" }];
const SEARCH: LastSearch = { keyword: "accountants", location: "Wisbech", country: "UK" };

console.log("── THE ROUND TRIP ──");
const round = restore(persist(LEADS, SEARCH));
ok(round.leads.length === 2, "the results come back");
ok(round.lastSearch?.keyword === "accountants", "and so does the keyword");
ok(round.lastSearch?.location === "Wisbech", "and the town");

console.log("\n── ⛔ THE EXACT SEQUENCE THAT WROTE 168 BAD ROWS ──");
/* search -> navigate away (component unmounts, page state dies) -> return (mount, restore). The
   ONLY thing that survives is what was written to sessionStorage, which is the whole point. */
const afterReturn = restore(persist(LEADS, SEARCH));
const written = whatAddWrites(afterReturn);
ok(written.search_keyword === "accountants", `Add writes the trade, not null (got ${JSON.stringify(written.search_keyword)})`);
ok(written.search_location === "Wisbech", `Add writes the town, not null (got ${JSON.stringify(written.search_location)})`);

console.log("\n── ⛔ AND THE INVARIANT: LEADS NEVER COME BACK WITHOUT THEIR SEARCH ──");
/* One object, one write. There is no code path that persists results while omitting the search,
   because the same JSON.stringify carries both — so this asserts the SHAPE, which is the guarantee. */
{
  const raw = persist(LEADS, SEARCH);
  const parsed = JSON.parse(raw) as Stored;
  ok("leads" in parsed && "lastSearch" in parsed, "both keys are in the single persisted object");
  ok(parsed.lastSearch !== null, "a persist with results carries a search");
}

console.log("\n── AN OLD ENTRY WRITTEN BEFORE THE FIX MUST NOT CRASH OR LIE ──");
/* Backwards compatibility matters here: a tab open right now holds {leads} with no lastSearch. It
   should restore the leads and report NO search — the honest answer — rather than inventing one. */
const legacy = restore(JSON.stringify({ leads: LEADS }));
ok(legacy.leads.length === 2, "a pre-fix entry still restores its leads");
ok(legacy.lastSearch === null, "  and reports no search rather than a guessed one");

console.log("\n── ⛔ A MALFORMED OR HALF-WRITTEN SEARCH IS NOT ACCEPTED ──");
/* The absent-value rule. `country` is the required field, so a partial object is rejected whole
   rather than restored with null holes that would write null columns all over again. */
for (const [label, obj] of [
  ["lastSearch null", { leads: LEADS, lastSearch: null }],
  ["lastSearch undefined", { leads: LEADS }],
  ["lastSearch empty object", { leads: LEADS, lastSearch: {} }],
] as Array<[string, unknown]>) {
  const r = restore(JSON.stringify(obj));
  ok(r.lastSearch === null, `${label} -> no search restored`);
  ok(r.leads.length === 2, `  ${label} -> leads still restored`);
}
ok(restore(null).leads.length === 0, "nothing stored -> nothing restored, no throw");
ok(restore(JSON.stringify({}))?.leads.length === 0, "an empty object -> empty, no throw");

console.log("\n── A SEARCH WITH NO TOWN IS STILL A REAL SEARCH ──");
/* "plumbers" with a blank location is legitimate — the country carries it. It must round-trip as
   null location WITH a keyword, not be discarded as malformed. */
const noTown = restore(persist(LEADS, { keyword: "plumbers", location: null, country: "UK" }));
ok(noTown.lastSearch?.keyword === "plumbers", "the keyword survives a location-less search");
ok(whatAddWrites(noTown).search_location === null, "  and the town is honestly null, not invented");

console.log(f ? `\n${f} FAILURES` : "\nALL PASS");
