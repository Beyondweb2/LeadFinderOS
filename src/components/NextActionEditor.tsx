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
import { Input } from '@/components/ui/input';
import { Phone, Clock, FileText, Trash2, Circle, MessageSquare, Mic, RefreshCw, AlertTriangle, Plus, Tag, CheckCircle2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import type { NextActionType } from '@/types/outreach';
import { NEXT_ACTION_OPTIONS } from '@/types/outreach';
import { useCustomNextActions, getLeadCustomAction, setLeadCustomAction } from '@/hooks/useCustomNextActions';

interface NextActionEditorProps {
  action: NextActionType | null;
  date?: string | null;
  onUpdate: (action: NextActionType, date?: string) => void;
  leadId?: string;
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

const CUSTOM_PREFIX = 'custom::';

export function getDisplayLabel(action: NextActionType | null, leadId?: string): string {
  if (!action || action === 'none') return 'None';
  // Check for custom action label
  if (leadId) {
    const customLabel = getLeadCustomAction(leadId);
    if (customLabel) return customLabel;
  }
  return NEXT_ACTION_OPTIONS.find((o) => o.value === action)?.label || 'None';
}

export function NextActionEditor({ action, date, onUpdate, leadId }: NextActionEditorProps) {
  const [open, setOpen] = useState(false);
  const [selectedAction, setSelectedAction] = useState<string>(action || 'call');
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(
    date ? new Date(date) : undefined
  );
  const [showCustomInput, setShowCustomInput] = useState(false);
  const [customName, setCustomName] = useState('');
  const { customActions, addAction } = useCustomNextActions();

  // Check if current lead has a custom action
  const currentCustomLabel = leadId ? getLeadCustomAction(leadId) : null;

  const handleSave = () => {
    const dateStr = selectedDate ? format(selectedDate, 'yyyy-MM-dd') : undefined;
    
    if (selectedAction.startsWith(CUSTOM_PREFIX)) {
      const label = selectedAction.slice(CUSTOM_PREFIX.length);
      // Store custom label for this lead, save as 'follow_up' in DB
      if (leadId) setLeadCustomAction(leadId, label);
      onUpdate('follow_up' as NextActionType, dateStr);
    } else {
      // Clear any custom label
      if (leadId) setLeadCustomAction(leadId, null);
      onUpdate(selectedAction as NextActionType, dateStr);
    }
    
    setOpen(false);
    if (selectedAction && selectedAction !== 'none' && selectedDate) {
      window.dispatchEvent(new CustomEvent('demo-checklist-next-action-set'));
    }
  };

  const handleAddCustom = () => {
    const trimmed = customName.trim();
    if (!trimmed) return;
    addAction(trimmed);
    setSelectedAction(`${CUSTOM_PREFIX}${trimmed}`);
    setShowCustomInput(false);
    setCustomName('');
  };

  const currentAction = action || 'none';
  const displayLabel = currentCustomLabel || NEXT_ACTION_OPTIONS.find((o) => o.value === currentAction)?.label || 'None';
  const colorClass = currentCustomLabel ? 'text-teal-400' : actionColors[currentAction as NextActionType] || 'text-muted-foreground';
  const iconEl = currentCustomLabel ? <Tag className="h-3 w-3" /> : actionIcons[currentAction as NextActionType] || <Circle className="h-3 w-3" />;

  const formattedDate = date
    ? new Date(date).toLocaleDateString('en-GB', {
        day: 'numeric',
        month: 'short',
      })
    : null;

  const isOverdue = date && new Date(date) < new Date(new Date().setHours(0, 0, 0, 0));
  const isToday = date && new Date(date).toDateString() === new Date().toDateString();

  // Determine selected value for Select component
  const selectValue = selectedAction.startsWith(CUSTOM_PREFIX) 
    ? selectedAction 
    : selectedAction;

  const showCompleteButton = action && action !== 'none';

  return (
    <div className="flex items-center gap-1" data-walkthrough-step="follow-up">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            className={cn(
              'h-auto p-1 hover:bg-muted/50 flex flex-col items-start gap-0.5',
              colorClass
            )}
          >
            <div className="flex items-center gap-1.5">
              {iconEl}
              <span className="text-sm">{displayLabel}</span>
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
            <Select value={selectValue} onValueChange={(v) => { setSelectedAction(v); setShowCustomInput(false); }}>
              <SelectTrigger className="w-[220px]">
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
                {customActions.length > 0 && (
                  <>
                    <div className="h-px bg-border my-1" />
                    {customActions.map((ca) => (
                      <SelectItem key={ca.id} value={`${CUSTOM_PREFIX}${ca.label}`}>
                        <div className="flex items-center gap-2">
                          <Tag className="h-3 w-3 text-teal-400" />
                          {ca.label}
                        </div>
                      </SelectItem>
                    ))}
                  </>
                )}
              </SelectContent>
            </Select>

            {!showCustomInput ? (
              <Button
                variant="ghost"
                size="sm"
                className="w-full justify-start text-xs text-muted-foreground hover:text-foreground"
                onClick={() => setShowCustomInput(true)}
              >
                <Plus className="h-3 w-3 mr-1.5" />
                Add custom action
              </Button>
            ) : (
              <div className="flex gap-1.5">
                <Input
                  value={customName}
                  onChange={(e) => setCustomName(e.target.value)}
                  placeholder="e.g. Send Proposal"
                  className="h-8 text-sm"
                  autoFocus
                  onKeyDown={(e) => e.key === 'Enter' && handleAddCustom()}
                />
                <Button size="sm" className="h-8 px-3" onClick={handleAddCustom}>
                  Add
                </Button>
              </div>
            )}
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
    {showCompleteButton && (
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-green-500 hover:text-green-400 hover:bg-green-500/10"
        onClick={() => onUpdate('none' as NextActionType)}
        title="Mark action as done"
      >
        <CheckCircle2 className="h-4 w-4" />
      </Button>
    )}
    </div>
  );
}
