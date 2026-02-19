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
import { Check, Sparkles, TrendingUp, Users, Target, Rocket } from 'lucide-react';
import { useSubscription } from '@/hooks/useSubscription';
import { CheckoutConfirmDialog } from '@/components/CheckoutConfirmDialog';

interface TrialLimitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  searchesToday: number;
  dailyLimit: number;
  totalBusinessesFound?: number;
  noWebsiteCount?: number;
}

const UPGRADE_BENEFITS = [
  { text: 'Unlimited lead searches', icon: Rocket },
  { text: 'Full Outreach CRM & pipeline', icon: Target },
  { text: 'Track leads from first contact to paid client', icon: TrendingUp },
  { text: 'Priority support', icon: Users },
];

export function TrialLimitDialog({ 
  open, 
  onOpenChange, 
  searchesToday, 
  dailyLimit,
  totalBusinessesFound = 0,
  noWebsiteCount = 0,
}: TrialLimitDialogProps) {
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

  const hasStats = totalBusinessesFound > 0 || noWebsiteCount > 0;

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="text-center space-y-3">
            <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <Sparkles className="h-7 w-7 text-primary" />
            </div>
            <DialogTitle className="text-xl font-bold">
              {noWebsiteCount > 0
                ? `You've found ${noWebsiteCount} potential clients`
                : hasStats
                  ? `You've found ${totalBusinessesFound} businesses`
                  : 'Unlock unlimited access'}
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              {noWebsiteCount > 0 
                ? `${noWebsiteCount} business${noWebsiteCount !== 1 ? 'es' : ''} without a website — each one is a potential client. If just one closes at £800, that's £800 from a single search.`
                : 'You\'ve used your free searches. Unlock unlimited to keep building your pipeline.'}
            </DialogDescription>
          </DialogHeader>

          <div className="py-3 space-y-4">
            {/* Social proof */}
            <div className="text-center p-3 rounded-lg bg-muted/50 border border-border">
              <p className="text-sm font-medium text-foreground">
                💰 Users who upgrade close their first deal within 2 weeks
              </p>
            </div>

            {/* Benefits */}
            <div className="space-y-2.5">
              <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">What you'll get:</p>
              <ul className="space-y-2">
                {UPGRADE_BENEFITS.map(({ text, icon: Icon }) => (
                  <li key={text} className="flex items-center gap-2.5 text-sm text-foreground">
                    <div className="flex h-5 w-5 items-center justify-center rounded-full bg-primary/10 shrink-0">
                      <Check className="h-3 w-3 text-primary" />
                    </div>
                    <span>{text}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <DialogFooter className="flex-col gap-2 sm:flex-col">
            <Button onClick={handleUpgrade} size="lg" className="w-full gap-2 text-base">
              <Sparkles className="h-4 w-4" />
              Unlock unlimited — £19.99/month
            </Button>
            <p className="text-xs text-muted-foreground text-center">Cancel anytime · No commitment</p>
            <Button 
              variant="ghost" 
              onClick={() => onOpenChange(false)}
              className="w-full text-muted-foreground text-sm"
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
