import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { isSentStatus, isRepliedStatus, type OutreachLead } from '@/types/outreach';

export interface ChannelStat { sent: number; replied: number; replyRate: number | null; claimed: number; }
export interface ChannelPerformance {
  whatsapp: ChannelStat;
  sms: ChannelStat;
  call: ChannelStat;
  facebook_msg: ChannelStat;
  /** Leads that count as sent (past New) but have no contact-method pill set —
   *  shown honestly as a residual rather than mis-assigned to a channel. */
  noMethodSent: number;
}
const emptyChannelStat = (): ChannelStat => ({ sent: 0, replied: 0, replyRate: null, claimed: 0 });

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

interface PipelineCounts {
  new: number;
  contacted: number;
  followUp: number;
  interested: number;
  proposalSent: number;
  closedWon: number;
}


interface DashboardMetrics {
  // Revenue
  totalRevenue: number;
  revenueThisMonth: number;
  revenueLastMonth: number;
  draftRevenue: number;
  completionRevenue: number;
  fullyPaidClients: number;
  paidForDraftCount: number;
  activeProposals: number;
  totalPotentialRevenue: number;
  closedRevenue: number;

  // Pipeline
  pipeline: PipelineCounts;

  // Outreach
  totalBusinessesAdded: number;
  noWebsiteBusinesses: number;
  addedToday: number;
  addedYesterday: number;
  // HERO: businesses contacted = leads past "New" (status, source of truth). Reconciles with Sent.
  contactedTotal: number;
  // Daily activity pulse — DISTINCT businesses per day from the send log (deduped, never per-press).
  contactedToday: number;
  contactedYesterday: number;
  avg7Day: number;
  // How many of the contacted businesses have a logged send (for the honest "X of Y logged" note).
  loggedLeads: number;

  // Activity (legacy)
  recordDay: { date: string; count: number } | null;
  avgPerDayAllTime: number;
  avgPerDayLast7Days: number;
  activity: ActivityMetrics;

  // Tracked leads
  trackedLeads: OutreachLead[];

  // Site funnel — generated_sites tracking (admin-visible; RLS-scoped)
  siteFunnel: { sent: number; opened: number; claimed: number; addonRequested: number };

  // Per-channel performance — Sent/Replied/Reply-rate from outreach_leads
  // (contact_method + status), Claimed joined from generated_sites.claimed_at.
  channelPerf: ChannelPerformance;
}

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

