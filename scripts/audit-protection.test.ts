/* ============================================================
   AN AUDIT WE CANNOT VOUCH FOR MUST NOT BE ARCHIVABLE.

   ⛔ THE SHAPE. Deleting an ai_audits row CASCADES its runs and its queue rows — the stored
   answers, the `named` flags, the whole measurement — and nothing is backed up. RG Locksmiths'
   paid baseline is the "before" half of a guarantee that was sold to a paying customer, and
   before 2026-09-10 it carried the same 24px trash icon as a throwaway prospect audit.

   ⛔ AND THE ABSENT CASE POINTS THE OTHER WAY FROM USUAL. Everywhere else in this codebase
   "could not tell" must not become a positive claim; here "could not tell" must not become
   PERMISSION. A paid-lead read denied by RLS returns 200 with [] (CLAUDE.md §8), which reads
   exactly like "this lead never paid" — so the caller passes null and null protects. This is the
   absent-value law (CLAUDE.md §6) aimed at the one action that destroys evidence.

   ⚠️ The asymmetry that settles every case below: a refusal costs a conversation, a wrong
   archive costs the measurement. Refuse, and say why.
   ============================================================ */
import {
  auditProtection,
  protectionSummary,
  PROTECTION_WORDING,
  type AuditProtectionFacts,
  type ProtectionReason,
} from "../src/lib/auditProtection.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

/** An ordinary prospect audit: nothing special, everything checked, nothing found. */
const PLAIN: AuditProtectionFacts = {
  baselineTargetRuns: null,
  isMeasurement: false,
  leadIsPaying: false,
};

console.log("── THE ONLY ARCHIVABLE SHAPE: every check RAN and every one came back negative ──");
{
  const v = auditProtection(PLAIN);
  ok(v.isProtected === false, "plain prospect audit -> archivable");
  ok(v.reasons.length === 0, "plain prospect audit -> no reasons");
  ok(v.uncertain === false, "plain prospect audit -> not uncertain");
  ok(protectionSummary(v) === "", "plain prospect audit -> empty summary");
}

console.log("\n── ⛔ A PAID BASELINE IS NEVER ARCHIVABLE (RG Locksmiths' guarantee evidence) ──");
for (const runs of [1, 2, 3, 5, 12]) {
  const v = auditProtection({ ...PLAIN, baselineTargetRuns: runs });
  ok(v.isProtected, `baseline_target_runs=${runs} -> protected`);
  ok(v.reasons[0] === "paid_baseline", `baseline_target_runs=${runs} -> leads with paid_baseline`);
}

console.log("\n── ⚠️ BUT A STORED 0 IS NOT A BASELINE, AND MUST NOT PROTECT EVERY AUDIT ──");
/* `> 0`, not merely non-null. A zero means no repeat runs were ever targeted; reading it as a
   baseline would quietly make the whole book unarchivable and the feature pointless. */
{
  const v = auditProtection({ ...PLAIN, baselineTargetRuns: 0 });
  ok(v.isProtected === false, "baseline_target_runs=0 -> NOT a baseline, archivable");
}

console.log("\n── ⛔ THE OTHER TWO POSITIVE REASONS EACH PROTECT ON THEIR OWN ──");
{
  const meas = auditProtection({ ...PLAIN, isMeasurement: true });
  ok(meas.isProtected && meas.reasons.includes("measurement"), "is_measurement -> protected");

  const paid = auditProtection({ ...PLAIN, leadIsPaying: true });
  ok(paid.isProtected && paid.reasons.includes("paying_customer"), "paying customer -> protected");
}

console.log("\n── 🔴 THE WHOLE POINT: A CHECK THAT COULD NOT RUN PROTECTS, IT DOES NOT PERMIT ──");
/* This is the RLS 200-with-[] trap. If the paid-lead read is denied, it returns no rows, which
   is indistinguishable from a lead that never paid. The caller must pass null, and null refuses. */
{
  const noPay = auditProtection({ ...PLAIN, leadIsPaying: null });
  ok(noPay.isProtected, "leadIsPaying=null -> PROTECTED (a failed read is not a clean bill)");
  ok(noPay.uncertain, "leadIsPaying=null -> flagged uncertain, not asserted as fact");
  ok(noPay.reasons.includes("unknown_paying_status"), "leadIsPaying=null -> names the failed check");

}

