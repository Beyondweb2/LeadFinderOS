import { useState } from 'react';
import { format } from 'date-fns';
import { CalendarIcon, Plus, Trash2, StickyNote, CheckCircle } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { usePersonalActions } from '@/hooks/usePersonalActions';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';

interface NotepadModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function NotepadContent({ onClose }: { onClose: () => void }) {
  const { activeActions, completedActions, isLoading, addAction, toggleComplete, deleteAction } = usePersonalActions();
  const [newText, setNewText] = useState('');
  const [dueDate, setDueDate] = useState<Date | undefined>();
  const [dateOpen, setDateOpen] = useState(false);

  const handleAdd = async () => {
    const trimmed = newText.trim();
    if (!trimmed) return;
    await addAction(trimmed, dueDate ? format(dueDate, 'yyyy-MM-dd') : undefined);
    setNewText('');
    setDueDate(undefined);
  };

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const formatDue = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    d.setHours(0, 0, 0, 0);
    if (d.getTime() === today.getTime()) return 'Today';
    const diff = Math.ceil((d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diff === 1) return 'Tomorrow';
    if (diff < 0) return 'Overdue';
    if (diff <= 7) return `In ${diff}d`;
    return format(d, 'MMM d');
  };

  const isOverdue = (dateStr: string) => {
    const d = new Date(dateStr + 'T00:00:00');
    d.setHours(0, 0, 0, 0);
    return d < today;
  };

  return (
    <div className="flex flex-col h-full">
      {/* Add action input */}
      <div className="space-y-2 mb-4">
        <div className="flex gap-2">
          <Input
            value={newText}
            onChange={e => setNewText(e.target.value)}
            placeholder="Add a new action..."
            className="flex-1"
            onKeyDown={e => { if (e.key === 'Enter') handleAdd(); }}
          />
          <Popover open={dateOpen} onOpenChange={setDateOpen}>
            <PopoverTrigger asChild>
              <Button variant="outline" size="icon" className={cn('shrink-0', dueDate && 'text-primary border-primary/30')}>
                <CalendarIcon className="h-4 w-4" />
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="end">
              <Calendar
                mode="single"
                selected={dueDate}
                onSelect={(d) => { setDueDate(d); setDateOpen(false); }}
                initialFocus
                className="p-3 pointer-events-auto"
              />
            </PopoverContent>
          </Popover>
        </div>
        <div className="flex items-center justify-between">
          {dueDate ? (
            <span className="text-xs text-muted-foreground">
              Due: {format(dueDate, 'MMM d, yyyy')}
              <button onClick={() => setDueDate(undefined)} className="ml-2 text-destructive hover:underline">clear</button>
            </span>
          ) : (
            <span className="text-xs text-muted-foreground">Optional: set a due date</span>
          )}
          <Button size="sm" onClick={handleAdd} disabled={!newText.trim()} className="gap-1">
            <Plus className="h-3.5 w-3.5" />
            Add
          </Button>
        </div>
      </div>

      {/* Actions list */}
      <ScrollArea className="flex-1 -mx-1 px-1">
        {isLoading ? (
          <div className="flex items-center justify-center py-8">
            <div className="h-5 w-5 border-2 border-primary border-t-transparent rounded-full animate-spin" />
          </div>
        ) : activeActions.length === 0 && completedActions.length === 0 ? (
          <div className="text-center py-10 space-y-2">
            <StickyNote className="h-8 w-8 text-muted-foreground/40 mx-auto" />
            <p className="text-sm text-muted-foreground">No actions yet</p>
            <p className="text-xs text-muted-foreground/60">Add your first personal action above</p>
          </div>
        ) : (
          <div className="space-y-4">
            {activeActions.length > 0 && (
              <div className="space-y-1">
                {activeActions.map(action => (
                  <div key={action.id} className="flex items-start gap-2.5 p-2.5 rounded-lg hover:bg-muted/50 transition-colors group">
                    <Checkbox
                      checked={false}
                      onCheckedChange={() => toggleComplete(action.id, true)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm leading-tight break-words">{action.text}</p>
                      {action.due_date && (
                        <span className={cn(
                          'text-[11px] font-medium mt-0.5 inline-block',
                          isOverdue(action.due_date) ? 'text-red-500' : 'text-amber-500'
                        )}>
                          {formatDue(action.due_date)}
                        </span>
                      )}
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => deleteAction(action.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}

            {completedActions.length > 0 && (
              <div className="space-y-1">
                <p className="text-[11px] font-medium text-muted-foreground/60 uppercase tracking-wider px-2.5 pt-2">
                  Completed ({completedActions.length})
                </p>
                {completedActions.map(action => (
                  <div key={action.id} className="flex items-start gap-2.5 p-2.5 rounded-lg hover:bg-muted/50 transition-colors group opacity-60">
                    <Checkbox
                      checked={true}
                      onCheckedChange={() => toggleComplete(action.id, false)}
                      className="mt-0.5"
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm leading-tight break-words line-through">{action.text}</p>
                    </div>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-6 w-6 opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive shrink-0"
                      onClick={() => deleteAction(action.id)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </ScrollArea>
    </div>
  );
}

export function NotepadModal({ open, onOpenChange }: NotepadModalProps) {
  const isMobile = useIsMobile();

  if (isMobile) {
    return (
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent side="bottom" className="h-[85vh] rounded-t-2xl bg-card border-border p-0">
          <SheetHeader className="p-5 pb-3 border-b border-border">
            <SheetTitle className="flex items-center gap-2 text-foreground">
              <StickyNote className="h-5 w-5 text-primary" />
              Notepad
            </SheetTitle>
          </SheetHeader>
          <div className="p-5 h-[calc(85vh-80px)]">
            <NotepadContent onClose={() => onOpenChange(false)} />
          </div>
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[70vh] flex flex-col">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <StickyNote className="h-5 w-5 text-primary" />
            Notepad
          </DialogTitle>
        </DialogHeader>
        <div className="flex-1 min-h-0">
          <NotepadContent onClose={() => onOpenChange(false)} />
        </div>
      </DialogContent>
    </Dialog>
  );
}
