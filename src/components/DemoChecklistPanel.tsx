import { useState, useEffect, useRef, useCallback } from 'react';
import { useDemoChecklist } from '@/contexts/DemoChecklistContext';
import { useAuth } from '@/hooks/useAuth';
import { PostWalkthroughTipsModal } from '@/components/PostWalkthroughTipsModal';
import { useTrial } from '@/hooks/useTrial';
import { useSubscription } from '@/hooks/useSubscription';
import appLogo from '@/assets/logo.png';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
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
          className="max-w-sm sm:max-w-md mx-auto p-0 overflow-hidden border-border/40 bg-card rounded-2xl"
        >
          <div className="px-8 pt-8 pb-7 sm:px-9 sm:pt-9 sm:pb-8 flex flex-col items-center">
            {/* Brand — matches header exactly */}
            <div className="flex items-center gap-3 mb-8">
              <img src={appLogo} alt="LeadFinder Pro" className="h-9 w-9 shrink-0" />
              <h2 className="text-lg font-bold tracking-tight text-foreground">
                Lead<span className="text-primary">Finder</span> Pro
              </h2>
            </div>

            {/* Headline */}
            <h3 className="text-center text-xl sm:text-[22px] font-bold leading-[1.25] tracking-tight mb-6 text-foreground">
              You're 1 Reply Away From a New Client.
            </h3>

            {/* Progress lines */}
            <div className="text-center text-[13px] leading-relaxed mb-6 space-y-0.5">
              <p className="text-muted-foreground">You've already contacted a real business.</p>
              <p className="text-foreground/80 mt-3 font-medium">Now multiply it.</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-3 gap-2.5 w-full mb-6">
              <div className="text-center p-3 rounded-xl bg-muted/20 border border-border/40">
                <div className="text-xl font-bold text-primary">{metrics.noWebsite}</div>
                <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">Businesses Found</div>
              </div>
              <div className="text-center p-3 rounded-xl bg-muted/20 border border-border/40">
                <div className="text-xl font-bold text-primary">{metrics.added}</div>
                <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">Leads Added</div>
              </div>
              <div className="text-center p-3 rounded-xl bg-muted/20 border border-border/40">
                <div className="text-xl font-bold text-primary">{metrics.messages}</div>
                <div className="text-[10px] text-muted-foreground leading-tight mt-0.5">Conversation Started</div>
              </div>
            </div>

            {/* Forward trigger */}
            <div className="text-center text-[11px] text-muted-foreground/70 mb-7 space-y-0.5">
              <p>Most freelancers stop here.</p>
              <p className="text-foreground/60 font-medium">The difference is volume.</p>
            </div>

            {/* CTA */}
            <Button size="lg" className="w-full" onClick={handleCompletionDismiss}>
              Find 10 More
            </Button>

            {/* Subtle subtext */}
            <p className="text-center text-[10px] text-muted-foreground/50 mt-4">
              Consistency creates clients.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      <PostWalkthroughTipsModal open={showTipsModal} onOpenChange={handleTipsModalClose} />
    </>
  );
}
