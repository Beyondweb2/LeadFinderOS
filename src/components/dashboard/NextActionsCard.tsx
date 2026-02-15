import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CalendarClock, AlertTriangle, Clock, CheckCircle, ChevronLeft, ChevronRight } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { OutreachLead } from '@/types/outreach';
import { getLeadCustomAction } from '@/hooks/useCustomNextActions';

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
  const [currentIndex, setCurrentIndex] = useState(0);

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

  // All upcoming sorted
  const upcoming = [...overdue, ...dueToday, ...dueThisWeek]
    .sort((a, b) => {
      const dateA = a.next_action_date ? new Date(a.next_action_date).getTime() : Infinity;
      const dateB = b.next_action_date ? new Date(b.next_action_date).getTime() : Infinity;
      return dateA - dateB;
    });

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    d.setHours(0, 0, 0, 0);
    if (d.getTime() === today.getTime()) return 'Today';
    if (d < today) return 'Overdue';
    const diff = Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diff === 1) return 'Tomorrow';
    return `In ${diff}d`;
  };

  // Clamp index
  const safeIndex = upcoming.length > 0 ? Math.min(currentIndex, upcoming.length - 1) : 0;
  const currentLead = upcoming[safeIndex];

  const goNext = () => setCurrentIndex(i => Math.min(i + 1, upcoming.length - 1));
  const goPrev = () => setCurrentIndex(i => Math.max(i - 1, 0));

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

        {/* Single lead carousel */}
        {upcoming.length > 0 && currentLead ? (
          <div className="pt-2 border-t border-border/50">
            <Link
              to="/potential-work"
              className="block p-2 rounded-md hover:bg-muted/50 transition-colors"
            >
              <div className="flex items-center gap-1.5 mb-1">
                {currentLead.next_action_date && new Date(currentLead.next_action_date) < today ? (
                  <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                ) : (
                  <Clock className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                )}
                <span className="text-sm font-medium break-words leading-tight">{currentLead.business_name}</span>
              </div>
              <div className="flex items-center justify-between ml-5">
                <span className="text-xs text-muted-foreground">
                  {getLeadCustomAction(currentLead.id) || ACTION_LABELS[currentLead.next_action || 'none']}
                </span>
                <span className={`text-xs font-medium ${currentLead.next_action_date && new Date(currentLead.next_action_date) < today ? 'text-red-500' : 'text-amber-500'}`}>
                  {currentLead.next_action_date ? formatDate(currentLead.next_action_date) : '—'}
                </span>
              </div>
            </Link>
            {/* Cycling controls */}
            {upcoming.length > 1 && (
              <div className="flex items-center justify-between mt-1.5">
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={goPrev} disabled={safeIndex === 0}>
                  <ChevronLeft className="h-3.5 w-3.5" />
                </Button>
                <span className="text-[10px] text-muted-foreground">{safeIndex + 1} / {upcoming.length}</span>
                <Button variant="ghost" size="icon" className="h-6 w-6" onClick={goNext} disabled={safeIndex === upcoming.length - 1}>
                  <ChevronRight className="h-3.5 w-3.5" />
                </Button>
              </div>
            )}
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