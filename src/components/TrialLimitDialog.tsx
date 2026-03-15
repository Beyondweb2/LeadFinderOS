import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';
import { Loader2, ArrowRight } from 'lucide-react';
import appLogo from '@/assets/logo.png';
import { getCheckoutAttribution } from '@/lib/checkoutAttribution';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useWalkthroughStatus } from '@/hooks/useWalkthroughStatus';

function useCountUp(target: number, shouldRun: boolean, duration = 500) {
  const [value, setValue] = useState(0);
  const hasRun = useRef(false);
  useEffect(() => {
    if (!shouldRun || hasRun.current || target <= 0) return;
    hasRun.current = true;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      setValue(Math.round(t * target));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [shouldRun, target, duration]);
  return value;
}

interface TrialLimitDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  searchesToday?: number;
  dailyLimit?: number;
  totalBusinessesFound?: number;
  noWebsiteCount?: number;
}

export function TrialLimitDialog({ open, onOpenChange, totalBusinessesFound = 0, noWebsiteCount = 0 }: TrialLimitDialogProps) {
  const { t } = useTranslation();
  const { session } = useAuth();
  const { toast } = useToast();
  const { walkthroughOpen } = useWalkthroughStatus();
  const [isLoading, setIsLoading] = useState(false);
  const [stats, setStats] = useState({ businesses: 0, noWebsite: 0, messages: 0 });

  const shouldShow = open && !walkthroughOpen;

  useEffect(() => {
    if (!shouldShow) return;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;
        const [searchRes, metricsRes] = await Promise.all([
          supabase.from('search_history').select('results_count, no_website_count').eq('user_id', user.id),
          supabase.from('user_metrics').select('messages_sent_count').eq('user_id', user.id).maybeSingle(),
        ]);
        const data = searchRes.data;
        if (data) {
          const biz = data.reduce((s, r) => s + (r.results_count || 0), 0);
          const noWeb = data.reduce((s, r) => s + (r.no_website_count || 0), 0);
          const messages = metricsRes.data?.messages_sent_count || 0;
          setStats({ businesses: biz, noWebsite: noWeb, messages });
        }
      } catch {}
    })();
    try { supabase.rpc('log_usage_event', { p_event_type: 'trial_modal_opened' }); } catch {}
  }, [shouldShow]);

  const displayBiz = stats.businesses || totalBusinessesFound;
  const displayNoWeb = stats.noWebsite || noWebsiteCount;
  const displayMessages = stats.messages;

  const animBiz = useCountUp(displayBiz, shouldShow);
  const animNoWeb = useCountUp(displayNoWeb, shouldShow);
  const animMessages = useCountUp(displayMessages, shouldShow);

  const handleCheckout = async () => {
    setIsLoading(true);
    try { supabase.rpc('log_usage_event', { p_event_type: 'trial_checkout_started' }); } catch {}
    const win = window.open('', '_blank');
    try {
      const { data, error } = await supabase.functions.invoke('create-checkout', {
        headers: { Authorization: `Bearer ${session?.access_token}` },
        body: getCheckoutAttribution(),
      });
      if (error) throw error;
      if (data?.url) {
        if (win) win.location.href = data.url; else window.location.href = data.url;
        window.dispatchEvent(new CustomEvent('checkout-opened'));
        onOpenChange(false);
      } else { win?.close(); throw new Error('No checkout URL'); }
    } catch (err) {
      win?.close();
      toast({ title: t('checkout.checkoutFailed'), description: t('checkout.checkoutFailedDesc'), variant: 'destructive' });
    } finally { setIsLoading(false); }
  };

  return (
    <Dialog open={shouldShow} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px] p-0 overflow-hidden rounded-2xl border-border/40 bg-[hsl(220_50%_5%)]">
        <DialogTitle className="sr-only">{t('checkout.unlockUnlimited')}</DialogTitle>
        <DialogDescription className="sr-only">{t('trialLimit.reachedLimit')}</DialogDescription>

        <div className="px-7 pt-7 pb-6 sm:px-8 sm:pt-8 sm:pb-7 flex flex-col items-center">
          <div className="grid grid-cols-[40px_1fr_40px] items-center w-full mb-6">
            <div className="flex justify-start">
              <img src={appLogo} alt="LeadFinder Pro" className="h-9 w-9 shrink-0" />
            </div>
            <h2 className="text-lg font-bold tracking-tight text-center">Lead<span className="text-primary">Finder</span> Pro</h2>
            <div />
          </div>

          <h3 className="text-center text-[22px] sm:text-2xl font-bold leading-[1.2] tracking-tight mb-4 text-foreground">
            {t('trialLimit.readyForNext')}{' '}<span className="text-primary">{t('trialLimit.client')}</span>
          </h3>

          <div className="text-center text-[13px] text-muted-foreground/80 leading-relaxed mb-5 space-y-0.5">
            <p>{t('trialLimit.reachedLimit')}</p>
            <p>{t('trialLimit.keepBuilding')}</p>
          </div>

          <div className="w-full rounded-xl border border-primary/15 bg-gradient-to-br from-primary/[0.06] to-primary/[0.02] px-5 py-4 mb-4 shadow-[inset_0_1px_1px_rgba(255,255,255,0.04)]">
            <div className="flex items-center justify-around">
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">{animBiz}</div>
                <div className="text-[10px] text-muted-foreground/70 leading-tight mt-0.5">{t('trialLimit.businessesFound')}</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">{animNoWeb}</div>
                <div className="text-[10px] text-muted-foreground/70 leading-tight mt-0.5">{t('trialLimit.withoutWebsites')}</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-primary">{animMessages}</div>
                <div className="text-[10px] text-muted-foreground/70 leading-tight mt-0.5">{t('trialLimit.messagesSent')}</div>
              </div>
            </div>
          </div>

          <p className="text-center text-[11px] text-muted-foreground/50 mb-5">{t('trialLimit.unlockMomentum')}</p>
          <p className="text-center text-[11px] text-muted-foreground/50 mb-5">{t('trialLimit.pricingNote')}</p>

          <button onClick={handleCheckout} disabled={isLoading} className="btn-premium w-full h-12 rounded-xl text-[15px] font-semibold text-white flex items-center justify-center gap-2 transition-all disabled:opacity-60">
            {isLoading ? (<><Loader2 className="h-4 w-4 animate-spin" />{t('trialLimit.openingCheckout')}</>) : (<>{t('trialLimit.startTrial')} <ArrowRight className="h-4 w-4" /></>)}
          </button>

          <button onClick={() => onOpenChange(false)} className="mt-4 text-[10px] text-muted-foreground/40 hover:text-muted-foreground/60 transition-colors" disabled={isLoading}>
            {t('common.maybeLater')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
