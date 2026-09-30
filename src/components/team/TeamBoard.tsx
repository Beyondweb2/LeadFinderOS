import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { CheckCircle2, ClipboardList, Loader2, Megaphone } from 'lucide-react';
import { Panel, Empty, ago } from '@/components/salesDash/ui';
import { useToast } from '@/hooks/use-toast';
import { useMyTeamBoard } from '@/hooks/useTeamBoard';
import { londonToday } from '@/lib/salesCrm';
import { NEXT_ACTION_LABEL } from '@/lib/nextActionView';
import {
  CANCEL_REASON_LABEL, KIND_LABEL, PRIORITY_LABEL, TASK_STATUS_LABEL, TEMPLATE_CHANNELS,
  boardRefusalText, dueText, isOverdue, itemDueDate, itemTarget, sortBoard, tabOf, unreadCount,
  type BoardItem, type BoardTab,
} from '@/lib/teamBoard';
import { cn } from '@/lib/utils';

/* ══ "YOUR TEAM BOARD" — the salesperson's view (2026-10-01, docs/sales-team-board.md) ═════════════
   What Paul sent this person: work (To do) apart from information (Updates), and what is finished.
   ⛔ Reading an update never completes a task; completing a task never touches the lead (no stage, no
   Next Action, no message) — the server enforces both (team_task_set_status).
   ⛔ A lead assignment shows the LEAD's own Next Action date — one date, edited on the lead.
   ?item=<id> (the notification's link) opens that item's tab, scrolls to it and marks it read. */

const TABS: { key: BoardTab; label: string }[] = [{ key: 'todo', label: 'To do' }, { key: 'updates', label: 'Updates' }, { key: 'completed', label: 'Completed' }];

