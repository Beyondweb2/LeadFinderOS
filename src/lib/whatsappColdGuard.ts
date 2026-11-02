/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE COLD WHATSAPP GUARD — ONE RULE FOR EVERY COLD SEND (2026-11-02, docs/whatsapp-safety-guard.md).

   One WhatsApp number sends for the whole team, and it has been rated RED since 25 Oct. The queue had a cap, a gap and a
   rating check; a person's cold send (Inbox, lead popup, a message queued overnight) had none of them. So the same rule is
   now asked by all three doors: process-whatsapp-queue, send-whatsapp-message and inbox-scheduled-send (through
   supabase/functions/_shared/cold-whatsapp-gate.ts). Pure and edge-reachable: relative imports with .ts, no Deno, no DOM.

   ⛔ IN ORDER, THE FIRST "NO" WINS:
      1. COLD STOP   — the stored tier dropped, or Meta flagged / restricted the number: ALL cold WhatsApp stops until a person
                       clears it. RED alone is not a stop (src/lib/whatsappNumberHealth.ts: it warns and halves the cap).
      2. COOL-DOWN   — a country whose sends failed in a pattern rests COOLDOWN_HOURS, then starts again by itself with a probe.
      3. TEAM CAP    — every cold send, every country, one count on the London day. The admin's daily_cap (src/lib/whatsappPace.ts).
      4. COUNTRY CAP — so one country cannot use the whole team cap. The UK has none by default: it uses the rest.
      5. PROBE       — the first PROBE_SIZE sends after a window opens or a cool-down ends, then wait for Meta's delivery reports.
   ⛔ AND THE GAP — one conditional write (claimColdSlot in the gate): at most one cold send every 1–2 minutes, whichever door.
      Malaysian openers queued overnight went 4 seconds apart at 07:00 on 2 Nov, and the country switched itself off.
   ⛔ COUNTED: cold templates (isColdOutreachTemplate) and the queue's own follow-up lanes. An in-window reply, a continuation
      template, Quick Close, the welcome pack and a test send are never counted and never stopped by this.
   ⛔ A NUMBER THAT IS NOT ON WHATSAPP SAYS NOTHING ABOUT US: it is left out of the probe, as the auto switch-off leaves it out
      (src/lib/countryAutoPause.ts). A send the webhook has not settled on the lead yet is treated as not settled.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { isColdOutreachTemplate } from './coldOutreach.ts';
import { localDayStartUtc, MARKET_NAME, windowForMarket, type CountrySetting, type CountrySettings, type Market } from './outreachMarkets.ts';

/** A country with no cap of its own, abroad. On a sending path absent is never "unlimited". The UK's absent cap is "the rest". */
export const DEFAULT_ABROAD_COLD_CAP = 30;
/** How long a country rests after a pattern of failures, or a failed probe abroad. */
export const COOLDOWN_HOURS = 24;
/** The UK is the main market and its cold lists hold more dead numbers: a failed probe rests it an hour, then a new probe.
 *  The queue's own burst auto-pause (src/lib/whatsappPace.ts) is unchanged and still needs a person. */
export const UK_PROBE_REST_HOURS = 1;
/** The first sends after a window opens or a cool-down ends. */
export const PROBE_SIZE = 3;
/** How many of the probe must be delivered to carry on, and how many failures end it. */
export const PROBE_PASS_DELIVERED = 2;
export const PROBE_FAIL_FAILED = 2;
/** How long the probe waits for delivery reports before deciding on what it has. */
export const PROBE_SETTLE_MIN = 30;
/** The gap between any two cold sends, whichever door, in milliseconds (a random point between the two). */
export const COLD_GAP_MIN_MS = 60_000;
export const COLD_GAP_MAX_MS = 120_000;
/** How far back the gate reads: a probe's start is at most a day old, and a local day can start 14 hours before London's. */
export const COLD_READ_HOURS = 48;

