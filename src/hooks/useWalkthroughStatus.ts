import { useState, useEffect } from 'react';
import { useAuth } from './useAuth';
import { useDemoChecklist } from '@/contexts/DemoChecklistContext';

/**
 * Returns whether the walkthrough is fully complete/dismissed.
 * walkthroughOpen = true means walkthrough UI is visible or not yet completed.
 */
export function useWalkthroughStatus() {
  const { user } = useAuth();
  const { isDemoUser, isOpen: walkthroughPanelOpen, allDone } = useDemoChecklist();
  const [walkthroughCompleted, setWalkthroughCompleted] = useState(false);

  useEffect(() => {
    if (!user?.id) {
      setWalkthroughCompleted(false);
      return;
    }
    const dismissed = localStorage.getItem(`demo_walkthrough_dismissed_${user.id}`) === 'true';
    const completed = localStorage.getItem(`walkthrough_completed_${user.id}`) === 'true';
    setWalkthroughCompleted(dismissed || completed);
  }, [user?.id]);

  // Listen for storage changes (walkthrough dismiss happens in DemoChecklistPanel)
  useEffect(() => {
    if (!user?.id) return;
    const check = () => {
      const dismissed = localStorage.getItem(`demo_walkthrough_dismissed_${user.id}`) === 'true';
      const completed = localStorage.getItem(`walkthrough_completed_${user.id}`) === 'true';
      setWalkthroughCompleted(dismissed || completed);
    };
    // Poll briefly since localStorage events don't fire in same tab
    const interval = setInterval(check, 1000);
    return () => clearInterval(interval);
  }, [user?.id]);

  // walkthroughOpen = walkthrough UI is visible OR not yet completed
  const walkthroughOpen = isDemoUser && !walkthroughCompleted;

  return { walkthroughOpen, walkthroughCompleted };
}
