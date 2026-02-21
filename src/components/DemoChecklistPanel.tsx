import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useDemoChecklist } from '@/contexts/DemoChecklistContext';
import { Check, ChevronDown, ChevronUp, Sparkles, Search, UserPlus, Phone, RefreshCw, CalendarClock, Star, X } from 'lucide-react';
import { useSubscription } from '@/hooks/useSubscription';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { PostWalkthroughTipsModal } from '@/components/PostWalkthroughTipsModal';
import { useTrial } from '@/hooks/useTrial';

const steps = [
  { key: 'searchDone' as const, label: 'Search for leads', cta: 'Go to Find Leads', route: '/find-leads', icon: Search, helperText: 'Enter a business type (e.g. "Barbers"), enter an area (e.g. "Manchester"), then hit Search.' },
  { key: 'addedToCrm' as const, label: 'Add a business to Outreach CRM', cta: 'Add a Business', route: '/find-leads', icon: UserPlus, helperText: 'Click the 📋 Add to CRM button next to any lead in your search results.' },
  { key: 'contactAttempted' as const, label: 'Contact a lead via WhatsApp or SMS', cta: 'Open Outreach CRM', route: '/outreach', icon: Phone, helperText: 'Open a lead in Outreach CRM, then tap the WhatsApp or SMS button to contact them.' },
  { key: 'statusUpdated' as const, label: 'Update status & hit Track ⭐', cta: 'Update Status', route: '/outreach', icon: RefreshCw, helperText: 'Set the status to the contact method you used (e.g. WhatsApp, SMS), then hit the star (⭐) to track the lead.' },
  { key: 'leadTracked' as const, label: 'Open Track Leads page', cta: 'Go to Track Leads', route: '/potential-work', icon: Star, helperText: 'Your starred leads appear here. Open the page to continue.' },
  { key: 'followUpSet' as const, label: 'Set up a next action & date', cta: '', route: '/potential-work', icon: CalendarClock, helperText: 'Select a next action, pick a date, then hit Save.' },
];