const LONDON = 'Europe/London';
/** The queue's own follow-up lanes: not cold by classification, but they spend the same number's allowance. */
const QUEUE_LANES: ReadonlySet<string> = new Set(['hook_followup', 'contact_followup']);
const DELIVERED: ReadonlySet<string> = new Set(['delivered', 'read']);
const FAILED: ReadonlySet<string> = new Set(['failed', 'failed_temporary']);

/** A whatsapp_sends row plus what its lead says about it (the gate reads both). */
export interface ColdSendRow {
  created_at: string;
  phone: string | null;
  template: string | null;
  user_id: string | null;
  delivery_status: string | null;
  error_code?: number | null;
  message_id?: string | null;
  test_mode?: boolean | null;
  /** The lead is flagged No WhatsApp (status or delivery status). */
  leadNoWhatsApp?: boolean;
  /** The lead's current message is this one and it carries no failure yet: the webhook has not settled it. */
  leadUnsettled?: boolean;
}

/** Is this send one the cap counts? In-window free text has no template; a test or simulated send never left. */
export function isCountedColdSend(r: Pick<ColdSendRow, 'template' | 'user_id' | 'test_mode' | 'delivery_status'>): boolean {
  if (r.test_mode === true || r.delivery_status === 'simulated') return false;
  const t = (r.template ?? '').trim();
  if (!t) return false;
  return isColdOutreachTemplate(t) || (r.user_id == null && QUEUE_LANES.has(t));
}

/** The market of a stored send, from its digits. Landlines and unknown numbers have no market here. */
export function coldMarketOfPhone(phone: string | null | undefined): Market | null {
  const d = String(phone ?? '').replace(/\D/g, '');
  if (d.startsWith('44')) return 'UK';
  if (d.startsWith('60')) return 'MY';
  if (d.startsWith('65')) return 'SG';
  if (d.startsWith('61')) return 'AU';
  return null;
}

/** The stored row with the cool-down columns (migration 20261201090000). */
export type CooldownSetting = CountrySetting & {
  whatsapp_cooldown_until?: string | null;
  whatsapp_cooldown_reason?: string | null;
  whatsapp_cooldown_started_at?: string | null;
};

/** The country's own cold cap. UK: null (the rest of the team cap). Abroad: its stored cap, or the default. */
export function countryColdCap(market: Market, s: CountrySetting | null | undefined): number | null {
  const stored = s?.whatsapp_daily_cap;
  if (typeof stored === 'number' && Number.isInteger(stored) && stored >= 0) return stored;
  return market === 'UK' ? null : DEFAULT_ABROAD_COLD_CAP;
}

const UK_WINDOW = { tz: LONDON, startMin: 7 * 60, endMin: 21 * 60 + 30 };

function marketDay(market: Market, settings: CountrySettings | null | undefined, now: Date) {
  const w = windowForMarket(market, settings, UK_WINDOW);
  const dayStart = localDayStartUtc(w.tz, now);
  return { dayStart, windowOpen: new Date(dayStart.getTime() + w.startMin * 60_000) };
}

export function cooldownUntil(s: CooldownSetting | null | undefined): Date | null {
  const raw = s?.whatsapp_cooldown_until;
  if (!raw) return null;
  const d = new Date(raw);
  return Number.isFinite(d.getTime()) ? d : null;
}

/** Is this country resting right now? */
export function inCooldown(s: CooldownSetting | null | undefined, now: Date = new Date()): boolean {
  const u = cooldownUntil(s);
  return !!u && u.getTime() > now.getTime();
}

/** When the running probe started: the latest of today's window opening, the end of the last cool-down, and the moment a person
 *  switched the country on (sends from before that say nothing about now: on 2 Nov this morning's failures rested a country that
 *  had been switched back on since). Derived, never stored. */