export function useDashboardMetrics() {
  const [allLeads, setAllLeads] = useState<OutreachLead[]>([]);
  const [totalNoWebsiteFound, setTotalNoWebsiteFound] = useState(0);
  const [activityData, setActivityData] = useState<ActivityMetrics>({
    phonesCopiedToday: 0, phonesCopiedYesterday: 0, phonesCopiedThisWeek: 0, phonesCopiedLastWeek: 0,
    leadsContactedToday: 0, leadsContactedYesterday: 0, leadsContactedThisWeek: 0, leadsContactedLastWeek: 0,
    activitiesToday: 0, activitiesYesterday: 0, activitiesThisWeek: 0,
    totalPhonesCopied: 0, totalLeadsContacted: 0,
  });
  const [outreachEvents7d, setOutreachEvents7d] = useState<{ lead_id: string; created_at: string }[]>([]);
  const [siteFunnel, setSiteFunnel] = useState({ sent: 0, opened: 0, claimed: 0, addonRequested: 0 });
  // lead_ids of generated_sites that the barber has CLAIMED — used to attribute
  // site-claims to the lead's contact channel for the per-channel card.
  const [claimedLeadIds, setClaimedLeadIds] = useState<string[]>([]);
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

    const [leadsResult, copiedPhonesResult, activitiesResult, contactsResult, searchHistoryResult, eventsResult] = await Promise.all([
      supabase.from('outreach_leads').select('*').order('created_at', { ascending: true }),
      supabase.from('copied_phones').select('copied_at').eq('user_id', uid),
      supabase.from('outreach_activities').select('created_at').eq('user_id', uid),
      supabase.from('lead_contacts').select('contacted_at').eq('user_id', uid),
      supabase.from('search_history').select('no_website_count').eq('user_id', uid),
      supabase.from('outreach_events').select('lead_id, created_at').eq('user_id', uid).gte('created_at', sevenDaysAgo.toISOString()),
    ]);

    hasLoadedOnceRef.current = true;
    setIsLoading(false);

    if (leadsResult.error) {
      console.error('Error fetching leads for metrics:', leadsResult.error);
      return;
    }

    setAllLeads((leadsResult.data || []) as OutreachLead[]);
    setOutreachEvents7d(eventsResult.data || []);

    // Site funnel. SENT is driven by the Outreach status (source of truth) —
    // every lead past "New" counts as sent. Opened/Claimed/Add-on come from the
    // automatic generated_sites event columns. Untyped client (tracking cols
    // aren't in the generated types). RLS scopes it. Best-effort.
    const sentFromStatus = (leadsResult.data || []).filter(l => isSentStatus((l as OutreachLead).status)).length;
    try {
      const { data: sites } = await (supabase as unknown as import('@supabase/supabase-js').SupabaseClient)
        .from('generated_sites')
        .select('lead_id, first_opened_at, claimed_at, addon_interest_at');
      const rows = (sites || []) as Array<{ lead_id: string | null; first_opened_at: string | null; claimed_at: string | null; addon_interest_at: string | null }>;
      setSiteFunnel({
        sent: sentFromStatus,
        opened: rows.filter(r => r.first_opened_at).length,
        claimed: rows.filter(r => r.claimed_at).length,
        addonRequested: rows.filter(r => r.addon_interest_at).length,
      });
      setClaimedLeadIds(rows.filter(r => r.claimed_at && r.lead_id).map(r => r.lead_id as string));
    } catch (e) {
      console.error('Site funnel fetch failed (non-blocking):', e);
      setSiteFunnel(prev => ({ ...prev, sent: sentFromStatus }));
    }

    const searchHistory = searchHistoryResult.data || [];
    setTotalNoWebsiteFound(searchHistory.reduce((sum, s) => sum + (s.no_website_count || 0), 0));

    const copiedPhones = copiedPhonesResult.data || [];
    const activities = activitiesResult.data || [];
    const contacts = contactsResult.data || [];

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
  }, []);

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
    const totalBusinessesAdded = allLeads.length;
    const noWebsiteBusinesses = totalNoWebsiteFound;

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];

    const addedToday = allLeads.filter(l => l.created_at.split('T')[0] === todayStr).length;
    const addedYesterday = allLeads.filter(l => l.created_at.split('T')[0] === yesterdayStr).length;

    // Revenue - this month vs last month
    const now = new Date();
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthEnd = new Date(now.getFullYear(), now.getMonth(), 0);

    // Real revenue: sum of amount_paid from all leads that have payments
    const getPaymentDate = (lead: OutreachLead) => {
      if (lead.payment_date) return new Date(lead.payment_date);
      return new Date(lead.updated_at);
    };

    const paidLeads = allLeads.filter(l => (l.amount_paid || 0) > 0);
    const totalRevenue = paidLeads.reduce((sum, l) => sum + (l.amount_paid || 0), 0);

    const revenueThisMonth = paidLeads
      .filter(l => getPaymentDate(l) >= thisMonthStart)
      .reduce((sum, l) => sum + (l.amount_paid || 0), 0);

    const revenueLastMonth = paidLeads
      .filter(l => { const d = getPaymentDate(l); return d >= lastMonthStart && d <= lastMonthEnd; })
      .reduce((sum, l) => sum + (l.amount_paid || 0), 0);

    const fullyPaidClients = paidLeads.length;
    const draftRevenue = 0;
    const completionRevenue = 0;
    const paidForDraftCount = 0;
    const activeProposals = allLeads.filter(l => ['wants_draft', 'reviewing_draft', 'awaiting_decision'].includes(l.status)).length;

    // Pipeline counts
    const pipeline: PipelineCounts = {
      new: allLeads.filter(l => l.status === 'not_contacted' && !l.is_archived).length,
      contacted: allLeads.filter(l => ['contacted', 'waiting', 'sent_initial_text', 'sent_voice_note', 'sms', 'whatsapp', 'facebook_msg', 'no_whatsapp', 'not_answered', 'on_hold'].includes(l.status) && !l.is_archived).length,
      followUp: allLeads.filter(l => ['call_back', 'replied'].includes(l.status) && !l.is_archived).length,
      interested: allLeads.filter(l => l.status === 'interested' && !l.is_archived).length,
      proposalSent: allLeads.filter(l => ['wants_draft', 'reviewing_draft', 'awaiting_decision'].includes(l.status) && !l.is_archived).length,
      closedWon: allLeads.filter(l => ['paid_for_draft', 'completed'].includes(l.status) && !l.is_archived).length,
    };

    // HERO — businesses contacted = leads past "New" (status, source of truth).
    // Reconciles exactly with Sent / pipeline / channel card. Never per-press.
    const contactedTotal = allLeads.filter(l => !l.is_archived && isSentStatus(l.status)).length;

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
    const contactedToday = leadsByDay.get(dayKey(todayISO))?.size ?? 0;
    const contactedYesterday = leadsByDay.get(dayKey(yesterdayISO))?.size ?? 0;
    // Avg businesses contacted per day = total distinct (business, day) pairs / 7.
    const distinctBusinessDayPairs = [...leadsByDay.values()].reduce((sum, set) => sum + set.size, 0);
    const avg7Day = Math.round((distinctBusinessDayPairs / 7) * 10) / 10;
    // Distinct businesses with any logged send (for the honest "X of Y logged" note).
    const loggedLeads = new Set(outreachEvents7d.map(e => e.lead_id).filter(Boolean)).size;

    // Legacy activity metrics
    const dailyCounts: Record<string, number> = {};
    allLeads.forEach(lead => {
      const date = lead.created_at.split('T')[0];
      dailyCounts[date] = (dailyCounts[date] || 0) + 1;
    });
    const dailyCountsArray = Object.entries(dailyCounts).map(([date, count]) => ({ date, count })).sort((a, b) => b.count - a.count);
    const recordDay = dailyCountsArray.length > 0 ? dailyCountsArray[0] : null;
    const uniqueDays = Object.keys(dailyCounts).length;
    const avgPerDayAllTime = uniqueDays > 0 ? totalBusinessesAdded / uniqueDays : 0;

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];
    const last7DaysLeads = allLeads.filter(l => l.created_at.split('T')[0] >= sevenDaysAgoStr);
    const avgPerDayLast7Days = last7DaysLeads.length / 7;

    const trackedLeads = allLeads.filter(l => l.is_potential_work && !l.is_archived);

    // Potential revenue: sum of potential_revenue from tracked leads (is_potential_work)
    const totalPotentialRevenue = allLeads
      .filter(l => l.is_potential_work && !l.is_archived)
      .reduce((sum, l) => sum + ((l as any).potential_revenue || 0), 0);

    // Closed revenue: actual amount_paid from paid clients
    const closedRevenue = totalRevenue;

    // ── Per-channel performance (source of truth: lead contact_method + status) ──
    const channelPerf: ChannelPerformance = {
      whatsapp: emptyChannelStat(),
      sms: emptyChannelStat(),
      call: emptyChannelStat(),
      facebook_msg: emptyChannelStat(),
      noMethodSent: 0,
    };
    const activeLeads = allLeads.filter(l => !l.is_archived);
    const leadMethodById = new Map<string, string | null>(activeLeads.map(l => [l.id, l.contact_method ?? null]));
    for (const l of activeLeads) {
      if (!isSentStatus(l.status)) continue;
      const m = l.contact_method as keyof ChannelPerformance | null;
      if (m && m in channelPerf && m !== 'noMethodSent') {
        const stat = channelPerf[m] as ChannelStat;
        stat.sent += 1;
        if (isRepliedStatus(l.status)) stat.replied += 1;
      } else {
        channelPerf.noMethodSent += 1;
      }
    }
    // Attribute barber site-claims to the lead's channel.
    for (const leadId of claimedLeadIds) {
      const m = leadMethodById.get(leadId) as keyof ChannelPerformance | undefined;
      if (m && m in channelPerf && m !== 'noMethodSent') {
        (channelPerf[m] as ChannelStat).claimed += 1;
      }
    }
    for (const key of ['whatsapp', 'sms', 'call', 'facebook_msg'] as const) {
      const stat = channelPerf[key];
      stat.replyRate = stat.sent > 0 ? Math.round((stat.replied / stat.sent) * 100) : null;
    }

    return {
      totalRevenue, revenueThisMonth, revenueLastMonth,
      draftRevenue, completionRevenue, fullyPaidClients, paidForDraftCount, activeProposals,
      totalPotentialRevenue, closedRevenue,
      pipeline,
      totalBusinessesAdded, noWebsiteBusinesses, addedToday, addedYesterday,
      contactedTotal, contactedToday, contactedYesterday, avg7Day, loggedLeads,
      recordDay, avgPerDayAllTime, avgPerDayLast7Days,
      activity: activityData,
      trackedLeads,
      siteFunnel,
      channelPerf,
    };
  }, [allLeads, activityData, totalNoWebsiteFound, outreachEvents7d, siteFunnel, claimedLeadIds]);

  return { metrics, isLoading, refetch: fetchAllData };
}
