import { useState } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Lock, Loader2 } from 'lucide-react';
import { useSubscription } from '@/hooks/useSubscription';

interface FreeAccessPaywallProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function FreeAccessPaywall({ open, onOpenChange }: FreeAccessPaywallProps) {
  const { createCheckout } = useSubscription();
  const [isLoading, setIsLoading] = useState(false);

  const handleUpgrade = async () => {
    setIsLoading(true);
    try {
      await createCheckout();
    } catch {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg p-0 border-0 bg-transparent shadow-none [&>button]:hidden">
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          {/* Top accent */}
          <div className="h-1 w-full bg-gradient-to-r from-primary/60 via-primary to-primary/60" />
          
          <div className="flex flex-col items-center px-8 py-10 sm:px-12 sm:py-14 gap-6 text-center">
            <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/10 border border-primary/20">
              <Lock className="h-8 w-8 text-primary" />
            </div>
            
            <div className="space-y-3">
              <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-foreground">
                Unlock unlimited access
              </h2>
              <p className="text-base text-muted-foreground max-w-sm mx-auto leading-relaxed">
                Upgrade to continue unlimited searches and keep everything organised in one place.
              </p>
            </div>

            <div className="w-full max-w-xs space-y-3 pt-2">
              <Button
                size="lg"
                className="w-full font-semibold py-4 h-auto text-base"
                onClick={handleUpgrade}
                disabled={isLoading}
              >
                {isLoading ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Redirecting...
                  </>
                ) : (
                  'Unlock unlimited — £19.99/month'
                )}
              </Button>
              <p className="text-sm text-muted-foreground">
                Cancel anytime
              </p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
