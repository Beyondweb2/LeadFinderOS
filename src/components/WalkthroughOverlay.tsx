import { useState, useEffect, useCallback, useRef } from 'react';
import { useDemoChecklist } from '@/contexts/DemoChecklistContext';
import { useWalkthroughStatus } from '@/hooks/useWalkthroughStatus';
import { createPortal } from 'react-dom';
import { supabase } from '@/integrations/supabase/client';

const STEP_CONFIG: {
  key: string;
  selector: string;
  tooltip: string;
  allowTyping?: boolean;
  noDim?: boolean;
  tooltipPosition?: 'top' | 'bottom' | 'right';
}[] = [
  {
    key: 'searchDone',
    selector: '[data-walkthrough-step="business-type"]',
    tooltip: 'Type the kind of business you want to find.',
    allowTyping: true,
  },
  {
    key: 'searchDone',
    selector: '[data-walkthrough-step="location"]',
    tooltip: 'Enter a city or postcode, or pick a Quick Location below.',
    allowTyping: true,
    noDim: true,
  },
  {
    key: 'searchDone',
    selector: '[data-walkthrough-step="search"]',
    tooltip: 'Now click Find Leads to search!',
  },
  {
    key: 'addedToCrm',
    selector: '[data-walkthrough-step="add-to-crm"]',
    tooltip: 'Tap any blue 📋 button to add a lead to your CRM. Add at least 3! Use the 👁 button to view more info about a business.',
    noDim: true,
    tooltipPosition: 'top' as const,
  },
  {
    key: 'contactAttempted',
    selector: '[data-walkthrough-step="contact"]',
    tooltip: 'Tap WhatsApp or SMS to contact this lead.',
    noDim: true,
  },
  // Step 4 sub-step A: update status
  {
    key: 'statusUpdated',
    subKey: 'statusChanged',
    selector: '[data-walkthrough-step="status"]',
    tooltip: 'Update status to the contact method you used.',
    noDim: true,
    tooltipPosition: 'right' as const,
  } as any,
  // Step 4 sub-step B: track star
  {
    key: 'statusUpdated',
    subKey: 'trackPressed',
    selector: '[data-walkthrough-step="track-star"]',
    tooltip: 'Track businesses that show interest.',
    noDim: true,
  } as any,
  {
    key: 'leadTracked',
    selector: '[data-walkthrough-step="track-leads"]',
    tooltip: 'Open the Track Leads page to see starred leads.',
  },
  // Step 6 sub-steps: action → date → note → status (auto-completes when all filled)
  {
    key: 'followUpSet',
    subKey: 'followUpAction',
    selector: '[data-walkthrough-step="follow-up-action"]',
    tooltip: 'Select a next action for this lead.',
    noDim: true,
  } as any,
  {
    key: 'followUpSet',
    subKey: 'followUpDate',
    selector: '[data-walkthrough-step="follow-up-date"]',
    tooltip: 'Pick a due date for this action.',
    noDim: true,
  } as any,
  {
    key: 'followUpSet',
    subKey: 'followUpNote',
    selector: '[data-walkthrough-step="track-notes-edit"]',
    tooltip: 'Add a note about this lead.',
    noDim: true,
    tooltipPosition: 'right' as const,
  } as any,
  {
    key: 'followUpSet',
    subKey: 'followUpStatus',
    selector: '[data-walkthrough-step="track-status-select"]',
    tooltip: 'Update the status of this lead.',
    noDim: true,
    tooltipPosition: 'right' as const,
  } as any,
];

