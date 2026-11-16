/* ════════════════════════════════════════════════════════════════════════════════════════════════
   AUDIT ALERTS — WHEN PAUL HEARS THAT AN AUDIT CANNOT BE TRUSTED (Paul, 2026-11-16, brief item 1; docs/AUDIT_RULES.md).

   Two alerts (supabase/functions/_shared/audit-alerts.ts does the writing; this file only decides, so it can be tested):
     • "Audits incomplete" — more than AUDIT_INCOMPLETE_AT of an audit's answers failed or were never read by the
       firm-reading step (no `firms_read` mark). ONE SUMMARY PER CAUSE AT MOST ONCE AN HOUR (v1-incomplete-fix, 16 Nov):
       the first incomplete audit opens a bell row for its cause, every later one in the next hour is added to that row,
       and ONE email goes a few minutes after the row opened ("N audits incomplete since HH:MM, cause: …").
       Why: at 12:08 on 16 Nov twelve Quick checks failed together (Apify's AI search never finished) and Paul got twelve
       emails in a minute.
     • "Provider refused" — OpenAI or Apify refused for credit or limits. At most once an hour per provider; repeats inside
       the hour only raise the bell row's count.
   Why the alerts exist at all: on 16 Nov the OpenAI account had no credit, the firm reading failed on every answer of the
   London Discovery, and the report still said "Winnable 39". Nobody was told.

   ⛔ The incomplete RULE is unchanged by the summary: a Quick check (one ask, ChatGPT + Gemini) is firm-read like every
      other audit, so "2 of 2 could not be measured" only ever means its answers really failed or were really unread.

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

/* ── WHY an audit is incomplete — one cause per audit, so the summary groups like with like ─────────────────────── */

export type IncompleteCause = 'openai_refused' | 'apify_refused' | 'search_timeout' | 'search_failed' | 'firms_unread';
export const INCOMPLETE_CAUSES: readonly IncompleteCause[] = ['openai_refused', 'apify_refused', 'search_timeout', 'search_failed', 'firms_unread'];

/** The words for each cause (subject + email). */
export const CAUSE_WORDS: Record<IncompleteCause, string> = {
  openai_refused: 'OpenAI refused (no credit), so the answers could not be read',
  apify_refused: 'Apify refused (credit or account limit), so the AI search did not run',
  search_timeout: 'the AI search on Apify did not finish in time (12 minutes, 3 tries)',
  search_failed: 'the AI search failed or came back empty',
  firms_unread: 'the firm-reading step did not read the answers',
};

/** A failed row's error that means "the Apify run never finished". */
const TIMEOUT_RE = /^(run_age_exceeded|apify_TIMED-OUT)$/;

/** The one cause of an incomplete audit: a provider refusal wins (it is the thing to fix); otherwise whichever of
 *  "search timed out" / "search failed" / "firms not read" covers the most answers (ties: that order). */
export function incompleteCause(rows: AlertRow[], refusals: { provider: AlertProvider }[]): IncompleteCause {
  if (refusals.some((r) => r.provider === 'OpenAI')) return 'openai_refused';
  if (refusals.some((r) => r.provider === 'Apify')) return 'apify_refused';
  let timeout = 0, failed = 0;
  for (const r of rows) {
    if (r.status !== 'failed') continue;
    const err = String((r.result ?? {}).error ?? '').trim();
    if (TIMEOUT_RE.test(err)) timeout += ENGINES.length; else failed += ENGINES.length;
  }
  const c = unmeasuredAnswers(rows);
  failed += Math.max(0, c.failed - timeout - failed); // done rows with an empty or errored answer
  if (timeout && timeout >= failed && timeout >= c.unread) return 'search_timeout';
  if (failed && failed >= c.unread) return 'search_failed';
  return c.unread ? 'firms_unread' : 'search_failed';
}

/* ── The hourly summary ──────────────────────────────────────────────────────────────────────────────────────────── */

/** One summary per cause at most once an hour (rolling: a burst at 12:59 and 13:01 is one summary). */
export const ALERT_WINDOW_MS = 60 * 60 * 1000;
/** The email waits this long after the summary opened, so a burst lands in one email with its full count. */
export const SUMMARY_EMAIL_AFTER_MS = 3 * 60 * 1000;
/** Names listed in the bell row / email; the rest are counted. */
export const SUMMARY_MAX_NAMED = 25;

/** "12:08", UK time (Paul reads it in the UK). */
export function ukTime(iso: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(iso));
}

