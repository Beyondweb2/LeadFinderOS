/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE ONE REPORTING CLOCK (Admin control centre, 2026-09-30).
   ⛔ EVERY admin number that says "today", "yesterday", "this week" or "30 days" gets its boundaries
   from HERE, so no two widgets can disagree about what today is.
   - The business day is the LONDON calendar day (Europe/London, BST/GMT handled), midnight to
     midnight — the same day commission is dated on (commission.ts londonDayOf).
   - A week is MONDAY–SUNDAY, London — the same week the commission tiers use (londonWeekStart).
   - "7 days" / "30 days" are the last N London days INCLUDING today (so "7 days" on a Tuesday is last
     Wednesday 00:00 → now), never a rolling N×24 h window.
   - A period is [fromMs, toMs): from London midnight of the first day, to London midnight after the
     last day, capped at now.
   Pure and edge-safe (no imports): fn admin-overview runs it on the server; the page runs it for labels.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export const REPORTING_TIME_ZONE = 'Europe/London';

export type PeriodKey = 'today' | 'yesterday' | '7d' | 'week' | '30d' | 'mtd' | 'all' | 'custom';
export const PERIOD_KEYS: readonly PeriodKey[] = ['today', 'yesterday', '7d', 'week', '30d', 'mtd', 'all', 'custom'];
export const PERIOD_LABEL: Record<PeriodKey, string> = {
  today: 'Today', yesterday: 'Yesterday', '7d': '7 days', week: 'This week', '30d': '30 days', mtd: 'Month to date', all: 'All time', custom: 'Custom',
};
/** The longest custom range the server will fold, in days — a guard on the read, not a business rule. */
export const MAX_CUSTOM_DAYS = 400;

export interface ReportingPeriod {
  key: PeriodKey;
  label: string;
  /** First London day, YYYY-MM-DD (null = all time). */
  fromDay: string | null;
  /** Last London day, inclusive. */
  toDay: string;
  /** Inclusive start instant (London midnight of fromDay); null = all time. */
  fromMs: number | null;
  /** Exclusive end instant: London midnight after toDay, or now if that is later than now. */
  toMs: number;
  /** Whole London days covered (null for all time). */
  days: number | null;
}

const DAY_RE = /^\d{4}-\d{2}-\d{2}$/;

/** The London calendar day of an instant. */
export function londonDay(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: REPORTING_TIME_ZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms));
}

/** London's offset from UTC (ms) at an instant: +1 h in BST, 0 in GMT. */
function londonOffsetMs(ms: number): number {
  const p = new Intl.DateTimeFormat('en-GB', { timeZone: REPORTING_TIME_ZONE, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' })
    .formatToParts(new Date(ms)).reduce<Record<string, string>>((a, x) => { a[x.type] = x.value; return a; }, {});
  const asUtc = Date.UTC(Number(p.year), Number(p.month) - 1, Number(p.day), Number(p.hour) % 24, Number(p.minute), Number(p.second));
  return asUtc - Math.floor(ms / 1000) * 1000;
}

/** The instant of London midnight at the start of a YYYY-MM-DD day. */
export function londonMidnightMs(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  const guess = Date.UTC(y, m - 1, d, 0, 0, 0);
  // Two passes: the offset at the guess, then at the corrected instant (right across a DST change).
  const first = guess - londonOffsetMs(guess);
  return guess - londonOffsetMs(first);
}

/** Add whole calendar days to a YYYY-MM-DD day. */
export function addDays(day: string, n: number): string {
  const d = new Date(`${day}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}

/** The Monday of the London week a day falls in. */
export function mondayOf(day: string): string {
  const d = new Date(`${day}T12:00:00Z`);
  return addDays(day, -((d.getUTCDay() + 6) % 7));
}

function span(key: PeriodKey, fromDay: string | null, toDay: string, nowMs: number): ReportingPeriod {
  const endMs = londonMidnightMs(addDays(toDay, 1));
  const fromMs = fromDay ? londonMidnightMs(fromDay) : null;
  const days = fromDay ? Math.round((Date.parse(`${toDay}T12:00:00Z`) - Date.parse(`${fromDay}T12:00:00Z`)) / 86_400_000) + 1 : null;
  const label = key === 'custom' && fromDay ? (fromDay === toDay ? fromDay : `${fromDay} → ${toDay}`) : PERIOD_LABEL[key];
  return { key, label, fromDay, toDay, fromMs, toMs: Math.min(endMs, Math.max(nowMs, fromMs ?? nowMs)), days };
}

/** Resolve a preset (or a custom range) into instants. An invalid custom range falls back to 7 days —
 *  never to "all time", which would be the expensive read. */
export function resolvePeriod(key: unknown, nowMs: number, custom?: { from?: unknown; to?: unknown } | null): ReportingPeriod {
  const today = londonDay(nowMs);
  const k = (PERIOD_KEYS as readonly string[]).includes(String(key)) ? (key as PeriodKey) : '7d';
  switch (k) {
    case 'today': return span('today', today, today, nowMs);
    case 'yesterday': { const y = addDays(today, -1); return span('yesterday', y, y, nowMs); }
    case '7d': return span('7d', addDays(today, -6), today, nowMs);
    case '30d': return span('30d', addDays(today, -29), today, nowMs);
    case 'week': return span('week', mondayOf(today), today, nowMs);
    case 'mtd': return span('mtd', `${today.slice(0, 7)}-01`, today, nowMs);
    case 'all': return span('all', null, today, nowMs);
    case 'custom': {
      const from = String(custom?.from ?? ''); const to = String(custom?.to ?? '');
      if (!DAY_RE.test(from) || !DAY_RE.test(to) || from > to || to > today) return span('7d', addDays(today, -6), today, nowMs);
      const days = Math.round((Date.parse(`${to}T12:00:00Z`) - Date.parse(`${from}T12:00:00Z`)) / 86_400_000) + 1;
      if (days > MAX_CUSTOM_DAYS) return span('custom', addDays(to, -(MAX_CUSTOM_DAYS - 1)), to, nowMs);
      return span('custom', from, to, nowMs);
    }
  }
}

/** Is an instant inside the period? */
export function inPeriod(iso: string | null | undefined, p: ReportingPeriod): boolean {
  if (!iso) return false;
  const t = Date.parse(iso);
  if (!Number.isFinite(t)) return false;
  return (p.fromMs === null || t >= p.fromMs) && t < p.toMs;
}

/** The same number of days immediately before (for "vs the previous period"); null for all time. */
export function previousPeriod(p: ReportingPeriod, nowMs: number): ReportingPeriod | null {
  if (!p.fromDay || !p.days) return null;
  const to = addDays(p.fromDay, -1);
  const from = addDays(to, -(p.days - 1));
  const out = span('custom', from, to, nowMs);
  return { ...out, label: `previous ${p.days} day${p.days === 1 ? '' : 's'}` };
}