export function probeStart(market: Market, settings: CountrySettings | null | undefined, now: Date = new Date()): Date {
  const { windowOpen } = marketDay(market, settings, now);
  const s = settings?.[market] as CooldownSetting | undefined;
  let start = windowOpen;
  for (const d of [cooldownUntil(s), s?.whatsapp_on_since ? new Date(s.whatsapp_on_since) : null]) {
    if (d && Number.isFinite(d.getTime()) && d.getTime() > start.getTime() && d.getTime() <= now.getTime()) start = d;
  }
  return start;
}

export type ProbeState = 'probing' | 'waiting' | 'passed' | 'failed';
export interface ProbeVerdict { state: ProbeState; sent: number; delivered: number; failed: number }

/** The probe, from the market's counted sends since it started (any order). */
export function probeVerdict(sends: readonly ColdSendRow[], now: Date = new Date()): ProbeVerdict {
  const counted = sends
    .filter((r) => !(r.error_code === 131026 || r.delivery_status === 'no_whatsapp' || (FAILED.has(String(r.delivery_status)) && (r.leadNoWhatsApp === true || r.leadUnsettled === true))))
    .sort((a, b) => (a.created_at < b.created_at ? -1 : a.created_at > b.created_at ? 1 : 0));
  const first = counted.slice(0, PROBE_SIZE);
  const delivered = first.filter((r) => DELIVERED.has(String(r.delivery_status))).length;
  const failed = first.filter((r) => FAILED.has(String(r.delivery_status))).length;
  const base = { sent: first.length, delivered, failed };
  if (delivered >= PROBE_PASS_DELIVERED) return { state: 'passed', ...base };
  if (failed >= PROBE_FAIL_FAILED) return { state: 'failed', ...base };
  if (first.length < PROBE_SIZE) return { state: 'probing', ...base };
  /* All three went, and the reports do not decide it yet. One delivered and no second failure is enough once the wait is over:
     a phone that is simply off stays "sent" for days. Nothing delivered at all is never a pass. */
  const newest = Date.parse(first[first.length - 1].created_at);
  const settled = Number.isFinite(newest) && now.getTime() - newest >= PROBE_SETTLE_MIN * 60_000;
  if (!settled) return { state: 'waiting', ...base };
  return { state: delivered >= 1 ? 'passed' : 'failed', ...base };
}

export interface ColdFacts {
  /** The latched stop (whatsapp_outreach_state.cold_stop_*), or null. */
  stopReason: string | null;
  settings: CountrySettings | null | undefined;
  /** The effective team cap: the admin's cap after the rating rule. */
  teamCap: number;
  /** Counted cold sends of the last COLD_READ_HOURS, every market. */
  sends: readonly ColdSendRow[];
}

export type ColdCode = 'cold_stopped' | 'cooldown' | 'team_cap' | 'country_cap' | 'probe_wait' | 'probe_failed';
export type ColdVerdict =
  | { go: true; probing: boolean; used: number; cap: number | null }
  /** retryAt: when asking again makes sense. Null for a stop: only a person clears it. */
  | { go: false; code: ColdCode; reason: string; retryAt: Date | null; used: number; cap: number | null };

const atOrAfter = (r: ColdSendRow, d: Date) => Date.parse(r.created_at) >= d.getTime();

/** Counted cold sends on the London day: the number the team cap is compared with. */
export function teamColdCount(sends: readonly ColdSendRow[], now: Date = new Date()): number {
  const dayStart = localDayStartUtc(LONDON, now);
  return sends.filter((r) => atOrAfter(r, dayStart)).length;
}

