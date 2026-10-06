import { useId, useState, type ComponentType, type KeyboardEvent, type ReactNode } from 'react';
import { CalendarClock, Check, ChevronDown, ClipboardPen, Loader2, MessageSquarePlus, Pencil, PhoneMissed, PhoneOff, PhoneForwarded, Plus, Send, Star, ThumbsDown, Voicemail, X } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { DialogHero, LoadState } from '@/components/operator/ui';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useUnsavedDraft } from '@/components/UnsavedDraftGuard';
import { NextActionForm, type NextActionPreset } from '@/components/NextActionForm';
import { SalesStatePill } from '@/components/SalesStatePill';
import { QuickCloseButton } from '@/components/QuickCloseDialog';
import { useLeadCrmRow, useLeadWork, type LoggedOutcome, type OutcomeResultLine } from '@/components/LeadCrmPanel';
import { askLostReason } from '@/lib/lostReasonAsk';
import { LOST_REASON_UNRECORDED, lostReasonLabel } from '@/lib/lostReason';
import { CONTACT_METHODS, contactMethodLabel } from '@/lib/contactMethods';
import { londonLocalInput, nextActionView } from '@/lib/nextActionView';
import { outcomeLabel, outcomeRule } from '@/lib/leadState';
import { isPaidLead } from '@/lib/leadPayment';
import {
  DEFAULT_LOG_CHANNEL, INTERESTED_NEXT_CHOICES, channelRecordedBySend, choicesFor, followStepOf, interestedPreset, moreOutcomesFor,
  type FollowStep, type InterestedNextKey, type LogTone,
} from '@/lib/logOutcomeFlow';
import { cn } from '@/lib/utils';

/* ══ THE CALL WORKSPACE'S LOG FLOW (2026-10-06, Paul: "record WHAT HAPPENED") ═════════════════════════
   Replaces the Call tab's three permanent cards (Status, Log a contact, Next Action):
     · the STATUS is the coloured pill in the popup header (the same control as Outreach and the Inbox);
     · the NEXT ACTION is one compact line in the header ("Next: Call · Tomorrow · 10:30 ✎" or
       "No next action · Set one") — Edit opens the ONE Next Action form in a small window;
     · LOG opens a small window: what happened (src/lib/logOutcomeFlow.ts), saved first; ONLY an outcome that
       needs a next step then asks for it, in the same small window.
   Every write is useLeadWork (src/components/LeadCrmPanel.tsx): lead_log_contact + THE ONE RULE (leadState /
   leadOutcome), the one Next Action write, the one meeting write — exactly what the old cards wrote.
   ⛔ Send onboarding is the Close tab (QuickClosePanel), never a raw payment link.
   ⛔ The optional note is saved WITH the outcome (lead_log_contact's _note) and is marked as an unsaved draft
     while typed: it survives closing the window and leaving the lead asks first. The Internal note stays
     on Details. */

const TONE: Record<LogTone, string> = {
  good: 'border-amber-500/50 bg-amber-500/10 text-amber-800 hover:bg-amber-500/20 dark:text-amber-200',
  strong: 'border-emerald-600 bg-emerald-600 text-white hover:bg-emerald-700',
  info: 'border-sky-500/50 bg-sky-500/10 text-sky-800 hover:bg-sky-500/20 dark:text-sky-200',
  quiet: 'border-border bg-muted/40 text-foreground/80 hover:bg-muted',
  stop: 'border-rose-500/40 bg-rose-500/10 text-rose-800 hover:bg-rose-500/20 dark:text-rose-200',
};
const ICON: Record<string, ComponentType<{ className?: string }>> = {
  interested: Star, not_interested: ThumbsDown, no_answer: PhoneMissed, call_back: PhoneForwarded,
  send_onboarding: Send, wrong_number: PhoneOff, left_voicemail: Voicemail,
};

/** Outcomes after which the prospect may be ready to pay: the result line offers Quick Close right there. */
const CLOSE_READY_OUTCOMES: ReadonlySet<string> = new Set(['interested', 'spoke_to_owner', 'meeting_booked']);

/** One Log, as the Call tab's result line shows it. */
export interface LoggedResult { key: string; outcome: string; result: OutcomeResultLine }

