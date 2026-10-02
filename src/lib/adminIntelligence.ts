/* ════════════════════════════════════════════════════════════════════════════════════════════════
   SALES INTELLIGENCE — templates, niches, bottlenecks (Admin control centre, release 3, 2026-09-30).
   Pure; run inside foldAdminOverview (src/lib/adminMetrics.ts) over the same per-lead facts, so every
   number here uses the definitions there.
   ⛔ NO SCORES, NO WINNER RANKINGS (Paul). Every label is a transparent threshold printed beside it.
   ⛔ ATTRIBUTION IS LAST-TOUCH, the one rule (templateAttribution.ts creditRepliesToSends): a reply
      belongs to the newest real templated send before it; "contested" = 2+ different templates went
      out with no reply between them. Downstream columns (interested / meeting / paid) are OF THE LEADS
      whose reply that template earned — "followed", never "caused".
   ⛔ META TEMPLATES ARE KEPT APART from free-form messages (typed in the Inbox, or an AI draft sent):
      a row with a template name is a registered Meta template; a send without one is free-form.
   Edge-safe.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { creditRepliesToSends } from './templateAttribution.ts';
import { isRealSend } from './realSend.ts';
import { looksAutomated } from './inboundClassify.ts';
import { isPaidLead } from './leadPayment.ts';
import { canonicalTrade } from './trades.ts';
import { HIGH_INTENT, type TriageCategory } from './replyTriage.ts';
import type { ReportingPeriod } from './reportingPeriod.ts';

/** Below this many leads sent, a template's rate is not compared ("tiny sample"). */
export const TEMPLATE_MIN_LEADS = 30;
/** "High reply" / "weak reply" = at least this many times / at most this fraction of the overall rate. */
export const TEMPLATE_HIGH_FACTOR = 1.5;
export const TEMPLATE_WEAK_FACTOR = 0.5;
/** "High rejection" = this share of its replies said no or asked to stop, on at least MIN replies. */
export const TEMPLATE_REJECTION_SHARE = 0.4;
export const TEMPLATE_REJECTION_MIN_REPLIES = 10;
/** A niche needs this many leads messaged before it is labelled at all. */
export const NICHE_MIN_MESSAGED = 30;
/** "Weak response so far" = reply rate at most this fraction of the book's. */
export const NICHE_WEAK_FACTOR = 0.5;

/** The per-lead facts the admin fold already built (a structural subset — no import cycle). */
export interface IntelFact {
  lead: { id: string; created_at: string; search_keyword: string | null; category: string | null; phone: string | null; status: string | null; amount_paid: number | null; website?: string | null };
  contacts: { at: number; who: string | null; kind: string }[];
  humanReplies: number[];
  interestedEver: boolean;
  meetingEver: boolean;
  notInterested: { at: number }[];
  optOut: { at: number }[];
}
export interface IntelMessage { id?: string; lead_id: string; direction: string | null; status: string | null; created_at: string; body: string | null; template_name: string | null; test_mode: boolean | null; sent_by_user_id?: string | null }

export type TemplateFlag = 'high_reply' | 'weak_reply' | 'high_rejection' | 'tiny_sample' | 'no_replies';
export interface TemplateRow {
  template: string;
  sends: number; leadsSent: number; delivered: number; read: number;
  replies: number; repliesContested: number;
  /** Credited replies the reply sorter filed as a live sale (interested / price / call / booking) or a question. */
  positive: number;
  interested: number; meetings: number; notInterested: number; optOuts: number; paid: number;
  firstSentAt: string | null; lastSentAt: string | null;
  flags: TemplateFlag[];
}
export interface TemplatesBlock {
  meta: TemplateRow[];
  /** Free-form sends (no template): typed in the Inbox, or an AI draft sent — counts only. */
  freeForm: { sends: number; leadsSent: number; delivered: number };
  overallReplyRate: number | null;
  /** WhatsApp message charges are not recorded anywhere — the cost column says so. */
  costRecorded: false;
}

