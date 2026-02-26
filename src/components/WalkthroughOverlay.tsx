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

const TOTAL_STEPS = 8; // Display as "Step X of 8"

function getActiveStep(state: any, pathname: string): StepDef | null {
  // Step 1 – Search for businesses
  if (!state.searchDone) {
    if (pathname !== '/find-leads') {
      return { step: 1, selector: '[data-walkthrough="search-nav"]', tooltip: 'Search for a business category & location.', noDim: true };
    }
    const bizInput = document.querySelector('[data-walkthrough-step="business-type"]');
    const bizValue = (bizInput as HTMLInputElement)?.value?.trim();
    if (!bizValue) {
      return { step: 1, selector: '[data-walkthrough-step="business-type"]', tooltip: 'Type a business type (e.g. plumber).', noDim: true };
    }
    const locInput = document.querySelector('[data-walkthrough-step="location"]');
    const locValue = (locInput as HTMLInputElement)?.value?.trim();
    if (!locValue) {
      return { step: 1, selector: '[data-walkthrough-step="location-area"]', tooltip: 'Type a location or pick one from Quick Locations.', noDim: true };
    }
    return { step: 1, selector: '[data-walkthrough-step="search"]', tooltip: 'Press Find Leads to search.', noDim: true };
  }

  // Step 2 – Find a "No Website" lead & add to CRM
  if (!state.addedToCrm) {
    const remaining = 3 - (state.crmAddCount || 0);
    return {
      step: 2,
      selector: '[data-walkthrough="add-crm"]',
      tooltip: remaining > 1
        ? `"No Website" = they need YOU. Add ${remaining} businesses to your CRM.`
        : `One more! Add 1 more business to your CRM.`,
      noDim: true,
      tooltipPosition: 'top',
    };
  }

  // Step 3 – Go to CRM
  if (!state.crmPageOpened) {
    return { step: 3, selector: '[data-walkthrough="crm-nav"]', tooltip: 'Open your CRM to message this lead.' };
  }

  // Step 4 – Send a message (WhatsApp/SMS/Call)
  if (!state.contactAttempted) {
    if (pathname === '/outreach') {
      return { step: 4, selector: '[data-walkthrough="contact"]', tooltip: 'Send a message now!', noDim: true };
    }
    return { step: 4, selector: '[data-walkthrough="crm-nav"]', tooltip: 'Open your CRM to send a message.' };
  }

  // Step 5 – Press Track (star) when a business responds positively
  if (!state.trackPressed) {
    if (pathname === '/outreach') {
      return { step: 5, selector: '[data-walkthrough="track"]', tooltip: 'When they respond positively, press ⭐ to track them.', noDim: true, tooltipPosition: 'top' };
    }
    return { step: 5, selector: '[data-walkthrough="crm-nav"]', tooltip: 'Open your CRM to track a lead.' };
  }

  // Step 6 – Open Track Leads page
  if (!state.leadTracked) {
    return { step: 6, selector: '[data-walkthrough="track-nav"]', tooltip: 'Open Track Leads to manage your pipeline.', tooltipPosition: 'top' };
  }

  // Step 7 – Add a note on the tracked lead
  if (!state.noteAdded) {
    return { step: 7, selector: '[data-walkthrough="notes"]', tooltip: 'Add a note to remember key details about this lead.', noDim: true };
  }

  // Step 8 – Collapse the card to finish
  if (!state.cardCollapsed) {
    return { step: 8, selector: '[data-walkthrough="collapse-card"]', tooltip: 'Collapse the card to finish. You\'re all set!', noDim: true, tooltipPosition: 'top' };
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
  const lastScrolledStepRef = useRef<number | null>(null);
  const [tick, setTick] = useState(0);

  // Re-evaluate sub-steps periodically (for input value changes on search page)
  useEffect(() => {
    if (!isDemoUser || allDone || !walkthroughOpen) return;
    const interval = setInterval(() => setTick(t => t + 1), 500);
    return () => clearInterval(interval);
  }, [isDemoUser, allDone, walkthroughOpen]);

  // Find the current active step
  useEffect(() => {
    if (!isDemoUser || allDone || !walkthroughOpen) {
      setActiveStep(null);
      return;
    }
    const next = getActiveStep(state, location.pathname);
    setActiveStep(next);

    // Auto-scroll to the target element once per step change
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
  }, [state, isDemoUser, allDone, walkthroughOpen, location.pathname, tick]);

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

    // Find the first *visible* matching element (non-zero dimensions)
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

    // Only auto-scroll once per step change, not every frame
    // This prevents hijacking user scroll on mobile

    setTargetRect(rect);

    const padding = 12;
    const tooltipHeight = 70;
    const spaceBelow = window.innerHeight - rect.bottom;
    const isMobile = window.innerWidth < 640;
    const mobileNavHeight = isMobile ? 90 : 0;

    const tooltipWidth = 260;
    const rawLeft = rect.left + rect.width / 2;
    const minLeft = tooltipWidth / 2 + 8;
    const maxLeft = window.innerWidth - tooltipWidth / 2 - 8;
    const clampedLeft = Math.max(minLeft, Math.min(maxLeft, rawLeft));

    if (activeStep.tooltipPosition === 'right') {
      if (isMobile) {
        // On mobile, always place tooltip above elements near bottom nav
        setTooltipPos({ top: rect.top - tooltipHeight - padding, left: clampedLeft });
      } else {
        setTooltipPos({ top: rect.top + rect.height / 2, left: rect.right + padding });
      }
    } else {
      const preferTop = activeStep.tooltipPosition === 'top';
      // On mobile, ensure tooltip doesn't go behind bottom nav
      const effectiveSpaceBelow = spaceBelow - mobileNavHeight;
      if (preferTop || effectiveSpaceBelow <= tooltipHeight + padding) {
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
        className="absolute rounded-lg border-2 border-amber-400/60 pointer-events-none"
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
          className="absolute pointer-events-none px-3.5 py-3 rounded-xl bg-amber-50 border border-amber-400 shadow-[0_0_20px_rgba(245,158,11,0.2)] max-w-[260px] text-center"
          style={{
            top: tooltipPos.top,
            left: tooltipPos.left,
            transform: (activeStep.tooltipPosition === 'right' && window.innerWidth >= 640) ? 'translateY(-50%)' : 'translateX(-50%)',
            zIndex: 41,
          }}
        >
          <div className="text-[10px] font-bold uppercase tracking-widest text-amber-700 mb-1">
            Step {activeStep.step} of {TOTAL_STEPS}
          </div>
          <div className="text-[13px] text-gray-900 font-medium" style={{ lineHeight: 1.5, letterSpacing: '0.02em' }}>
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
