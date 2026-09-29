import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { CalendarClock, CalendarIcon, CheckCircle2, Plus } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import type { NextActionType } from '@/types/outreach';
import { NEXT_ACTION_OPTIONS } from '@/lib/salesCrm';
import { NEXT_ACTION_LABEL, nextActionViewOf } from '@/lib/nextActionView';

/* THE OUTREACH ROW'S NEXT ACTION CELL (UI cleanup pass, 2026-09-29).
   ⛔ ONE NEXT ACTION: the same stored columns, the same four choices and the same words as the lead
   popup (NEXT_ACTION_OPTIONS in src/lib/salesCrm.ts, drawn by src/lib/nextActionView.ts), so a lead
   reads the same in Outreach, the Inbox, Focus Mode and the popup.
   ⛔ REMOVED: "Add custom action". Its labels lived only in this browser's localStorage and were saved
   to the database as a plain 'follow_up' — another device, another person or the Inbox saw
   "Follow up". What to do, in words, is the popup's note field, which is stored and shown everywhere.
   Colour follows urgency: red overdue, amber today, grey later. */

interface NextActionEditorProps {
  action: NextActionType | null;
  date?: string | null;
  onUpdate: (action: NextActionType, date?: string) => void;
  leadId?: string;
}

const BUCKET_TEXT = { overdue: 'text-red-600 dark:text-red-400', today: 'text-amber-600 dark:text-amber-400', upcoming: 'text-muted-foreground', none: 'text-muted-foreground' } as const;

export function NextActionEditor({ action, date, onUpdate }: NextActionEditorProps) {
  const [open, setOpen] = useState(false);
  const [selectedAction, setSelectedAction] = useState<string>(action || '');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(date ? new Date(`${date.slice(0, 10)}T12:00:00`) : undefined);
  const [dateOpen, setDateOpen] = useState(false);
  // Track whether the person actively picked something (not just the initial value).
  const [actionPicked, setActionPicked] = useState(false);
  const [datePicked, setDatePicked] = useState(false);

  useEffect(() => {
    if (open) {
      setSelectedAction(action && action !== 'none' ? action : '');
      setSelectedDate(date ? new Date(`${date.slice(0, 10)}T12:00:00`) : undefined);
      setActionPicked(false);
      setDatePicked(false);
    }
  }, [open, action, date]);

  // Auto-save when both an action and a date are set and the person picked one of them.
  useEffect(() => {
    const hasAction = selectedAction && selectedAction !== '' && selectedAction !== 'none';
    const hasDate = !!selectedDate;
    const shouldAutoSave = hasAction && hasDate && (actionPicked || datePicked);
    if (shouldAutoSave) {
      const t = setTimeout(() => handleSave(), 400);
      return () => clearTimeout(t);
    }
  }, [actionPicked, datePicked, selectedAction, selectedDate]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSave = () => {
    onUpdate(selectedAction as NextActionType, selectedDate ? format(selectedDate, 'yyyy-MM-dd') : undefined);
    setOpen(false);
  };

  const v = nextActionViewOf(action, date);
  const choices = NEXT_ACTION_OPTIONS.filter((o) => o.value !== 'none');
  const legacy = selectedAction && !choices.some((o) => o.value === selectedAction) ? selectedAction : null;

  return (
    <div className="flex items-center gap-1" data-walkthrough-step="follow-up" data-walkthrough="next-action">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button variant="ghost" className="flex h-auto flex-col items-start gap-0.5 p-1 hover:bg-muted/50" title={v ? `Next action: ${v.label}${v.when ? ` · ${v.when}` : ''}` : 'Set a next action'}>
            {v ? (
              <>
                <span className="flex items-center gap-1.5 text-sm font-medium text-foreground"><CalendarClock className="h-3 w-3" />{v.label}</span>
                {v.when && <span className={cn('text-xs font-semibold', BUCKET_TEXT[v.bucket])}>{v.when}</span>}
              </>
            ) : (
              <span className="flex items-center gap-1 text-xs text-muted-foreground"><Plus className="h-3 w-3" />Set</span>
            )}
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-auto p-4" align="start">
          <div className="space-y-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">Next action</label>
              <Select value={selectedAction} onValueChange={(val) => { setSelectedAction(val); setActionPicked(true); }}>
                <SelectTrigger className="w-[220px]" data-walkthrough-step="follow-up-action" data-action-selected={actionPicked ? 'true' : 'false'}>
                  <SelectValue placeholder="Choose…" />
                </SelectTrigger>
                <SelectContent>
                  {choices.map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                  {legacy && <SelectItem value={legacy}>{NEXT_ACTION_LABEL[legacy] ?? legacy.replace(/_/g, ' ')}</SelectItem>}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">When</label>
              <Popover open={dateOpen} onOpenChange={setDateOpen}>
                <PopoverTrigger asChild>
                  <Button variant="outline" className={cn('w-[220px] justify-start text-left font-normal', !selectedDate && 'text-muted-foreground')} data-walkthrough-step="follow-up-date">
                    <CalendarIcon className="mr-2 h-4 w-4" />
                    {selectedDate ? format(selectedDate, 'EEE d MMM yyyy') : 'Pick a date'}
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="start">
                  <Calendar mode="single" selected={selectedDate} onSelect={(d) => { setSelectedDate(d); setDatePicked(true); setDateOpen(false); }} className="p-3 pointer-events-auto" />
                </PopoverContent>
              </Popover>
            </div>
            <p className="max-w-[220px] text-[11px] text-muted-foreground">Saves when both are picked. To add what to do in words, open the lead.</p>
            <div className="flex justify-end">
              <Button variant="outline" size="sm" onClick={() => setOpen(false)}>Cancel</Button>
            </div>
          </div>
        </PopoverContent>
      </Popover>
      {v && (
        <Button variant="ghost" size="icon" className="h-7 w-7 text-green-500 hover:bg-green-500/10 hover:text-green-400" onClick={() => onUpdate('none' as NextActionType)} title="Done — clear the next action" aria-label="Done — clear the next action">
          <CheckCircle2 className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}
