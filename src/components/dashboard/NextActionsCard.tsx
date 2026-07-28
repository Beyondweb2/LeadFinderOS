import { useMemo, useState, type MouseEvent } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarClock, CheckCircle, X, PackageCheck, MessageSquare, HandCoins, ListTodo, Tag } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useCampaigns } from '@/hooks/useCampaigns';
import { getLeadCustomAction } from '@/hooks/useCustomNextActions';
import type { DashTask, TaskKind } from '@/lib/dashboardTasks';

interface NextActionsCardProps {
  /** Worked out live by lib/dashboardTasks.ts — NOT the stored next_action field. A task
   *  disappears when the thing it asks for is done, without anyone clearing it. */
  tasks: DashTask[];
  /** Clear a lead's stored next_action. Only offered on tasks where something is actually
   *  stored (task.clearable) — a derived task has nothing to clear, so it has no X. */
  onClearTask?: (leadId: string) => void;
}

const KIND_ICON: Record<TaskKind, typeof MessageSquare> = {
  deliver: PackageCheck,
  chase: HandCoins,
  reply: MessageSquare,
  manual: ListTodo,
  fix_trades: Tag,
};

/* Colour carries urgency, so the eye lands on money before admin. */
const KIND_COLOUR: Record<TaskKind, string> = {
  deliver: 'text-red-500',
  chase: 'text-amber-500',
  reply: 'text-sky-500',
  manual: 'text-muted-foreground',
  fix_trades: 'text-muted-foreground/70',
};

export function NextActionsCard({ tasks, onClearTask }: NextActionsCardProps) {
  const { campaigns } = useCampaigns();
  const navigate = useNavigate();
  const [sortBy, setSortBy] = useState<'priority' | 'name'>('priority');
  // Optimistically hide a manual task the user just cleared, until the parent's refetch lands.
  const [clearedIds, setClearedIds] = useState<Set<string>>(new Set());

  const campaignById = useMemo(
    () => Object.fromEntries(campaigns.map((c) => [c.id, c.name])) as Record<string, string>,
    [campaigns],
  );

  /* A cleared manual task hides immediately; the derived tasks on that same lead stay, because
     clearing a note you wrote does not mean their unanswered message went away. */
  const visible = useMemo(
    () => tasks.filter((t) => !(t.clearable && t.leadId && clearedIds.has(t.leadId))),
    [tasks, clearedIds],
  );

  const sorted = useMemo(() => {
    if (sortBy !== 'name') return visible; // already priority-ordered by the derivation
    // The aggregate row has no business name, so it stays last rather than sorting to the top.
    return [...visible].sort((a, b) => {
      if (!a.business !== !b.business) return a.business ? -1 : 1;
      return a.business.localeCompare(b.business);
    });
  }, [visible, sortBy]);

  // Summary counts the work on real businesses. The aggregate row is admin, not a task each.
  const leadTasks = visible.filter((t) => t.kind !== 'fix_trades');
  const urgent = leadTasks.filter((t) => t.kind === 'deliver' || t.kind === 'chase').length;

  const handleJump = (task: DashTask) => {
    if (!task.leadId) return; // aggregate row: nowhere single to go
    if (task.jump === 'whatsapp') {
      navigate('/inbox', { state: { launch: { leadId: task.leadId } } });
      return;
    }
    navigate('/outreach', { state: { launch: { leadId: task.leadId, channel: task.jump } } });
  };

  // stopPropagation keeps the row's jump from firing when the X is pressed.
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
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as 'priority' | 'name')}>
            <SelectTrigger className="ml-auto h-8 w-[130px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="priority">Most urgent</SelectItem>
              <SelectItem value="name">Business A–Z</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </CardHeader>
      <CardContent className="space-y-2 p-3 pt-0 sm:p-4 sm:pt-0 md:p-6 md:pt-0">
        {leadTasks.length > 0 && (
          <div className="flex items-center gap-2 text-[11px] sm:text-xs">
            <span className={urgent > 0 ? 'text-red-500 font-semibold' : 'text-muted-foreground'}>
              {urgent} about money
            </span>
            <span className="text-muted-foreground/40">·</span>
            <span className="text-muted-foreground">{leadTasks.length} to do</span>
          </div>
        )}

        {sorted.length > 0 ? (
          <div className="thin-scrollbar max-h-[220px] overflow-y-auto pr-0.5 space-y-0.5 border-t border-border/50 pt-1.5">
            {sorted.map((task) => {
              const Icon = KIND_ICON[task.kind];
              const campaignName = task.campaignId ? campaignById[task.campaignId] : undefined;
              // A hand-picked custom action name beats the generic "Your task" label.
              const label = (task.kind === 'manual' && task.leadId && getLeadCustomAction(task.leadId)) || task.label;
              // Row = flex container; the jump area and the X are SIBLINGS (no nested buttons).
              return (
                <div key={task.key} className="group flex items-center gap-1 rounded-md transition-colors hover:bg-muted/50">
                  <button
                    type="button"
                    onClick={() => handleJump(task)}
                    disabled={!task.leadId}
                    className="flex-1 min-w-0 rounded-md p-1.5 text-left disabled:cursor-default"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="flex min-w-0 items-center gap-1.5">
                        <Icon className={`h-3 w-3 shrink-0 ${KIND_COLOUR[task.kind]}`} />
                        {/* The reason IS the line: it names the business and says why it matters. */}
                        <span className="truncate text-sm" title={task.reason}>{task.reason}</span>
                        {campaignName && (
                          <span className="shrink-0 rounded bg-muted px-1 py-0.5 text-[9px] text-muted-foreground/70">{campaignName}</span>
                        )}
                      </span>
                      <span className="shrink-0 text-[11px] text-muted-foreground">{label}</span>
                    </div>
                  </button>
                  {task.clearable && task.leadId ? (
                    <button
                      type="button"
                      onClick={(e) => handleClear(e, task.leadId as string)}
                      title="Clear task"
                      aria-label="Clear task"
                      className="shrink-0 mr-1 rounded p-1 text-muted-foreground/40 transition-colors hover:text-red-500 hover:bg-red-500/10"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    // Keeps the derived rows aligned with the clearable ones.
                    <span className="shrink-0 mr-1 w-[26px]" aria-hidden="true" />
                  )}
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
