/* THE ADMIN HOME'S "WHAT NEEDS YOU" (Concept A, Paul 2026-10-26). Rows come from src/lib/needsMe.ts (one per business,
   most urgent first, no replies). Same look as the old Your actions list (dot, business, time since, why, action).
   ⛔ The send button sends ONLY through sendWhatsAppRequest (the one browser send → send-whatsapp-message), via 'lead_panel'
   so the lead's send hours apply (queued outside them). Opt-outs, the 24-hour window, one-per-lead and Meta's rules are the
   server's. A mapped button is always pressable; a refusal shows after the press and in the lead's Inbox thread.
   ⛔ Snooze / dismiss / archive write a mark (admin_home_marks); nothing is deleted, every archive has an undo. */
import { useCallback, useMemo, useRef, useState } from 'react';
import { AlertTriangle, Archive, ArrowRight, Check, CheckCheck, ChevronDown, ChevronUp, Clock, Loader2, MessageSquare, MoreHorizontal, RotateCcw, Send, X } from 'lucide-react';
import { DASHBOARD_SENDS_KEY, useDashboardSends } from '@/hooks/useDashboardSends';
import { mergeSendState, sendLockedReason, sendStateLine, storedSendState, withSendStates, type RowSendState } from '@/lib/dashboardSendState';
import { useNavigate } from 'react-router-dom';
import { useLeadPeek } from '@/hooks/useLeadPeek';
import { peekLines } from '@/lib/messagePeek';
import { whatsAppLinkForLead } from '@/lib/conversationState';
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
import { dashboardGreeting, dashboardTemplatePreview } from '@/lib/dashboardTemplates';
import { READABLE_TEMPLATE_BODIES } from '@/lib/templateBodies';
import { sendErrorMeaning } from '@/lib/sendErrorMeaning';
import { NEEDS_TEMPLATES, effectiveTemplate } from '@/lib/needsMeTemplates';
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

/* ⛔ PRESSABLE when a template is mapped (Paul, 2026-10-26) — EXCEPT while this send is going, queued, or the same template went
   to this lead in the last few minutes (Paul, 2026-10-26: no double sends; the server refuses it too). Meta decides on the send:
   a refusal shows on the row (and on the failed message in the Inbox thread) and the button is usable again.
   After the press the row shows the real state (dashboardSendState.ts): Sending… → Queued / Sent → Delivered / Read, or Failed. */
