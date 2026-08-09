/* ============================================================
   WHAT THIS CUSTOMER PAYS.

   ⛔ THIS DRIVES THE REAL FUNCTION, not a restatement of it. offerPriceForLead takes a structural
   `Queryable`, so a plain object satisfies it — which means this suite tests the bytes that
   findable-checkout and findable-onboarding actually deploy. Every other suite in scripts/ has to
   restate edge-function logic because it is tangled with supabase-js; this one does not, and that
   is worth preserving if the file is ever refactored.

   ⛔ WHAT IT GUARDS. This function decides what a stranger is charged. Two directions of failure,
   and they are not symmetrical:
     * charging MORE than the page showed is a complaint and a refund
     * charging LESS than we meant is £79 a time, silently
   Everything here asserts the exact verdict, and the fail-closed paths assert the FULL price.

   ⚠️ THE 'capped' RULE IS THE SUBTLE ONE. A capped run normally has real answers and just fewer
   than asked for — every other reader in the system treats it as usable. But on 2026-08-08 ten runs
   were capped with ZERO answers, because the audit queue was full rather than because money ran
   out, and there is no report at the end of that. So the rule is "complete, or capped with at least
   one answered question" — the state we want, never the label that usually implies it.
   ============================================================ */
import { offerPriceForLead, FOUNDER_PRICE_GBP, type Queryable } from "../supabase/functions/_shared/offer-price.ts";
import { FINDABLE_SETUP_PRICE_GBP } from "../src/lib/findableOffer.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

type Rows = Record<string, unknown>[];
interface Fake {
  lead?: Record<string, unknown> | null;
  audits?: Rows;
  runs?: Rows;
  queue?: Rows;
  throwOn?: string;
}

/** A stand-in for the database. Ignores the filter arguments — the suite controls the rows. */
function db(fx: Fake): Queryable {
  const make = (rows: Rows, single: Record<string, unknown> | null) => {
    const node = {
      eq: () => node,
      in: () => node,
      limit: () => Promise.resolve({ data: rows }),
      maybeSingle: () => Promise.resolve({ data: single }),
    };
    return node;
  };
  return {
    from: (t: string) => {
      if (fx.throwOn === t) throw new Error("boom");
      if (t === "outreach_leads") return { select: () => make([], fx.lead ?? null) };
      if (t === "ai_audits") return { select: () => make(fx.audits ?? [], null) };
      if (t === "ai_audit_runs") return { select: () => make(fx.runs ?? [], null) };
      if (t === "ai_audit_queue") return { select: () => make(fx.queue ?? [], null) };
      return { select: () => make([], null) };
    },
  } as Queryable;
}

const LEAD = { amount_paid: null };
const AUDIT = [{ id: "a1" }];
const FULL = FINDABLE_SETUP_PRICE_GBP;

async function price(fx: Fake, leadId: string | null = "lead-1") {
  return await offerPriceForLead(db(fx), leadId);
}

console.log("── THE FOUNDER PRICE, WHEN IT IS EARNED ──");
{
  const r = await price({ lead: LEAD, audits: AUDIT, runs: [{ id: "r1", status: "complete" }] });
  ok(r.gbp === FOUNDER_PRICE_GBP && r.isFounder, `a complete run gets £${FOUNDER_PRICE_GBP} (${r.reason})`);
}
{
  /* The alignment Paul asked for: a capped run that answered something is a real report. */
  const r = await price({
    lead: LEAD, audits: AUDIT,
    runs: [{ id: "r1", status: "capped" }],
    queue: [{ run_id: "r1", status: "done" }, { run_id: "r1", status: "failed" }],
  });
  ok(r.gbp === FOUNDER_PRICE_GBP && r.isFounder, `a CAPPED run with one answer gets £${FOUNDER_PRICE_GBP} (${r.reason})`);
}
{
  const r = await price({
    lead: LEAD, audits: AUDIT,
    runs: [{ id: "r1", status: "failed" }, { id: "r2", status: "capped" }],
    queue: [{ run_id: "r2", status: "done" }],
  });
  ok(r.isFounder, "a failed run alongside a usable capped one does not spoil it");
}

