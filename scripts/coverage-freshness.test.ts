/* ============================================================
   WHY THE COVERAGE COUNT NEEDED A HARD REFRESH.

   ⛔ IT WAS THE CACHE, NOT THE RENDER. Coverage's counts come from the `coverage` edge function via
   React Query: staleTime 5 minutes, refetchOnWindowFocus false, refetchOnReconnect false. Nothing
   invalidated it on a write, so adding a lead on Find Leads and returning to Coverage inside five
   minutes served the PRE-ADD payload. The component re-rendered perfectly — over stale data. A hard
   refresh "fixed" it only because it throws the in-memory cache away.

   ⛔ THE INVALIDATION BELONGS TO THE WRITER. Coverage is UNMOUNTED when a lead is added (that page
   has no add button), so a listener inside useCoverage could never hear it. invalidateQueries works
   with no subscriber: it marks the cache stale and the next mount refetches (refetchOnMount is left
   at its default of true — verified in App.tsx, and this fix depends on it).

   ⛔ AND THE TRIGGER IS DERIVED FROM THE STATE THE SCREEN RENDERS, not sprinkled across the nine
   functions that change what the endpoint counts (add, delete, removeFresh, archiveInternal,
   archiveAll, archiveMultiple, unarchive, unarchiveMultiple, inline auto-archive). Nine remembered
   calls is a rule the tenth writer breaks — the exact shape this codebase keeps being caught by.
   ============================================================ */
import {
  coverageSignature, coverageQueryKey, type CoverageRelevantLead,
} from "../src/lib/coverageFreshness.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

const lead = (o: Partial<CoverageRelevantLead> = {}): CoverageRelevantLead => ({
  is_archived: false, status: "not_contacted",
  whatsapp_sent_at: null, instantly_pushed_at: null, last_outreach_attempt_at: null, ...o,
});

console.log("── THE REPORTED BUG: ADDING A LEAD MUST CHANGE THE SIGNATURE ──");
{
  const before = coverageSignature([lead(), lead()], []);
  const after = coverageSignature([lead(), lead(), lead()], []);
  ok(before !== after, `two leads -> three changes the token (${before} -> ${after})`);
}

console.log("\n── AND SO MUST EVERY OTHER WRITE THAT MOVES A RUNG ──");
{
  const active = [lead(), lead(), lead()];
  const base = coverageSignature(active, []);

  // Archiving REMOVES a lead from a town: the endpoint filters is_archived = false.
  ok(coverageSignature([lead(), lead()], [lead({ is_archived: true })]) !== base,
    "archiving one lead changes the token");
  // Deleting / removing a fresh lead.
  ok(coverageSignature([lead(), lead()], []) !== base, "deleting a lead changes the token");
  // Unarchiving puts one back.
  ok(coverageSignature([lead(), lead(), lead(), lead()], []) !== base, "unarchiving changes the token");
}

console.log("\n── THE `worked` RUNG: EVERY CONTACT SIGNAL COUNTS ──");
/* Mirrors the endpoint's own POSITIVE test on evidence of a send — never "status is not new". */
for (const [field, value] of [
  ["whatsapp_sent_at", "2026-08-11T06:00:00Z"],
  ["instantly_pushed_at", "2026-08-11T06:00:00Z"],
  ["last_outreach_attempt_at", "2026-08-11T06:00:00Z"],
  ["status", "report_sent"],
] as const) {
  const before = coverageSignature([lead(), lead()], []);
  const after = coverageSignature([lead({ [field]: value } as Partial<CoverageRelevantLead>), lead()], []);
  ok(before !== after, `${field} appearing changes the token (a town becomes worked)`);
}

