/* The admin home and the Team, insights and costs page share one period picker and one "My activity" setting
   (Concept A, 2026-10-26). */
import type { PeriodChoice } from '@/hooks/useAdminOverview';
import { PERIOD_KEYS, PERIOD_LABEL, londonDay, type PeriodKey } from './reportingPeriod';

export const PICKER = PERIOD_KEYS.filter((k) => k !== 'yesterday').map((k) => ({ key: k, label: PERIOD_LABEL[k] }));

/** A stored choice with an unknown period is ignored (null), so an old shape can never crash the page. */
export const validChoice = (v: unknown): PeriodChoice | null =>
  !!v && typeof v === 'object' && (PERIOD_KEYS as readonly string[]).includes(String((v as PeriodChoice).key)) ? (v as PeriodChoice) : null;

/** v2 (Paul, 2026-10-26): "My activity" is INCLUDED by default. The old key defaulted to hidden and hid 92% of sends. */
export const HIDE_MY_ACTIVITY_KEY = 'admin.hideMyActivity.v2';

/** The period → days for the key numbers (1–90). */
export function periodDays(c: PeriodChoice, nowMs = Date.now()): number {
  const k: PeriodKey = c.key;
  if (k === 'today' || k === 'yesterday') return 1;
  if (k === '7d' || k === 'week') return 7;
  if (k === 'mtd') return Math.max(1, Number(londonDay(nowMs).slice(8, 10)));
  if (k === 'custom' && c.from) return Math.min(90, Math.max(1, Math.round((nowMs - Date.parse(`${c.from}T00:00:00Z`)) / 86_400_000)));
  if (k === 'all') return 90;
  return 30;
}
