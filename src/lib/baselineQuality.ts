/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE FINAL-20 QUALITY CHECKS — what Paul sees before he freezes the measuring stick (2026-10-04,
   fix/04-ai-measurement; Session C findings C-03, C-04, C-05).

   🔴 WHY. Approval checked the COUNT, the context, near-duplicates and Hook removal — never the
   CONTENT. On Session C's fixture a draft containing "is ZZ QA-C1 Baseline a good locksmith in
   Canterbury" (a branded question that flatters the starting score) was saved with `warnings: []` and
   approved. An unconfirmed service, a town the client never approved and a draft with no plain
   "<trade> in <home town>" question all froze the same way.

   ⛔ TWO SEVERITIES, AND THEY MEAN DIFFERENT THINGS.
     block — the question would make the guarantee measure the wrong thing: it names the business, a
             service the client does not offer or never confirmed, no approved town; or the set has
             no core question about the home town. paid-baseline REFUSES the approval until each one
             is replaced or carries a typed reason (≥ QUALITY_OVERRIDE_MIN_REASON characters), which
             is kept on baseline_meta.quality_overrides — the same shape as a Hook replacement.
     warn  — worth a second look, never a refusal: one service repeated, low service coverage,
             keyword-style wording, an urgent question for a business that never said it does
             emergencies, services that only Sales recorded.
   ⛔ THE OPERATOR REMAINS THE FINAL APPROVER. Nothing here edits, reorders or drops a question.
   ⛔ Exactly BASELINE_QUESTIONS is still enforced where it always was (paid-baseline, approve).

   Pure. IMPORTED BY AN EDGE FUNCTION (paid-baseline): relative .ts imports only.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { nameIsTextJudgeable, nameMatches } from './nameMatch.ts';
import { nearDuplicates, normTown, townOf } from './baselineMix.ts';
import { describeScope, offersUrgentWork, questionScope, type QuestionScope, type ServiceScope } from './serviceScope.ts';
import { isKeywordStyle } from './customerQuestion.ts';

export type QualityCode =
  | 'branded' | 'not_offered' | 'unsupported_service' | 'no_approved_town' | 'missing_core'
  | 'service_repetition' | 'low_service_coverage' | 'keyword_phrasing' | 'near_duplicate' | 'urgent_unconfirmed' | 'services_unconfirmed';
export type QualitySeverity = 'block' | 'warn';

export interface QualityIssue {
  code: QualityCode;
  severity: QualitySeverity;
  /** The question the issue is about; null for a set-level issue (missing core, coverage). */
  question: string | null;
  message: string;
}

export interface QualityOverride { question: string | null; code: QualityCode; reason: string }

/** A reason has to say something: at least this many characters (the Hook-replacement rule). */
export const QUALITY_OVERRIDE_MIN_REASON = 10;
/** C-03: no one service may take more than this many of the 20. */
export const MAX_QUESTIONS_PER_SERVICE = 2;

export interface QualityInput {
  questions: string[];
  scope: ServiceScope;
  primaryTown: string;
  areas: string[];
  businessName: string;
  trade: string;
  /** The Hook Audit's questions: checked like every other question (C-05), never reworded. */
  hookQuestions?: string[];
  /** resolveServiceTruth().clientConfirmed — false when only Sales recorded the services. */
  servicesClientConfirmed: boolean;
}

export interface QualityReport {
  issues: QualityIssue[];
  blocking: QualityIssue[];
  warnings: QualityIssue[];
  /** Per question, the scope verdict (for the review rows). */
  scopes: Array<{ question: string; scope: QuestionScope; town: string | null }>;
  coverage: { servicesCovered: number; servicesTotal: number; coreHome: number };
}

const norm = (q: string) => q.trim().replace(/\s+/g, ' ').toLowerCase();

