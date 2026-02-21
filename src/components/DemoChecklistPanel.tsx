import { useState, useMemo, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useDemoChecklist } from '@/contexts/DemoChecklistContext';
import { Check, ChevronDown, ChevronUp, Sparkles, Search, UserPlus, Phone, RefreshCw, CalendarClock, Star, X, CreditCard, Loader2 } from 'lucide-react';
import { useTrial } from '@/hooks/useTrial';
import { useSubscription } from '@/hooks/useSubscription';
import { useAuth } from '@/hooks/useAuth';
import { useDashboardMetrics } from '@/hooks/useDashboardMetrics';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { PostWalkthroughTipsModal } from '@/components/PostWalkthroughTipsModal';

const steps = [
  { key: 'searchDone' as const, label: 'Search for leads', cta: 'Go to Find Leads', route: '/find-leads', icon: Search, helperText: 'Enter a business type (e.g. "Barbers"), enter an area (e.g. "Manchester"), then hit Search.' },
  { key: 'addedToCrm' as const, label: 'Add a business to CRM', cta: 'Add a Business', route: '/find-leads', icon: UserPlus, helperText: 'Click the 📋 Add to CRM button next to any lead in your search results.' },
  { key: 'contactAttempted' as const, label: 'Contact a lead via WhatsApp or SMS', cta: 'Open Outreach CRM', route: '/outreach', icon: Phone, helperText: 'Open a lead in Outreach CRM, then tap the WhatsApp or SMS button to contact them.' },
  { key: 'statusUpdated' as const, label: 'Update status & hit Track ⭐', cta: 'Update Status', route: '/outreach', icon: RefreshCw, helperText: 'Set the status to the contact method you used (e.g. WhatsApp, SMS), then hit the star (⭐) to track the lead.' },
  { key: 'leadTracked' as const, label: 'Open Track Leads page', cta: 'Go to Track Leads', route: '/potential-work', icon: Star, helperText: 'Your starred leads appear here. Open the page to continue.' },
  { key: 'followUpSet' as const, label: 'Set a follow-up action & date', cta: '', route: '/potential-work', icon: CalendarClock, helperText: 'Open a lead, set "Follow Up" as the next action, pick a date, and hit Save.' },
];

const FREE_SEARCH_LIMIT = 1;

