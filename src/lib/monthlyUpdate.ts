/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE MONTHLY CLIENT UPDATE — the words (closeout, 2026-10-02).

   findable.live/terms promises a concise monthly update "covering, where applicable: the AI visibility
   measurements available for that period, any relevant changes in whether AI names or cites your
   business, the improvements completed, the opportunities identified and the next steps planned. If
   the measurements are unchanged, inconclusive or unavailable for a period, the update says so." It is
   prepared and sent BY HAND: Paul writes it on the paid client page, copies it and sends it himself
   (table client_monthly_updates, migration 20261006100000).

   ⛔ ONLY THE MEASUREMENT PARAGRAPH IS WRITTEN HERE, and only from stored check results
      (weekly_check_runs.summary: named / answered per scored engine). Everything about WORK is the
      operator's own words — this module never says a page was created, a listing added or a
      recommendation won. An empty "what we did" is not filled in; the update cannot be sent without it.
   ⛔ NEVER A PROMISE OF MOVEMENT. A comparison is made only between checks that are LIKE FOR LIKE (same
      question count, same answered count on each engine); otherwise the text says the checks are not
      compared. "More" / "fewer" / "unchanged" is a count, never "improved" or a cause.
   ⛔ "Check", never "audit" (the terms say the update is not a full re-audit). The guarantee's
      re-measurement is a different thing and the text says so.
   Pure: no I/O, no React. scripts/monthly-client-update.test.ts drives every arrival; the words are
   scanned by client-copy-claims.test.ts.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** The engines a check scores (the same two the guarantee scores; Google AI Overview is never scored). */
const ENGINES = [
  { key: 'chatgpt', label: 'ChatGPT' },
  { key: 'gemini', label: 'Gemini' },
] as const;

export interface MonthlyCheck {
  week_start: string;
  status: string;
  completed_at?: string | null;
  reason?: string | null;
  questions?: number | null;
  named?: Partial<Record<'chatgpt' | 'gemini', number>> | null;
  answered?: Partial<Record<'chatgpt' | 'gemini', number>> | null;
}

export interface MonthlyFields {
  measured_note?: string | null;
  work_done?: string | null;
  opportunities?: string | null;
  next_steps?: string | null;
}

const n = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? v : null);
const clean = (s: string | null | undefined) => (s ?? '').trim();

/** A check counts only when it finished AND has an answered count on every scored engine. */
export function usableCheck(c: MonthlyCheck): boolean {
  return c.status === 'complete' && ENGINES.every((e) => n(c.answered?.[e.key]) !== null && n(c.named?.[e.key]) !== null);
}

/** Like for like: the same number of questions, and the same number of answers on each engine. */
export function comparableChecks(a: MonthlyCheck, b: MonthlyCheck): boolean {
  if (!usableCheck(a) || !usableCheck(b)) return false;
  if (n(a.questions) === null || n(a.questions) !== n(b.questions)) return false;
  return ENGINES.every((e) => n(a.answered?.[e.key]) === n(b.answered?.[e.key]));
}

const totalNamed = (c: MonthlyCheck) => ENGINES.reduce((s, e) => s + (n(c.named?.[e.key]) ?? 0), 0);
const totalAnswered = (c: MonthlyCheck) => ENGINES.reduce((s, e) => s + (n(c.answered?.[e.key]) ?? 0), 0);

