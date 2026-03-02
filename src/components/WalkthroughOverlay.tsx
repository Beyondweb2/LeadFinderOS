import { useState, useEffect, useCallback, useRef } from 'react';
import { useDemoChecklist } from '@/contexts/DemoChecklistContext';
import { useWalkthroughStatus } from '@/hooks/useWalkthroughStatus';
import { useWalkthroughTracking } from '@/hooks/useWalkthroughTracking';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';

interface StepDef {
  step: number;
  selector: string;
  tooltip: string | ((state: any) => string);
  noDim?: boolean;
  tooltipPosition?: 'top' | 'bottom' | 'right';
}

const TOTAL_STEPS = 8;

function getActiveStep(state: any, pathname: string): StepDef | null {
  // Step 1 – Search for businesses
  if (!state.searchDone) {
    if (pathname !== '/find-leads') {
      return { step: 1, selector: '[data-walkthrough="search-nav"]', tooltip: 'Search for a business category & location.', noDim: true };
    }
    const bizInput = document.querySelector('[data-walkthrough-step="business-type"]');
    const bizValue = (bizInput as HTMLInputElement)?.value?.trim();
    if (!bizValue) {
      return { step: 1, selector: '[data-walkthrough-step="business-type-area"]', tooltip: 'Type a business type or tap a quick option.', noDim: true };
    }
    const locInput = document.querySelector('[data-walkthrough-step="location"]');
    const locValue = (locInput as HTMLInputElement)?.value?.trim();
    if (!locValue) {
      return { step: 1, selector: '[data-walkthrough-step="location-area"]', tooltip: 'Type a location or pick one from Quick Locations.', noDim: true };
    }
    return { step: 1, selector: '[data-walkthrough-step="search"]', tooltip: 'Press Find Leads to search.', noDim: true };
  }

  // Step 2 – Select 3 leads
  if (!state.addedToCrm) {
    const selected = state.crmAddCount || 0;
    return {
      step: 2,
      selector: '[data-walkthrough="add-crm"]',
      tooltip: `Select 3 businesses you want to contact.\n\nSelected: ${selected} / 3`,
      noDim: true,
      tooltipPosition: 'top',
    };
  }

  // Step 3 – Contact first lead via Call, SMS or WhatsApp
  if (!state.firstContactMade) {
    if (pathname === '/outreach') {
      return { step: 3, selector: '[data-walkthrough="contact"]', tooltip: 'Contact your first lead via Call, SMS or WhatsApp.', noDim: true };
    }
    return { step: 3, selector: '[data-walkthrough="crm-nav"]', tooltip: 'Open your CRM to contact your first lead.' };
  }

  // Step 4 – Contact 2 more leads (3 total)
  if (!state.threeContactsMade) {
    const remaining = 3 - (state.contactsMadeCount || 0);
    if (pathname === '/outreach') {
      return { step: 4, selector: '[data-walkthrough="contact"]', tooltip: `Contact ${remaining} more lead${remaining !== 1 ? 's' : ''} (${state.contactsMadeCount || 0}/3 done).`, noDim: true };
    }
    return { step: 4, selector: '[data-walkthrough="crm-nav"]', tooltip: `Open your CRM — contact ${remaining} more lead${remaining !== 1 ? 's' : ''}.` };
  }

  // Step 5 – View progress in Track Leads
  if (!state.viewedProgress) {
    return { step: 5, selector: '[data-walkthrough="track-nav"]', tooltip: 'View your progress in Track Leads.', tooltipPosition: 'top' };
  }

  // Step 6 – Add a note to one lead
  if (!state.noteAdded) {
    return { step: 6, selector: '[data-walkthrough="notes"]', tooltip: 'Add a note to remember key details about this lead.', noDim: true };
  }

  // Step 7 – Set a next action
  if (!state.nextActionSet) {
    return { step: 7, selector: '[data-walkthrough="next-action"]', tooltip: 'Set a next action or follow-up for one lead.', noDim: true };
  }

  // Step 8 – Collapse a card
  if (!state.cardCollapsed) {
    return { step: 8, selector: '[data-walkthrough="collapse-card"]', tooltip: 'Collapse the card to finish. You\'re all set!', noDim: true, tooltipPosition: 'top' };
  }

  return null;
}

