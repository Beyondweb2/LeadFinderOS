/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE SALES DASHBOARD FOLD (2026-09-28, Paul: "what is working, what is not, where should I focus").
   Pure: rows in, counts out. Run by the edge function `sales-performance` on the service role, so a
   salesperson's WON leads still count after they become clients (the sales_leads view hides clients),
   and so nothing but COUNTS and the rep's own won business names ever reach the browser — no amount,
   no Stripe field, no message body.

   ⛔ THE DEFINITIONS LIVE HERE AND ONLY HERE (docs/sales-readiness.md quotes them):
   - SCOPE: the leads currently assigned to the person (or every lead, for the admin's "Everyone").
   - A SEND IS THE PERSON'S when sent_by_user_id is them, or is empty (the queue sent it for the lead's
     owner). A send somebody else made by hand is not theirs, even on their lead.
   - CONTACTED: a real WhatsApp send (isRealSend) that is theirs, or a contact they logged (call,
     LinkedIn, email, in person, other — any outcome, "no answer" included: it was an attempt).
   - RESPONDED: a human WhatsApp reply (looksAutomated excluded), or a logged contact whose outcome is
     a conversation (CONVERSATION_OUTCOMES). "No answer", "left voicemail", "wrong number" are not.
   - INTERESTED (ever): the star, an interested/quoted/won-pending status, an "interested" or "meeting
     booked" outcome, a starred activity, or won.
   - NOT INTERESTED (now): not won, and the status is not_interested/opted_out or the latest logged
     outcome is not_interested. Current state, so it can overlap "interested (ever)".
   - ONBOARDING SENT: a recorded link send (onboarding_link_events kind 'sent') that is theirs.
   - ONBOARDING OPENED: a page load of the sign-up page (lead_page_hits page 'onboarding' — previews
     are 'onboarding_preview' and never count) at or after the FIRST send, less OPEN_ATTRIBUTION_SLACK_MS.
     A load before any recorded send is not an open of a link we sent.
   - WON: isPaidLead (amount_paid > 0 and not refunded) — the one money rule.
   - TEMPLATE REPLY: last touch (creditRepliesToSends, the campaign card's rule), and the reply is the
     person's only when the credited send was theirs. Interested / onboarding / won on a template row
     are DOWNSTREAM of that credited reply: of the leads whose reply this template earned.
   - PERIOD: a lead is in the period when it was FIRST CONTACTED in it; a template row counts sends
     made in it.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { isRealSend } from './realSend.ts';
import { CONTACT_METHODS } from './contactMethods.ts';
import { looksAutomated } from './inboundClassify.ts';
import { isPaidLead } from './leadPayment.ts';
import { creditRepliesToSends, SITE_TRACKING_START } from './templateAttribution.ts';
import { onboardingLinkStatus } from './onboardingLinkStatus.ts';
import { CONVERSATION_OUTCOMES, NOT_INTERESTED_STATUSES, REACHED_OUTCOMES } from './leadState.ts';
import { holderTimeline } from './holderTimeline.ts';
import { londonDay, londonMidnightMs } from './reportingPeriod.ts';

export interface PerfLead {
  id: string;
  /** Who holds it now. Absent (an older caller) → past events count for the person whose list this is, as before. */
  assigned_to_user_id?: string | null;
  business_name: string | null;
  campaign_id: string | null;
  status: string | null;
  amount_paid: number | null;
  is_potential_work: boolean | null;
  lead_source: string | null;
  /** Stamped once at payment (trg_outreach_leads_sold_by); survives reassignment. Absent on older reads. */
  sold_by_user_id?: string | null;
}
export interface PerfMessage {
  lead_id: string;
  direction: string | null;
  template_name: string | null;
  status: string | null;
  created_at: string;
  body: string | null;
  sent_by_user_id: string | null;
}
export interface PerfActivity { lead_id: string; actor_user_id: string | null; kind: string; data: Record<string, unknown> | null; created_at: string }
export interface PerfLinkEvent { lead_id: string; kind: string; channel: string; actor_user_id: string | null; created_at: string }
export interface PerfHit { lead_id: string; page: string; created_at: string }

/** The dashboard's channels ARE the one contact-method set (src/lib/contactMethods.ts, 2026-09-28). */
export const CONTACT_CHANNELS: readonly string[] = CONTACT_METHODS.map((m) => m.value);
export type ContactChannel = string;
/** Outcomes that mean a real conversation happened — THE list lives in leadState.ts (2026-10-01). */
export { CONVERSATION_OUTCOMES };
const INTERESTED_OUTCOMES: ReadonlySet<string> = new Set(['interested', 'meeting_booked']);
const INTERESTED_STATUSES: ReadonlySet<string> = new Set(['interested', 'price_given', 'won_pending_onboarding']);
/* NOT INTERESTED is the lead state engine's set (src/lib/leadState.ts, 2026-09-30) — it now includes
   'closed' (removed from the Inbox by the button), which salesStageOf always filed as not interested and
   this fold alone did not: 3 leads on 2026-09-30. */
const CONTACT_KINDS: ReadonlySet<string> = new Set(['call_outcome', 'contact_logged']);

export interface FunnelCounts {
  leads: number;
  contacted: number;
  responded: number;
  interested: number;
  notInterested: number;
  followedUp: number;
  onboardingSent: number;
  onboardingOpened: number;
  won: number;
}
export interface CampaignRow extends FunnelCounts {
  campaignId: string | null; name: string; byChannel: Record<ContactChannel, number>;
  /** The newest contact (send or logged contact) on any of its leads — for "Hide inactive" only. */
  lastActivityAt: string | null;
}
export interface TemplateRow {
  template: string;
  sends: number;
  leadsSent: number;
  replies: number;
  repliesContested: number;
  interested: number;
  notInterested: number;
  onboardingSent: number;
  onboardingOpened: number;
  won: number;
  /** The newest real send of this template — for "Hide inactive" only. */
  lastActivityAt: string | null;
}
export interface ChannelRow { channel: ContactChannel; contacted: number; responded: number }
export interface SourceRow extends FunnelCounts { source: string | null }
export interface CallStats { total: number; byOutcome: Record<string, number> }
export interface SalesPerformance {
  funnel: FunnelCounts;
  campaigns: CampaignRow[];
  templates: TemplateRow[];
  channels: ChannelRow[];
  sources: SourceRow[];
  calls: CallStats;
  won: { name: string; campaign: string }[];
  /** WHERE TO FOCUS — leads, not rates: interested but never sent the sign-up link; opened the link
   *  but not a client. Both are the next call to make. */
  focus: { interestedNoLink: number; openedNotWon: number };
  /** What each number can and cannot see, so a screen never presents history we did not record. */
  tracking: { opensSince: string; contactLogSince: string; senderSince: string };
}

export const CONTACT_LOG_START = '2026-09-27';
export const SENDER_TRACKING_START = '2026-09-27';

const zeroFunnel = (): FunnelCounts => ({ leads: 0, contacted: 0, responded: 0, interested: 0, notInterested: 0, followedUp: 0, onboardingSent: 0, onboardingOpened: 0, won: 0 });
const zeroChannels = (): Record<ContactChannel, number> => Object.fromEntries(CONTACT_CHANNELS.map((c) => [c, 0]));
const t = (iso: string) => Date.parse(iso);

/** Per-lead facts, the ONE reading of contacted / responded / interested / link / won. The dashboard's
 *  workspace fold (salesWorkspace.ts) reads these — it never re-derives any of them. */
export interface LeadFacts {
  lead: PerfLead;
  /** This person's contact moments (real sends + logged contacts), ascending. */
  contactTimesMs: number[];
  /** Every human reply on the lead (looksAutomated excluded), ascending. */
  humanReplyTimesMs: number[];
  /** The first recorded moment the lead became interested (star, stage, outcome), or null when the
   *  only evidence is a status with no recorded moment. */
  interestedAtMs: number | null;
  linkFirstSentAt: string | null;
  linkFirstOpenedAt: string | null;
  /** The lead's WhatsApp thread, ascending (for conversationState). */
  thread: PerfMessage[];
  firstContactMs: number | null;
  lastContactMs: number | null;
  contactCount: number;
  channels: Set<ContactChannel>;
  respondedChannels: Set<ContactChannel>;
  responded: boolean;
  interested: boolean;
  notInterested: boolean;
  onboardingSent: boolean;
  onboardingOpened: boolean;
  won: boolean;
}

export interface FoldInput {
  personId: string | null;
  sinceMs: number | null;
  leads: PerfLead[];
  messages: PerfMessage[];
  activity: PerfActivity[];
  linkEvents: PerfLinkEvent[];
  hits: PerfHit[];
  campaignNames: Map<string, string>;
}

/** Is this row the person's own doing? Empty sender/actor = automation on the owner's behalf. */
const isMine = (personId: string | null, who: string | null) => personId === null || who === null || who === personId;
/* ⛔ An event that names no person counts for whoever held the lead WHEN it happened (holderTimeline,
   2026-10-01), never for whoever holds it now — a moved lead brings its past along only as history. */
const isMineAt = (personId: string | null, who: string | null, heldBy: (t: number) => string | null, at: number) =>
  personId === null || (who ?? heldBy(at)) === personId;

function groupBy<T extends { lead_id: string }>(rows: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) { const a = m.get(r.lead_id); if (a) a.push(r); else m.set(r.lead_id, [r]); }
  return m;
}

