/* ════════════════════════════════════════════════════════════════════════════════════════════════
   WHAT KIND OF AUDIT IS THIS? — the writer's rule and the reader's rule, in ONE module.

   🔴 THE FIRST INCIDENT (2026-09-12): ONE PAYMENT CREATED TEN PAID BASELINES, ~£3.70 of Apify, in a
   loop that ran every queue tick until the onboarding row was reset by hand.

   Two guards in two files, each correct about its own problem, contradicting each other:

     · create-ai-audit wrote  `is_measurement = true` when `isMeasurement || baselineTargetRuns > 1`
       — widened so that an unmarked 3-run FREE-CHECK audit could not be mistaken for a baseline.
     · audit-baseline read    "already has a baseline" as `baseline_target_runs > 1 && is_measurement
       !== true`.

   A paid baseline sends `baseline_target_runs: 3`, so the writer marked it `is_measurement` — the
   exact condition the reader excludes. `startPaidBaseline` could never see the audit it had just
   created, so `ensureBaselinesForPaidOnboardings` made another one every tick.

   🔴 THE SECOND (found 2026-09-13, before it reached a customer): THE FIX GRADED EVERY 3-RUN FREE
   CHECK AS AMBIGUOUS, SO A PROSPECT WHO TOOK THE FREE CHECK AND THEN PAID NEVER GOT A BASELINE.
   The reader had only `baseline_target_runs`, `is_measurement` and `baseline_contract` to go on,
   and on those three columns a free check and a baseline whose contract write failed are the same
   row. Refusing both was the safe direction — but it refused the funnel's own happy path, and it
   wrote a client_error_reports row every 30 seconds while doing so.

   ⛔ `audit_purpose` EXISTS NOW (Slice 0, 2026-09-12), SO THE KIND IS READ FROM WHAT THE WRITER
   SAID THE AUDIT WAS FOR. A baseline is `audit_purpose = 'baseline'`; a free check is
   `audit_purpose = 'free_check'`; nothing else can match either. The contract is no longer how a
   baseline is RECOGNISED — it is how a RECOGNISED baseline is checked for a failed contract write,
   which is the one case the ambiguity refusal was built for and the only one it still fires on.
   ⚠️ Rows written before the column existed (every audit before 2026-09-12) have no purpose, and
   for those the old three-column rule still applies, refusal included: a legacy free check still
   holds a later payment until somebody looks. That is stated, not hidden — see auditKind().

   ⛔ THE TWO RULES LIVE HERE, TOGETHER, AND THE TEST DRIVES THEM AS A ROUND TRIP: take what the
   writer sets, hand it to the reader, assert the reader recognises it — and assert a free check
   handed to the reader is neither a baseline nor a reason to refuse one.

   ⚠️ `is_measurement` MUST NOT BE INFERRED FROM RUN COUNT. One flag cannot mean both "has more than
   one run" and "is not the paid baseline": the paid baseline, the free check and a re-measure are
   ALL multi-run. Run count is a cost decision; kind is a purpose. They are different questions and
   the column answers only the second one.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** What `create-ai-audit` writes to `ai_audits.audit_purpose`, and what every reader keys on.
 *  ⚠️ The DB trigger that claims `outreach_leads.baseline_audit_id` reads 'baseline' and the one
 *  that claims `remeasure_audit_id` reads 'remeasure' — those two spellings are load-bearing in SQL
 *  as well as here. 'free_check' is read only by code. */
export const BASELINE_AUDIT_PURPOSE = 'baseline';
export const MEASUREMENT_AUDIT_PURPOSE = 'measurement';
export const REMEASURE_AUDIT_PURPOSE = 'remeasure';
export const FREE_CHECK_AUDIT_PURPOSE = 'free_check';
export const ORDINARY_AUDIT_PURPOSE = 'audit';
/* DISCOVERY — the manual 40 x 1 breadth scan (2026-09-20). A RECORDED purpose, so auditKind grades
   it 'ordinary': it is single-run, it is never a baseline and it can never hold one. It is NOT in
   SEO_SCAN_PURPOSES, so it buys no website scan — absence is not permission (see seoScanAllowed).
   ⚠️ `ai_audits.audit_purpose` is plain nullable text with NO check constraint (verified against
   the live database 2026-09-20), so this value needs no migration. */
