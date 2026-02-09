import { useState, useCallback, useEffect, useMemo } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import type { OutreachLead } from '@/types/outreach';

// Revenue constants
const DRAFT_REVENUE = 49;
const COMPLETION_REVENUE = 450;

interface ActivityMetrics {
  // Phone copies
  phonesCopiedToday: number;
  phonesCopiedYesterday: number;
  phonesCopiedThisWeek: number;
  phonesCopiedLastWeek: number;
  
  // Contacts made (status changes)
  leadsContactedToday: number;
  leadsContactedYesterday: number;
  leadsContactedThisWeek: number;
  leadsContactedLastWeek: number;
  
  // Activities logged
  activitiesToday: number;
  activitiesYesterday: number;
  activitiesThisWeek: number;
  
  // Totals
  totalPhonesCopied: number;
  totalLeadsContacted: number;
}

interface DashboardMetrics {
  // Conversion metrics
  interestRate: number;
  responseToInterestRate: number;
  interestedCount: number;
  contactedCount: number;
  
  // Revenue metrics
  totalRevenue: number;
  draftRevenue: number;
  completionRevenue: number;
  fullyPaidClients: number;
  paidForDraftCount: number;
  
  // Pipeline metrics
  totalBusinessesAdded: number;
  noWebsiteBusinesses: number;
  addedToday: number;
  addedYesterday: number;
  
  // Activity metrics (legacy)
  recordDay: { date: string; count: number } | null;
  avgPerDayAllTime: number;
  avgPerDayLast7Days: number;
  
  // New activity metrics
  activity: ActivityMetrics;
}

interface DailyAddCount {
  date: string;
  count: number;
}

