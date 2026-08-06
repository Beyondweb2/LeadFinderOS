import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { isSentStatus, type OutreachLead } from '@/types/outreach';
import type { AuditFunnel } from '@/components/dashboard/AuditFunnelCard';
import { buildDashTasks, foldMessageTimes, type DashTask, type LeadMessageTimes, type LeadOnboarding } from '@/lib/dashboardTasks';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { looksAutomated } from '@/lib/inboundClassify';

/**
 * One channel's outreach performance.
 *
 * `tracking` says how much of this channel is actually recorded, because that differs per channel
 * and pretending otherwise is what made this card wrong:
 *   'full'       sends AND replies are logged (WhatsApp: whatsapp_messages, both directions)
 *   'sends-only' sends are logged but nothing records an inbound (SMS: sms_sends exists, and
 *                twilio-inbound only updates delivery status — there is no inbound SMS table)
 *   'none'       nothing anywhere records a send on this channel, so no honest number exists
 * `replied` is null when it cannot be known, rather than 0 — "nobody replied" and "we do not record
 * replies" are different facts and the card must not merge them.
 */
export interface ChannelStat {
  sent: number;
  replied: number | null;
  replyRate: number | null;
  tracking: 'full' | 'sends-only' | 'none';
}
export interface ChannelPerformance {
  whatsapp: ChannelStat;
  sms: ChannelStat;
  call: ChannelStat;
  facebook_msg: ChannelStat;
  email: ChannelStat;
  /** Leads that count as sent (past New) but have no contact-method pill set —
   *  shown honestly as a residual rather than mis-assigned to a channel. */
  /* noMethodSent is gone. It counted 398 leads as "sent but no channel pill set" — an artefact of
     the old status test, since almost none of them had been messaged at all. The channel is now
     read from the evidence of the send itself, so an untagged contact_method changes nothing. */
}
const emptyChannelStat = (tracking: ChannelStat['tracking']): ChannelStat => ({ sent: 0, replied: null, replyRate: null, tracking });

// Cumulative funnel membership — "reached this stage or beyond" in the forward-only pipeline
// ordering (initial_contact → replied → report_sent → price_given → payment_received → …). The
// interested/not_interested side branch is intentionally excluded from the report_sent+ stages so
// an early "interested" reply can't inflate reports-sent. Report opened is layered on top from the
// audit first_opened_at data, not status.
const REPORT_SENT_OR_BEYOND = new Set(['report_sent', 'price_given', 'payment_received', 'in_delivery', 'completed']);
const PRICE_GIVEN_OR_BEYOND = new Set(['price_given', 'payment_received', 'in_delivery', 'completed']);
/** The report pitch, matching useCampaignStats. */
const PITCH_TEMPLATES = new Set(['audit_reply']);

/** The message fields the audit funnel reads. Order is the query's: created_at, then id. */
interface FunnelMsg {
  direction: string; created_at: string; body: string | null; template_name: string | null;
}

// No hardcoded revenue constants — uses actual amount_paid from leads

interface ActivityMetrics {
  phonesCopiedToday: number;
  phonesCopiedYesterday: number;
  phonesCopiedThisWeek: number;
  phonesCopiedLastWeek: number;
  leadsContactedToday: number;
  leadsContactedYesterday: number;
  leadsContactedThisWeek: number;
  leadsContactedLastWeek: number;
  activitiesToday: number;
  activitiesYesterday: number;
  activitiesThisWeek: number;
  totalPhonesCopied: number;
  totalLeadsContacted: number;
}

interface DashboardMetrics {
  /* Only what the dashboard renders. 22 further fields were returned and read by nobody -- the
     revenue/outreach half, all of it derived from lead status, plus the two components that would
     have displayed them (OutreachCard, DashboardStats), neither of which had an importer. */
  dashTasks: DashTask[];
  allLeads: OutreachLead[];
  auditFunnel: AuditFunnel;
  channelPerf: ChannelPerformance;
}

