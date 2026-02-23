import { useState, useEffect, useCallback, useRef } from 'react';
import { useDemoChecklist } from '@/contexts/DemoChecklistContext';
import { useWalkthroughStatus } from '@/hooks/useWalkthroughStatus';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';

interface StepDef {
  step: number;
  selector: string;
  tooltip: string | ((state: any) => string);
  noDim?: boolean;
  tooltipPosition?: 'top' | 'bottom' | 'right';
}

const TOTAL_STEPS = 7;

function getActiveStep(state: any, pathname: string): StepDef | null {
  // Step 1 – Go to Search
  if (!state.searchDone) {
    if (pathname !== '/find-leads') {
      return { step: 1, selector: '[data-walkthrough="search-nav"]', tooltip: 'Start by finding businesses.' };
    }
    // On search page, existing search form guidance takes over — no overlay needed
    return null;
  }

  // Step 2 – Add 3 businesses to CRM
  if (!state.addedToCrm) {
    const remaining = Math.max(0, 3 - (state.crmAddCount || 0));
    return {
      step: 2,
      selector: '[data-walkthrough="add-crm"]',
      tooltip: remaining > 0 ? `Add ${remaining} more business${remaining !== 1 ? 'es' : ''} to your CRM.` : 'Add businesses to your CRM.',
      noDim: true,
      tooltipPosition: 'top',
    };
  }

  // Step 3 – Go to CRM page
  if (!state.crmPageOpened) {
    return { step: 3, selector: '[data-walkthrough="crm-nav"]', tooltip: 'Open your CRM to contact and manage leads.' };
  }

  // Step 4 – Contact a lead
  if (!state.contactAttempted) {
    if (pathname === '/outreach') {
      return { step: 4, selector: '[data-walkthrough="contact"]', tooltip: 'Send your first outreach message.', noDim: true };
    }
    return { step: 4, selector: '[data-walkthrough="crm-nav"]', tooltip: 'Open your CRM to contact a lead.' };
  }

  // Step 5 – Update Status, Set Next Action, Track ⭐
  if (!state.statusUpdated) {
    if (!state.statusChanged) {
      return { step: 5, selector: '[data-walkthrough="status"]', tooltip: 'Update the contact status.', noDim: true, tooltipPosition: 'right' };
    }
    if (!state.step4ActionSet) {
      return { step: 5, selector: '[data-walkthrough="next-action"]', tooltip: 'Set the next action.', noDim: true };
    }
    if (!state.trackPressed) {
      return { step: 5, selector: '[data-walkthrough="track"]', tooltip: 'Track this lead.', noDim: true };
    }
  }

  // Step 6 – Open Track page
  if (!state.leadTracked) {
    return { step: 6, selector: '[data-walkthrough="track-nav"]', tooltip: 'Open Track to manage your pipeline.' };
  }

  // Step 7 – Add note
  if (!state.noteAdded) {
    return { step: 7, selector: '[data-walkthrough="notes"]', tooltip: 'Add a note to remember key details.', noDim: true };
  }

  return null;
}

export function WalkthroughOverlay() {
  const { state, allDone, isDemoUser } = useDemoChecklist();
  const { walkthroughOpen } = useWalkthroughStatus();
  const location = useLocation();
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(null);
  const [activeStep, setActiveStep] = useState<StepDef | null>(null);
  const [paused, setPaused] = useState(false);
  const rafRef = useRef<number>();

  // Find the current active step
  useEffect(() => {
    if (!isDemoUser || allDone || !walkthroughOpen) {
      setActiveStep(null);
      return;
    }
    setActiveStep(getActiveStep(state, location.pathname));
  }, [state, isDemoUser, allDone, walkthroughOpen, location.pathname]);

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
    const tooltipHeight = 60;
    const spaceBelow = window.innerHeight - rect.bottom;

    const tooltipWidth = 260;
    const rawLeft = rect.left + rect.width / 2;
    const minLeft = tooltipWidth / 2 + 8;
    const maxLeft = window.innerWidth - tooltipWidth / 2 - 8;
    const clampedLeft = Math.max(minLeft, Math.min(maxLeft, rawLeft));

    if (activeStep.tooltipPosition === 'right') {
      const isMobile = window.innerWidth < 640;
      if (isMobile) {
        const preferTop = rect.top > tooltipHeight + padding;
        if (preferTop) {
          setTooltipPos({ top: rect.top - tooltipHeight - padding, left: clampedLeft });
        } else {
          setTooltipPos({ top: rect.bottom + padding, left: clampedLeft });
        }
      } else {
        setTooltipPos({ top: rect.top + rect.height / 2, left: rect.right + padding });
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

  if (!activeStep || !walkthroughOpen || paused || allDone) return null;
  if (!targetRect) return null;

  const pad = 8;
  const spotlightStyle = {
    top: targetRect.top - pad,
    left: targetRect.left - pad,
    width: targetRect.width + pad * 2,
    height: targetRect.height + pad * 2,
  };

  const useNoDim = activeStep.noDim === true;
  const tooltipText = typeof activeStep.tooltip === 'function' ? activeStep.tooltip(state) : activeStep.tooltip;

  return createPortal(
    <div className="fixed inset-0 z-[9998] pointer-events-none" aria-hidden="true">
      {/* Dim overlay with cutout */}
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
            </mask>
          </defs>
          <rect
            x="0" y="0"
            width="100%" height="100%"
            fill="rgba(0,0,0,0.35)"
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
          boxShadow: '0 0 0 4px hsl(var(--primary) / 0.25), 0 0 20px 4px hsl(var(--primary) / 0.15)',
          animation: 'walkthrough-pulse 1.5s ease-in-out infinite',
        }}
      />

      {/* Make target element clickable through overlay — only when dimmed */}
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

      {/* Tooltip with step counter */}
      {tooltipPos && (
        <div
          className="absolute pointer-events-none px-3 py-2.5 rounded-lg bg-card border border-border shadow-lg max-w-[260px] text-center"
          style={{
            top: tooltipPos.top,
            left: tooltipPos.left,
            transform: (activeStep.tooltipPosition === 'right' && window.innerWidth >= 640) ? 'translateY(-50%)' : 'translateX(-50%)',
            zIndex: 9999,
          }}
        >
          <div className="text-[10px] font-semibold text-primary mb-0.5">
            Step {activeStep.step} of {TOTAL_STEPS}
          </div>
          <div className="text-xs text-foreground">
            {tooltipText}
          </div>
        </div>
      )}

      <style>{`
        @keyframes walkthrough-pulse {
          0%, 100% { transform: scale(1); opacity: 0.8; }
          50% { transform: scale(1.04); opacity: 1; }
        }
      `}</style>
    </div>,
    document.body
  );
}
