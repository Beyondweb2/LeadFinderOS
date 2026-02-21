import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Check, Shield, Sparkles, Users, Target, Search, MessageSquare, Loader2, Clock } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface TrialLimitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  searchesToday?: number;
  dailyLimit?: number;
  totalBusinessesFound?: number;
  noWebsiteCount?: number;
}

const OUTREACH_STATUSES = ['sms', 'whatsapp', 'facebook_msg', 'contacted', 'sent_initial_text', 'sent_voice_note'];

export function TrialLimitDialog({ 
  open, 
  onOpenChange, 
  totalBusinessesFound = 0,
  noWebsiteCount = 0,
}: TrialLimitDialogProps) {
  const { user, session } = useAuth();
  const { toast } = useToast();
  const [isLoading, setIsLoading] = useState(false);

  // Real stats from DB
  const [stats, setStats] = useState({ businesses: 0, hotLeads: 0, crmLeads: 0, messagesSent: 0 });

  useEffect(() => {
    if (!open || !user) return;

    // Log analytics event
    try {
      supabase.rpc('log_usage_event', { p_event_type: 'trial_modal_opened' }).then(() => {});
    } catch {}

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

  const displayBusinesses = stats.businesses || totalBusinessesFound;
  const displayHotLeads = stats.hotLeads || noWebsiteCount;
  const percentage = displayBusinesses > 0 ? Math.round((displayHotLeads / displayBusinesses) * 100) : 0;

  const handleCheckoutDirect = async () => {
    console.log('[TrialLimitDialog] CTA clicked — initiating Stripe checkout');
    setIsLoading(true);

    // Log analytics
    try {
      supabase.rpc('log_usage_event', { p_event_type: 'trial_checkout_started' }).then(() => {});
    } catch {}
    
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
        throw new Error('No checkout URL returned');
      }
    } catch (err: any) {
      win?.close();
      console.error('[TrialLimitDialog] Checkout session creation failed:', err);
      toast({
        title: 'Checkout failed',
        description: 'Something went wrong opening checkout. Please try again.',
        variant: 'destructive',
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[90vh] overflow-y-auto">
        {/* ── A) Real Opportunity Snapshot ── */}
        <div className="text-center space-y-2 pt-2">
          <div className="mx-auto mb-1 flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Target className="h-6 w-6 text-primary" />
          </div>
          <h2 className="text-lg font-bold text-foreground">Real Opportunity Snapshot</h2>
          <div className="grid grid-cols-2 gap-3">
            <div className="text-center p-3 rounded-lg bg-muted/40 border border-border/50">
              <p className="text-2xl font-bold text-foreground">{displayBusinesses}</p>
              <p className="text-xs text-muted-foreground">Businesses found</p>
            </div>
            <div className="text-center p-3 rounded-lg bg-primary/5 border border-primary/15">
              <p className="text-2xl font-bold text-primary">{displayHotLeads}</p>
              <p className="text-xs font-medium text-primary">Without a website</p>
            </div>
          </div>
          {percentage > 0 && (
            <p className="text-sm text-muted-foreground">
              <span className="font-semibold text-foreground">{percentage}%</span> don't have a website yet
            </p>
          )}
        </div>

        {/* ── B) Personal Momentum Snapshot ── */}
        <div className="grid grid-cols-2 gap-3">
          <div className="text-center p-3 rounded-lg bg-muted/40 border border-border/50">
            <Users className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
            <p className="text-lg font-bold text-foreground">{stats.crmLeads}</p>
            <p className="text-xs text-muted-foreground">Businesses tracked</p>
          </div>
          <div className="text-center p-3 rounded-lg bg-muted/40 border border-border/50">
            <MessageSquare className="h-4 w-4 mx-auto text-muted-foreground mb-1" />
            <p className="text-lg font-bold text-foreground">{stats.messagesSent}</p>
            <p className="text-xs text-muted-foreground">Businesses contacted</p>
          </div>
        </div>

        {/* ── C) ROI Framing ── */}
        <div className="text-center py-3 px-4 rounded-lg bg-primary/5 border border-primary/10">
          <h3 className="text-base font-bold text-foreground">
            You're One Client Away From Covering This For Years.
          </h3>
          <p className="text-sm text-muted-foreground mt-1">
            Just one paying client from this list pays for access many times over.
          </p>
        </div>

        {/* ── D) Benefits list ── */}
        <div className="space-y-1.5">
          {[
            'Run unlimited searches',
            'Target businesses without websites first',
            'Track every prospect in built-in CRM',
            'Contact instantly via WhatsApp, SMS or Call',
            'Save notes and follow-ups',
            'Build a consistent outreach system',
            'Export and organise your pipeline',
            'Cancel anytime',
          ].map((text) => (
            <div key={text} className="flex items-center gap-2 text-sm text-foreground">
              <div className="flex h-4 w-4 items-center justify-center rounded-full bg-primary/10 shrink-0">
                <Check className="h-2.5 w-2.5 text-primary" />
              </div>
              <span>{text}</span>
            </div>
          ))}
        </div>

        {/* ── E) Trust block ── */}
        <div className="text-center space-y-1.5 py-2 px-3 rounded-md bg-muted/30 border border-border/40">
          <p className="text-xs text-muted-foreground">
            Used daily by freelancers and small agencies to find and close more clients.
          </p>
          <div className="flex items-center justify-center gap-3 text-xs text-muted-foreground">
            <span className="flex items-center gap-1"><Shield className="h-3 w-3" /> Secure Stripe payments</span>
            <span>No hidden charges</span>
            <span>No contracts</span>
          </div>
        </div>

        {/* ── F) Urgency ── */}
        <div className="text-center space-y-1">
          <div className="flex items-center justify-center gap-1.5 text-sm font-medium text-foreground">
            <Clock className="h-4 w-4 text-primary" />
            Your 3 day trial starts immediately.
          </div>
          <p className="text-xs text-muted-foreground">
            Use it properly. Decide after real results.
          </p>
        </div>

        {/* ── CTAs ── */}
        <DialogFooter className="flex-col gap-2 sm:flex-col pt-1">
          <Button 
            onClick={handleCheckoutDirect} 
            size="lg" 
            className="w-full gap-2 text-base animate-pulse hover:animate-none" 
            disabled={isLoading}
          >
            {isLoading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Opening checkout...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4" />
                Start 3 Day Free Trial
              </>
            )}
          </Button>
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