export const DISCOVERY_AUDIT_PURPOSE = 'discovery';

/** The audit kinds a reader can meet. */
export type AuditKind =
  /** A paid day-0 baseline: purpose 'baseline' (or a legacy multi-run row) carrying its frozen contract. */
  | 'paid_baseline'
  /** A Full Measurement or the day-28 replay. Marked at creation from its PURPOSE. */
  | 'measurement'
  /** The free check: purpose 'free_check'. Multi-run, never a baseline, never ambiguous. */
  | 'free_check'
  /** The breadth scan: purpose 'discovery'. Multi-run and multi-question by design, and NEVER the
   *  client's baseline — it exists to CHOOSE the baseline's questions, not to be them. Graded apart
   *  from 'ordinary' so no screen has to infer it from a question count. */
  | 'discovery'
  /** Any other RECORDED purpose ('audit', 'market', …): a hook, a wizard audit, a manual re-audit.
   *  Whatever its run count, it is neither a baseline nor a reason to hold one. */
  | 'ordinary'
  /** AMBIGUOUS — the one kind that refuses a spend: purpose 'baseline' with NO contract (a failed
   *  contract write), or a LEGACY multi-run row with no purpose and no contract (a pre-2026-09-12
   *  free check and a pre-2026-09-12 failed baseline are indistinguishable on the row). */
  | 'multi_run_unmarked'
  /** One run, no recorded purpose (legacy). */
  | 'single_run';

/** Only the columns any of this reasons about. Deliberately narrow so a caller cannot pass a whole
 *  row and have an unrelated column quietly start mattering. */
export interface AuditKindRow {
  id?: string;
  baseline_target_runs?: number | null;
  is_measurement?: boolean | null;
  /** Written by startPaidBaseline immediately after the audit exists (best-effort, so it CAN be
   *  missing on a real baseline — which is exactly what the ambiguity refusal is for). */
  baseline_contract?: unknown;
  /** Written by create-ai-audit IN the insert since 2026-09-12. Null on every older row. */
  audit_purpose?: string | null;
}

/**
 * WHAT create-ai-audit WRITES to `is_measurement`.
 *
 * ⛔ THE PURPOSE, AND NOTHING ELSE. It used to be `isMeasurement || baselineTargetRuns > 1`, and
 * that second clause is the whole first incident: it made the paid baseline mark itself as the one
 * thing the baseline guard excludes. Run count is deliberately NOT an input here.
 */
export function measurementFlagFor(purposeIsMeasurement: boolean): boolean {
  return purposeIsMeasurement === true;
}

/** A contract that is not a contract: null / undefined / `{}` / `""` / a number are all ABSENCE.
 *  An empty stamp must never count — a baseline validating on `{}` would pass on a write that
 *  stored nothing. */
function hasContract(c: unknown): boolean {
  return !!c && typeof c === 'object' && Object.keys(c as object).length > 0;
}

const purposeOf = (row: AuditKindRow | null | undefined): string =>
  typeof row?.audit_purpose === 'string' ? row.audit_purpose.trim().toLowerCase() : '';

/** Grade one audit row. Pure, and the single place the column meanings are interpreted. */
export function auditKind(row: AuditKindRow): AuditKind {
  const purpose = purposeOf(row);
  const contract = hasContract(row?.baseline_contract);

  /* ⛔ THE RECORDED PURPOSE WINS. It is what the writer said the audit was for, in the same insert
     that created it, and no other column can contradict it. */
  if (purpose) {
    if (purpose === BASELINE_AUDIT_PURPOSE) return contract ? 'paid_baseline' : 'multi_run_unmarked';
    if (purpose === MEASUREMENT_AUDIT_PURPOSE || purpose === REMEASURE_AUDIT_PURPOSE) return 'measurement';
    if (purpose === FREE_CHECK_AUDIT_PURPOSE) return 'free_check';
    if (purpose === DISCOVERY_AUDIT_PURPOSE) return 'discovery';
    return 'ordinary';
  }

  /* LEGACY — no purpose recorded. The pre-2026-09-12 rule, unchanged, refusal included. */
  const runs = Number(row?.baseline_target_runs ?? 0);
  if (!(runs > 1)) return 'single_run';
  if (row?.is_measurement === true) return 'measurement';
  return contract ? 'paid_baseline' : 'multi_run_unmarked';
}

