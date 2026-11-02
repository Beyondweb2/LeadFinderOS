/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE WHATSAPP NUMBER'S QUALITY RATING AND MESSAGING TIER — ONE RULE (2026-10-21, docs/whatsapp-number-health.md).

   fn whatsapp-number-health reads Meta's quality rating and messaging tier for WHATSAPP_PHONE_NUMBER_ID every
   HEALTH_CHECK_EVERY_MIN minutes and stores them on whatsapp_outreach_state (id 1). This leaf turns what is stored
   into what the queue may do. The watcher, the queue (process-whatsapp-queue) and the pace panel all import it
   (relative .ts imports only: edge-reachable).

   ⛔ GREEN  → nothing changes.
   ⛔ YELLOW, RED → A WARNING BANNER AND NOTHING ELSE (Paul, 2026-11-02). No pause, no halved cap, no block on changing a cap, in any
              country. RED used to pause the queue, then to halve the cap; the UK's caps are its own now and the rating has flipped three
              times in a week. What stops everything is the tripwire below.
   ⛔ TRIPWIRE → the stored tier DROPS, or Meta says the number is FLAGGED / RESTRICTED / BANNED or cannot send: ALL cold WhatsApp
              stops (whatsapp_outreach_state.cold_stop_at, src/lib/whatsappColdGuard.ts) until a person clears it. Latched on the
              turn into the state, so a person's clear is not fought while it lasts. An absent or unreadable value never trips it.
   ⛔ CANNOT BE READ (no reading yet, the last good reading is older than HEALTH_STALE_AFTER_MIN, or Meta says
              UNKNOWN) → sending is NEVER paused or slowed.
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
    return { state: 'unreadable', rating: fresh ? rating : 'UNKNOWN', tier,
      limitText: 'The number’s quality rating could not be read from Meta. Sending carries on as normal.' };
  }
  if (rating === 'RED') {
    return { state: 'red', rating, tier,
      limitText: 'Meta rates the number RED. This is a warning: caps and sending do not change. Meta lowering the tier, or flagging or restricting the number, stops all cold WhatsApp.' };
  }
  if (rating === 'YELLOW') {
    return { state: 'yellow', rating, tier,
      limitText: 'Meta rates the number YELLOW. This is a warning: caps and sending do not change.' };
  }
  return { state: 'green', rating, tier, limitText: null };
}

/** A tier as a number to compare. Unlimited is the highest; absent, or a word we do not know, is null (never a drop). */
export function tierRank(tier: string | null | undefined): number | null {
  const s = String(tier ?? '').trim().toUpperCase();
  if (s === 'TIER_UNLIMITED' || s === 'UNLIMITED') return Number.POSITIVE_INFINITY;
  return tierLimit(s);
}

/** Did the tier go DOWN? Both readings must be known. */
export function tierDropped(previous: string | null | undefined, next: string | null | undefined): boolean {
  const a = tierRank(previous); const b = tierRank(next);
  return a != null && b != null && b < a;
}

const LIMITED_STATUSES: ReadonlySet<string> = new Set(['FLAGGED', 'RESTRICTED', 'BANNED']);

/** Does Meta say this number is limited? Meta's phone number status, or health_status.can_send_message = BLOCKED. Positive:
 *  an absent value, CONNECTED, or Meta's LIMITED is not a stop. Live on 2 Nov the number reads CONNECTED / LIMITED while sending, and
 *  Meta's only messaging note on it is a warning that the tier will fall if RED persists (docs/whatsapp-safety-guard.md). */
export function numberLimited(status: string | null | undefined, canSend: string | null | undefined): boolean {
  return LIMITED_STATUSES.has(String(status ?? '').trim().toUpperCase()) || String(canSend ?? '').trim().toUpperCase() === 'BLOCKED';
}

export interface TripwireInput { prevTier?: string | null; tier?: string | null; prevStatus?: string | null; status?: string | null; prevCanSend?: string | null; canSend?: string | null }

/** The reason to stop all cold WhatsApp, on the turn into it, or null. */
export function tripwireReason(i: TripwireInput): string | null {
  if (numberLimited(i.status, i.canSend) && !numberLimited(i.prevStatus, i.prevCanSend)) {
    return 'Meta says the WhatsApp number is ' + String(i.status ?? 'blocked from sending').toLowerCase() + '. Check it in WhatsApp Manager, then clear this.';
  }
  if (tierDropped(i.prevTier, i.tier)) {
    return "Meta lowered the number's messaging tier (" + tierWords(i.prevTier) + ' to ' + tierWords(i.tier) + '). Check it in WhatsApp Manager, then clear this.';
  }
  return null;
}