function TipsContent({ searchCount, onUpgrade, isUpgradeLoading }: { searchCount: number; onUpgrade: () => void; isUpgradeLoading: boolean }) {
  const { metrics } = useDashboardMetrics();

  if (searchCount >= FREE_SEARCH_LIMIT) {
    const stats = [
      { label: 'Businesses Found', value: metrics.noWebsiteBusinesses },
      { label: 'Added to CRM', value: metrics.totalBusinessesAdded },
      { label: 'Messages Sent', value: metrics.activity.totalLeadsContacted },
      { label: 'Leads Tracked', value: metrics.trackedLeads.length },
    ];
    return (
      <div className="space-y-2.5">
        <p className="text-xs font-semibold text-foreground">Your Progress So Far</p>
        <div className="grid grid-cols-2 gap-2">
          {stats.map(s => (
            <div key={s.label} className="text-center py-1">
              <p className="text-sm font-bold text-foreground">{s.value}</p>
              <p className="text-[10px] text-muted-foreground">{s.label}</p>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground">Unlock unlimited searches to keep growing.</p>
        <Button size="sm" className="w-full" disabled={isUpgradeLoading} onClick={onUpgrade}>
          {isUpgradeLoading ? <><Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" />Starting...</> : <><CreditCard className="mr-1.5 h-3.5 w-3.5" />Unlock Unlimited</>}
        </Button>
      </div>
    );
  }

  if (searchCount === 2) {
    return (
      <div className="space-y-1.5">
        <p className="text-xs font-medium text-foreground/80">Stay Consistent</p>
        <ul className="text-[11px] text-muted-foreground space-y-0.5 list-disc list-inside">
          <li>If no reply after 2–3 days, send a short follow-up</li>
          <li>Keep it friendly</li>
          <li>Avoid long explanations</li>
        </ul>
        <p className="text-[10px] text-muted-foreground/60 italic">Consistency builds momentum.</p>
      </div>
    );
  }

  // searchCount === 1 or default
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-foreground/80">Quick Outreach Tips</p>
      <ul className="text-[11px] text-muted-foreground space-y-0.5 list-disc list-inside">
        <li>Start casual – ask if this is the correct number</li>
        <li>Don't send links or images in your first message</li>
        <li>Keep it short and human</li>
        <li>Focus on starting a conversation, not pitching</li>
      </ul>
      <p className="text-[10px] text-muted-foreground/60 italic">The goal is to start a conversation, not close a deal immediately.</p>
    </div>
  );
}

export function DemoChecklistPanel() {
  const { state, completedCount, totalSteps, allDone, isOpen, setIsOpen, isDemoUser } = useDemoChecklist();
  const { isStripeTrialing, freeSearchCount } = useTrial();
  const { isPaidSubscriber } = useSubscription();
  const { user, session } = useAuth();
  const { toast } = useToast();
  const navigate = useNavigate();
  const location = useLocation();

  const dismissKey = user?.id ? `demo_walkthrough_dismissed_${user.id}` : null;
  const [dismissed, setDismissed] = useState(false);
  const [activeTab, setActiveTab] = useState<'walkthrough' | 'tips'>('walkthrough');
  const [userSwitchedTab, setUserSwitchedTab] = useState(false);
  const autoSwitchTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [isUpgradeLoading, setIsUpgradeLoading] = useState(false);
  
  // Walkthrough collapse state (Condition B: 2+ searches before walkthrough done)
  const [walkthroughCollapsed, setWalkthroughCollapsed] = useState(false);
  
  // Post-walkthrough tips modal state
  const [showTipsModal, setShowTipsModal] = useState(false);
  const tipsModalShownRef = useRef(false);
  const prevAllDoneRef = useRef(allDone);

  const isFreeUser = !isPaidSubscriber && !isStripeTrialing;
  const showTipsTab = isFreeUser && (freeSearchCount ?? 0) >= 1;

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
      // Walkthrough just completed
      tipsModalShownRef.current = true;
      setShowTipsModal(true);
    }
    prevAllDoneRef.current = allDone;
  }, [allDone, isFreeUser, tipsDismissed]);

  // Listen for post-search tip trigger
  useEffect(() => {
    if (!isFreeUser) return;
    const handler = () => {
      const currentSearchCount = freeSearchCount ?? 0;
      
      // Condition B: 2+ searches and walkthrough not done → collapse walkthrough, show modal
      if (currentSearchCount >= 2 && !allDone && !tipsModalShownRef.current && !tipsDismissed) {
        setWalkthroughCollapsed(true);
        setIsOpen(false);
        tipsModalShownRef.current = true;
        // Small delay so walkthrough collapses first
        setTimeout(() => setShowTipsModal(true), 200);
        return;
      }
      
      // Normal tab-based tips for search 1
      setUserSwitchedTab(false);
      setActiveTab('tips');
      setIsOpen(true);

      // Auto-switch back after 4s unless search limit reached
      if (currentSearchCount < FREE_SEARCH_LIMIT) {
        if (autoSwitchTimerRef.current) clearTimeout(autoSwitchTimerRef.current);
        autoSwitchTimerRef.current = setTimeout(() => {
          setActiveTab('walkthrough');
        }, 4000);
      }
    };
    window.addEventListener('post-search-tip', handler);
    return () => {
      window.removeEventListener('post-search-tip', handler);
      if (autoSwitchTimerRef.current) clearTimeout(autoSwitchTimerRef.current);
    };
  }, [isFreeUser, freeSearchCount, setIsOpen, allDone, tipsDismissed]);

  // Cancel auto-switch if user manually changes tab
  const handleTabClick = useCallback((tab: 'walkthrough' | 'tips') => {
    setActiveTab(tab);
    setUserSwitchedTab(true);
    if (autoSwitchTimerRef.current) {
      clearTimeout(autoSwitchTimerRef.current);
      autoSwitchTimerRef.current = null;
    }
  }, []);

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

  const handleUpgrade = useCallback(() => {
    const win = window.open('', '_blank');
    setIsUpgradeLoading(true);
    (async () => {
      try {
        const { data, error } = await supabase.functions.invoke('create-checkout', {
          headers: { Authorization: `Bearer ${session?.access_token}` },
        });
        if (error) throw error;
        if (data?.url) {
          if (win) win.location.href = data.url;
          else window.location.href = data.url;
          window.dispatchEvent(new CustomEvent('checkout-opened'));
        } else {
          win?.close();
        }
      } catch {
        win?.close();
        toast({ title: 'Error', description: 'Failed to start checkout', variant: 'destructive' });
      } finally {
        setIsUpgradeLoading(false);
      }
    })();
  }, [session?.access_token, toast]);

  const handleTipsModalClose = useCallback((open: boolean) => {
    setShowTipsModal(open);
    if (!open) {
      // Mark as shown so it doesn't reappear this session
      tipsModalShownRef.current = true;
      // Check if dismissed permanently
      if (tipsDismissedKey) {
        try {
          setTipsDismissed(localStorage.getItem(tipsDismissedKey) === 'true');
        } catch {}
      }
    }
  }, [tipsDismissedKey]);

  if (!isDemoUser || dismissed) return null;

  const nextStep = steps.find(s => !state[s.key]);
  const walkthroughActive = !allDone;

  // Collapsed pill mode (Condition B triggered)
  if (walkthroughCollapsed && walkthroughActive) {
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
            <span>{activeTab === 'tips' && showTipsTab ? 'Tips' : 'Walkthrough'}</span>
            {activeTab !== 'tips' && (
              <span className="text-xs text-muted-foreground">{completedCount}/{totalSteps}</span>
            )}
          </div>
          {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
        </button>

        {/* Expanded body */}
        {isOpen && (
          <div className="bg-card border border-t-0 border-border rounded-b-lg shadow-lg p-3 space-y-2">
            {/* Tab toggle — only show if tips tab is available AND walkthrough is active */}
            {showTipsTab && walkthroughActive && (
              <div className="flex gap-1 mb-1">
                <button
                  onClick={() => handleTabClick('walkthrough')}
                  className={`flex-1 text-[10px] font-medium py-1 px-2 rounded transition-colors ${
                    activeTab === 'walkthrough'
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Walkthrough
                </button>
                <button
                  onClick={() => handleTabClick('tips')}
                  className={`flex-1 text-[10px] font-medium py-1 px-2 rounded transition-colors ${
                    activeTab === 'tips'
                      ? 'bg-primary/10 text-primary'
                      : 'text-muted-foreground hover:text-foreground'
                  }`}
                >
                  Tips
                </button>
              </div>
            )}

            {/* Tips content */}
            {((activeTab === 'tips' && showTipsTab) || allDone || (showTipsTab && !walkthroughActive)) ? (
              <div className="relative">
                <button
                  onClick={() => {
                    setDismissed(true);
                    if (dismissKey) {
                      try { localStorage.setItem(dismissKey, 'true'); } catch {}
                    }
                    if (user?.id) {
                      try { localStorage.setItem(`walkthrough_completed_${user.id}`, 'true'); } catch {}
                    }
                  }}
                  className="absolute -top-1 -right-1 h-5 w-5 rounded-full hover:bg-muted flex items-center justify-center z-10"
                  aria-label="Close panel"
                >
                  <X className="h-3.5 w-3.5 text-muted-foreground" />
                </button>
                <TipsContent searchCount={freeSearchCount ?? 0} onUpgrade={handleUpgrade} isUpgradeLoading={isUpgradeLoading} />
              </div>
            ) : (
              <>
                {/* Walkthrough content */}
                {allDone ? null : (
                <ol className="space-y-1.5">
                    {steps.map((step, i) => {
                      const done = state[step.key];
                      const Icon = step.icon;
                      const isNext = nextStep?.key === step.key;
                      // Only show: completed steps (collapsed) + current active step (expanded)
                      if (!done && !isNext) return null;
                      return (
                        <li key={step.key} className="space-y-1">
                          <div className="flex items-start gap-2">
                            <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold mt-0.5 ${done ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                              {done ? <Check className="h-3 w-3" /> : i + 1}
                            </span>
                            <div className="flex-1 min-w-0">
                              <span className={`text-xs leading-5 ${done ? 'line-through text-muted-foreground' : ''}`}>
                                {step.label}
                                {step.key === 'statusUpdated' && !done && (state.statusChanged || state.trackPressed) && (
                                  <span className="text-primary font-medium ml-1">
                                    ({[state.statusChanged && 'status ✓', state.trackPressed && 'track ✓'].filter(Boolean).join(', ')})
                                  </span>
                                )}
                              </span>
                              {isNext && !done && step.cta && (
                                <Button variant="link" size="sm" className="h-auto p-0 text-xs text-primary ml-1" onClick={() => { if (location.pathname !== step.route) navigate(step.route); }}>
                                  → {step.cta}
                                </Button>
                              )}
                              {isNext && step.helperText && (
                                <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">{step.helperText}</p>
                              )}
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}

                {/* Progress bar */}
                {!allDone && (
                  <div className="w-full bg-muted rounded-full h-1.5 mt-2">
                    <div className="bg-primary h-1.5 rounded-full transition-all duration-300" style={{ width: `${(completedCount / totalSteps) * 100}%` }} />
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>

      {/* Post-walkthrough tips modal */}
      <PostWalkthroughTipsModal open={showTipsModal} onOpenChange={handleTipsModalClose} />
    </>
  );
}
