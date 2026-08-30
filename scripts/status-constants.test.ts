/* ============================================================
   A FILTER CONSTANT THAT MATCHES NOTHING.

   ⛔ THE FAULT, AND WHY IT SURVIVED. CRAWLABLE_STATUSES_DEFAULT contained 'contacted' — a value that
   does not exist in LeadStatus and has never existed in outreach_leads. I took Paul's description of
   the population ("contacted — I sent an opener and they never replied") and used his words as a
   literal status without checking one existed.

   It did not error. It did not warn. The Find-emails button showed a count, the count was TRUE, and
   the crawl silently targeted 289 leads instead of ~446 — leaving 157 leads out of email entirely:
       initial_contact  85 crawlable
       report_sent      65
       no_whatsapp       7
   Paul's words: "a filter constant that matches nothing renders as a smaller number rather than an
   error, and I would never have caught it."

   ⚠️ TypeScript now catches the same mistake at BUILD time, because the constants are typed
   LeadStatus[] rather than string[]. This suite is the second net: it asserts against the RUNTIME
   list, so a value that is a legal union member but absent from the operator's own picker is caught
   too — and it names the population each status contributes, so a future edit that narrows the
   campaign has to do so out loud.
   ============================================================ */
import {
  OUTREACH_STATUS_OPTIONS, OUTREACH_STATUS_FILTER_OPTIONS, statusesForFilter, canonicalFilterValue,
  PAID_FILTER_VALUE, isPaidFilterValue,
} from "../src/types/outreach.ts";
import { CRAWLABLE_STATUSES_DEFAULT, CRAWL_STATUS_OPTIONS } from "../src/types/outreach.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

const KNOWN = new Set(OUTREACH_STATUS_OPTIONS.map((o) => o.value));
console.log(`LeadStatus values with a real definition: ${KNOWN.size}\n`);

console.log("── ⛔ EVERY STATUS NAMED IN A FILTER MUST EXIST ──");
for (const s of CRAWLABLE_STATUSES_DEFAULT) {
  ok(KNOWN.has(s), `default targets a real status: ${JSON.stringify(s)}`);
}
for (const s of CRAWL_STATUS_OPTIONS) {
  ok(KNOWN.has(s), `picker offers a real status:  ${JSON.stringify(s)}`);
}
/* The specific string that caused it, asserted by name so nobody reintroduces it. */
ok(!(CRAWLABLE_STATUSES_DEFAULT as string[]).includes("contacted"),
  "'contacted' is NOT in the defaults — it is not a status and never was");
ok(!KNOWN.has("contacted" as never), "  and it is still not a LeadStatus");

console.log("\n── THE DEFAULT MUST BE A SUBSET OF THE PICKER ──");
/* A default the picker cannot show is unreachable: reset would offer something not on the list. */
for (const s of CRAWLABLE_STATUSES_DEFAULT) {
  ok(CRAWL_STATUS_OPTIONS.includes(s), `default ${JSON.stringify(s)} is offered by the picker`);
}

console.log("\n── ⛔ AND IT MUST COVER EVERY WAY WHATSAPP CAN FAIL ──");
/* The four populations email exists to reach. Naming them here means narrowing the campaign
   requires deleting an assertion, which is a decision rather than a typo. */
for (const s of ["no_whatsapp_needs_sms", "no_whatsapp", "initial_contact", "report_sent"] as const) {
  ok((CRAWLABLE_STATUSES_DEFAULT as string[]).includes(s), `default includes ${JSON.stringify(s)}`);
}
/* ⚠️ These two are DIFFERENT populations and both belong. no_whatsapp is a real mobile with no
   WhatsApp account (SMS still works); no_whatsapp_needs_sms is a landline (SMS does not). Merging
   them would lose which leads can still take an SMS — process-sms-queue targets one and excludes
   the other. */
ok((CRAWLABLE_STATUSES_DEFAULT as string[]).includes("no_whatsapp")
  && (CRAWLABLE_STATUSES_DEFAULT as string[]).includes("no_whatsapp_needs_sms"),
  "both no_whatsapp statuses are targeted — they are different populations, not duplicates");

console.log("\n── NOBODY WHO SAID NO IS TARGETED ──");
for (const s of ["not_interested", "opted_out", "closed", "bounced"] as const) {
  ok(!(CRAWLABLE_STATUSES_DEFAULT as string[]).includes(s), `default excludes ${JSON.stringify(s)}`);
}


