import { useState } from 'react';
import { X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { cn } from '@/lib/utils';
import { NEXT_ACTION_OPTIONS } from '@/lib/salesCrm';
import { NEXT_ACTION_LABEL, meetingDayTime, nextActionView, nextActionText } from '@/lib/nextActionView';
import type { NextActionInput } from '@/lib/nextActionWrite';

/* ⛔ THE ONE NEXT ACTION FORM (2026-10-02, Paul). The lead workspace's Work tab, the Outreach row and the phone
   card draw THIS form; it saves through src/lib/nextActionWrite.ts (lead_set_follow_up, both roles). Every
   type offered is NEXT_ACTION_OPTIONS; a stored value outside it (an older one) is shown in its own words and
   can be kept. Fields: the type, the day (quick days or a date), the time for a Meeting (call_booked_at —
   the only time the model stores), and the note. Save writes it; Done and Clear remove it (cleared in
   History); editing and rescheduling are the same Save. Nothing auto-saves. */

/** A London calendar day, n days from today, as YYYY-MM-DD. */
export function londonDayPlus(n: number, now = new Date()): string {
  const d = new Date(now.getTime() + n * 86_400_000);
  return d.toLocaleDateString('en-CA', { timeZone: 'Europe/London' });
}
export const QUICK_DATES = [
  { label: 'Today', days: 0 },
  { label: 'Tomorrow', days: 1 },
  { label: 'In 3 days', days: 3 },
  { label: 'Next week', days: 7 },
] as const;

export type NextActionPreset = { nextAction: string; date?: string; note?: string; requireDate?: boolean; why?: string };
export type NextActionFormLead = { next_action: string | null; next_action_date: string | null; next_action_note: string | null; call_booked_at?: string | null };

export function NextActionForm({ lead, onSave, preset, onDismiss, onCancel, compact = false }: {
  lead: NextActionFormLead;
  onSave: (a: NextActionInput) => Promise<unknown>;
  /** An outcome was just logged: its suggested Next Action (leadState suggestNextAction), pre-filled —
   *  never saved; the person checks it and presses Save. requireDate: Call back needs a day. */
  preset?: NextActionPreset | null;
  onDismiss?: () => void;
  /** The Outreach popover's Cancel. */
  onCancel?: () => void;
  compact?: boolean;
}) {
  const known = NEXT_ACTION_OPTIONS.some((o) => o.value === lead.next_action);
  const bookedDayTime = lead.call_booked_at && Number.isFinite(Date.parse(lead.call_booked_at)) ? meetingDayTime(lead.call_booked_at) : null;
  const [nextAction, setNextAction] = useState(preset?.nextAction ?? lead.next_action ?? 'none');
  const [date, setDate] = useState(preset ? (preset.date ?? '') : (lead.next_action_date ?? ''));
  const [time, setTime] = useState(lead.next_action === 'meeting' && bookedDayTime && bookedDayTime.day === lead.next_action_date ? bookedDayTime.time : '');
  const [note, setNote] = useState(preset?.note ?? lead.next_action_note ?? '');
  const [busy, setBusy] = useState(false);
  const has = !!lead.next_action && lead.next_action !== 'none';
  const isMeeting = nextAction === 'meeting';
  const needsDay = (!!preset?.requireDate && !date) || (isMeeting && !!time && !date);
  const now = nextActionView(lead);
  const chip = 'rounded-md border border-border/60 px-2 py-1 text-[11px] font-medium hover:bg-muted';
  const run = async (a: NextActionInput) => { setBusy(true); try { await onSave(a); } finally { setBusy(false); } };
  const save = () => {
    if (nextAction === 'none') return run({ nextAction: 'none', date: null, note: note.trim() || null });
    const meetingAt = isMeeting && date && time ? new Date(`${date}T${time}`).toISOString() : null;
    return run({ nextAction, date: date || null, note: note.trim() || null, meetingAt });
  };
  return (
    <div className={cn('space-y-2', compact && 'w-[17rem]')} data-testid="next-action">
      {preset && (
        <p className="flex items-center justify-between gap-2 rounded-md bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-800 dark:text-amber-200" data-testid="next-action-suggested">
          <span>{preset.requireDate ? `${preset.why ?? 'Call back'}: pick the day, then Save.` : `Suggested after “${preset.why ?? 'the contact'}” — change anything, then Save to keep it.`}</span>
          {onDismiss && <button type="button" className="shrink-0 underline underline-offset-2" onClick={onDismiss}>Not now</button>}
        </p>
      )}
      {has && now && (
        <p className="text-xs" data-testid="next-action-now"><span className="text-muted-foreground">Now: </span>
          <span className="font-semibold">{nextActionText({ ...now, note: null })}</span>
        </p>
      )}
      <Select value={nextAction} onValueChange={setNextAction}>
        <SelectTrigger className="h-9 text-xs" aria-label="Next action type"><SelectValue placeholder="Nothing planned" /></SelectTrigger>
        <SelectContent>
          {NEXT_ACTION_OPTIONS.map((o) => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}
          {!known && lead.next_action ? <SelectItem value={lead.next_action}>{NEXT_ACTION_LABEL[lead.next_action] ?? lead.next_action.replace(/_/g, ' ')}</SelectItem> : null}
        </SelectContent>
      </Select>
      <div className={cn('flex flex-wrap items-center gap-1.5', nextAction === 'none' && 'pointer-events-none opacity-40')}>
        {QUICK_DATES.map((q) => (
          <button key={q.label} type="button" className={cn(chip, date === londonDayPlus(q.days) && 'border-primary text-primary')} onClick={() => setDate(londonDayPlus(q.days))}>{q.label}</button>
        ))}
        <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-8 w-[9.5rem] text-xs" disabled={nextAction === 'none'} aria-label="Next action date" />
        {isMeeting && (
          <Input type="time" value={time} onChange={(e) => setTime(e.target.value)} className="h-8 w-[6.5rem] text-xs" aria-label="Meeting time" data-testid="next-action-time" />
        )}
      </div>
      {isMeeting && <p className="text-[11px] text-muted-foreground">With a time, this books the meeting (shows as “Meeting booked”).</p>}
      <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className="h-9 text-xs" placeholder="What to do, e.g. ring after their website contract ends" aria-label="Next action note" />
      <div className="flex items-center justify-end gap-2">
        {onCancel && <Button size="sm" variant="ghost" className="h-8 text-xs" onClick={onCancel}>Cancel</Button>}
        {has && (
          <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs text-muted-foreground" disabled={busy} data-testid="clear-next-action"
            onClick={() => void run({ nextAction: 'none', date: null, note: note.trim() || null })}>
            <X className="h-3.5 w-3.5" />Clear
          </Button>
        )}
        <Button size="sm" className="h-8 text-xs" disabled={needsDay || busy} title={needsDay ? 'Pick the day first' : undefined} data-testid="save-next-action" onClick={() => void save()}>Save next action</Button>
      </div>
    </div>
  );
}
