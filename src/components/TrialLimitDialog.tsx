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
import { Check, Sparkles, TrendingUp, Users, Target, Rocket, Search, MessageSquare, Loader2 } from 'lucide-react';
import { useSubscription } from '@/hooks/useSubscription';
import { CheckoutConfirmDialog } from '@/components/CheckoutConfirmDialog';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

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
  const [showConfirm, setShowConfirm] = useState(false);
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

  const handleUpgrade = () => {
    onOpenChange(false);
    setShowConfirm(true);
  };

  const handleCheckout = async () => {
    setIsLoading(true);
    try { await createCheckout(); } catch { setIsLoading(false); }
  };

  const statItems = [
    { label: 'Businesses Found', value: stats.businesses || totalBusinessesFound, icon: Search },
    { label: 'Hot Leads (No Website)', value: stats.hotLeads || noWebsiteCount, icon: Target },
    { label: 'Added to CRM', value: stats.crmLeads, icon: Users },
    { label: 'Messages Sent', value: stats.messagesSent, icon: MessageSquare },
  ];

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader className="text-center space-y-3">
            <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
              <Sparkles className="h-7 w-7 text-primary" />
            </div>
            <DialogTitle className="text-xl font-bold">
              You've built a real pipeline
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground">
              Here's what you've accomplished so far — imagine what unlimited access could do.
            </DialogDescription>
          </DialogHeader>

          <div className="py-3 space-y-4">
            {/* Stats grid */}
            <div className="grid grid-cols-2 gap-3">
              {statItems.map((s) => {
                const Icon = s.icon;
                return (
                  <div key={s.label} className="text-center p-3 rounded-lg bg-muted/50 border border-border space-y-1">
                    <Icon className="h-4 w-4 mx-auto text-primary/70" />
                    <p className="text-lg font-bold text-foreground">{s.value}</p>
                    <p className="text-[11px] text-muted-foreground leading-tight">{s.label}</p>
                  </div>
                );
              })}
            </div>

            {/* Revenue reframing */}
            <div className="text-center p-3 rounded-lg bg-primary/5 border border-primary/10">
              <p className="text-sm font-medium text-foreground">
                💰 One closed deal at £800 could cover <span className="text-primary font-bold">months</span> of access
              </p>
              <p className="text-xs text-muted-foreground mt-1">
                Users who upgrade close their first deal within 2 weeks
              </p>
            </div>

            {/* Benefits */}
            <div className="space-y-2">
              <ul className="space-y-1.5">
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
            <Button onClick={handleUpgrade} size="lg" className="w-full gap-2 text-base">
              <Sparkles className="h-4 w-4" />
              Unlock Unlimited — £19.99/month
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
