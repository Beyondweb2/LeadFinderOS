/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE WHATSAPP NUMBER'S QUALITY RATING AND MESSAGING TIER — ONE RULE (2026-10-21, docs/whatsapp-number-health.md).

   fn whatsapp-number-health reads Meta's quality rating and messaging tier for WHATSAPP_PHONE_NUMBER_ID every
   HEALTH_CHECK_EVERY_MIN minutes and stores them on whatsapp_outreach_state (id 1). This leaf turns what is stored
   into what the queue may do. The watcher, the queue (process-whatsapp-queue) and the pace panel all import it
   (relative .ts imports only: edge-reachable).

   ⛔ GREEN  → nothing changes.
   ⛔ YELLOW → the team's daily cap is HALVED and no one may raise the cap.
   ⛔ RED    → the watcher PAUSES the queue once, when the rating turns red (a person resumes it; it is never
              re-paused while it stays red, so a resume is not fought). The cap stays halved and rises stay blocked.
   ⛔ CANNOT BE READ (no reading yet, the last good reading is older than HEALTH_STALE_AFTER_MIN, or Meta says
              UNKNOWN) → sending is NEVER paused or slowed; only cap rises are blocked.
   The 1–2 minute random gap, the stored caps, the failure-burst auto-pause and the Malaysia / Singapore auto-off are
   separate rules and are untouched by this one.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export type QualityRating = 'GREEN' | 'YELLOW' | 'RED' | 'UNKNOWN';

/** How often the watcher reads Meta (the cron schedule says the same). */
export const HEALTH_CHECK_EVERY_MIN = 15;
/** A good reading older than this (three missed checks) counts as "cannot be read". */
export const HEALTH_STALE_AFTER_MIN = 45;

/** Meta's words → ours. Anything else (absent, NA, a new word) is UNKNOWN. */
export function normaliseRating(v: unknown): QualityRating {
  const s = typeof v === 'string' ? v.trim().toUpperCase() : '';
  return s === 'GREEN' || s === 'YELLOW' || s === 'RED' ? s : 'UNKNOWN';
}

/** Meta's tier word → new people per 24 hours. null = unlimited or not known (see tierKnown). */
export function tierLimit(tier: string | null | undefined): number | null {
  const s = String(tier ?? '').trim().toUpperCase();
  if (s === 'TIER_UNLIMITED' || s === 'UNLIMITED') return null;
  const m = /^TIER_(\d+)(K?)$/.exec(s);
  if (!m) return null;
  return Number(m[1]) * (m[2] === 'K' ? 1000 : 1);
}

/** Plain words for a tier ("1,000 new people a day", "Unlimited"). Unknown / absent = null (the panel says "Not read"). */
export function tierWords(tier: string | null | undefined): string | null {
  const s = String(tier ?? '').trim().toUpperCase();
  if (!s) return null;
  if (s === 'TIER_UNLIMITED' || s === 'UNLIMITED') return 'Unlimited';
  const n = tierLimit(s);
  return n == null ? s : `${n.toLocaleString('en-GB')} new people a day`;
}

/** What whatsapp_outreach_state holds (columns added by migration 20261119090000). */
export interface StoredHealth {
  meta_quality_rating?: string | null;
  meta_messaging_tier?: string | null;
  meta_health_ok_at?: string | null;
  meta_health_checked_at?: string | null;
  meta_health_error?: string | null;
}

export type HealthState = 'green' | 'yellow' | 'red' | 'unreadable';

export interface HealthVerdict {
  state: HealthState;
  rating: QualityRating;
  tier: string | null;
  /** The daily cap is halved (yellow, red). */
  halveCap: boolean;
  /** No one may raise the daily cap (yellow, red, unreadable). */
  blockCapRise: boolean;
  /** One plain line for the panel; null when green. */
  limitText: string | null;
}

/** The stored reading → what the queue may do now. Absent, stale or UNKNOWN is "unreadable" — never green, never a pause. */
export function healthVerdict(h: StoredHealth | null | undefined, now: Date = new Date()): HealthVerdict {
  const rating = normaliseRating(h?.meta_quality_rating);
  const tier = (h?.meta_messaging_tier ?? null) || null;
  const okAt = h?.meta_health_ok_at ? Date.parse(h.meta_health_ok_at) : NaN;
  const fresh = Number.isFinite(okAt) && now.getTime() - okAt <= HEALTH_STALE_AFTER_MIN * 60_000;
  if (!fresh || rating === 'UNKNOWN') {
    return { state: 'unreadable', rating: fresh ? rating : 'UNKNOWN', tier, halveCap: false, blockCapRise: true,
      limitText: 'The number’s quality rating could not be read from Meta, so the daily cap cannot be raised until it is. Sending carries on as normal.' };
  }
  if (rating === 'RED') {
    return { state: 'red', rating, tier, halveCap: true, blockCapRise: true,
      limitText: 'Meta rates the number RED. The queue was paused when it turned red, the daily cap is halved and cannot be raised.' };
  }
  if (rating === 'YELLOW') {
    return { state: 'yellow', rating, tier, halveCap: true, blockCapRise: true,
      limitText: 'Meta rates the number YELLOW. The daily cap is halved and cannot be raised until it is green again.' };
  }
  return { state: 'green', rating, tier, halveCap: false, blockCapRise: false, limitText: null };
}

/** The cap the drip uses after the rating rule. Halving rounds down; a cap of 0 stays 0. */
export function healthLimitedCap(dailyCap: number, v: HealthVerdict): number {
  return v.halveCap ? Math.floor(dailyCap / 2) : dailyCap;
}

/** Is this save a cap RISE the rating forbids? `currentCap` / `nextCap` are EFFECTIVE caps (stored, or the default). */
export function capRiseRefused(currentCap: number, nextCap: number, v: HealthVerdict): boolean {
  return v.blockCapRise && nextCap > currentCap;
}

/** Should the watcher pause the queue now? Only on the turn INTO red (previous reading not red). */
export function shouldPauseForRating(previous: unknown, next: QualityRating): boolean {
  return next === 'RED' && normaliseRating(previous) !== 'RED';
}

/** The auto-pause reason written when the rating turns red (shown in the panel's "paused itself" box). */
export const RED_PAUSE_REASON =
  'Meta rated the WhatsApp number RED, so the queue paused itself to protect the number. Check the number in Meta, then press Resume.';