/** ← / → step to the next lead in the popup underneath; inside these windows they never should. */
const keepKeysHere = (e: KeyboardEvent) => { if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') e.stopPropagation(); };

/* ── THE HEADER'S NEXT ACTION: one compact line, the display only ─────────────────────────────── */
export function HeaderNextAction({ leadId, onEdit }: { leadId: string; onEdit: () => void }) {
  const crm = useLeadCrmRow(leadId);
  const v = nextActionView(crm.data);
  if (crm.isLoading) return <Loader2 className="h-3.5 w-3.5 animate-spin text-muted-foreground" />;
  if (!v) {
    return (
      <button type="button" onClick={onEdit} data-testid="header-next-action" data-bucket="none"
        className="inline-flex h-7 items-center gap-1.5 rounded-full border border-dashed border-border px-2.5 text-xs text-muted-foreground hover:border-primary/60 hover:text-foreground">
        <CalendarClock className="h-3.5 w-3.5" />No next action<span className="font-semibold text-primary">· Set one</span>
      </button>
    );
  }
  const tone = v.bucket === 'overdue' ? 'border-red-500/50 bg-red-500/10 text-red-800 dark:text-red-200'
    : v.bucket === 'today' ? 'border-amber-500/50 bg-amber-500/10 text-amber-800 dark:text-amber-200'
    : 'border-sky-500/40 bg-sky-500/10 text-sky-800 dark:text-sky-200';
  return (
    <button type="button" onClick={onEdit} data-testid="header-next-action" data-bucket={v.bucket} title={v.note ? `Next action: ${v.note}` : 'Edit the next action'}
      className={cn('inline-flex h-7 min-w-0 max-w-full items-center gap-1.5 rounded-full border px-2.5 text-xs font-semibold hover:brightness-110', tone)}>
      <CalendarClock className="h-3.5 w-3.5 shrink-0" />
      <span className="truncate">{v.label}{v.when ? ` · ${v.when}` : ' · No date set'}{v.time ? ` · ${v.time}` : ''}</span>
      <Pencil className="h-3 w-3 shrink-0 opacity-70" />
    </button>
  );
}

/* ── WHY THEY SAID NO: one quiet line under the status while the lead is Not interested ─────────── */
export function LostReasonLine({ leadId, businessName }: { leadId: string; businessName: string }) {
  const lead = useLeadCrmRow(leadId).data;
  if (!lead || lead.status !== 'not_interested') return null;
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5 text-xs" data-testid="lost-reason">
      <span className="text-muted-foreground">Why:</span>
      <span className={cn('truncate font-medium', !lead.lost_reason && 'text-muted-foreground')}>{lead.lost_reason ? lostReasonLabel(lead.lost_reason) : LOST_REASON_UNRECORDED}</span>
      <button type="button" className="shrink-0 font-semibold text-primary hover:underline" data-testid="lost-reason-edit"
        onClick={() => askLostReason({ leadId, businessName, reason: lead.lost_reason, note: lead.lost_reason_note })}>
        {lead.lost_reason ? 'Change' : 'Add'}
      </button>
    </span>
  );
}

/* ── THE RESULT LINE: what the last Log recorded, on the Call tab (never toast-only) ──────────────── */
export function LoggedLine({ leadId, logged, onDismiss }: { leadId: string; logged: LoggedResult; onDismiss: () => void }) {
  const r = logged.result;
  return (
    <div className="space-y-1 rounded-xl border border-emerald-600/30 bg-emerald-500/[0.06] px-3 py-2 text-xs" data-testid="logged-line">
      <div className="flex flex-wrap items-center gap-1.5">
        <Check className="h-3.5 w-3.5 text-emerald-600" />
        <span className="font-semibold text-foreground">{r.contact}</span>
        <span className="text-muted-foreground">→</span>
        <SalesStatePill view={r.state} size="xs" />
        {r.change && <span className="text-muted-foreground" data-testid="state-change">{r.change}</span>}
        <button type="button" onClick={onDismiss} className="ml-auto rounded p-0.5 text-muted-foreground hover:bg-muted hover:text-foreground" aria-label="Hide this line"><X className="h-3.5 w-3.5" /></button>
      </div>
      {r.said.length > 0 && <p className="text-muted-foreground">{r.said.join(' · ')}</p>}
      {r.failed.length > 0 && <p className="text-destructive">{r.failed.join(' · ')}</p>}
      {r.suggestion && <p className="font-medium text-amber-700 dark:text-amber-300" data-testid="suggestion">{r.suggestion}</p>}
      {/* They are interested: the close is one tap away (call-first, 2026-10-04). */}
      {CLOSE_READY_OUTCOMES.has(logged.outcome) && r.state.state !== 'not_interested' && (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-1.5" data-testid="logged-quick-close">
          <span className="text-muted-foreground">Ready to pay now? Take the £99 on the call.</span>
          <QuickCloseButton leadId={leadId} />
        </div>
      )}
    </div>
  );
}

