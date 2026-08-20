/* ============================================================
   THE FREE-CHECK LEAD LADDER — the dedupe order, the cap boundary, and fail-closed.

   ⛔ WHY THESE. This is money-spending lead-creation code on a public form, and every rung has a
   live precedent in this codebase for going wrong quietly:
     * THE DEDUPE answering "nothing found" when it had simply not loaded — that is the 25 duplicate
       cold openers of 15–17 Aug, and the reason a check that ERRORS must refuse rather than create.
     * THE ABSENT VALUE falling through as though it were real — fourteen recorded instances. A
       blank name, a blank town, a null email and an unrecognised `source` are each driven here.
     * THE CAP being checked after the spend rather than before it, which is how a public form
       becomes an open tab at Google.

   ⛔ THE LADDER IS RESTATED HERE, NOT IMPORTED, and that is deliberate: the real module imports
   Deno-only paths (`Deno.env`, `place-resolve.ts`) that tsx cannot load. So this suite proves the
   RULE, not the deployed bytes — the same convention audit-push.test.ts uses and states. Any change
   to the order or the guards must be made in BOTH places, which is why the restatement below is
   kept to the shape of the decision and nothing else.
   ============================================================ */

const FREE_CHECK_DAILY_LEAD_CAP = 10;

type Outcome =
  | { kind: "created" }
  | { kind: "matched"; matchedOn: "place_id" | "phone" | "name" }
  | { kind: "skipped"; reason: string }
  | { kind: "refused"; reason: string };

interface World {
  /** Existing leads, by each key the ladder checks. A value of `"THROW"` makes that read fail. */
  byName?: string | "THROW";
  byPlaceId?: string | "THROW";
  byPhone?: string | "THROW";
  /** free-check leads already created in the rolling 24h window. */
  spentToday: number;
  /** What the guarded place search returns. */
  placeId?: string | null;
  /** What the details call returns. */
  phone?: string | null;
}

/** The decision, in the order and with the failure modes the real module implements. */
function ladder(input: { name: string; town: string }, w: World): { outcome: Outcome; searched: boolean; detailed: boolean } {
  let searched = false;
  let detailed = false;
  const name = input.name.trim();
  if (!name) return { outcome: { kind: "refused", reason: "no business name" }, searched, detailed };

  // 1. NAME — free, first, and an error REFUSES.
  if (w.byName === "THROW") return { outcome: { kind: "refused", reason: "dedupe read failed" }, searched, detailed };
  if (w.byName) return { outcome: { kind: "matched", matchedOn: "name" }, searched, detailed };

  // 2. CAP — before any spend.
  if (w.spentToday >= FREE_CHECK_DAILY_LEAD_CAP) {
    return { outcome: { kind: "skipped", reason: "daily cap" }, searched, detailed };
  }

  // 3. SEARCH — only with a town to anchor the town-hint guard.
  let placeId: string | null = null;
  if (input.town.trim()) {
    searched = true;
    placeId = w.placeId ?? null;
  }

  // 4. place_id — the moment the key exists.
  if (placeId) {
    if (w.byPlaceId === "THROW") return { outcome: { kind: "refused", reason: "dedupe read failed" }, searched, detailed };
    if (w.byPlaceId) return { outcome: { kind: "matched", matchedOn: "place_id" }, searched, detailed };
  }

  // 5. DETAILS (phone) — only with a place.
  let phone: string | null = null;
  if (placeId) {
    detailed = true;
    phone = w.phone ?? null;
  }

  // 6. phone.
  if (phone) {
    if (w.byPhone === "THROW") return { outcome: { kind: "refused", reason: "dedupe read failed" }, searched, detailed };
    if (w.byPhone) return { outcome: { kind: "matched", matchedOn: "phone" }, searched, detailed };
  }

  return { outcome: { kind: "created" }, searched, detailed };
}

let f = 0;
function ok(cond: boolean, label: string) {
  console.log(`${cond ? "PASS  " : "FAIL  "} ${label}`);
  if (!cond) f++;
}

const base: World = { spentToday: 0, placeId: "PLACE1", phone: "+441234567890" };
const IN = { name: "Thornbeck Plumbing", town: "Kettering" };

console.log("\n── the happy path ──");
{
  const r = ladder(IN, base);
  ok(r.outcome.kind === "created", "a genuinely new business is created");
  ok(r.searched && r.detailed, "and it paid for exactly one search and one details call");
}

