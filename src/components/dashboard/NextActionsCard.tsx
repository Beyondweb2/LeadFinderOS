import { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { CalendarClock, AlertTriangle, Clock, CheckCircle, ChevronLeft, ChevronRight, StickyNote } from 'lucide-react';
import { Link } from 'react-router-dom';
import type { OutreachLead } from '@/types/outreach';
import { getLeadCustomAction } from '@/hooks/useCustomNextActions';
import { usePersonalActions } from '@/hooks/usePersonalActions';
import { cn } from '@/lib/utils';

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

type ViewMode = 'business' | 'personal';

export function NextActionsCard({ trackedLeads }: NextActionsCardProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [viewMode, setViewMode] = useState<ViewMode>('business');
  const { activeActions, toggleComplete } = usePersonalActions();

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const nextWeek = new Date(today);
  nextWeek.setDate(nextWeek.getDate() + 7);

  const withActions = trackedLeads.filter(l => l.next_action && l.next_action !== 'none');

  const overdue = withActions.filter(l => {
    if (!l.next_action_date) return false;
    return new Date(l.next_action_date) < today;
  });

  const dueToday = withActions.filter(l => {
    if (!l.next_action_date) return false;
    const d = new Date(l.next_action_date);
    return d >= today && d < tomorrow;
  });

  const dueThisWeek = withActions.filter(l => {
    if (!l.next_action_date) return false;
    const d = new Date(l.next_action_date);
    return d >= tomorrow && d < nextWeek;
  });

  const upcoming = [...overdue, ...dueToday, ...dueThisWeek];

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    d.setHours(0, 0, 0, 0);
    if (d.getTime() === today.getTime()) return 'Today';
    if (d < today) return 'Overdue';
    const diff = Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diff === 1) return 'Tomorrow';
    return `In ${diff}d`;
  };

  const formatPersonalDue = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    d.setHours(0, 0, 0, 0);
    if (d.getTime() === today.getTime()) return 'Today';
    if (d < today) return 'Overdue';
    const diff = Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diff === 1) return 'Tomorrow';
    return `In ${diff}d`;
  };

  const isPersonalOverdue = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    d.setHours(0, 0, 0, 0);
    return d < today;
  };

  const safeIndex = upcoming.length > 0 ? Math.min(currentIndex, upcoming.length - 1) : 0;
  const currentLead = upcoming[safeIndex];
  const isOverdueItem = currentLead?.next_action_date && new Date(currentLead.next_action_date) < today;

  const goNext = () => setCurrentIndex(i => Math.min(i + 1, upcoming.length - 1));
  const goPrev = () => setCurrentIndex(i => Math.max(i - 1, 0));

  // Personal actions: show top 3
  const personalTop3 = activeActions.slice(0, 3);

  return (
    <Card className="bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-transparent border-amber-500/20">
      <CardHeader className="pb-1 sm:pb-2 p-3 sm:p-4 md:p-6">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-1.5 sm:gap-2">
            <CalendarClock className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-amber-500" />
            <span className="truncate">Next Actions</span>
          </CardTitle>
          {/* Toggle */}
          <div className="flex bg-muted/50 rounded-md p-0.5 gap-0.5">
            <button
              onClick={() => setViewMode('business')}
              className={cn(
                'text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 rounded transition-colors font-medium',
                viewMode === 'business' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              Business
            </button>
            <button
              onClick={() => setViewMode('personal')}
              className={cn(
                'text-[9px] sm:text-[10px] px-1.5 sm:px-2 py-0.5 rounded transition-colors font-medium flex items-center gap-0.5',
                viewMode === 'personal' ? 'bg-background text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground'
              )}
            >
              <StickyNote className="h-2.5 w-2.5 sm:h-3 sm:w-3" />
              My Actions
            </button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 sm:space-y-3 p-3 pt-0 sm:p-4 sm:pt-0 md:p-6 md:pt-0">
        {viewMode === 'business' ? (
          <>
            {/* Summary stats */}
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center">
                <div className="text-xl sm:text-2xl md:text-3xl font-bold text-foreground">
                  {trackedLeads.length}
                </div>
                <p className="text-[10px] sm:text-xs text-muted-foreground">Tracked</p>
              </div>
              <div className="text-center relative">
                <div className={`text-xl sm:text-2xl md:text-3xl font-bold ${overdue.length > 0 ? 'text-red-500' : 'text-green-500'}`}>
                  {overdue.length}
                </div>
                {overdue.length > 0 && (
                  <span className="absolute top-0 right-1/4 h-2 w-2 rounded-full bg-red-500 animate-pulse" />
                )}
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
                    {isOverdueItem ? (
                      <AlertTriangle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                    ) : (
                      <Clock className="h-3.5 w-3.5 text-amber-500 shrink-0" />
                    )}
                    <span className="text-sm font-medium break-words leading-tight">{currentLead.business_name}</span>
                    {isOverdueItem && (
                      <span className="h-1.5 w-1.5 rounded-full bg-red-500 shrink-0" />
                    )}
                  </div>
                  <div className="flex items-center justify-between ml-5">
                    <span className="text-xs text-muted-foreground">
                      {getLeadCustomAction(currentLead.id) || ACTION_LABELS[currentLead.next_action || 'none']}
                    </span>
                    <span className={`text-xs font-medium ${isOverdueItem ? 'text-red-500' : 'text-amber-500'}`}>
                      {currentLead.next_action_date ? formatDate(currentLead.next_action_date) : '—'}
                    </span>
                  </div>
                </Link>
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

            {/* Overdue summary */}
            {overdue.length > 0 && (
              <p className="text-[10px] sm:text-xs text-red-500/80 text-center">
                You have {overdue.length} overdue follow-up{overdue.length !== 1 ? 's' : ''}
              </p>
            )}
          </>
        ) : (
          /* Personal actions view */
          <div className="space-y-1 pt-1">
            {personalTop3.length > 0 ? (
              personalTop3.map(action => (
                <div key={action.id} className="flex items-start gap-2 p-2 rounded-md hover:bg-muted/50 transition-colors">
                  <Checkbox
                    checked={false}
                    onCheckedChange={() => toggleComplete(action.id, true)}
                    className="mt-0.5"
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm leading-tight break-words">{action.text}</p>
                    {action.due_date && (
                      <span className={cn(
                        'text-[11px] font-medium mt-0.5 inline-block',
                        isPersonalOverdue(action.due_date) ? 'text-red-500' : 'text-amber-500'
                      )}>
                        {formatPersonalDue(action.due_date)}
                      </span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="text-center py-4">
                <StickyNote className="h-4 w-4 text-muted-foreground/40 mx-auto mb-1" />
                <p className="text-xs text-muted-foreground">No personal actions</p>
              </div>
            )}
            {activeActions.length > 3 && (
              <p className="text-[10px] text-muted-foreground text-center pt-1">
                +{activeActions.length - 3} more
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