export function assessBaselineQuality(i: QualityInput): QualityReport {
  const qs = i.questions.map((q) => q.trim()).filter(Boolean);
  const towns = [i.primaryTown, ...i.areas].filter((t) => t && t.trim());
  const hook = new Set((i.hookQuestions ?? []).map(norm));
  const issues: QualityIssue[] = [];
  const judgeable = !!i.businessName.trim() && nameIsTextJudgeable(i.businessName, { trade: i.trade || null, town: i.primaryTown || null });

  const scopes = qs.map((q) => ({ question: q, scope: questionScope(q, i.scope), town: townOf(q, towns) }));
  for (const { question, scope, town } of scopes) {
    if (judgeable && nameMatches(question, i.businessName, { trade: i.trade || null, town: i.primaryTown || null })) {
      issues.push({ code: 'branded', severity: 'block', question, message: `Names the business itself, so AI will almost always "name" it — it flatters the starting score. Replace it, or give a reason.` });
    }
    if (scope.verdict === 'not_offered') {
      issues.push({ code: 'not_offered', severity: 'block', question, message: `${describeScope(scope)} The refund would be judged partly on work they do not sell.` });
    } else if (scope.verdict === 'unsupported') {
      issues.push({ code: 'unsupported_service', severity: 'block', question, message: describeScope(scope) });
    }
    if (!town) {
      issues.push({ code: 'no_approved_town', severity: 'block', question, message: `Names none of the approved towns (${towns.join(', ') || 'none recorded'}) — it would measure a place the client has not confirmed.` });
    }
    if (scope.urgent && !offersUrgentWork(i.scope)) {
      issues.push({ code: 'urgent_unconfirmed', severity: 'warn', question, message: 'An urgent / emergency question, but no confirmed service mentions emergency or out-of-hours work. Check they do it.' });
    }
  }

  /* ⛔ THE CORE QUESTION (C-03). At least one plain question about the business in the HOME town. */
  const coreHome = scopes.filter((s) => s.scope.verdict === 'core' && s.town && normTown(s.town) === normTown(i.primaryTown)).length;
  if (qs.length && i.primaryTown && coreHome === 0) {
    issues.push({ code: 'missing_core', severity: 'block', question: null, message: `No plain question about the business in ${i.primaryTown} (e.g. "Can you recommend a good ${i.trade.toLowerCase() || 'business'} in ${i.primaryTown}?") — the question customers ask most is missing.` });
  }

  /* One service taking over (C-03: at most MAX_QUESTIONS_PER_SERVICE each). */
  const perService = new Map<string, string[]>();
  for (const s of scopes) if (s.scope.verdict === 'service' && s.scope.service) perService.set(s.scope.service, [...(perService.get(s.scope.service) ?? []), s.question]);
  for (const [service, list] of perService) {
    if (list.length > MAX_QUESTIONS_PER_SERVICE) {
      issues.push({ code: 'service_repetition', severity: 'warn', question: null, message: `"${service}" is in ${list.length} questions — more than ${MAX_QUESTIONS_PER_SERVICE} makes the 20 a grid of one service across towns.` });
    }
  }
  /* Coverage: at least half the confirmed services, or as many as the 20 can hold at two each. */
  const total = i.scope.confirmed.length;
  const covered = perService.size;
  const reachable = Math.min(Math.ceil(total / 2), qs.length);
  if (qs.length && total > 0 && covered < reachable) {
    const missing = i.scope.confirmed.filter((s) => !perService.has(s.label)).map((s) => s.label);
    issues.push({ code: 'low_service_coverage', severity: 'warn', question: null, message: `Only ${covered} of ${total} confirmed services are measured. Not yet covered: ${missing.slice(0, 8).join(', ')}${missing.length > 8 ? '…' : ''}.` });
  }
  /* Keyword-style wording (C-02). The Hook Audit's questions are exempt — they are kept verbatim. */
  const keyword = qs.filter((q) => !hook.has(norm(q)) && isKeywordStyle(q));
  if (keyword.length) {
    issues.push({ code: 'keyword_phrasing', severity: 'warn', question: null, message: `${keyword.length} question${keyword.length === 1 ? ' reads' : 's read'} like a search keyword, not something a customer asks an AI: ${keyword.slice(0, 3).map((q) => `"${q}"`).join(', ')}${keyword.length > 3 ? '…' : ''}.` });
  }
  const dups = nearDuplicates(qs, towns);
  for (const [a, b] of dups) {
    issues.push({ code: 'near_duplicate', severity: 'warn', question: qs[b], message: `Asks the same thing as "${qs[a]}".` });
  }
  if (!i.servicesClientConfirmed) {
    issues.push({ code: 'services_unconfirmed', severity: 'warn', question: null, message: 'The services come from what Sales recorded, not from the client. Confirm them with the client before freezing.' });
  }
  return {
    issues,
    blocking: issues.filter((x) => x.severity === 'block'),
    warnings: issues.filter((x) => x.severity === 'warn'),
    scopes,
    coverage: { servicesCovered: covered, servicesTotal: total, coreHome },
  };
}

/** The key an override is matched on: the issue's code and its question (or none for a set-level one). */
export const overrideKey = (code: QualityCode, question: string | null) => `${code}::${question ? norm(question) : ''}`;

/** Blocking issues that carry no adequate written reason — what the approval refuses on. */
export function unresolvedBlocks(blocking: QualityIssue[], overrides: QualityOverride[] = []): QualityIssue[] {
  const ok = new Set(overrides
    .filter((o) => o && typeof o.reason === 'string' && o.reason.trim().length >= QUALITY_OVERRIDE_MIN_REASON)
    .map((o) => overrideKey(o.code, o.question ?? null)));
  return blocking.filter((b) => !ok.has(overrideKey(b.code, b.question)));
}

/** The overrides that matched a real blocking issue — what is stored with the approval. */
export function acceptedOverrides(blocking: QualityIssue[], overrides: QualityOverride[] = []): QualityOverride[] {
  const live = new Set(blocking.map((b) => overrideKey(b.code, b.question)));
  return overrides
    .filter((o) => o && typeof o.reason === 'string' && o.reason.trim().length >= QUALITY_OVERRIDE_MIN_REASON && live.has(overrideKey(o.code, o.question ?? null)))
    .map((o) => ({ question: o.question ?? null, code: o.code, reason: o.reason.trim() }));
}
