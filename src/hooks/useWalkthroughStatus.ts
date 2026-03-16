import { useState, useEffect } from 'react';
import { useAuth } from './useAuth';
import { useDemoChecklist } from '@/contexts/DemoChecklistContext';

/**
 * Returns whether the walkthrough is fully complete/dismissed.
 * walkthroughOpen = true means walkthrough UI is visible or not yet completed.
 */
export function useWalkthroughStatus() {
  const { user } = useAuth();
  const { isDemoUser, isOpen: walkthroughPanelOpen, allDone, isReplay } = useDemoChecklist();
  const [walkthroughCompleted, setWalkthroughCompleted] = useState(false);

  useEffect(() => {
    if (user?.id) {
      const dismissed = localStorage.getItem(`demo_walkthrough_dismissed_${user.id}`) === 'true';
      const completed = localStorage.getItem(`walkthrough_completed_${user.id}`) === 'true';
      setWalkthroughCompleted(dismissed || completed);
    } else {
      // Guest user — check guest-specific dismissal key
      try {
        const guestDismissed = localStorage.getItem('demo_walkthrough_dismissed_guest') === 'true';
        setWalkthroughCompleted(guestDismissed);
      } catch {
        setWalkthroughCompleted(false);
      }
    }
  }, [user?.id]);

  // Listen for custom events instead of polling localStorage every second
  useEffect(() => {
    if (!user?.id) return;
    const check = () => {
      const dismissed = localStorage.getItem(`demo_walkthrough_dismissed_${user.id}`) === 'true';
      const completed = localStorage.getItem(`walkthrough_completed_${user.id}`) === 'true';
      setWalkthroughCompleted(dismissed || completed);
    };
    const onSkip = () => {
      setWalkthroughCompleted(true);
    };
    const onStart = () => {
      setWalkthroughCompleted(false);
    };
    // Listen for walkthrough dismissed event (fired by DemoChecklistPanel/WalkthroughOverlay)
    const onDismissed = () => check();
    window.addEventListener('skip-walkthrough', onSkip);
    window.addEventListener('start-walkthrough', onStart);
    window.addEventListener('walkthrough-dismissed', onDismissed);
    window.addEventListener('walkthrough-status-changed', check);
    return () => {
      window.removeEventListener('skip-walkthrough', onSkip);
      window.removeEventListener('start-walkthrough', onStart);
      window.removeEventListener('walkthrough-dismissed', onDismissed);
      window.removeEventListener('walkthrough-status-changed', check);
    };
  }, [user?.id]);

  // walkthroughOpen = walkthrough UI is visible OR not yet completed
  const walkthroughOpen = (isDemoUser || isReplay) && !walkthroughCompleted;

  return { walkthroughOpen, walkthroughCompleted };
}