/** "1 October 2026" for a stored DAY ('YYYY-MM-DD'), read in UTC so it never slips a day (CLAUDE.md §4). */
export function dayLabel(day: string): string {
  const d = new Date(`${day.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : day;
}

/** "October 2026" for the first day of a month. */
export function monthLabel(month: string): string {
  const d = new Date(`${month.slice(0, 10)}T00:00:00Z`);
  return Number.isFinite(d.getTime()) ? d.toLocaleDateString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : month;
}

export type MeasurementKind = 'none' | 'single' | 'more' | 'fewer' | 'unchanged' | 'not_comparable';

/** What the month's checks can honestly say. */
export function measurementKind(checks: readonly MonthlyCheck[]): MeasurementKind {
  const done = checks.filter(usableCheck).sort((a, b) => a.week_start.localeCompare(b.week_start));
  if (done.length === 0) return 'none';
  if (done.length === 1) return 'single';
  const first = done[0], last = done[done.length - 1];
  if (!comparableChecks(first, last)) return 'not_comparable';
  const d = totalNamed(last) - totalNamed(first);
  return d > 0 ? 'more' : d < 0 ? 'fewer' : 'unchanged';
}

/** The "what we measured" paragraph, from stored check results only. */
export function measurementParagraph(checks: readonly MonthlyCheck[], month: string): string {
  const done = checks.filter(usableCheck).sort((a, b) => a.week_start.localeCompare(b.week_start));
  const kind = measurementKind(checks);
  const separate = 'These checks are separate from the re-measurement your guarantee is judged on.';
  if (kind === 'none') {
    return `No AI visibility check was completed for ${monthLabel(month)}, so there is no new measurement to report this month.`;
  }
  const last = done[done.length - 1];
  const perEngine = ENGINES.map((e) => `${n(last.named?.[e.key])} of ${n(last.answered?.[e.key])} answers on ${e.label}`).join(' and ');
  const times = done.length === 1 ? 'once' : done.length === 2 ? 'twice' : `${done.length} times`;
  const lead = `We checked your AI visibility ${times} in ${monthLabel(month)}. In the latest check (week of ${dayLabel(last.week_start)}), AI named your business in ${perEngine}.`;
  const first = done[0];
  const compare =
    kind === 'single' ? 'This was the only check this month, so there is no change within the month to compare.'
    : kind === 'not_comparable' ? 'The checks this month did not cover the same number of answers, so we have not compared them with each other.'
    : kind === 'unchanged' ? `That is the same as the first check of the month (${totalNamed(first)} of ${totalAnswered(first)} answers).`
    : `That is ${kind === 'more' ? 'more' : 'fewer'} than in the first check of the month (${totalNamed(first)} of ${totalAnswered(first)} answers, now ${totalNamed(last)} of ${totalAnswered(last)}).`;
  return `${lead} ${compare} ${separate}`;
}

/** What must be filled in before the update can be marked sent. Empty = ready. */
export function missingForSend(f: MonthlyFields): string[] {
  const out: string[] = [];
  if (!clean(f.work_done)) out.push('What we did');
  if (!clean(f.next_steps)) out.push('What happens next');
  return out;
}

/** The first word of a contact name, for the greeting; null when there is none worth using. */
export function greetingName(contactName: string | null | undefined): string | null {
  const first = clean(contactName).split(/\s+/)[0] ?? '';
  return /^[\p{L}][\p{L}'-]*$/u.test(first) ? first : null;
}

/** The whole update, ready to copy into an email or WhatsApp. Sections the operator left empty are
 *  left out (opportunities) — never replaced with invented words. */
export function composeMonthlyUpdate(a: {
  month: string;
  contactName?: string | null;
  checks: readonly MonthlyCheck[];
  fields: MonthlyFields;
}): string {
  const name = greetingName(a.contactName);
  const parts: string[] = [
    `Hi ${name ?? 'there'},`,
    `Here is your Findable update for ${monthLabel(a.month)}.`,
    `What we measured\n${[measurementParagraph(a.checks, a.month), clean(a.fields.measured_note)].filter(Boolean).join('\n')}`,
  ];
  if (clean(a.fields.work_done)) parts.push(`What we did\n${clean(a.fields.work_done)}`);
  if (clean(a.fields.opportunities)) parts.push(`Opportunities we have found\n${clean(a.fields.opportunities)}`);
  if (clean(a.fields.next_steps)) parts.push(`What happens next\n${clean(a.fields.next_steps)}`);
  parts.push('If you have any questions, just reply to this message.', 'Paul\nFindable');
  return parts.join('\n\n');
}

/** The London calendar months an update can be written for: from the payment month to this month,
 *  newest first. No payment date → the last six months (an older client still gets updates). */
export function updateMonths(paymentDate: string | null | undefined, nowMs: number): string[] {
  const now = new Date(nowMs);
  const london = new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit' }).format(now); // "2026-10"
  const [ny, nm] = london.split('-').map(Number);
  const start = /^\d{4}-\d{2}/.test(paymentDate ?? '') ? (paymentDate as string).slice(0, 7).split('-').map(Number) : null;
  const out: string[] = [];
  let y = ny, m = nm;
  for (let i = 0; i < 36; i++) {
    out.push(`${y}-${String(m).padStart(2, '0')}-01`);
    if (start ? (y === start[0] && m === start[1]) : out.length >= 6) break;
    if (start && (y < start[0] || (y === start[0] && m < start[1]))) break;
    m -= 1; if (m === 0) { m = 12; y -= 1; }
  }
  return out;
}
