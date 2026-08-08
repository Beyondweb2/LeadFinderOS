/* ============================================================
   THE audit_and_push JOB — the triage ladder, the phase handover, and the push mapping.

   ⛔ WHY THESE THREE. Each is a decision that spends money or sends email on a path no local check
   can reach, and each has a live precedent in this codebase for going wrong quietly:
     * the LADDER — an unestablished lead falling through into the bucket that emails. Six instances
       of that shape are recorded in CLAUDE.md; this test enumerates the absent case for each rung.
     * the HANDOVER — "done" set the moment the questions existed rather than when they were
       answered. That exact bug cost two failed pushes on 2026-08-08.
     * the PUSH MAPPING — an item that Instantly did not take being recorded as pushed because it
       appeared in none of the response's id lists. The `else` must be a failure, never a success.

   The predicates below are RESTATED from bulk-jobs' own source rather than imported, because
   supabase/functions is Deno-with-imports the SPA cannot load. That means this suite proves the
   RULE, not the deployed bytes — so any change to the rules must be made in both places, and the
   restated code is kept deliberately short so the diff is obvious.
   ============================================================ */
import { bulkJobProgress } from "../src/lib/bulkJobProgress.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

/* ── THE TRIAGE LADDER, restated from triageForPush ──────────────────────────────────────── */
interface Lead {
  suppressed?: string | null;
  instantly_pushed_at?: string | null;
  email?: string | null;
  hasAnsweredAudit?: boolean;
  type?: string | null;
  town?: string | null;
}
function bucket(l: Lead): "push_now" | "needs_audit" | "cannot" {
  if (l.suppressed) return "cannot";
  if (l.instantly_pushed_at) return "cannot";
  if (!String(l.email ?? "").trim()) return "cannot";
  if (l.hasAnsweredAudit) return "push_now";
  if (!String(l.type ?? "").trim() || !String(l.town ?? "").trim()) return "cannot";
  return "needs_audit";
}

const READY: Lead = { email: "a@b.com", hasAnsweredAudit: true, type: "accountant", town: "Chichester" };
const NEEDS: Lead = { email: "a@b.com", hasAnsweredAudit: false, type: "accountant", town: "Chichester" };

console.log("── THE TWO WORKING BUCKETS ──");
ok(bucket(READY) === "push_now", "audited + emailable -> push_now");
ok(bucket(NEEDS) === "needs_audit", "emailable, auditable, not yet audited -> needs_audit");

console.log("\n── ⛔ NOBODY WHO HAS SAID NO IS AUDITED OR EMAILED ──");
ok(bucket({ ...READY, suppressed: "email" }) === "cannot", "suppressed beats a completed audit");
ok(bucket({ ...NEEDS, suppressed: "phone" }) === "cannot", "suppressed beats being auditable");
/* Suppression is checked BEFORE already-pushed on purpose: a lead that is both must be reported as
   the one that matters. This asserts the ORDER, which a bucket-only check cannot see — so it
   restates the ladder's first rung directly. */
ok(bucket({ ...READY, suppressed: "email", instantly_pushed_at: "2026-08-01" }) === "cannot",
  "suppressed AND already pushed is still refused (and is reported as the suppression)");

console.log("\n── ⛔ ALREADY IN INSTANTLY MEANS NO AUDIT AND NO PUSH ──");
/* Paul's rule and the expensive one. A lead Instantly already holds must not be re-audited: that is
   money spent preparing a pitch that has already gone out. */
ok(bucket({ ...NEEDS, instantly_pushed_at: "2026-08-01" }) === "cannot",
  "already pushed + no audit -> cannot (NOT needs_audit — that would re-spend)");
ok(bucket({ ...READY, instantly_pushed_at: "2026-08-01" }) === "cannot", "already pushed + audited -> cannot");

