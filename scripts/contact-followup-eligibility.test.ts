/* ════════════════════════════════════════════════════════════════════════════════════════════
   contact_followup ELIGIBILITY — the server gate for the bulk opener follow-up.

   Drives contactFollowupEligible with a fake Supabase client so every rung is exercised without a
   database: not-paid, got-the-opener, one-per-lead, no-reply-since, and the 3-day window — plus the
   fail-closed contract when a query throws. The absent cases (no opener, replied since, already sent)
   must each REFUSE, and only the fully-quiet-3-days-ago lead may send.
   Run: deno run --sloppy-imports --allow-env scripts/contact-followup-eligibility.test.ts
   ════════════════════════════════════════════════════════════════════════════════════════════ */
import { contactFollowupEligible, CONTACT_FOLLOWUP_MIN_DAYS } from "../supabase/functions/_shared/contact-followup-eligibility.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

const DAY = 24 * 60 * 60 * 1000;
const NOW = 1_800_000_000_000; // fixed clock so tests are deterministic
const iso = (ms: number) => new Date(ms).toISOString();

interface Scenario {
  openerAt?: number | null;      // when initial_contact was sent (null = never)
  priorContact?: boolean;        // a contact_followup already went out
  repliedAt?: number | null;     // an inbound after the opener (null = none)
  throwOn?: string;              // template_name/direction marker to throw on (fail-closed test)
}

// Minimal chainable fake: records the .eq filters, decides the canned rows at .limit(), and is
// awaitable. Mirrors the exact call shapes in contact-followup-eligibility.ts.
function makeService(s: Scenario) {
  return {
    from() {
      const filt: Record<string, string> = {};
      let isInboundGt = false;
      const builder: Record<string, unknown> = {
        select() { return builder; },
        eq(col: string, val: string) { filt[col] = val; return builder; },
        neq() { return builder; },
        order() { return builder; },
        gt() { isInboundGt = true; return builder; },
        limit() {
          if (s.throwOn && (filt.template_name === s.throwOn || (isInboundGt && s.throwOn === "inbound"))) {
            return Promise.reject(new Error("boom"));
          }
          // Opener lookup
          if (filt.direction === "outbound" && filt.template_name === "initial_contact") {
            return Promise.resolve({ data: s.openerAt ? [{ created_at: iso(s.openerAt) }] : [] });
          }
          // Prior contact_followup lookup
          if (filt.direction === "outbound" && filt.template_name === "contact_followup") {
            return Promise.resolve({ data: s.priorContact ? [{ id: "x" }] : [] });
          }
          // Inbound-after-opener lookup
          if (isInboundGt) {
            return Promise.resolve({ data: s.repliedAt ? [{ id: "r" }] : [] });
          }
          return Promise.resolve({ data: [] });
        },
      };
      return builder;
    },
  };
}

const LEAD = { id: "L1", phone: "07700900123", country: "UK", amount_paid: 0 };
const run = (s: Scenario, lead = LEAD) => contactFollowupEligible(makeService(s), lead, NOW);

console.log("── REFUSALS ──");
ok((await run({ openerAt: null })).reason === "no_opener", "never got the opener → no_opener");
ok((await run({ openerAt: NOW - 5 * DAY, priorContact: true })).reason === "already_sent", "already had contact_followup → already_sent");
ok((await run({ openerAt: NOW - 5 * DAY, repliedAt: NOW - 4 * DAY })).reason === "replied_since", "replied after opener → replied_since");
ok((await run({ openerAt: NOW - 1 * DAY })).reason === "too_recent", "opener < 3 days ago → too_recent");
ok((await run({ openerAt: NOW - 5 * DAY }, { ...LEAD, amount_paid: 19.99 })).reason === "paid", "paying customer → paid");
ok((await run({ openerAt: NOW - 5 * DAY }, { ...LEAD, phone: null })).reason === "bad_number", "no phone → bad_number");

console.log("\n── THE BOUNDARY (inclusive on the far side) ──");
ok((await run({ openerAt: NOW - CONTACT_FOLLOWUP_MIN_DAYS * DAY - 1000 })).eligible === true, "just over 3 days → eligible");
ok((await run({ openerAt: NOW - CONTACT_FOLLOWUP_MIN_DAYS * DAY + 1000 })).reason === "too_recent", "just under 3 days → too_recent");

console.log("\n── THE ONE THAT SENDS ──");
ok((await run({ openerAt: NOW - 5 * DAY, priorContact: false, repliedAt: null })).eligible === true, "quiet 5 days, never chased → eligible");

console.log("\n── FAIL CLOSED ──");
ok((await run({ openerAt: NOW - 5 * DAY, throwOn: "initial_contact" })).reason === "check_failed", "a thrown query refuses (never sends)");

console.log(f ? `\n${f} FAILURES` : "\nALL PASS");
if (f) throw new Error(`${f} eligibility failures`);
