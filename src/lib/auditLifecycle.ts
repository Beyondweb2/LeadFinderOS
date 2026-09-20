/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE THREE THINGS YOU CAN DO TO AN AUDIT THAT ALREADY EXISTS — Run again, Start new audit, Delete.

   🔴 WHY THIS IS A MODULE AND NOT THREE `if`s IN THE PAGE. The screen used to offer "Re-audit" and
   "Re-run" — two labels, overlapping meanings, and neither said whether it made a new audit or
   added a run to the old one. Worse, each decided what it was dealing with by reading columns in
   the browser (`is_measurement === true || baseline_target_runs > 1`), which is the guard-keyed-to-
   today's-instances trap that truncated Findable's 40-question discovery audit to 5 on 2026-09-20.

   ⛔ SO EVERY RULE HERE READS THE STORED PURPOSE, THROUGH auditKind, AND NOTHING ELSE. No run
   counts, no `is_measurement` on its own, no question counts, no UI label. The audit row already
   knows what it is.

   ⛔ AND BOTH LISTS ARE POSITIVE. What may be repeated is named; what may be deleted is named by
   what may NOT. An audit kind invented next month is not repeatable and not deletable until
   somebody says so, which is the direction absence has to point on a path that spends money or
   destroys a measurement (CLAUDE.md §6).

   IMPORTED BY AN EDGE FUNCTION'S CLOSURE? No — SPA only. Plain TypeScript all the same.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import {
  auditKind, type AuditKindRow,
  BASELINE_AUDIT_PURPOSE, REMEASURE_AUDIT_PURPOSE, FREE_CHECK_AUDIT_PURPOSE,
  ORDINARY_AUDIT_PURPOSE, DISCOVERY_AUDIT_PURPOSE, MEASUREMENT_AUDIT_PURPOSE,
} from './auditKind.ts';

/* `reason?: undefined` on the ok member is not decoration: without it TypeScript refuses
   `verdict.ok ? undefined : verdict.reason` because `reason` is absent from one arm of the union,
   and every call site would need a redundant narrowing block to read a string it already has. */
export type AuditActionVerdict = { ok: true; reason?: undefined } | { ok: false; reason: string };

const purposeOf = (row: AuditKindRow | null | undefined): string =>
  typeof row?.audit_purpose === 'string' ? row.audit_purpose.trim().toLowerCase() : '';

/**
 * ⛔ WHICH AUDITS "RUN AGAIN" MAY COPY — A POSITIVE LIST OF TWO.
 *
 * Both are manual, operator-owned products with no machinery hanging off them: a quick wizard
 * audit and a discovery scan. Repeating one costs money and nothing else.
 *
 * Everything else is excluded ON PURPOSE, each for its own reason:
 *   · `baseline`    — the guarantee's day-0. A copy would carry purpose 'baseline', and the INSERT
 *                     trigger `claim_baseline_pointer` would claim the lead's pointer on any lead
 *                     that does not yet have one. Re-measuring a baseline is the day-28 replay,
 *                     fired by the queue and gated by judgeRemeasure — never a button.
 *   · `remeasure`   — one replay per baseline, ever, enforced by a partial unique index. A second
 *                     one is not a repeat, it is a second answer to a question already answered.
 *   · `measurement` — a full measure starts only from a frozen baseline (409 baseline_not_frozen)
 *                     and claims `full_measure_audit_id`. Its repeat is startFullMeasure's job.
 *   · `free_check`  — `maybeSendFreeCheckResult` emails the VISITOR for an audit created as the
 *                     free check. A copy could send a stranger a second email.
 */
export const REPEATABLE_PURPOSES: ReadonlySet<string> = new Set([
  ORDINARY_AUDIT_PURPOSE,
  DISCOVERY_AUDIT_PURPOSE,
]);

const NOT_REPEATABLE: Record<string, string> = {
  [BASELINE_AUDIT_PURPOSE]: 'This is a paying client’s day-0 baseline. Its re-measurement is the day-28 replay, which the queue fires on the stored date — copying it here would create a second baseline.',
  [REMEASURE_AUDIT_PURPOSE]: 'This is a day-28 replay. There is one per baseline, ever.',
  [MEASUREMENT_AUDIT_PURPOSE]: 'A full measurement runs from a frozen baseline and is started by the delivery flow, not repeated by hand.',
  [FREE_CHECK_AUDIT_PURPOSE]: 'This is a visitor’s free check from findable.live. Repeating it could email them again.',
};