export type NicheLabel = 'promising' | 'needs_more_data' | 'weak_so_far' | 'in_line' | 'no_label';
export interface NicheRow {
  key: string; label: string;
  leadsAdded: number; leadsInBook: number; contactable: number;
  messaged: number; replied: number; interested: number; meetings: number; paid: number;
  withSite: { messaged: number; replied: number }; noSiteOnRecord: { messaged: number; replied: number };
  verdict: NicheLabel;
}

export interface Bottleneck {
  key: string; title: string; meaning: string;
  status: 'flag' | 'ok' | 'not_enough_data';
  /** The numbers the check used, in words — never a score. */
  evidence: string;
}

const t = (iso: string) => Date.parse(iso);
const inP = (at: number, p: ReportingPeriod) => Number.isFinite(at) && (p.fromMs === null || at >= p.fromMs) && at < p.toMs;
const isTest = (m: IntelMessage) => m.test_mode === true || m.status === 'simulated';

/* ── Templates ──────────────────────────────────────────────────────────────────────────────────── */

export function foldTemplates(input: {
  period: ReportingPeriod;
  facts: IntelFact[];
  msgsBy: Map<string, IntelMessage[]>;
  /** message id → the reply sorter's category (only where triage has filed it). */
  triageByMessage: Map<string, string>;
  paidAtOf: Map<string, number>;
  /** A send that is LEFT OUT (2026-10-02): a test account's, or a hidden person's under "My activity:
   *  hidden" — adminMetrics.ts decides who sent it (the sender, else whoever held the lead). Such sends are
   *  not counted, and a reply credited to one is not counted either (it is never re-credited to an older
   *  send). Absent = every send counts. */
  hiddenSend?: (leadId: string, m: IntelMessage) => boolean;
}): TemplatesBlock {
  const { period: p } = input;
  const hiddenSend = input.hiddenSend ?? (() => false);
  const rows = new Map<string, TemplateRow & { _leads: Set<string> }>();
  const row = (name: string) => {
    let r = rows.get(name);
    if (!r) { r = { template: name, sends: 0, leadsSent: 0, delivered: 0, read: 0, replies: 0, repliesContested: 0, positive: 0, interested: 0, meetings: 0, notInterested: 0, optOuts: 0, paid: 0, firstSentAt: null, lastSentAt: null, flags: [], _leads: new Set() }; rows.set(name, r); }
    return r;
  };
  const free = { sends: 0, leads: new Set<string>(), delivered: 0 };
  for (const f of input.facts) {
    const msgs = (input.msgsBy.get(f.lead.id) ?? []).filter((m) => !isTest(m));
    const firstSend = new Map<string, number>();
    for (const m of msgs) {
      if (m.direction !== 'outbound' || !isRealSend(m.status) || hiddenSend(f.lead.id, m)) continue;
      const at = t(m.created_at);
      if (!m.template_name) { if (inP(at, p)) { free.sends += 1; free.leads.add(f.lead.id); if (m.status === 'delivered' || m.status === 'read') free.delivered += 1; } continue; }
      if (!firstSend.has(m.template_name)) firstSend.set(m.template_name, at);
      if (!inP(at, p)) continue;
      const r = row(m.template_name);
      r.sends += 1; r._leads.add(f.lead.id);
      if (m.status === 'delivered' || m.status === 'read') r.delivered += 1;
      if (m.status === 'read') r.read += 1;
      if (!r.firstSentAt || m.created_at < r.firstSentAt) r.firstSentAt = m.created_at;
      if (!r.lastSentAt || m.created_at > r.lastSentAt) r.lastSentAt = m.created_at;
    }
    for (const c of creditRepliesToSends(msgs)) {
      const send = msgs[c.sendIndex];
      if (!inP(t(send.created_at), p) || hiddenSend(f.lead.id, send)) continue;
      const r = row(c.template);
      r.replies += 1; if (c.ambiguous) r.repliesContested += 1;
      // The reply itself: the first human inbound after the credited send.
      const reply = msgs.slice(c.sendIndex + 1).find((m) => m.direction === 'inbound' && !looksAutomated(m.body ?? ''));
      const cat = reply?.id ? input.triageByMessage.get(reply.id) : undefined;
      if (cat && (HIGH_INTENT.has(cat as TriageCategory) || cat === 'question')) r.positive += 1;
      if (f.interestedEver) r.interested += 1;
      if (f.meetingEver) r.meetings += 1;
      if (f.notInterested.length || cat === 'not_interested' || cat === 'already_sorted') r.notInterested += 1;
      if (f.optOut.length || cat === 'opt_out' || String(f.lead.status) === 'opted_out') r.optOuts += 1;
      const paidAt = input.paidAtOf.get(f.lead.id);
      if (paidAt !== undefined && paidAt >= t(send.created_at) && isPaidLead(f.lead)) r.paid += 1;
    }
  }
  const meta = [...rows.values()].map(({ _leads, ...r }) => ({ ...r, leadsSent: _leads.size }));
  const totLeads = meta.reduce((s, r) => s + r.leadsSent, 0);
  const totReplies = meta.reduce((s, r) => s + r.replies, 0);
  const overall = totLeads >= TEMPLATE_MIN_LEADS ? totReplies / totLeads : null;
  for (const r of meta) {
    const flags: TemplateFlag[] = [];
    if (r.leadsSent < TEMPLATE_MIN_LEADS) flags.push('tiny_sample');
    else {
      const rate = r.replies / r.leadsSent;
      if (r.replies === 0) flags.push('no_replies');
      else if (overall !== null && rate >= overall * TEMPLATE_HIGH_FACTOR) flags.push('high_reply');
      else if (overall !== null && rate <= overall * TEMPLATE_WEAK_FACTOR) flags.push('weak_reply');
    }
    if (r.replies >= TEMPLATE_REJECTION_MIN_REPLIES && (r.notInterested + r.optOuts) / r.replies >= TEMPLATE_REJECTION_SHARE) flags.push('high_rejection');
    r.flags = flags;
  }
  meta.sort((a, b) => b.leadsSent - a.leadsSent || a.template.localeCompare(b.template));
  return { meta, freeForm: { sends: free.sends, leadsSent: free.leads.size, delivered: free.delivered }, overallReplyRate: overall, costRecorded: false };
}

