import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { CalendarClock, AlertTriangle, Clock, CheckCircle, StickyNote } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { OutreachLead, NextActionType } from '@/types/outreach';
import { getLeadCustomAction } from '@/hooks/useCustomNextActions';
import { usePersonalActions } from '@/hooks/usePersonalActions';
import { useCampaigns } from '@/hooks/useCampaigns';
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
  '2nd_follow_up': '2nd Follow Up',
  check_3_day_removal: '3-Day Check',
  none: 'None',
};

// Actions that mean "send the prospect a message" → jump to that lead's contact
// composer at the template step (when the channel supports a per-lead composer).
const MESSAGING_ACTIONS = new Set<NextActionType>([
  'follow_up', 'send_follow_up', '2nd_follow_up', 'send_initial_text', 'send_voice_note',
]);

/** Where a next-action row jumps to. Messaging actions open the lead's sms/whatsapp/
 *  call composer at template selection; everything else (incl. email/messenger leads
 *  with no per-lead composer, and non-messaging actions) just opens the lead. */
function jumpChannel(lead: OutreachLead): 'sms' | 'whatsapp' | 'call' | 'open' {
  const action = lead.next_action as NextActionType | null;
  const cm = lead.contact_method;
  if (action === 'call') return 'call';
  if (action && MESSAGING_ACTIONS.has(action)) {
    if (cm === 'sms' || cm === 'whatsapp' || cm === 'call') return cm;
    return 'open';
  }
  return 'open';
}

type ViewMode = 'business' | 'personal';

