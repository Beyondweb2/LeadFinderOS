import { useState, useEffect, useCallback, useRef } from 'react';
import { useDemoChecklist } from '@/contexts/DemoChecklistContext';
import { useWalkthroughStatus } from '@/hooks/useWalkthroughStatus';
import { useWalkthroughTracking } from '@/hooks/useWalkthroughTracking';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';

interface StepDef {
  step: number;
  selector: string;
  tooltip: string;
  noDim?: boolean;
  tooltipPosition?: 'top' | 'bottom' | 'right';
  anchorNearSelector?: string;
}

const TOTAL_STEPS = 4;

function getActiveStep(state: any, pathname: string, t: any): StepDef | null {
  // Step 1: Search for leads
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

  // Step 2: Add lead to CRM
  if (!state.addedToCrm) {
    const isBlurred = !!document.querySelector('.backdrop-blur-md');
    if (isBlurred) return null;
    const selected = state.crmAddCount || 0;
    return {
      step: 2, selector: '[data-walkthrough="add-crm"]',
      tooltip: t('walkthrough.step2Select', { count: selected }),
      noDim: true, anchorNearSelector: '[data-walkthrough="actions-column-header"]',
    };
  }

  // Step 3: Go to Outreach → popup will auto-show there (no guided text on outreach page itself)
  if (!state.outreachIntroDone) {
    if (pathname === '/outreach') {
      // On the outreach page: fire event to show the intro modal, no tooltip needed
      return null;
    }
    return { step: 3, selector: '[data-walkthrough="crm-nav"]', tooltip: t('walkthrough.step3NavToOutreach'), noDim: true };
  }

  // Step 4: Navigate to Track Leads
  if (!state.viewedTrackLeads) {
    return { step: 4, selector: '[data-walkthrough="track-nav"]', tooltip: 'Head to Track Leads to manage interested businesses and close deals', tooltipPosition: 'top', noDim: true };
  }

  return null;
}

function computeAnchoredTooltipPos(
  anchorSelector: string,
  targetRect: DOMRect,
): { top: number; left: number; placement: string } | null {
  const anchor = document.querySelector(anchorSelector);
  if (!anchor) return null;
  const anchorRect = anchor.getBoundingClientRect();
  const tooltipW = 270;
  const tooltipH = 80;
  const gap = 16;
  const aboveTop = anchorRect.top - tooltipH - gap;
  const aboveLeft = anchorRect.left + anchorRect.width / 2;
  if (aboveTop > 10) {
    const clampedLeft = Math.max(tooltipW / 2 + 8, Math.min(window.innerWidth - tooltipW / 2 - 8, aboveLeft));
    return { top: aboveTop, left: clampedLeft, placement: 'above-left' };
  }
  const leftOfColumn = anchorRect.left - tooltipW - gap;
  if (leftOfColumn > 10) {
    return { top: anchorRect.top + anchorRect.height / 2, left: leftOfColumn + tooltipW / 2, placement: 'above-right' };
  }
  return { top: 70, left: window.innerWidth / 2, placement: 'sticky-top' };
}

