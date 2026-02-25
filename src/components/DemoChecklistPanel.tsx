import { useState, useEffect, useRef, useCallback } from 'react';
import { useDemoChecklist } from '@/contexts/DemoChecklistContext';
import { useAuth } from '@/hooks/useAuth';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
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

  // Metrics for completion modal
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

  // Show completion modal when walkthrough finishes
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

  // Show tips modal after completion modal is dismissed
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
    // Pulse the search nav button yellow instead of navigating
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
      {/* Walkthrough Completed Modal */}
      <Dialog open={showCompletionModal} onOpenChange={(v) => { if (!v) handleCompletionDismiss(); }}>
        <DialogContent hideClose className="max-w-sm sm:max-w-md mx-auto p-0 overflow-hidden border-border/50 bg-card shadow-2xl">
          <div className="p-6 sm:p-7 space-y-6">
            {/* Logo */}
            <div className="flex justify-center">
              <img src={logoIcon} alt="" className="h-14 w-14" />
            </div>

            <div className="text-center space-y-3">
              <h2 className="text-[17px] sm:text-lg font-bold text-foreground tracking-tight leading-snug">
                Your Pipeline Is Ready
              </h2>
              <p className="text-[13px] text-muted-foreground leading-relaxed">
                You've seen how to identify, contact, and track real businesses that need websites.
              </p>
            </div>

            {/* Metrics */}
            <div className="grid grid-cols-3 gap-2">
              <div className="text-center p-2.5 rounded-lg bg-muted/30 border border-border/30">
                <div className="text-lg font-bold text-foreground">{metrics.noWebsite}</div>
                <div className="text-[10px] text-muted-foreground leading-tight">No Website</div>
              </div>
              <div className="text-center p-2.5 rounded-lg bg-muted/30 border border-border/30">
                <div className="text-lg font-bold text-foreground">{metrics.added}</div>
                <div className="text-[10px] text-muted-foreground leading-tight">Leads Added</div>
              </div>
              <div className="text-center p-2.5 rounded-lg bg-muted/30 border border-border/30">
                <div className="text-lg font-bold text-foreground">{metrics.messages}</div>
                <div className="text-[10px] text-muted-foreground leading-tight">Messages Sent</div>
              </div>
            </div>

            <ul className="text-[13px] space-y-2.5 mx-auto max-w-[260px]">
              <li className="flex items-center gap-2">
                <Check className="h-3.5 w-3.5 text-green-500 shrink-0" />
                <span className="text-foreground/90">Find businesses without websites</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-3.5 w-3.5 text-green-500 shrink-0" />
                <span className="text-foreground/90">Reach out in seconds</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-3.5 w-3.5 text-green-500 shrink-0" />
                <span className="text-foreground/90">Never lose a follow-up again</span>
              </li>
            </ul>

            <Button size="lg" className="w-full" onClick={handleCompletionDismiss}>
              Build Your Pipeline
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <PostWalkthroughTipsModal open={showTipsModal} onOpenChange={handleTipsModalClose} />
    </>
  );
}
