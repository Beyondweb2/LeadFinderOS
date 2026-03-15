import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { CreditCard, X, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/hooks/useAuth';
import { useToast } from '@/hooks/use-toast';
import { getCheckoutAttribution } from '@/lib/checkoutAttribution';

interface UpgradeCornerPopupProps {
  visible: boolean;
}

const DISMISS_KEY = 'upgrade_corner_dismissed_session';

export function UpgradeCornerPopup({ visible }: UpgradeCornerPopupProps) {
  const { session } = useAuth();
  const { toast } = useToast();
  const [dismissed, setDismissed] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Reset on new session (sessionStorage clears on tab close)
  useEffect(() => {
    setDismissed(sessionStorage.getItem(DISMISS_KEY) === 'true');
  }, []);

  if (!visible || dismissed) return null;

  const handleDismiss = () => {
    setDismissed(true);
    sessionStorage.setItem(DISMISS_KEY, 'true');
  };

  const handleUpgrade = () => {
    const win = window.open('', '_blank');
    setIsLoading(true);
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('create-checkout', {
          headers: { Authorization: `Bearer ${session?.access_token}` },
        });
        if (error) throw error;
        if (data?.url) {
          if (win) win.location.href = data.url;
          else window.location.href = data.url;
          window.dispatchEvent(new CustomEvent('checkout-opened'));
        } else {
          win?.close();
        }
      } catch {
        win?.close();
        toast({ title: 'Error', description: 'Failed to start checkout', variant: 'destructive' });
      } finally {
        setIsLoading(false);
      }
    })();
  };

  return (
    <div className="fixed bottom-20 md:bottom-4 right-4 z-40 w-72 max-w-[calc(100vw-2rem)] bg-card border border-border rounded-lg shadow-lg p-4 space-y-2 animate-fade-in">
      <div className="flex items-start justify-between">
        <p className="text-sm font-semibold text-foreground">Get Unlimited Searches</p>
        <button
          onClick={handleDismiss}
          className="h-5 w-5 rounded-full hover:bg-muted flex items-center justify-center shrink-0"
          aria-label="Dismiss"
        >
          <X className="h-3.5 w-3.5 text-muted-foreground" />
        </button>
      </div>
      <p className="text-xs text-muted-foreground">
        Continue building your pipeline without limits.
      </p>
      <Button
        size="sm"
        className="w-full"
        disabled={isLoading}
        onClick={handleUpgrade}
      >
        {isLoading ? (
          <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Starting...</>
        ) : (
          <><CreditCard className="mr-1.5 h-3.5 w-3.5" />Unlock Unlimited — £19.99/mo</>
        )}
      </Button>
    </div>
  );
}
