/* ════════════════════════════════════════════════════════════════════════════════════════════════
   WHERE HAS THIS FREE CHECK GOT TO? — the pipeline stage of one submission.

   ⛔ WHY THIS EXISTS (Paul, 2026-09-07): "I submit a free check and I'm blind — I can't tell if the
   audit is running, done, or failed, so every test is guesswork." Every fact needed to answer that
   was already in the database, spread across five tables, and surfaced nowhere.

   ⛔ AND IT IS THE SECOND HALF OF A REAL INCIDENT. The operator alert for "the glue pot" claimed
   "the audit ran, and their result has already been sent" when no audit had run and no result had
   been sent — it had read a four-day-old audit belonging to a deduped lead. That wording is fixed,
   but the deeper problem was that there was nowhere to LOOK: the truth existed and no screen showed
   it. A narrative sentence in an email is not a status display.

   ⛔ EVERY STAGE IS DERIVED, NOTHING IS STORED. There is no `progress` column and there must not be
   one: a stored stage freezes at whatever the writer believed and drifts from the rows that decide
   it (the serveGate rule, CLAUDE.md §1). The inputs are the submission row, the lead, the audit,
   its runs, its queue rows and the send stamps — all of which are written by the machinery itself.

   ⚠️ THE ABSENT CASES ARE THE WHOLE POINT, so they are named rather than defaulted:
     · no lead        -> lead creation failed or was refused. Not "audit pending".
     · no audit       -> nothing ran. Distinguish SKIPPED (a recorded reason) from never-attempted.
     · runs settled, no result -> STRANDED. The send only fires from the tick that finalises a run,
       so nothing retries it. This is the state that looks finished and is not.
   A stage that cannot be established returns 'unknown', never the most flattering guess.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** What the endpoint hands over, per free-check submission. Structural on purpose: this module is
 *  pure and must be drivable from a test with no Supabase types in sight. */
export interface FreeCheckProgressInput {
  onboarding_id: string;
  business_name: string | null;
  contact_email: string | null;
  submitted_at: string;
  /** Operator-alert email stamps. `notify_sent_at` means the PROVIDER ACCEPTED it — see below. */
  notify_sent_at: string | null;
  notify_attempts: number | null;
  notify_error: string | null;
  /** null when no lead was created or matched. */
  lead_id: string | null;
  lead_name: string | null;
  /** The audit belonging to THIS submission (created at/after it), or null. */
  audit_id: string | null;
  audit_created_at: string | null;
  /** Statuses of that audit's runs, any order. */
  run_statuses: string[];
  /** How many runs the measurement is aiming for (baseline_target_runs), 1 when absent. */
  runs_target: number | null;
  /** Queue rows for the audit: total and how many have settled. */
  questions_total: number;
  questions_done: number;
  /** The result-send stamp written when the prospect's result actually went out. */
  result_sent_at: string | null;
  result_sent_to: string | null;
  /** Recorded reason no audit ran, from client_error_reports. */
  no_audit_reason: string | null;
  /** WhatsApp result send, if the lead had a number: the row's own delivery status. */
  whatsapp_status: string | null;
}

export type FreeCheckStage =
  | 'no_lead'          // submitted, but no lead exists to audit
  | 'no_audit'         // a lead, but nothing was queued — usually a recorded skip
  | 'running'          // at least one run still pending/running
  | 'stranded'         // every run settled, no result sent. Needs a human.
  | 'failed'           // every run failed
  | 'complete'         // result sent
  | 'unknown';         // the inputs did not establish a stage

export interface FreeCheckProgress {
  stage: FreeCheckStage;
  /** One line an operator can act on. Never a guess dressed as a fact. */
  detail: string;
  /** Runs finished / target, for a progress readout. */
  runsDone: number;
  runsTarget: number;
  /** Questions settled / total. */
  questionsDone: number;
  questionsTotal: number;
  /** True when something needs a person. */
  needsYou: boolean;
  /** The prospect-facing report, when there is an audit to link to. */
  reportUrl: string | null;
}

/* The two settled run statuses. A POSITIVE test: written as `!== 'pending'` a future status would
   silently count as finished — the absent-value shape CLAUDE.md records over and over. */
const isRunComplete = (s: string) => s === 'complete';
const isRunFailed = (s: string) => s === 'failed';
const isRunSettled = (s: string) => isRunComplete(s) || isRunFailed(s);

/** Where a prospect reads their report. The Pages Function proxy, never the Supabase URL. */
export const reportUrlFor = (auditId: string) => `https://findable.live/report/${auditId}`;

