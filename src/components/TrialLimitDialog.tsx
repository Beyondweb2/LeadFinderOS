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
import { Search, Check, Sparkles } from 'lucide-react';
import { useSubscription } from '@/hooks/useSubscription';
import { CheckoutConfirmDialog } from '@/components/CheckoutConfirmDialog';

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
  const { createCheckout } = useSubscription();
  const [showConfirm, setShowConfirm] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  const handleUpgrade = () => {
    onOpenChange(false);
    setShowConfirm(true);
  };

  const handleCheckout = async () => {
    setIsLoading(true);
    try { await createCheckout(); } catch { setIsLoading(false); }
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="text-center">
            <div className="mx-auto mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
              <Search className="h-6 w-6 text-primary" />
            </div>
            <DialogTitle className="text-xl">
              Unlock unlimited access
            </DialogTitle>
            <DialogDescription className="text-base">
              Upgrade to continue unlimited searches and keep building your pipeline.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4 space-y-4">
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
              Unlock unlimited — £19.99/month
            </Button>
            <p className="text-xs text-muted-foreground text-center">Cancel anytime</p>
            <Button 
              variant="ghost" 
              onClick={() => onOpenChange(false)}
              className="w-full text-muted-foreground"
            >
              Maybe later
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <CheckoutConfirmDialog
        open={showConfirm}
        onOpenChange={setShowConfirm}
        onConfirm={handleCheckout}
        isLoading={isLoading}
      />
    </>
  );
}