export function NextActionsCard({ trackedLeads }: NextActionsCardProps) {
  const [viewMode, setViewMode] = useState<ViewMode>('business');
  const { activeActions, toggleComplete } = usePersonalActions();
  const { campaigns } = useCampaigns();
  const navigate = useNavigate();

  const campaignById = useMemo(
    () => Object.fromEntries(campaigns.map((c) => [c.id, c.name])) as Record<string, string>,
    [campaigns],
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const withActions = trackedLeads.filter((l) => l.next_action && l.next_action !== 'none');
  const overdue = withActions.filter((l) => l.next_action_date && new Date(l.next_action_date) < today);
  const dueToday = withActions.filter((l) => {
    if (!l.next_action_date) return false;
    const d = new Date(l.next_action_date);
    d.setHours(0, 0, 0, 0);
    return d.getTime() === today.getTime();
  });

  // Soonest due first (overdue → today → upcoming); undated leads last.
  const sorted = useMemo(() => {
    return [...withActions].sort((a, b) => {
      const da = a.next_action_date ? new Date(a.next_action_date).getTime() : Infinity;
      const db = b.next_action_date ? new Date(b.next_action_date).getTime() : Infinity;
      return da - db;
    });
  }, [withActions]);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    d.setHours(0, 0, 0, 0);
    if (d.getTime() === today.getTime()) return 'Today';
    if (d < today) return 'Overdue';
    const diff = Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diff === 1 ? 'Tomorrow' : `In ${diff}d`;
  };

  const formatPersonalDue = (dateStr: string) => formatDate(dateStr.includes('T') ? dateStr : dateStr + 'T00:00:00');
  const isPersonalOverdue = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    d.setHours(0, 0, 0, 0);
    return d < today;
  };

  const handleJump = (lead: OutreachLead) => {
    navigate('/outreach', { state: { launch: { leadId: lead.id, channel: jumpChannel(lead) } } });
  };

  const personalTop = activeActions;

  return (
    <Card className="bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-transparent border-amber-500/20">
      <CardHeader className="pb-1 sm:pb-2 p-3 sm:p-4 md:p-6">
        <div className="flex items-center justify-between">
          <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-1.5 sm:gap-2">
            <CalendarClock className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-amber-500" />
            <span className="truncate">Next Actions</span>
          </CardTitle>
          <button
            onClick={() => setViewMode((v) => (v === 'business' ? 'personal' : 'business'))}
            className="text-[9px] sm:text-[10px] px-2 py-0.5 rounded bg-muted/50 text-muted-foreground hover:text-foreground transition-colors font-medium flex items-center gap-1"
          >
            {viewMode === 'business' ? (
              <><StickyNote className="h-2.5 w-2.5 sm:h-3 sm:w-3" /> My Actions</>
            ) : (
              <><CalendarClock className="h-2.5 w-2.5 sm:h-3 sm:w-3" /> Business</>
            )}
          </button>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 p-3 pt-0 sm:p-4 sm:pt-0 md:p-6 md:pt-0">
        {viewMode === 'business' ? (
          <>
            {/* Compact count summary */}
            {withActions.length > 0 && (
              <div className="flex items-center gap-2 text-[11px] sm:text-xs">
                <span className={overdue.length > 0 ? 'text-red-500 font-semibold' : 'text-muted-foreground'}>
                  {overdue.length} overdue
                </span>
                <span className="text-muted-foreground/40">·</span>
                <span className="text-amber-500 font-semibold">{dueToday.length} due today</span>
              </div>
            )}

            {/* Ordered, scrollable list — soonest due first; click to jump */}
            {sorted.length > 0 ? (
              <div className="max-h-[260px] overflow-y-auto pr-0.5 space-y-0.5 border-t border-border/50 pt-1.5">
                {sorted.map((lead) => {
                  const isOver = !!lead.next_action_date && new Date(lead.next_action_date) < today;
                  const actionLabel = getLeadCustomAction(lead.id) || ACTION_LABELS[lead.next_action || 'none'] || '—';
                  const campaignName = lead.campaign_id ? campaignById[lead.campaign_id] : undefined;
                  return (
                    <button
                      key={lead.id}
                      type="button"
                      onClick={() => handleJump(lead)}
                      className="w-full rounded-md p-2 text-left transition-colors hover:bg-muted/50"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex items-center gap-1.5 truncate text-sm font-medium">
                          {isOver ? (
                            <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-500" />
                          ) : (
                            <Clock className="h-3.5 w-3.5 shrink-0 text-amber-500" />
                          )}
                          <span className="truncate">{actionLabel}</span>
                        </span>
                        <span className={cn('shrink-0 text-[11px] font-medium', isOver ? 'text-red-500' : 'text-amber-500')}>
                          {lead.next_action_date ? formatDate(lead.next_action_date) : '—'}
                        </span>
                      </div>
                      <div className="ml-5 mt-0.5 flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
                        <span className="truncate">{lead.business_name}</span>
                        {campaignName && (
                          <>
                            <span className="opacity-40">·</span>
                            <span className="truncate text-[11px] opacity-80">{campaignName}</span>
                          </>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            ) : (
              <div className="border-t border-border/50 pt-4 pb-2 text-center">
                <CheckCircle className="mx-auto mb-1 h-4 w-4 text-green-500" />
                <p className="text-xs text-muted-foreground">All caught up!</p>
              </div>
            )}
          </>
        ) : (
          /* Personal actions view */
          <div className="max-h-[260px] space-y-0.5 overflow-y-auto pt-1">
            {personalTop.length > 0 ? (
              personalTop.map((action) => (
                <div key={action.id} className="flex items-start gap-1.5 rounded px-1.5 py-1 transition-colors hover:bg-muted/50">
                  <Checkbox checked={false} onCheckedChange={() => toggleComplete(action.id, true)} className="mt-0.5 h-3.5 w-3.5" />
                  <div className="min-w-0 flex-1">
                    <p className="break-words text-xs leading-tight">{action.text}</p>
                    {action.due_date && (
                      <span className={cn('mt-0.5 inline-block text-[10px] font-medium', isPersonalOverdue(action.due_date) ? 'text-red-500' : 'text-amber-500')}>
                        {formatPersonalDue(action.due_date)}
                      </span>
                    )}
                  </div>
                </div>
              ))
            ) : (
              <div className="py-3 text-center">
                <StickyNote className="mx-auto mb-1 h-3.5 w-3.5 text-muted-foreground/40" />
                <p className="text-[10px] text-muted-foreground">No personal actions</p>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
