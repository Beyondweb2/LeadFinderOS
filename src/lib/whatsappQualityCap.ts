/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE NUMBER'S DAILY COLD CAP — 200 A DAY, 60 WHEN META PULLS IT IN (2026-11-23 pm, Paul; docs/whatsapp-queue-200-spread.md).
   Supersedes the morning's RED 60 / YELLOW 100 / GREEN 150 (docs/whatsapp-fewer-failures.md): the quality colour no longer sets a cap.
     · The WHOLE NUMBER sends at most NUMBER_DAILY_COLD_CAP (200) cold messages a London day, never more than COLD_HOURLY_MAX (20)
       in any rolling hour, spread evenly over the send window (the queue's pacing; at least COLD_MIN_GAP_MIN between queue sends).
     · SAFETY NET → SAFETY_DAILY_COLD_CAP (60): Meta LOWERED the messaging limit (tier under TIER_2K, the tier the 200 was set on), or
       FLAGGED / RESTRICTED / BANNED the number, or says it cannot send, or the reading cannot be read (absent / stale). Paul is
       emailed on the turn into it by whatsapp-number-health (safetyNetEmail). The tripwire's full stop (whatsappNumberHealth.ts)
       is unchanged and still wins: this is the floor under it, never a raise.
   The reading is the cached read-only Graph API reading whatsapp-number-health stores every 15 minutes. Nothing here calls Meta.
   ⛔ PURE, relative imports only: the queue, send-whatsapp-message and inbox-scheduled-send reach it through the cold guard.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { HEALTH_STALE_AFTER_MIN, numberLimited, tierRank, tierWords } from './whatsappNumberHealth.ts';

/** Cold messages a London day for the whole number (Paul, 2026-11-23). */
export const NUMBER_DAILY_COLD_CAP = 200;
/** The safety net: Meta lowered the limit or flagged the number, or we cannot read it. */
export const SAFETY_DAILY_COLD_CAP = 60;
/** The most cold messages in any rolling hour. */
export const COLD_HOURLY_MAX = 20;
/** The shortest gap between two queue sends: 60 / COLD_HOURLY_MAX, so a short window left can never burst. */
export const COLD_MIN_GAP_MIN = 3;
/** The messaging tier the 200 was set on. A tier below it is "Meta lowered our messaging limit". */
export const BASELINE_TIER = 'TIER_2K';

/** What the stored row says about the number (whatsapp_outreach_state). */
export interface NumberMeta {
  meta_messaging_tier?: string | null;
  meta_number_status?: string | null;
  meta_can_send?: string | null;
  meta_health_ok_at?: string | null;
}

export interface NumberCapVerdict { cap: number; safety: string | null }

/** Why the safety net is on, from what Meta says (null = Meta says nothing wrong). Readability is separate (numberDailyCap).
 *  Meta's can_send_message LIMITED is NOT in here: the number has read LIMITED since 2 Nov while delivering normally. */
export function metaSafetyReason(m: NumberMeta | null | undefined): string | null {
  if (numberLimited(m?.meta_number_status, m?.meta_can_send)) {
    const s = String(m?.meta_number_status ?? '').trim().toUpperCase();
    return `Meta says the number is ${s && s !== 'CONNECTED' ? s.toLowerCase() : 'blocked from sending'}`;
  }
  const r = tierRank(m?.meta_messaging_tier);
  const base = tierRank(BASELINE_TIER) as number;
  if (r != null && r < base) return `Meta lowered the messaging limit to ${tierWords(m?.meta_messaging_tier) ?? m?.meta_messaging_tier}`;
  return null;
}

/** The number's cold cap for today. A reading we do not have is the safety net, never "unlimited". */
export function numberDailyCap(m: NumberMeta | null | undefined, now: Date = new Date()): NumberCapVerdict {
  const why = metaSafetyReason(m);
  if (why) return { cap: SAFETY_DAILY_COLD_CAP, safety: why };
  const okAt = m?.meta_health_ok_at ? Date.parse(m.meta_health_ok_at) : NaN;
  if (!m || !Number.isFinite(okAt) || now.getTime() - okAt > HEALTH_STALE_AFTER_MIN * 60_000) {
    return { cap: SAFETY_DAILY_COLD_CAP, safety: "Meta's reading of the number could not be read" };
  }
  return { cap: NUMBER_DAILY_COLD_CAP, safety: null };
}

/** The words the screens show beside the cap. */
export function numberCapWord(v: NumberCapVerdict): string {
  return v.safety ? `Safety limit: ${v.safety}` : 'Normal limit';
}

/** The email Paul gets on the turn into the safety net (whatsapp-number-health). */
export function safetyNetEmail(reason: string): { subject: string; lines: string[] } {
  return {
    subject: `WhatsApp: cold limit dropped to ${SAFETY_DAILY_COLD_CAP} a day (${reason})`,
    lines: [
      `${reason}. Cold WhatsApp for the whole number is now limited to ${SAFETY_DAILY_COLD_CAP} a day (normally ${NUMBER_DAILY_COLD_CAP}).`,
      "It goes back to the normal limit by itself once Meta's reading is back to normal.",
      '', 'Check the number in WhatsApp Manager.',
    ],
  };
}

/** When the hour cap frees a slot: an hour after the oldest send inside the last hour. Null = not at the cap. */
export function hourCapRetryAt(sendTimesMs: readonly number[], now: Date = new Date()): Date | null {
  const hourAgo = now.getTime() - 3_600_000;
  const inHour = sendTimesMs.filter((t) => t > hourAgo && t <= now.getTime()).sort((a, b) => a - b);
  if (inHour.length < COLD_HOURLY_MAX) return null;
  return new Date(inHour[inHour.length - COLD_HOURLY_MAX] + 3_600_000);
}