/* ── Niches ─────────────────────────────────────────────────────────────────────────────────────── */

/** The niche a lead belongs to: the canonical trade of its search keyword (else category). */
export function nicheOf(lead: { search_keyword: string | null; category: string | null }): { key: string; label: string } {
  const raw = (lead.search_keyword || lead.category || '').trim();
  if (!raw) return { key: '(none)', label: 'No trade stored' };
  const c = canonicalTrade(raw);
  return c ? { key: c.slug, label: c.label } : { key: raw.toLowerCase(), label: raw.charAt(0).toUpperCase() + raw.slice(1) };
}
const NO_WHATSAPP: ReadonlySet<string> = new Set(['no_whatsapp', 'no_whatsapp_needs_sms']);

/** `hidden` (2026-10-02: a test account, or a hidden person under "My activity: hidden"): their WhatsApp send does not put the lead
 *  in the messaged cohort — the cohort starts at the first send by someone shown. The niche's inventory
 *  columns (leads added, in the book, contactable) are the book, never anyone's activity. */
export function foldNiches(input: { period: ReportingPeriod; facts: IntelFact[]; paidAtOf: Map<string, number>; hidden?: (who: string | null) => boolean }): { rows: NicheRow[]; bookReplyRate: number | null } {
  const p = input.period;
  const hidden = input.hidden ?? (() => false);
  const by = new Map<string, NicheRow>();
  for (const f of input.facts) {
    const n = nicheOf(f.lead);
    let r = by.get(n.key);
    if (!r) { r = { key: n.key, label: n.label, leadsAdded: 0, leadsInBook: 0, contactable: 0, messaged: 0, replied: 0, interested: 0, meetings: 0, paid: 0, withSite: { messaged: 0, replied: 0 }, noSiteOnRecord: { messaged: 0, replied: 0 }, verdict: 'no_label' }; by.set(n.key, r); }
    r.leadsInBook += 1;
    if (inP(t(f.lead.created_at), p)) r.leadsAdded += 1;
    if (f.lead.phone && !NO_WHATSAPP.has(String(f.lead.status))) r.contactable += 1;
    const waSends = f.contacts.filter((c) => c.kind === 'whatsapp' && !hidden(c.who));
    const firstInPeriod = waSends.find((c) => inP(c.at, p));
    if (!firstInPeriod) continue;
    // Cohort: leads messaged in the period, and what they have done since that first message.
    r.messaged += 1;
    const replied = f.humanReplies.some((x) => x >= firstInPeriod.at);
    if (replied) r.replied += 1;
    if (f.interestedEver) r.interested += 1;
    if (f.meetingEver) r.meetings += 1;
    const paidAt = input.paidAtOf.get(f.lead.id);
    if (paidAt !== undefined && paidAt >= firstInPeriod.at) r.paid += 1;
    const site = (f.lead.website ?? '').trim() ? r.withSite : r.noSiteOnRecord;
    site.messaged += 1; if (replied) site.replied += 1;
  }
  const rows = [...by.values()];
  const totM = rows.reduce((s, r) => s + r.messaged, 0);
  const totR = rows.reduce((s, r) => s + r.replied, 0);
  const book = totM >= NICHE_MIN_MESSAGED ? totR / totM : null;
  for (const r of rows) {
    if (r.messaged === 0) r.verdict = 'no_label';
    else if (r.messaged < NICHE_MIN_MESSAGED || book === null) r.verdict = 'needs_more_data';
    else if (r.replied / r.messaged <= book * NICHE_WEAK_FACTOR) r.verdict = 'weak_so_far';
    else if (r.replied / r.messaged >= book && r.interested >= 1) r.verdict = 'promising';
    else r.verdict = 'in_line';
  }
  rows.sort((a, b) => b.messaged - a.messaged || b.leadsInBook - a.leadsInBook);
  return { rows, bookReplyRate: book };
}

