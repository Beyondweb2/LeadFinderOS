/* auditStatusFor — the pill next to each lead in the queue's send-order list.
 *
 * The property that matters is that `ready` needs POSITIVE evidence. Painting a lead ready while
 * the drip goes on refusing it would send the operator hunting for a bug in the sender.
 *
 * Run: npx tsx scripts/queue-audit-status.test.ts
 */
import { auditStatusFor, AUDIT_STATUS_PRESENTATION, type AuditRowForStatus } from "../src/lib/queueAuditStatus.ts";

let pass = 0;
const fails: string[] = [];
const eq = (name: string, got: unknown, want: unknown) => {
  if (got === want) pass++;
  else fails.push(`${name} — got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
};
const A = (...statuses: Array<string | null>): AuditRowForStatus =>
  ({ lead_id: "l1", ai_audit_runs: statuses.map((s) => ({ status: s })) });

// ── templates that need no audit show nothing at all
for (const t of ["initial_contact", "onboarding_followup", "booking_page_intro", "re_engage_49", "book_call"]) {
  eq(`${t} -> not_needed`, auditStatusFor(t, []), "not_needed");
  eq(`${t} ignores audits`, auditStatusFor(t, [A("complete")]), "not_needed");
}
// ── an unknown or absent template also shows nothing (never a guess)
for (const t of [null, undefined, "", "some_new_template"]) {
  eq(`template ${JSON.stringify(t)} -> not_needed`, auditStatusFor(t, [A("complete")]), "not_needed");
}

// ── the audit-class templates
for (const t of ["video_template", "audit_reply"]) {
  eq(`${t} no audits -> none`, auditStatusFor(t, []), "none");
  eq(`${t} complete -> ready`, auditStatusFor(t, [A("complete")]), "ready");
  eq(`${t} capped -> ready`, auditStatusFor(t, [A("capped")]), "ready");
  eq(`${t} pending -> running`, auditStatusFor(t, [A("pending")]), "running");
  eq(`${t} running -> running`, auditStatusFor(t, [A("running")]), "running");
  eq(`${t} failed -> failed`, auditStatusFor(t, [A("failed")]), "failed");
  eq(`${t} cancelled -> failed`, auditStatusFor(t, [A("cancelled")]), "failed");
}

const T = "video_template";

// ── ⛔ READY NEEDS POSITIVE EVIDENCE. Every unreadable shape must NOT read as ready.
eq("audit row with no runs -> running", auditStatusFor(T, [{ lead_id: "l1", ai_audit_runs: [] }]), "running");
eq("audit row with absent embed -> running", auditStatusFor(T, [{ lead_id: "l1" }]), "running");
eq("audit row with null embed -> running", auditStatusFor(T, [{ lead_id: "l1", ai_audit_runs: null }]), "running");
eq("unrecognised run status -> running", auditStatusFor(T, [A("who_knows")]), "running");
eq("null run status -> running", auditStatusFor(T, [A(null)]), "running");

// ── a usable run anywhere wins, whatever else is present
eq("failed + complete -> ready", auditStatusFor(T, [A("failed"), A("complete")]), "ready");
eq("complete + pending -> ready", auditStatusFor(T, [A("complete"), A("pending")]), "ready");
eq("mixed runs in one audit -> ready", auditStatusFor(T, [A("failed", "complete")]), "ready");

// ── all dead means failed; one unsettled means still waiting
eq("two failed audits -> failed", auditStatusFor(T, [A("failed"), A("cancelled")]), "failed");
eq("failed + pending -> running", auditStatusFor(T, [A("failed"), A("pending")]), "running");

// ── every renderable state has presentation, and none of it shouts
{
  const states = ["ready", "running", "none", "failed"] as const;
  for (const s of states) {
    const p = AUDIT_STATUS_PRESENTATION[s];
    eq(`${s} has a label`, typeof p?.label === "string" && p.label.length > 0, true);
    eq(`${s} has a tooltip`, typeof p?.title === "string" && p.title.length > 10, true);
  }
  /* ⚠️ The two waiting states must READ as waiting, not as errors - that is the whole point of the
     pill. Only `failed` is allowed to look like a problem. */
  eq("none is muted", AUDIT_STATUS_PRESENTATION.none.className.includes("muted"), true);
  eq("running is not destructive", AUDIT_STATUS_PRESENTATION.running.className.includes("destructive"), false);
  eq("ready is not destructive", AUDIT_STATUS_PRESENTATION.ready.className.includes("destructive"), false);
  eq("failed is destructive", AUDIT_STATUS_PRESENTATION.failed.className.includes("destructive"), true);
  /* And "no audit" must not read as a fault the operator has to fix. */
  eq("none tooltip says it is automatic", /automatic/i.test(AUDIT_STATUS_PRESENTATION.none.title), true);
  eq("running tooltip says it stays queued", /stays queued|sends as soon/i.test(AUDIT_STATUS_PRESENTATION.running.title), true);
}

console.log(`\nqueue-audit-status: ${pass} passed, ${fails.length} failed`);
for (const f of fails) console.log("  FAIL " + f);
if (fails.length) process.exit(1);
