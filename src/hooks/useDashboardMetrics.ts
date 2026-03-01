import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import type { OutreachLead } from '@/types/outreach';

interface DashboardMetrics {
  // Outreach Activity
  totalContacted: number;
  contactedToday: number;
  callsMade: number;
  whatsappSent: number;
  smsSent: number;
  emailsSent: number;
  facebookSent: number;
  manualContacted: number;

  // Response & Engagement
  repliesReceived: number;
  positiveReplies: number;
  callsBooked: number;
  followUpsScheduled: number;
  responseRate: number;
  bookingRate: number;

  // Pipeline
  pipeline: {
    contacted: number;
    replied: number;
    interested: number;
    callBooked: number;
    proposalSent: number;
    closedWon: number;
    closedLost: number;
  };

  // Daily Discipline
  contactsToday: number;
  avg7Day: number;
  currentStreak: number;
  bestDay: { date: string; count: number } | null;

  // Conversion
  contactToReply: number;
  replyToCall: number;
  callToClosed: number;
  overallContactToClosed: number;

  // Revenue (kept)
  totalRevenue: number;
  draftRevenue: number;
  completionRevenue: number;
  fullyPaidClients: number;
  paidForDraftCount: number;

  // Legacy / shared
  totalBusinessesAdded: number;
  noWebsiteBusinesses: number;
  trackedLeads: OutreachLead[];

  // For trial card
  activity: { activitiesToday: number };
}

const DRAFT_REVENUE = 49;
const COMPLETION_REVENUE = 450;

const CONTACTED_STATUSES = [
  'contacted', 'call_back', 'not_answered', 'on_hold',
  'wants_draft', 'interested', 'not_interested',
  'sent_initial_text', 'replied', 'sent_voice_note',
  'awaiting_decision', 'waiting', 'reviewing_draft',
  'paid_for_draft', 'completed', 'no_whatsapp',
  'sms', 'whatsapp', 'facebook_msg',
];

function todayStr() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.toISOString().split('T')[0];
}

function calculateStreak(dailyCounts: Record<string, number>): number {
  let streak = 0;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  for (let i = 0; i < 365; i++) {
    const d = new Date(today);
    d.setDate(d.getDate() - i);
    const ds = d.toISOString().split('T')[0];
    if ((dailyCounts[ds] || 0) >= 5) {
      streak++;
    } else {
      if (i === 0) continue; // today not over yet
      break;
    }
  }
  return streak;
}

