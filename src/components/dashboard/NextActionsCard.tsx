import { useMemo, useState, type MouseEvent } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarClock, AlertTriangle, Clock, CheckCircle, X } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { NEXT_ACTION_OPTIONS, type OutreachLead, type NextActionType } from '@/types/outreach';
import { getLeadCustomAction } from '@/hooks/useCustomNextActions';
import { useCampaigns } from '@/hooks/useCampaigns';
import { cn } from '@/lib/utils';

interface NextActionsCardProps {
  trackedLeads: OutreachLead[];
  /** Clear a lead's next_action (task) so it drops off the list. The parent does the
   *  DB update + refetch; the card removes the row optimistically in the meantime. */
  onClearTask?: (leadId: string) => void;
}

// Action labels sourced from NEXT_ACTION_OPTIONS so the wording matches the Outreach
// page exactly (e.g. send_draft → "Respond"). getLeadCustomAction still overrides.
const ACTION_LABELS: Record<string, string> = Object.fromEntries(
  NEXT_ACTION_OPTIONS.map((o) => [o.value, o.label]),
);

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

export function NextActionsCard({ trackedLeads, onClearTask }: NextActionsCardProps) {
  const { campaigns } = useCampaigns();
  const navigate = useNavigate();
  const [sortBy, setSortBy] = useState<'due' | 'name' | 'action'>('due');
  // Optimistically hide tasks the user just cleared (before the parent's refetch lands).
  const [clearedIds, setClearedIds] = useState<Set<string>>(new Set());

  const campaignById = useMemo(
    () => Object.fromEntries(campaigns.map((c) => [c.id, c.name])) as Record<string, string>,
    [campaigns],
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const withActions = trackedLeads.filter((l) => l.next_action && l.next_action !== 'none' && !clearedIds.has(l.id));
  const overdue = withActions.filter((l) => l.next_action_date && new Date(l.next_action_date) < today);
  const dueToday = withActions.filter((l) => {
    if (!l.next_action_date) return false;
    const d = new Date(l.next_action_date);
    d.setHours(0, 0, 0, 0);
    return d.getTime() === today.getTime();
  });

  // Sortable list. Default 'due' = soonest first (overdue → today → upcoming; undated
  // last). 'name' = business A–Z. 'action' = grouped by action label, then due date.
  const dueTime = (l: OutreachLead) => (l.next_action_date ? new Date(l.next_action_date).getTime() : Infinity);
  const actionLabelOf = (l: OutreachLead) =>
    getLeadCustomAction(l.id) || ACTION_LABELS[l.next_action || 'none'] || '';
  const sorted = useMemo(() => {
    const arr = [...withActions];
    if (sortBy === 'name') {
      arr.sort((a, b) => (a.business_name || '').localeCompare(b.business_name || ''));
    } else if (sortBy === 'action') {
      arr.sort((a, b) => actionLabelOf(a).localeCompare(actionLabelOf(b)) || dueTime(a) - dueTime(b));
    } else {
      arr.sort((a, b) => dueTime(a) - dueTime(b));
    }
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [withActions, sortBy]);

  const formatDate = (dateStr: string) => {
    const d = new Date(dateStr);
    d.setHours(0, 0, 0, 0);
    if (d.getTime() === today.getTime()) return 'Today';
    if (d < today) return 'Overdue';
    const diff = Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    return diff === 1 ? 'Tomorrow' : `In ${diff}d`;
  };

  const handleJump = (lead: OutreachLead) => {
    const channel = jumpChannel(lead);
    // WhatsApp now routes through the in-app Inbox; everything else opens Outreach.
    if (channel === 'whatsapp') {
      navigate('/inbox', { state: { launch: { leadId: lead.id } } });
      return;
    }
    navigate('/outreach', { state: { launch: { leadId: lead.id, channel } } });
  };

  // Clear this lead's task: hide the row immediately, then let the parent do the DB
  // update + refetch. stopPropagation on the X keeps the row's jump from firing.
  const handleClear = (e: MouseEvent, leadId: string) => {
    e.preventDefault();
    e.stopPropagation();
    setClearedIds((prev) => new Set(prev).add(leadId));
    onClearTask?.(leadId);
  };

  return (
    <Card className="bg-gradient-to-br from-amber-500/10 via-orange-500/5 to-transparent border-amber-500/20">
      <CardHeader className="pb-1 sm:pb-2 p-3 sm:p-4 md:p-6">
        <div className="flex items-center gap-2">
          <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground flex items-center gap-1.5 sm:gap-2">
            <CalendarClock className="h-3.5 w-3.5 sm:h-4 sm:w-4 text-amber-500" />
            <span className="truncate">Next Actions</span>
          </CardTitle>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as 'due' | 'name' | 'action')}>
            <SelectTrigger className="ml-auto h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="due">Due date</SelectItem>
              <SelectItem value="name">Business A–Z</SelectItem>
              <SelectItem value="action">Action type</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 p-3 pt-0 sm:p-4 sm:pt-0 md:p-6 md:pt-0">
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
          <div className="thin-scrollbar max-h-[220px] overflow-y-auto pr-0.5 space-y-0.5 border-t border-border/50 pt-1.5">
            {sorted.map((lead) => {
              const isOver = !!lead.next_action_date && new Date(lead.next_action_date) < today;
              const actionLabel = getLeadCustomAction(lead.id) || ACTION_LABELS[lead.next_action || 'none'] || '—';
              const dueLabel = lead.next_action_date ? formatDate(lead.next_action_date) : null;
              const campaignName = lead.campaign_id ? campaignById[lead.campaign_id] : undefined;
              // Row = flex container; jump area and the X are SIBLINGS (no nested
              // buttons). The whole container highlights on hover.
              return (
                <div
                  key={lead.id}
                  className="group flex items-center gap-1 rounded-md transition-colors hover:bg-muted/50"
                >
                  <button
                    type="button"
                    onClick={() => handleJump(lead)}
                    className="flex-1 min-w-0 rounded-md p-1.5 text-left"
                  >
                    {/* Single compact line: business name (main) + action · due (right). */}
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5">
                        {isOver ? (
                          <AlertTriangle className="h-3 w-3 shrink-0 text-red-500" />
                        ) : (
                          <Clock className="h-3 w-3 shrink-0 text-amber-500" />
                        )}
                        <span className="truncate text-sm font-medium">{lead.business_name}</span>
                        {campaignName && (
                          <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[9px] text-muted-foreground/70">{campaignName}</span>
                        )}
                      </span>
                      <span className="shrink-0 text-[11px]">
                        <span className="text-muted-foreground">{actionLabel}</span>
                        {dueLabel && (
                          <>
                            {' · '}
                            <span className={cn('font-medium', isOver ? 'text-red-500' : dueLabel === 'Today' ? 'text-amber-500' : 'text-muted-foreground')}>
                              {dueLabel}
                            </span>
                          </>
                        )}
                      </span>
                    </div>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => handleClear(e, lead.id)}
                    title="Clear task"
                    aria-label="Clear task"
                    className="shrink-0 mr-1 rounded p-1 text-muted-foreground/40 transition-colors hover:text-red-500 hover:bg-red-500/10"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="border-t border-border/50 pt-4 pb-2 text-center">
            <CheckCircle className="mx-auto mb-1 h-4 w-4 text-green-500" />
            <p className="text-xs text-muted-foreground">All caught up!</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
