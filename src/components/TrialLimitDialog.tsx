import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Check, Sparkles, Loader2 } from 'lucide-react';
import logoImg from '@/assets/logo.png';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useWalkthroughStatus } from '@/hooks/useWalkthroughStatus';

interface TrialLimitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  searchesToday?: number;
  dailyLimit?: number;
  totalBusinessesFound?: number;
  noWebsiteCount?: number;
}

export function TrialLimitDialog({ 
  open, 
  onOpenChange, 
  totalBusinessesFound = 0,
  noWebsiteCount = 0,
}: TrialLimitDialogProps) {
  const { session } = useAuth();
  const { toast } = useToast();
  const { walkthroughOpen } = useWalkthroughStatus();
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState({ businesses: 0, noWebsite: 0 });

  const shouldShow = open && !walkthroughOpen;

  useEffect(() => {
    if (!shouldShow) return;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const { data } = await supabase
        .from('search_history')
        .select('results_count, no_website_count')
        .eq('user_id', user.id);
      if (data) {
        const biz = data.reduce((s, r) => s + (r.results_count || 0), 0);
        const noWeb = data.reduce((s, r) => s + (r.no_website_count || 0), 0);
        setStats({ businesses: biz, noWebsite: noWeb });
      }
    })();
    try { supabase.rpc('log_usage_event', { p_event_type: 'trial_modal_opened' }); } catch {}
  }, [shouldShow]);

  const displayBiz = stats.businesses || totalBusinessesFound;
  const displayNoWeb = stats.noWebsite || noWebsiteCount;

  const handleCheckout = async () => {
    setIsLoading(true);
    try { supabase.rpc('log_usage_event', { p_event_type: 'trial_checkout_started' }); } catch {}
    const win = window.open('', '_blank');
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        headers: { Authorization: `Bearer ${session?.access_token}` },
      });
      if (error) throw error;
      if (data?.url) {
        if (win) win.location.href = data.url;
        else window.location.href = data.url;
        window.dispatchEvent(new CustomEvent('checkout-opened'));
        onOpenChange(false);
      } else {
        win?.close();
        throw new Error('No checkout URL');
      }
    } catch (err) {
      win?.close();
      toast({ title: 'Checkout failed', description: 'Please try again.', variant: 'destructive' });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={shouldShow} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden border-border/50 backdrop-blur-sm animate-in fade-in-0 zoom-in-95 duration-200">
        <div className="p-6 space-y-5">
          {/* Header */}
          <div className="text-center space-y-1.5">
            <img src={logoImg} alt="LeadFinder" className="mx-auto mb-3 h-11 w-11 rounded-full object-contain" />
            <h2 className="text-xl font-bold text-foreground">Unlock Unlimited Searches</h2>
            {displayNoWeb > 0 && (
              <p className="text-sm text-muted-foreground">
                You found <span className="font-semibold text-primary">{displayNoWeb}</span> businesses without websites.
              </p>
            )}
          </div>

          {/* Stats */}
          <div className="grid grid-cols-3 gap-2">
            <div className="text-center p-3 rounded-lg bg-muted/40 border border-border/50">
              <p className="text-xl font-bold text-foreground">{displayBiz}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Found</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-primary/5 border border-primary/15">
              <p className="text-xl font-bold text-primary">{displayNoWeb}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">No Website</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-muted/40 border border-border/50">
              <p className="text-xl font-bold text-foreground">{displayNoWeb}</p>
              <p className="text-[10px] text-muted-foreground mt-0.5">Potential Clients</p>
            </div>
          </div>

          {/* Benefits */}
          <div className="space-y-1.5">
            {[
              'Unlimited searches',
              'Target no-website businesses first',
              'Built-in CRM tracking',
              'One click WhatsApp, SMS and Call',
              'Proven outreach templates',
            ].map((text) => (
              <div key={text} className="flex items-center gap-2 text-sm text-foreground">
                <div className="flex h-4 w-4 items-center justify-center rounded-full bg-green-500/15 shrink-0">
                  <Check className="h-2.5 w-2.5 text-green-500" />
                </div>
                <span>{text}</span>
              </div>
            ))}
          </div>

          {/* Motivating line */}
          <p className="text-center text-sm font-medium text-foreground">
            Start turning these into paying clients.
          </p>

          {/* Pricing */}
          <p className="text-center text-xs text-muted-foreground">
            After 3 day free trial → £19.99/month
          </p>

          {/* CTA */}
          <div className="space-y-2">
            <Button
              onClick={handleCheckout}
              size="lg"
              className="w-full gap-2 text-base"
              disabled={isLoading}
            >
              {isLoading ? (
                <><Loader2 className="h-4 w-4 animate-spin" />Opening checkout...</>
              ) : (
                <><Sparkles className="h-4 w-4" />Get Unlimited Free Searches</>
              )}
            </Button>
            <p className="text-xs text-muted-foreground text-center">Cancel anytime</p>
            <button
              onClick={() => onOpenChange(false)}
              className="w-full text-xs text-muted-foreground/50 hover:text-muted-foreground transition-colors py-1"
              disabled={isLoading}
            >
              Maybe later
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
