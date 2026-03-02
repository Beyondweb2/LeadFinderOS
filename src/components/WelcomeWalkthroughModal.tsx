import { useState, useEffect } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import appLogo from '@/assets/logo.png';
import { ArrowRight, Check } from 'lucide-react';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';

/**
 * Welcome modal shown to brand-new users before the walkthrough starts.
 * Reads `has_seen_walkthrough_prompt` from user_trials.
 * Once dismissed (either choice), sets it to true via ensure-trial edge function pattern
 * and either triggers the walkthrough or lets the user continue normally.
 */
export function WelcomeWalkthroughModal() {
  const { user } = useAuth();
  const [show, setShow] = useState(false);
  const [checked, setChecked] = useState(false);

  // Check DB on mount
  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    supabase
      .from('user_trials')
      .select('has_seen_walkthrough_prompt')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setChecked(true);
        if (data && !data.has_seen_walkthrough_prompt) {
          setShow(true);
          // Signal to DemoChecklistContext to NOT auto-open walkthrough
          (window as any).__welcomeModalActive = true;
        }
      });

    return () => { cancelled = true; };
  }, [user?.id]);

  const dismiss = async (startWalkthrough: boolean) => {
    setShow(false);
    (window as any).__welcomeModalActive = false;

    // Persist to DB (user_trials has RLS deny on update, so use edge function)
    if (user?.id) {
      try {
        await supabase.functions.invoke('ensure-trial', {
          body: { action: 'mark_walkthrough_prompt_seen' },
        });
      } catch {
        // Non-critical — worst case they see it once more
      }
    }

    if (startWalkthrough) {
      // Dispatch event so DemoChecklistContext opens the walkthrough panel
      window.dispatchEvent(new CustomEvent('start-walkthrough'));
    } else {
      // Skip — dismiss walkthrough entirely and immediately
      if (user?.id) {
        try {
          localStorage.setItem(`demo_walkthrough_dismissed_${user.id}`, 'true');
          localStorage.setItem(`walkthrough_completed_${user.id}`, 'true');
        } catch {}
      }
      // Tell DemoChecklistContext to close & never auto-open
      window.dispatchEvent(new CustomEvent('skip-walkthrough'));
    }
  };

  if (!checked || !show) return null;

  return (
    <Dialog open={show} onOpenChange={(v) => { if (!v) dismiss(false); }}>
      <DialogContent
        hideClose
        className="max-w-sm sm:max-w-[400px] mx-auto p-0 overflow-hidden border-border/40 bg-[hsl(220_50%_5%)] rounded-2xl outline-none focus:outline-none focus-visible:outline-none [&:focus]:outline-none [&:focus-visible]:ring-0"
      >
        <div className="px-7 pt-7 pb-6 sm:px-8 sm:pt-8 sm:pb-7 flex flex-col items-center">
          {/* Brand — 3-column centered layout */}
          <div className="grid grid-cols-[40px_1fr_40px] items-center w-full mb-6">
            <div className="flex justify-start">
              <img src={appLogo} alt="LeadFinder Pro" className="h-9 w-9 shrink-0" />
            </div>
            <h2 className="text-lg font-bold tracking-tight text-center">
              Lead<span className="text-primary">Finder</span> Pro
            </h2>
            <div />
          </div>

          {/* Headline */}
          <h3 className="text-center text-[22px] sm:text-2xl font-bold leading-[1.2] tracking-tight mb-4 text-foreground">
            Let's Get Your <span className="text-primary">First Clients</span> 👋
          </h3>

          {/* Body */}
          <div className="text-center text-[14px] text-muted-foreground/80 leading-relaxed mb-2">
            <p>Follow this short guided mission to contact 3 real businesses in under 2 minutes.</p>
          </div>
          <div className="text-left text-[13px] text-muted-foreground/70 leading-relaxed mb-6 space-y-1.5 w-full px-2">
            <p className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400 shrink-0" /> Find live businesses instantly</p>
            <p className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400 shrink-0" /> Contact them in one click</p>
            <p className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-400 shrink-0" /> Start building your pipeline</p>
          </div>

          {/* Primary CTA */}
          <button
            onClick={() => dismiss(true)}
            className="btn-premium w-full h-12 rounded-xl text-[15px] font-semibold text-white flex items-center justify-center gap-2 transition-all mb-3 outline-none focus:outline-none focus-visible:outline-none border-none ring-0 focus:ring-0 focus-visible:ring-0"
          >
            Start Client Mission
            <ArrowRight className="h-4 w-4" />
          </button>

          {/* Secondary */}
          <button
            onClick={() => dismiss(false)}
            className="w-full h-10 rounded-xl text-[13px] font-medium text-muted-foreground/70 hover:text-foreground transition-colors"
          >
            I'll explore on my own
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
