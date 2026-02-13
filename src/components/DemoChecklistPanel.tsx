import { useNavigate, useLocation } from 'react-router-dom';
import { useDemoChecklist } from '@/contexts/DemoChecklistContext';
import { Check, ChevronDown, ChevronUp, Sparkles, Search, UserPlus, Phone, RefreshCw, CalendarClock, Star } from 'lucide-react';
import { Button } from '@/components/ui/button';

const steps = [
  {
    key: 'searchDone' as const,
    label: 'Run 1 search',
    cta: 'Go to Find Leads',
    route: '/find-leads',
    icon: Search,
  },
  {
    key: 'addedToCrm' as const,
    label: 'Add 3 businesses to CRM',
    cta: 'Add Businesses',
    route: '/find-leads',
    icon: UserPlus,
  },
  {
    key: 'contactAttempted' as const,
    label: 'Contact one of them',
    cta: 'Attempt Contact',
    route: '/outreach',
    icon: Phone,
  },
  {
    key: 'statusUpdated' as const,
    label: 'Update status & hit track ⭐',
    cta: 'Update Status',
    route: '/outreach',
    icon: RefreshCw,
    helperText: 'After contacting, update the status then hit the star to track the lead.',
  },
  {
    key: 'leadTracked' as const,
    label: 'Open Track Leads page',
    cta: 'Go to Track Leads',
    route: '/potential-work',
    icon: Star,
    helperText: 'Your starred leads appear here. Open the page to continue.',
  },
  {
    key: 'followUpSet' as const,
    label: 'Set a follow-up action & date',
    cta: '',
    route: '/potential-work',
    icon: CalendarClock,
    helperText: 'Open a lead, set "Follow Up" as the next action, pick a date, and hit Save.',
  },
];

export function DemoChecklistPanel() {
  const { state, completedCount, totalSteps, allDone, isOpen, setIsOpen, isDemoUser } = useDemoChecklist();
  const navigate = useNavigate();
  const location = useLocation();

  if (!isDemoUser) return null;

  // Find next incomplete step
  const nextStep = steps.find(s => !state[s.key]);

  return (
    <div className="fixed bottom-20 md:bottom-4 right-4 z-40 w-72 max-w-[calc(100vw-2rem)]">
      {/* Collapsed header */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between gap-2 px-3 py-2.5 rounded-t-lg bg-card border border-border shadow-lg text-sm font-medium"
      >
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-primary" />
          <span>Demo Checklist</span>
          <span className="text-xs text-muted-foreground">
            {completedCount}/{totalSteps}
          </span>
        </div>
        {isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronUp className="h-4 w-4" />}
      </button>

      {/* Expanded body */}
      {isOpen && (
        <div className="bg-card border border-t-0 border-border rounded-b-lg shadow-lg p-3 space-y-2">
          {allDone ? (
            <div className="text-center space-y-3 py-2">
              <p className="text-sm font-semibold text-primary">🎉 Walkthrough complete!</p>
              <p className="text-xs text-muted-foreground">You've seen the full workflow. Unlock everything free for 24 hours.</p>
              <Button
                size="sm"
                className="w-full btn-premium"
                onClick={() => navigate('/subscribe')}
              >
                <Sparkles className="mr-1.5 h-3.5 w-3.5" />
                Get 24h Full Access — Free
              </Button>
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
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold mt-0.5 ${
                          done
                            ? 'bg-primary text-primary-foreground'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {done ? <Check className="h-3 w-3" /> : i + 1}
                      </span>
                      <div className="flex-1 min-w-0">
                        <span className={`text-xs leading-5 ${done ? 'line-through text-muted-foreground' : ''}`}>
                          {step.label}
                          {step.key === 'addedToCrm' && !done && state.crmAddCount > 0 && (
                            <span className="text-primary font-medium ml-1">({state.crmAddCount}/3)</span>
                          )}
                        </span>
                        {isNext && !done && (
                          <Button
                            variant="link"
                            size="sm"
                            className="h-auto p-0 text-xs text-primary ml-1"
                            onClick={() => {
                              if (location.pathname !== step.route) navigate(step.route);
                            }}
                          >
                            → {step.cta}
                          </Button>
                        )}
                        {isNext && step.helperText && (
                          <p className="text-[10px] text-muted-foreground mt-0.5 leading-tight">
                            {step.helperText}
                          </p>
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
              <div
                className="bg-primary h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${(completedCount / totalSteps) * 100}%` }}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