export function WalkthroughOverlay() {
  const { state, allDone, isDemoUser, isReplay } = useDemoChecklist();
  const isActive = isDemoUser || isReplay;
  const { walkthroughOpen } = useWalkthroughStatus();
  const { logStepView } = useWalkthroughTracking(isReplay);
  const location = useLocation();
  const { t } = useTranslation();
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [tooltipPos, setTooltipPos] = useState<{ top: number; left: number } | null>(null);
  const [activeStep, setActiveStep] = useState<StepDef | null>(null);
  const [paused, setPaused] = useState(false);
  const [initialDelay, setInitialDelay] = useState(true); // Delay walkthrough until page settles
  const rafRef = useRef<number>();
  const lastScrolledStepRef = useRef<number | null>(null);
  const [tick, setTick] = useState(0);
  const introFiredRef = useRef(false);

  // Wait for page to fully render before showing walkthrough
  useEffect(() => {
    const timer = setTimeout(() => setInitialDelay(false), 1200);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (!isActive || allDone || !walkthroughOpen) return;
    const interval = setInterval(() => setTick(t => t + 1), 500);
    return () => clearInterval(interval);
  }, [isActive, allDone, walkthroughOpen]);

  // Fire outreach intro modal when walkthrough reaches step 3 and user is on /outreach
  useEffect(() => {
    if (!isActive || !walkthroughOpen || allDone) return;
    if (state.addedToCrm && !state.outreachIntroDone && location.pathname === '/outreach') {
      if (!introFiredRef.current) {
        introFiredRef.current = true;
        // Small delay to let page render
        setTimeout(() => {
          window.dispatchEvent(new CustomEvent('show-outreach-intro'));
        }, 600);
      }
    }
  }, [isActive, walkthroughOpen, allDone, state.addedToCrm, state.outreachIntroDone, location.pathname]);

  // Reset intro fired flag when outreach intro is done
  useEffect(() => {
    if (state.outreachIntroDone) {
      introFiredRef.current = false;
    }
  }, [state.outreachIntroDone]);

  useEffect(() => {
    if (!isActive || allDone || !walkthroughOpen) {
      setActiveStep(null);
      return;
    }
    const next = getActiveStep(state, location.pathname, t);
    setActiveStep(next);
    if (next) logStepView(next.step);

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

  const updatePosition = useCallback(() => {
    if (!activeStep || paused) {
      setTargetRect(null);
      return;
    }

    const allMatches = document.querySelectorAll(activeStep.selector);
    let el: Element | null = null;
    for (const candidate of allMatches) {
      const r = candidate.getBoundingClientRect();
      if (r.width > 0 && r.height > 0) { el = candidate; break; }
    }
    if (!el) {
      setTargetRect(null);
      rafRef.current = requestAnimationFrame(updatePosition);
      return;
    }

    const rect = el.getBoundingClientRect();
    setTargetRect(rect);

    if (activeStep.anchorNearSelector && window.innerWidth >= 640) {
      const anchored = computeAnchoredTooltipPos(activeStep.anchorNearSelector, rect);
      if (anchored) {
        setTooltipPos({ top: anchored.top, left: anchored.left });
        rafRef.current = requestAnimationFrame(updatePosition);
        return;
      }
    }

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
    return () => { if (rafRef.current) cancelAnimationFrame(rafRef.current); };
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
  const tooltipText = activeStep.tooltip;

  return createPortal(
    <div className="fixed inset-0 z-[40] pointer-events-none" aria-hidden="true">
      {!useNoDim && (
        <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'auto' }}>
          <defs>
            <mask id="walkthrough-mask">
              <rect x="0" y="0" width="100%" height="100%" fill="white" />
              <rect x={spotlightStyle.left} y={spotlightStyle.top} width={spotlightStyle.width} height={spotlightStyle.height} rx="8" fill="black" />
            </mask>
          </defs>
          <rect x="0" y="0" width="100%" height="100%" fill="rgba(0,0,0,0.35)" mask="url(#walkthrough-mask)" onClick={(e) => e.stopPropagation()} />
        </svg>
      )}

      <div
        className="absolute rounded-lg border-2 border-amber-500/50 pointer-events-none"
        style={{ ...spotlightStyle, animation: 'walkthrough-pulse 1.5s ease-in-out infinite' }}
      />

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

      {tooltipPos && (
        <div
          className="px-3.5 py-3 rounded-xl bg-[hsl(220,50%,7%)] border border-amber-500/50 shadow-[0_0_20px_rgba(245,158,11,0.15)] max-w-[270px] text-center"
          style={{
            position: 'fixed',
            top: tooltipPos.top,
            left: tooltipPos.left,
            transform: (activeStep.tooltipPosition === 'right' && window.innerWidth >= 640) ? 'translateY(-50%)' : 'translateX(-50%)',
            zIndex: 41,
            pointerEvents: 'none',
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
