import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import type { OutreachLead } from '@/types/outreach';

// Revenue constants
const DRAFT_REVENUE = 49;
const COMPLETION_REVENUE = 450;

interface OutreachLogEntry {
  outreach_type: string;
  contacted_at: string;
}

interface DashboardMetrics {
  // Revenue
  totalRevenue: number;
  revenueThisMonth: number;
  revenueLastMonth: number;
  fullyPaidClients: number;

  // Outreach activity (from outreach_logs)
  totalContacted: number;
  contactedToday: number;
  contactedYesterday: number;
  avg7Day: number;
  callsTotal: number;
  whatsappTotal: number;
  smsTotal: number;
  emailTotal: number;

  // Pipeline (from lead statuses)
  trackedLeads: number;
  pipelineContacted: number;
  pipelineInterested: number;
  pipelineCallBooked: number;
  pipelineClosedWon: number;

  // Daily discipline
  currentStreak: number;

  // For Next Actions card
  trackedLeadsList: OutreachLead[];

  // For trial card
  noWebsiteBusinesses: number;
  totalBusinessesAdded: number;
}

const getDateStr = (d: Date) => d.toISOString().split('T')[0];

export function useDashboardMetrics() {
  const [allLeads, setAllLeads] = useState<OutreachLead[]>([]);
  const [outreachLogs, setOutreachLogs] = useState<OutreachLogEntry[]>([]);
  const [totalNoWebsiteFound, setTotalNoWebsiteFound] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const hasLoadedOnceRef = useRef(false);
  const { user } = useAuth();

  const fetchAllData = useCallback(async () => {
    if (!user) return;
    
    if (!hasLoadedOnceRef.current) {
      setIsLoading(true);
    }
    
    const [leadsResult, logsResult, searchHistoryResult] = await Promise.all([
      supabase
        .from('outreach_leads')
        .select('*')
        .order('created_at', { ascending: true }),
      supabase
        .from('outreach_logs')
        .select('outreach_type, contacted_at')
        .eq('user_id', user.id)
        .order('contacted_at', { ascending: false }),
      supabase
        .from('search_history')
        .select('no_website_count')
        .eq('user_id', user.id),
    ]);

    hasLoadedOnceRef.current = true;
    setIsLoading(false);

    if (leadsResult.error) {
      console.error('Error fetching leads for metrics:', leadsResult.error);
      return;
    }

    setAllLeads((leadsResult.data || []) as OutreachLead[]);
    setOutreachLogs((logsResult.data || []) as OutreachLogEntry[]);
    
    const searchHistory = searchHistoryResult.data || [];
    const totalFound = searchHistory.reduce((sum, s) => sum + (s.no_website_count || 0), 0);
    setTotalNoWebsiteFound(totalFound);
  }, [user]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  const metrics = useMemo<DashboardMetrics>(() => {
    const now = new Date();
    const today = new Date(now);
    today.setHours(0, 0, 0, 0);
    const todayStr = getDateStr(today);
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = getDateStr(yesterday);

    // --- Revenue from lead statuses ---
    const paidForDraftCount = allLeads.filter(l => l.status === 'paid_for_draft').length;
    const completedCount = allLeads.filter(l => l.status === 'completed').length;
    const draftRevenue = (paidForDraftCount + completedCount) * DRAFT_REVENUE;
    const completionRevenue = completedCount * COMPLETION_REVENUE;
    const totalRevenue = draftRevenue + completionRevenue;

    // Monthly revenue from payment_date
    const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    
    const getLeadRevenue = (lead: OutreachLead) => {
      let rev = 0;
      if (lead.status === 'paid_for_draft' || lead.status === 'completed') rev += DRAFT_REVENUE;
      if (lead.status === 'completed') rev += COMPLETION_REVENUE;
      return rev;
    };

    const revenueThisMonth = allLeads
      .filter(l => l.payment_date && new Date(l.payment_date) >= thisMonthStart)
      .reduce((sum, l) => sum + getLeadRevenue(l), 0);

    const revenueLastMonth = allLeads
      .filter(l => {
        if (!l.payment_date) return false;
        const d = new Date(l.payment_date);
        return d >= lastMonthStart && d < thisMonthStart;
      })
      .reduce((sum, l) => sum + getLeadRevenue(l), 0);

    // --- Outreach activity from outreach_logs ---
    const totalContacted = outreachLogs.length;
    const contactedToday = outreachLogs.filter(l => l.contacted_at.split('T')[0] === todayStr).length;
    const contactedYesterday = outreachLogs.filter(l => l.contacted_at.split('T')[0] === yesterdayStr).length;

    // 7-day average
    const sevenDaysAgo = new Date(today);
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString();
    const last7DaysLogs = outreachLogs.filter(l => l.contacted_at >= sevenDaysAgoStr);
    const avg7Day = last7DaysLogs.length / 7;

    // Channel breakdown
    const callsTotal = outreachLogs.filter(l => l.outreach_type === 'call').length;
    const whatsappTotal = outreachLogs.filter(l => l.outreach_type === 'whatsapp').length;
    const smsTotal = outreachLogs.filter(l => l.outreach_type === 'sms').length;
    const emailTotal = outreachLogs.filter(l => l.outreach_type === 'email').length;

    // --- Pipeline from lead statuses ---
    const contactedStatuses = [
      'contacted', 'call_back', 'not_answered', 'on_hold',
      'wants_draft', 'interested', 'not_interested',
      'sent_initial_text', 'replied', 'sent_voice_note',
      'awaiting_decision', 'waiting', 'reviewing_draft',
      'paid_for_draft', 'completed', 'no_whatsapp',
      'sms', 'whatsapp', 'facebook_msg',
    ];
    const interestedStatuses = [
      'interested', 'wants_draft', 'waiting', 'reviewing_draft',
      'awaiting_decision', 'paid_for_draft', 'completed',
    ];

    const activeLeads = allLeads.filter(l => !l.is_archived);
    const trackedLeadsList = activeLeads.filter(l => l.is_potential_work);
    const pipelineContacted = activeLeads.filter(l => contactedStatuses.includes(l.status)).length;
    const pipelineInterested = activeLeads.filter(l => interestedStatuses.includes(l.status)).length;
    const pipelineCallBooked = activeLeads.filter(l => l.status === 'call_back').length;
    const pipelineClosedWon = allLeads.filter(l => l.status === 'completed').length;

    // --- Daily discipline: streak of days with 5+ contacts ---
    const dailyCounts: Record<string, number> = {};
    outreachLogs.forEach(l => {
      const date = l.contacted_at.split('T')[0];
      dailyCounts[date] = (dailyCounts[date] || 0) + 1;
    });

    let currentStreak = 0;
    const checkDate = new Date(today);
    // If today has 0 contacts, start from yesterday
    if ((dailyCounts[todayStr] || 0) < 5) {
      checkDate.setDate(checkDate.getDate() - 1);
    }
    while (true) {
      const ds = getDateStr(checkDate);
      if ((dailyCounts[ds] || 0) >= 5) {
        currentStreak++;
        checkDate.setDate(checkDate.getDate() - 1);
      } else {
        break;
      }
    }

    return {
      totalRevenue,
      revenueThisMonth,
      revenueLastMonth,
      fullyPaidClients: completedCount,
      totalContacted,
      contactedToday,
      contactedYesterday,
      avg7Day,
      callsTotal,
      whatsappTotal,
      smsTotal,
      emailTotal,
      trackedLeads: trackedLeadsList.length,
      pipelineContacted,
      pipelineInterested,
      pipelineCallBooked,
      pipelineClosedWon,
      currentStreak,
      trackedLeadsList,
      noWebsiteBusinesses: totalNoWebsiteFound,
      totalBusinessesAdded: allLeads.length,
    };
  }, [allLeads, outreachLogs, totalNoWebsiteFound]);

  return {
    metrics,
    isLoading,
    refetch: fetchAllData,
  };
}