/* ⚠️ MIRRORS FOUNDER_PRICE_GBP in supabase/functions/_shared/offer-price.ts (what is CHARGED) and
   FOUNDER_OFFER_PRICE_LABEL / FOUNDER_OFFER_COUNT in src/lib/founderOffer.ts (what the report SAYS).
   Three places, one offer. This one only counts; it decides nothing. */
const FOUNDER_PRICE_GBP = 19.99;
const FOUNDER_PLACES = 10;

const getDateRanges = () => {
  const now = new Date();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const startOfWeek = new Date(today);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay());
  const startOfLastWeek = new Date(startOfWeek);
  startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);

  return {
    todayStr: today.toISOString(),
    yesterdayStr: yesterday.toISOString(),
    yesterdayEndStr: today.toISOString(),
    weekStartStr: startOfWeek.toISOString(),
    lastWeekStartStr: startOfLastWeek.toISOString(),
    lastWeekEndStr: startOfWeek.toISOString(),
  };
};

export function useDashboardMetrics(isAdmin = false) {
  const [allLeads, setAllLeads] = useState<OutreachLead[]>([]);
  const [totalNoWebsiteFound, setTotalNoWebsiteFound] = useState(0);
  const [activityData, setActivityData] = useState<ActivityMetrics>({
    phonesCopiedToday: 0, phonesCopiedYesterday: 0, phonesCopiedThisWeek: 0, phonesCopiedLastWeek: 0,
    leadsContactedToday: 0, leadsContactedYesterday: 0, leadsContactedThisWeek: 0, leadsContactedLastWeek: 0,
    activitiesToday: 0, activitiesYesterday: 0, activitiesThisWeek: 0,
    totalPhonesCopied: 0, totalLeadsContacted: 0,
  });
  const [outreachEvents7d, setOutreachEvents7d] = useState<{ lead_id: string; created_at: string }[]>([]);
  // lead_ids whose audit has been OPENED (ai_audits.first_opened_at set by render-audit-report).
  // Empty until the open-tracking migration has run + a real human opens a report.

  // Evidence for the derived task list: who wrote last, who filled the questionnaire, whose setup
  // has begun. State, so the list recomputes on the same refetch as everything else.
  const [msgTimes, setMsgTimes] = useState<Map<string, LeadMessageTimes>>(new Map());
  const [onboardingByLead, setOnboardingByLead] = useState<Map<string, LeadOnboarding>>(new Map());
  const [baselineLeadIds, setBaselineLeadIds] = useState<Set<string>>(new Set());
  /* Raw per-lead messages, in send order. The task rules only need folded timestamps, but the audit
     funnel needs the messages themselves (which template, which direction, what the text was), and
     they are already fetched, so index them rather than querying twice. */
  const [msgsByLeadId, setMsgsByLeadId] = useState<Map<string, FunnelMsg[]>>(new Map());
  /** Leads with a real sms_sends row. The pill says 15 leads are "SMS"; this says how many were sent. */
  const [smsSentLeadIds, setSmsSentLeadIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const hasLoadedOnceRef = useRef(false);
  const { user } = useAuth();

  // Stable user ID ref to prevent refetches on auth token refreshes
  const userIdRef = useRef<string | null>(null);

  const fetchAllData = useCallback(async () => {
    const uid = userIdRef.current;
    if (!uid) return;
    if (!hasLoadedOnceRef.current) setIsLoading(true);
    const dates = getDateRanges();

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    /* The three extra reads for the derived task list ride along in this SAME Promise.all, so they
       cost one round-trip of wall-clock rather than three sequential ones. All are narrow column
       selects, and all go through an untyped client because whatsapp_messages and
       onboarding_responses are not in the generated types; RLS scopes them as it scopes allLeads. */
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const sbAny = supabase as unknown as { from: (t: string) => any };
    /* Every read is paginated. None of these was, and PostgREST truncates at db-max-rows (default
       1000) with no error and no signal — outreach_leads is at 689 and whatsapp_messages at 403, so
       this dashboard was one growth spurt away from quietly showing smaller numbers than the truth.
       Each carries `.order('id')` as a unique tiebreaker, without which page boundaries are unstable
       on a non-unique sort key. */
    const all = await Promise.all([
      fetchAllRows<OutreachLead>('Dashboard (leads)', (f, t) =>
        sbAny.from('outreach_leads').select('*').order('created_at', { ascending: true }).order('id', { ascending: true }).range(f, t)),
      fetchAllRows<{ copied_at: string }>('Dashboard (copied phones)', (f, t) =>
        sbAny.from('copied_phones').select('copied_at').eq('user_id', uid).order('copied_at', { ascending: true }).range(f, t)),
      fetchAllRows<{ created_at: string }>('Dashboard (activities)', (f, t) =>
        sbAny.from('outreach_activities').select('created_at').eq('user_id', uid).order('created_at', { ascending: true }).range(f, t)),
      fetchAllRows<{ contacted_at: string }>('Dashboard (contacts)', (f, t) =>
        sbAny.from('lead_contacts').select('contacted_at').eq('user_id', uid).order('contacted_at', { ascending: true }).range(f, t)),
      fetchAllRows<{ no_website_count: number | null }>('Dashboard (search history)', (f, t) =>
        sbAny.from('search_history').select('no_website_count').eq('user_id', uid).order('id', { ascending: true }).range(f, t)),
      fetchAllRows<{ lead_id: string | null; created_at: string }>('Dashboard (events)', (f, t) =>
        sbAny.from('outreach_events').select('lead_id, created_at').eq('user_id', uid)
          .gte('created_at', sevenDaysAgo.toISOString()).order('created_at', { ascending: true }).order('id', { ascending: true }).range(f, t)),
      // body → foldMessageTimes drops auto-responder inbound (a booking bot's auto-ack is not a
      // person waiting on a reply). template_name → the audit funnel's pitch stage, no extra query.
      fetchAllRows<{ lead_id: string; direction: string; created_at: string; body: string | null; template_name: string | null; status: string | null }>('Dashboard (messages)', (f, t) =>
        sbAny.from('whatsapp_messages').select('lead_id, direction, created_at, body, template_name, status')
          .not('lead_id', 'is', null).order('created_at', { ascending: true }).order('id', { ascending: true }).range(f, t)),
      fetchAllRows<{ lead_id: string; status: string | null; created_at: string }>('Dashboard (onboarding)', (f, t) =>
        sbAny.from('onboarding_responses').select('lead_id, status, created_at').not('lead_id', 'is', null)
          .order('id', { ascending: true }).range(f, t)),
      fetchAllRows<{ lead_id: string; baseline_target_runs: number | null }>('Dashboard (audits)', (f, t) =>
        sbAny.from('ai_audits').select('lead_id, baseline_target_runs').not('lead_id', 'is', null)
          .order('id', { ascending: true }).range(f, t)),
      // The only record that an SMS was really sent. Currently empty — no SMS has ever gone out —
      // which is precisely why the card must read this rather than the contact_method pill.
      fetchAllRows<{ lead_id: string | null }>('Dashboard (sms sends)', (f, t) =>
        sbAny.from('sms_sends').select('lead_id').order('id', { ascending: true }).range(f, t)),
    ]).catch((e: unknown) => {
      /* fetchAllRows throws rather than returning an error, so the failure surfaces HERE. The old
         code only guarded the leads query and returned; this covers all nine the same way, and
         still clears isLoading so the dashboard renders empty rather than spinning forever. */
      console.error('Error fetching dashboard metrics:', e);
      return null;
    });
    if (!all) {
      hasLoadedOnceRef.current = true;
      setIsLoading(false);
      return;
    }
    const [leadsResult, copiedPhonesResult, activitiesResult, contactsResult, searchHistoryResult, eventsResult, msgResult, obResult, baselineResult, smsResult] = all;

    hasLoadedOnceRef.current = true;
    setIsLoading(false);

    setAllLeads(leadsResult.rows);
    setOutreachEvents7d(eventsResult.rows);

    /* Fold the evidence into per-lead maps. Each is wrapped so a missing table or column degrades
       that ONE rule to silence rather than emptying the card - the same defensive posture the
       audit-open fetch below already takes. */
    try {
      setMsgTimes(foldMessageTimes(msgResult.rows));
      const idx = new Map<string, FunnelMsg[]>();
      for (const m of msgResult.rows) {
        const row: FunnelMsg = { direction: m.direction, created_at: m.created_at, body: m.body, template_name: m.template_name };
        const arr = idx.get(m.lead_id);
        if (arr) arr.push(row); else idx.set(m.lead_id, [row]);
      }
      setMsgsByLeadId(idx);
      setSmsSentLeadIds(new Set(smsResult.rows.map((r) => r.lead_id).filter((v): v is string => !!v)));
    } catch (e) {
      console.warn('Message-time fold skipped (reply tasks hidden):', e instanceof Error ? e.message : e);
    }

    try {
      const obs = new Map<string, LeadOnboarding>();
      for (const r of obResult.rows) {
        const at = new Date(r.created_at).getTime();
        const prev = obs.get(r.lead_id);
        // Newest row wins for the date; paid is STICKY across rows, so a later unpaid retry cannot
        // un-pay someone who has already bought.
        const paid = (r.status === 'paid') || (prev?.paid ?? false);
        if (!prev || at > prev.createdAt) obs.set(r.lead_id, { createdAt: at, paid });
        else if (paid) obs.set(r.lead_id, { ...prev, paid: true });
      }
      setOnboardingByLead(obs);
    } catch (e) {
      console.warn('Onboarding fold skipped (chase tasks hidden):', e instanceof Error ? e.message : e);
    }

    try {
      const withBaseline = new Set<string>();
      for (const a of baselineResult.rows) {
        if (Number(a.baseline_target_runs ?? 0) > 1) withBaseline.add(a.lead_id);
      }
      setBaselineLeadIds(withBaseline);
    } catch (e) {
      console.warn('Baseline fold skipped (deliver tasks may over-report):', e instanceof Error ? e.message : e);
    }

    const searchHistory = searchHistoryResult.rows;
    setTotalNoWebsiteFound(searchHistory.reduce((sum, s) => sum + (s.no_website_count || 0), 0));

    const copiedPhones = copiedPhonesResult.rows;
    const activities = activitiesResult.rows;
    const contacts = contactsResult.rows;

    setActivityData({
      phonesCopiedToday: copiedPhones.filter(p => p.copied_at >= dates.todayStr).length,
      phonesCopiedYesterday: copiedPhones.filter(p => p.copied_at >= dates.yesterdayStr && p.copied_at < dates.yesterdayEndStr).length,
      phonesCopiedThisWeek: copiedPhones.filter(p => p.copied_at >= dates.weekStartStr).length,
      phonesCopiedLastWeek: copiedPhones.filter(p => p.copied_at >= dates.lastWeekStartStr && p.copied_at < dates.lastWeekEndStr).length,
      leadsContactedToday: contacts.filter(c => c.contacted_at >= dates.todayStr).length,
      leadsContactedYesterday: contacts.filter(c => c.contacted_at >= dates.yesterdayStr && c.contacted_at < dates.yesterdayEndStr).length,
      leadsContactedThisWeek: contacts.filter(c => c.contacted_at >= dates.weekStartStr).length,
      leadsContactedLastWeek: contacts.filter(c => c.contacted_at >= dates.lastWeekStartStr && c.contacted_at < dates.lastWeekEndStr).length,
      activitiesToday: activities.filter(a => a.created_at >= dates.todayStr).length,
      activitiesYesterday: activities.filter(a => a.created_at >= dates.yesterdayStr && a.created_at < dates.yesterdayEndStr).length,
      activitiesThisWeek: activities.filter(a => a.created_at >= dates.weekStartStr).length,
      totalPhonesCopied: copiedPhones.length,
      totalLeadsContacted: contacts.length,
    });
  }, [isAdmin]);

  // Only refetch when user ID changes (login/logout), not on token refresh
  useEffect(() => {
    const newUserId = user?.id ?? null;
    if (newUserId === userIdRef.current) return;
    userIdRef.current = newUserId;
    if (newUserId) {
      fetchAllData();
    }
  }, [user?.id, fetchAllData]);

  // Resolve loading state immediately for unauthenticated (ad-entry) users
  useEffect(() => {
    if (!user) {
      setIsLoading(false);
    }
  }, [user]);

  const metrics = useMemo<DashboardMetrics>(() => {

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];


    // Revenue - this month vs last month
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);






    /* ── Audit funnel — now derived from MESSAGES, for the same reasons the campaign card was.
       Every stage used to be a cumulative lead-status test, which measured intent rather than what
       happened, and it was wrong in both directions at once:
         Contacted   653 vs 196 truly messaged — it counted 358 no_whatsapp_needs_sms leads that
                     are unreachable on WhatsApp, 53 still queued, and 97 archived.
         Replied      74 vs  59 — a lifetime status test, so leads with no inbound at all counted,
                     as did not_interested.
         Report sent  50 vs  59 — UNDERSTATED, because the status is operator-set and lags the send.
         Price given   0 — the price_given status has never been set on any lead, so the tile was
                     structurally always zero. Dropped rather than shown as a permanent 0.
         Paid          0 while £49.99 was banked — status-only, so it missed a lead that paid
                     without its status being moved.
         Report opened — REMOVED. ai_audits stores only first_opened_at and open_count: no viewer,
                     no IP, no user agent, no per-open log, and render-audit-report filters nothing
                     but a bot user-agent. Our own opens are indistinguishable from a prospect's and
                     always will be for existing rows, because first_opened_at is coalesced — for
                     any report previewed before sending, the recorded "first open" is ours.
       Archived leads are excluded here now, matching the rest of the dashboard. */
    const funnelLeads = allLeads.filter(l => !l.is_archived);
    let contacted = 0, replied = 0, pitched = 0, pitchReplied = 0, funnelPaid = 0, founderSales = 0;
    for (const l of funnelLeads) {
      const ms = msgsByLeadId.get(l.id);
      if (!ms) {
        if ((l.amount_paid ?? 0) > 0) funnelPaid += 1;
        continue;
      }
      const outTemplated = ms.filter(m => m.direction === 'outbound' && m.template_name);
      const humanInbound = ms.filter(m => m.direction === 'inbound' && !looksAutomated(m.body ?? ''));
      if (outTemplated.length > 0) contacted += 1;
      if (humanInbound.length > 0) replied += 1;
      const pitches = outTemplated.filter(m => PITCH_TEMPLATES.has(m.template_name as string));
      if (pitches.length > 0) {
        pitched += 1;
        const lastPitchAt = pitches[pitches.length - 1].created_at;
        const newestInboundAt = humanInbound.length ? humanInbound[humanInbound.length - 1].created_at : null;
        if (newestInboundAt && newestInboundAt > lastPitchAt) pitchReplied += 1;
      }
      // Money in the bank, and nothing else. A status someone moved by hand is not a payment.
      if ((l.amount_paid ?? 0) > 0) funnelPaid += 1;
      /* THE FOUNDER PRICE EXACTLY, within a penny. amount_paid is the real charged amount
         (stripe-webhook writes amount_total / 100), so this counts places actually taken at the
         founder price — not every paid lead, and not everything below full price, which would sweep
         in the £49.99 quote that predates this offer. */
      if (Math.abs((l.amount_paid ?? 0) - FOUNDER_PRICE_GBP) < 0.01) founderSales += 1;
    }
    const auditFunnel: AuditFunnel = {
      contacted, replied, pitched, pitchReplied, paid: funnelPaid,
      founderSales, founderPlaces: FOUNDER_PLACES,
      replyRate: contacted > 0 ? Math.round((replied / contacted) * 100) : null,
      pitchReplyRate: pitched > 0 ? Math.round((pitchReplied / pitched) * 100) : null,
    };

    // The card's real list now. A pure function of the state above, so it recomputes on every
    // refetch and can never describe work that is already done.
    const dashTasks = buildDashTasks({
      leads: allLeads, times: msgTimes, onboarding: onboardingByLead, leadsWithBaseline: baselineLeadIds,
    });


    // Daily activity pulse — DISTINCT businesses per day from the send log
    // (outreach_events deduped by lead_id). Pressing WhatsApp then SMS for one
    // business = 1, not 2. Bounded by the lead count; never per-press.
    const todayISO = today.toISOString();
    const yesterdayISO = yesterday.toISOString();
    const dayKey = (iso: string) => iso.split('T')[0];
    const leadsByDay = new Map<string, Set<string>>();
    for (const e of outreachEvents7d) {
      if (!e.lead_id) continue;
      const d = dayKey(e.created_at);
      if (!leadsByDay.has(d)) leadsByDay.set(d, new Set());
      leadsByDay.get(d)!.add(e.lead_id);
    }
    // Avg businesses contacted per day = total distinct (business, day) pairs / 7.
    const distinctBusinessDayPairs = [...leadsByDay.values()].reduce((sum, set) => sum + set.size, 0);

    // Legacy activity metrics
    const dailyCounts: Record<string, number> = {};
    allLeads.forEach(lead => {
      const date = lead.created_at.split('T')[0];
      dailyCounts[date] = (dailyCounts[date] || 0) + 1;
    });
    const dailyCountsArray = Object.entries(dailyCounts).map(([date, count]) => ({ date, count })).sort((a, b) => b.count - a.count);
    const uniqueDays = Object.keys(dailyCounts).length;

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];




    /* ── Per-channel performance, derived from the record of each SEND.
       It used to read the contact_method pill and the lead's status, which was wrong twice over.
       The WhatsApp row showed Sent 240 / Replied 73 / 30% where the truth is 157 / 59 / 38%: "Sent"
       counted any status past New (so queued and unreachable leads counted), "Replied" was the
       lifetime replied-or-beyond test (so leads with no inbound at all counted, as did
       not_interested), and archived leads were included deliberately — on a comment claiming it
       matched the per-campaign card, which stopped being true when that card started excluding them.
       SMS was worse than wrong: 15 leads carry the SMS pill and sms_sends is EMPTY, so the card
       claimed 15 sends that never happened.

       The channel now comes from the evidence, not from the pill. A lead with an outbound WhatsApp
       message was contacted on WhatsApp whatever its contact_method says, which is also why the
       "no method set" residual is gone. Channels with no send record anywhere report 'none' rather
       than a number invented from status. */
    const channelPerf: ChannelPerformance = {
      whatsapp: emptyChannelStat('full'),
      sms: emptyChannelStat('sends-only'),
      call: emptyChannelStat('none'),
      facebook_msg: emptyChannelStat('none'),
      email: emptyChannelStat('none'),
    };
    let waSent = 0, waReplied = 0, smsSent = 0;
    for (const l of funnelLeads) {
      const ms = msgsByLeadId.get(l.id);
      if (ms) {
        // Templated outbound = we opened a conversation. Freeform is us answering them, which would
        // count a lead as "contacted" for a message they started — same basis as Reached elsewhere.
        if (ms.some(m => m.direction === 'outbound' && m.template_name)) waSent += 1;
        // Same bot filter as everywhere else. It is a filter, not proof of humanity: the patterns are
        // English-only, so non-English promotional spam still reads as a human reply.
        if (ms.some(m => m.direction === 'inbound' && !looksAutomated(m.body ?? ''))) waReplied += 1;
      }
      if (smsSentLeadIds.has(l.id)) smsSent += 1;
    }
    channelPerf.whatsapp.sent = waSent;
    channelPerf.whatsapp.replied = waReplied;
    channelPerf.whatsapp.replyRate = waSent > 0 ? Math.round((waReplied / waSent) * 100) : null;
    channelPerf.sms.sent = smsSent;   // replied stays null: nothing records an inbound SMS.

    /* Only what the dashboard actually renders. 22 other fields used to be returned and read by
       nobody: the whole revenue/outreach half, plus the two components that would have shown them
       (OutreachCard, DashboardStats) which had no importer either. They were computed from lead
       status, so deleting them removed the wrong numbers rather than fixing them. */
    return {
      dashTasks, allLeads, auditFunnel, channelPerf,
    };
  }, [allLeads, activityData, totalNoWebsiteFound, outreachEvents7d, msgTimes, msgsByLeadId, smsSentLeadIds, onboardingByLead, baselineLeadIds]);

  return { metrics, isLoading, refetch: fetchAllData };
}
