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
import { Search, Check, Sparkles } from 'lucide-react';

interface TrialLimitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  searchesToday: number;
  dailyLimit: number;
}

const UPGRADE_BENEFITS = [
  'Unlimited lead searches',
  'Advanced search filters',
  'Full Outreach CRM access',
  'Priority support',
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
          <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Search className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-xl">
            You've reached your free trial limit
          </DialogTitle>
          <DialogDescription className="text-base">
            Upgrade to unlock unlimited searches and continue finding businesses without websites.
          </DialogDescription>
        </DialogHeader>

        <div className="py-4 space-y-4">
          <div className="flex items-center justify-center gap-2 text-sm text-muted-foreground bg-muted/50 rounded-lg py-2 px-3">
            <span>{searchesToday} of {dailyLimit} daily searches used</span>
          </div>
          
          <div className="space-y-2">
            <p className="text-sm font-medium text-foreground">What you'll unlock:</p>
            <ul className="space-y-2">
              {UPGRADE_BENEFITS.map((benefit) => (
                <li key={benefit} className="flex items-center gap-2 text-sm text-muted-foreground">
                  <Check className="h-4 w-4 text-primary shrink-0" />
                  <span>{benefit}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button onClick={handleUpgrade} className="w-full gap-2">
            <Sparkles className="h-4 w-4" />
            Unlock unlimited searches
          </Button>
          <Button 
            variant="ghost" 
            onClick={() => onOpenChange(false)}
            className="w-full text-muted-foreground"
          >
            Continue with trial
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