/**
 * ⛔ THE EMAIL STAMP MEANS ACCEPTED, NOT DELIVERED, AND THE LABEL MUST SAY SO.
 * `notify_sent_at` is written on a 2xx from Resend — the provider took the message. Whether a
 * mailbox ever received it is a different fact that lives in Resend's own delivery events and is
 * NOT in our database. Measured 2026-09-07: 19 rows carry that stamp and zero carry a provider
 * error, so from our side every send "worked" — which tells you nothing about arrival. Calling it
 * "delivered" is the same class of overclaim as the alert that said a result had been sent.
 */
export type SendState = 'accepted' | 'pending' | 'failed' | 'retired' | 'none';

/** Reasons a notification was deliberately retired rather than lost. */
const RETIRED_PREFIXES = ['not sent:', 'outcome not recorded'];

export function emailStateFor(
  r: Pick<FreeCheckProgressInput, 'notify_sent_at' | 'notify_attempts' | 'notify_error'>,
  maxAttempts = 3,
): SendState {
  if (r.notify_sent_at) return 'accepted';
  const err = (r.notify_error ?? '').trim().toLowerCase();
  if (err && RETIRED_PREFIXES.some((p) => err.startsWith(p))) return 'retired';
  if ((r.notify_attempts ?? 0) >= maxAttempts) return 'failed';
  return 'pending';
}

/** WhatsApp's own receipt, which unlike email DOES distinguish delivery. */
export function whatsappStateFor(status: string | null): SendState {
  if (!status) return 'none';
  if (status === 'delivered' || status === 'read' || status === 'sent') return 'accepted';
  if (status === 'failed') return 'failed';
  return 'pending';
}

export function progressFor(i: FreeCheckProgressInput): FreeCheckProgress {
  const runsTarget = Math.max(1, i.runs_target ?? 1);
  const runsDone = i.run_statuses.filter(isRunComplete).length;
  const runsFailed = i.run_statuses.filter(isRunFailed).length;
  const unsettled = i.run_statuses.filter((s) => !isRunSettled(s)).length;
  const base = {
    runsDone, runsTarget,
    questionsDone: i.questions_done, questionsTotal: i.questions_total,
    reportUrl: i.audit_id ? reportUrlFor(i.audit_id) : null,
  };

  /* Order matters: the most specific ABSENCE is checked first. A submission with no lead has no
     audit either, and reporting that as "no audit ran" would point at the wrong stage entirely. */
  if (!i.lead_id) {
    return { ...base, stage: 'no_lead', needsYou: true,
      detail: 'No lead was created for this submission, so nothing could be audited.' };
  }
  if (!i.audit_id) {
    /* ⚠️ A SKIP IS NOT A FAILURE, AND BOTH ARE "no audit". The reason is the whole difference
       between "fine, ignore it" and "the lane is broken" — so it is printed when we have it, and
       its absence is stated rather than filled in. */
    const matched = i.lead_name && i.business_name
      && i.lead_name.trim().toLowerCase() !== i.business_name.trim().toLowerCase()
      ? i.lead_name : null;
    return {
      ...base, stage: 'no_audit', needsYou: true,
      detail: i.no_audit_reason
        ? `No audit ran: ${i.no_audit_reason}.${matched ? ` Their details matched the existing lead "${matched}", so the guard was about that lead.` : ''}`
        : 'No audit ran, and no reason was recorded. Audit them by hand.',
    };
  }
  if (i.result_sent_at) {
    return { ...base, stage: 'complete', needsYou: false,
      detail: `Result sent${i.result_sent_to ? ` to ${i.result_sent_to}` : ''}.` };
  }
  if (unsettled > 0) {
    return { ...base, stage: 'running', needsYou: false,
      detail: `Measuring: run ${Math.min(runsDone + 1, runsTarget)} of ${runsTarget}`
        + (i.questions_total > 0 ? `, ${i.questions_done} of ${i.questions_total} questions done.` : '.') };
  }
  /* Every run settled and no result. Two sub-cases, and they need different actions. */
  if (runsDone === 0 && runsFailed > 0) {
    return { ...base, stage: 'failed', needsYou: true,
      detail: `Every run failed (${runsFailed} of ${i.run_statuses.length}). Nothing was sent.` };
  }
  if (i.run_statuses.length > 0) {
    /* ⛔ STRANDED IS ITS OWN STAGE AND MUST NEVER READ AS "running". The result send fires from the
       tick that finalises a run, so an audit whose runs have all settled without a result will
       never retry on its own. Recorded live 2026-09-03: SUPREME PLUMBERS sat in exactly this state,
       3 of 3 runs and 15 of 15 questions complete, no result. It looks finished and is not. */
    return { ...base, stage: 'stranded', needsYou: true,
      detail: `Audit finished (${runsDone} of ${runsTarget} runs) but NO RESULT WAS SENT. It will not retry on its own — send it by hand.` };
  }
  /* An audit row with no runs at all: it was created and never started. Say that, do not guess. */
  return { ...base, stage: 'unknown', needsYou: true,
    detail: 'The audit exists but has no runs, so it never started.' };
}
