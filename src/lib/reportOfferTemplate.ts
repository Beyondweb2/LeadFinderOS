/* ══ ai_visibility_report_offer — THE REPORT OFFER (Paul, 2026-10-14; docs/team-access-tidy.md §5) ══════════════════
   Marketing, English. Submitted to Meta 2026-10-14 and wired in as approved: the queue still reads Meta's LIVE status
   before it sends (_shared/template-status.ts) and a not-approved / rejected answer is shown on the lead, never retried.

   ⛔ SIX VARIABLES, IN THIS ORDER (the registry entry in _shared/whatsapp-send.ts + the queue's mirror):
     {{1}} name_or_there     the lead's business name (the short greeting form), "there" when there is none
     {{2}} town              the town the lead's AI check SEARCHED (the audit's own location — what was actually asked)
     {{3}} competitors       the competitor names from that check's missed search, "A, B and C" / "A and B" / "A"
     {{4}} visibility_score  the check's overall AI visibility as a whole-number percentage with a % sign ("66%")
     {{5}} audit_url         the lead's public report link (findable.live/r/<code>, never a preview flag)
     {{6}} sender_name       the SENDING person's own message name (messageName.ts) — never anyone else's

   ⛔ NOT QUEUEABLE without every one of: competitor names, a score, a report link — or when the lead was named in the
      answers the message quotes ("it mentioned X but not you" must be true). Checked BEFORE queueing (the queue panel
      says why) and again at send time (the drip refuses and says so on the lead). Never a filler, never a guess.
   ⚠️ A WARNING, NOT A BLOCK, when the lead is not in Malaysia / Singapore / the UK, or its trade is not a language
      school — the body says "the best English language school in {{2}}".
   Pure. Edge-reachable: relative imports only. */
import type { Market } from './outreachMarkets.ts';

export const REPORT_OFFER_TEMPLATE = 'ai_visibility_report_offer';

/** The registered variable order. Both registries carry exactly this list (a test pins it). */
export const REPORT_OFFER_VARS = ['name_or_there', 'town', 'competitors', 'visibility_score', 'audit_url', 'sender_name'] as const;

/** {{1}} when the lead has no usable business name. */
export const REPORT_OFFER_NO_NAME = 'there';

/** The registered wording (display only — Meta renders the real message from its own copy). */
export function reportOfferBody(v: { name: string; town: string; competitors: string; score: string; link: string; sender: string }): string {
  return `Hi ${v.name || REPORT_OFFER_NO_NAME}, I searched Google AI and ChatGPT for the best English language school in ${v.town} and it mentioned
${v.competitors}
but not you.
Your AI visibility score is ${v.score}.
Here is your free report: ${v.link}
I know how to get you showing up more in those answers so students are more likely to find you.
Can I call you, or send you more info?
${v.sender} 😊`;
}

/** Names joined as a person writes them: "A", "A and B", "A, B and C". Blank names are dropped. */
export function joinNames(names: readonly string[]): string {
  const n = names.map((s) => String(s ?? '').replace(/\s+/g, ' ').trim()).filter(Boolean);
  if (n.length <= 1) return n[0] ?? '';
  return `${n.slice(0, -1).join(', ')} and ${n[n.length - 1]}`;
}

/** {{4}}: a whole-number percentage with a % sign, or '' when there is no score. */
export function formatVisibilityScore(pct: number | null | undefined): string {
  if (typeof pct !== 'number' || !Number.isFinite(pct) || pct < 0 || pct > 100) return '';
  return `${Math.round(pct)}%`;
}

/* ── Why it cannot be queued (positive checks; absent = refuse) ────────────────────────────────────────────── */
export type ReportOfferRefusal = 'no_audit' | 'no_competitors' | 'no_score' | 'no_report_link' | 'named_in_answers' | 'no_sender';

export const REPORT_OFFER_REFUSAL_WORDS: Record<ReportOfferRefusal, string> = {
  no_audit: 'no finished AI check yet',
  no_competitors: 'its AI check named no competitors',
  /* A score needs every answer of a scored check (a quick check, or a bulk audit with its score marker —
     docs/bulk-audit-score.md). One failed or missing answer, or an older audit from before scores, has none. */
  no_score: 'its AI check has no visibility score — an answer failed or is missing, or it is an older audit (run a quick AI check)',
  no_report_link: 'it has no report link',
  named_in_answers: 'the AI answers already mentioned this business',
  no_sender: 'no sender name',
};

export interface ReportOfferFacts {
  /** A finished AI check exists for the lead. */
  hasAudit: boolean;
  competitors: string;
  score: string;
  link: string;
  /** The answers the message quotes named the lead (or every answer did). */
  namedInAnswers: boolean;
}

