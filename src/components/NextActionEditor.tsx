import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Calendar } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Phone, Clock, FileText, Trash2, Circle, MessageSquare, Mic, RefreshCw, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import type { NextActionType } from '@/types/outreach';
import { NEXT_ACTION_OPTIONS } from '@/types/outreach';

interface NextActionEditorProps {
  action: NextActionType | null;
  date?: string | null;
  onUpdate: (action: NextActionType, date?: string) => void;
}

const actionIcons: Record<NextActionType, React.ReactNode> = {
  send_initial_text: <MessageSquare className="h-3 w-3" />,
  send_voice_note: <Mic className="h-3 w-3" />,
  send_follow_up: <RefreshCw className="h-3 w-3" />,
  '2nd_follow_up': <RefreshCw className="h-3 w-3" />,
  check_3_day_removal: <AlertTriangle className="h-3 w-3" />,
  call: <Phone className="h-3 w-3" />,
  follow_up: <Clock className="h-3 w-3" />,
  send_draft: <FileText className="h-3 w-3" />,
  remove_if_no_reply: <Trash2 className="h-3 w-3" />,
  none: <Circle className="h-3 w-3" />,
};

const actionColors: Record<NextActionType, string> = {
  send_initial_text: 'text-green-400',
  send_voice_note: 'text-purple-400',
  send_follow_up: 'text-amber-400',
  '2nd_follow_up': 'text-amber-500',
  check_3_day_removal: 'text-red-400',
  call: 'text-blue-400',
  follow_up: 'text-orange-400',
  send_draft: 'text-cyan-400',
  remove_if_no_reply: 'text-red-400',
  none: 'text-muted-foreground',
};

export function NextActionEditor({ action, date, onUpdate }: NextActionEditorProps) {
  const [open, setOpen] = useState(false);
  const [selectedAction, setSelectedAction] = useState<NextActionType>(action || 'call');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    date ? new Date(date) : undefined
  );

  const handleSave = () => {
    const dateStr = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : undefined;
    onUpdate(selectedAction, dateStr);
    setOpen(false);
  };

  const currentAction = action || 'none';
  const formattedDate = date
    ? new Date(date).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
      })
    : null;

  const isOverdue = date && new Date(date) < new Date(new Date().setHours(0, 0, 0, 0));
  const isToday = date && new Date(date).toDateString() === new Date().toDateString();

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="ghost"
          className={cn(
            'h-auto p-1 hover:bg-muted/50 flex flex-col items-start gap-0.5',
            actionColors[currentAction]
          )}
        >
          <div className="flex items-center gap-1.5">
            {actionIcons[currentAction]}
            <span className="text-sm">
              {NEXT_ACTION_OPTIONS.find((o) => o.value === currentAction)?.label || 'None'}
            </span>
          </div>
          {formattedDate && (
            <span
              className={cn(
                'text-xs',
                isOverdue ? 'text-red-400' : isToday ? 'text-yellow-400' : 'text-muted-foreground'
              )}
            >
              {isToday ? 'Today' : formattedDate}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-4" align="start">
        <div className="space-y-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">Next Action</label>
            <Select value={selectedAction} onValueChange={(v) => setSelectedAction(v as NextActionType)}>
              <SelectTrigger className="w-[200px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {NEXT_ACTION_OPTIONS.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value}>
                    <div className="flex items-center gap-2">
                      {actionIcons[opt.value]}
                      {opt.label}
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Due Date</label>
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              className={cn('p-3 pointer-events-auto rounded-md border')}
            />
          </div>

          <div className="flex justify-end gap-2">
            <Button variant="outline" size="sm" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" onClick={handleSave}>
              Save
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
