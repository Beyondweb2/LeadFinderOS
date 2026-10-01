import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Users } from 'lucide-react';
import { Panel, Empty, ago } from '@/components/salesDash/ui';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { useTeamBoardAdmin, type AdminPost } from '@/hooks/useTeamBoard';
import { londonToday } from '@/lib/salesCrm';
import {
  CANCEL_REASON_LABEL, KIND_LABEL, TASK_STATUS_LABEL, boardRefusalText, dueText, isOpenTask, isTaskKind,
  type TaskStatus, type TeamPostKind,
} from '@/lib/teamBoard';
import { cn } from '@/lib/utils';
import { whatsAppLinkForLead } from '@/lib/salesLinks';
import type { ComposerSeed } from './TeamComposer';

/* ══ THE ADMIN'S VIEW OF WHAT WAS SENT (2026-10-01, docs/sales-team-board.md) ════════════════════════
   Oversight, not a management dashboard: what was sent, who has read it, which tasks are open, overdue
   or done, by person — with the few actions that matter (edit a draft, cancel a task, send a
   clarification, a LABELLED edit of a sent post). No charts, no scores.
   ⛔ A sent post is never silently rewritten: team_edit_published keeps the old words in the trail and
   the recipients see "edited". */

type StatusFilter = 'all' | 'open' | 'overdue' | 'completed' | 'unread' | 'drafts';
const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: 'all', label: 'Everything' }, { value: 'open', label: 'Open tasks' }, { value: 'overdue', label: 'Overdue tasks' },
  { value: 'completed', label: 'Completed tasks' }, { value: 'unread', label: 'Not read yet' }, { value: 'drafts', label: 'Drafts' },
];
type DueFilter = 'any' | 'overdue' | 'week' | 'none';

/** A recipient's working date: the task's own date, or (lead assignment) the lead's Next Action date. */
function postDue(p: AdminPost): string | null {
  if (p.kind === 'lead_assignment') return p.lead?.next_action && p.lead.next_action !== 'none' && p.lead.next_action_date ? p.lead.next_action_date.slice(0, 10) : null;
  return p.due_date ? p.due_date.slice(0, 10) : null;
}

