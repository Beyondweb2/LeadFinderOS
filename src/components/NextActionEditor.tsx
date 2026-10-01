import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { CalendarClock, CheckCircle2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useToast } from '@/hooks/use-toast';
import { refusalText } from '@/lib/salesCrm';
import { nextActionView, nextActionText } from '@/lib/nextActionView';
import { saveNextAction, type NextActionInput } from '@/lib/nextActionWrite';
import type { LeadStateInput } from '@/lib/leadState';
import { NextActionForm } from '@/components/NextActionForm';

/* THE OUTREACH ROW'S (AND PHONE CARD'S) NEXT ACTION CELL.
   ⛔ ONE NEXT ACTION (2026-10-02, Paul: "This should not be a separate simplified system"). The cell opens the
   SAME form as the lead workspace (NextActionForm: every NEXT_ACTION_OPTIONS type, the day, a Meeting's time,
   the note, Save / Clear) and saves through the SAME write (src/lib/nextActionWrite.ts → lead_set_follow_up,
   both roles, History). It used to be a lighter popup: no note, no time, auto-saved the moment a type and a
   day were both picked, and the admin's save wrote the row directly with no History line.
   The trigger reads the one view (nextActionView): "Call · Tomorrow", "Meeting · Thu 2 Oct · 14:30", the note
   underneath. Colour follows urgency: red overdue, amber today, grey later. ✓ Done clears it. */

type EditorLead = LeadStateInput & {
  id: string;
  next_action?: string | null;
  next_action_date?: string | null;
  next_action_note?: string | null;
  next_action_time?: string | null;
};

const BUCKET_TEXT = { overdue: 'text-red-600 dark:text-red-400', today: 'text-amber-600 dark:text-amber-400', upcoming: 'text-muted-foreground', none: 'text-muted-foreground' } as const;

export function NextActionEditor({ lead }: { lead: EditorLead }) {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const v = nextActionView(lead);
  const save = async (a: NextActionInput) => {
    const r = await saveNextAction(lead.id, a, lead);
    if (!r.ok) { toast({ title: 'Not saved', description: refusalText(r.error), variant: 'destructive' }); return r; }
    toast({ title: a.nextAction === 'none' ? (a.done ? 'Next action completed' : 'Next action cleared') : a.nextAction === 'meeting' && a.time && a.date ? 'Meeting booked · Next Action set' : 'Next action saved' });
    setOpen(false);
    return r;
  };
  const title = v ? `Next action: ${nextActionText(v)}` : 'Set a next action';
  return (
    <div className="flex items-center gap-1" data-walkthrough-step="follow-up" data-walkthrough="next-action">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" className="flex h-auto max-w-[13rem] flex-col items-start gap-0.5 p-1 hover:bg-muted/50" title={title} aria-label={title} data-testid="row-next-action">
            {v ? (
              <>
                <span className="flex items-center gap-1.5 text-sm font-medium text-foreground"><CalendarClock className="h-3 w-3" />{v.label}</span>
                <span className={cn('text-xs font-semibold', BUCKET_TEXT[v.bucket])}>{[v.when ?? 'No date set', v.time].filter(Boolean).join(' · ')}</span>
                {v.note && <span className="w-full truncate text-left text-[11px] font-normal text-muted-foreground">{v.note}</span>}
              </>
            ) : (
              <span className="flex items-center gap-1 text-xs text-muted-foreground"><Plus className="h-3 w-3" />Set</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-4" align="start">
          {open && (
            <NextActionForm compact
              lead={{ next_action: lead.next_action ?? null, next_action_date: lead.next_action_date ?? null, next_action_note: lead.next_action_note ?? null, next_action_time: lead.next_action_time ?? null }}
              onSave={save} onCancel={() => setOpen(false)} />
          )}
        </PopoverContent>
      </Popover>
      {v && (
        <Button variant="ghost" size="icon" className="h-7 w-7 text-green-500 hover:bg-green-500/10 hover:text-green-400"
          onClick={() => void save({ nextAction: 'none', date: null, note: lead.next_action_note ?? null, done: true })} title="Done — clear the next action" aria-label="Done — clear the next action">
          <CheckCircle2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
