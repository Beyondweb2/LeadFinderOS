/* The outreach audit-ahead lane's decision function.
 *
 * The property that matters is the one that did not exist before: WAIT is distinct from DEQUEUE.
 * Conflating them is what would have silently un-queued 16 leads, so most of these assertions are
 * about which of the three outcomes fires, not about the audit itself.
 *
 * Run: npx tsx scripts/outreach-audit.test.ts
 */
import {
  decideOutreachAudit, waCapableForOutreach, templateNeedsAudit,
  auditTradeFor, auditTownFor,
  OUTREACH_AUDIT_QUESTIONS, OUTREACH_AUDIT_RUNS, OUTREACH_AUDIT_CONCURRENCY,
  OUTREACH_AUDIT_REPEAT_DAYS, OUTREACH_AUDIT_STALE_MS,
  type OutreachAuditLead, type AuditState,
} from "../supabase/functions/_shared/outreach-audit.ts";

let pass = 0;
const fails: string[] = [];
const ok = (name: string, cond: boolean, extra = "") => {
  if (cond) pass++; else fails.push(`${name}${extra ? ` — ${extra}` : ""}`);
};
const eq = (name: string, got: unknown, want: unknown) =>
  ok(name, got === want, `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);

const LEAD = (over: Partial<OutreachAuditLead> = {}): OutreachAuditLead => ({
  id: "l1", business_name: "Acme Locks", search_keyword: "locksmith", category: null,
  search_location: "Poole", derived_town: "Poole", address: "1 High St", country: "UK",
  website: "https://acme.example", line_type: "mobile", ...over,
});
const NONE: AuditState = { completedAt: null, inFlightSince: null };
const NOW = Date.UTC(2026, 8, 2, 12, 0, 0);
const ago = (ms: number) => new Date(NOW - ms).toISOString();

// ── THE CASE THAT PROMPTED THIS: queued, mobile, no audit at all → START (never dequeue)
{
  const d = decideOutreachAudit(LEAD(), NONE, NOW);
  eq("no audit + mobile -> start", d.start, true);
}

// ── ⛔ AN IN-FLIGHT AUDIT MEANS WAIT, NOT DEQUEUE. The whole point.
for (const mins of [0, 1, 5, 20, 44]) {
  const d = decideOutreachAudit(LEAD(), { completedAt: null, inFlightSince: ago(mins * 60000) }, NOW);
  eq(`in flight ${mins}min -> not started`, d.start, false);
  ok(`in flight ${mins}min -> WAIT`, d.start === false && d.wait === true, JSON.stringify(d));
}

// ── ⛔ BUT THE WAIT IS BOUNDED: a wedged audit must not stall the queue forever.
{
  const justOver = decideOutreachAudit(LEAD(), { completedAt: null, inFlightSince: ago(OUTREACH_AUDIT_STALE_MS + 60000) }, NOW);
  ok("wedged audit -> stops waiting", justOver.start === false && justOver.wait === false, JSON.stringify(justOver));
  const justUnder = decideOutreachAudit(LEAD(), { completedAt: null, inFlightSince: ago(OUTREACH_AUDIT_STALE_MS - 60000) }, NOW);
  ok("just inside the window -> still waits", justUnder.start === false && justUnder.wait === true);
}

// ── the spend guard: a recent completed audit is never re-run
for (const days of [0, 1, 10, OUTREACH_AUDIT_REPEAT_DAYS - 1]) {
  const d = decideOutreachAudit(LEAD(), { completedAt: ago(days * 86400000), inFlightSince: null }, NOW);
  eq(`completed ${days}d ago -> no new audit`, d.start, false);
  ok(`completed ${days}d ago -> no wait either`, d.start === false && d.wait === false);
}
// ⛔ AND AN OLD COMPLETED AUDIT IS STILL NOT RE-RUN — the message only needs a report link.
{
  const d = decideOutreachAudit(LEAD(), { completedAt: ago(400 * 86400000), inFlightSince: null }, NOW);
  eq("very old completed audit -> still no re-audit", d.start, false);
  ok("very old completed audit -> reused, not waited on", d.start === false && d.wait === false);
}

// ── ⛔ NO WHATSAPP -> NO AUDIT (requirement 2), and each proven state on its own
for (const over of [
  { whatsapp_delivery_status: "no_whatsapp" },
  { status: "no_whatsapp" },
  { status: "no_whatsapp_needs_sms" },
  { status: "whatsapp_failed" },
  { previous_status: "no_whatsapp" },
  { line_type: "landline" },
  { line_type: "LANDLINE" },
  { line_type: " landline " },
]) {
  const d = decideOutreachAudit(LEAD(over), NONE, NOW);
  eq(`no-wa ${JSON.stringify(over)} -> no audit`, d.start, false);
  ok(`no-wa ${JSON.stringify(over)} -> dequeue, not wait`, d.start === false && d.wait === false);
}

// ── ⛔ ABSENCE IS NOT A NEGATIVE: an unknown line_type must still be audited.
for (const line of [null, undefined, "", "  ", "unknown", "UNKNOWN", "voip", "mobile"]) {
  const cap = waCapableForOutreach(LEAD({ line_type: line as string | null }));
  eq(`line_type ${JSON.stringify(line)} -> audit allowed`, cap.audit, true);
}
// and the one that is refused, for contrast
eq("line_type landline -> refused", waCapableForOutreach(LEAD({ line_type: "landline" })).audit, false);

// ── a lead that cannot be audited at all is dequeued, not waited on
for (const over of [
  { business_name: "" }, { business_name: null },
  { search_keyword: null, category: null },
  { derived_town: null, search_location: null, address: null },
]) {
  const d = decideOutreachAudit(LEAD(over as Partial<OutreachAuditLead>), NONE, NOW);
  eq(`unauditable ${JSON.stringify(over)} -> no start`, d.start, false);
  ok(`unauditable ${JSON.stringify(over)} -> dequeue`, d.start === false && d.wait === false);
}
// category is the fallback when search_keyword is absent
eq("trade falls back to category", auditTradeFor(LEAD({ search_keyword: null, category: "Locksmith" })), "Locksmith");

// ── ⛔ THE TOWN IS derived_town FIRST, never the searched town when both exist.
eq("town prefers derived_town", auditTownFor(LEAD({ derived_town: "Huntingdon", search_location: "Wisbech" })), "Huntingdon");
eq("town falls back to search_location", auditTownFor(LEAD({ derived_town: null, search_location: "Wisbech" })), "Wisbech");
eq("town falls back to address last", auditTownFor(LEAD({ derived_town: null, search_location: null })), "1 High St");

// ── which templates need an audit: from DECLARED vars, never the name
eq("audit_reply vars need audit", templateNeedsAudit(["trade", "competitors", "name", "url"]), true);
eq("video_template vars need audit", templateNeedsAudit(["name", "trade", "town", "audit_url"]), true);
eq("free_check_result vars need audit", templateNeedsAudit(["name", "trade", "town", "audit_url", "onboarding_url"]), true);
eq("initial_contact does not", templateNeedsAudit(["name"]), false);
eq("onboarding_followup does not", templateNeedsAudit(["name", "onboarding_url"]), false);
eq("absent vars -> not audit-class", templateNeedsAudit(undefined), false);
eq("empty vars -> not audit-class", templateNeedsAudit([]), false);

// ── the config is the outreach one, and separate from the free check's 5x3
eq("outreach asks 3 questions", OUTREACH_AUDIT_QUESTIONS, 3);
eq("outreach runs once", OUTREACH_AUDIT_RUNS, 1);
eq("concurrency is 3", OUTREACH_AUDIT_CONCURRENCY, 3);
ok("concurrency is a real cap", OUTREACH_AUDIT_CONCURRENCY >= 1 && OUTREACH_AUDIT_CONCURRENCY <= 10);
/* ⛔ THE LANES MUST NOT CONVERGE. If someone ever "tidies" these to share a constant, the free
   check silently drops to 1 run (it is emailed as a frequency) or outreach triples its spend. */
{
  const fc = await import("../supabase/functions/_shared/free-check-audit.ts")
    .then((m) => ({ q: m.FREE_CHECK_QUESTIONS, r: m.FREE_CHECK_RUNS })).catch(() => null);
  if (fc) {
    eq("free check still asks 5", fc.q, 5);
    eq("free check still runs 3", fc.r, 3);
    ok("the two lanes differ", fc.q !== OUTREACH_AUDIT_QUESTIONS && fc.r !== OUTREACH_AUDIT_RUNS);
  } else {
    ok("free-check constants importable", false, "could not import free-check-audit.ts");
  }
}

console.log(`\noutreach-audit: ${pass} passed, ${fails.length} failed`);
for (const f of fails) console.log("  FAIL " + f);
if (fails.length) process.exit(1);