/** May "Run again" mint a copy of this audit? */
export function auditRepeatable(row: AuditKindRow | null | undefined): AuditActionVerdict {
  if (!row) return { ok: false, reason: 'No audit selected.' };
  const purpose = purposeOf(row);
  if (REPEATABLE_PURPOSES.has(purpose)) return { ok: true };
  const named = NOT_REPEATABLE[purpose];
  if (named) return { ok: false, reason: named };
  /* No recorded purpose: every audit before 2026-09-12. A single-run legacy row is an ordinary
     wizard/outreach audit and is safe to copy; a multi-run one cannot be told apart from a paid
     baseline on its columns (auditKind's whole first incident), so it is refused. */
  if (!purpose) {
    const kind = auditKind(row);
    if (kind === 'single_run') return { ok: true };
    return { ok: false, reason: 'This audit predates the purpose column and has more than one run, so we cannot tell a baseline from a free check. Start a new audit instead.' };
  }
  return { ok: false, reason: `This audit's purpose ("${purpose}") has no defined repeat, so it is not copied by hand.` };
}

/**
 * ⛔ WHICH AUDITS MAY BE DELETED — stated as what may NOT, because deletion is the destructive one
 * and the default has to be "yes, it is yours" for the ordinary case Paul actually needs.
 *
 * 🔴 THE REASON THE BASELINE IS PROTECTED IS A FOREIGN KEY. `outreach_leads.baseline_audit_id` is
 * ON DELETE SET NULL, and `claim_baseline_pointer` only fires AFTER INSERT — so deleting a paid
 * baseline nulls the guarantee's before-side pointer and NOTHING can ever re-claim it. The refund
 * is judged on that row. Same shape for `remeasure_audit_id`, which a partial unique index makes
 * once-ever.
 */
export function auditDeletable(row: AuditKindRow | null | undefined): AuditActionVerdict {
  if (!row) return { ok: false, reason: 'No audit selected.' };
  const purpose = purposeOf(row);
  if (purpose === BASELINE_AUDIT_PURPOSE) {
    return { ok: false, reason: 'This is a paying client’s baseline — the measurement their refund is judged against. Deleting it would null the lead’s baseline pointer, and nothing can re-claim it. Archive it instead.' };
  }
  if (purpose === REMEASURE_AUDIT_PURPOSE) {
    return { ok: false, reason: 'This is a client’s day-28 replay — the after side of the guarantee. There is one per baseline, ever. Archive it instead.' };
  }
  const kind = auditKind(row);
  if (kind === 'paid_baseline' || kind === 'multi_run_unmarked') {
    return { ok: false, reason: 'This is a multi-run audit from before the purpose column existed, so a paid baseline and a free check look identical on the row. Archive it instead.' };
  }
  return { ok: true };
}

/**
 * How many runs a repeat should ask for. Read from the stored `baseline_target_runs` — the column
 * that actually drove the original — never from a UI selection or a question count. 0/1/absent all
 * mean one run.
 */
export function repeatRunCount(row: AuditKindRow | null | undefined): number {
  const n = Math.round(Number(row?.baseline_target_runs ?? 0));
  return Number.isFinite(n) && n > 1 ? n : 1;
}

/** The business context "Start new audit" pours into the wizard. */
export type AuditPrefillSource = {
  business_name?: string | null;
  business_type?: string | null;
  location_text?: string | null;
  country?: string | null;
  has_website?: boolean | null;
  website?: string | null;
  business_scope?: string | null;
  specialism?: string | null;
};
export type AuditPrefill = {
  businessName: string;
  businessType: string;
  locationText: string;
  country: string;
  hasWebsite: boolean | null;
  website: string;
  businessScope: 'local' | 'national' | 'hybrid' | null;
  specialisms: string;
};

/**
 * Map a stored audit onto wizard fields. Everything the audit ROW holds comes back; the operator
 * changes whatever they like and reviews the questions as normal.
 *
 * ⚠️ TARGET AUDIENCE AND SPECIALIST SECTORS DO NOT COME BACK AS THEIR OWN FIELDS, and that is a
 * property of the schema rather than an oversight: both are question-SHAPING inputs that
 * auditQuestionContext merges into the one `specialism` free-text column the audit row already has
 * (no migration was taken for them). So they return inside "Main services / topics", where they are
 * visible and editable, and the operator can lift them back out if they want them weighted
 * separately. Said out loud here so nobody later "fixes" a silent loss that is not silent.
 */
export function prefillFromAudit(src: AuditPrefillSource | null | undefined): AuditPrefill {
  const s = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
  const scope = s(src?.business_scope).toLowerCase();
  return {
    businessName: s(src?.business_name),
    businessType: s(src?.business_type),
    locationText: s(src?.location_text),
    country: s(src?.country),
    /* Tri-state preserved: a stored `false` is "no website" and must not read as "not asked". */
    hasWebsite: typeof src?.has_website === 'boolean' ? src.has_website : null,
    website: s(src?.website),
    businessScope: scope === 'local' || scope === 'national' || scope === 'hybrid' ? scope : null,
    specialisms: s(src?.specialism),
  };
}