/**
 * Does this lead already have its paid day-0 baseline?
 *
 * ⛔ A POSITIVE TEST. Written as "which rows ARE a baseline" rather than "which rows are not a
 * measurement", because the second form is what failed in the first incident: it admitted every
 * multi-run audit that happened not to be flagged, and then the flag changed underneath it.
 */
export function findPaidBaseline<T extends AuditKindRow>(rows: readonly T[] | null | undefined): T | null {
  return (rows ?? []).find((r) => auditKind(r) === 'paid_baseline') ?? null;
}

/**
 * Multi-run audits we cannot classify — and therefore refuse to spend beside.
 *
 * 🔴 THIS EXISTS TO INVERT THE FAILURE DIRECTION (Paul, 2026-09-12). The old guard failed the
 * EXPENSIVE way: an unrecognised baseline silently bought another one, every thirty seconds, and
 * nothing said so. Ambiguity STOPS the spend and is reported — a skipped baseline is a message in
 * the operator's error list, which is recoverable; ten duplicate baselines is money already gone.
 *
 * ⛔ NARROWED 2026-09-13 TO THE CASE IT WAS BUILT FOR. A free check is purpose 'free_check' and is
 * IGNORED here: it can never match a baseline, so it is no reason to hold one. What still refuses:
 *   · purpose 'baseline' with no contract — a baseline whose contract write failed;
 *   · a LEGACY multi-run row with no purpose and no contract — could be either, so it still holds.
 * ⚠️ The second bullet costs something real and stated: a prospect whose free check ran BEFORE
 * 2026-09-12 and who pays later is held until somebody looks (one error row per lead per hour, not
 * per tick). A new free check is not.
 */