/** The first reason this lead cannot get the report offer, or null when it can. */
export function reportOfferRefusal(f: ReportOfferFacts): ReportOfferRefusal | null {
  if (!f.hasAudit) return 'no_audit';
  if (f.namedInAnswers) return 'named_in_answers';
  if (!String(f.competitors ?? '').trim()) return 'no_competitors';
  if (!String(f.score ?? '').trim()) return 'no_score';
  if (!/^https:\/\/findable\.live\/(r|report)\/[A-Za-z0-9-]+$/.test(String(f.link ?? '').trim())) return 'no_report_link';
  return null;
}

/* ── Warnings (shown, never blocking) ──────────────────────────────────────────────────────────────────────── */
export const REPORT_OFFER_MARKETS: ReadonlySet<Market> = new Set<Market>(['MY', 'SG', 'UK']);

const LANGUAGE_SCHOOL_RE = /\b(language|english|esl|efl|ielts|toefl|tesol|celta|cambridge english|phonics|speaking cent(?:er|re))\b/i;

/** Does the lead's trade read as a language school? (Display warning only.) */
export function isLanguageSchoolTrade(trade: string | null | undefined): boolean {
  return LANGUAGE_SCHOOL_RE.test(String(trade ?? ''));
}

export type ReportOfferWarning = 'outside_markets' | 'not_language_school';

export const REPORT_OFFER_WARNING_WORDS: Record<ReportOfferWarning, string> = {
  outside_markets: 'not in Malaysia, Singapore or the UK',
  not_language_school: 'not a language school (the message says “English language school”)',
};

export function reportOfferWarnings(l: { market: Market | null; trade: string | null | undefined }): ReportOfferWarning[] {
  const w: ReportOfferWarning[] = [];
  if (!l.market || !REPORT_OFFER_MARKETS.has(l.market)) w.push('outside_markets');
  if (!isLanguageSchoolTrade(l.trade)) w.push('not_language_school');
  return w;
}

/* ══ THE FOUR UK-WORDED TEMPLATES ARE NEVER SENT OUTSIDE THE UK (2026-10-14, docs/my-sg-support.md) ═══════════
   explain_offer / explain_offer_v2 quote "941 UK businesses" and £ prices, re_engage £49.99, booking_switch_barbers
   £29.99. A Malaysian or Singapore number (any market other than the UK) is refused — and so is an unknown one: on a
   sending path, unknown means do not. Read by both senders and the queue's pre-check. */
export const UK_WORDED_TEMPLATES: ReadonlySet<string> = new Set(['explain_offer', 'explain_offer_v2', 're_engage', 'booking_switch_barbers']);

/** A refusal sentence when this template must not go to this market, else null. */
export function ukWordedTemplateRefusal(template: string | null | undefined, market: Market | null): string | null {
  const t = String(template ?? '').trim();
  if (!UK_WORDED_TEMPLATES.has(t)) return null;
  if (market === 'UK') return null;
  return `${t} is written for UK businesses (UK figures and £ prices), so it is not sent to ${market === 'MY' ? 'Malaysia' : market === 'SG' ? 'Singapore' : 'a number outside the UK'}.`;
}

/* ── Why the queue let a lead go without sending, in plain words (whatsapp_delivery_status tokens, 2026-10-14) ── */
const META_STATUS_WORDS: Record<string, string> = {
  pending: 'still waiting for Meta to approve it', in_appeal: 'under appeal at Meta', rejected: 'rejected by Meta',
  paused: 'paused by Meta', disabled: 'disabled by Meta', limit_exceeded: 'over Meta’s limit', not_found: 'not found in our WhatsApp account',
};

/** A plain sentence for a queue drop token this change writes, or null for any other token. Nothing is retried. */
export function queueDropWords(token: string | null | undefined): string | null {
  const t = String(token ?? '');
  if (t.startsWith('report_offer_')) {
    const r = t.slice('report_offer_'.length) as ReportOfferRefusal;
    return REPORT_OFFER_REFUSAL_WORDS[r] ? `Report offer not sent: ${REPORT_OFFER_REFUSAL_WORDS[r]}.` : null;
  }
  if (t === 'template_unavailable') return 'Not sent: Meta would not accept this template (not approved, paused or disabled). It will not retry.';
  if (t === 'template_vars_mismatch') return 'Not sent: the template’s details don’t match what Meta has registered. Tell Paul. It will not retry.';
  if (t.startsWith('template_') && META_STATUS_WORDS[t.slice('template_'.length)]) return `Not sent: the template is ${META_STATUS_WORDS[t.slice('template_'.length)]}. It will not retry.`;
  if (t === 'uk_template_wrong_country') return 'Not sent: that template is written for UK businesses (£ prices), so it never goes to Malaysia or Singapore.';
  return null;
}
