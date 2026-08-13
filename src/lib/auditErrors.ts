/* ============================================================
   WHY AN AUDIT QUESTION FAILED, IN PLAIN ENGLISH.

   THE BUG THIS EXISTS TO FIX. The AI Audit page printed ONE hardcoded sentence for every failed
   question — "Couldn't check — term too broad to complete. Retry or narrow it." — while the real
   error sat unread in ai_audit_queue.result.error and again in ai_audit_runs.results.error.

   On 2026-07-30 that sentence was shown for `Apify start apify~google-search-scraper HTTP 402`:
   the Apify account had spent $90.02 of a $90.00 monthly cap and the vendor refused to start the
   actor. Nothing to do with the wording of the question — the identical questions had completed at
   09:56 the same morning. The message sent the operator to rewrite working questions.

   THERE IS NO BREADTH DETECTION IN THIS CODEBASE. Grepped 2026-07-30: the phrase existed in exactly
   one place, that JSX string. `auditReport.ts` does deprioritise broad vanity head terms, but that
   SCORES a question that completed; it never fails one. So "too broad" was not a mis-mapped case —
   it was never a real diagnosis, which is why it is deleted rather than made conditional. If real
   breadth detection is ever built, it gets its own error code and its own branch below.

   THE RULE: say what we actually know. A mapped case gets plain English; anything unmapped shows the
   RAW stored error verbatim. An honest unfamiliar string beats a confident wrong sentence — the raw
   text is what makes the next failure diagnosable in one look instead of one afternoon.
   ============================================================ */

export type FailureKind =
  | 'vendor_cap'      // Apify's own monthly spend cap — needs money or the cycle to roll
  | 'our_cap'         // OUR internal ceiling stopped it on purpose
  | 'vendor_refused'  // Apify said no for a reason that may not be spend (403 / bad token)
  | 'transient'       // rate limit, timeout, upstream 5xx — retrying is reasonable
  | 'unknown';        // not mapped: show the raw string, never invent a cause

export interface AuditFailure {
  kind: FailureKind;
  /** One line, plain English, safe to show an operator. */
  headline: string;
  /** Optional second line: what to do, or when it clears. */
  detail?: string;
  /** The stored string, always kept so nothing is hidden. */
  raw: string;
}

/**
 * "2026-08-03T23:59:59.999+00:00" → "3 Aug". Null-safe; returns null when unparseable.
 *
 * ⚠️ FORMATTED IN UTC, DELIBERATELY, AND THIS WAS A REAL OFF-BY-ONE. Apify's cycle end is the LAST
 * INSTANT of the final day in UTC (23:59:59.999Z). Rendered in local time from the UK in summer
 * (BST, UTC+1) that becomes 00:59 the NEXT morning, so the line read "resets 4 Aug" for a cap that
 * actually resets on the 3rd — a day late, every time, on the one date the operator is waiting for.
 * Caught by the harness comparing the rendered string against the stored timestamp.
 */
export function shortDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
}

/** Pull the error out of a queue row's `result`, which holds an engine map on success and
 *  `{ error }` on failure. Defensive because the column is typed as the success shape. */
export function storedError(result: unknown): string | null {
  if (!result || typeof result !== 'object') return null;
  const e = (result as { error?: unknown }).error;
  return typeof e === 'string' && e.trim() ? e.trim() : null;
}

/**
 * Map a stored error to something an operator can act on.
 *
 * `apifyCycleEnd` is the Apify billing cycle end, when we know it — it turns "the cap is gone" into
 * "the cap is gone until 3 Aug", which is the difference between a mystery and a plan.
 */
