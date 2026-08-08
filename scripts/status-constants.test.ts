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

console.log(f ? `\n${f} FAILURES` : "\nALL PASS");
