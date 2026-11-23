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

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE FAILURE-RUN BREAKER (2026-11-23 pm, docs/whatsapp-queue-200-spread.md). On 23 Nov every one of the queue's 19 cold sends
   failed (07:00–12:13 London) and the auto-pause above never tripped: at RED's slow pace only 3–4 went an hour, never the 8 it
   needs inside 60 minutes. Each failure also marked a lead No WhatsApp for good (one strike). A RUN of failures with nothing
   delivered in between is the number being refused, not a few dead numbers (normal is ~12% failed: 5 in a row by chance is about
   1 in 40,000), so it pauses the queue whatever the pace. A person resumes it, as for the auto-pause.
   ⛔ Settled sends only: a send still "sent" (no report yet, or a phone that is off) neither breaks nor extends a run.
   ⛔ The one-strike pass never strikes a failure that was part of such a run (strikeSinceAfterRuns): it says nothing about the lead.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Failed cold sends in a row (nothing delivered between) that pause the queue. */
export const FAILURE_RUN_PAUSE = 5;
/** How far back the breaker looks. */
export const FAILURE_RUN_LOOKBACK_HOURS = 6;

export interface RunSendRow { created_at: string; delivery_status: string | null }
const RUN_OK: ReadonlySet<string> = new Set(['delivered', 'read', 'played']);
const RUN_FAIL: ReadonlySet<string> = new Set(['failed', 'failed_temporary', 'no_whatsapp']);

const byTime = (a: RunSendRow, b: RunSendRow) => Date.parse(a.created_at) - Date.parse(b.created_at);

/** Settled sends, oldest first, as true (delivered) / false (failed). */
function settled(rows: readonly RunSendRow[]): Array<{ at: number; ok: boolean }> {
  return [...rows].sort(byTime).flatMap((r): Array<{ at: number; ok: boolean }> => {
    const s = String(r.delivery_status ?? '');
    const at = Date.parse(r.created_at);
    if (!Number.isFinite(at)) return [];
    return RUN_OK.has(s) ? [{ at, ok: true }] : RUN_FAIL.has(s) ? [{ at, ok: false }] : [];
  });
}

/** How many of the newest settled sends failed in a row. */
export function currentFailureRun(rows: readonly RunSendRow[]): number {
  const s = settled(rows);
  let n = 0;
  for (let i = s.length - 1; i >= 0 && !s[i].ok; i--) n++;
  return n;
}

/** Should the queue pause itself for a run of failures? */
export function failureRunVerdict(rows: readonly RunSendRow[]): { pause: boolean; reason: string | null } {
  const n = currentFailureRun(rows);
  if (n < FAILURE_RUN_PAUSE) return { pause: false, reason: null };
  return {
    pause: true,
    reason: `The last ${n} queue messages all failed, with none delivered in between. WhatsApp is refusing the number's cold ` +
      'messages, so the queue paused itself before more leads were marked No WhatsApp. Check WhatsApp Manager, then press Resume.',
  };
}

/** The one-strike pass's start: never earlier than the lookback, and after the end of the latest run of FAILURE_RUN_PAUSE or more
 *  failures (those failures were the number being refused, not the leads). */
export function strikeSinceAfterRuns(rows: readonly RunSendRow[], lookbackStart: Date): Date {
  const s = settled(rows);
  let since = lookbackStart.getTime();
  let run = 0;
  for (let i = 0; i < s.length; i++) {
    run = s[i].ok ? 0 : run + 1;
    if (run >= FAILURE_RUN_PAUSE) since = Math.max(since, s[i].at + 1);
  }
  return new Date(since);
}

/** The runs of FAILURE_RUN_PAUSE or more failures (nothing delivered between), as [first failure, last failure] in ms. The per-lead
 *  one-strike check leaves out a failure inside one (2026-11-23 pm: the 25 leads struck while WhatsApp refused the number). */
export function failureRunWindows(rows: readonly RunSendRow[]): Array<[number, number]> {
  const s = settled(rows);
  const out: Array<[number, number]> = [];
  let start = -1;
  let run = 0;
  const close = (endIdx: number) => { if (run >= FAILURE_RUN_PAUSE) out.push([s[start].at, s[endIdx].at]); };
  for (let i = 0; i < s.length; i++) {
    if (s[i].ok) { close(i - 1); run = 0; start = -1; continue; }
    if (run === 0) start = i;
    run++;
  }
  if (run > 0) close(s.length - 1);
  return out;
}

/** Is this moment inside one of the windows? */
export function insideFailureRun(atMs: number, windows: ReadonlyArray<[number, number]>): boolean {
  return windows.some(([a, b]) => atMs >= a && atMs <= b);
}