/* ── ⛔ NO TWO STATUSES MAY SHARE A LABEL — WITH ONE NAMED EXCEPTION ──────────────────────────
   WHAT THIS ORIGINALLY CAUGHT: no_whatsapp and no_whatsapp_needs_sms both rendered the words "No
   WhatsApp" in PipelineStatusBadge, distinguished ONLY by pill colour. Paul filtered by "No
   WhatsApp", got grey pills, and reasonably concluded the filter was broken.

   ⚠️ THAT PAIR NOW SHARES A LABEL AGAIN, ON PURPOSE. Paul's call, 2026-08-08: he does no SMS
   outreach, so a mobile without a WhatsApp account and a landline both mean "email instead" and the
   distinction is noise on screen. The important difference is that it is now a DECISION with a
   reason, rather than an accident nobody had noticed.

   ⛔ SO THE ASSERTION IS NARROWED, NOT DELETED, AND NARROWED TO EXACTLY ONE PAIR. Any OTHER
   collision still fails — including a future third status joining this one. Deleting the check
   because one pair is now legitimate would give up the guard for the other fifteen, which is how a
   rule dies: not by being argued with, but by being switched off to accommodate its first exception.

   ⚠️ AND THE ALLOWLIST ITSELF IS ASSERTED. Widening it has to be a visible edit to a test that
   says out loud why the exception exists, not a quiet extra member. */
console.log("\n── ⛔ STATUSES ARE DISTINGUISHABLE BY THEIR WORDS, BAR ONE DELIBERATE PAIR ──");
{
  /* The one sanctioned collision. Order-independent; compared as a set. */
  const ALLOWED_SHARED: string[][] = [["no_whatsapp", "no_whatsapp_needs_sms"]];
  const key = (vs: string[]) => [...vs].sort().join("|");
  const allowed = new Set(ALLOWED_SHARED.map(key));

  ok(ALLOWED_SHARED.length === 1 && ALLOWED_SHARED[0].length === 2,
    "exactly ONE pair is allowed to share a label — adding a second is an edit to this line");
  ok(allowed.has(key(["no_whatsapp", "no_whatsapp_needs_sms"])),
    "  and it is the two no-WhatsApp statuses, named");

  const byLabel = new Map<string, string[]>();
  for (const o of OUTREACH_STATUS_OPTIONS) {
    if (!byLabel.has(o.label)) byLabel.set(o.label, []);
    byLabel.get(o.label)!.push(o.value);
  }
  let unsanctioned = 0;
  for (const [label, values] of byLabel) {
    if (values.length === 1) continue;
    if (allowed.has(key(values))) { console.log(`  (allowed) ${JSON.stringify(label)} -> ${values.join(", ")}`); continue; }
    unsanctioned++;
    console.log(`  CLASH ${JSON.stringify(label)} -> ${values.join(", ")}`);
  }
  ok(unsanctioned === 0, `no UNSANCTIONED status shares a label (${byLabel.size} labels across ${OUTREACH_STATUS_OPTIONS.length} statuses)`);

  /* ⛔ THE GUARD STILL BITES FOR THE OTHER FIFTEEN. Proven rather than asserted: a synthetic clash
     between two statuses NOT on the allowlist must be rejected by the same code above. Without this
     the narrowing could have been a no-op check that passes on anything. */
  {
    const fake = [...OUTREACH_STATUS_OPTIONS.map((o) => ({ value: o.value, label: o.label }))];
    const a = fake.find((o) => o.value === "replied")!;
    const b = fake.find((o) => o.value === "bounced")!;
    b.label = a.label;                                   // two unrelated statuses, one label
    const m = new Map<string, string[]>();
    for (const o of fake) { if (!m.has(o.label)) m.set(o.label, []); m.get(o.label)!.push(o.value); }
    let caught = 0;
    for (const [, values] of m) if (values.length > 1 && !allowed.has(key(values))) caught++;
    ok(caught === 1, "a clash between two OTHER statuses is still caught (replied vs bounced)");
  }

  const labelOf = (v: string) => OUTREACH_STATUS_OPTIONS.find((o) => o.value === v)?.label ?? "";
  ok(labelOf("no_whatsapp") === "No WhatsApp", `no_whatsapp reads ${JSON.stringify(labelOf("no_whatsapp"))}`);
  ok(labelOf("no_whatsapp_needs_sms") === "No WhatsApp", `no_whatsapp_needs_sms reads the same, as intended`);
  /* ⚠️ The label merged; the VALUES must not. process-sms-queue targets one and excludes the
     other, so a "tidy-up" that collapsed them into a single status would lose which leads can still
     take an SMS. Both remain in the crawl defaults for the same reason. */
  ok(labelOf("no_whatsapp") !== "" && OUTREACH_STATUS_OPTIONS.filter((o) => o.label === "No WhatsApp").length === 2,
    "  and they are still TWO separate statuses wearing one label, not one merged status");
}

