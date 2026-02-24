import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useDemoChecklist } from '@/contexts/DemoChecklistContext';
import { useAuth } from '@/hooks/useAuth';
import { Check, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PostWalkthroughTipsModal } from '@/components/PostWalkthroughTipsModal';
import { useTrial } from '@/hooks/useTrial';
import { useSubscription } from '@/hooks/useSubscription';
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
    navigate('/outreach');
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
          <div className="p-6 space-y-5">
            <div className="text-center space-y-2">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
                <Sparkles className="h-6 w-6 text-primary" />
              </div>
              <h2 className="text-lg font-bold text-foreground">Walkthrough Complete! 🎉</h2>
              <p className="text-sm text-muted-foreground">
                You now know how to find, contact, and manage leads.
              </p>
              <ul className="text-xs text-left space-y-1.5 mx-auto max-w-[220px] pt-2">
                <li className="flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-green-500 shrink-0" />
                  <span className="text-foreground/90">Find businesses without websites</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-green-500 shrink-0" />
                  <span className="text-foreground/90">Contact them in 1 click</span>
                </li>
                <li className="flex items-center gap-1.5">
                  <Check className="h-3.5 w-3.5 text-green-500 shrink-0" />
                  <span className="text-foreground/90">Track next actions & follow-ups</span>
                </li>
              </ul>
            </div>
            <Button size="lg" className="w-full" onClick={handleCompletionDismiss}>
              Contact potential leads
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <PostWalkthroughTipsModal open={showTipsModal} onOpenChange={handleTipsModalClose} />
    </>
  );
}