console.log("\n── ⛔ AND WHEN IT IS NOT ──");
{
  /* THE ONE THAT MATTERS. Exactly the ten leads from 2026-08-08: capped because the queue was full,
     zero questions answered, no report. The offer's premise is false, so it must not apply. */
  const r = await price({
    lead: LEAD, audits: AUDIT,
    runs: [{ id: "r1", status: "capped" }],
    queue: [{ run_id: "r1", status: "failed" }, { run_id: "r1", status: "failed" }],
  });
  ok(r.gbp === FULL && !r.isFounder, `capped with ZERO answers pays £${FULL} (${r.reason})`);
  ok(r.reason === "audit_never_ran", "  and says audit_never_ran, not no_completed_audit");
}
{
  /* ⛔ THE ABSENT CASE: a capped run whose queue rows cannot be found at all. Silence is not proof
     of an answer, and the honest reading of no evidence is the full price. */
  const r = await price({ lead: LEAD, audits: AUDIT, runs: [{ id: "r1", status: "capped" }], queue: [] });
  ok(r.gbp === FULL, "a capped run with NO queue rows visible pays full price, not the discount");
}
for (const [label, fx] of [
  ["no audit rows", { lead: LEAD, audits: [], runs: [] }],
  ["audit but no runs", { lead: LEAD, audits: AUDIT, runs: [] }],
  ["only a pending run", { lead: LEAD, audits: AUDIT, runs: [{ id: "r1", status: "pending" }] }],
  ["only a running run", { lead: LEAD, audits: AUDIT, runs: [{ id: "r1", status: "running" }] }],
  ["only a failed run", { lead: LEAD, audits: AUDIT, runs: [{ id: "r1", status: "failed" }] }],
  ["only a cancelled run", { lead: LEAD, audits: AUDIT, runs: [{ id: "r1", status: "cancelled" }] }],
  ["an unknown future status", { lead: LEAD, audits: AUDIT, runs: [{ id: "r1", status: "some_new_state" }] }],
] as Array<[string, Fake]>) {
  const r = await price(fx);
  ok(r.gbp === FULL && !r.isFounder, `${label} -> £${FULL}`);
}

console.log("\n── ⛔ ALREADY A CUSTOMER, AND NO LEAD AT ALL ──");
{
  const r = await price({ lead: { amount_paid: 19.99 }, audits: AUDIT, runs: [{ id: "r1", status: "complete" }] });
  ok(r.gbp === FULL && r.reason === "already_paid", "someone who has paid is not offered it again");
}
ok((await price({ lead: null })).reason === "no_lead", "an unknown lead pays full price");
ok((await price({}, null)).reason === "no_lead", "no lead id at all pays full price");

console.log("\n── ⛔ IT FAILS CLOSED, WHICH IS THE WHOLE SAFETY PROPERTY ──");
/* A transient database error must never hand out an 80% discount, silently, to everyone. */
for (const t of ["outreach_leads", "ai_audits", "ai_audit_runs", "ai_audit_queue"]) {
  const fx: Fake = {
    lead: LEAD, audits: AUDIT,
    runs: [{ id: "r1", status: "capped" }], queue: [{ run_id: "r1", status: "done" }],
    throwOn: t,
  };
  const r = await price(fx);
  ok(r.gbp === FULL && !r.isFounder, `a throw reading ${t} charges the FULL £${FULL}`);
}

console.log("\n── THE LABEL AGREES WITH THE NUMBER ──");
/* The label is what the plan card renders and the number is what Stripe is told. They come from one
   function precisely so they cannot disagree; this asserts they actually do not. */
{
  const a = await price({ lead: LEAD, audits: AUDIT, runs: [{ id: "r1", status: "complete" }] });
  const b = await price({ lead: LEAD, audits: [], runs: [] });
  ok(a.label === `£${a.gbp}`, `founder label ${a.label} matches ${a.gbp}`);
  ok(b.label === `£${b.gbp}`, `full label ${b.label} matches ${b.gbp}`);
  ok(a.gbp < b.gbp, `and the founder price (${a.gbp}) really is lower than full (${b.gbp})`);
}

console.log(f ? `\n${f} FAILURES` : "\nALL PASS");
