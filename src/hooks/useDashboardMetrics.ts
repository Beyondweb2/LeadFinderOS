 import { useState, useCallback, useEffect, useMemo } from 'react';
 import { useAuth } from '@/hooks/useAuth';
 import { supabase } from '@/integrations/supabase/client';
 import type { OutreachLead } from '@/types/outreach';
 
 // Revenue constants
 const DRAFT_REVENUE = 49;
 const COMPLETION_REVENUE = 450;
 const TOTAL_CLIENT_VALUE = DRAFT_REVENUE + COMPLETION_REVENUE; // £499
 
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
   totalArchived: number;
   totalActive: number;
   
   // Activity metrics
   recordDay: { date: string; count: number } | null;
   avgPerDayAllTime: number;
   avgPerDayLast7Days: number;
 }
 
 interface DailyAddCount {
   date: string;
   count: number;
 }
 
 export function useDashboardMetrics() {
   const [allLeads, setAllLeads] = useState<OutreachLead[]>([]);
   const [isLoading, setIsLoading] = useState(true);
   const { user } = useAuth();
 
   const fetchAllLeads = useCallback(async () => {
     if (!user) return;
     
     setIsLoading(true);
     
     // Fetch ALL leads (active + archived) for comprehensive metrics
     const { data, error } = await supabase
       .from('outreach_leads')
       .select('*')
       .order('created_at', { ascending: true });
 
     setIsLoading(false);
 
     if (error) {
       console.error('Error fetching leads for metrics:', error);
       return;
     }
 
     setAllLeads((data || []) as OutreachLead[]);
   }, [user]);
 
   useEffect(() => {
     fetchAllLeads();
   }, [fetchAllLeads]);
 
   const metrics = useMemo<DashboardMetrics>(() => {
     const totalBusinessesAdded = allLeads.length;
     const totalArchived = allLeads.filter(l => l.is_archived).length;
     const totalActive = allLeads.filter(l => !l.is_archived).length;
     
     // Conversion metrics
     // "Interested" includes: interested, wants_draft, reviewing_draft, paid_for_draft, completed
     const interestedStatuses = ['interested', 'wants_draft', 'waiting', 'reviewing_draft', 'paid_for_draft', 'completed'];
     const interestedCount = allLeads.filter(l => interestedStatuses.includes(l.status)).length;
     
     // "Contacted" means they moved past not_contacted
     const contactedCount = allLeads.filter(l => l.status !== 'not_contacted').length;
     
     const interestRate = totalBusinessesAdded > 0 
       ? (interestedCount / totalBusinessesAdded) * 100 
       : 0;
     
     const responseToInterestRate = contactedCount > 0 
       ? (interestedCount / contactedCount) * 100 
       : 0;
     
     // Revenue metrics
     // paid_for_draft = £49 (draft payment received)
     // completed = £499 (both payments received)
     const paidForDraftCount = allLeads.filter(l => l.status === 'paid_for_draft').length;
     const completedCount = allLeads.filter(l => l.status === 'completed').length;
     
     // Draft revenue: both paid_for_draft AND completed have paid the £49
     const draftRevenue = (paidForDraftCount + completedCount) * DRAFT_REVENUE;
     
     // Completion revenue: only completed clients have paid the £450
     const completionRevenue = completedCount * COMPLETION_REVENUE;
     
     // Total revenue
     const totalRevenue = draftRevenue + completionRevenue;
     
     // Activity metrics - calculate daily add counts
     const dailyCounts: Record<string, number> = {};
     allLeads.forEach(lead => {
       const date = lead.created_at.split('T')[0]; // Extract date part
       dailyCounts[date] = (dailyCounts[date] || 0) + 1;
     });
     
     const dailyCountsArray: DailyAddCount[] = Object.entries(dailyCounts)
       .map(([date, count]) => ({ date, count }))
       .sort((a, b) => b.count - a.count);
     
     const recordDay = dailyCountsArray.length > 0 ? dailyCountsArray[0] : null;
     
     // Average per day (all time)
     const uniqueDays = Object.keys(dailyCounts).length;
     const avgPerDayAllTime = uniqueDays > 0 
       ? totalBusinessesAdded / uniqueDays 
       : 0;
     
     // Average per day (last 7 days)
     const sevenDaysAgo = new Date();
     sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
     const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];
     
     const last7DaysLeads = allLeads.filter(l => {
       const leadDate = l.created_at.split('T')[0];
       return leadDate >= sevenDaysAgoStr;
     });
     
     const last7DaysDailyCount: Record<string, number> = {};
     last7DaysLeads.forEach(lead => {
       const date = lead.created_at.split('T')[0];
       last7DaysDailyCount[date] = (last7DaysDailyCount[date] || 0) + 1;
     });
     
     const last7UniqueDays = Object.keys(last7DaysDailyCount).length;
     const avgPerDayLast7Days = last7UniqueDays > 0 
       ? last7DaysLeads.length / 7 // Divide by 7 to get true daily average
       : 0;
     
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
       totalArchived,
       totalActive,
       recordDay,
       avgPerDayAllTime,
       avgPerDayLast7Days,
     };
   }, [allLeads]);
 
   return {
     metrics,
     isLoading,
     refetch: fetchAllLeads,
   };
 }