import { memo, useState } from 'react';
import { Clock, Loader2, Pencil, XCircle, AlertTriangle, CheckCircle2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogFooter, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';
import {
  hhmm, scheduledEditable, scheduledLine, scheduledReleasable, type ReplyHours, type ScheduledSendRow,
} from '@/lib/inboxSendWindow';
import type { SendWindow } from '@/lib/sendWindow';

/* The Inbox send window's pieces of screen (src/lib/inboxSendWindow.ts): the header chip ("Their time 21:40 · opens 07:00"), a queued
   message in the thread (edit / cancel until it goes; a held one says why and is a Needs you), and the admin's one reply-hours setting. */

export const ReplyWindowChip = memo(function ReplyWindowChip({ open, text, onClick, className }: { open: boolean; text: string; onClick?: () => void; className?: string }) {
  const cls = cn('flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold',
    open ? 'bg-muted text-muted-foreground' : 'bg-sky-500/15 text-sky-700 dark:text-sky-300', className);
  const inner = <><Clock className="h-3 w-3" /> {text}</>;
  return onClick
    ? <button type="button" onClick={onClick} className={cn(cls, 'hover:ring-1 hover:ring-border')} title="Their local time and send hours (admin: change the reply hours)" data-testid="reply-window-status">{inner}</button>
    : <span className={cls} title="Their local time and send hours" data-testid="reply-window-status">{inner}</span>;
});

export function ScheduledSendBubble({ row, label, onEdit, onCancel, onRelease }: {
  row: ScheduledSendRow;
  /** What the thread shows for a template / voice note (the free text is row.body). */
  label: string;
  onEdit: (id: string, body: string) => Promise<{ ok: boolean; error?: string }>;
  onCancel: (id: string) => Promise<{ ok: boolean; error?: string }>;
  onRelease: (id: string) => Promise<{ ok: boolean; error?: string }>;
}) {
  const [editing, setEditing] = useState(false);
  const [text, setText] = useState(row.body ?? '');
  const [busy, setBusy] = useState<null | 'save' | 'cancel' | 'release'>(null);
  const [err, setErr] = useState<string | null>(null);
  const held = row.status === 'held';
  const closed = row.status === 'cancelled' || row.status === 'failed';
  const run = async (kind: 'save' | 'cancel' | 'release', fn: () => Promise<{ ok: boolean; error?: string }>) => {
    setBusy(kind); setErr(null);
    try { const r = await fn(); if (!r.ok) setErr(r.error === 'not_open' ? 'It has already been sent or closed.' : (r.error ?? 'Could not save.')); else if (kind === 'save') setEditing(false); }
    finally { setBusy(null); }
  };
  return (
    <div className="flex justify-end" data-testid="scheduled-send" data-status={row.status}>
      <div className={cn('max-w-[78%] rounded-2xl border-2 border-dashed px-3 py-2 text-sm',
        held ? 'border-amber-500/60 bg-amber-500/10' : closed ? 'border-border bg-muted/40 text-muted-foreground' : 'border-primary/50 bg-primary/10')}>
        {editing ? (
          <div className="space-y-1.5">
            <Textarea value={text} onChange={(e) => setText(e.target.value)} className="min-h-[60px] text-sm" maxLength={row.channel === 'sms' ? 600 : 4000} />
            <div className="flex justify-end gap-1.5">
              <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { setEditing(false); setText(row.body ?? ''); }} disabled={!!busy}>Keep as it was</Button>
              <Button size="sm" className="h-7 text-xs" disabled={!!busy || !text.trim()} onClick={() => void run('save', () => onEdit(row.id, text))}>
                {busy === 'save' && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} Save
              </Button>
            </div>
          </div>
        ) : (
          <p className="whitespace-pre-wrap break-words">{row.kind === 'text' ? row.body : label}</p>
        )}
        <div className={cn('mt-1 flex flex-wrap items-center gap-1 text-[11px] font-medium',
          held ? 'text-amber-700 dark:text-amber-300' : closed ? 'text-muted-foreground' : 'text-primary')}>
          {held ? <AlertTriangle className="h-3 w-3" /> : closed ? <XCircle className="h-3 w-3" /> : <Clock className="h-3 w-3" />}
          <span data-testid="scheduled-line">{scheduledLine(row)}</span>
        </div>
        {!editing && !closed && (
          <div className="mt-1.5 flex flex-wrap justify-end gap-1">
            {scheduledReleasable(row) && (
              <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" disabled={!!busy} onClick={() => void run('release', () => onRelease(row.id))}
                title="You have read their new message and it should still go (at their send hours)">
                {busy === 'release' ? <Loader2 className="h-3 w-3 animate-spin" /> : <CheckCircle2 className="h-3 w-3" />} Checked — send it
              </Button>
            )}
            {scheduledEditable(row) && (
              <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" disabled={!!busy} onClick={() => { setText(row.body ?? ''); setEditing(true); }}>
                <Pencil className="h-3 w-3" /> Edit
              </Button>
            )}
            <Button size="sm" variant="outline" className="h-7 gap-1 text-xs" disabled={!!busy} onClick={() => void run('cancel', () => onCancel(row.id))}>
              {busy === 'cancel' ? <Loader2 className="h-3 w-3 animate-spin" /> : <XCircle className="h-3 w-3" />} Cancel
            </Button>
          </div>
        )}
        {err && <p className="mt-1 text-[11px] text-destructive" role="alert">{err}</p>}
      </div>
    </div>
  );
}

