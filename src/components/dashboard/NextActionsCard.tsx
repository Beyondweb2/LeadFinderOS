import { useMemo, useState, type MouseEvent } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarClock, CheckCircle, X, PackageCheck, MessageSquare, HandCoins, ListTodo, Tag, Receipt, Eraser, Archive } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
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
  /** Clear EVERY stored next_action on the operator's leads at once (2026-09-13). Resolves to
   *  how many rows changed, so the toast can say it. */
  onClearAll?: () => Promise<number>;
  /** DISMISS a derived task (reply / chase / quoted) by marking the lead `closed` — the only
   *  honest way to make a derived row go away, because it is derived from evidence (their last
   *  message, their unpaid submission) that does not change by pressing a button. Confirmed first:
   *  closed is a DEAD status (dashboardTasks.ts) and takes the lead out of the Inbox's default view. */
  onDismiss?: (leadId: string) => Promise<void>;
}

const KIND_ICON: Record<TaskKind, typeof MessageSquare> = {
  deliver: PackageCheck,
  chase: HandCoins,
  quoted: Receipt,
  reply: MessageSquare,
  manual: ListTodo,
  fix_trades: Tag,
};

/* Colour carries urgency, so the eye lands on money before admin. */
const KIND_COLOUR: Record<TaskKind, string> = {
  deliver: 'text-red-500',
  chase: 'text-amber-500',
  quoted: 'text-orange-500',
  reply: 'text-sky-500',
  manual: 'text-muted-foreground',
  fix_trades: 'text-muted-foreground/70',
};

export function NextActionsCard({ tasks, onClearTask, onClearAll, onDismiss }: NextActionsCardProps) {
  const { campaigns } = useCampaigns();
  const navigate = useNavigate();
  const [sortBy, setSortBy] = useState<'priority' | 'name'>('priority');
  // Optimistically hide a manual task the user just cleared, until the parent's refetch lands.
  const [clearedIds, setClearedIds] = useState<Set<string>>(new Set());
  // Derived rows the user dismissed (lead marked closed) — hidden until the refetch drops them.
  const [dismissedIds, setDismissedIds] = useState<Set<string>>(new Set());
  const [pendingDismiss, setPendingDismiss] = useState<DashTask | null>(null);
  const [clearingAll, setClearingAll] = useState(false);
  const [clearedAllNote, setClearedAllNote] = useState<string | null>(null);

  const runClearAll = async () => {
    if (!onClearAll || clearingAll) return;
    setClearingAll(true);
    try {
      const n = await onClearAll();
      setClearedAllNote(n === 0 ? 'No stored tasks to clear.' : `Cleared ${n} stored task${n === 1 ? '' : 's'}.`);
    } finally {
      setClearingAll(false);
    }
  };

  const runDismiss = async () => {
    const t = pendingDismiss;
    setPendingDismiss(null);
    if (!t?.leadId || !onDismiss) return;
    setDismissedIds((prev) => new Set(prev).add(t.leadId as string));
    await onDismiss(t.leadId);
  };

  const campaignById = useMemo(
    () => Object.fromEntries(campaigns.map((c) => [c.id, c.name])) as Record<string, string>,
    [campaigns],
  );

  /* A cleared manual task hides immediately; the derived tasks on that same lead stay, because
     clearing a note you wrote does not mean their unanswered message went away. */
  const visible = useMemo(
    () => tasks.filter((t) => !(t.clearable && t.leadId && clearedIds.has(t.leadId)) && !(t.leadId && dismissedIds.has(t.leadId))),
    [tasks, clearedIds, dismissedIds],
  );
  const storedCount = useMemo(() => tasks.filter((t) => t.clearable).length, [tasks]);

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
  const urgent = leadTasks.filter((t) => t.kind === 'deliver' || t.kind === 'chase' || t.kind === 'quoted').length;

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
    <>
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
          {/* Bulk clear of STORED tasks only (2026-09-13). Derived rows are evidence, not tasks;
              they are dismissed one at a time by closing the lead (the X on each row). */}
          {onClearAll && (
            <Button size="sm" variant="outline" className="h-8 text-xs" onClick={() => void runClearAll()} disabled={clearingAll}
              title="Set every stored next action on your leads back to none. Derived rows (replies, chases) are not affected.">
              <Eraser className="mr-1 h-3.5 w-3.5" /> {clearingAll ? 'Clearing…' : `Clear all stored tasks${storedCount ? ` (${storedCount})` : ''}`}
            </Button>
          )}
        </div>
        {clearedAllNote && <p className="mt-1 text-[11px] text-muted-foreground">{clearedAllNote}</p>}
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
                  ) : task.leadId && onDismiss && task.kind !== 'deliver' ? (
                    /* DISMISS a derived row = mark the lead closed, after a confirm. Not offered on
                       "Deliver" — a paying client with no baseline is never dismissed, it is fixed. */
                    <button
                      type="button"
                      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setPendingDismiss(task); }}
                      title="Dismiss: mark this lead closed"
                      aria-label="Dismiss: mark this lead closed"
                      className="shrink-0 mr-1 rounded p-1 text-muted-foreground/40 transition-colors hover:text-red-500 hover:bg-red-500/10"
                    >
                      <Archive className="h-3.5 w-3.5" />
                    </button>
                  ) : (
                    // Keeps the rows aligned.
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
    <AlertDialog open={!!pendingDismiss} onOpenChange={(o) => { if (!o) setPendingDismiss(null); }}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>Dismiss {pendingDismiss?.business || 'this lead'}?</AlertDialogTitle>
          <AlertDialogDescription>
            This marks the lead <b>closed</b>. The row goes because the lead is closed, not because the
            {' '}{pendingDismiss?.kind === 'reply' ? 'unanswered reply' : pendingDismiss?.kind === 'chase' ? 'unpaid submission' : 'quiet quote'} went away.
            A closed lead leaves the Inbox&rsquo;s default view and is never chased again. You can reopen it from the lead card.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Keep it</AlertDialogCancel>
          <AlertDialogAction onClick={() => void runDismiss()}>Mark closed</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
    </>
  );
}