export function DemoChecklistPanel() {
  const { state, completedCount, totalSteps, allDone, isOpen, setIsOpen, isDemoUser } = useDemoChecklist();
  const { isStripeTrialing } = useTrial();
  const { isPaidSubscriber } = useSubscription();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const dismissKey = user?.id ? `demo_walkthrough_dismissed_${user.id}` : null;
  const [dismissed, setDismissed] = useState(false);

  // Walkthrough collapse state
  const [walkthroughCollapsed, setWalkthroughCollapsed] = useState(false);

  // Post-walkthrough tips modal state
  const [showTipsModal, setShowTipsModal] = useState(false);
  const tipsModalShownRef = useRef(false);
  const prevAllDoneRef = useRef(allDone);

  const isFreeUser = !isPaidSubscriber && !isStripeTrialing;

  // Check if tips were permanently dismissed
  const tipsDismissedKey = user?.id ? `post_walkthrough_tips_dismissed_${user.id}` : null;
  const [tipsDismissed, setTipsDismissed] = useState(false);

  useEffect(() => {
    if (!tipsDismissedKey) return;
    try {
      setTipsDismissed(localStorage.getItem(tipsDismissedKey) === 'true');
    } catch {}
  }, [tipsDismissedKey]);

  useEffect(() => {
    if (!dismissKey) { setDismissed(false); return; }
    try {
      localStorage.removeItem('demo_walkthrough_dismissed');
      setDismissed(localStorage.getItem(dismissKey) === 'true');
    } catch { setDismissed(false); }
  }, [dismissKey]);

  // Condition A: walkthrough just completed → show tips modal
  useEffect(() => {
    if (!isFreeUser || tipsDismissed || tipsModalShownRef.current) return;
    if (allDone && !prevAllDoneRef.current) {
      tipsModalShownRef.current = true;
      setShowTipsModal(true);
    }
    prevAllDoneRef.current = allDone;
  }, [allDone, isFreeUser, tipsDismissed]);

  // Listen for post-search tip trigger (Condition B: 2+ searches before walkthrough done)
  useEffect(() => {
    if (!isFreeUser) return;
    const handler = () => {
      if (!allDone && !tipsModalShownRef.current && !tipsDismissed) {
        setWalkthroughCollapsed(true);
        setIsOpen(false);
        tipsModalShownRef.current = true;
        setTimeout(() => setShowTipsModal(true), 200);
      }
    };
    window.addEventListener('post-search-tip', handler);
    return () => window.removeEventListener('post-search-tip', handler);
  }, [isFreeUser, setIsOpen, allDone, tipsDismissed]);

  const handleDismiss = () => {
    setDismissed(true);
    if (dismissKey) {
      try { localStorage.setItem(dismissKey, 'true'); } catch {}
    }
    if (user?.id) {
      try { localStorage.setItem(`walkthrough_completed_${user.id}`, 'true'); } catch {}
    }
    navigate('/find-leads');
    setTimeout(() => {
      const searchInput = document.querySelector<HTMLInputElement>('input[placeholder*="Search"]') || document.querySelector<HTMLInputElement>('input[type="text"]');
      if (searchInput) {
        searchInput.focus();
        searchInput.classList.add('ring-2', 'ring-primary');
        setTimeout(() => searchInput.classList.remove('ring-2', 'ring-primary'), 2000);
      }
    }, 500);
  };

  const handleTipsModalClose = useCallback((open: boolean) => {
    setShowTipsModal(open);
    if (!open) {
      tipsModalShownRef.current = true;
      if (tipsDismissedKey) {
        try {
          setTipsDismissed(localStorage.getItem(tipsDismissedKey) === 'true');
        } catch {}
      }
    }
  }, [tipsDismissedKey]);

  if (!isDemoUser || dismissed) return null;

  const nextStep = steps.find(s => !state[s.key]);
  const currentStepIndex = nextStep ? steps.findIndex(s => s.key === nextStep.key) : totalSteps;

  // Collapsed pill mode (Condition B triggered)
  if (walkthroughCollapsed && !allDone) {
    return (
      <>
        <button
          onClick={() => {
            setWalkthroughCollapsed(false);
            setIsOpen(true);
          }}
          className="fixed bottom-20 md:bottom-4 right-4 z-40 flex items-center gap-2 px-3 py-2 rounded-full bg-card border border-border shadow-lg text-xs font-medium hover:bg-muted/50 transition-colors"
        >
          <Sparkles className="h-3.5 w-3.5 text-primary" />
          <span>Continue walkthrough</span>
          <span className="text-muted-foreground">{completedCount}/{totalSteps}</span>
        </button>
        <PostWalkthroughTipsModal open={showTipsModal} onOpenChange={handleTipsModalClose} />
      </>
    );
  }

  // All done — show tips modal only, dismiss panel
  if (allDone) {
    return <PostWalkthroughTipsModal open={showTipsModal} onOpenChange={handleTipsModalClose} />;
  }

  return (
    <>
      <div className="fixed bottom-20 md:bottom-4 right-4 z-40 w-72 max-w-[calc(100vw-2rem)]">
        {/* Collapsed header */}
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-t-lg bg-card border border-border shadow-lg text-sm font-medium"
        >
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-primary" />
            <span>Walkthrough</span>
            <span className="text-xs text-muted-foreground">{currentStepIndex + 1} of {totalSteps}</span>
          </div>
          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </button>

        {/* Expanded body — only current step */}
        {isOpen && nextStep && (
          <div className="bg-card border border-t-0 border-border rounded-b-lg shadow-lg p-3 space-y-2">
            <div className="flex items-start gap-2">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold mt-0.5 bg-muted text-muted-foreground">
                {currentStepIndex + 1}
              </span>
              <div className="flex-1 min-w-0">
                <span className="text-xs leading-5">
                  {nextStep.label}
                  {nextStep.key === 'statusUpdated' && (state.statusChanged || state.trackPressed) && (
                    <span className="text-primary font-medium ml-1">
                      ({[state.statusChanged && 'status ✓', state.trackPressed && 'track ✓'].filter(Boolean).join(', ')})
                    </span>
                  )}
                </span>
                {nextStep.cta && (
                  <Button variant="link" size="sm" className="h-auto p-0 text-xs text-primary ml-1" onClick={() => { if (location.pathname !== nextStep.route) navigate(nextStep.route); }}>
                    → {nextStep.cta}
                  </Button>
                )}
                {nextStep.helperText && (
                  <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{nextStep.helperText}</p>
                )}
              </div>
            </div>

            {/* Progress bar */}
            <div className="w-full bg-muted rounded-full h-1.5 mt-2">
              <div className="bg-primary h-1.5 rounded-full transition-all duration-300" style={{ width: `${(completedCount / totalSteps) * 100}%` }} />
            </div>

            {/* Dismiss */}
            <button
              onClick={handleDismiss}
              className="text-[10px] text-muted-foreground hover:text-foreground transition-colors w-full text-center"
            >
              Skip walkthrough
            </button>
          </div>
        )}
      </div>

      <PostWalkthroughTipsModal open={showTipsModal} onOpenChange={handleTipsModalClose} />
    </>
  );
}