/** May a cold send go to this market now? The gap is separate: it is a conditional write, not a read. */
export function coldVerdict(market: Market, facts: ColdFacts, now: Date = new Date()): ColdVerdict {
  const name = MARKET_NAME[market];
  const s = facts.settings?.[market] as CooldownSetting | undefined;
  const { dayStart } = marketDay(market, facts.settings, now);
  const mine = facts.sends.filter((r) => coldMarketOfPhone(r.phone) === market);
  const used = mine.filter((r) => atOrAfter(r, dayStart)).length;
  const cap = countryColdCap(market, s);
  if (facts.stopReason) {
    return { go: false, code: 'cold_stopped', reason: `All cold WhatsApp is stopped: ${facts.stopReason}`, retryAt: null, used, cap };
  }
  if (inCooldown(s, now)) {
    const until = cooldownUntil(s) as Date;
    return { go: false, code: 'cooldown', used, cap, retryAt: until,
      reason: `WhatsApp to ${name} is resting after failed sends and starts again by itself. ${s?.whatsapp_cooldown_reason ?? ''}`.trim() };
  }
  const teamUsed = teamColdCount(facts.sends, now);
  if (teamUsed >= facts.teamCap) {
    const next = new Date(localDayStartUtc(LONDON, now).getTime() + 25 * 3_600_000);
    return { go: false, code: 'team_cap', used, cap, retryAt: localDayStartUtc(LONDON, next),
      reason: `The team's cold WhatsApp cap for today is used (${teamUsed} of ${facts.teamCap}). It starts again tomorrow.` };
  }
  if (cap != null && used >= cap) {
    const tomorrow = new Date(dayStart.getTime() + 25 * 3_600_000);
    return { go: false, code: 'country_cap', used, cap, retryAt: marketDay(market, facts.settings, tomorrow).windowOpen,
      reason: `${name}'s cold WhatsApp cap for today is used (${used} of ${cap}). It starts again tomorrow.` };
  }
  const start = probeStart(market, facts.settings, now);
  const probe = probeVerdict(mine.filter((r) => atOrAfter(r, start)), now);
  if (probe.state === 'failed') {
    const hours = market === 'UK' ? UK_PROBE_REST_HOURS : COOLDOWN_HOURS;
    return { go: false, code: 'probe_failed', used, cap, retryAt: new Date(now.getTime() + hours * 3_600_000),
      reason: probeFailedReason(market, probe) };
  }
  if (probe.state === 'waiting') {
    return { go: false, code: 'probe_wait', used, cap, retryAt: new Date(now.getTime() + 2 * 60_000),
      reason: `The first ${PROBE_SIZE} sends to ${name} went. The rest wait for Meta's delivery reports.` };
  }
  return { go: true, probing: probe.state === 'probing', used, cap };
}

/** The stored reason when a probe fails (the pause log and the banner show it word for word). */
export function probeFailedReason(market: Market, p: Pick<ProbeVerdict, 'sent' | 'delivered' | 'failed'>): string {
  const hours = market === 'UK' ? UK_PROBE_REST_HOURS : COOLDOWN_HOURS;
  return `The first ${p.sent} sends to ${MARKET_NAME[market]} did not get through (${p.delivered} delivered, ${p.failed} failed). `
    + `It rests ${hours} ${hours === 1 ? 'hour' : 'hours'}, then tries ${PROBE_SIZE} again by itself.`;
}

/** The headline for a country in a cool-down. The reason itself is the stored one. */
export function cooldownHeadline(market: Market, s: CooldownSetting | null | undefined, timeZone?: string): string {
  const u = cooldownUntil(s);
  const when = u ? u.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', ...(timeZone ? { timeZone } : {}) }) : '';
  return `WhatsApp to ${MARKET_NAME[market]} is cooling down${when ? ` until ${when}` : ''}, then restarts by itself with ${PROBE_SIZE} sends`;
}

/** A random gap for the next cold slot. */
export function coldGapMs(rand: number = Math.random()): number {
  return Math.round(COLD_GAP_MIN_MS + Math.max(0, Math.min(1, rand)) * (COLD_GAP_MAX_MS - COLD_GAP_MIN_MS));
}

/** Words for a person whose cold send was held by the gap or the probe and queued for the next slot. */
export const COLD_SLOT_QUEUED_WORDS = 'Cold messages go one at a time, 1 to 2 minutes apart, so this one is queued for the next slot.';
