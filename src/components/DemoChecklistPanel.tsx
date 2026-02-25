import { useState, useEffect, useRef, useCallback } from 'react';
import { useDemoChecklist } from '@/contexts/DemoChecklistContext';
import { useAuth } from '@/hooks/useAuth';
import { PostWalkthroughTipsModal } from '@/components/PostWalkthroughTipsModal';
import { useTrial } from '@/hooks/useTrial';
import { useSubscription } from '@/hooks/useSubscription';
import logoIcon from '@/assets/leadfinder-logo-icon.png';
import { supabase } from '@/integrations/supabase/client';
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
          className="max-w-sm sm:max-w-md mx-auto p-0 overflow-hidden border-primary/15 bg-card rounded-2xl"
          style={{
            boxShadow: '0 0 60px hsl(var(--primary) / 0.06), 0 25px 50px -12px rgba(0,0,0,0.5)',
          }}
        >
          <div className="px-8 pt-10 pb-8 sm:px-9 sm:pt-11 sm:pb-9 flex flex-col items-center">
            {/* Logo with subtle glow */}
            <div className="relative mb-3">
              <div
                className="absolute inset-0 rounded-full"
                style={{
                  background: 'radial-gradient(circle, hsl(var(--primary) / 0.15) 0%, transparent 70%)',
                  transform: 'scale(2.2)',
                }}
              />
              <img src={logoIcon} alt="" className="h-14 w-14 relative z-10" />
            </div>

            {/* Brand label */}
            <span className="text-[10px] font-semibold tracking-[0.2em] uppercase text-foreground/50 mb-7">
              LeadFinder Pro
            </span>

            {/* Headline */}
            <h2 className="text-center text-xl sm:text-[22px] font-bold leading-[1.25] tracking-tight mb-6 text-foreground">
              You've Started Your Client Pipeline.
            </h2>

            {/* Stacked progress lines */}
            <div className="text-center text-[13px] leading-relaxed mb-6 space-y-0.5">
              <p className="text-muted-foreground">You've identified real businesses.</p>
              <p className="text-muted-foreground">You've added leads.</p>
              <p className="text-muted-foreground">You've sent your first message.</p>
              <p className="text-foreground/80 mt-3 font-medium">Now build momentum.</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-2.5 w-full mb-6">
              <div className="text-center p-3 rounded-xl bg-muted/20 border border-primary/15">
                <div className="text-xl font-bold text-primary">{metrics.noWebsite}</div>
                <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">Businesses without websites</div>
              </div>
              <div className="text-center p-3 rounded-xl bg-muted/20 border border-primary/15">
                <div className="text-xl font-bold text-primary">{metrics.added}</div>
                <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">Leads added</div>
              </div>
              <div className="text-center p-3 rounded-xl bg-muted/20 border border-primary/15">
                <div className="text-xl font-bold text-primary">{metrics.messages}</div>
                <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">Conversation started</div>
              </div>
            </div>

            {/* Forward trigger */}
            <p className="text-center text-[11px] text-muted-foreground/70 mb-7">
              Every consistent pipeline starts exactly like this.
            </p>

            {/* CTA */}
            <button
              onClick={handleCompletionDismiss}
              className="w-full h-12 rounded-lg text-[15px] font-semibold text-primary-foreground transition-all hover:brightness-110"
              style={{
                background: 'linear-gradient(180deg, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.85) 100%)',
                boxShadow: '0 4px 14px hsl(var(--primary) / 0.25), 0 1px 3px rgba(0,0,0,0.2)',
              }}
            >
              Keep Building
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <PostWalkthroughTipsModal open={showTipsModal} onOpenChange={handleTipsModalClose} />
    </>
  );
}
