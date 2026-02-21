import { useState, useEffect, useCallback, useRef } from 'react';
import { useDemoChecklist } from '@/contexts/DemoChecklistContext';
import { useWalkthroughStatus } from '@/hooks/useWalkthroughStatus';
import { createPortal } from 'react-dom';
import { supabase } from '@/integrations/supabase/client';

const STEP_CONFIG: {
  key: string;
  selector: string;
  tooltip: string;
}[] = [
  {
    key: 'searchDone',
    selector: '[data-walkthrough-step="search"]',
    tooltip: 'Enter a business type and location, then click Find Leads.',
  },
  {
    key: 'addedToCrm',
    selector: '[data-walkthrough-step="add-to-crm"]',
    tooltip: 'Click the clipboard icon to add a lead to your CRM.',
  },
  {
    key: 'contactAttempted',
    selector: '[data-walkthrough-step="contact"]',
    tooltip: 'Tap WhatsApp or SMS to contact this lead.',
  },
  {
    key: 'statusUpdated',
    selector: '[data-walkthrough-step="status"]',
    tooltip: 'Update the status, then hit the ⭐ to track.',
  },
  {
    key: 'leadTracked',
    selector: '[data-walkthrough-step="track-leads"]',
    tooltip: 'Open the Track Leads page to see starred leads.',
  },
  {
    key: 'followUpSet',
    selector: '[data-walkthrough-step="follow-up"]',
    tooltip: 'Set a follow-up action and date, then save.',
  },
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
    const current = STEP_CONFIG.find(s => !state[s.key as keyof typeof state]);
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
    
    // If element is not visible, scroll into view
    if (rect.top < 0 || rect.bottom > window.innerHeight) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }

    setTargetRect(rect);

    // Position tooltip below or above element
    const padding = 12;
    const tooltipHeight = 48;
    const spaceBelow = window.innerHeight - rect.bottom;
    
    if (spaceBelow > tooltipHeight + padding) {
      setTooltipPos({ top: rect.bottom + padding, left: rect.left + rect.width / 2 });
    } else {
      setTooltipPos({ top: rect.top - tooltipHeight - padding, left: rect.left + rect.width / 2 });
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

  return createPortal(
    <div className="fixed inset-0 z-[9998] pointer-events-none" aria-hidden="true">
      {/* Dim overlay with cutout */}
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
          fill="rgba(0,0,0,0.4)"
          mask="url(#walkthrough-mask)"
          onClick={(e) => e.stopPropagation()}
        />
      </svg>

      {/* Pulse ring around target */}
      <div
        className="absolute rounded-lg border-2 border-primary animate-pulse pointer-events-none"
        style={{
          ...spotlightStyle,
          boxShadow: '0 0 0 4px hsl(var(--primary) / 0.2)',
          animation: 'walkthrough-pulse 1.8s ease-in-out infinite',
        }}
      />

      {/* Make target element clickable through overlay */}
      <div
        className="absolute pointer-events-auto"
        style={spotlightStyle}
      />

      {/* Tooltip */}
      {tooltipPos && (
        <div
          className="absolute pointer-events-none px-3 py-2 rounded-lg bg-card border border-border shadow-lg text-xs text-foreground max-w-[260px] text-center"
          style={{
            top: tooltipPos.top,
            left: tooltipPos.left,
            transform: 'translateX(-50%)',
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
