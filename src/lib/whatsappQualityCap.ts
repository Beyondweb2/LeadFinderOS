/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE NUMBER'S DAILY COLD CAP FOLLOWS META'S QUALITY RATING (2026-11-23, Paul; docs/whatsapp-fewer-failures.md).
   The number has been RED since 25 Oct and 22% of the queue's sends failed on 22 Nov. Paul's rule: the WHOLE NUMBER sends at most
     RED 60 · YELLOW 100 · GREEN 150 cold messages a day (London day), and never more than 15 in any hour.
   The rating is the cached read-only Graph API reading that whatsapp-number-health stores on whatsapp_outreach_state every 15
   minutes (healthVerdict, src/lib/whatsappNumberHealth.ts). Nothing here calls Meta.
   ⛔ A READING WE DO NOT HAVE (absent, stale, UNKNOWN) IS RED: on a sending path unknown means the safe number, never "unlimited".
   ⛔ IT IS A CEILING ON TOP OF EACH COUNTRY'S OWN CAP, never a raise: the UK sends min(its cap, this cap).
   ⛔ PURE, relative imports only: the queue, send-whatsapp-message and inbox-scheduled-send reach it through the cold guard.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import type { HealthState } from './whatsappNumberHealth.ts';

/** Cold messages a day for the whole number, by Meta's quality rating. */
export const QUALITY_DAILY_CAP: Readonly<Record<'red' | 'yellow' | 'green', number>> = { red: 60, yellow: 100, green: 150 };
/** The most cold messages in any rolling hour, whatever the rating. */
export const COLD_HOURLY_MAX = 15;

/** The number's cold cap for today from the stored reading. Unreadable is RED. */
export function qualityDailyCap(state: HealthState | null | undefined): number {
  if (state === 'green') return QUALITY_DAILY_CAP.green;
  if (state === 'yellow') return QUALITY_DAILY_CAP.yellow;
  return QUALITY_DAILY_CAP.red;
}

/** The rating word the screens show beside the cap. */
export function qualityCapWord(state: HealthState | null | undefined): string {
  if (state === 'green') return 'GREEN';
  if (state === 'yellow') return 'YELLOW';
  if (state === 'red') return 'RED';
  return 'not read (treated as RED)';
}

/** When the hour cap frees a slot: an hour after the oldest send inside the last hour. Null = not at the cap. */
export function hourCapRetryAt(sendTimesMs: readonly number[], now: Date = new Date()): Date | null {
  const hourAgo = now.getTime() - 3_600_000;
  const inHour = sendTimesMs.filter((t) => t > hourAgo && t <= now.getTime()).sort((a, b) => a - b);
  if (inHour.length < COLD_HOURLY_MAX) return null;
  return new Date(inHour[inHour.length - COLD_HOURLY_MAX] + 3_600_000);
}