/* ── Feature usage (release 5) ─────────────────────────────────────────────────────────────────────
   Counted from the rows each feature already writes (SQL admin_feature_usage); four features that write
   nothing log one USEFUL action (featureUsage.ts). No clicks, no time-on-page, no quotas. */

export interface UsageRow { feature: string; user_id: string | null; uses: number }
/** key → what Paul calls it, and the cost-ledger feature label it spends under (apiCostLabels.ts). */
export const FEATURES: readonly { key: string; label: string; cost?: string; trackedSince?: string }[] = [
  { key: 'lead_search', label: 'Find Leads search', cost: 'Find Leads search' },
  { key: 'leads_added', label: 'Leads added to the CRM' },
  { key: 'hook_audit', label: 'Hook Audit', cost: 'AI visibility audits' },
  { key: 'discovery', label: 'Discovery' },
  { key: 'paid_baseline', label: 'Paid baseline' },
  { key: 'weekly_check', label: 'Weekly visibility check' },
  { key: 'find_socials', label: 'Find socials', cost: 'Find socials' },
  { key: 'paid_enrich', label: 'Paid Enrich', cost: 'Paid Enrich' },
  { key: 'find_email', label: 'Find email', cost: 'Find email' },
  { key: 'voice_note', label: 'Voice-note script', cost: 'Voice-note scripts' },
  { key: 'reply_draft', label: 'AI reply draft', cost: 'Reply drafts & research' },
  { key: 'call_script', label: 'Call script', trackedSince: '2026-09-30' },
  { key: 'linkedin_script', label: 'LinkedIn script (copied)', trackedSince: '2026-09-30' },
  { key: 'email_script', label: 'Email script (copied)', trackedSince: '2026-09-30' },
  { key: 'focus_mode', label: 'Focus Mode', trackedSince: '2026-09-30' },
  { key: 'log_contact', label: 'Log Contact' },
  { key: 'next_action', label: 'Next Action set' },
  { key: 'quick_close', label: 'Quick Close' },
  { key: 'report_link', label: 'Report link sent' },
  { key: 'signup_link', label: 'Sign-up link sent' },
  { key: 'niche_check', label: 'Niche Check', cost: 'Niche Check' },
  { key: 'directories', label: 'Directories check' },
  { key: 'opportunity_backlog', label: 'Opportunity Backlog item' },
  { key: 'prospect_preview', label: 'Prospect preview' },
  { key: 'page_generator', label: 'Page generator', cost: 'Page generator' },
  { key: 'mockups', label: 'Website mockups' },
  { key: 'reply_handled', label: 'Reply marked handled (admin)' },
];
/** "Dropped sharply" = this period at or under this share of the previous one, from at least MIN uses. */
export const USAGE_DROP_SHARE = 0.5;
export const USAGE_DROP_MIN_PREVIOUS = 10;
/** "Costly for its use" = at least this much spend (USD) on at most this many uses in the period. */
export const USAGE_COSTLY_USD = 5;
export const USAGE_COSTLY_MAX_USES = 5;