/** The bell row's dedupe key: the cause and the minute it opened. */
export function summaryKey(cause: IncompleteCause, openedIso: string): string {
  return `audit_incomplete:${cause}:${openedIso.slice(0, 16)}`;
}
/** The prefix that finds a cause's summaries (never matches the old per-audit keys `audit_incomplete:<uuid>`). */
export function summaryKeyPrefix(cause: IncompleteCause): string {
  return `audit_incomplete:${cause}:`;
}
/** Quiet claim rows (hidden from the bell: written already cleared): "this audit was counted" and "this summary was emailed". */
export const countedKey = (auditId: string) => `audit_incomplete_counted:${auditId}`;
export const emailedKey = (summaryDedupeKey: string) => `audit_incomplete_emailed:${summaryDedupeKey}`;

/** What a summary row says, rebuilt from its count and the list of names each time an audit is added. */
export function incompleteSummary(o: { cause: IncompleteCause; count: number; sinceIso: string; names: string[] }) {
  const n = Math.max(1, o.count);
  const since = ukTime(o.sinceIso);
  const title = `${n} audit${n === 1 ? '' : 's'} incomplete since ${since}`.slice(0, 200);
  const shown = o.names.slice(0, SUMMARY_MAX_NAMED);
  const more = n - shown.length;
  const list = shown.join(', ') + (more > 0 ? ` and ${more} more` : '');
  const body = `Cause: ${CAUSE_WORDS[o.cause]}. Reports: ${list}`.slice(0, 2000);
  return { title, body, link: '/ai-audit' };
}

/** "Name (code)" — the entry a summary lists for one audit. */
export function summaryEntry(businessName: string, shortCode: string | null): string {
  const name = businessName.trim() || 'An audit';
  return shortCode ? `${name} (${shortCode})` : name;
}

/** The names already in a summary row's body (the part after "Reports: "), "and N more" dropped. */
export function namesInSummary(body: string | null | undefined): string[] {
  const i = String(body ?? '').indexOf('Reports: ');
  if (i < 0) return [];
  return String(body).slice(i + 'Reports: '.length).replace(/ and \d+ more$/, '').split(', ').map((s) => s.trim()).filter(Boolean);
}

/** The cause a summary row's dedupe key names (null = not a summary row). */
export function causeOfKey(key: string | null | undefined): IncompleteCause | null {
  const m = /^audit_incomplete:([a-z_]+):/.exec(String(key ?? ''));
  return m && (INCOMPLETE_CAUSES as readonly string[]).includes(m[1]) ? (m[1] as IncompleteCause) : null;
}

/** Is it time to email this summary row? Opened at least SUMMARY_EMAIL_AFTER_MS ago and no older than the window +
 *  a margin (a row from yesterday that somehow was never emailed is not emailed now). */
export function summaryDue(openedIso: string, nowIso: string): boolean {
  const age = Date.parse(nowIso) - Date.parse(openedIso);
  return Number.isFinite(age) && age >= SUMMARY_EMAIL_AFTER_MS && age <= ALERT_WINDOW_MS * 2;
}

/** The summary email. Operator only. */
export function incompleteSummaryEmail(o: { cause: IncompleteCause; count: number; sinceIso: string; names: string[] }) {
  const s = incompleteSummary(o);
  const lines = [
    `${s.title}. Cause: ${CAUSE_WORDS[o.cause]}.`,
    '',
    `Reports: ${namesInSummary(s.body).join(', ')}${o.count > SUMMARY_MAX_NAMED ? ` and ${o.count - SUMMARY_MAX_NAMED} more` : ''}.`,
    '',
    'Each report link shows "Audit incomplete" with no figures until its answers are measured. Nothing was sent to a client or a prospect because of this alert.',
    o.cause === 'search_timeout' || o.cause === 'search_failed'
      ? 'The answers were never collected, so they cannot be re-read: re-run the check when the provider is healthy.'
      : 'Fix the cause, then re-run the firm reading (or the check).',
    'Any more in the next hour are added to the bell row, not emailed.',
  ];
  return { subject: s.title, lines };
}

/** The words of the "Provider refused" alert. At most once an hour per provider (the writer looks back an hour); the key
 *  carries the minute it opened. */
export function providerAlert(o: { provider: AlertProvider; why: string; where: string; nowIso: string }) {
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
    'Repeats in the next hour only raise the bell row\'s count; no further email.',
  ];
  return { title, body, link: '/ai-audit', subject: title, lines, dedupeKey: `${providerKeyPrefix(o.provider)}${o.nowIso.slice(0, 16)}` };
}
export const providerKeyPrefix = (p: AlertProvider) => `provider_refused:${p.toLowerCase()}:`;
