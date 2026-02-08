import { useNavigate } from 'react-router-dom';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Lock, Check, Clock } from 'lucide-react';

interface TrialLimitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  searchesToday: number;
  dailyLimit: number;
}

const BENEFITS = [
  'Unlimited lead searches',
  'Full Outreach CRM access',
  'Contact tracking & notes',
  'Email & call templates',
];

export function TrialLimitDialog({ open, onOpenChange, searchesToday, dailyLimit }: TrialLimitDialogProps) {
  const navigate = useNavigate();

  const handleUpgrade = () => {
    onOpenChange(false);
    navigate('/subscribe');
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-center">
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-destructive/10">
            <Lock className="h-6 w-6 text-destructive" />
          </div>
          <DialogTitle className="text-xl">
            You've reached today's search limit
          </DialogTitle>
          <DialogDescription className="text-base">
            Unlock unlimited searches with LeadFinder Pro
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
            <Clock className="h-4 w-4" />
            <span>{searchesToday} of {dailyLimit} daily searches used</span>
          </div>
          
          <ul className="space-y-2">
            {BENEFITS.map((benefit) => (
              <li key={benefit} className="flex items-center gap-2 text-sm">
                <Check className="h-4 w-4 text-primary shrink-0" />
                <span>{benefit}</span>
              </li>
            ))}
          </ul>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button onClick={handleUpgrade} className="w-full">
            Upgrade to Pro
          </Button>
          <Button 
            variant="ghost" 
            onClick={() => onOpenChange(false)}
            className="w-full text-muted-foreground"
          >
            Come back tomorrow
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