export function findAmbiguousMultiRun<T extends AuditKindRow>(rows: readonly T[] | null | undefined): T | null {
  return (rows ?? []).find((r) => auditKind(r) === 'multi_run_unmarked') ?? null;
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE FREE-CHECK SENDER'S GATE.

   🔴 FOUND 2026-09-13, BEFORE IT REACHED A CUSTOMER. maybeSendFreeCheckResult was gated on the
   LEAD having a free-check submission row, and process-ai-audit-queue pushes it for every completed
   run of every audit with a lead. So for anyone who had ever filled in the free-check form, their
   paid BASELINE, their FULL MEASURE, their DAY-28 REPLAY and any re-audit an operator ran would each
   have emailed and texted them "Your AI visibility check" with a fresh report link.

   ⛔ THE GATE IS THE AUDIT'S OWN PURPOSE NOW. Only an audit created AS the free check
   (`audit_purpose = 'free_check'`) sends automatically. A baseline, a measurement, a replay and an
   ordinary audit each send NOTHING, and the test drives all five.
   ⚠️ THE OPERATOR RESEND IS THE ONE EXCEPTION, AND IT IS NARROW: a person pressing "resend" on the
   Free checks card for an audit with no recorded purpose (created before 2026-09-13) or an
   ordinary 'audit' one is allowed through, because that is how the two stranded pre-change free
   checks can still be sent by hand. A baseline, measurement or replay is refused even when forced —
   there is no button that should ever send a stranger a paying customer's measurement.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
export type FreeCheckSendDecision =
  | { send: true; via: 'free_check' | 'operator_resend' }
  | { send: false; reason: string };

export function freeCheckSendGate(auditPurpose: unknown, opts: { forced?: boolean } = {}): FreeCheckSendDecision {
  const purpose = typeof auditPurpose === 'string' ? auditPurpose.trim().toLowerCase() : '';
  if (purpose === FREE_CHECK_AUDIT_PURPOSE) return { send: true, via: 'free_check' };
  if (opts.forced === true && (purpose === '' || purpose === ORDINARY_AUDIT_PURPOSE)) {
    return { send: true, via: 'operator_resend' };
  }
  return {
    send: false,
    reason: purpose
      ? `audit_purpose is '${purpose}', not '${FREE_CHECK_AUDIT_PURPOSE}' — not a free check`
      : 'audit has no recorded purpose (created before 2026-09-13) — not sent automatically',
  };
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   IS THIS AUDIT AN INTERNAL WORKING DOCUMENT? (2026-09-13, Paul's brief.)

   🔴 THE PUBLIC RENDERER SERVED THE CLIENT DOCUMENT FOR ANY AUDIT ID, INCLUDING A FULL MEASURE.
   findable.live/report/<id> rendered AD Locksmithing's 18-question winnable-questions audit as a
   client report, and the only thing stopping a client seeing it was that nothing sent the link.
   That is luck, not protection. The full measure and the day-28 replay are OPERATOR documents: the
   measure decides what to build and is deliberately disjoint from the judged set, the replay is
   the "after" side of a refund decision. Neither is a thing a client is handed as "their report".

   ⛔ ONE PREDICATE, READ BY EVERY SURFACE THAT COULD SHOW ONE: render-audit-report (refuses with an
   operator-only notice), the Baseline screen (no "View client report" button), the lead card's
   cockpit (its report links resolve from the baseline pointer, never a measurement), AuditPills
   (the label). Written once so the four cannot drift — the same shape as freeCheckSendGate above.

   ⚠️ LEGACY ROWS (purpose null, before 2026-09-12) are graded by the old rule: multi-run AND
   is_measurement → measurement. That is RG's 26 Aug and 8 Sep re-measures. A single-run legacy
   audit and a legacy client baseline are NOT internal — they are the prospect's and the client's
   documents respectively. */
export function isInternalMeasurement(row: AuditKindRow | null | undefined): boolean {
  if (!row) return false;
  return auditKind(row) === 'measurement';
}

/** The operator-facing NAME of a `measurement` / `remeasure` audit. The stored purpose value stays
 *  `measurement` (the pointer triggers and the partial unique index read the column); only what a
 *  person reads changes. "Winnable questions" is what the full measure answers — Paul, 2026-09-13. */
export const INTERNAL_MEASUREMENT_LABEL = 'Winnable questions audit (internal)';

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   WHICH AUDITS MAY BUY A WEBSITE SEO SCAN — AN ALLOWLIST BY PURPOSE, NOT A SKIP FLAG.

   🔴 THE FAULT (found 2026-09-15 on BS4 Electrical Services Ltd, audit c8a78581, purpose `audit`).
   The scan was decided by `skipSeo = body.skip_seo === true || isMeasurement || isRemeasure ||
   isFreeCheck` — an OPT-OUT, so ABSENCE MEANT SPEND. Every caller that forgot the flag bought the
   scan, and the lane that forgot it is the busiest one in the product: whatsapp-inbound's
   first-reply auto-audit chain (`_shared/whatsapp-inbound.ts`, the AUTO_AUDIT_REPLY_ENABLED
   branch) sends no `skip_seo`, so every prospect who replies to the opener has been buying a
   ~4p Apify scan and getting a "Website issues we can fix" section on a cold outreach report.
   Measured: 620 outreach-lane runs scanned, ~95% of every SEO pound ever spent.

   ⛔ SO THE PURPOSE DECIDES, AND IT IS A POSITIVE LIST. Only a PAID BASELINE — the day-0 side of
   the guarantee, where the website grade is part of what the client bought — may scan. Absence
   (a null/unknown purpose: every legacy row, and any future caller that forgets) is NOT
   permission: it grades "do not spend", which is the direction this file's absent-value law
   points on a paid API. Adding a purpose here is a deliberate act; forgetting one costs nothing.

   ⚠️ STATED COST, ACCEPTED: an operator wizard single on a paying client no longer scans by
   itself. That is not a lost capability — `LeadSiteCheckButton` is the on-demand scan and it
   prices itself on its face, which is the shape §8 already chose for scan-on-engagement.

   ⚠️ AND IT IS ENFORCED TWICE ON PURPOSE. create-ai-audit seeds `results.seo` with the skip
   marker at run-insert time, and process-ai-audit-queue re-asks this same question before it
   spends. The marker alone IS "a flag that can drift" — a run inserted by any path that misses
   it is scanned by the queue with nothing to stop it. The second gate is what makes the purpose,
   rather than the marker, the thing that decides. */
export const SEO_SCAN_PURPOSES: ReadonlySet<string> = new Set([BASELINE_AUDIT_PURPOSE]);

/** May an audit of this purpose buy the website scan? Null / unknown / absent → NO. */
export function seoScanAllowed(auditPurpose: string | null | undefined): boolean {
  return typeof auditPurpose === 'string' && SEO_SCAN_PURPOSES.has(auditPurpose);
}

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   IS THIS AUDIT THE PAYING CLIENT'S FROZEN BASELINE?

   🔴 THE INCIDENT (2026-09-21, MCLocksmiths centre). The Baseline screen announced the client's
   80-question DISCOVERY scan as "Client baseline · 80 questions · 3 runs · measured 21/09/2026",
   and the lead cockpit offered it as "Baseline report". Nothing had been written: the lead's
   `baseline_audit_id` was NULL the whole time and `claim_baseline_pointer` only ever fires on
   `audit_purpose = 'baseline'`, so a discovery audit is structurally incapable of being adopted.
   It was said, not stored — and a screen that says it is the baseline is how a discovery set ends
   up replayed at day 28.

   ⛔ IT WAS THE SHAPE, NOT THE INSTANCE. Both screens asked the NEGATIVE question — "is this an
   internal measurement? no? then it is the client baseline" — so the `else` carried discovery, the
   free check, and every ordinary outreach audit along with it. That is CLAUDE.md §6's absent-value
   law: enumerate the case you want, never let the remainder stand in for it.

   ⛔ SO THE RULE IS POSITIVE, AND IT LIVES HERE ONCE. AuditPills had already hand-rolled this exact
   expression; a second copy in Baseline.tsx is how the two would have drifted. Assert on
   'baseline', never on "not a measurement".

   ⚠️ LEGACY ROWS ARE INCLUDED DELIBERATELY. A pre-2026-09-12 multi-run audit that is not flagged
   `is_measurement` is RG's and Ronnie's baseline, and those are real client baselines with real
   refund dates hanging off them. auditKind already grades them 'paid_baseline' /
   'multi_run_unmarked'; both count here.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
export function isClientBaseline(row: AuditKindRow | null | undefined): boolean {
  if (!row) return false;
  const kind = auditKind(row);
  return kind === 'paid_baseline' || kind === 'multi_run_unmarked';
}

/** What an operator screen calls this audit. Never "Client baseline" unless isClientBaseline says
 *  so — that is the whole point of the function above. */
export const DISCOVERY_LABEL = 'Discovery scan (chooses the baseline questions)';
export const CLIENT_BASELINE_LABEL = 'Client baseline';
export const FREE_CHECK_LABEL = 'Free check';
export const ORDINARY_AUDIT_LABEL = 'Audit (not a client baseline)';

export function auditRoleLabel(row: AuditKindRow | null | undefined): string {
  if (isClientBaseline(row)) return CLIENT_BASELINE_LABEL;
  const kind = auditKind(row ?? {});
  if (kind === 'measurement') return INTERNAL_MEASUREMENT_LABEL;
  if (kind === 'discovery') return DISCOVERY_LABEL;
  if (kind === 'free_check') return FREE_CHECK_LABEL;
  return ORDINARY_AUDIT_LABEL;
}
