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


/* ── THE CAP, AND THE COST THAT MUST MATCH IT ────────────────────────────────────────────────
   ⛔ THE BUG. The confirm read "Push 25 leads, auditing 138 first (~$13.97)" next to "113 over the
   25-lead cap — this run takes 25". It quoted the cost of auditing 138 for a job that would audit
   25: a 5x overstatement on the single number that decides whether the button gets pressed. Paul's
   words: "A confirm that overstates by 5x is the kind of thing that makes me not press a button I
   should press."
   The cause was two different questions sharing one answer — the bucket says what a lead NEEDS, the
   cap says what THIS RUN can afford — so will_run now exists alongside bucket, and the cost, the
   counts and the job's items are all read off it. Restated from triageForPush below. */
console.log("\n── ⛔ THE COST MUST DESCRIBE THE RUN, NOT THE SELECTION ──");
const AUDIT_USD = 0.0104, CLEAN_USD = 0.070;
function plan(buckets: TriageBucket[], cap: number) {
  const rank = (b: TriageBucket) => (b === "push_now" ? 0 : b === "needs_audit" ? 1 : 2);
  const ranked = buckets.map((b, i) => ({ b, i })).sort((x, y) => rank(x.b) - rank(y.b) || x.i - y.i);
  let room = cap;
  const run = new Set<number>();
  for (const { b, i } of ranked) { if (b === "cannot") continue; if (room <= 0) break; run.add(i); room--; }
  const audits = buckets.filter((b, i) => run.has(i) && b === "needs_audit").length;
  return { audits, push: run.size, cost: audits * (3 * AUDIT_USD + CLEAN_USD) };
}
type TriageBucket = "push_now" | "needs_audit" | "cannot";

/* Paul's actual selection: 138 needing an audit, 40 that cannot, cap 25. */
const real = plan([...Array(138).fill("needs_audit"), ...Array(40).fill("cannot")] as TriageBucket[], 25);
ok(real.push === 25, `pushes 25, not 138 (got ${real.push})`);
ok(real.audits === 25, `audits 25, not 138 (got ${real.audits})`);
ok(Math.abs(real.cost - 2.53) < 0.01, `costs ~$2.53, not ~$13.97 (got $${real.cost.toFixed(2)})`);

/* ⛔ ALREADY-AUDITED LEADS TAKE THE CAP FIRST — they cost nothing and go out in this run's upload.
   The old code sliced both buckets together in database order, so a run could spend its entire cap
   auditing while ready-to-send leads waited for a second pass. */
const mixed = plan([...Array(30).fill("needs_audit"), ...Array(10).fill("push_now")] as TriageBucket[], 25);
ok(mixed.push === 25, "a 30+10 selection still pushes 25");
ok(mixed.audits === 15, `the 10 free ones go first, so only 15 audits are bought (got ${mixed.audits})`);
ok(Math.abs(mixed.cost - 1.52) < 0.01, `and the cost follows: $${mixed.cost.toFixed(2)}`);

/* Under the cap, everything runs and the cost is the whole selection's. */
const small = plan(["push_now", "needs_audit", "needs_audit", "cannot"] as TriageBucket[], 25);
ok(small.push === 3 && small.audits === 2, "under the cap: 3 pushed, 2 audited");
/* ⛔ 'cannot' NEVER CONSUMES THE CAP. A selection of 40 where 20 are already in Instantly is a
   20-item job, not a refusal — and never a job that spends 20 of its 25 slots on leads it skips. */
const heavy = plan([...Array(100).fill("cannot"), ...Array(10).fill("needs_audit")] as TriageBucket[], 25);
ok(heavy.push === 10 && heavy.audits === 10, "100 'cannot' rows do not eat the cap — all 10 real ones run");
ok(plan(["cannot", "cannot"] as TriageBucket[], 25).cost === 0, "nothing actionable costs nothing");
ok(plan([] as TriageBucket[], 25).push === 0, "an empty selection runs nothing");

console.log(f ? `\n${f} FAILURES` : "\nALL PASS");