export function explainAuditFailure(
  rawInput: unknown,
  opts: { apifyCycleEnd?: string | null } = {},
): AuditFailure {
  const raw = (typeof rawInput === 'string' ? rawInput : storedError(rawInput)) ?? '';
  const r = raw.trim();
  const lower = r.toLowerCase();
  const resets = shortDate(opts.apifyCycleEnd);
  const resetSuffix = resets ? ` The cap resets on ${resets}.` : '';

  if (!r) {
    return {
      kind: 'unknown',
      headline: 'Couldn’t check — no reason was recorded.',
      detail: 'The question failed without storing an error, so there is nothing to diagnose from. Retrying will either work or record a real error.',
      raw: '',
    };
  }

  // ── OUR OWN CEILINGS. Written by process-ai-audit-queue as exact tokens, so match them exactly. ──
  if (r === 'daily_cap') {
    return {
      kind: 'our_cap',
      headline: 'Stopped by our own daily cost cap, not by an error.',
      detail: 'The rolling 24-hour enrichment ceiling was reached, so the check was refused before spending anything. It clears as the window rolls forward.',
      raw: r,
    };
  }
  /* ⚠️ 'capped' IS THE LEGACY TOKEN AND STILL APPEARS ON HISTORIC ROWS. It is kept alongside the
     new 'cost_cap' rather than replaced, because rewriting history is not this function's job — and
     a row written before 2026-08-08 genuinely cannot say which of the two gates stopped it. */
  if (r === 'capped' || r === 'cost_cap') {
    return {
      kind: 'our_cap',
      headline: 'Stopped at this audit’s own cost ceiling.',
      detail: 'The run reached the spend limit set for it and stopped deliberately. Nothing failed.',
      raw: r,
    };
  }

  /* ⚠️ NOT A FAILURE AT ALL, AND IT MUST NOT READ AS ONE. A targeting/area audit finishes once all
     but one of its questions have returned, so the last laggard is abandoned on purpose and stored
     as 'failed' — the only settled status the progress bar and the queue both already understand.
     Written verbatim as TARGETING_STRAGGLER_ERROR in supabase/functions/_shared/targeting-straggler.ts;
     keep the two strings identical. Never reachable on a paid baseline, which waits for every
     question. */
  if (r === 'straggler_dropped') {
    return {
      kind: 'our_cap',
      headline: 'Abandoned on purpose so the market could be read sooner.',
      detail: 'Every other question in this audit had already come back, so this last one was dropped rather than held onto. The market was read off the answers that landed. Nothing failed, and no paid baseline ever does this.',
      raw: r,
    };
  }

  // ── APIFY. The vendor that actually runs the searches. ──
  // 402 Payment Required is unambiguous: the account's monthly spend cap is exhausted.
  if (/\b402\b/.test(r)) {
    return {
      kind: 'vendor_cap',
      headline: 'Apify’s monthly spend cap is exhausted — it refused to start the search.',
      detail: `Nothing is wrong with the question or with our code: the vendor stopped serving.${resetSuffix} Raising the cap in Apify, or waiting for the cycle to roll, is what fixes it.`,
      raw: r,
    };
  }
  /* 403 is deliberately NOT called a cap. It is what Apify returned minutes AFTER the 402 on
     2026-07-30, so spend is the likely cause — but 403 is also what an invalid or revoked token
     returns, and asserting "cap" here would send the operator to the billing page for a token
     problem. Both possibilities are named, most likely first. */
  if (/\b403\b/.test(r)) {
    return {
      kind: 'vendor_refused',
      headline: 'Apify refused the request (403).',
      detail: `Most often the monthly spend cap is exhausted — check Apify's usage first.${resetSuffix} If spend is fine, the API token is the next thing to check, because a revoked or wrong token returns the same 403.`,
      raw: r,
    };
  }
  if (/\b429\b/.test(r)) {
    return {
      kind: 'transient',
      headline: 'Apify rate-limited us (429) — too many requests at once.',
      detail: 'This normally clears on its own. Retrying, or running fewer audits at the same time, should get through.',
      raw: r,
    };
  }
  if (/\b5\d\d\b/.test(r)) {
    return {
      kind: 'transient',
      headline: 'Apify returned a server error — a problem at their end, not ours.',
      detail: 'Retrying is the right move. If every question fails this way for a while, check Apify’s status page.',
      raw: r,
    };
  }
  if (/no run id in response/i.test(lower)) {
    return {
      kind: 'transient',
      headline: 'Apify accepted the request but gave us no run to follow.',
      detail: 'Nothing to poll, so the check was abandoned. Retrying is safe.',
      raw: r,
    };
  }
  if (/timeout|timed out|abort/i.test(lower)) {
    return {
      kind: 'transient',
      headline: 'The check timed out before a result came back.',
      detail: 'The search may still have run and been billed. Retrying is safe, but expect it to cost again.',
      raw: r,
    };
  }

  /* UNMAPPED. Show it exactly as stored. This is the branch that would have made 2026-07-30 a
     two-minute diagnosis, and the reason it prints the raw string rather than a friendly guess. */
  return {
    kind: 'unknown',
    headline: 'Couldn’t check — this is the error we recorded:',
    detail: undefined,
    raw: r,
  };
}