/* ── ⛔ THE FILTER IS ONE OPTION PER LABEL, AND EVERY STATUS IS STILL REACHABLE ────────────────
   Two entries reading "No WhatsApp" that showed 53 rows or 509 depending on which one Paul clicked
   was worse than the long labels it replaced, so the filter now offers ONE combined option matching
   both statuses. Paul's framing: what he wants when he filters is everyone he cannot WhatsApp.

   ⚠️ THE RISK IN MERGING FILTER OPTIONS IS A STATUS NOBODY CAN FILTER FOR — an invisible
   population, which is the same shape as a filter constant that matches nothing: it renders as a
   smaller number rather than an error. The list is DERIVED by grouping on the label so completeness
   is structural, and this asserts it rather than trusting the derivation. */
console.log("\n── ⛔ THE COMBINED FILTER COVERS EVERY STATUS, EXACTLY ONCE ──");
{
  const seen = new Map<string, number>();
  for (const opt of OUTREACH_STATUS_FILTER_OPTIONS) {
    for (const st of opt.statuses) seen.set(st, (seen.get(st) ?? 0) + 1);
  }
  let missing = 0, doubled = 0;
  for (const o of OUTREACH_STATUS_OPTIONS) {
    const n = seen.get(o.value) ?? 0;
    if (n === 0) { missing++; console.log(`  UNFILTERABLE ${o.value}`); }
    if (n > 1) { doubled++; console.log(`  IN TWO OPTIONS ${o.value}`); }
  }
  ok(missing === 0, "every status is reachable through some filter option — none is invisible");
  ok(doubled === 0, "and none appears in two options, so a count cannot be double-reported");
  /* ⚠️ COUNT UPDATED 2026-08-23 with 'already_visible' (+1), and again 2026-08-29 with 'refunded'
     (+1). It was ALSO stale before the first of those (it read 17 while the list had grown to 18
     with in_delivery/completed) — this Deno suite is not in the npm pipeline, so nobody had re-run
     it. Now: 20 statuses; no_whatsapp + no_whatsapp_needs_sms share a label → 19 groups; 19 groups
     + the Paid sentinel = 20 filter options.
     ⚠️ This assertion FAILS BY DESIGN whenever a status is added — that is the point. It is the
     prompt to check the new value really got a unique label and its own filter group (the two
     assertions directly above), rather than silently joining an existing one. Update the numbers
     only after reading those pass. */
  ok(OUTREACH_STATUS_FILTER_OPTIONS.length === 20 && OUTREACH_STATUS_OPTIONS.length === 20,
    `19 status groups + the Paid sentinel = 20 filter options for 20 statuses (got ${OUTREACH_STATUS_FILTER_OPTIONS.length} for ${OUTREACH_STATUS_OPTIONS.length})`);

  const noWa = OUTREACH_STATUS_FILTER_OPTIONS.filter((o) => o.label === "No WhatsApp");
  ok(noWa.length === 1, `"No WhatsApp" appears ONCE in the filter (got ${noWa.length})`);
  ok(noWa[0].statuses.length === 2
    && noWa[0].statuses.includes("no_whatsapp")
    && noWa[0].statuses.includes("no_whatsapp_needs_sms"),
    "  and it matches BOTH statuses — 53 + 509, not one or the other");
  /* Every other option stays single, or the merge has leaked past the pair it was for. */
  ok(OUTREACH_STATUS_FILTER_OPTIONS.filter((o) => o.statuses.length > 1).length === 1,
    "exactly one option covers more than one status");

  console.log("\n── A SAVED FILTER FROM BEFORE THE MERGE STILL WORKS ──");
  /* Table state persisted earlier can hold a value that is no longer any option's own. It must keep
     filtering, and the Select must show the option that owns it — a control disagreeing with the
     table it drives is its own bug. */
  ok(statusesForFilter("no_whatsapp_needs_sms").length === 2,
    "a saved 'no_whatsapp_needs_sms' still matches the whole group rather than nothing");
  ok(canonicalFilterValue("no_whatsapp_needs_sms") === "no_whatsapp",
    "  and normalises onto the option that owns it, so the dropdown is not blank");
  ok(canonicalFilterValue("replied") === "replied", "an unmerged status normalises to itself");

  console.log("\n── ⛔ AN UNKNOWN FILTER NARROWS, IT NEVER WIDENS ──");
  /* The absent-value rule, applied to a filter: a value we cannot place must match only itself, not
     fall through to "show everything" — which would read as a working filter over the whole table. */
  const unknown = statusesForFilter("some_status_that_does_not_exist" as never);
  ok(unknown.length === 1, "an unrecognised filter value matches ONE thing, not all of them");
  ok(OUTREACH_STATUS_FILTER_OPTIONS
      .filter((o) => !isPaidFilterValue(o.value))
      .every((o) => o.statuses.includes(o.value as never)),
    "every STATUS option's own value is one of the statuses it matches");
}