export function foldSalesPerformance(input: FoldInput): SalesPerformance {
  return foldSalesPerformanceWithFacts(input).result;
}

/** The same fold, plus the per-lead facts it was built from (for the workspace fold). */
export function foldSalesPerformanceWithFacts(input: FoldInput): { result: SalesPerformance; facts: LeadFacts[] } {
  const { personId, sinceMs } = input;
  const msgsBy = groupBy(input.messages);
  const actBy = groupBy(input.activity);
  const linkBy = groupBy(input.linkEvents);
  const hitsBy = groupBy(input.hits);
  for (const a of msgsBy.values()) a.sort((x, y) => t(x.created_at) - t(y.created_at));

  const facts: LeadFacts[] = [];
  const templateAgg = new Map<string, TemplateRow & { _leads: Set<string> }>();
  const creditedTemplate = new Map<string, string[]>(); // lead → templates whose reply it earned (mine)
  const calls: CallStats = { total: 0, byOutcome: {} };

  for (const lead of input.leads) {
    const msgs = msgsBy.get(lead.id) ?? [];
    const acts = (actBy.get(lead.id) ?? []).slice().sort((x, y) => t(x.created_at) - t(y.created_at));
    /* Who held it when (holderTimeline). The current holder is known only if the caller read it; if not, an
       unnamed event counts for the person whose leads these are — exactly the behaviour before 2026-10-01. */
    const heldBy: (at: number) => string | null = 'assigned_to_user_id' in lead
      ? holderTimeline(lead.assigned_to_user_id ?? null, acts)
      : () => personId;
    const contactTimes: number[] = [];
    const channels = new Set<ContactChannel>();
    const respondedChannels = new Set<ContactChannel>();

    for (const m of msgs) {
      if (m.direction === 'outbound' && isRealSend(m.status) && isMineAt(personId, m.sent_by_user_id, heldBy, t(m.created_at))) {
        contactTimes.push(t(m.created_at)); channels.add('whatsapp');
      }
    }
    // A WhatsApp response is a human reply AFTER this person's first send — a reply to somebody
    // else's message on the same thread is not theirs.
    const firstWaMs = contactTimes.length ? Math.min(...contactTimes) : null;
    const humanReply = firstWaMs !== null && msgs.some((m) =>
      m.direction === 'inbound' && t(m.created_at) >= firstWaMs && !looksAutomated(m.body ?? ''));
    if (humanReply) respondedChannels.add('whatsapp');

    let latestOutcome: string | null = null;
    let starred = false;
    let interestedAtMs: number | null = null;
    const markInterested = (iso: string) => { const v = t(iso); if (interestedAtMs === null || v < interestedAtMs) interestedAtMs = v; };
    for (const a of acts) {
      if (a.kind === 'marked_interested' && a.data?.on !== false) { starred = true; markInterested(a.created_at); }
      if (a.kind === 'stage_changed' && INTERESTED_STATUSES.has(String(a.data?.to ?? ''))) markInterested(a.created_at);
      if (CONTACT_KINDS.has(a.kind) && INTERESTED_OUTCOMES.has(String(a.data?.outcome ?? ''))) markInterested(a.created_at);
      if (!CONTACT_KINDS.has(a.kind) || !isMineAt(personId, a.actor_user_id, heldBy, t(a.created_at))) continue;
      const outcome = String(a.data?.outcome ?? '');
      const ch = (a.kind === 'call_outcome' ? 'call' : String(a.data?.channel ?? 'other')) as ContactChannel;
      const channel: ContactChannel = (CONTACT_CHANNELS as readonly string[]).includes(ch) ? ch : 'other';
      /* ⛔ Contacted counts only a logged contact that REACHED them (2026-10-01): a no-answer / voicemail call is an
         attempt — it still counts in the call stats below and stays in History. */
      if (REACHED_OUTCOMES.has(outcome)) { contactTimes.push(t(a.created_at)); channels.add(channel); }
      if (CONVERSATION_OUTCOMES.has(outcome)) respondedChannels.add(channel);
      latestOutcome = outcome;
      if (channel === 'call' && (sinceMs === null || t(a.created_at) >= sinceMs)) {
        calls.total += 1; calls.byOutcome[outcome] = (calls.byOutcome[outcome] ?? 0) + 1;
      }
      if (INTERESTED_OUTCOMES.has(outcome)) starred = true;
    }

    // The sign-up link's sent/opened rule is onboardingLinkStatus — the prospect panel reads the same.
    const link = onboardingLinkStatus(linkBy.get(lead.id) ?? [], hitsBy.get(lead.id) ?? [], (who) => isMine(personId, who));

    /* ⛔ A WIN BELONGS TO WHOEVER MADE THE SALE (sold_by_user_id, stamped at payment), not to whoever
       holds the lead now: a client reassigned after payment stays won for the seller and is never
       counted for the new holder. Older clients with no stamp fall back to the holder, as before. */
    const won = isPaidLead(lead) && (personId === null || !lead.sold_by_user_id || lead.sold_by_user_id === personId);
    const status = String(lead.status ?? '');
    const f: LeadFacts = {
      lead,
      contactTimesMs: contactTimes.slice().sort((a, b) => a - b),
      humanReplyTimesMs: msgs.filter((m) => m.direction === 'inbound' && !looksAutomated(m.body ?? '')).map((m) => t(m.created_at)),
      interestedAtMs,
      linkFirstSentAt: link.firstSentAt,
      linkFirstOpenedAt: link.firstOpenedAt,
      thread: msgs,
      firstContactMs: contactTimes.length ? Math.min(...contactTimes) : null,
      lastContactMs: contactTimes.length ? Math.max(...contactTimes) : null,
      contactCount: contactTimes.length,
      channels, respondedChannels,
      responded: respondedChannels.size > 0,
      interested: won || lead.is_potential_work === true || INTERESTED_STATUSES.has(status) || starred,
      notInterested: !won && (NOT_INTERESTED_STATUSES.has(status) || latestOutcome === 'not_interested'),
      onboardingSent: link.sentCount > 0,
      onboardingOpened: link.opened,
      won,
    };
    facts.push(f);

    // Templates: last touch over the lead's WHOLE thread, kept only when the credited send was mine.
    const credits = creditRepliesToSends(msgs);
    const mineCredited: string[] = [];
    for (const c of credits) {
      const send = msgs[c.sendIndex];
      if (!isMineAt(personId, send.sent_by_user_id, heldBy, t(send.created_at))) continue;
      if (sinceMs !== null && t(send.created_at) < sinceMs) continue;
      mineCredited.push(c.template);
      const row = rowFor(templateAgg, c.template);
      row.replies += 1;
      if (c.ambiguous) row.repliesContested += 1;
    }
    creditedTemplate.set(lead.id, mineCredited);
    for (const m of msgs) {
      if (m.direction !== 'outbound' || !m.template_name || !isRealSend(m.status) || !isMineAt(personId, m.sent_by_user_id, heldBy, t(m.created_at))) continue;
      if (sinceMs !== null && t(m.created_at) < sinceMs) continue;
      const row = rowFor(templateAgg, m.template_name);
      row.sends += 1; row._leads.add(lead.id);
      if (!row.lastActivityAt || m.created_at > row.lastActivityAt) row.lastActivityAt = m.created_at;
    }
    for (const tpl of mineCredited) {
      const row = rowFor(templateAgg, tpl);
      if (f.interested) row.interested += 1;
      if (f.notInterested) row.notInterested += 1;
      if (f.onboardingSent) row.onboardingSent += 1;
      if (f.onboardingOpened) row.onboardingOpened += 1;
      if (f.won) row.won += 1;
    }
  }

  const inPeriod = (f: LeadFacts) => sinceMs === null || (f.firstContactMs !== null && f.firstContactMs >= sinceMs);
  const scoped = facts.filter((f) => sinceMs === null || inPeriod(f));
  const add = (c: FunnelCounts, f: LeadFacts) => {
    c.leads += 1;
    if (f.contactCount > 0) c.contacted += 1;
    if (f.responded) c.responded += 1;
    if (f.interested) c.interested += 1;
    if (f.notInterested) c.notInterested += 1;
    if (f.contactCount > 1) c.followedUp += 1;
    if (f.onboardingSent) c.onboardingSent += 1;
    if (f.onboardingOpened) c.onboardingOpened += 1;
    if (f.won) c.won += 1;
  };

  const funnel = zeroFunnel();
  const byCampaign = new Map<string, CampaignRow>();
  const bySource = new Map<string, SourceRow>();
  const channelAgg = new Map<ContactChannel, ChannelRow>();
  for (const f of scoped) {
    add(funnel, f);
    const cKey = f.lead.campaign_id ?? '';
    let row = byCampaign.get(cKey);
    if (!row) {
      row = { ...zeroFunnel(), campaignId: f.lead.campaign_id, name: f.lead.campaign_id ? (input.campaignNames.get(f.lead.campaign_id) ?? 'Campaign') : 'No campaign', byChannel: zeroChannels(), lastActivityAt: null };
      byCampaign.set(cKey, row);
    }
    add(row, f);
    if (f.lastContactMs !== null) {
      const iso = new Date(f.lastContactMs).toISOString();
      if (!row.lastActivityAt || iso > row.lastActivityAt) row.lastActivityAt = iso;
    }
    for (const ch of f.channels) row.byChannel[ch] += 1;
    const sKey = f.lead.lead_source ?? '';
    let srow = bySource.get(sKey);
    if (!srow) { srow = { ...zeroFunnel(), source: f.lead.lead_source }; bySource.set(sKey, srow); }
    add(srow, f);
    for (const ch of f.channels) {
      let c = channelAgg.get(ch);
      if (!c) { c = { channel: ch, contacted: 0, responded: 0 }; channelAgg.set(ch, c); }
      c.contacted += 1;
      if (f.respondedChannels.has(ch)) c.responded += 1;
    }
  }

  const templates: TemplateRow[] = [...templateAgg.values()]
    .map(({ _leads, ...r }) => ({ ...r, leadsSent: _leads.size }))
    .filter((r) => r.leadsSent > 0)
    .sort((a, b) => b.leadsSent - a.leadsSent);

  const result: SalesPerformance = {
    funnel,
    focus: {
      interestedNoLink: scoped.filter((f) => f.interested && !f.won && !f.notInterested && !f.onboardingSent).length,
      openedNotWon: scoped.filter((f) => f.onboardingOpened && !f.won).length,
    },
    campaigns: [...byCampaign.values()].filter((r) => r.contacted > 0 || r.leads > 0).sort((a, b) => b.contacted - a.contacted || b.leads - a.leads),
    templates,
    channels: CONTACT_CHANNELS.map((ch) => channelAgg.get(ch)).filter((r): r is ChannelRow => !!r),
    sources: [...bySource.values()].sort((a, b) => b.leads - a.leads),
    calls,
    won: scoped.filter((f) => f.won).map((f) => ({
      name: f.lead.business_name ?? 'Unnamed business',
      campaign: f.lead.campaign_id ? (input.campaignNames.get(f.lead.campaign_id) ?? 'Campaign') : 'No campaign',
    })),
    tracking: { opensSince: new Date(SITE_TRACKING_START).toISOString().slice(0, 10), contactLogSince: CONTACT_LOG_START, senderSince: SENDER_TRACKING_START },
  };
  return { result, facts };
}