/** onCompose opens the page's one composer (a draft to finish, or a clarification to a sent post). */
export function TeamOversight({ enabled, onCompose }: { enabled: boolean; onCompose: (seed: ComposerSeed) => void }) {
  const a = useTeamBoardAdmin(enabled);
  const { toast } = useToast();
  const today = londonToday();
  const [editing, setEditing] = useState<AdminPost | null>(null);
  const [person, setPerson] = useState('all');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [kind, setKind] = useState<'all' | TeamPostKind>('all');
  const [due, setDue] = useState<DueFilter>('any');
  const in7 = new Date(Date.parse(`${today}T12:00:00Z`) + 7 * 86_400_000).toISOString().slice(0, 10);

  const people = useMemo(() => {
    const m = new Map<string, string>();
    for (const p of a.posts) for (const r of p.recipients) m.set(r.user_id, r.name);
    return [...m].sort((x, y) => x[1].localeCompare(y[1]));
  }, [a.posts]);

  const rows = useMemo(() => a.posts.filter((p) => p.status !== 'discarded').filter((p) => {
    const recs = person === 'all' ? p.recipients : p.recipients.filter((r) => r.user_id === person);
    if (person !== 'all' && recs.length === 0) return false;
    if (kind !== 'all' && p.kind !== kind) return false;
    if (status === 'drafts') return p.status === 'draft';
    if (status !== 'all' && p.status === 'draft') return false;
    const d = postDue(p);
    const open = recs.some((r) => isOpenTask(r.task_status));
    if (status === 'open' && !open) return false;
    if (status === 'overdue' && !(open && d && d < today)) return false;
    if (status === 'completed' && !recs.some((r) => r.task_status === 'completed')) return false;
    if (status === 'unread' && !recs.some((r) => !r.read_at)) return false;
    if (due === 'overdue' && !(open && d && d < today)) return false;
    if (due === 'week' && !(d && d >= today && d <= in7)) return false;
    if (due === 'none' && d) return false;
    return true;
  }), [a.posts, person, kind, status, due, today, in7]);

  const published = a.posts.filter((p) => p.status === 'published');
  const recs = published.flatMap((p) => p.recipients.map((r) => ({ p, r })));
  const openN = recs.filter(({ r }) => isOpenTask(r.task_status)).length;
  const overdueN = recs.filter(({ p, r }) => { const d = postDue(p); return isOpenTask(r.task_status) && !!d && d < today; }).length;
  const unreadN = recs.filter(({ p, r }) => !isTaskKind(p.kind) && !r.read_at).length;
  const drafts = a.posts.filter((p) => p.status === 'draft').length;

  const cancel = async (p: AdminPost, userId: string | null) => {
    if (!window.confirm(`Cancel "${p.title}"${userId ? ` for ${p.recipients.find((r) => r.user_id === userId)?.name}` : ' for everyone'}? Completed work stays completed.`)) return;
    const r = await a.cancel.mutateAsync({ id: p.id, userId });
    if (!r.ok) toast({ title: 'Not cancelled', description: boardRefusalText(r.error), variant: 'destructive' });
    else toast({ title: r.cancelled ? `Cancelled for ${r.cancelled}` : 'Nothing open to cancel' });
  };
  const discard = async (p: AdminPost) => {
    if (!window.confirm(`Discard the draft "${p.title}"? Nobody has seen it.`)) return;
    const r = await a.discard.mutateAsync(p.id);
    if (!r.ok) toast({ title: 'Not discarded', description: boardRefusalText(r.error), variant: 'destructive' });
  };

  return (
    <Panel id="team-oversight" collapseKey="admin.cc.team-board" title="Sales team board" icon={Users} tone="blue"
      hint="What you have sent the team, who has read it, and where each task stands."
      summary={a.isLoading ? 'Loading…' : [openN ? `${openN} open` : null, overdueN ? `${overdueN} overdue` : null, unreadN ? `${unreadN} unread` : null, drafts ? `${drafts} draft${drafts === 1 ? '' : 's'}` : null].filter(Boolean).join(' · ') || 'Nothing outstanding'}>
      <div className="mb-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
        <FilterSelect label="Salesperson" value={person} onChange={setPerson} options={[{ value: 'all', label: 'Everyone' }, ...people.map(([id, n]) => ({ value: id, label: n }))]} />
        <FilterSelect label="Status" value={status} onChange={(v) => setStatus(v as StatusFilter)} options={STATUS_OPTIONS} />
        <FilterSelect label="Type" value={kind} onChange={(v) => setKind(v as 'all' | TeamPostKind)} options={[{ value: 'all', label: 'Any type' }, ...(Object.keys(KIND_LABEL) as TeamPostKind[]).map((k) => ({ value: k, label: KIND_LABEL[k] }))]} />
        <FilterSelect label="Due" value={due} onChange={(v) => setDue(v as DueFilter)} options={[{ value: 'any', label: 'Any date' }, { value: 'overdue', label: 'Overdue' }, { value: 'week', label: 'Next 7 days' }, { value: 'none', label: 'No date' }]} />
      </div>
      {a.isLoading ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading…</p>
        : a.isError ? <p className="text-sm text-destructive">Could not load the team board. <button type="button" className="underline" onClick={() => void a.refetch()}>Try again</button></p>
        : rows.length === 0 ? <Empty>{a.posts.length ? 'Nothing matches these filters.' : 'Nothing sent yet. "Send to sales team" posts an update, a task or a lead with instructions.'}</Empty>
        : (
          <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60">
            {rows.map((p) => {
              const d = postDue(p);
              const shownRecs = person === 'all' ? p.recipients : p.recipients.filter((r) => r.user_id === person);
              const anyOpen = p.recipients.some((r) => isOpenTask(r.task_status));
              return (
                <li key={p.id} className="px-3 py-2.5 text-sm">
                  <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                    <span className="min-w-0 break-words font-semibold">{p.kind === 'lead_assignment' ? `Lead: ${p.lead?.name ?? p.title}` : p.title}</span>
                    <span className="text-[11px] text-muted-foreground">
                      {KIND_LABEL[p.kind]} · {p.status === 'draft' ? `Draft, saved ${ago(p.created_at)}` : `sent ${ago(p.published_at)}`}{p.edited_at ? ` · edited ${p.edit_count}×` : ''}
                      {isTaskKind(p.kind) && d ? ` · ${dueText(d, today)}` : ''}
                    </span>
                  </div>
                  {p.body && <p className="mt-0.5 line-clamp-2 whitespace-pre-wrap break-words text-xs text-muted-foreground">{p.body}</p>}
                  {p.status === 'draft' ? (
                    <p className="mt-1 text-xs text-muted-foreground">To: {p.audience === 'everyone' ? 'Everyone (decided when sent)' : `${p.recipient_ids.length} selected`}</p>
                  ) : (
                    <ul className="mt-1.5 flex flex-wrap gap-1.5">
                      {shownRecs.map((r) => (
                        <li key={r.user_id} className={cn('inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px]', recTone(r.task_status, !!r.read_at, isTaskKind(p.kind) && !!d && d < today))}
                          title={r.task_status === 'cancelled' && r.cancelled_reason ? CANCEL_REASON_LABEL[r.cancelled_reason] ?? r.cancelled_reason : r.completed_at ? `Completed ${ago(r.completed_at)}` : r.read_at ? `Read ${ago(r.read_at)}` : 'Not read yet'}>
                          <span className="font-medium">{r.name}</span>
                          <span>· {r.task_status ? TASK_STATUS_LABEL[r.task_status] + (r.task_status === 'cancelled' && r.cancelled_reason === 'reassigned' ? ' (lead moved)' : '') : r.read_at ? 'Read' : 'Unread'}</span>
                          {isOpenTask(r.task_status) && <button type="button" className="ml-0.5 text-muted-foreground hover:text-foreground" aria-label={`Cancel for ${r.name}`} onClick={() => void cancel(p, r.user_id)}>×</button>}
                        </li>
                      ))}
                    </ul>
                  )}
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
                    {p.lead && <Link to={whatsAppLinkForLead(p.lead.id)} className="text-primary hover:underline">Open the lead</Link>}
                    {p.status === 'draft' && <button type="button" className="text-primary hover:underline" onClick={() => onCompose({ draft: p })}>Edit and send</button>}
                    {p.status === 'draft' && <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => void discard(p)}>Discard</button>}
                    {p.status === 'published' && p.kind !== 'lead_assignment' && <button type="button" className="text-primary hover:underline" onClick={() => setEditing(p)}>Edit (labelled)</button>}
                    {p.status === 'published' && <button type="button" className="text-primary hover:underline" onClick={() => onCompose({ followUpOf: p })}>Send clarification</button>}
                    {p.status === 'published' && anyOpen && p.recipients.length > 1 && <button type="button" className="text-muted-foreground hover:text-foreground" onClick={() => void cancel(p, null)}>Cancel for everyone</button>}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      <EditPublished post={editing} onClose={() => setEditing(null)} onSave={async (x) => {
        const r = await a.edit.mutateAsync(x);
        if (!r.ok) { toast({ title: 'Not saved', description: boardRefusalText(r.error), variant: 'destructive' }); return false; }
        toast({ title: r.unchanged ? 'Nothing changed' : 'Edited', description: r.unchanged ? undefined : 'Marked "edited" for the team; the earlier words are kept in the record.' });
        return true;
      }} />
    </Panel>
  );
}

function recTone(s: TaskStatus | null, read: boolean, late: boolean): string {
  if (s === 'completed') return 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300';
  if (s === 'cancelled') return 'border-border/60 text-muted-foreground line-through decoration-muted-foreground/40';
  if (isOpenTask(s) && late) return 'border-red-500/40 text-red-700 dark:text-red-300';
  if (s === 'in_progress') return 'border-blue-500/40 text-blue-700 dark:text-blue-300';
  if (!s && read) return 'border-border/60 text-muted-foreground';
  return 'border-border/70 text-foreground';
}

function FilterSelect({ label, value, onChange, options }: { label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="h-8 text-xs" aria-label={label}><SelectValue /></SelectTrigger>
      <SelectContent>{options.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
    </Select>
  );
}

function EditPublished({ post, onClose, onSave }: { post: AdminPost | null; onClose: () => void; onSave: (x: { id: string; title: string; body: string | null; due: string | null; priority: AdminPost['priority'] }) => Promise<boolean> }) {
  const [title, setTitle] = useState(''); const [body, setBody] = useState(''); const [due, setDue] = useState(''); const [busy, setBusy] = useState(false);
  const [for_, setFor] = useState<string | null>(null);
  if (post && for_ !== post.id) { setFor(post.id); setTitle(post.title); setBody(post.body ?? ''); setDue(post.due_date ?? ''); }
  return (
    <Dialog open={!!post} onOpenChange={(v) => { if (!v && !busy) { onClose(); setFor(null); } }}>
      <DialogContent className="w-[calc(100vw-2rem)] max-w-lg">
        <DialogHeader>
          <DialogTitle>Edit a sent post</DialogTitle>
          <DialogDescription>The team sees it marked “edited” and gets a notice. The earlier words stay in the record. For anything bigger, send a clarification instead.</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={160} aria-label="Title" />
          <Textarea rows={4} value={body} onChange={(e) => setBody(e.target.value)} maxLength={4000} aria-label="Message" />
          {post?.kind === 'task' && <label className="block text-xs text-muted-foreground">Due<Input type="date" className="mt-0.5 h-9" value={due} onChange={(e) => setDue(e.target.value)} /></label>}
        </div>
        <DialogFooter>
          <Button disabled={busy || !title.trim()} onClick={async () => {
            if (!post) return; setBusy(true);
            try { if (await onSave({ id: post.id, title, body: body.trim() || null, due: post.kind === 'task' ? due || null : null, priority: post.priority })) { onClose(); setFor(null); } } finally { setBusy(false); }
          }}>{busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}Save edit</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