export type UsageFlag = 'unused' | 'dropped' | 'costly_low_use' | 'new_tracking';
export interface FeatureRow { key: string; label: string; uses: number; previous: number | null; people: { name: string; uses: number }[]; costUsd: number | null; flags: UsageFlag[]; trackedSince: string | null }

export function foldFeatureUsage(x: {
  now: UsageRow[]; previous: UsageRow[] | null;
  costByFeature: { key: string; usd: number }[];
  nameOf: (u: string | null) => string;
  isExcludedUser: (u: string | null) => boolean;
  periodFromDay: string | null;
}): FeatureRow[] {
  const sum = (rows: UsageRow[], f: string) => rows.filter((r) => r.feature === f && !x.isExcludedUser(r.user_id)).reduce((s, r) => s + Number(r.uses || 0), 0);
  return FEATURES.map((f) => {
    const uses = sum(x.now, f.key);
    const previous = x.previous ? sum(x.previous, f.key) : null;
    const byPerson = new Map<string, number>();
    for (const r of x.now) if (r.feature === f.key) { const n = x.isExcludedUser(r.user_id) ? 'Internal/test' : r.user_id ? x.nameOf(r.user_id) : 'Automation'; byPerson.set(n, (byPerson.get(n) ?? 0) + Number(r.uses || 0)); }
    const costUsd = f.cost ? (x.costByFeature.find((c) => c.key === f.cost)?.usd ?? 0) : null;
    const flags: UsageFlag[] = [];
    const newTracking = !!f.trackedSince && (!x.periodFromDay || x.periodFromDay < f.trackedSince);
    if (newTracking) flags.push('new_tracking');
    if (uses === 0 && !newTracking) flags.push('unused');
    if (previous !== null && previous >= USAGE_DROP_MIN_PREVIOUS && uses <= previous * USAGE_DROP_SHARE) flags.push('dropped');
    if (costUsd !== null && costUsd >= USAGE_COSTLY_USD && uses <= USAGE_COSTLY_MAX_USES) flags.push('costly_low_use');
    return { key: f.key, label: f.label, uses, previous, people: [...byPerson].map(([name, n]) => ({ name, uses: n })).sort((a, b) => b.uses - a.uses), costUsd, flags, trackedSince: f.trackedSince ?? null };
  });
}

/* ── Bottlenecks: deterministic, each with the numbers it used ─────────────────────────────────── */

export const BOTTLENECK_THRESHOLDS = {
  contactsForReplyCheck: 50, weakReplyRate: 0.1,
  repliesForInterestCheck: 20, weakInterestRate: 0.05,
  interestedForMeetingCheck: 5, weakMeetingRate: 0.2,
  meetingsForSaleCheck: 3, weakSaleRate: 0.2,
  signupsForPaymentCheck: 3, weakPaymentRate: 0.3,
  costWithoutRevenueUsd: 25,
  templateDeadSends: 40,
} as const;