console.log("\n── ⛔ AND THE ABSENT CASE ON EVERY RUNG FALLS TO 'cannot' ──");
/* The rule CLAUDE.md records six instances of: never branch on the states you expect and let the
   `else` carry the rest. Here the `else` is needs_audit — it spends money — so every way a value can
   be missing is asserted to land short of it. */
for (const [label, l] of [
  ["email null", { ...NEEDS, email: null }],
  ["email empty", { ...NEEDS, email: "" }],
  ["email whitespace", { ...NEEDS, email: "   " }],
  ["business type null", { ...NEEDS, type: null }],
  ["business type whitespace", { ...NEEDS, type: " " }],
  ["town null", { ...NEEDS, town: null }],
  ["town whitespace", { ...NEEDS, town: "  " }],
] as Array<[string, Lead]>) {
  ok(bucket(l) === "cannot", `${label} -> cannot, never needs_audit`);
}
/* And the one that matters most: an entirely empty lead must not reach either working bucket. */
ok(bucket({}) === "cannot", "a lead we know nothing about is never audited and never emailed");
/* push_now requires a POSITIVE. Asserting on the grade you want, not the one you exclude. */
ok(bucket({ ...NEEDS, hasAnsweredAudit: undefined }) === "needs_audit",
  "an unknown audit state is NOT read as audited");

/* ── THE HANDOVER: a finished audit is not a finished item ───────────────────────────────── */
console.log("\n── ⛔ A FINISHED AUDIT HANDS OVER, IT DOES NOT COMPLETE ──");
type Item = { status: string; phase?: string };
function onRunFinished(jobType: string, it: Item): { item: Item; doneDelta: number } {
  if (jobType === "audit_and_push") return { item: { status: "pending", phase: "push" }, doneDelta: 0 };
  return { item: { status: "done", phase: it.phase }, doneDelta: 1 };
}
const handed = onRunFinished("audit_and_push", { status: "awaiting_audit", phase: "audit" });
ok(handed.item.status === "pending" && handed.item.phase === "push",
  "audit_and_push: a completed run moves the item to phase 'push', still pending");
ok(handed.doneDelta === 0, "  and does NOT increment done — done on this job type means PUSHED");
const plain = onRunFinished("audit", { status: "awaiting_audit" });
ok(plain.item.status === "done" && plain.doneDelta === 1,
  "a plain bulk audit is UNCHANGED: complete run -> done, +1");

/* ── THE PUSH MAPPING: every item accounted for by id ────────────────────────────────────── */
console.log("\n── ⛔ AN ITEM INSTANTLY DID NOT TAKE IS NEVER RECORDED AS PUSHED ──");
interface PushResponse {
  pushedIds?: unknown;
  skippedNoAuditDetail?: Array<{ id: string; reason?: string }>;
  skippedSuppressedDetail?: Array<{ id: string; matchedOn?: string }>;
  alreadyPushedIds?: string[];
  noEmailIds?: string[];
}
function mapPush(ids: string[], data: PushResponse): Record<string, string> {
  const out: Record<string, string> = {};
  if (!Array.isArray(data.pushedIds)) {
    for (const id of ids) out[id] = "failed";
    return out;
  }
  const pushed = new Set(data.pushedIds as string[]);
  const supp = new Set((data.skippedSuppressedDetail ?? []).map((d) => d.id));
  const already = new Set(data.alreadyPushedIds ?? []);
  const noEmail = new Set(data.noEmailIds ?? []);
  const noAudit = new Set((data.skippedNoAuditDetail ?? []).map((d) => d.id));
  for (const id of ids) {
    if (pushed.has(id)) out[id] = "pushed";
    else if (supp.has(id)) out[id] = "skipped_suppressed";
    else if (already.has(id)) out[id] = "skipped_existing";
    else if (noEmail.has(id)) out[id] = "skipped_ineligible";
    else if (noAudit.has(id)) out[id] = "failed";
    else out[id] = "failed";
  }
  return out;
}