type Step = 'pick' | Exclude<FollowStep, 'none' | 'quick_close'> | 'interested_form';

/* ── THE LOG WINDOW + THE NEXT ACTION WINDOW ─────────────────────────────────────────────────────── */
export function LeadCallFlow({ leadId, businessName, logOpen, onLogOpenChange, nextOpen, onNextOpenChange, onSendOnboarding, onLogged }: {
  leadId: string;
  businessName: string;
  logOpen: boolean;
  onLogOpenChange: (open: boolean) => void;
  nextOpen: boolean;
  onNextOpenChange: (open: boolean) => void;
  /** Send onboarding: the Close tab (the one close UI). */
  onSendOnboarding: () => void;
  /** Each saved Log, for the Call tab's result line. */
  onLogged: (r: LoggedResult) => void;
}) {
  const work = useLeadWork(leadId);
  const lead = work.lead;
  const [step, setStep] = useState<Step>('pick');
  const [channel, setChannel] = useState(DEFAULT_LOG_CHANNEL);
  const [note, setNote] = useState('');
  const [noteOpen, setNoteOpen] = useState(false);
  const [showMore, setShowMore] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [last, setLast] = useState<{ key: string; outcome: string; done: LoggedOutcome } | null>(null);
  const [formPreset, setFormPreset] = useState<NextActionPreset | null>(null);
  /* The note outlives the window (it lives here, not in the window), so closing the window keeps it and
     leaving the lead with it typed asks first — the workspace's one draft guard. */
  useUnsavedDraft(`log-outcome-note-${useId()}`, note.trim() !== '');

  const recordedBySend = channelRecordedBySend(channel);
  const paid = isPaidLead(lead);
  const choices = choicesFor(channel, { paid });
  const more = moreOutcomesFor(channel);
  /* Every way the window closes (X, Escape, Skip, Later, a saved follow-up) goes through here, so the next Log
     always starts on "What happened?" with the channel back on Call. */
  const setLogOpen = (o: boolean) => {
    onLogOpenChange(o);
    if (!o) { setStep('pick'); setShowMore(false); setChannel(DEFAULT_LOG_CHANNEL); setFormPreset(null); }
  };
  const finish = () => setLogOpen(false);

  const tap = async (key: string, outcome: string) => {
    if (busy) return;
    setBusy(key);
    try {
      const done = await work.logOutcome(outcome, channel, !recordedBySend, recordedBySend ? null : note);
      if (!done || !done.ok || !done.result) return; // in flight, or refused (the toast says why) — the window stays
      if (!recordedBySend) { setNote(''); setNoteOpen(false); }
      setLast({ key, outcome, done });
      onLogged({ key, outcome, result: done.result });
      const next = followStepOf(key, outcome);
      if (next === 'none') { setLogOpen(false); return; }
      if (next === 'quick_close') { setLogOpen(false); onSendOnboarding(); return; }
      if (next === 'retry_when') setFormPreset(done.preset);
      setStep(next);
    } finally { setBusy(null); }
  };

  const chooseInterestedNext = (k: InterestedNextKey) => {
    if (k === 'send_onboarding') { setLogOpen(false); onSendOnboarding(); return; }
    const p = interestedPreset(k);
    if (!p) { setLogOpen(false); return; }
    setFormPreset({ nextAction: p.nextAction, note: p.note, why: 'Interested' });
    setStep('interested_form');
  };

  const saved = last && (
    <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-emerald-500/10 px-2.5 py-1.5 text-xs" data-testid="log-saved">
      <Check className="h-3.5 w-3.5 text-emerald-600" />
      <span className="font-semibold">Saved: {last.done.result?.contact}</span>
      {last.done.result && <SalesStatePill view={last.done.result.state} size="xs" />}
      {last.done.result?.failed.length ? <span className="w-full text-destructive">{last.done.result.failed.join(' · ')}</span> : null}
    </div>
  );
  /* ⛔ THE ONE NEXT ACTION EDITOR (2026-10-02): every Next Action this file edits — after an outcome, or from the
     header — is THIS form, saved through useLeadWork's saveNext. Keyed on the stored row so a re-read remounts it
     with a fresh stale-tab snapshot. `done` closes the window it sits in. */
  const nextForm = (preset: NextActionPreset | null, done: () => void, cancel?: () => void) => lead && (
    <NextActionForm key={`${lead.next_action}|${lead.next_action_date}|${lead.next_action_time}|${lead.next_action_note}|${preset ? JSON.stringify(preset) : ''}`}
      lead={lead} preset={preset} onDismiss={done} onCancel={cancel}
      onSave={async (a) => { const r = await work.saveNext(a); if (r.ok) done(); return r; }} />
  );
  const later = (label = 'Later') => (
    <div className="flex justify-end"><Button size="sm" variant="ghost" className="h-8 text-xs text-muted-foreground" onClick={finish} data-testid="follow-up-later">{label}</Button></div>
  );

  let title = 'What happened?';
  let body: ReactNode = null;
  if (!lead) body = <p className="flex items-center gap-2 py-4 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading…</p>;
  else if (step === 'pick') {
    body = (
      <div className="space-y-3" data-testid="log-outcome-pick">
        {recordedBySend && (
          <p className="rounded-md bg-muted/50 px-2.5 py-2 text-xs text-muted-foreground" data-testid="whatsapp-recorded-by-send">
            WhatsApp messages are recorded automatically — just say what came of the conversation.
          </p>
        )}
        <div className="grid grid-cols-2 gap-2" data-testid="log-outcome-choices">
          {choices.map((c) => {
            const Icon = ICON[c.key] ?? Check;
            return (
              <button key={c.key} type="button" disabled={busy !== null} data-testid={`outcome-${c.key}`} title={c.key === 'send_onboarding' ? 'Records Interested and opens the Close tab (Quick Close).' : outcomeRule(c.outcome).does}
                onClick={() => void tap(c.key, c.outcome)}
                className={cn('flex h-12 items-center gap-2 rounded-xl border px-3 text-left text-sm font-semibold transition-colors disabled:opacity-50', TONE[c.tone], c.key === 'send_onboarding' && 'col-span-2 justify-center')}>
                {busy === c.key ? <Loader2 className="h-4 w-4 shrink-0 animate-spin" /> : <Icon className="h-4 w-4 shrink-0" />}
                <span className="min-w-0 truncate">{c.label}</span>
              </button>
            );
          })}
        </div>
        {more.length > 0 && (
          <div>
            <button type="button" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => setShowMore((v) => !v)} aria-expanded={showMore} data-testid="log-more-toggle">
              More outcomes<ChevronDown className={cn('h-3 w-3 transition-transform', showMore && 'rotate-180')} />
            </button>
            {showMore && (
              <div className="mt-1.5 flex flex-wrap gap-1.5" data-testid="log-more">
                {more.map((o) => (
                  <button key={o} type="button" disabled={busy !== null} data-testid={`outcome-${o}`} title={outcomeRule(o).does} onClick={() => void tap(o, o)}
                    className="inline-flex h-8 items-center gap-1 rounded-full border border-border bg-muted/40 px-3 text-xs font-medium hover:bg-muted disabled:opacity-50">
                    {busy === o && <Loader2 className="h-3 w-3 animate-spin" />}{outcomeLabel(o)}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {!recordedBySend && (noteOpen || note ? (
          <Input value={note} onChange={(e) => setNote(e.target.value)} autoFocus={noteOpen && !note} maxLength={500} className="h-9 text-xs" placeholder="Note (optional), saved with the outcome" data-testid="log-note" />
        ) : (
          <button type="button" className="inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground" onClick={() => setNoteOpen(true)} data-testid="log-add-note">
            <MessageSquarePlus className="h-3.5 w-3.5" />Add note
          </button>
        ))}
        <div className="flex items-center gap-1.5 border-t border-border/60 pt-2 text-xs text-muted-foreground" data-testid="log-channel">
          <span>Logged as:</span><span className="font-semibold text-foreground">{contactMethodLabel(channel)}</span>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <button type="button" className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline" data-testid="log-channel-change">Change<ChevronDown className="h-3 w-3" /></button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {CONTACT_METHODS.map((m) => <DropdownMenuItem key={m.value} className="text-xs" onClick={() => setChannel(m.value)}>{m.label}</DropdownMenuItem>)}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>
    );
  } else if (step === 'interested_next') {
    title = 'What happens next?';
    body = (
      <div className="space-y-3">
        {saved}
        <div className="grid grid-cols-2 gap-2" data-testid="interested-next">
          {INTERESTED_NEXT_CHOICES.filter((c) => !(c.key === 'send_onboarding' && paid)).map((c) => (
            <button key={c.key} type="button" data-testid={`interested-next-${c.key}`} onClick={() => chooseInterestedNext(c.key)}
              className={cn('flex h-11 items-center justify-center gap-1.5 rounded-xl border px-3 text-sm font-semibold transition-colors',
                c.key === 'send_onboarding' ? TONE.strong : c.key === 'none' ? TONE.quiet : TONE.info)}>
              {c.key === 'send_onboarding' ? <Send className="h-4 w-4" /> : c.key === 'none' ? <X className="h-4 w-4" /> : c.key === 'call_back' ? <PhoneForwarded className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {c.label}
            </button>
          ))}
        </div>
      </div>
    );
  } else if (step === 'interested_form' || step === 'retry_when') {
    title = step === 'interested_form' ? (formPreset?.nextAction === 'call' ? 'When should we call?' : 'Set a follow-up')
      : last && ['no_answer', 'left_voicemail'].includes(last.outcome) ? 'Try again when?' : 'Set a next step?';
    body = <div className="space-y-3" data-testid="follow-up-form">{saved}{nextForm(formPreset, finish)}{step === 'retry_when' && later('Skip')}</div>;
  } else if (step === 'call_back_when') {
    title = 'When should we call?';
    body = <div className="space-y-3" data-testid="call-back-when">{saved}{nextForm(null, finish)}{later('Later — no day yet')}</div>;
  } else if (step === 'meeting_when') {
    title = 'When is the meeting?';
    body = (
      <div className="space-y-3">
        {saved}
        <div className="flex flex-wrap items-end gap-2" data-testid="meeting-when">
          <label className="min-w-0 flex-1 text-[11px] font-medium text-muted-foreground">Day and time (UK time)
            <Input type="datetime-local" className="mt-1 h-9 text-xs" id={`meeting-at-${lead.id}`} defaultValue={lead.call_booked_at ? londonLocalInput(lead.call_booked_at) : ''} />
          </label>
          <Button size="sm" className="h-9 text-xs" data-testid="meeting-save" onClick={async () => {
            const el = document.getElementById(`meeting-at-${lead.id}`) as HTMLInputElement | null;
            const r = await work.saveMeeting(el?.value ?? '');
            if (r?.ok) finish();
          }}>Save meeting</Button>
        </div>
        <p className="text-[11px] text-muted-foreground">Shows as “Meeting booked” with the time, and sets the Next Action “Meeting” on that day.</p>
        {later()}
      </div>
    );
  }

  return (
    <>
      <Dialog open={logOpen} onOpenChange={setLogOpen}>
        <DialogContent className="max-h-[90dvh] w-[calc(100%-1.5rem)] max-w-md gap-3 overflow-y-auto rounded-2xl p-4 sm:p-5" onKeyDown={keepKeysHere} data-testid="log-outcome">
          <DialogHero icon={ClipboardPen} tone="blue" title={title} subtitle={businessName} />
          {body}
        </DialogContent>
      </Dialog>
      <Dialog open={nextOpen} onOpenChange={onNextOpenChange}>
        <DialogContent className="max-h-[90dvh] w-[calc(100%-1.5rem)] max-w-md gap-3 overflow-y-auto rounded-2xl p-4 sm:p-5" onKeyDown={keepKeysHere} data-testid="next-action-window">
          <DialogHero icon={CalendarClock} tone="blue" title="Next action" subtitle={businessName} />
          {lead ? nextForm(null, () => onNextOpenChange(false), () => onNextOpenChange(false)) : <LoadState compact />}
        </DialogContent>
      </Dialog>
    </>
  );
}