export function useDashboardMetrics() {
  const [allLeads, setAllLeads] = useState<OutreachLead[]>([]);
  const [outreachLogs, setOutreachLogs] = useState<Array<{ outreach_type: string; contacted_at: string }>>([]);
  const [totalNoWebsiteFound, setTotalNoWebsiteFound] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const hasLoadedOnceRef = useRef(false);
  const { user } = useAuth();

  const fetchAllData = useCallback(async () => {
    if (!user) return;
    if (!hasLoadedOnceRef.current) setIsLoading(true);

    const [leadsRes, logsRes, searchRes] = await Promise.all([
      supabase.from('outreach_leads').select('*').order('created_at', { ascending: true }),
      supabase.from('outreach_logs' as any).select('outreach_type, contacted_at').eq('user_id', user.id).order('contacted_at', { ascending: false }),
      supabase.from('search_history').select('no_website_count').eq('user_id', user.id),
    ]);

    hasLoadedOnceRef.current = true;
    setIsLoading(false);

    if (leadsRes.error) { console.error('Leads fetch error:', leadsRes.error); return; }
    setAllLeads((leadsRes.data || []) as OutreachLead[]);
    setOutreachLogs((logsRes.data || []) as any[]);
    setTotalNoWebsiteFound((searchRes.data || []).reduce((s: number, r: any) => s + (r.no_website_count || 0), 0));
  }, [user]);

  useEffect(() => { fetchAllData(); }, [fetchAllData]);

  const metrics = useMemo<DashboardMetrics>(() => {
    const today = todayStr();
    const leads = allLeads;
    const totalBusinessesAdded = leads.length;

    // --- Pipeline from lead statuses ---
    const contacted = leads.filter(l => CONTACTED_STATUSES.includes(l.status));
    const totalContacted = contacted.length;
    const replied = leads.filter(l => ['replied'].includes(l.status));
    const interested = leads.filter(l => ['interested', 'on_hold'].includes(l.status));
    const callBooked = leads.filter(l => l.status === 'call_back');
    const proposalSent = leads.filter(l => ['wants_draft', 'awaiting_decision', 'reviewing_draft'].includes(l.status));
    const closedWon = leads.filter(l => ['paid_for_draft', 'completed'].includes(l.status));
    const closedLost = leads.filter(l => l.status === 'not_interested');

    // Positive replies = replied + interested + call_back + wants_draft etc
    const positiveStatuses = ['interested', 'call_back', 'wants_draft', 'awaiting_decision', 'reviewing_draft', 'paid_for_draft', 'completed'];
    const positiveReplies = leads.filter(l => positiveStatuses.includes(l.status)).length;
    const repliesReceived = replied.length + positiveReplies;
    const callsBookedCount = callBooked.length;
    const followUpsScheduled = leads.filter(l => l.next_action && l.next_action !== 'none').length;

    // Rates
    const responseRate = totalContacted > 0 ? (repliesReceived / totalContacted) * 100 : 0;
    const bookingRate = totalContacted > 0 ? (callsBookedCount / totalContacted) * 100 : 0;

    // --- Outreach logs breakdown ---
    const logsByType = (type: string) => outreachLogs.filter(l => l.outreach_type === type).length;
    const logsToday = outreachLogs.filter(l => l.contacted_at.split('T')[0] === today);
    const contactedToday = logsToday.length || leads.filter(l => l.created_at.split('T')[0] === today && CONTACTED_STATUSES.includes(l.status)).length;

    // --- Daily discipline from outreach_logs ---
    const dailyCounts: Record<string, number> = {};
    outreachLogs.forEach(l => {
      const d = l.contacted_at.split('T')[0];
      dailyCounts[d] = (dailyCounts[d] || 0) + 1;
    });
    // Also count from leads created_at for users who haven't built up logs yet
    if (outreachLogs.length === 0) {
      leads.forEach(l => {
        if (CONTACTED_STATUSES.includes(l.status)) {
          const d = l.updated_at.split('T')[0];
          dailyCounts[d] = (dailyCounts[d] || 0) + 1;
        }
      });
    }

    const contactsTodayDiscipline = dailyCounts[today] || 0;
    const last7Days = Array.from({ length: 7 }, (_, i) => {
      const d = new Date(); d.setDate(d.getDate() - i);
      return d.toISOString().split('T')[0];
    });
    const sum7 = last7Days.reduce((s, d) => s + (dailyCounts[d] || 0), 0);
    const avg7Day = sum7 / 7;
    const currentStreak = calculateStreak(dailyCounts);

    const dailyArr = Object.entries(dailyCounts).map(([date, count]) => ({ date, count }));
    dailyArr.sort((a, b) => b.count - a.count);
    const bestDay = dailyArr[0] || null;

    // --- Conversion ---
    const contactToReply = totalContacted > 0 ? (repliesReceived / totalContacted) * 100 : 0;
    const replyToCall = repliesReceived > 0 ? (callsBookedCount / repliesReceived) * 100 : 0;
    const closedWonCount = closedWon.length;
    const callToClosed = callsBookedCount > 0 ? (closedWonCount / callsBookedCount) * 100 : 0;
    const overallContactToClosed = totalContacted > 0 ? (closedWonCount / totalContacted) * 100 : 0;

    // --- Revenue ---
    const paidForDraftCount = leads.filter(l => l.status === 'paid_for_draft').length;
    const completedCount = leads.filter(l => l.status === 'completed').length;
    const draftRevenue = (paidForDraftCount + completedCount) * DRAFT_REVENUE;
    const completionRevenue = completedCount * COMPLETION_REVENUE;
    const totalRevenue = draftRevenue + completionRevenue;

    const trackedLeads = leads.filter(l => l.is_potential_work && !l.is_archived);

    return {
      totalContacted,
      contactedToday: contactsTodayDiscipline || contactedToday,
      callsMade: logsByType('call'),
      whatsappSent: logsByType('whatsapp'),
      smsSent: logsByType('sms'),
      emailsSent: logsByType('email'),
      facebookSent: logsByType('facebook'),
      manualContacted: logsByType('manual'),
      repliesReceived,
      positiveReplies,
      callsBooked: callsBookedCount,
      followUpsScheduled,
      responseRate,
      bookingRate,
      pipeline: {
        contacted: totalContacted,
        replied: replied.length,
        interested: interested.length,
        callBooked: callsBookedCount,
        proposalSent: proposalSent.length,
        closedWon: closedWonCount,
        closedLost: closedLost.length,
      },
      contactsToday: contactsTodayDiscipline || contactedToday,
      avg7Day,
      currentStreak,
      bestDay,
      contactToReply,
      replyToCall,
      callToClosed,
      overallContactToClosed,
      totalRevenue,
      draftRevenue,
      completionRevenue,
      fullyPaidClients: completedCount,
      paidForDraftCount,
      totalBusinessesAdded,
      noWebsiteBusinesses: totalNoWebsiteFound,
      trackedLeads,
      activity: { activitiesToday: contactsTodayDiscipline || contactedToday },
    };
  }, [allLeads, outreachLogs, totalNoWebsiteFound]);

  return { metrics, isLoading, refetch: fetchAllData };
}