export function TeamBoard() {
  const b = useMyTeamBoard();
  const { toast } = useToast();
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const linked = params.get('item');
  const today = londonToday();
  const [tab, setTab] = useState<BoardTab>('todo');
  const [touched, setTouched] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const refs = useRef(new Map<string, HTMLLIElement>());

  const by = useMemo(() => {
    const m: Record<BoardTab, BoardItem[]> = { todo: [], updates: [], completed: [] };
    for (const i of b.items) m[tabOf(i)].push(i);
    return { todo: sortBoard(m.todo, 'todo', today), updates: sortBoard(m.updates, 'updates', today), completed: sortBoard(m.completed, 'completed', today) };
  }, [b.items, today]);
  const unread = unreadCount(b.items);
  const overdue = by.todo.filter((i) => isOverdue(i, today)).length;
  const unreadUpdates = by.updates.filter((i) => !i.read_at).length;
  // First visit: open on To do if there is work, else Updates if there is news.
  const shown: BoardTab = touched ? tab : by.todo.length ? 'todo' : unreadUpdates ? 'updates' : tab;

  // A notification's deep link: the item's tab, scrolled into view, marked read. Applied once.
  useEffect(() => {
    if (!linked || !b.isSuccess) return;
    const it = b.items.find((i) => i.id === linked);
    const next = new URLSearchParams(params); next.delete('item'); setParams(next, { replace: true });
    if (!it) { toast({ title: 'That item is no longer on your board' }); return; }
    setTouched(true); setTab(tabOf(it)); setFlash(it.id);
    if (!it.read_at) b.markRead.mutate([it.id]);
    window.setTimeout(() => refs.current.get(it.id)?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 150);
    window.setTimeout(() => setFlash(null), 2500);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [linked, b.isSuccess]);

  const setStatus = async (i: BoardItem, status: 'todo' | 'in_progress' | 'completed') => {
    setBusy(i.id);
    try {
      const r = await b.setStatus.mutateAsync({ id: i.id, status });
      if (!r.ok) { toast({ title: 'Not changed', description: boardRefusalText(r.error), variant: 'destructive' }); return; }
      if (status === 'completed') {
        const d = itemDueDate(i);
        toast({ title: 'Marked completed', description: i.kind === 'lead_assignment' && d ? `The lead's own Next Action (${dueText(d, today)?.toLowerCase()}) is unchanged — update it on the lead if that is done too.` : 'Paul can see it is done.' });
      }
    } finally { setBusy(null); }
  };
  const open = (i: BoardItem) => {
    const t = itemTarget(i); if (!t) return;
    if (!i.read_at) b.markRead.mutate([i.id]);
    navigate(t.path);
  };

  const summary = b.isLoading ? 'Loading…' : [by.todo.length ? `${by.todo.length} to do` : null, overdue ? `${overdue} overdue` : null, unreadUpdates ? `${unreadUpdates} unread` : null].filter(Boolean).join(' · ') || 'Nothing new from Paul';

  return (
    <Panel id="team-board" collapseKey="sales.teamBoard" title="Your team board" icon={Megaphone} tone="blue" summary={summary}
      hint="Updates and tasks from Paul. Your own leads and conversations stay in Outreach and the Inbox."
      action={unread ? <span className="rounded-full bg-blue-500 px-2 py-0.5 text-[11px] font-bold text-white" aria-label={`${unread} unread`}>{unread}</span> : undefined}>
      <div className="mb-3 flex gap-1 rounded-xl bg-muted/60 p-1" role="tablist" aria-label="Team board">
        {TABS.map((t) => {
          const n = t.key === 'updates' ? unreadUpdates : by[t.key].length;
          return (
            <button key={t.key} type="button" role="tab" aria-selected={shown === t.key} onClick={() => { setTouched(true); setTab(t.key); }}
              className={cn('flex-1 rounded-lg px-2 py-1.5 text-xs font-medium transition', shown === t.key ? 'bg-card text-foreground shadow-sm' : 'text-muted-foreground hover:text-foreground')}>
              {t.label}{n ? <span className="ml-1 tabular-nums text-muted-foreground">· {n}{t.key === 'updates' ? ' new' : ''}</span> : null}
            </button>
          );
        })}
      </div>
      {b.isLoading ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading your board…</p>
        : b.isError ? <p className="text-sm text-destructive">Could not load your board. <button type="button" className="underline" onClick={() => void b.refetch()}>Try again</button></p>
        : by[shown].length === 0 ? <Empty icon={shown === 'completed' ? CheckCircle2 : ClipboardList}>{shown === 'todo' ? 'No tasks from Paul right now.' : shown === 'updates' ? 'No updates yet.' : 'Nothing completed yet.'}</Empty>
        : (
          <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60">
            {by[shown].map((i) => (
              <li key={i.id} ref={(el) => { if (el) refs.current.set(i.id, el); else refs.current.delete(i.id); }}
                className={cn('px-3 py-2.5 transition-colors', flash === i.id && 'bg-blue-500/10', !i.read_at && tabOf(i) !== 'completed' && 'border-l-2 border-l-blue-500')}>
                <BoardRow i={i} today={today} busy={busy === i.id} onOpen={() => open(i)} onStatus={(s) => void setStatus(i, s)} onRead={() => b.markRead.mutate([i.id])} />
              </li>
            ))}
          </ul>
        )}
    </Panel>
  );
}

function BoardRow({ i, today, busy, onOpen, onStatus, onRead }: {
  i: BoardItem; today: string; busy: boolean; onOpen: () => void; onStatus: (s: 'todo' | 'in_progress' | 'completed') => void; onRead: () => void;
}) {
  const [more, setMore] = useState(false);
  const task = tabOf(i) !== 'updates';
  const openTask = i.task_status === 'todo' || i.task_status === 'in_progress';
  const due = itemDueDate(i);
  const late = isOverdue(i, today);
  const target = itemTarget(i);
  const d = i.details ?? {};
  const facts: string[] = [];
  if (i.kind === 'targeting') { if (d.category) facts.push(String(d.category)); if (d.location) facts.push(String(d.location)); }
  if (i.kind === 'template_update') {
    const ch = TEMPLATE_CHANNELS.find((c) => c.value === d.channel)?.label;
    if (ch) facts.push(ch);
    if (d.template_label || d.template_name) facts.push(String(d.template_label ?? d.template_name));
  }
  const long = (i.body ?? '').length > 220;
  return (
    <div className="min-w-0">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
        <span className="min-w-0 break-words text-sm font-semibold">{i.kind === 'lead_assignment' ? `Assigned to you: ${i.lead?.mine ? i.lead.name ?? i.title : i.title}` : i.title}</span>
        <span className="text-[11px] text-muted-foreground">
          {KIND_LABEL[i.kind]} · {i.author} · {ago(i.published_at)}{i.edited_at ? ' · edited' : ''}
        </span>
      </div>
      {(facts.length > 0 || i.kind === 'template_update') && (
        <p className="mt-0.5 text-xs text-muted-foreground">
          {facts.join(' · ')}
          {i.kind === 'template_update' && (d.approval === 'approved'
            ? <span className="ml-1.5 font-medium text-emerald-700 dark:text-emerald-300">Approved</span>
            : <span className="ml-1.5 font-medium text-amber-700 dark:text-amber-300">Draft — not approved yet, do not use</span>)}
          {i.kind === 'targeting' && d.priority ? <span className="ml-1.5">· {String(d.priority)} priority</span> : null}
        </p>
      )}
      {i.body && (
        <p className={cn('mt-1 whitespace-pre-wrap break-words text-sm text-foreground/90', !more && long && 'line-clamp-3')}>{i.body}</p>
      )}
      {long && <button type="button" onClick={() => setMore(!more)} className="text-xs text-primary hover:underline">{more ? 'Show less' : 'Show more'}</button>}
      {i.kind === 'lead_assignment' && typeof d.reason === 'string' && <p className="mt-0.5 text-xs text-muted-foreground">Why: {d.reason}</p>}
      {i.lead && !i.lead.mine && <p className="mt-0.5 text-xs text-muted-foreground">This lead is no longer in your list.</p>}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs">
        {task && (
          <span className={cn('font-medium', i.task_status === 'completed' ? 'text-emerald-700 dark:text-emerald-300' : 'text-foreground/80')}>
            {TASK_STATUS_LABEL[i.task_status ?? 'todo']}{i.task_status === 'cancelled' && i.cancelled_reason ? ` · ${CANCEL_REASON_LABEL[i.cancelled_reason] ?? i.cancelled_reason}` : ''}
          </span>
        )}
        {task && openTask && due && <span className={cn(late ? 'font-medium text-red-700 dark:text-red-300' : 'text-muted-foreground')}>{dueText(due, today)}</span>}
        {i.kind === 'lead_assignment' && i.lead?.mine && i.lead.next_action && i.lead.next_action !== 'none' && (
          <span className="text-muted-foreground">Next action: {NEXT_ACTION_LABEL[i.lead.next_action] ?? i.lead.next_action.replace(/_/g, ' ')}</span>
        )}
        {i.priority === 'high' && openTask && <span className="font-medium text-amber-700 dark:text-amber-300">{PRIORITY_LABEL.high} priority</span>}
        <span className="ml-auto flex flex-wrap items-center gap-1.5">
          {target && <button type="button" onClick={onOpen} className="rounded-md border border-border/70 px-2 py-1 font-medium text-primary hover:bg-muted">{target.label}</button>}
          {task && openTask && i.task_status === 'todo' && <button type="button" disabled={busy} onClick={() => onStatus('in_progress')} className="rounded-md border border-border/70 px-2 py-1 font-medium hover:bg-muted disabled:opacity-50">Start</button>}
          {task && openTask && <button type="button" disabled={busy} onClick={() => onStatus('completed')} className="rounded-md bg-emerald-600 px-2 py-1 font-medium text-white hover:bg-emerald-700 disabled:opacity-50">{busy ? '…' : 'Mark done'}</button>}
          {task && i.task_status === 'completed' && <button type="button" disabled={busy} onClick={() => onStatus('in_progress')} className="rounded-md px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-50">Reopen</button>}
          {!task && !i.read_at && <button type="button" onClick={onRead} className="rounded-md px-2 py-1 text-muted-foreground hover:bg-muted hover:text-foreground">Mark read</button>}
        </span>
      </div>
    </div>
  );
}
