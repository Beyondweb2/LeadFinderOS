/* THE ADMIN HOME'S "WHAT NEEDS YOU" (Concept A, Paul 2026-10-26). Rows come from src/lib/needsMe.ts (one per business,
   most urgent first, no replies). Same look as the old Your actions list (dot, business, time since, why, action).
   ⛔ The send button sends ONLY through sendWhatsAppRequest (the one browser send → send-whatsapp-message), via 'lead_panel'
   so the lead's send hours apply (queued outside them). Opt-outs, the 24-hour window, one-per-lead and Meta's rules are the
   server's. templateGate decides if the button is live; a proposed template stays disabled.
   ⛔ Snooze / dismiss / archive write a mark (admin_home_marks); nothing is deleted, every archive has an undo. */
import { useState } from 'react';
import { AlertTriangle, Archive, ArrowRight, Clock, Loader2, MoreHorizontal, RotateCcw, Send, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { cn } from '@/lib/utils';
import { Panel, TONE, type Tone } from '@/components/salesDash/ui';
import { sendWhatsAppRequest } from '@/lib/whatsAppSendRequest';
import { questionnaireFollowupBody } from '@/lib/questionnaireFollowup';
import { NEEDS_TEMPLATES, templateGate } from '@/lib/needsMeTemplates';
import { LOST_REASONS, sinceLabel, type MarkAction, type NeedsGroup, type NeedsMark, type NeedsRow } from '@/lib/needsMe';
import { ADMIN_HOME_NEEDS_KEY, snoozeUntil } from '@/hooks/useAdminHome';
import { attentionAssignable } from '@/lib/teamBoard';
import type { AttentionItem } from '@/lib/adminMetrics';

const GROUPS: { g: NeedsGroup; label: string; tone: Tone }[] = [
  { g: 'urgent', label: 'Urgent', tone: 'red' }, { g: 'today', label: 'Today', tone: 'amber' }, { g: 'waiting', label: 'Waiting on them', tone: 'grey' },
];
const KIND_TONE: Record<NeedsRow['kind'], Tone> = { questionnaire: 'red', payment: 'red', interested: 'amber', follow_up: 'blue', new_client: 'green', client_step: 'purple', other: 'grey' };

export type MarkFn = (itemKey: string, action: MarkAction, until?: string | null) => Promise<void>;

/** Snooze / Dismiss / Archive, the same three on every row and card. */
export function MarkButtons({ itemKey, onMark, compact = false }: { itemKey: string; onMark: MarkFn; compact?: boolean }) {
  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full" title="Snooze" aria-label="Snooze"><Clock className="h-4 w-4" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>Snooze until</DropdownMenuLabel>
          <DropdownMenuItem onClick={() => void onMark(itemKey, 'snooze', snoozeUntil('3h'))}>In 3 hours</DropdownMenuItem>
          <DropdownMenuItem onClick={() => void onMark(itemKey, 'snooze', snoozeUntil('tomorrow'))}>Tomorrow morning</DropdownMenuItem>
          <DropdownMenuItem onClick={() => void onMark(itemKey, 'snooze', snoozeUntil('3d'))}>In 3 days</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {!compact && <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full" title="Dismiss until something changes" aria-label="Dismiss" onClick={() => void onMark(itemKey, 'dismiss')}><X className="h-4 w-4" /></Button>}
      <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full" title="Archive (undo any time)" aria-label="Archive" onClick={() => void onMark(itemKey, 'archive')}><Archive className="h-4 w-4" /></Button>
    </>
  );
}

/** The … menu a card carries: the same snooze / dismiss / archive, for the whole card. */
export function CardMarkMenu({ itemKey, onMark }: { itemKey: string; onMark: MarkFn }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button size="icon" variant="ghost" className="h-8 w-8 rounded-full" aria-label="Card options"><MoreHorizontal className="h-4 w-4" /></Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuItem onClick={() => void onMark(itemKey, 'snooze', snoozeUntil('tomorrow'))}><Clock className="mr-2 h-4 w-4" />Snooze until tomorrow</DropdownMenuItem>
        <DropdownMenuItem onClick={() => void onMark(itemKey, 'dismiss')}><X className="mr-2 h-4 w-4" />Dismiss</DropdownMenuItem>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={() => void onMark(itemKey, 'archive')}><Archive className="mr-2 h-4 w-4" />Archive</DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SendButton({ row, approvals }: { row: NeedsRow; approvals: readonly string[] }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!row.template) return null;
  const t = NEEDS_TEMPLATES[row.template];
  const needsName = row.template === 'questionnaire_followup' && !row.firstName;
  const gate = needsName ? { ok: false as const, reason: "Add the owner's first name on the lead first" }
    : templateGate(row.template, { approvals, prospectOnly: !!row.prospectOnly, hasPhone: !!row.phone, alreadySent: row.alreadySent });
  const preview = row.template === 'questionnaire_followup' ? questionnaireFollowupBody(row.firstName ?? '', row.business) : t.body.replace('{{1}}', row.firstName ?? 'there');
  const send = async () => {
    setBusy(true);
    const r = await sendWhatsAppRequest(supabase, { phone: row.phone ?? '', leadId: row.leadId, country: row.country ?? null, templateName: row.template!, via: 'lead_panel' });
    setBusy(false); setOpen(false);
    if (!r.ok) { toast({ title: 'Not sent', description: r.reason ?? r.error ?? 'The sender refused it.', variant: 'destructive' }); return; }
    toast({ title: r.scheduled ? 'Queued' : 'Sent', description: r.scheduled ? `Outside their send hours: it goes at ${new Date(r.scheduled.send_at).toLocaleString('en-GB', { timeZone: r.scheduled.tz, hour: '2-digit', minute: '2-digit', weekday: 'short' })} (${r.scheduled.tz}).` : `${t.label} to ${row.business}.` });
    void qc.invalidateQueries({ queryKey: ADMIN_HOME_NEEDS_KEY });
  };
  return (
    <>
      <span title={gate.ok ? undefined : gate.reason}>
        <Button size="sm" className="h-8 gap-1.5 rounded-full" disabled={!gate.ok} onClick={() => setOpen(true)} data-testid="needs-send">
          <Send className="h-3.5 w-3.5" />{t.label}
        </Button>
      </span>
      {!gate.ok && <span className="hidden text-[10px] text-muted-foreground xl:inline">{gate.reason}</span>}
      <AlertDialog open={open} onOpenChange={setOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.label} to {row.business}?</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-2 text-sm">
                <p className="whitespace-pre-line rounded-xl bg-muted/40 p-3 text-foreground">{preview}</p>
                <p className="text-xs text-muted-foreground">Sends through the normal sender: their send hours, opt-outs, the 24-hour window and Meta's template rules all apply. Outside their hours it is queued and says when.</p>
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={busy}>Cancel</AlertDialogCancel>
            <AlertDialogAction disabled={busy} onClick={(e) => { e.preventDefault(); void send(); }}>{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Send'}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function OutcomeDialog({ row, onClose, onSave }: { row: NeedsRow | null; onClose: () => void; onSave: (reason: string, note: string) => Promise<void> }) {
  const [reason, setReason] = useState('');
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <Dialog open={!!row} onOpenChange={(v) => { if (!v) onClose(); }}>
      <DialogContent>
        <DialogHeader><DialogTitle>Record the outcome · {row?.business}</DialogTitle></DialogHeader>
        <p className="text-xs text-muted-foreground">Paid is recorded automatically when the payment lands. Use this when they are not going ahead.</p>
        <Select value={reason} onValueChange={setReason}>
          <SelectTrigger><SelectValue placeholder="Why they did not go ahead" /></SelectTrigger>
          <SelectContent>{LOST_REASONS.map((r) => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}</SelectContent>
        </Select>
        <Textarea value={note} onChange={(e) => setNote(e.target.value)} placeholder="Note (optional)" rows={2} />
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!reason || busy} onClick={async () => { setBusy(true); try { await onSave(reason, note); onClose(); } finally { setBusy(false); } }}>Save as lost</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function NeedsMeList({ rows, approvals, highlightKey, onOpen, onMark, onOutcome, lastArchived, onUndo, loading, error, onRetry, cardMenu, onAssign }: {
  rows: NeedsRow[]; approvals: readonly string[]; highlightKey?: string | null;
  /** Delegate a lead-based follow-up to a salesperson (the Sales Team Board, unchanged): only where attentionAssignable says so. */
  onAssign?: (i: AttentionItem) => void;
  onOpen: (r: NeedsRow) => void; onMark: MarkFn; onOutcome: (onboardingId: string, reason: string, note: string) => Promise<void>;
  lastArchived: { label: string; mark: NeedsMark } | null; onUndo: (markId: string) => void;
  loading?: boolean; error?: string | null; onRetry?: () => void; cardMenu?: React.ReactNode;
}) {
  const [outcomeRow, setOutcomeRow] = useState<NeedsRow | null>(null);
  const now = Date.now();
  const urgent = rows.filter((r) => r.group === 'urgent').length;
  return (
    <Panel title="What needs you" icon={AlertTriangle} tone={urgent ? 'red' : 'amber'} action={cardMenu}
      hint="Questionnaires, money, interested leads, follow-ups due and new clients, most urgent first. Replies stay in the Inbox. The send button uses your template through the normal sender: send hours, opt-outs, the 24-hour window and Meta rules all apply.">
      {error ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <AlertTriangle className="h-4 w-4 text-destructive" />Could not load what needs you: {error}
          {onRetry && <Button size="sm" variant="outline" onClick={onRetry}>Try again</Button>}
        </div>
      ) : loading ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading…</p>
        : !rows.length ? <p className="rounded-2xl bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">Nothing needs you right now.</p> : (
        <div className="space-y-4" data-testid="needs-me">
          {GROUPS.map(({ g, label, tone }) => {
            const list = rows.filter((r) => r.group === g);
            if (!list.length) return null;
            return (
              <div key={g}>
                <p className={cn('mb-1.5 text-[11px] font-semibold uppercase tracking-wide', TONE[tone].text)}>{label} · {list.length}</p>
                <ul className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/60 bg-muted/10">
                  {list.map((r) => (
                    <li key={r.key} id={`row-${r.key}`} className={cn('flex min-w-0 flex-col sm:flex-row sm:items-stretch', highlightKey === r.key && 'ring-2 ring-inset ring-primary')}>
                      <button type="button" onClick={() => onOpen(r)} className="flex min-w-0 flex-1 items-start gap-3 px-3 py-2.5 text-left transition hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                        <span className={cn('mt-1.5 h-2 w-2 shrink-0 rounded-full', TONE[tone].dot)} />
                        <span className="min-w-0 flex-1">
                          <span className="flex flex-wrap items-baseline gap-x-2">
                            <span className="truncate text-sm font-semibold">{r.star && <span className="text-yellow-400">★ </span>}{r.business}</span>
                            <span className={cn('text-[11px]', TONE[KIND_TONE[r.kind]].text)}>{r.kindLabel}</span>
                            <span className="text-[11px] text-muted-foreground">· {sinceLabel(r.sinceIso, now)}{r.dueIso ? ` · due ${sinceLabel(r.dueIso, now).startsWith('due') ? sinceLabel(r.dueIso, now).slice(4) : `${sinceLabel(r.dueIso, now)} ago`}` : ''}</span>
                            {r.flag && <span className={cn('rounded-full px-2 py-0.5 text-[10px] font-semibold', TONE.red.soft, TONE.red.text)}>{r.flag}</span>}
                          </span>
                          <span className="block text-xs text-muted-foreground">{r.why}</span>
                          <span className="mt-0.5 block text-xs font-medium text-primary">{r.action}</span>
                        </span>
                        <ArrowRight className="mt-1 hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" />
                      </button>
                      <div className="flex flex-wrap items-center gap-1.5 border-t border-border/60 px-3 py-2 sm:border-t-0 sm:py-0">
                        <SendButton row={r} approvals={approvals} />
                        {r.onboardingId && r.action === 'Record the outcome' && <Button size="sm" variant="outline" className="h-8 rounded-full" onClick={() => setOutcomeRow(r)}>Record outcome</Button>}
                        {onAssign && r.open.attention && attentionAssignable(r.open.attention) && <Button size="sm" variant="outline" className="h-8 rounded-full" onClick={() => onAssign(r.open.attention!)}>Assign</Button>}
                        <MarkButtons itemKey={r.key} onMark={onMark} />
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            );
          })}
        </div>
      )}
      {lastArchived && (
        <div className="mt-3 flex items-center justify-between rounded-xl bg-muted/40 px-3 py-2 text-xs" data-testid="undo-bar">
          <span>{lastArchived.mark.action === 'archive' ? 'Archived' : lastArchived.mark.action === 'snooze' ? 'Snoozed' : 'Dismissed'} {lastArchived.label}. Nothing is deleted.</span>
          <button type="button" className="inline-flex items-center gap-1 font-semibold text-primary" onClick={() => onUndo(lastArchived.mark.id)}><RotateCcw className="h-3 w-3" />Undo</button>
        </div>
      )}
      <OutcomeDialog row={outcomeRow} onClose={() => setOutcomeRow(null)} onSave={(reason, note) => onOutcome(outcomeRow!.onboardingId!, reason, note)} />
    </Panel>
  );
}

/** "Archived (n)": everything hidden by a mark, with Restore (= undo the mark). */
export function ArchivedList({ items, onUndo }: { items: { label: string; mark: NeedsMark }[]; onUndo: (markId: string) => void }) {
  if (!items.length) return <p className="text-sm text-muted-foreground">Nothing archived, snoozed or dismissed.</p>;
  return (
    <ul className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/60 bg-muted/10">
      {items.map(({ label, mark }) => (
        <li key={mark.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
          <span className="min-w-0 truncate">{label} <span className="text-[11px] text-muted-foreground">· {mark.action}{mark.until ? ` until ${new Date(mark.until).toLocaleString('en-GB', { weekday: 'short', hour: '2-digit', minute: '2-digit' })}` : ''}</span></span>
          <Button size="sm" variant="outline" className="h-7 rounded-full text-xs" onClick={() => onUndo(mark.id)}><RotateCcw className="mr-1 h-3 w-3" />Restore</Button>
        </li>
      ))}
    </ul>
  );
}