export function WalkthroughOverlay() {
  const { state, allDone, isDemoUser, isReplay } = useDemoChecklist();
  const isActive = isDemoUser || isReplay;
  const { walkthroughOpen } = useWalkthroughStatus();
  const { logStepView, logExit } = useWalkthroughTracking(isReplay);
  const location = useLocation();
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(null);
  const [activeStep, setActiveStep] = useState<StepDef | null>(null);
  const [paused, setPaused] = useState(false);
  const rafRef = useRef<number>();
  const lastScrolledStepRef = useRef<number | null>(null);
  const [tick, setTick] = useState(0);

  // Re-evaluate sub-steps periodically
  useEffect(() => {
    if (!isActive || allDone || !walkthroughOpen) return;
    const interval = setInterval(() => setTick(t => t + 1), 500);
    return () => clearInterval(interval);
  }, [isActive, allDone, walkthroughOpen]);

  // Find the current active step
  useEffect(() => {
    if (!isActive || allDone || !walkthroughOpen) {
      setActiveStep(null);
      return;
    }
    const next = getActiveStep(state, location.pathname);
    setActiveStep(next);

    if (next) {
      logStepView(next.step);
    }

    if (next && next.step !== lastScrolledStepRef.current) {
      lastScrolledStepRef.current = next.step;
      requestAnimationFrame(() => {
        const el = document.querySelector(next.selector);
        if (el) {
          const rect = el.getBoundingClientRect();
          if (rect.top < 0 || rect.bottom > window.innerHeight) {
            el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          }
        }
      });
    }
  }, [state, isActive, allDone, walkthroughOpen, location.pathname, tick, logStepView]);

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

    const allMatches = document.querySelectorAll(activeStep.selector);
    let el: Element | null = null;
    for (const candidate of allMatches) {
      const r = candidate.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) {
        el = candidate;
        break;
      }
    }
    if (!el) {
      setTargetRect(null);
      rafRef.current = requestAnimationFrame(updatePosition);
      return;
    }

    const rect = el.getBoundingClientRect();
    setTargetRect(rect);

    const padding = 12;
    const tooltipHeight = 80;
    const spaceBelow = window.innerHeight - rect.bottom;
    const isMobile = window.innerWidth < 640;
    const mobileNavHeight = isMobile ? 90 : 0;
    const isInBottomNav = isMobile && rect.top > window.innerHeight - 120;

    const tooltipWidth = 260;
    const rawLeft = rect.left + rect.width / 2;
    const minLeft = tooltipWidth / 2 + 8;
    const maxLeft = window.innerWidth - tooltipWidth / 2 - 8;
    const clampedLeft = Math.max(minLeft, Math.min(maxLeft, rawLeft));

    if (activeStep.tooltipPosition === 'right') {
      if (isMobile) {
        setTooltipPos({ top: rect.top - tooltipHeight - padding, left: clampedLeft });
      } else {
        setTooltipPos({ top: rect.top + rect.height / 2, left: rect.right + padding });
      }
    } else {
      const preferTop = activeStep.tooltipPosition === 'top';
      const effectiveSpaceBelow = spaceBelow - mobileNavHeight;
      if (preferTop || effectiveSpaceBelow <= tooltipHeight + padding) {
        const extraOffset = isInBottomNav ? 20 : 0;
        setTooltipPos({ top: rect.top - tooltipHeight - padding - extraOffset, left: clampedLeft });
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
    <div className="fixed inset-0 z-[40] pointer-events-none" aria-hidden="true">
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
        className="absolute rounded-lg border-2 border-amber-500/50 pointer-events-none"
        style={{
          ...spotlightStyle,
          animation: 'walkthrough-pulse 1.5s ease-in-out infinite',
        }}
      />

      {/* Make target element clickable through overlay — only when dimmed */}
      {!useNoDim && (
        <div
          className="absolute"
          style={{ ...spotlightStyle, zIndex: 41, pointerEvents: 'auto', background: 'transparent' }}
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
          className="absolute pointer-events-none px-3.5 py-3 rounded-xl bg-[hsl(220,50%,7%)] border border-amber-500/50 shadow-[0_0_20px_rgba(245,158,11,0.15)] max-w-[260px] text-center"
          style={{
            top: tooltipPos.top,
            left: tooltipPos.left,
            transform: (activeStep.tooltipPosition === 'right' && window.innerWidth >= 640) ? 'translateY(-50%)' : 'translateX(-50%)',
            zIndex: 41,
          }}
        >
          <div className="text-[10px] font-bold uppercase tracking-widest text-amber-400/90 mb-1">
            Step {activeStep.step} of {TOTAL_STEPS}
          </div>
          <div className="text-[13px] text-foreground font-medium leading-relaxed whitespace-pre-line">
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
