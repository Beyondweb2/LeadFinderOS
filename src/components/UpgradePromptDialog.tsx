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
import { Sparkles, Check } from 'lucide-react';
import { useSubscription } from '@/hooks/useSubscription';
import { CheckoutConfirmDialog } from '@/components/CheckoutConfirmDialog';

interface UpgradePromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  searchesUsed: number;
}

const BENEFITS = [
  'Unlimited lead searches',
  'Full Outreach CRM access',
  'Contact tracking & notes',
  'Email & call templates',
];

export function UpgradePromptDialog({ open, onOpenChange, searchesUsed }: UpgradePromptDialogProps) {
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
              <Sparkles className="h-6 w-6 text-primary" />
            </div>
            <DialogTitle className="text-xl">
              You've completed {searchesUsed} searches!
            </DialogTitle>
            <DialogDescription className="text-base">
              Unlock 24-hour full access for unlimited searches and powerful features.
            </DialogDescription>
          </DialogHeader>

          <div className="py-4">
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
              Start 24-Hour Full Access – £19.99/mo
            </Button>
            <Button 
              variant="ghost" 
              onClick={() => onOpenChange(false)}
              className="w-full"
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
