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
import { OUTREACH_STATUS_OPTIONS } from "../src/types/outreach.ts";
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

console.log(f ? `\n${f} FAILURES` : "\nALL PASS");