// Helper to get date strings
const getDateRanges = () => {
  const now = new Date();
  
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  
  const startOfWeek = new Date(today);
  startOfWeek.setDate(startOfWeek.getDate() - startOfWeek.getDay()); // Sunday
  
  const startOfLastWeek = new Date(startOfWeek);
  startOfLastWeek.setDate(startOfLastWeek.getDate() - 7);
  
  const endOfLastWeek = new Date(startOfWeek);
  endOfLastWeek.setDate(endOfLastWeek.getDate() - 1);
  
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
  const [activityData, setActivityData] = useState<ActivityMetrics>({
    phonesCopiedToday: 0,
    phonesCopiedYesterday: 0,
    phonesCopiedThisWeek: 0,
    phonesCopiedLastWeek: 0,
    leadsContactedToday: 0,
    leadsContactedYesterday: 0,
    leadsContactedThisWeek: 0,
    leadsContactedLastWeek: 0,
    activitiesToday: 0,
    activitiesYesterday: 0,
    activitiesThisWeek: 0,
    totalPhonesCopied: 0,
    totalLeadsContacted: 0,
  });
  const [isLoading, setIsLoading] = useState(true);
  const { user } = useAuth();

  const fetchAllData = useCallback(async () => {
    if (!user) return;
    
    setIsLoading(true);
    
    const dates = getDateRanges();
    
    // Fetch all data in parallel
    const [leadsResult, copiedPhonesResult, activitiesResult, contactsResult] = await Promise.all([
      // All leads
      supabase
        .from('outreach_leads')
        .select('*')
        .order('created_at', { ascending: true }),
      
      // Copied phones with timestamps
      supabase
        .from('copied_phones')
        .select('copied_at')
        .eq('user_id', user.id),
      
      // Outreach activities
      supabase
        .from('outreach_activities')
        .select('created_at')
        .eq('user_id', user.id),
      
      // Lead contacts (for tracking actual outreach)
      supabase
        .from('lead_contacts')
        .select('contacted_at')
        .eq('user_id', user.id),
    ]);

    setIsLoading(false);

    if (leadsResult.error) {
      console.error('Error fetching leads for metrics:', leadsResult.error);
      return;
    }

    setAllLeads((leadsResult.data || []) as OutreachLead[]);
    
    // Process copied phones
    const copiedPhones = copiedPhonesResult.data || [];
    const phonesCopiedToday = copiedPhones.filter(p => p.copied_at >= dates.todayStr).length;
    const phonesCopiedYesterday = copiedPhones.filter(p => 
      p.copied_at >= dates.yesterdayStr && p.copied_at < dates.yesterdayEndStr
    ).length;
    const phonesCopiedThisWeek = copiedPhones.filter(p => p.copied_at >= dates.weekStartStr).length;
    const phonesCopiedLastWeek = copiedPhones.filter(p => 
      p.copied_at >= dates.lastWeekStartStr && p.copied_at < dates.lastWeekEndStr
    ).length;
    
    // Process activities
    const activities = activitiesResult.data || [];
    const activitiesToday = activities.filter(a => a.created_at >= dates.todayStr).length;
    const activitiesYesterday = activities.filter(a => 
      a.created_at >= dates.yesterdayStr && a.created_at < dates.yesterdayEndStr
    ).length;
    const activitiesThisWeek = activities.filter(a => a.created_at >= dates.weekStartStr).length;
    
    // Process contacts (leads contacted)
    const contacts = contactsResult.data || [];
    const leadsContactedToday = contacts.filter(c => c.contacted_at >= dates.todayStr).length;
    const leadsContactedYesterday = contacts.filter(c => 
      c.contacted_at >= dates.yesterdayStr && c.contacted_at < dates.yesterdayEndStr
    ).length;
    const leadsContactedThisWeek = contacts.filter(c => c.contacted_at >= dates.weekStartStr).length;
    const leadsContactedLastWeek = contacts.filter(c => 
      c.contacted_at >= dates.lastWeekStartStr && c.contacted_at < dates.lastWeekEndStr
    ).length;
    
    setActivityData({
      phonesCopiedToday,
      phonesCopiedYesterday,
      phonesCopiedThisWeek,
      phonesCopiedLastWeek,
      leadsContactedToday,
      leadsContactedYesterday,
      leadsContactedThisWeek,
      leadsContactedLastWeek,
      activitiesToday,
      activitiesYesterday,
      activitiesThisWeek,
      totalPhonesCopied: copiedPhones.length,
      totalLeadsContacted: contacts.length,
    });
  }, [user]);

  useEffect(() => {
    fetchAllData();
  }, [fetchAllData]);

  const metrics = useMemo<DashboardMetrics>(() => {
    const totalBusinessesAdded = allLeads.length;
    
    // Count businesses with no website (list_type is 'no_website')
    const noWebsiteBusinesses = allLeads.filter(
      l => l.list_type === 'no_website'
    ).length;
    
    // Calculate today and yesterday counts
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayStr = today.toISOString().split('T')[0];
    
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    const yesterdayStr = yesterday.toISOString().split('T')[0];
    
    const addedToday = allLeads.filter(l => l.created_at.split('T')[0] === todayStr).length;
    const addedYesterday = allLeads.filter(l => l.created_at.split('T')[0] === yesterdayStr).length;
    
    // Conversion metrics
    const interestedStatuses = ['interested', 'wants_draft', 'waiting', 'reviewing_draft', 'paid_for_draft', 'completed'];
    const interestedCount = allLeads.filter(l => interestedStatuses.includes(l.status)).length;
    
    const contactedCount = allLeads.filter(l => l.status !== 'not_contacted').length;
    
    const interestRate = totalBusinessesAdded > 0 
      ? (interestedCount / totalBusinessesAdded) * 100 
      : 0;
    
    const responseToInterestRate = contactedCount > 0 
      ? (interestedCount / contactedCount) * 100 
      : 0;
    
    // Revenue metrics
    const paidForDraftCount = allLeads.filter(l => l.status === 'paid_for_draft').length;
    const completedCount = allLeads.filter(l => l.status === 'completed').length;
    
    const draftRevenue = (paidForDraftCount + completedCount) * DRAFT_REVENUE;
    const completionRevenue = completedCount * COMPLETION_REVENUE;
    const totalRevenue = draftRevenue + completionRevenue;
    
    // Activity metrics - calculate daily add counts
    const dailyCounts: Record<string, number> = {};
    allLeads.forEach(lead => {
      const date = lead.created_at.split('T')[0];
      dailyCounts[date] = (dailyCounts[date] || 0) + 1;
    });
    
    const dailyCountsArray: DailyAddCount[] = Object.entries(dailyCounts)
      .map(([date, count]) => ({ date, count }))
      .sort((a, b) => b.count - a.count);
    
    const recordDay = dailyCountsArray.length > 0 ? dailyCountsArray[0] : null;
    
    const uniqueDays = Object.keys(dailyCounts).length;
    const avgPerDayAllTime = uniqueDays > 0 
      ? totalBusinessesAdded / uniqueDays 
      : 0;
    
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];
    
    const last7DaysLeads = allLeads.filter(l => {
      const leadDate = l.created_at.split('T')[0];
      return leadDate >= sevenDaysAgoStr;
    });
    
    const avgPerDayLast7Days = last7DaysLeads.length / 7;
    
    return {
      interestRate,
      responseToInterestRate,
      interestedCount,
      contactedCount,
      totalRevenue,
      draftRevenue,
      completionRevenue,
      fullyPaidClients: completedCount,
      paidForDraftCount,
      totalBusinessesAdded,
      noWebsiteBusinesses,
      addedToday,
      addedYesterday,
      recordDay,
      avgPerDayAllTime,
      avgPerDayLast7Days,
      activity: activityData,
    };
  }, [allLeads, activityData]);

  return {
    metrics,
    isLoading,
    refetch: fetchAllData,
  };
}
