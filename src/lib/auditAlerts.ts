/* ════════════════════════════════════════════════════════════════════════════════════════════════
   AUDIT ALERTS — WHEN PAUL HEARS THAT AN AUDIT CANNOT BE TRUSTED (Paul, 2026-11-16, brief item 1; docs/AUDIT_RULES.md).

   Two alerts, each ONE bell row + ONE email (supabase/functions/_shared/audit-alerts.ts does the writing; this file only
   decides, so it can be tested):
     • "Audit incomplete" — more than AUDIT_INCOMPLETE_AT of an audit's answers failed or were never read by the
       firm-reading step (no `firms_read` mark). Once per audit.
     • "Provider refused"  — OpenAI or Apify refused for credit or limits. Once per provider per day.
   Why: on 16 Nov the OpenAI account had no credit, the firm reading failed on every answer of the London Discovery, and
   the report still said "Winnable 39". Nobody was told.

   Pure. Reached by edge functions: relative imports with .ts.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import { AUDIT_INCOMPLETE_AT } from './auditVerdict.ts';

export type AlertProvider = 'OpenAI' | 'Apify';

/** Is this error text a provider refusing us for credit or limits? null = an ordinary failure (timeout, bad answer…). */
export function providerRefusal(text: string | null | undefined): { provider: AlertProvider; why: string } | null {
  const t = String(text ?? '');
  if (!t.trim()) return null;
  if (/insufficient_quota|no credits remaining|credit_balance_exhausted|billing_hard_limit|exceeded your current quota|openai_http_40[12]\b/i.test(t)) {
    return { provider: 'OpenAI', why: 'OpenAI refused: no credit left on the account' };
  }
  if (/\bApify\b[^\n]*\bHTTP 402\b/i.test(t)) return { provider: 'Apify', why: 'Apify refused: out of credit (HTTP 402)' };
  if (/\bApify\b[^\n]*\bHTTP 403\b/i.test(t)) return { provider: 'Apify', why: 'Apify refused: account limit or access (HTTP 403)' };
  if (/^apify_reserve$/.test(t.trim())) return { provider: 'Apify', why: 'Our Apify reserve is reached: audits are being held back' };
  return null;
}

const ENGINES = ['chatgpt', 'gemini'] as const;

/** One queue row as the finaliser reads it. */
export interface AlertRow { status: string; result: Record<string, unknown> | null }

/** An audit's answers (ChatGPT + Gemini) and how many could not be measured: failed, empty, errored, or never read by the
 *  firm-reading step. Counts every row that settled (done or failed); pending rows are not judged yet. */
export function unmeasuredAnswers(rows: AlertRow[]): { answers: number; unmeasured: number; unread: number; failed: number } {
  let answers = 0, failed = 0, unread = 0;
  for (const r of rows) {
    if (r.status !== 'done' && r.status !== 'failed') continue;
    for (const e of ENGINES) {
      answers++;
      const c = (r.result ?? {})[e] as { answer_text?: unknown; error?: unknown; firms_read?: unknown } | undefined;
      if (r.status === 'failed' || !c || typeof c !== 'object' || !String(c.answer_text ?? '').trim() || c.error) { failed++; continue; }
      if (c.firms_read !== true) unread++;
    }
  }
  return { answers, unmeasured: failed + unread, unread, failed };
}

/** True when the audit is "Audit incomplete" (the same line the report uses). */
export function isIncomplete(c: { answers: number; unmeasured: number }): boolean {
  return c.answers === 0 || c.unmeasured > c.answers * AUDIT_INCOMPLETE_AT;
}

/** The provider refusals among an audit's stored errors (failed rows' errors and the firm-reading receipts), one per provider. */
export function refusalsIn(texts: (string | null | undefined)[]): { provider: AlertProvider; why: string }[] {
  const out = new Map<AlertProvider, string>();
  for (const t of texts) { const r = providerRefusal(t); if (r && !out.has(r.provider)) out.set(r.provider, r.why); }
  return [...out.entries()].map(([provider, why]) => ({ provider, why }));
}

/** The words of the "Audit incomplete" alert (bell + email). Operator only. */
export function incompleteAlert(o: { businessName: string; shortCode: string | null; auditId: string; answers: number; unmeasured: number; unread: number; failed: number; refusals: { why: string }[] }) {
  const name = o.businessName.trim() || 'An audit';
  const why = o.refusals.length ? o.refusals.map((r) => r.why).join('; ')
    : o.unread ? 'the firm-reading step did not read them' : 'the AI answers failed';
  const title = `Audit incomplete: ${name}`.slice(0, 200);
  const body = `${o.unmeasured} of ${o.answers} answers could not be measured (${why}). The report shows "Audit incomplete" and no figures until they are re-read or re-run.`;
  const link = '/ai-audit';
  const lines = [
    `${name}${o.shortCode ? ` (report ${o.shortCode})` : ''}: ${o.unmeasured} of ${o.answers} AI answers could not be measured.`,
    `Failed answers: ${o.failed}. Answers whose firms were not read: ${o.unread}.`,
    `Why: ${why}.`,
    '',
    'The report link shows "Audit incomplete" with no figures, and the Past audits row says the same, until the answers are measured.',
    'Fix the cause, then re-run the firm reading (or the audit). Nothing was sent to the client because of this alert.',
    '',
    `Audit id: ${o.auditId}`,
  ];
  return { title, body, link, subject: title, lines, dedupeKey: `audit_incomplete:${o.auditId}` };
}

/** The words of the "Provider refused" alert. One per provider per UTC day (the dedupe key). */
export function providerAlert(o: { provider: AlertProvider; why: string; where: string; dayIso: string }) {
  const title = `${o.provider} is refusing our requests`.slice(0, 200);
  const body = `${o.why}. Seen in ${o.where}. Audits and AI features that need ${o.provider} will fail until it is fixed.`;
  const lines = [
    `${o.why}.`,
    `Seen in: ${o.where}.`,
    '',
    o.provider === 'OpenAI'
      ? 'Check the OpenAI organisation that V1\'s OPENAI_API_KEY belongs to (billing / credit).'
      : 'Check the Apify account (usage, credit and monthly limit).',
    'Audits measured meanwhile show "Couldn\'t measure" / "Audit incomplete" rather than a result.',
  ];
  return { title, body, link: '/ai-audit', subject: title, lines, dedupeKey: `provider_refused:${o.provider.toLowerCase()}:${o.dayIso.slice(0, 10)}` };
}