export function findBottlenecks(x: {
  contacted: number; replied: number; interested: number; meetings: number; sales: number;
  signupStarts: number; signupsPaid: number;
  apiUsd: number; revenue: number;
  interestedWithoutNextAction: number;
  deadTemplates: string[];
  periodLabel: string;
  /** Release 5 — null when usage could not be read (the checks then say not enough data). */
  costlyFeatures?: string[] | null;
  unusedFeatures?: string[] | null;
}): Bottleneck[] {
  const T = BOTTLENECK_THRESHOLDS;
  const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : '—');
  const out: Bottleneck[] = [];
  const check = (key: string, title: string, meaning: string, enough: boolean, flagged: boolean, evidence: string) =>
    out.push({ key, title, meaning, status: !enough ? 'not_enough_data' : flagged ? 'flag' : 'ok', evidence });
  check('contacts_few_replies', 'Lots of contacts, few replies', 'Messaging, niche or data problem', x.contacted >= T.contactsForReplyCheck, x.contacted > 0 && x.replied / x.contacted < T.weakReplyRate,
    `${x.replied} of ${x.contacted} leads first contacted replied (${pct(x.replied, x.contacted)}; flagged under ${T.weakReplyRate * 100}%, checked from ${T.contactsForReplyCheck})`);
  check('replies_few_interested', 'Lots of replies, few interested', 'Targeting or offer problem', x.replied >= T.repliesForInterestCheck, x.replied > 0 && x.interested / x.replied < T.weakInterestRate,
    `${x.interested} of ${x.replied} who replied became interested (${pct(x.interested, x.replied)}; flagged under ${T.weakInterestRate * 100}%). A reply includes "yes, it's us" to the opener`);
  check('interested_few_meetings', 'Lots of interested, few meetings', 'Follow-up / sales problem', x.interested >= T.interestedForMeetingCheck, x.interested > 0 && x.meetings / x.interested < T.weakMeetingRate,
    `${x.meetings} meetings from ${x.interested} interested (${pct(x.meetings, x.interested)}; flagged under ${T.weakMeetingRate * 100}%)`);
  check('meetings_few_sales', 'Lots of meetings, few sales', 'Closing or offer problem', x.meetings >= T.meetingsForSaleCheck, x.meetings > 0 && x.sales / x.meetings < T.weakSaleRate,
    `${x.sales} sales from ${x.meetings} meetings (${pct(x.sales, x.meetings)}; flagged under ${T.weakSaleRate * 100}%)`);
  check('signups_few_payments', 'Sign-ups started, few payments', 'Checkout / onboarding friction', x.signupStarts >= T.signupsForPaymentCheck, x.signupStarts > 0 && x.signupsPaid / x.signupStarts < T.weakPaymentRate,
    `${x.signupsPaid} of ${x.signupStarts} prospect sign-ups paid (${pct(x.signupsPaid, x.signupStarts)}; your own test sign-ups excluded)`);
  check('cost_no_revenue', 'Spending with nothing collected', 'Expensive activity without a result yet', x.apiUsd >= T.costWithoutRevenueUsd, x.revenue <= 0,
    `$${x.apiUsd.toFixed(2)} recorded API spend and £${x.revenue.toFixed(2)} collected in ${x.periodLabel.toLowerCase()}`);
  check('interested_no_next_action', 'Interested leads with no next step', 'Warm leads going cold', true, x.interestedWithoutNextAction > 0,
    `${x.interestedWithoutNextAction} lead${x.interestedWithoutNextAction === 1 ? ' is' : 's are'} interested now with no Next Action set`);
  check('dead_templates', 'Templates sent a lot with no replies', 'A message that is not landing', true, x.deadTemplates.length > 0,
    x.deadTemplates.length ? `${x.deadTemplates.join(', ')} — ${T.templateDeadSends}+ leads sent, 0 replies` : `No template has ${T.templateDeadSends}+ leads sent with 0 replies`);
  const costly = x.costlyFeatures ?? null;
  check('costly_low_use', 'Expensive feature, little use', 'A cost without the use to justify it', costly !== null, !!costly?.length,
    costly === null ? 'Feature usage could not be read' : costly.length ? costly.join('; ') : `No feature spent $${USAGE_COSTLY_USD}+ on ${USAGE_COSTLY_MAX_USES} or fewer uses`);
  const unused = x.unusedFeatures ?? null;
  check('unused_features', 'Features nobody used', 'Unneeded complexity, or nobody knows it is there', unused !== null, !!unused?.length,
    unused === null ? 'Feature usage could not be read' : unused.length ? `${unused.join(', ')} — no use in ${x.periodLabel.toLowerCase()}` : 'Every tracked feature was used');
  return out;
}
