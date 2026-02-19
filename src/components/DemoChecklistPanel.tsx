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

const steps = [
  { key: 'searchDone' as const, label: 'Run 1 search', cta: 'Go to Find Leads', route: '/find-leads', icon: Search },
  { key: 'addedToCrm' as const, label: 'Add 3 businesses to CRM', cta: 'Add Businesses', route: '/find-leads', icon: UserPlus },
  { key: 'contactAttempted' as const, label: 'Contact a lead via WhatsApp or SMS', cta: 'Open Outreach CRM', route: '/outreach', icon: Phone, helperText: 'Open a lead in Outreach CRM, then tap the WhatsApp or SMS button to contact them.' },
  { key: 'statusUpdated' as const, label: 'Update status & hit Track ⭐', cta: 'Update Status', route: '/outreach', icon: RefreshCw, helperText: 'Set the status to the contact method you used (e.g. WhatsApp, SMS), then hit the star (⭐) to track the lead.' },
  { key: 'leadTracked' as const, label: 'Open Track Leads page', cta: 'Go to Track Leads', route: '/potential-work', icon: Star, helperText: 'Your starred leads appear here. Open the page to continue.' },
  { key: 'followUpSet' as const, label: 'Set a follow-up action & date', cta: '', route: '/potential-work', icon: CalendarClock, helperText: 'Open a lead, set "Follow Up" as the next action, pick a date, and hit Save.' },
];

const FREE_SEARCH_LIMIT = 3;

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

  const isFreeUser = !isPaidSubscriber && !isStripeTrialing;
  const showTipsTab = isFreeUser && (freeSearchCount ?? 0) >= 1;

  useEffect(() => {
    if (!dismissKey) { setDismissed(false); return; }
    try {
      localStorage.removeItem('demo_walkthrough_dismissed');
      setDismissed(localStorage.getItem(dismissKey) === 'true');
    } catch { setDismissed(false); }
  }, [dismissKey]);

  // Listen for post-search tip trigger
  useEffect(() => {
    if (!isFreeUser) return;
    const handler = () => {
      setUserSwitchedTab(false);
      setActiveTab('tips');
      setIsOpen(true);

      // Auto-switch back after 4s unless search limit reached or user manually switched
      if ((freeSearchCount ?? 0) < FREE_SEARCH_LIMIT) {
        if (autoSwitchTimerRef.current) clearTimeout(autoSwitchTimerRef.current);
        autoSwitchTimerRef.current = setTimeout(() => {
          setActiveTab(prev => {
            // Only switch back if user didn't manually change tab
            return 'walkthrough';
          });
        }, 4000);
      }
    };
    window.addEventListener('post-search-tip', handler);
    return () => {
      window.removeEventListener('post-search-tip', handler);
      if (autoSwitchTimerRef.current) clearTimeout(autoSwitchTimerRef.current);
    };
  }, [isFreeUser, freeSearchCount, setIsOpen]);

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

  const mode = useMemo(() => {
    if (isPaidSubscriber) return 'subscribed' as const;
    if (isStripeTrialing) return 'trial' as const;
    return 'demo' as const;
  }, [isPaidSubscriber, isStripeTrialing]);

  if (!isDemoUser || dismissed) return null;

  const nextStep = steps.find(s => !state[s.key]);
  const walkthroughActive = !allDone;

  return (
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
          {((activeTab === 'tips' && showTipsTab) || (showTipsTab && !walkthroughActive)) ? (
            <TipsContent searchCount={freeSearchCount ?? 0} onUpgrade={handleUpgrade} isUpgradeLoading={isUpgradeLoading} />
          ) : (
            <>
              {/* Walkthrough content */}
              {allDone ? (
                <div className="text-center space-y-2 py-2 relative">
                  <button
                    onClick={handleDismiss}
                    className="absolute top-0 right-0 h-6 w-6 rounded-full hover:bg-muted flex items-center justify-center"
                    aria-label="Close walkthrough"
                  >
                    <X className="h-4 w-4 text-muted-foreground" />
                  </button>
                  <p className="text-sm font-semibold text-primary">🎉 You're all set!</p>
                  <p className="text-xs text-muted-foreground">Start searching to find businesses without websites.</p>
                </div>
              ) : (
                <ol className="space-y-1.5">
                  {steps.map((step, i) => {
                    const done = state[step.key];
                    const Icon = step.icon;
                    const isNext = nextStep?.key === step.key;
                    return (
                      <li key={step.key} className="space-y-1">
                        <div className="flex items-start gap-2">
                          <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold mt-0.5 ${done ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}>
                            {done ? <Check className="h-3 w-3" /> : i + 1}
                          </span>
                          <div className="flex-1 min-w-0">
                            <span className={`text-xs leading-5 ${done ? 'line-through text-muted-foreground' : ''}`}>
                              {step.label}
                              {step.key === 'addedToCrm' && !done && state.crmAddCount > 0 && (
                                <span className="text-primary font-medium ml-1">({state.crmAddCount}/3)</span>
                              )}
                              {step.key === 'statusUpdated' && !done && (state.statusChanged || state.trackPressed) && (
                                <span className="text-primary font-medium ml-1">
                                  ({[state.statusChanged && 'status ✓', state.trackPressed && 'track ✓'].filter(Boolean).join(', ')})
                                </span>
                              )}
                            </span>
                            {isNext && !done && (
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
  );
}
