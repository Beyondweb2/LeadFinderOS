import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Check, Sparkles, Users, Target, Search, MessageSquare, Loader2 } from 'lucide-react';
import { useSubscription } from '@/hooks/useSubscription';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface TrialLimitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  searchesToday: number;
  dailyLimit: number;
  totalBusinessesFound?: number;
  noWebsiteCount?: number;
}

const OUTREACH_STATUSES = ['sms', 'whatsapp', 'facebook_msg', 'contacted', 'sent_initial_text', 'sent_voice_note'];

export function TrialLimitDialog({ 
  open, 
  onOpenChange, 
  searchesToday, 
  dailyLimit,
  totalBusinessesFound = 0,
  noWebsiteCount = 0,
}: TrialLimitDialogProps) {
  const { createCheckout } = useSubscription();
  const { user } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  // Real stats from DB
  const [stats, setStats] = useState({ businesses: 0, hotLeads: 0, crmLeads: 0, messagesSent: 0 });

  useEffect(() => {
    if (!open || !user) return;
    (async () => {
      const [searchRes, leadsRes] = await Promise.all([
        supabase.from('search_history').select('results_count, no_website_count').eq('user_id', user.id),
        supabase.from('outreach_leads').select('status').eq('user_id', user.id),
      ]);
      const searches = searchRes.data || [];
      const leads = leadsRes.data || [];
      const totalBiz = searches.reduce((s, r) => s + (r.results_count || 0), 0);
      const hotLeads = searches.reduce((s, r) => s + (r.no_website_count || 0), 0);
      const messagesSent = leads.filter(l => OUTREACH_STATUSES.includes(l.status)).length;
      setStats({ businesses: totalBiz, hotLeads, crmLeads: leads.length, messagesSent });
    })();
  }, [open, user]);

  const handleCheckoutDirect = async () => {
    console.log('[TrialLimitDialog] CTA clicked — initiating Stripe checkout');
    setIsLoading(true);
    try {
      await createCheckout();
      // createCheckout redirects via window.location.href, so we won't reach here normally
    } catch (err: any) {
      console.error('[TrialLimitDialog] Checkout session creation failed:', err);
      setIsLoading(false);
      toast({
        title: 'Checkout failed',
        description: 'Something went wrong opening checkout. Please try again.',
        variant: 'destructive',
      });
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-center space-y-3">
          <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Sparkles className="h-7 w-7 text-primary" />
          </div>
          <DialogTitle className="text-xl font-bold">
            The system works. Now scale it.
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            You've already found businesses without websites. Unlimited access removes the limit.
          </DialogDescription>
        </DialogHeader>

        <div className="py-2 space-y-3">
          {/* Hot Leads — hero metric */}
          <div className="text-center p-4 rounded-lg bg-primary/5 border border-primary/15 shadow-[0_0_12px_-4px_hsl(var(--primary)/0.2)]">
            <Target className="h-5 w-5 mx-auto text-primary mb-1" />
            <p className="text-2xl font-bold text-foreground">{stats.hotLeads || noWebsiteCount}</p>
            <p className="text-xs font-medium text-primary">Hot Leads (No Website)</p>
          </div>

          {/* Secondary metrics */}
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: 'Businesses Found', value: stats.businesses || totalBusinessesFound, icon: Search },
              { label: 'Added to CRM', value: stats.crmLeads, icon: Users },
              { label: 'Messages Sent', value: stats.messagesSent, icon: MessageSquare },
            ].map((s) => {
              const Icon = s.icon;
              return (
                <div key={s.label} className="text-center p-2 rounded-lg bg-muted/40 border border-border/50 space-y-0.5">
                  <Icon className="h-3.5 w-3.5 mx-auto text-muted-foreground" />
                  <p className="text-sm font-semibold text-foreground">{s.value}</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">{s.label}</p>
                </div>
              );
            })}
          </div>

          {/* Revenue reframing */}
          <div className="text-center py-2 px-3 rounded-md bg-muted/30 border border-border/50">
            <p className="text-sm font-medium text-foreground">
              One client could pay for your access for an entire year.
            </p>
          </div>

          {/* Benefits */}
          <div>
            <ul className="space-y-1">
              {[
                'Unlimited lead searches',
                'Full Outreach CRM & pipeline',
                'Track leads from first contact to paid client',
              ].map((text) => (
                <li key={text} className="flex items-center gap-2 text-sm text-foreground">
                  <div className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/10 shrink-0">
                    <Check className="h-2.5 w-2.5 text-primary" />
                  </div>
                  <span>{text}</span>
                </li>
              ))}
            </ul>
          </div>
        </div>

        <DialogFooter className="flex-col gap-2 sm:flex-col">
          <Button onClick={handleCheckoutDirect} size="lg" className="w-full gap-2 text-base" disabled={isLoading}>
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Opening checkout...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Unlock Unlimited — £19.99/month
              </>
            )}
          </Button>
          <p className="text-xs text-muted-foreground text-center">Cancel anytime · No commitment</p>
          <Button 
            variant="ghost" 
            onClick={() => onOpenChange(false)}
            className="w-full text-muted-foreground/60 text-xs hover:text-muted-foreground"
            disabled={isLoading}
          >
            Maybe later
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