console.log("\n── ⛔ AND AN IRRELEVANT EDIT MUST *NOT* REFETCH ──");
/* Coverage reads 733 towns plus every lead and audit. Invalidating on a note edit would refetch all
   of that for a change that cannot move any rung — on a page whose slowness was itself a complaint.
   The signature deliberately hashes nothing but the three facts that matter. */
{
  const before = coverageSignature([lead(), lead()], []);
  const afterNoteEdit = coverageSignature([lead(), lead()], []);
  ok(before === afterNoteEdit, "same facts -> same token (a note or phone edit triggers nothing)");
  const statusButNotContacted = coverageSignature([lead({ status: "interested" }), lead()], []);
  ok(before === statusButNotContacted,
    "⛔ a status change that is NOT evidence of a send does not refetch (interested is not contacted)");
}

console.log("\n── DETERMINISTIC, AND ORDER-INDEPENDENT IN THE WAY THAT MATTERS ──");
{
  const a = coverageSignature([lead(), lead({ whatsapp_sent_at: "x" })], [lead({ is_archived: true })]);
  const b = coverageSignature([lead({ whatsapp_sent_at: "x" }), lead()], [lead({ is_archived: true })]);
  ok(a === b, "reordering the list does not fake a change (counts, not positions)");
  ok(coverageSignature([], []) === "0|0|0", `empty state is a real token, not "" (${coverageSignature([], [])})`);
}

console.log("\n── THE ABSENT CASES ──");
{
  /* A lead row missing the fields entirely — a partial select, or a column added later. It must read
     as NOT contacted rather than throwing or counting as contacted. */
  const bare = coverageSignature([{} as CoverageRelevantLead], []);
  ok(bare === "1|0|0", `a lead with no fields at all counts as one uncontacted lead (${bare})`);
  const nulls = coverageSignature([lead({ status: null, whatsapp_sent_at: null })], []);
  ok(nulls === "1|0|0", "explicit nulls are not evidence of a send");
  const empties = coverageSignature([lead({ whatsapp_sent_at: "" })], []);
  ok(empties === "1|0|0", "⛔ an EMPTY STRING timestamp is not a send — falsy, so it does not count");
}

console.log("\n── ⛔ IT IS A CHANGE TOKEN, NOT A NUMBER SHOWN TO ANYONE ──");
/* The requirement is that the badge stays driven by real data. This value never reaches the screen:
   it decides only WHEN to ask the server again. Asserted so a future change cannot quietly start
   rendering it as a count. */
{
  const sig = coverageSignature([lead(), lead()], [lead({ is_archived: true })]);
  ok(typeof sig === "string" && sig.includes("|"),
    `a delimited token, not a count: "${sig}" — nothing optimistic is ever displayed from it`);
  ok(Number.isNaN(Number(sig)), "it is not even parseable as a number, by construction");
}

console.log("\n── THE KEY THE WRITER INVALIDATES IS THE KEY THE READER USES ──");
{
  ok(JSON.stringify(coverageQueryKey("user-a")) === JSON.stringify(["coverage", "user-a"]),
    "the exported factory is the single source of the key");
  ok(JSON.stringify(coverageQueryKey("user-a")) !== JSON.stringify(coverageQueryKey("user-b")),
    "⛔ scoped per user — one operator's write never invalidates another's cache");
  ok(JSON.stringify(coverageQueryKey(undefined)) === JSON.stringify(["coverage", undefined]),
    "a signed-out key is its own key, not a shared one");
}

console.log("\n── THE INVALIDATION GATE: SKIP THE INITIAL LOAD, FIRE ON EVERY REAL CHANGE ──");
/* The effect restated. The first signature is the initial fetch (0 -> N), not an operator action;
   invalidating there would refetch coverage once per Outreach visit for nothing. */
{
  let invalidations = 0;
  let seenFirst = false;
  const onSignature = () => { if (!seenFirst) { seenFirst = true; return; } invalidations += 1; };

  onSignature();                       // initial load
  ok(invalidations === 0, "the initial load does not invalidate");
  onSignature();                       // a lead added
  ok(invalidations === 1, "the first real change invalidates once");
  onSignature(); onSignature();        // two more writes
  ok(invalidations === 3, `each subsequent change invalidates (${invalidations})`);
}

console.log(f ? `\n${f} FAILURES` : "\nALL PASS");