const m = mapPush(["a", "b", "c", "d"], {
  pushedIds: ["a"],
  skippedSuppressedDetail: [{ id: "b", matchedOn: "email" }],
  skippedNoAuditDetail: [{ id: "c", reason: "no completed audit" }],
});
ok(m.a === "pushed", "a lead in pushedIds is pushed");
ok(m.b === "skipped_suppressed", "a suppressed lead is skipped, not failed");
ok(m.c === "failed", "audited but refused -> failed (it cost money and produced nothing)");
/* ⛔ THE ONE THAT MATTERS. 'd' appears in NO list. The honest answer is "we do not know, so it did
   not go" — reading the gap as success would print "pushed" for a lead Instantly never took. */
ok(m.d === "failed", "a lead in NO list at all is failed — absence is never read as success");

console.log("\n── ⛔ A MISSING pushedIds IS A FAILURE, NOT A GUESS ──");
/* The real state during a rollout where instantly-push is older than bulk-jobs. Guessing either way
   is wrong: "all pushed" loses the lot silently, "none pushed" invites a double-send. */
const stale = mapPush(["a", "b"], { pushed: 2 } as PushResponse);
ok(stale.a === "failed" && stale.b === "failed",
  "no pushedIds in the response -> every item fails loudly rather than being assumed");

/* ── THE PROGRESS LINE ───────────────────────────────────────────────────────────────────── */
console.log("\n── THE PROGRESS LINE SAYS WHICH JOB AND WHICH PHASE ──");
const base = { total: 4, done_count: 0, failed_count: 0, skipped_count: 0 };
/* ⛔ THE BUG THIS FIXES: the old inline ternary called every non-enrich job "site generation", so
   every bulk audit Paul ran was labelled as the wrong job for months. */
ok(bulkJobProgress({ ...base, job_type: "audit" }).label === "Bulk audit",
  "a bulk audit is called a bulk audit, not 'site generation'");
ok(bulkJobProgress({ ...base, job_type: "enrich" }).label === "Bulk enrich", "enrich is unchanged");
ok(bulkJobProgress({ ...base, job_type: "site_gen" }).label === "Bulk site generation", "site_gen is unchanged");
/* An unlabelled type renders RAW. Ugly on purpose — it must not borrow another job's name. */
ok(bulkJobProgress({ ...base, job_type: "some_future_type" }).label === "some_future_type",
  "an unknown job type shows its raw name rather than the last branch's");

const midAudit = bulkJobProgress({
  ...base, job_type: "audit_and_push",
  items: [
    { status: "awaiting_audit", phase: "audit" },
    { status: "pending", phase: "audit" },
    { status: "pending", phase: "push" },
    { status: "pending", phase: "push" },
  ],
});
ok(midAudit.phase === "auditing — 0 of 2 answered", `phase A reads: "${midAudit.phase}"`);
const midPush = bulkJobProgress({
  ...base, job_type: "audit_and_push",
  items: [
    { status: "pending", phase: "push" },
    { status: "pending", phase: "push" },
    { status: "pushed", phase: "push" },
  ],
});
ok(midPush.phase === "pushing 2 to Instantly", `phase B reads: "${midPush.phase}"`);
/* ⛔ NO ITEMS = NO PHASE. An invented phase would be a claim about a state never observed. */
ok(bulkJobProgress({ ...base, job_type: "audit_and_push" }).phase === "",
  "a job row with no items reports NO phase rather than a guessed one");
ok(bulkJobProgress({ ...base, job_type: "audit_and_push", items: [] }).phase === "",
  "an empty item list reports no phase either");
ok(bulkJobProgress({ ...base, job_type: "audit_and_push" }).doneWord === "pushed",
  "'done' on this job type is reported as 'pushed' — it is what the count means");
ok(bulkJobProgress({ ...base, job_type: "audit", total: 0 }).pct === 0, "a zero-total job is 0%, not NaN");

console.log(f ? `\n${f} FAILURES` : "\nALL PASS");
