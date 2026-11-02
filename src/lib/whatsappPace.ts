/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE WHATSAPP QUEUE'S PACE AND AUTO-PAUSE — ONE RULE (2026-10-14, test day; docs/test-day-outreach.md).

   The send-gap floor (1 min) was a code constant in process-whatsapp-queue, so changing it meant a deploy. It now lives in
   whatsapp_outreach_state (id 1), set by the admin on the WhatsApp queue panel; NULL = the default below. This leaf turns the
   stored values into the numbers the drip uses — the edge function and the panel both import it (relative .ts imports only:
   edge-reachable).

   ⛔ THERE IS NO TEAM CAP (2026-11-02). Each country has its own (src/lib/whatsappColdGuard.ts); whatsapp_outreach_state.daily_cap
   is no longer read and stays in the table, NULL. One WhatsApp number (WHATSAPP_PHONE_NUMBER_ID) sends for the whole team and
   Meta limits how many NEW people it may message per 24 hours by its tier: the panel warns if the caps add up to more than that.
   ⛔ THE DRIP SENDS AT MOST ONE MESSAGE PER CRON TICK (every minute). The pacing spreads what the countries that are on have left
   over the minutes left in the London window, never faster than the floor.
   ⛔ AUTO-PAUSE: when the queue's own sends in the last hour mostly FAIL, the queue pauses itself and says why —
   failures in a burst usually mean the number is being limited or blocked, and carrying on makes it worse. A person
   resumes it; nothing resumes it automatically.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** The minimum minutes between two queue sends when the admin has set none (unchanged from the constant). */
export const DEFAULT_GAP_FLOOR_MIN = 1;
/** The slowest floor the admin may choose (one send an hour). */
export const MAX_GAP_FLOOR_MIN = 60;
/** The largest per-person daily queue limit that can be typed (a typo guard, not a business rule). */
export const MAX_PERSON_DAILY_LIMIT = 1000;

/** Auto-pause: look at the queue's own sends in this many minutes… */
export const AUTO_PAUSE_WINDOW_MIN = 60;
/** …only once there are at least this many of them (a single bad number never pauses the team)… */
export const AUTO_PAUSE_MIN_ATTEMPTS = 8;
/** …and pause when at least this share failed. Normal is about 5% (100 of ~1,900 over 30 days, measured 2026-10-14);
 *  8 October 2026 had 19 of 20 fail. */
export const AUTO_PAUSE_FAIL_SHARE = 0.5;

export interface StoredPace {
  min_gap_minutes?: number | null;
  person_daily_limit_default?: number | null;
}

export interface EffectivePace {
  gapFloorMin: number;
  /** The per-person daily queue limit for a salesperson with none of their own. null = no limit. */
  personDefault: number | null;
}

const wholeIn = (v: unknown, lo: number, hi: number): number | null => {
  if (typeof v !== 'number' || !Number.isFinite(v) || !Number.isInteger(v)) return null;
  return v < lo || v > hi ? null : v;
};

/** The stored row → the numbers the drip uses. An absent or out-of-range value is the default. */
export function effectivePace(row: StoredPace | null | undefined): EffectivePace {
  return {
    gapFloorMin: wholeIn(row?.min_gap_minutes, 1, MAX_GAP_FLOOR_MIN) ?? DEFAULT_GAP_FLOOR_MIN,
    personDefault: wholeIn(row?.person_daily_limit_default, 0, MAX_PERSON_DAILY_LIMIT),
  };
}

export type PaceField = 'min_gap_minutes' | 'person_daily_limit_default' | 'person_limit';

/** Validate ONE value the admin typed. null = clear it (back to the default / no limit). Refused, never clamped. */
export function checkPaceValue(field: PaceField, v: unknown): { ok: true; value: number | null } | { ok: false; error: string } {
  if (v === null || v === '' || v === undefined) return { ok: true, value: null };
  const n = typeof v === 'string' ? Number(v.trim()) : v;
  const [lo, hi] = field === 'min_gap_minutes' ? [1, MAX_GAP_FLOOR_MIN] : [0, MAX_PERSON_DAILY_LIMIT];
  const w = wholeIn(n, lo, hi);
  return w === null ? { ok: false, error: `${field}_out_of_range` } : { ok: true, value: w };
}

/** Should the queue pause itself? `attempts` = the queue's own non-test sends in the window; `failed` = those failed. */
export function autoPauseVerdict(attempts: number, failed: number): { pause: boolean; reason: string | null } {
  if (!(attempts >= AUTO_PAUSE_MIN_ATTEMPTS) || !(failed >= 0)) return { pause: false, reason: null };
  if (failed / attempts < AUTO_PAUSE_FAIL_SHARE) return { pause: false, reason: null };
  return {
    pause: true,
    reason: `${failed} of the last ${attempts} queue messages failed in the past ${AUTO_PAUSE_WINDOW_MIN} minutes. ` +
      'The queue paused itself so the number is not limited or blocked. Check the failures, then press Resume.',
  };
}

/** A send status that counts as a failure for the auto-pause (Meta said no, or it never left). */
export const FAILED_SEND_STATUSES = ['failed', 'failed_temporary'] as const;