function SendButton({ row, state, onState }: { row: NeedsRow; state: RowSendState | null; onState: (leadKey: string, s: RowSendState | null) => void }) {
  const { toast } = useToast();
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  /* A second press before React re-renders must not send again: the ref is set synchronously. */
  const inFlight = useRef(false);
  const key = effectiveTemplate(row.template, { prospectOnly: !!row.prospectOnly });
  if (!key) return null;
  const t = NEEDS_TEMPLATES[key];
  const leadKey = row.leadId ?? row.key;
  const locked = sendLockedReason(state, key, Date.now());
  /* What goes: Meta's approved wording for this template, filled with these values (the app cannot read Meta's text). */
  const greeting = dashboardGreeting(row.firstName, row.business);
  const vars = NEEDS_TEMPLATES[key].vars;
  const values = vars.map((v) => v === 'name' ? `Business name: ${row.business}` : v === 'greeting_name' ? `Name: ${greeting}` : `Item needed: ${row.neededItem ?? ''}`);
  const send = async () => {
    if (inFlight.current || locked) return;
    inFlight.current = true;
    setOpen(false);
    const pressedAt = new Date().toISOString();
    onState(leadKey, { phase: 'sending', template: key, at: pressedAt });
    try {
      const r = await sendWhatsAppRequest(supabase, { phone: row.phone ?? '', leadId: row.leadId, country: row.country ?? null, templateName: key, via: 'lead_panel',
        ...(vars.includes('needed_item') ? { templateVars: { needed_item: row.neededItem ?? '' } } : {}) });
      if (!r.ok) {
        const meta = r.failCode != null ? sendErrorMeaning('whatsapp', r.failCode) : null;
        const reason = meta ?? r.reason ?? r.error ?? 'The sender refused it.';
        /* Already sent / queued: the stored state (re-read below) is the truth, not a failure. */
        onState(leadKey, r.error === 'recently_sent' ? null : { phase: 'failed', template: key, at: pressedAt, reason });
        toast({ title: 'Not sent', description: `${reason}${r.failCode != null ? ' The reason is also on the message in their Inbox thread.' : ''}`, variant: 'destructive' });
      } else if (r.scheduled) {
        onState(leadKey, { phase: 'queued', template: key, at: pressedAt, sendAt: r.scheduled.send_at, tz: r.scheduled.tz });
      } else {
        onState(leadKey, { phase: 'sent', template: key, at: pressedAt });
      }
    } catch (e) {
      onState(leadKey, { phase: 'failed', template: key, at: pressedAt, reason: (e as Error)?.message || 'The send did not answer.' });
    } finally {
      inFlight.current = false;
      void qc.invalidateQueries({ queryKey: DASHBOARD_SENDS_KEY });
      void qc.invalidateQueries({ queryKey: ADMIN_HOME_NEEDS_KEY });
    }
  };
  /* The words they will get (Meta's approved wording, filled in); a template with no known wording shows its values. */
  const preview = key === 're_engage_49'
    ? (READABLE_TEMPLATE_BODIES[key]?.(row.business, '') ?? '')
    : dashboardTemplatePreview(key, { business: row.business, greeting, neededItem: row.neededItem ?? '' })
      ?? `Meta's approved "${key}" template, with:\n${values.join('\n')}`;
  if (locked) {
    return (
      <Button size="sm" variant="outline" disabled className="h-8 gap-1.5 rounded-full disabled:opacity-80" title={`${t.label}: ${locked}`} data-testid="needs-send" data-send-locked="true">
        {state?.phase === 'sending' ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : state?.phase === 'queued' ? <Clock className="h-3.5 w-3.5" /> : <Check className="h-3.5 w-3.5" />}
        {state?.phase === 'queued' ? 'Queued' : locked}
      </Button>
    );
  }
  return (
    <>
      <Button size="sm" className="h-8 gap-1.5 rounded-full" onClick={() => setOpen(true)} data-testid="needs-send">
        <Send className="h-3.5 w-3.5" />{state?.phase === 'failed' ? 'Try again' : t.label}
      </Button>
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
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={(e) => { e.preventDefault(); void send(); }}>Send</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

/** "Re-engage", "Agreement & next steps": the button's words without "Send". */
function templateName(key: string): string {
  const s = (NEEDS_TEMPLATES[key as keyof typeof NEEDS_TEMPLATES]?.label ?? 'Template').replace(/^Send /, '');
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const STATE_TONE: Record<RowSendState['phase'], Tone> ={ sending: 'blue', queued: 'amber', sent: 'green', delivered: 'green', read: 'green', failed: 'red' };

/** The row's send line: what happened to the last dashboard send, from the same facts the Inbox shows. */
function SendStateLine({ state }: { state: RowSendState }) {
  const Icon = state.phase === 'sending' ? Loader2 : state.phase === 'queued' ? Clock : state.phase === 'failed' ? AlertTriangle : state.phase === 'sent' ? Check : CheckCheck;
  const tone = TONE[STATE_TONE[state.phase]];
  return (
    <span className={cn('mt-1 inline-flex max-w-full items-start gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium', tone.soft, tone.text)} data-testid="needs-send-state" data-send-phase={state.phase}>
      <Icon className={cn('mt-px h-3 w-3 shrink-0', state.phase === 'sending' && 'animate-spin')} />
      <span className="min-w-0 break-words">{templateName(state.template)} · {sendStateLine(state)}</span>
    </span>
  );
}

/* "LAST 3" (Paul, 2026-10-26): the lead's last three WhatsApp messages, newest at the bottom, loaded only when opened.
   ⛔ Read-only (useLeadPeek: a SELECT under the Inbox's own access) — nothing is marked read, sent, or changed. */
function LeadPeek({ row }: { row: NeedsRow }) {
  const navigate = useNavigate();
  const q = useLeadPeek({ leadId: row.leadId, phone: row.phone, country: row.country }, true);
  const lines = q.data ? peekLines(q.data, { businessName: row.business, firstName: row.firstName }) : [];
  const now = Date.now();
  return (
    <div className="border-t border-border/60 bg-background/40 px-3 py-2.5" data-testid="needs-peek">
      {q.isLoading ? <p className="flex items-center gap-2 text-xs text-muted-foreground"><Loader2 className="h-3.5 w-3.5 animate-spin" />Loading the last messages…</p>
        : q.isError ? (
          <p className="flex flex-wrap items-center gap-2 text-xs text-destructive"><AlertTriangle className="h-3.5 w-3.5" />Could not load the messages: {(q.error as Error)?.message ?? 'error'}
            <Button size="sm" variant="outline" className="h-7 rounded-full text-xs" onClick={() => void q.refetch()}>Try again</Button></p>
        ) : !lines.length ? <p className="text-xs text-muted-foreground">No WhatsApp messages with them yet.</p> : (
          <ul className="space-y-1.5">
            {lines.map((l) => (
              <li key={l.id} className={cn('flex', l.who === 'us' ? 'justify-end' : 'justify-start')}>
                <div className={cn('min-w-0 max-w-[88%] rounded-2xl px-3 py-1.5 text-xs sm:max-w-[75%]', l.who === 'us' ? 'bg-primary/20 text-foreground' : 'bg-muted/60 text-foreground')}>
                  <p className="mb-0.5 flex flex-wrap items-center gap-x-1.5 text-[10px] text-muted-foreground">
                    <span className="font-semibold">{l.who === 'us' ? 'Us' : 'Them'}</span>
                    <span>· {sinceLabel(l.at, now)} ago</span>
                    {l.tag && <span>· {l.tag}</span>}
                    {l.failed && <span className="font-semibold text-destructive">· failed</span>}
                  </p>
                  <p className="line-clamp-4 whitespace-pre-wrap break-words">{l.text}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
      {row.leadId && (
        <div className="mt-2 flex justify-end">
          <Button size="sm" variant="outline" className="h-7 gap-1 rounded-full text-xs" onClick={() => navigate(whatsAppLinkForLead(row.leadId!))} data-testid="peek-open-inbox">
            Open in Inbox<ArrowRight className="h-3 w-3" />
          </Button>
        </div>
      )}
    </div>
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

export function NeedsMeList({ rows, highlightKey, onOpen, onMark, onOutcome, lastArchived, onUndo, loading, error, onRetry, cardMenu, onAssign }: {
  rows: NeedsRow[]; highlightKey?: string | null;
  /** Delegate a lead-based follow-up to a salesperson (the Sales Team Board, unchanged): only where attentionAssignable says so. */
  onAssign?: (i: AttentionItem) => void;
  onOpen: (r: NeedsRow) => void; onMark: MarkFn; onOutcome: (onboardingId: string, reason: string, note: string) => Promise<void>;
  lastArchived: { label: string; mark: NeedsMark } | null; onUndo: (markId: string) => void;
  loading?: boolean; error?: string | null; onRetry?: () => void; cardMenu?: React.ReactNode;
}) {
  const [outcomeRow, setOutcomeRow] = useState<NeedsRow | null>(null);
  /* Which rows show their last 3 messages. Not remembered: an open peek is a glance, never saved state. */
  const [peekOpen, setPeekOpen] = useState<Set<string>>(new Set());
  const togglePeek = (key: string) => setPeekOpen((prev) => { const next = new Set(prev); if (next.has(key)) next.delete(key); else next.add(key); return next; });
  /* The press's own state per lead ("Sending…", or the sender's answer before the database is re-read). Not remembered:
     once re-read, the stored state (the same facts as the Inbox) takes over. */
  const [pressed, setPressed] = useState<Map<string, RowSendState | null>>(new Map());
  const onState = useCallback((leadKey: string, s: RowSendState | null) => setPressed((prev) => new Map(prev).set(leadKey, s)), []);
  const leadIds = useMemo(() => rows.map((r) => r.leadId).filter((x): x is string => !!x), [rows]);
  const sends = useDashboardSends(leadIds);
  const now = Date.now();
  const shownRows = useMemo(() => withSendStates(rows, (r) => mergeSendState(pressed.get(r.leadId ?? r.key),
    storedSendState(r.leadId, sends.data?.sent ?? [], sends.data?.queued ?? [])), now),
  // eslint-disable-next-line react-hooks/exhaustive-deps -- `now` is this render's clock; rows/pressed/sends drive it
  [rows, pressed, sends.data]);
  const urgent = shownRows.filter((r) => r.group === 'urgent').length;
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
            const list = shownRows.filter((r) => r.group === g);
            if (!list.length) return null;
            return (
              <div key={g}>
                <p className={cn('mb-1.5 text-[11px] font-semibold uppercase tracking-wide', TONE[tone].text)}>{label} · {list.length}</p>
                <ul className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/60 bg-muted/10">
                  {list.map((r) => (
                    <li key={r.key} id={`row-${r.key}`} className={cn('flex min-w-0 flex-col', highlightKey === r.key && 'ring-2 ring-inset ring-primary')}>
                      <div className="flex min-w-0 flex-col sm:flex-row sm:items-stretch">
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
                          {r.sendState && r.group === 'waiting' && r.sendState.phase !== 'failed'
                            ? <span className="mt-0.5 block text-xs font-medium text-muted-foreground">Handled · waiting on them</span>
                            : <span className="mt-0.5 block text-xs font-medium text-primary">{r.action}</span>}
                          {r.sendState && <SendStateLine state={r.sendState} />}
                        </span>
                        <ArrowRight className="mt-1 hidden h-4 w-4 shrink-0 text-muted-foreground sm:block" />
                      </button>
                      <div className="flex flex-wrap items-center gap-1.5 border-t border-border/60 px-3 py-2 sm:border-t-0 sm:py-0">
                        {(r.leadId || r.phone) && (
                          <Button size="sm" variant="ghost" className="h-8 gap-1 rounded-full px-2.5 text-xs" aria-expanded={peekOpen.has(r.key)}
                            onClick={() => togglePeek(r.key)} title={peekOpen.has(r.key) ? 'Hide the last messages' : 'Show the last 3 messages'} data-testid="needs-peek-toggle">
                            <MessageSquare className="h-3.5 w-3.5" />Last 3{peekOpen.has(r.key) ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
                          </Button>
                        )}
                        <SendButton row={r} state={r.sendState} onState={onState} />
                        {r.onboardingId && r.action === 'Record the outcome' && <Button size="sm" variant="outline" className="h-8 rounded-full" onClick={() => setOutcomeRow(r)}>Record outcome</Button>}
                        {onAssign && r.open.attention && attentionAssignable(r.open.attention) && <Button size="sm" variant="outline" className="h-8 rounded-full" onClick={() => onAssign(r.open.attention!)}>Assign</Button>}
                        <MarkButtons itemKey={r.key} onMark={onMark} />
                      </div>
                      </div>
                      {peekOpen.has(r.key) && <LeadPeek row={r} />}
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
