import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { 
  ThumbsUp, 
  ThumbsDown, 
  PhoneMissed, 
  Calendar, 
  PhoneOff,
  Voicemail,
  Loader2 
} from 'lucide-react';
import type { CallOutcome } from '@/hooks/useContactTracking';
import type { Lead } from '@/types/lead';

interface ContactDialogProps {
  lead: Lead | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSubmit: (leadId: string, leadName: string, outcome: CallOutcome, notes?: string) => Promise<any>;
  isLoading?: boolean;
}

const outcomeOptions: { value: CallOutcome; label: string; icon: React.ReactNode; color: string }[] = [
  { value: 'interested', label: 'Interested', icon: <ThumbsUp className="h-4 w-4" />, color: 'text-green-500' },
  { value: 'not_interested', label: 'Not Interested', icon: <ThumbsDown className="h-4 w-4" />, color: 'text-red-500' },
  { value: 'no_answer', label: 'No Answer', icon: <PhoneMissed className="h-4 w-4" />, color: 'text-yellow-500' },
  { value: 'callback_scheduled', label: 'Callback Scheduled', icon: <Calendar className="h-4 w-4" />, color: 'text-blue-500' },
  { value: 'left_voicemail', label: 'Left Voicemail', icon: <Voicemail className="h-4 w-4" />, color: 'text-purple-500' },
  { value: 'wrong_number', label: 'Wrong Number', icon: <PhoneOff className="h-4 w-4" />, color: 'text-muted-foreground' },
];

export function ContactDialog({ lead, open, onOpenChange, onSubmit, isLoading }: ContactDialogProps) {
  const [outcome, setOutcome] = useState<CallOutcome>('no_answer');
  const [notes, setNotes] = useState('');

  const handleSubmit = async () => {
    if (!lead) return;
    
    await onSubmit(lead.id, lead.name, outcome, notes);
    setNotes('');
    setOutcome('no_answer');
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[425px] bg-card border-border">
        <DialogHeader>
          <DialogTitle>Log Contact</DialogTitle>
          <DialogDescription>
            Record the outcome of your call with{' '}
            <span className="font-medium text-foreground">{lead?.name}</span>
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label>Call Outcome</Label>
            <RadioGroup
              value={outcome}
              onValueChange={(v) => setOutcome(v as CallOutcome)}
              className="grid grid-cols-2 gap-2"
            >
              {outcomeOptions.map((option) => (
                <div key={option.value}>
                  <RadioGroupItem
                    value={option.value}
                    id={option.value}
                    className="peer sr-only"
                  />
                  <Label
                    htmlFor={option.value}
                    className={`flex items-center gap-2 rounded-md border-2 border-muted bg-popover p-3 cursor-pointer
                      hover:bg-accent hover:text-accent-foreground
                      peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/10
                      ${option.color}`}
                  >
                    {option.icon}
                    <span className="text-sm text-foreground">{option.label}</span>
                  </Label>
                </div>
              ))}
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="notes">Notes (optional)</Label>
            <Textarea
              id="notes"
              placeholder="Add any relevant notes about the call..."
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="resize-none bg-background border-border"
              rows={3}
            />
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} className="border-border">
            Cancel
          </Button>
          <Button onClick={handleSubmit} disabled={isLoading}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            Save Contact
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
