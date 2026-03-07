import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import type { OutreachLead } from '@/types/outreach';

// Revenue constants
const DRAFT_REVENUE = 49;
const COMPLETION_REVENUE = 450;

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

interface OutreachChannels7d {
  calls: number;
  whatsapp: number;
  sms: number;
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
  contactedToday: number;
  contactedYesterday: number;
  avg7Day: number;
  channels7d: OutreachChannels7d;

  // Activity (legacy)
  recordDay: { date: string; count: number } | null;
  avgPerDayAllTime: number;
  avgPerDayLast7Days: number;
  activity: ActivityMetrics;

  // Tracked leads
  trackedLeads: OutreachLead[];
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
  const [outreachEvents7d, setOutreachEvents7d] = useState<{ channel: string; created_at: string }[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const hasLoadedOnceRef = useRef(false);
  const { user } = useAuth();

  const fetchAllData = useCallback(async () => {
    if (!user) return;
    if (!hasLoadedOnceRef.current) setIsLoading(true);
    const dates = getDateRanges();

    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const [leadsResult, copiedPhonesResult, activitiesResult, contactsResult, searchHistoryResult, eventsResult] = await Promise.all([
      supabase.from('outreach_leads').select('*').order('created_at', { ascending: true }),
      supabase.from('copied_phones').select('copied_at').eq('user_id', user.id),
      supabase.from('outreach_activities').select('created_at').eq('user_id', user.id),
      supabase.from('lead_contacts').select('contacted_at').eq('user_id', user.id),
      supabase.from('search_history').select('no_website_count').eq('user_id', user.id),
      supabase.from('outreach_events').select('channel, created_at').eq('user_id', user.id).gte('created_at', sevenDaysAgo.toISOString()),
    ]);

    hasLoadedOnceRef.current = true;
    setIsLoading(false);

    if (leadsResult.error) {
      console.error('Error fetching leads for metrics:', leadsResult.error);
      return;
    }

    setAllLeads((leadsResult.data || []) as OutreachLead[]);
    setOutreachEvents7d(eventsResult.data || []);

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
  }, [user]);

  useEffect(() => { fetchAllData(); }, [fetchAllData]);

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

    const calcRevenue = (lead: OutreachLead) => {
      if (lead.status === 'completed') return DRAFT_REVENUE + COMPLETION_REVENUE;
      if (lead.status === 'paid_for_draft') return DRAFT_REVENUE;
      return 0;
    };

    const getPaymentDate = (lead: OutreachLead) => {
      if (lead.payment_date) return new Date(lead.payment_date);
      return new Date(lead.updated_at);
    };

    const revenueLeads = allLeads.filter(l => l.status === 'paid_for_draft' || l.status === 'completed');
    const totalRevenue = revenueLeads.reduce((sum, l) => sum + calcRevenue(l), 0);

    const revenueThisMonth = revenueLeads
      .filter(l => getPaymentDate(l) >= thisMonthStart)
      .reduce((sum, l) => sum + calcRevenue(l), 0);

    const revenueLastMonth = revenueLeads
      .filter(l => { const d = getPaymentDate(l); return d >= lastMonthStart && d <= lastMonthEnd; })
      .reduce((sum, l) => sum + calcRevenue(l), 0);

    const paidForDraftCount = allLeads.filter(l => l.status === 'paid_for_draft').length;
    const completedCount = allLeads.filter(l => l.status === 'completed').length;
    const fullyPaidClients = completedCount;
    const draftRevenue = (paidForDraftCount + completedCount) * DRAFT_REVENUE;
    const completionRevenue = completedCount * COMPLETION_REVENUE;
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

    // Contacted today/yesterday from outreach_events or status-based
    const contactedStatuses = [
      'contacted', 'call_back', 'not_answered', 'on_hold', 'wants_draft', 'interested', 'not_interested',
      'sent_initial_text', 'replied', 'sent_voice_note', 'awaiting_decision', 'waiting',
      'reviewing_draft', 'paid_for_draft', 'completed', 'no_whatsapp', 'sms', 'whatsapp', 'facebook_msg'
    ];

    // Use outreach_events for contacted today/yesterday
    const todayISO = today.toISOString();
    const yesterdayISO = yesterday.toISOString();
    const tomorrowISO = new Date(today.getTime() + 86400000).toISOString();

    const contactedToday = outreachEvents7d.filter(e => e.created_at >= todayISO).length;
    const contactedYesterday = outreachEvents7d.filter(e => e.created_at >= yesterdayISO && e.created_at < todayISO).length;

    // 7-day average
    const avg7Day = Math.round((outreachEvents7d.length / 7) * 10) / 10;

    // Channel breakdown 7d
    const channels7d: OutreachChannels7d = {
      calls: outreachEvents7d.filter(e => e.channel === 'call' || e.channel === 'Call').length,
      whatsapp: outreachEvents7d.filter(e => e.channel === 'whatsapp' || e.channel === 'WhatsApp').length,
      sms: outreachEvents7d.filter(e => e.channel === 'sms' || e.channel === 'SMS').length,
    };

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

    return {
      totalRevenue, revenueThisMonth, revenueLastMonth,
      draftRevenue, completionRevenue, fullyPaidClients, paidForDraftCount, activeProposals,
      pipeline,
      totalBusinessesAdded, noWebsiteBusinesses, addedToday, addedYesterday,
      contactedToday, contactedYesterday, avg7Day, channels7d,
      recordDay, avgPerDayAllTime, avgPerDayLast7Days,
      activity: activityData,
      trackedLeads,
    };
  }, [allLeads, activityData, totalNoWebsiteFound, outreachEvents7d]);

  return { metrics, isLoading, refetch: fetchAllData };
}
