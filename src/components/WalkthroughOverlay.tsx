import { useState, useEffect, useCallback, useRef } from 'react';
import { useDemoChecklist } from '@/contexts/DemoChecklistContext';
import { useWalkthroughStatus } from '@/hooks/useWalkthroughStatus';
import { useWalkthroughTracking } from '@/hooks/useWalkthroughTracking';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

interface StepDef {
  step: number;
  selector: string;
  tooltip: string | ((state: any) => string);
  noDim?: boolean;
  tooltipPosition?: 'top' | 'bottom' | 'right';
  /** Selector for a safe anchor element to position tooltip near (not on top of target) */
  anchorNearSelector?: string;
}

const TOTAL_STEPS = 11;

function getActiveStep(state: any, pathname: string, t: any): StepDef | null {
  if (!state.searchDone) {
    if (pathname !== '/find-leads') {
      return { step: 1, selector: '[data-walkthrough="search-nav"]', tooltip: t('walkthrough.step1SearchNav'), noDim: true };
    }
    const bizInput = document.querySelector('[data-walkthrough-step="business-type"]');
    const bizValue = (bizInput as HTMLInputElement)?.value?.trim();
    if (!bizValue) {
      return { step: 1, selector: '[data-walkthrough-step="business-type-area"]', tooltip: t('walkthrough.step1BusinessType'), noDim: true };
    }
    const locInput = document.querySelector('[data-walkthrough-step="location"]');
    const locValue = (locInput as HTMLInputElement)?.value?.trim();
    if (!locValue) {
      return { step: 1, selector: '[data-walkthrough-step="location-area"]', tooltip: t('walkthrough.step1Location'), noDim: true };
    }
    return { step: 1, selector: '[data-walkthrough-step="search"]', tooltip: t('walkthrough.step1Search'), noDim: true };
  }

  if (!state.addedToCrm) {
    // Hide step 2 when results are blurred (paywall/trial limit)
    const isBlurred = !!document.querySelector('.backdrop-blur-md');
    if (isBlurred) return null;
    const selected = state.crmAddCount || 0;
    return {
      step: 2, selector: '[data-walkthrough="add-crm"]',
      tooltip: t('walkthrough.step2Select', { count: selected }),
      noDim: true, anchorNearSelector: '[data-walkthrough="actions-column-header"]',
    };
  }

  if (!state.threeContactsMade) {
    const contacted = state.contactsMadeCount || 0;
    if (pathname === '/outreach') {
      // Wait for the contact target to render before showing tooltip (prevents flicker on navigation)
      const contactEl = document.querySelector('[data-walkthrough="contact"]');
      if (!contactEl) return null;
      return { step: 3, selector: '[data-walkthrough="contact"]', tooltip: t('walkthrough.step3Contact', { count: contacted }), noDim: true };
    }
    return { step: 3, selector: '[data-walkthrough="crm-nav"]', tooltip: t('walkthrough.step3NavToOutreach', { count: contacted }) };
  }

  if (!state.trackPressed) {
    if (pathname === '/outreach') {
      return { step: 5, selector: '[data-walkthrough="track"]', tooltip: t('walkthrough.step5Track'), noDim: true };
    }
    return { step: 5, selector: '[data-walkthrough="crm-nav"]', tooltip: t('walkthrough.step5NavToOutreach') };
  }

  if (!state.viewedProgress) {
    return { step: 6, selector: '[data-walkthrough="track-nav"]', tooltip: t('walkthrough.step6Pipeline'), tooltipPosition: 'top' };
  }

  if (!state.trackStatusSet) {
    return { step: 7, selector: '[data-walkthrough-step="track-status-select"]', tooltip: t('walkthrough.step7Status'), noDim: true };
  }

  if (!state.nextActionSet) {
    return { step: 8, selector: '[data-walkthrough="next-action"]', tooltip: t('walkthrough.step8NextAction'), noDim: true };
  }

  if (!state.nextDateSet) {
    return { step: 9, selector: '[data-walkthrough-step="follow-up-date"]', tooltip: t('walkthrough.step9Date'), noDim: true };
  }

  if (!state.noteAdded) {
    return { step: 10, selector: '[data-walkthrough="notes"]', tooltip: t('walkthrough.step10Note'), noDim: true };
  }

  if (!state.cardCollapsed) {
    return { step: 11, selector: '[data-walkthrough="collapse-card"]', tooltip: t('walkthrough.step11Collapse'), noDim: true, tooltipPosition: 'top' };
  }

  return null;
}

/**
 * Compute a tooltip position anchored near (but not on top of) a reference element.
 * The tooltip sits above the anchor with a left offset so it doesn't cover the action buttons.
 */
function computeAnchoredTooltipPos(
  anchorSelector: string,
  targetRect: DOMRect,
): { top: number; left: number; placement: 'above-left' | 'above-right' | 'sticky-top' } | null {
  const anchor = document.querySelector(anchorSelector);
  if (!anchor) return null;

  const anchorRect = anchor.getBoundingClientRect();
  const tooltipW = 270;
  const tooltipH = 80;
  const gap = 16; // minimum spacing from any interactive element

  // Strategy 1: Position above the Actions column header, shifted left
  const aboveTop = anchorRect.top - tooltipH - gap;
  const aboveLeft = anchorRect.left + anchorRect.width / 2;
  
  if (aboveTop > 10) {
    // Clamp horizontally
    const clampedLeft = Math.max(tooltipW / 2 + 8, Math.min(window.innerWidth - tooltipW / 2 - 8, aboveLeft));
    return { top: aboveTop, left: clampedLeft, placement: 'above-left' };
  }

  // Strategy 2: Position to the left of the Actions column
  const leftOfColumn = anchorRect.left - tooltipW - gap;
  if (leftOfColumn > 10) {
    return { top: anchorRect.top + anchorRect.height / 2, left: leftOfColumn + tooltipW / 2, placement: 'above-right' };
  }

  // Strategy 3: Sticky at top of viewport
  return { top: 70, left: window.innerWidth / 2, placement: 'sticky-top' };
}

export function WalkthroughOverlay() {
  const { state, allDone, isDemoUser, isReplay } = useDemoChecklist();
  const isActive = isDemoUser || isReplay;
  const { walkthroughOpen } = useWalkthroughStatus();
  const { logStepView, logExit } = useWalkthroughTracking(isReplay);
  const location = useLocation();
  const { t } = useTranslation();
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
    const next = getActiveStep(state, location.pathname, t);
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

    // If this step uses anchored positioning (Step 2), compute position relative to anchor (desktop only)
    if (activeStep.anchorNearSelector && window.innerWidth >= 640) {
      const anchored = computeAnchoredTooltipPos(activeStep.anchorNearSelector, rect);
      if (anchored) {
        setTooltipPos({ top: anchored.top, left: anchored.left });
        rafRef.current = requestAnimationFrame(updatePosition);
        return;
      }
    }

    // Default tooltip positioning
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

      {/* Floating tooltip */}
      {tooltipPos && (
        <div
          className="px-3.5 py-3 rounded-xl bg-[hsl(220,50%,7%)] border border-amber-500/50 shadow-[0_0_20px_rgba(245,158,11,0.15)] max-w-[270px] text-center"
          style={{
            position: 'fixed',
            top: tooltipPos.top,
            left: tooltipPos.left,
            transform: (activeStep.tooltipPosition === 'right' && window.innerWidth >= 640) ? 'translateY(-50%)' : 'translateX(-50%)',
            zIndex: 41,
            pointerEvents: activeStep.step === 3 ? 'auto' : 'none',
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