function rowFor(m: Map<string, TemplateRow & { _leads: Set<string> }>, template: string) {
  let r = m.get(template);
  if (!r) {
    r = { template, sends: 0, leadsSent: 0, replies: 0, repliesContested: 0, interested: 0, notInterested: 0, onboardingSent: 0, onboardingOpened: 0, won: 0, lastActivityAt: null, _leads: new Set() };
    m.set(template, r);
  }
  return r;
}

/** A rate only where the denominator means something; null renders as a dash, never 0%. */
export function rate(num: number, den: number): number | null {
  return den > 0 ? Math.round((num / den) * 1000) / 10 : null;
}

export const PERIODS = [
  { value: 'all', label: 'All time', days: null },
  /* The London calendar month (2026-10-01): the Sales page counts the same month the commission ladder does. */
  { value: 'month', label: 'This month', days: null },
  { value: '30', label: 'Last 30 days', days: 30 },
  { value: '7', label: 'Last 7 days', days: 7 },
] as const;
export type PeriodValue = typeof PERIODS[number]['value'];
export function periodSinceMs(p: string, now = Date.now()): number | null {
  if (p === 'month') return londonMidnightMs(`${londonDay(now).slice(0, 7)}-01`);
  const d = PERIODS.find((x) => x.value === p)?.days ?? null;
  return d === null ? null : now - d * 86_400_000;
}

/** Where a person found a business. The keys are the DB CHECK list (outreach_leads_lead_source_check,
 *  sales_add_lead) — scripts/self-sourced-handoff.test.ts holds them equal. Order = the picker's order. */
export const LEAD_SOURCE_LABELS: Record<string, string> = {
  facebook: 'Facebook', linkedin: 'LinkedIn', google_maps: 'Google / Maps', referral: 'Referral',
  networking: 'Networking', email_research: 'Email research', ai_research: 'AI-assisted research',
  existing_relationship: 'Existing relationship', social: 'Other social media', cold_research: 'Cold research',
  other: 'Other',
};
export const leadSourceLabel = (s: string | null | undefined) => (s ? LEAD_SOURCE_LABELS[s] ?? s : 'App search');
export const CHANNEL_LABELS: Record<ContactChannel, string> = Object.fromEntries(CONTACT_METHODS.map((m) => [m.value, m.label]));
