import { useState, useEffect, useRef, useCallback } from 'react';
import { useDemoChecklist } from '@/contexts/DemoChecklistContext';
import { useAuth } from '@/hooks/useAuth';
import { PostWalkthroughTipsModal } from '@/components/PostWalkthroughTipsModal';
import { useTrial } from '@/hooks/useTrial';
import { useSubscription } from '@/hooks/useSubscription';
import appLogo from '@/assets/logo.png';
import { supabase } from '@/integrations/supabase/client';
import { ArrowRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';

export function DemoChecklistPanel() {
  const { state, allDone, isDemoUser } = useDemoChecklist();
  const { isStripeTrialing } = useTrial();
  const { isPaidSubscriber } = useSubscription();
  const { user } = useAuth();

  const dismissKey = user?.id ? `demo_walkthrough_dismissed_${user.id}` : null;
  const [dismissed, setDismissed] = useState(false);

  const [showTipsModal, setShowTipsModal] = useState(false);
  const tipsModalShownRef = useRef(false);
  const prevAllDoneRef = useRef(allDone);
  const [showCompletionModal, setShowCompletionModal] = useState(false);

  const [metrics, setMetrics] = useState({ noWebsite: 0, added: 0, messages: 0 });

  const isFreeUser = !isPaidSubscriber && !isStripeTrialing;
  const tipsDismissedKey = user?.id ? `post_walkthrough_tips_dismissed_${user.id}` : null;
  const [tipsDismissed, setTipsDismissed] = useState(false);

  useEffect(() => {
    if (!tipsDismissedKey) return;
    try { setTipsDismissed(localStorage.getItem(tipsDismissedKey) === 'true'); } catch {}
  }, [tipsDismissedKey]);

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

  useEffect(() => {
    if (!isFreeUser || tipsDismissed || tipsModalShownRef.current) return;
    if (allDone && !showCompletionModal && !prevAllDoneRef.current) {
      tipsModalShownRef.current = true;
      setShowTipsModal(true);
    }
  }, [allDone, isFreeUser, tipsDismissed, showCompletionModal]);

  const handleDismiss = () => {
    setDismissed(true);
    if (dismissKey) {
      try { localStorage.setItem(dismissKey, 'true'); } catch {}
    }
    if (user?.id) {
      try { localStorage.setItem(`walkthrough_completed_${user.id}`, 'true'); } catch {}
    }
  };

  const handleCompletionDismiss = () => {
    setShowCompletionModal(false);
    handleDismiss();
    window.dispatchEvent(new CustomEvent('pulse-search-nav'));
  };

  const handleTipsModalClose = useCallback((open: boolean) => {
    setShowTipsModal(open);
    if (!open) {
      tipsModalShownRef.current = true;
      if (tipsDismissedKey) {
        try { setTipsDismissed(localStorage.getItem(tipsDismissedKey) === 'true'); } catch {}
      }
    }
  }, [tipsDismissedKey]);

  if (!isDemoUser || dismissed) return null;

  return (
    <>
      <Dialog open={showCompletionModal} onOpenChange={(v) => { if (!v) handleCompletionDismiss(); }}>
        <DialogContent
          hideClose
          className="max-w-sm sm:max-w-[400px] mx-auto p-0 overflow-hidden border-border/40 bg-[hsl(220_50%_5%)] rounded-2xl"
        >
          <div className="px-7 pt-7 pb-6 sm:px-8 sm:pt-8 sm:pb-7 flex flex-col items-center">
            {/* Brand — 3-column centered layout */}
            <div className="grid grid-cols-[40px_1fr_40px] items-center w-full mb-6">
              <div className="flex justify-start">
                <img src={appLogo} alt="LeadFinder Pro" className="h-9 w-9 shrink-0" />
              </div>
              <h2 className="text-lg font-bold tracking-tight text-center">
                Lead<span className="text-primary">Finder</span> Pro
              </h2>
              <div />
            </div>

            {/* Headline */}
            <h3 className="text-center text-[22px] sm:text-2xl font-bold leading-[1.2] tracking-tight mb-4 text-foreground">
              You're <span className="text-primary">1 reply</span> away from a new client.
            </h3>

            {/* Supporting text */}
            <div className="text-center text-[13px] text-muted-foreground/80 leading-relaxed mb-5 space-y-0.5">
              <p>You've already started the pipeline.</p>
              <p>Do one more search and send a few more messages.</p>
            </div>

            {/* Stats highlight card — matches contact tips value card */}
            <div className="w-full rounded-xl border border-primary/15 bg-gradient-to-br from-primary/[0.06] to-primary/[0.02] px-5 py-4 mb-4 shadow-[inset_0_1px_1px_rgba(255,255,255,0.04)]">
              <div className="flex items-center justify-around">
                <div className="text-center">
                  <div className="text-2xl font-bold text-primary">{metrics.noWebsite}</div>
                  <div className="text-[10px] text-muted-foreground/70 leading-tight mt-0.5">Businesses Found</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-primary">{metrics.added}</div>
                  <div className="text-[10px] text-muted-foreground/70 leading-tight mt-0.5">Leads Added</div>
                </div>
                <div className="text-center">
                  <div className="text-2xl font-bold text-primary">{metrics.messages}</div>
                  <div className="text-[10px] text-muted-foreground/70 leading-tight mt-0.5">Conversations</div>
                </div>
              </div>
            </div>

            {/* Micro-pressure */}
            <p className="text-center text-[11px] text-muted-foreground/50 mb-5">
              Most people stop after the first message.
            </p>

            {/* CTA */}
            <button
              onClick={handleCompletionDismiss}
              className="btn-premium w-full h-12 rounded-xl text-[15px] font-semibold text-white flex items-center justify-center gap-2 transition-all"
            >
              Find 10 More Leads
              <ArrowRight className="h-4 w-4" />
            </button>

            {/* Subtext */}
            <p className="text-center text-[10px] text-muted-foreground/40 mt-3">
              Consistency creates clients.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      <PostWalkthroughTipsModal open={showTipsModal} onOpenChange={handleTipsModalClose} />
    </>
  );
}
