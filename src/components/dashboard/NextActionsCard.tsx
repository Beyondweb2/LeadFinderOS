import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { CalendarClock, Users, AlertTriangle, Clock, CheckCircle } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { OutreachLead } from '@/types/outreach';

interface NextActionsCardProps {
  trackedLeads: OutreachLead[];
}

const ACTION_LABELS: Record<string, string> = {
  call: 'Call',
  follow_up: 'Follow Up',
  send_draft: 'Send Draft',
  remove_if_no_reply: 'Remove if No Reply',
  send_initial_text: 'Send Text',
  send_voice_note: 'Voice Note',
  send_follow_up: 'Follow Up',
  check_3_day_removal: '3-Day Check',
  none: 'None',
};

export function NextActionsCard({ trackedLeads }: NextActionsCardProps) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 7);

  // Leads with next actions
  const withActions = trackedLeads.filter(l => l.next_action && l.next_action !== 'none');

  // Overdue
  const overdue = withActions.filter(l => {
    if (!l.next_action_date) return false;
    return new Date(l.next_action_date) < today;
  });

  // Due today
  const dueToday = withActions.filter(l => {
    if (!l.next_action_date) return false;
    const d = new Date(l.next_action_date);
    return d >= today && d < tomorrow;
  });

  // Due this week (tomorrow through 7 days)
  const dueThisWeek = withActions.filter(l => {
    if (!l.next_action_date) return false;
    const d = new Date(l.next_action_date);
    return d >= tomorrow && d < nextWeek;
  });

  // Upcoming sorted list (overdue + today + this week, max 4)
  const upcoming = [...overdue, ...dueToday, ...dueThisWeek]
    .sort((a, b) => {
      const dateA = a.next_action_date ? new Date(a.next_action_date).getTime() : Infinity;
      const dateB = b.next_action_date ? new Date(b.next_action_date).getTime() : Infinity;
      return dateA - dateB;
    })
    .slice(0, 3);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    d.setHours(0, 0, 0, 0);
    if (d.getTime() === today.getTime()) return 'Today';
    if (d < today) return 'Overdue';
    const diff = Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diff === 1) return 'Tomorrow';
    return `In ${diff}d`;
  };

  return (
    <Card className="bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-transparent border-amber-500/20">
      <CardHeader className="pb-1 sm:pb-2 p-3 sm:p-4 md:p-6">
        <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-1.5 sm:gap-2">
          <CalendarClock className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-amber-500" />
          <span className="truncate">Next Actions</span>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 sm:space-y-3 p-3 pt-0 sm:p-4 sm:pt-0 md:p-6 md:pt-0">
        {/* Summary stats */}
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center">
            <div className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground">
              {trackedLeads.length}
            </div>
            <p className="text-[10px] sm:text-xs text-muted-foreground">Tracked</p>
          </div>
          <div className="text-center">
            <div className={`text-xl sm:text-2xl md:text-3xl font-bold ${overdue.length > 0 ? 'text-red-500' : 'text-green-500'}`}>
              {overdue.length}
            </div>
            <p className="text-[10px] sm:text-xs text-muted-foreground">Overdue</p>
          </div>
          <div className="text-center">
            <div className="text-xl sm:text-2xl md:text-3xl font-bold text-amber-500">
              {dueToday.length}
            </div>
            <p className="text-[10px] sm:text-xs text-muted-foreground">Due Today</p>
          </div>
        </div>

        {/* Upcoming actions list */}
        {upcoming.length > 0 ? (
          <div className="space-y-1.5 pt-2 border-t border-border/50">
            {upcoming.map(lead => {
              const isOverdue = lead.next_action_date && new Date(lead.next_action_date) < today;
              return (
                <Link
                  key={lead.id}
                  to="/potential-work"
                  className="flex items-center justify-between gap-2 p-1.5 rounded-md hover:bg-muted/50 transition-colors"
                >
                  <div className="flex items-center gap-1.5 min-w-0">
                    {isOverdue ? (
                      <AlertTriangle className="h-3 w-3 text-red-500 shrink-0" />
                    ) : (
                      <Clock className="h-3 w-3 text-amber-500 shrink-0" />
                    )}
                    <span className="text-xs truncate font-medium">{lead.business_name}</span>
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <span className="text-[10px] text-muted-foreground">
                      {ACTION_LABELS[lead.next_action || 'none']}
                    </span>
                    <span className={`text-[10px] font-medium ${isOverdue ? 'text-red-500' : 'text-amber-500'}`}>
                      {lead.next_action_date ? formatDate(lead.next_action_date) : '—'}
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="pt-2 border-t border-border/50 text-center">
            <CheckCircle className="h-4 w-4 text-green-500 mx-auto mb-1" />
            <p className="text-xs text-muted-foreground">All caught up!</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