const toMin = (v: string): number | null => { const m = /^(\d{1,2}):(\d{2})$/.exec(v.trim()); if (!m) return null; const h = Number(m[1]); const mm = Number(m[2]); return h <= 24 && mm < 60 ? h * 60 + mm : null; };

/** Admin only: the ONE reply-hours setting. Blank = the outreach hours (the default). */
export function ReplyHoursDialog({ open, onOpenChange, current, outreach, onSave }: {
  open: boolean; onOpenChange: (v: boolean) => void; current: ReplyHours | null; outreach: SendWindow;
  onSave: (start: number | null, end: number | null) => Promise<void>;
}) {
  const [start, setStart] = useState(current?.startMin != null ? hhmm(current.startMin) : '');
  const [end, setEnd] = useState(current?.endMin != null ? hhmm(current.endMin) : '');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const save = async (s: number | null, e: number | null) => {
    setBusy(true); setErr(null);
    try { await onSave(s, e); onOpenChange(false); } catch (x) { setErr((x as Error).message); } finally { setBusy(false); }
  };
  const s = toMin(start); const e = toMin(end);
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogTitle className="text-sm font-semibold">Inbox reply hours</DialogTitle>
        <p className="text-xs text-muted-foreground">
          Every Inbox message outside these hours (their local time) is queued and sent when they open. Blank uses the outreach hours
          ({hhmm(outreach.startMin)}–{hhmm(outreach.endMin)} for this number).
        </p>
        <div className="flex items-center gap-2">
          <Input value={start} onChange={(x) => setStart(x.target.value)} placeholder={hhmm(outreach.startMin)} className="h-8 w-24" aria-label="Reply hours start" />
          <span className="text-xs text-muted-foreground">to</span>
          <Input value={end} onChange={(x) => setEnd(x.target.value)} placeholder={hhmm(outreach.endMin)} className="h-8 w-24" aria-label="Reply hours end" />
        </div>
        {err && <p className="text-[11px] text-destructive">{err}</p>}
        <DialogFooter className="gap-2">
          <Button variant="ghost" size="sm" disabled={busy} onClick={() => void save(null, null)}>Use the outreach hours</Button>
          <Button size="sm" disabled={busy || s === null || e === null || s >= e} onClick={() => void save(s, e)}>
            {busy && <Loader2 className="mr-1 h-3 w-3 animate-spin" />} Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