console.log("\n── ⚠️ is_measurement=null MUST NOT BE READ AS true EITHER ──");
/* Unlike the two lookups, is_measurement is a column already on the row we fetched, so a null
   there genuinely means "not a measurement" rather than "we failed to ask". It must not protect
   on its own, or every legacy row (the column postdates most of the book) becomes permanent. */
{
  const v = auditProtection({ ...PLAIN, isMeasurement: null });
  ok(v.isProtected === false, "is_measurement=null -> archivable (the column is simply absent on old rows)");
}

console.log("\n── ⛔ A REAL REASON OUTRANKS A DOUBT: lead with a fact AND a failed check ──");
/* An operator reading "could not check payment" on their own customer's baseline would think the
   tool was broken. The positive fact leads; the doubt is not the headline. */
{
  const v = auditProtection({ ...PLAIN, baselineTargetRuns: 3, leadIsPaying: null });
  ok(v.isProtected, "baseline + failed pay check -> protected");
  ok(v.reasons[0] === "paid_baseline", "the FACT leads, not the doubt");
  ok(v.uncertain === false, "not flagged uncertain when a positive reason exists");
  ok(protectionSummary(v) === PROTECTION_WORDING.paid_baseline, "summary is the fact, not the doubt");
}

console.log("\n── ORDERING: most load-bearing reason first, whatever order the facts arrive in ──");
{
  const v = auditProtection({
    baselineTargetRuns: 3,
    isMeasurement: true,
    leadIsPaying: true,
  });
  const expected: ProtectionReason[] = ["paid_baseline", "measurement", "paying_customer"];
  ok(JSON.stringify(v.reasons) === JSON.stringify(expected), `all three -> ${expected.join(" > ")}`);
}

console.log("\n── EVERY REASON HAS WORDING, AND A PROTECTED VERDICT IS NEVER SILENT ──");
/* A control that refuses without saying why is the failure CLAUDE.md §6c names: a button that
   visibly does nothing. Every reason the module can emit must have a sentence attached. */
{
  const all: ProtectionReason[] = [
    "paid_baseline", "measurement",
    "paying_customer", "unknown_paying_status",
  ];
  for (const r of all) {
    const w = PROTECTION_WORDING[r];
    ok(typeof w === "string" && w.length > 20, `${r} has real wording`);
  }
  /* Drive every single-reason shape and assert none produces an empty summary. */
  const shapes: AuditProtectionFacts[] = [
    { ...PLAIN, baselineTargetRuns: 3 },
    { ...PLAIN, isMeasurement: true },
    { ...PLAIN, leadIsPaying: true },
    { ...PLAIN, leadIsPaying: null },
  ];
  for (const s of shapes) {
    const v = auditProtection(s);
    ok(protectionSummary(v).length > 0, `protected verdict always states a reason (${v.reasons[0]})`);
  }
}

console.log("\n── EXHAUSTIVE: all 3×3×4 fact combinations, and the invariant that must hold ──");
/* The invariant is the feature in one line: an audit is archivable ONLY when every check ran and
   every one came back negative. Driving the whole space stops a later reason being added on the
   permissive side by accident. */
{
  let checked = 0, violations = 0;
  const tri = [true, false, null] as (boolean | null)[];
  for (const baseline of [null, 0, 1, 3] as (number | null)[]) {
    for (const isMeasurement of tri) {
      for (const leadIsPaying of tri) {
        const v = auditProtection({ baselineTargetRuns: baseline, isMeasurement, leadIsPaying });
        const allClear =
          !(typeof baseline === "number" && baseline > 0) &&
          isMeasurement !== true &&
          leadIsPaying === false;
        checked++;
        if (v.isProtected === allClear) {
          violations++;
          console.log(`   violation: ${JSON.stringify({ baseline, isMeasurement, leadIsPaying })}`);
        }
        if (v.isProtected) {
          if (v.reasons.length === 0) { violations++; console.log("   protected with no reason"); }
          if (protectionSummary(v) === "") { violations++; console.log("   protected with no summary"); }
        }
      }
    }
  }
  ok(checked === 36, `drove all ${checked} combinations`);
  ok(violations === 0, "archivable ONLY when every check ran and every one was negative");
}

console.log(f === 0 ? "\nALL PASS" : `\n${f} FAILURES`);
process.exit(f === 0 ? 0 : 1);