export function WalkthroughOverlay() {
  const { state, allDone, isDemoUser } = useDemoChecklist();
  const { walkthroughOpen } = useWalkthroughStatus();
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(null);
  const [activeStep, setActiveStep] = useState<typeof STEP_CONFIG[0] | null>(null);
  const [paused, setPaused] = useState(false);
  const rafRef = useRef<number>();

  // Find the current active step
  useEffect(() => {
    if (!isDemoUser || allDone || !walkthroughOpen) {
      setActiveStep(null);
      return;
    }

    // For searchDone, we have 3 sub-steps: business-type → location → search
    if (!state.searchDone) {
      const businessInput = document.querySelector('[data-walkthrough-step="business-type"]') as HTMLInputElement;
      const locationInput = document.querySelector('[data-walkthrough-step="location"]') as HTMLInputElement;
      
      const businessFilled = businessInput && businessInput.value.trim().length > 0;
      const locationFilled = locationInput && locationInput.value.trim().length > 0;

      if (!businessFilled) {
        setActiveStep(STEP_CONFIG[0]);
      } else if (!locationFilled) {
        setActiveStep(STEP_CONFIG[1]);
      } else {
        setActiveStep(STEP_CONFIG[2]);
      }
      return;
    }

    // For statusUpdated, handle sub-steps: statusChanged → trackPressed
    if (!state.statusUpdated) {
      // Check if we're at the statusUpdated step
      const priorSteps = ['addedToCrm', 'contactAttempted'] as const;
      const allPriorDone = priorSteps.every(k => state[k]);
      if (allPriorDone) {
        if (!state.statusChanged) {
          setActiveStep(STEP_CONFIG.find(s => (s as any).subKey === 'statusChanged') || null);
          return;
        }
        if (!state.trackPressed) {
          setActiveStep(STEP_CONFIG.find(s => (s as any).subKey === 'trackPressed') || null);
          return;
        }
      }
    }

    // For followUpSet, handle sub-steps: action → date → note → status
    if (!state.followUpSet) {
      const priorSteps2 = ['addedToCrm', 'contactAttempted', 'statusUpdated', 'leadTracked'] as const;
      const allPrior2Done = priorSteps2.every(k => state[k]);
      if (allPrior2Done) {
        if (!state.followUpActionSet) {
          setActiveStep(STEP_CONFIG.find(s => (s as any).subKey === 'followUpAction') || null);
          return;
        }
        if (!state.followUpDateSet) {
          setActiveStep(STEP_CONFIG.find(s => (s as any).subKey === 'followUpDate') || null);
          return;
        }
        if (!state.followUpNoteAdded) {
          setActiveStep(STEP_CONFIG.find(s => (s as any).subKey === 'followUpNote') || null);
          return;
        }
        if (!state.followUpStatusChanged) {
          setActiveStep(STEP_CONFIG.find(s => (s as any).subKey === 'followUpStatus') || null);
          return;
        }
      }
    }

    const current = STEP_CONFIG.find(s => {
      if (s.key === 'searchDone') return false;
      if ((s as any).subKey) return false; // Skip sub-steps, handled above
      return !state[s.key as keyof typeof state];
    });
    setActiveStep(current || null);
  }, [state, isDemoUser, allDone, walkthroughOpen]);

  // Listen for trial modal to pause/resume overlay
  useEffect(() => {
    const onModalOpen = () => setPaused(true);
    const onModalClose = () => setPaused(false);
    window.addEventListener('trial-modal-opened', onModalOpen);
    window.addEventListener('trial-modal-closed', onModalClose);
    return () => {
      window.removeEventListener('trial-modal-opened', onModalOpen);
      window.removeEventListener('trial-modal-closed', onModalClose);
    };
  }, []);

  // Poll input values to advance sub-steps for searchDone
  useEffect(() => {
    if (!isDemoUser || state.searchDone || !walkthroughOpen) return;
    const interval = setInterval(() => {
      const businessInput = document.querySelector('[data-walkthrough-step="business-type"]') as HTMLInputElement;
      const locationInput = document.querySelector('[data-walkthrough-step="location"]') as HTMLInputElement;
      const businessFilled = businessInput && businessInput.value.trim().length > 0;
      const locationFilled = locationInput && locationInput.value.trim().length > 0;

      if (!businessFilled) {
        if (activeStep?.selector !== '[data-walkthrough-step="business-type"]') setActiveStep(STEP_CONFIG[0]);
      } else if (!locationFilled) {
        if (activeStep?.selector !== '[data-walkthrough-step="location"]') setActiveStep(STEP_CONFIG[1]);
      } else {
        if (activeStep?.selector !== '[data-walkthrough-step="search"]') setActiveStep(STEP_CONFIG[2]);
      }
    }, 300);
    return () => clearInterval(interval);
  }, [isDemoUser, state.searchDone, walkthroughOpen, activeStep?.selector]);

  // Poll for followUpSet sub-step advancement (event-driven now, polling only for action/date visual state)
  useEffect(() => {
    if (!isDemoUser || state.followUpSet || !walkthroughOpen) return;
    if (!activeStep || activeStep.key !== 'followUpSet') return;
    // No polling needed — advancement is event-driven via DemoChecklistContext
  }, [isDemoUser, state.followUpSet, walkthroughOpen, activeStep]);

  // Track element position
  const updatePosition = useCallback(() => {
    if (!activeStep || paused) {
      setTargetRect(null);
      return;
    }

    const el = document.querySelector(activeStep.selector);
    if (!el) {
      setTargetRect(null);
      rafRef.current = requestAnimationFrame(updatePosition);
      return;
    }

    const rect = el.getBoundingClientRect();
    
    if (rect.top < 0 || rect.bottom > window.innerHeight) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    setTargetRect(rect);

    const padding = 12;
    const tooltipHeight = 48;
    const spaceBelow = window.innerHeight - rect.bottom;
    
    // Clamp left position so tooltip doesn't go off-screen
    const tooltipWidth = 260;
    const rawLeft = rect.left + rect.width / 2;
    const minLeft = tooltipWidth / 2 + 8;
    const maxLeft = window.innerWidth - tooltipWidth / 2 - 8;
    const clampedLeft = Math.max(minLeft, Math.min(maxLeft, rawLeft));

    if (activeStep.tooltipPosition === 'right') {
      // On mobile (narrow screens), fall back to top/bottom positioning
      const isMobile = window.innerWidth < 640;
      if (isMobile) {
        // Position above or below the element instead of to the right
        const preferTop = rect.top > tooltipHeight + padding;
        if (preferTop) {
          setTooltipPos({ top: rect.top - tooltipHeight - padding, left: clampedLeft });
        } else {
          setTooltipPos({ top: rect.bottom + padding, left: clampedLeft });
        }
      } else {
        const rightLeft = rect.right + padding;
        const topCenter = rect.top + rect.height / 2;
        setTooltipPos({ top: topCenter, left: rightLeft });
      }
    } else {
      const preferTop = activeStep.tooltipPosition === 'top';
      if (preferTop || spaceBelow <= tooltipHeight + padding) {
        setTooltipPos({ top: rect.top - tooltipHeight - padding, left: clampedLeft });
      } else {
        setTooltipPos({ top: rect.bottom + padding, left: clampedLeft });
      }
    }

    rafRef.current = requestAnimationFrame(updatePosition);
  }, [activeStep, paused]);

  useEffect(() => {
    rafRef.current = requestAnimationFrame(updatePosition);
    return () => {
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [updatePosition]);

  // Log analytics
  useEffect(() => {
    if (!activeStep) return;
    try {
      supabase.rpc('log_usage_event', {
        p_event_type: 'walkthrough_step_viewed',
        p_meta: { step: activeStep.key },
      });
    } catch {}
  }, [activeStep?.key]);

  if (!activeStep || !walkthroughOpen || paused || allDone) return null;
  if (!targetRect) return null;

  const pad = 8;
  const spotlightStyle = {
    top: targetRect.top - pad,
    left: targetRect.left - pad,
    width: targetRect.width + pad * 2,
    height: targetRect.height + pad * 2,
  };

  const isLocationStep = activeStep.selector === '[data-walkthrough-step="location"]';
  const useNoDim = activeStep.noDim === true;

  return createPortal(
    <div className="fixed inset-0 z-[9998] pointer-events-none" aria-hidden="true">
      {/* Dim overlay with cutout — skip if noDim */}
      {!useNoDim && (
        <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'auto' }}>
          <defs>
            <mask id="walkthrough-mask">
              <rect x="0" y="0" width="100%" height="100%" fill="white" />
              <rect
                x={spotlightStyle.left}
                y={spotlightStyle.top}
                width={spotlightStyle.width}
                height={spotlightStyle.height}
                rx="8"
                fill="black"
              />
              {isLocationStep && (() => {
                const qlEl = document.querySelector('[data-walkthrough-step="quick-locations"]');
                if (!qlEl) return null;
                const qlRect = qlEl.getBoundingClientRect();
                return (
                  <rect
                    x={qlRect.left - 4}
                    y={qlRect.top - 4}
                    width={qlRect.width + 8}
                    height={qlRect.height + 8}
                    rx="8"
                    fill="black"
                  />
                );
              })()}
            </mask>
          </defs>
          <rect
            x="0" y="0"
            width="100%" height="100%"
            fill="rgba(0,0,0,0.4)"
            mask="url(#walkthrough-mask)"
            onClick={(e) => e.stopPropagation()}
          />
        </svg>
      )}

      {/* Pulse ring around target */}
      <div
        className="absolute rounded-lg border-2 border-primary pointer-events-none"
        style={{
          ...spotlightStyle,
          boxShadow: '0 0 0 4px hsl(var(--primary) / 0.2)',
          animation: 'walkthrough-pulse 1.8s ease-in-out infinite',
        }}
      />

      {/* Make target element clickable/typeable through overlay — only needed when dimmed */}
      {!useNoDim && (
        <div
          className="absolute"
          style={{ ...spotlightStyle, zIndex: 9999, pointerEvents: 'auto', background: 'transparent' }}
          onClick={() => {
            const el = document.querySelector(activeStep.selector) as HTMLElement;
            if (el) el.click();
          }}
          onMouseDown={(e) => {
            const el = document.querySelector(activeStep.selector) as HTMLElement;
            if (el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA')) {
              e.preventDefault();
              el.focus();
            }
          }}
        />
      )}

      {/* Make quick locations clickable during location step */}
      {isLocationStep && !useNoDim && (() => {
        const qlEl = document.querySelector('[data-walkthrough-step="quick-locations"]');
        if (!qlEl) return null;
        const qlRect = qlEl.getBoundingClientRect();
        return (
          <div
            className="absolute"
            style={{
              top: qlRect.top - 4,
              left: qlRect.left - 4,
              width: qlRect.width + 8,
              height: qlRect.height + 8,
              zIndex: 9999,
              pointerEvents: 'auto',
              background: 'transparent',
            }}
            onClick={(e) => {
              const target = document.elementFromPoint(e.clientX, e.clientY) as HTMLElement;
              if (target) target.click();
            }}
          />
        );
      })()}

      {/* Tooltip */}
      {tooltipPos && (
        <div
          className="absolute pointer-events-none px-3 py-2 rounded-lg bg-card border border-border shadow-lg text-xs text-foreground max-w-[260px] text-center"
          style={{
            top: tooltipPos.top,
            left: tooltipPos.left,
            transform: (activeStep.tooltipPosition === 'right' && window.innerWidth >= 640) ? 'translateY(-50%)' : 'translateX(-50%)',
            zIndex: 9999,
          }}
        >
          {activeStep.tooltip}
        </div>
      )}

      <style>{`
        @keyframes walkthrough-pulse {
          0%, 100% { transform: scale(1); opacity: 0.8; }
          50% { transform: scale(1.03); opacity: 1; }
        }
      `}</style>
    </div>,
    document.body
  );
}
