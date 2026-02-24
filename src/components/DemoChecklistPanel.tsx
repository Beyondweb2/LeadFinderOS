import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDemoChecklist } from '@/contexts/DemoChecklistContext';
import { useAuth } from '@/hooks/useAuth';
import { Check } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PostWalkthroughTipsModal } from '@/components/PostWalkthroughTipsModal';
import { useTrial } from '@/hooks/useTrial';
import { useSubscription } from '@/hooks/useSubscription';
import logoIcon from '@/assets/leadfinder-logo-icon.png';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';

export function DemoChecklistPanel() {
  const { state, allDone, isDemoUser } = useDemoChecklist();
  const { isStripeTrialing } = useTrial();
  const { isPaidSubscriber } = useSubscription();
  const { user } = useAuth();
  const navigate = useNavigate();

  const dismissKey = user?.id ? `demo_walkthrough_dismissed_${user.id}` : null;
  const [dismissed, setDismissed] = useState(false);

  const [showTipsModal, setShowTipsModal] = useState(false);
  const tipsModalShownRef = useRef(false);
  const prevAllDoneRef = useRef(allDone);
  const [showCompletionModal, setShowCompletionModal] = useState(false);

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
    }
    prevAllDoneRef.current = allDone;
  }, [allDone]);

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
    navigate('/find-leads');
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

  // Only render the completion modal — no heavy panel
  return (
    <>
      {/* Walkthrough Completed Modal */}
      <Dialog open={showCompletionModal} onOpenChange={(v) => { if (!v) handleCompletionDismiss(); }}>
        <DialogContent hideClose className="max-w-sm sm:max-w-md mx-auto p-0 overflow-hidden border-border/50 bg-card shadow-2xl">
          <div className="p-6 sm:p-7 space-y-6">
            {/* Logo */}
            <div className="flex justify-center">
              <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/10">
                <img src={logoIcon} alt="" className="h-6 w-6" />
              </div>
            </div>

            <div className="text-center space-y-3">
              <h2 className="text-[17px] sm:text-lg font-bold text-foreground tracking-tight leading-snug">
                You Now Have a Client Acquisition System
              </h2>
              <p className="text-[13px] text-muted-foreground leading-relaxed">
                You've seen how to identify, contact, and track real businesses that need websites.
              </p>
            </div>

            <ul className="text-[13px] space-y-2.5 mx-auto max-w-[260px]">
              <li className="flex items-center gap-2">
                <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="text-foreground/90">Find businesses without websites</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="text-foreground/90">Reach out in seconds</span>
              </li>
              <li className="flex items-center gap-2">
                <Check className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="text-foreground/90">Never lose a follow-up again</span>
              </li>
            </ul>

            <p className="text-[12px] text-muted-foreground text-center">
              Most developers never build a predictable pipeline. You just did.
            </p>

            <Button size="lg" className="w-full" onClick={handleCompletionDismiss}>
              Run Your Next Search
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <PostWalkthroughTipsModal open={showTipsModal} onOpenChange={handleTipsModalClose} />
    </>
  );
}
