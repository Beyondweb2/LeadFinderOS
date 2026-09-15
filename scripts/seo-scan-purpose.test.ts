/* ════════════════════════════════════════════════════════════════════════════════════════════════
   ONLY A PAID BASELINE BUYS THE WEBSITE SCAN — AND THE PURPOSE DECIDES, NOT A FLAG.

   🔴 THE FAULT (2026-09-15, BS4 Electrical Services Ltd, audit c8a78581, purpose `audit`): a cold
   outreach report carried "Website issues we can fix". The scan was governed by an OPT-OUT —
   `body.skip_seo === true || isMeasurement || isRemeasure || isFreeCheck` — so a caller that did
   not mention skip_seo bought a ~4p Apify scan. The caller that does not mention it is the
   BUSIEST lane in the product: whatsapp-inbound's first-reply auto-audit chain. Measured over the
   whole book: 620 outreach-lane runs scanned, ~95% of every SEO pound ever spent.

   ⛔ WHAT THIS TEST ASSERTS IS THE PROPERTY, NOT THE LIST. It drives the REAL caller bodies —
   including the ones that send no skip_seo at all, which is the entire bug — through the same
   derivation create-ai-audit uses, and requires that everything but a paid baseline declines.
   A test that only checked `seoScanAllowed('audit') === false` would pass on the broken code.

   ⛔ AND ABSENCE IS ASSERTED EXPLICITLY. A null purpose (every row before 2026-09-12, and any
   future caller that forgets to say what it is making) must NOT scan. On a paid API the absent
   value grades "do not spend".
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import {
  seoScanAllowed, SEO_SCAN_PURPOSES,
  BASELINE_AUDIT_PURPOSE, MEASUREMENT_AUDIT_PURPOSE, REMEASURE_AUDIT_PURPOSE,
  FREE_CHECK_AUDIT_PURPOSE, ORDINARY_AUDIT_PURPOSE,
} from "../src/lib/auditKind.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

/* ── THE DERIVATION, MIRRORING create-ai-audit LINE FOR LINE ───────────────────────────────────── */
type Body = { purpose?: string; skip_seo?: unknown };
function wouldScan(body: Body, isInternal: boolean): boolean {
  const isBaseline = isInternal && body.purpose === "baseline";
  const isMeasurement = body.purpose === "measurement";
  const isRemeasure = isInternal && body.purpose === "remeasure";
  const isFreeCheck = isInternal && body.purpose === FREE_CHECK_AUDIT_PURPOSE;
  const auditPurpose = isBaseline ? BASELINE_AUDIT_PURPOSE
    : isRemeasure ? REMEASURE_AUDIT_PURPOSE
    : isMeasurement ? MEASUREMENT_AUDIT_PURPOSE
    : isFreeCheck ? FREE_CHECK_AUDIT_PURPOSE
    : ORDINARY_AUDIT_PURPOSE;
  const skipSeo = body.skip_seo === true || !seoScanAllowed(auditPurpose);
  return !skipSeo;
}

/* ── THE REAL CALL SITES, AS THEY ACTUALLY POST (walked 2026-09-15) ────────────────────────────── */
const CALLERS: Array<{ where: string; body: Body; internal: boolean; scan: boolean }> = [
  // THE BUG. Sends no skip_seo and no purpose. AUTO_AUDIT_REPLY_ENABLED is ON in production.
  { where: "whatsapp-inbound:561 first-reply auto-audit (outreach hook)", body: { }, internal: true, scan: false },
  { where: "whatsapp-inbound:249 legacy reply->audit", body: { }, internal: true, scan: false },
  { where: "AiAudit.tsx wizard single", body: { }, internal: false, scan: false },
  { where: "reAudit quick (1 run)", body: { }, internal: false, scan: false },
  { where: "bulk-jobs plain `audit` job", body: { }, internal: true, scan: false },
  { where: "bulk-jobs audit_and_push", body: { skip_seo: true }, internal: true, scan: false },
  { where: "outreach-audit.ts hook", body: { skip_seo: true }, internal: true, scan: false },
  { where: "free-check-audit.ts run 1", body: { purpose: FREE_CHECK_AUDIT_PURPOSE, skip_seo: true }, internal: true, scan: false },
  { where: "audit-baseline advanceBaseline free-check repeat", body: { purpose: FREE_CHECK_AUDIT_PURPOSE }, internal: true, scan: false },
  { where: "full measure", body: { purpose: "measurement", skip_seo: true }, internal: true, scan: false },
  { where: "day-28 replay", body: { purpose: "remeasure" }, internal: true, scan: false },
  // THE ONE THAT MAY SPEND.
  { where: "startPaidBaseline (the guarantee's day 0)", body: { purpose: "baseline" }, internal: true, scan: true },
  { where: "advanceBaseline paid-baseline repeat run", body: { purpose: "baseline" }, internal: true, scan: true },
];
for (const c of CALLERS) {
  ok(wouldScan(c.body, c.internal) === c.scan, `${c.where} -> ${c.scan ? "scans" : "does NOT scan"}`);
}

/* ⛔ THE REPRODUCTION, KEPT LIVE. The old predicate must FAIL the outreach cases, so a diff that
   restores the opt-out cannot pass this suite quietly. */
const oldSkip = (b: Body, internal: boolean) =>
  b.skip_seo === true || b.purpose === "measurement"
  || (internal && b.purpose === "remeasure") || (internal && b.purpose === FREE_CHECK_AUDIT_PURPOSE);
ok(oldSkip({}, true) === false, "the OLD rule let a no-flag outreach caller scan (this is the bug)");
ok(oldSkip({ purpose: "baseline" }, true) === false, "the old rule also scanned baselines (that part was right)");

/* ── ABSENCE, AND THE ALLOWLIST ITSELF ─────────────────────────────────────────────────────────── */
for (const v of [null, undefined, "", "  ", "AUDIT", "Baseline", "baseline ", "unknown_future_purpose", 0, 1, true, {}, []]) {
  ok(seoScanAllowed(v as never) === false, `absent/unknown purpose ${JSON.stringify(v)} does NOT scan`);
}
ok(seoScanAllowed(BASELINE_AUDIT_PURPOSE), "a paid baseline scans");
ok(SEO_SCAN_PURPOSES.size === 1 && SEO_SCAN_PURPOSES.has(BASELINE_AUDIT_PURPOSE),
   "the allowlist holds exactly one purpose — widening it is a deliberate act, not a default");

/* ⛔ An explicit skip_seo can only ever REDUCE spend, on every purpose including the one that may. */
ok(wouldScan({ purpose: "baseline", skip_seo: true }, true) === false, "explicit skip_seo still wins on a baseline");

console.log(f === 0 ? "\nseo-scan-purpose: OK" : `\n${f} FAILURES`);
process.exit(f ? 1 : 0);
