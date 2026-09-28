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
import { looksAutomated } from './inboundClassify.ts';
import { isPaidLead } from './leadPayment.ts';
import { creditRepliesToSends, SITE_TRACKING_START } from './templateAttribution.ts';
import { onboardingLinkStatus } from './onboardingLinkStatus.ts';

export interface PerfLead {
  id: string;
  business_name: string | null;
  campaign_id: string | null;
  status: string | null;
  amount_paid: number | null;
  is_potential_work: boolean | null;
  lead_source: string | null;
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

export const CONTACT_CHANNELS = ['whatsapp', 'call', 'linkedin', 'email', 'in_person', 'other'] as const;
export type ContactChannel = typeof CONTACT_CHANNELS[number];
/** Outcomes that mean a real conversation happened. */
export const CONVERSATION_OUTCOMES: ReadonlySet<string> = new Set([
  'spoke_to_owner', 'interested', 'call_back', 'meeting_booked', 'not_interested', 'agency_controls_site',
]);
const INTERESTED_OUTCOMES: ReadonlySet<string> = new Set(['interested', 'meeting_booked']);
const INTERESTED_STATUSES: ReadonlySet<string> = new Set(['interested', 'price_given', 'won_pending_onboarding']);
const NOT_INTERESTED_STATUSES: ReadonlySet<string> = new Set(['not_interested', 'opted_out']);
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
export interface CampaignRow extends FunnelCounts { campaignId: string | null; name: string; byChannel: Record<ContactChannel, number> }
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
const zeroChannels = (): Record<ContactChannel, number> => ({ whatsapp: 0, call: 0, linkedin: 0, email: 0, in_person: 0, other: 0 });
const t = (iso: string) => Date.parse(iso);

interface LeadFacts {
  lead: PerfLead;
  firstContactMs: number | null;
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

function groupBy<T extends { lead_id: string }>(rows: T[]): Map<string, T[]> {
  const m = new Map<string, T[]>();
  for (const r of rows) { const a = m.get(r.lead_id); if (a) a.push(r); else m.set(r.lead_id, [r]); }
  return m;
}

export function foldSalesPerformance(input: FoldInput): SalesPerformance {
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
    const contactTimes: number[] = [];
    const channels = new Set<ContactChannel>();
    const respondedChannels = new Set<ContactChannel>();

    for (const m of msgs) {
      if (m.direction === 'outbound' && isRealSend(m.status) && isMine(personId, m.sent_by_user_id)) {
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
    for (const a of acts) {
      if (a.kind === 'marked_interested' && a.data?.on !== false) starred = true;
      if (!CONTACT_KINDS.has(a.kind) || !isMine(personId, a.actor_user_id)) continue;
      const outcome = String(a.data?.outcome ?? '');
      const ch = (a.kind === 'call_outcome' ? 'call' : String(a.data?.channel ?? 'other')) as ContactChannel;
      const channel: ContactChannel = (CONTACT_CHANNELS as readonly string[]).includes(ch) ? ch : 'other';
      contactTimes.push(t(a.created_at)); channels.add(channel);
      if (CONVERSATION_OUTCOMES.has(outcome)) respondedChannels.add(channel);
      latestOutcome = outcome;
      if (channel === 'call' && (sinceMs === null || t(a.created_at) >= sinceMs)) {
        calls.total += 1; calls.byOutcome[outcome] = (calls.byOutcome[outcome] ?? 0) + 1;
      }
      if (INTERESTED_OUTCOMES.has(outcome)) starred = true;
    }

    // The sign-up link's sent/opened rule is onboardingLinkStatus — the prospect panel reads the same.
    const link = onboardingLinkStatus(linkBy.get(lead.id) ?? [], hitsBy.get(lead.id) ?? [], (who) => isMine(personId, who));

    const won = isPaidLead(lead);
    const status = String(lead.status ?? '');
    const f: LeadFacts = {
      lead,
      firstContactMs: contactTimes.length ? Math.min(...contactTimes) : null,
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
      if (!isMine(personId, send.sent_by_user_id)) continue;
      if (sinceMs !== null && t(send.created_at) < sinceMs) continue;
      mineCredited.push(c.template);
      const row = rowFor(templateAgg, c.template);
      row.replies += 1;
      if (c.ambiguous) row.repliesContested += 1;
    }
    creditedTemplate.set(lead.id, mineCredited);
    for (const m of msgs) {
      if (m.direction !== 'outbound' || !m.template_name || !isRealSend(m.status) || !isMine(personId, m.sent_by_user_id)) continue;
      if (sinceMs !== null && t(m.created_at) < sinceMs) continue;
      const row = rowFor(templateAgg, m.template_name);
      row.sends += 1; row._leads.add(lead.id);
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
      row = { ...zeroFunnel(), campaignId: f.lead.campaign_id, name: f.lead.campaign_id ? (input.campaignNames.get(f.lead.campaign_id) ?? 'Campaign') : 'No campaign', byChannel: zeroChannels() };
      byCampaign.set(cKey, row);
    }
    add(row, f);
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

  return {
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
}

function rowFor(m: Map<string, TemplateRow & { _leads: Set<string> }>, template: string) {
  let r = m.get(template);
  if (!r) {
    r = { template, sends: 0, leadsSent: 0, replies: 0, repliesContested: 0, interested: 0, notInterested: 0, onboardingSent: 0, onboardingOpened: 0, won: 0, _leads: new Set() };
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
  { value: '30', label: 'Last 30 days', days: 30 },
  { value: '7', label: 'Last 7 days', days: 7 },
] as const;
export type PeriodValue = typeof PERIODS[number]['value'];
export function periodSinceMs(p: string, now = Date.now()): number | null {
  const d = PERIODS.find((x) => x.value === p)?.days ?? null;
  return d === null ? null : now - d * 86_400_000;
}

export const LEAD_SOURCE_LABELS: Record<string, string> = {
  linkedin: 'LinkedIn', referral: 'Referral', networking: 'Networking', google_maps: 'Google / Maps',
  social: 'Social media', ai_research: 'AI research', cold_research: 'Cold research',
  existing_relationship: 'Existing relationship', other: 'Other',
};
export const leadSourceLabel = (s: string | null | undefined) => (s ? LEAD_SOURCE_LABELS[s] ?? s : 'App search');
export const CHANNEL_LABELS: Record<ContactChannel, string> = {
  whatsapp: 'WhatsApp', call: 'Calls', linkedin: 'LinkedIn', email: 'Email', in_person: 'In person', other: 'Other',
};