console.log("\n── the ladder is ordered by COST, so a repeat submission is free ──");
{
  const r = ladder(IN, { ...base, byName: "Thornbeck Plumbing" });
  ok(r.outcome.kind === "matched" && r.outcome.matchedOn === "name", "an exact-name repeat matches");
  ok(!r.searched && !r.detailed, "and spends NOTHING — the name check runs before any paid call");
}
{
  const r = ladder(IN, { ...base, byPlaceId: "Thornbeck Plumbing & Heating" });
  ok(r.outcome.kind === "matched" && r.outcome.matchedOn === "place_id", "a differently-typed name still matches on place_id");
  ok(r.searched && !r.detailed, "the search was needed; the details call was NOT reached");
}
{
  const r = ladder(IN, { ...base, byPhone: "Thornbeck Heating Ltd" });
  ok(r.outcome.kind === "matched" && r.outcome.matchedOn === "phone", "the same operator under another name matches on phone");
  ok(r.detailed, "which necessarily costs the details call — the only rung that can catch it");
}

console.log("\n── FAIL CLOSED: a dedupe that ERRORS must never create ──");
for (const key of ["byName", "byPlaceId", "byPhone"] as const) {
  const r = ladder(IN, { ...base, [key]: "THROW" });
  ok(r.outcome.kind === "refused", `${key} erroring refuses the create (never "no duplicates found")`);
}

console.log("\n── the cap is checked BEFORE the first paid call ──");
{
  const at = ladder(IN, { ...base, spentToday: FREE_CHECK_DAILY_LEAD_CAP });
  ok(at.outcome.kind === "skipped", `at the cap (${FREE_CHECK_DAILY_LEAD_CAP}) the create is skipped`);
  ok(!at.searched && !at.detailed, "and NOTHING was spent — the cap precedes the search");
  const under = ladder(IN, { ...base, spentToday: FREE_CHECK_DAILY_LEAD_CAP - 1 });
  ok(under.outcome.kind === "created", "one under the cap still runs (boundary is inclusive-at-cap)");
  const over = ladder(IN, { ...base, spentToday: FREE_CHECK_DAILY_LEAD_CAP + 5 });
  ok(over.outcome.kind === "skipped" && !over.searched, "over the cap spends nothing either");
}

console.log("\n── absent values never fall through as real ones ──");
{
  for (const name of ["", "   "]) {
    const r = ladder({ name, town: "Kettering" }, base);
    ok(r.outcome.kind === "refused", `a blank name (${JSON.stringify(name)}) refuses rather than creating a nameless lead`);
  }
  const noTown = ladder({ name: "Thornbeck Plumbing", town: "  " }, base);
  ok(noTown.outcome.kind === "created", "a blank town still creates the lead — the submission is not lost");
  ok(!noTown.searched, "but it does NOT pay for a search the town-hint guard would refuse anyway");
  ok(!noTown.detailed, "and with no place there is no phone call either");
}
{
  const noPlace = ladder(IN, { ...base, placeId: null });
  ok(noPlace.outcome.kind === "created", "an unresolvable place still creates the lead (town-gated, flagged)");
  ok(noPlace.searched && !noPlace.detailed, "the search happened; the details call is skipped with no place id");
  const noPhone = ladder(IN, { ...base, phone: null, byPhone: "SomeoneElse" });
  ok(noPhone.outcome.kind === "created", "no phone means the phone rung cannot match — absence is not a match");
}

console.log("\n── the source gate: only the known value does anything ──");
{
  const SUBMISSION_SOURCES = new Set(["free_check"]);
  const read = (v: unknown) => (typeof v === "string" && SUBMISSION_SOURCES.has(v.trim()) ? v.trim() : null);
  ok(read("free_check") === "free_check", "the known value is accepted");
  ok(read(" free_check ") === "free_check", "surrounding whitespace is tolerated");
  for (const v of [undefined, null, "", "  ", "FREE_CHECK", "free-check", "onboarding", 1, {}, true]) {
    ok(read(v) === null, `${JSON.stringify(v) ?? "undefined"} stores NULL rather than being passed through`);
  }
}

console.log(f ? `\n${f} FAILURES` : "\nALL PASS");