/* ── ⛔ THE PAID FILTER IS NOT A STATUS, AND MUST NEVER BECOME ONE ──────────────────────────────
   `paid` means `amount_paid > 0`, everywhere (CLAUDE.md §6). Filtering Outreach on the STATUS
   `payment_received` is wrong in both directions and each direction costs something real:
     * a customer moved on to `in_delivery` is still paid — a status filter hides exactly the people
       Paul is mid-delivery with, which is the population the filter exists to show him;
     * a £0 lead dragged to `payment_received` by hand is not paid — a status filter counts it.
   The Paid Clients page made this mistake once already (it filtered on a status list and then summed
   amount_paid over the gated set, so it was wrong both ways on the one page whose job was revenue).
   This suite is what stops the sentinel quietly being "simplified" back into a status. */
console.log("\n── ⛔ THE PAID FILTER READS MONEY, NOT STATUS ──");
{
  const paid = OUTREACH_STATUS_FILTER_OPTIONS.filter((o) => isPaidFilterValue(o.value));
  ok(paid.length === 1, `exactly one Paid sentinel option (got ${paid.length})`);
  ok(paid[0]?.value === PAID_FILTER_VALUE, `  its value is ${JSON.stringify(PAID_FILTER_VALUE)}`);
  ok(!KNOWN.has(PAID_FILTER_VALUE as never),
    "  and that value is NOT a LeadStatus — a sentinel, like the Inbox's __opened__/__claimed__");

  /* ⛔ THE EMPTY LIST IS LOAD-BEARING AND THE CALLER MUST BRANCH BEFORE IT. If the row filter ever
     falls through to statusesForFilter for this value it shows an EMPTY TABLE, which reads as "no
     paying customers" rather than as an error — the same shape as the 'contacted' constant that
     matched nothing. Asserted here so a later "tidy-up" that gives it a status has to delete a line
     that says why it must not. */
  ok(paid[0]?.statuses.length === 0, "  it matches NO status — the row filter tests amount_paid");
  ok(statusesForFilter(PAID_FILTER_VALUE).length === 0,
    "  statusesForFilter returns [] for it, so it is provably not the mechanism");
  ok(!(paid[0]?.statuses as string[] ?? []).includes("payment_received"),
    "  and it is NOT payment_received — in_delivery is still paid, a £0 payment_received is not");

  console.log("\n── ⛔ AND IT DOES NOT WEAR THE SAME WORD AS THE STATUS ──");
  /* Two options reading "Paid" showing different row counts is the 53-vs-509 "No WhatsApp" failure
     in a new place. The label-uniqueness rule above polices the STATUS list; this extends it to the
     filter list, which is what the operator actually reads before choosing. */
  const filterLabels = OUTREACH_STATUS_FILTER_OPTIONS.map((o) => o.label);
  const dupes = filterLabels.filter((l, i) => filterLabels.indexOf(l) !== i);
  ok(dupes.length === 0, `no two FILTER options share a label (dupes: ${JSON.stringify(dupes)})`);
  ok(paid[0]?.label !== "Paid",
    `  the sentinel is not the bare word "Paid" (it is ${JSON.stringify(paid[0]?.label)}) — that belongs to payment_received`);
  ok((paid[0]?.label ?? "").includes("Paid"),
    "  but it still contains \"Paid\", so it is findable by the word Paul looks for");

  console.log("\n── A SAVED PAID FILTER SURVIVES A RELOAD ──");
  /* Table state is persisted; the sentinel must normalise onto itself or the Select renders blank
     while the table stays filtered — a control disagreeing with the table it drives. */
  ok(canonicalFilterValue(PAID_FILTER_VALUE) === PAID_FILTER_VALUE,
    "the sentinel normalises to itself, so the restored dropdown is not blank");
  ok(isPaidFilterValue(PAID_FILTER_VALUE) && !isPaidFilterValue("payment_received")
    && !isPaidFilterValue("all") && !isPaidFilterValue(null) && !isPaidFilterValue(undefined),
    "isPaidFilterValue is true for the sentinel ONLY — not for payment_received, 'all', null or undefined");
}

console.log(f ? `\n${f} FAILURES` : "\nALL PASS");
