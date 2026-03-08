import { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useDemoChecklist } from '@/contexts/DemoChecklistContext';
import { useAuth } from '@/hooks/useAuth';

import { useTrial } from '@/hooks/useTrial';
import { useSubscription } from '@/hooks/useSubscription';
import appLogo from '@/assets/logo.png';
import { supabase } from '@/integrations/supabase/client';
import { ArrowRight } from 'lucide-react';
import { Dialog, DialogContent } from '@/components/ui/dialog';

function CountUp({ value }: { value: number }) {
  const [display, setDisplay] = useState(0);
  const rafRef2 = useRef<number>();
  useEffect(() => {
    if (value === 0) { setDisplay(0); return; }
    const duration = 1000;
    const start = performance.now();
    const animate = (now: number) => {
      const progress = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - progress, 3);
      setDisplay(Math.round(eased * value));
      if (progress < 1) rafRef2.current = requestAnimationFrame(animate);
    };
    rafRef2.current = requestAnimationFrame(animate);
    return () => { if (rafRef2.current) cancelAnimationFrame(rafRef2.current); };
  }, [value]);
  return <div className="text-2xl font-bold text-primary">{display}</div>;
}

export function DemoChecklistPanel() {
  const { t } = useTranslation();
  const { state, allDone, isDemoUser } = useDemoChecklist();
  const { isStripeTrialing } = useTrial();
  const { isPaidSubscriber } = useSubscription();
  const { user } = useAuth();

  const dismissKey = user?.id ? `demo_walkthrough_dismissed_${user.id}` : null;
  const [dismissed, setDismissed] = useState(false);
  const prevAllDoneRef = useRef(allDone);
  const [showCompletionModal, setShowCompletionModal] = useState(false);
  const [metrics, setMetrics] = useState({ noWebsite: 0, added: 0, messages: 0 });

  const isFreeUser = !isPaidSubscriber && !isStripeTrialing;

  useEffect(() => {
    if (!dismissKey) { setDismissed(false); return; }
    try {
      localStorage.removeItem('demo_walkthrough_dismissed');
      setDismissed(localStorage.getItem(dismissKey) === 'true');
    } catch { setDismissed(false); }
  }, [dismissKey]);

  useEffect(() => {
    if (allDone && !prevAllDoneRef.current) {
      setShowCompletionModal(true);
      if (user?.id) {
        Promise.all([
          supabase.from('search_history').select('no_website_count').eq('user_id', user.id),
          supabase.from('outreach_leads').select('id', { count: 'exact', head: true }).eq('user_id', user.id),
          supabase.from('user_metrics').select('messages_sent_count').eq('user_id', user.id).maybeSingle(),
        ]).then(([searchRes, leadsRes, metricsRes]) => {
          const noWebsite = (searchRes.data || []).reduce((s: number, r: any) => s + (r.no_website_count || 0), 0);
          const added = leadsRes.count || 0;
          const messages = metricsRes.data?.messages_sent_count || 0;
          setMetrics({ noWebsite, added, messages });
        });
      }
    }
    prevAllDoneRef.current = allDone;
  }, [allDone, user?.id]);


  const handleDismiss = () => {
    setDismissed(true);
    if (dismissKey) { try { localStorage.setItem(dismissKey, 'true'); } catch {} }
    if (user?.id) { try { localStorage.setItem(`walkthrough_completed_${user.id}`, 'true'); } catch {} }
  };

  const handleCompletionDismiss = () => {
    setShowCompletionModal(false);
    handleDismiss();
    window.dispatchEvent(new CustomEvent('walkthrough-dismissed'));


  if (!isDemoUser || dismissed) return null;

  return (
    <>
      <Dialog open={showCompletionModal} onOpenChange={(v) => { if (!v) handleCompletionDismiss(); }}>
        <DialogContent hideClose className="max-w-sm sm:max-w-[400px] mx-auto p-0 overflow-hidden border-border/40 bg-[hsl(220_50%_5%)] rounded-2xl">
          <div className="px-7 pt-7 pb-6 sm:px-8 sm:pt-8 sm:pb-7 flex flex-col items-center">
            <div className="grid grid-cols-[40px_1fr_40px] items-center w-full mb-6">
              <div className="flex justify-start">
                <img src={appLogo} alt="LeadFinder Pro" className="h-9 w-9 shrink-0" />
              </div>
              <h2 className="text-lg font-bold tracking-tight text-center">
                Lead<span className="text-primary">Finder</span> Pro
              </h2>
              <div />
            </div>

            <h3 className="text-center text-[22px] sm:text-2xl font-bold leading-[1.2] tracking-tight mb-4 text-foreground">
              {t('completion.headline')} <span className="text-primary">{t('completion.headlineAccent')}</span>.
            </h3>

            <div className="text-center text-[13px] text-muted-foreground/80 leading-relaxed mb-5 space-y-3">
              <p>{(state.contactsMadeCount === 1
                ? t('completion.contacted', { count: state.contactsMadeCount })
                : t('completion.contactedPlural', { count: state.contactsMadeCount })
              ).replace('<bold>', '').replace('</bold>', '')}</p>
              <p>{t('completion.mostFreelancers')}<br />{t('completion.keepStacking')}</p>
            </div>

            <div className="w-full rounded-xl border border-primary/15 bg-gradient-to-br from-primary/[0.06] to-primary/[0.02] px-5 py-4 mb-4 shadow-[inset_0_1px_1px_rgba(255,255,255,0.04)]">
              <div className="flex items-center justify-around">
                <div className="text-center">
                  <CountUp value={metrics.noWebsite} />
                  <div className="text-[10px] text-muted-foreground/70 leading-tight mt-0.5">{t('completion.businessesFound')}</div>
                </div>
                <div className="text-center">
                  <CountUp value={metrics.added} />
                  <div className="text-[10px] text-muted-foreground/70 leading-tight mt-0.5">{t('completion.leadsAdded')}</div>
                </div>
                <div className="text-center">
                  <CountUp value={metrics.messages} />
                  <div className="text-[10px] text-muted-foreground/70 leading-tight mt-0.5">{t('completion.conversations')}</div>
                </div>
              </div>
            </div>

            <p className="text-center text-[12px] text-foreground font-medium mb-5">{t('completion.volumeQuote')}</p>

            <button onClick={handleCompletionDismiss} className="btn-premium w-full h-12 rounded-xl text-[15px] font-semibold text-white flex items-center justify-center gap-2 transition-all">
              {t('completion.cta')}
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <PostWalkthroughTipsModal open={showTipsModal} onOpenChange={handleTipsModalClose} />
    </>
  );
}
