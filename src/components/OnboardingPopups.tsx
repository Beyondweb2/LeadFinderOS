import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import appLogo from '@/assets/logo.png';
import { ArrowRight, MessageCircle, Phone, BarChart3, Target } from 'lucide-react';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';

const ONBOARDING_KEY_PREFIX = 'leadfinder_onboarding_done';

function getOnboardingKey(userId?: string) {
  return userId ? `${ONBOARDING_KEY_PREFIX}:${userId}` : ONBOARDING_KEY_PREFIX;
}

export function useOnboardingDone() {
  const { user } = useAuth();
  const key = getOnboardingKey(user?.id);
  const [done, setDone] = useState(true);

  useEffect(() => {
    try {
      setDone(localStorage.getItem(key) === 'true');
    } catch {
      setDone(false);
    }
  }, [key]);

  return done;
}

export function OnboardingPopups() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const key = getOnboardingKey(user?.id);
  const [step, setStep] = useState<'none' | 'outreach' | 'track'>('none');
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!user?.id) {
      setChecked(true);
      return;
    }
    try {
      const done = localStorage.getItem(key) === 'true';
      if (!done) {
        // Small delay so the page renders first
        const t = setTimeout(() => setStep('outreach'), 800);
        setChecked(true);
        return () => clearTimeout(t);
      }
    } catch {}
    setChecked(true);
  }, [user?.id, key]);

  const markDone = () => {
    try {
      localStorage.setItem(key, 'true');
      // Also mark old walkthrough keys as done so old system doesn't trigger
      if (user?.id) {
        localStorage.setItem(`demo_walkthrough_dismissed_${user.id}`, 'true');
        localStorage.setItem(`walkthrough_completed_${user.id}`, 'true');
      }
    } catch {}
    window.dispatchEvent(new CustomEvent('skip-walkthrough'));
    window.dispatchEvent(new CustomEvent('walkthrough-dismissed'));
  };

  const handleOutreachClose = () => {
    setStep('track');
    navigate('/potential-work');
  };

  const handleTrackClose = () => {
    setStep('none');
    markDone();
  };

  if (!checked) return null;

  return (
    <>
      {/* Outreach Intro Popup */}
      <Dialog open={step === 'outreach'} onOpenChange={(v) => { if (!v) handleOutreachClose(); }}>
        <DialogContent
          hideClose
          className="max-w-sm sm:max-w-[420px] mx-auto p-0 overflow-hidden border-border/40 bg-[hsl(220_50%_5%)] rounded-2xl outline-none focus:outline-none"
        >
          <div className="px-7 pt-7 pb-6 sm:px-8 sm:pt-8 sm:pb-7 flex flex-col items-center">
            <div className="grid grid-cols-[40px_1fr_40px] items-center w-full mb-5">
              <div className="flex justify-start">
                <img src={appLogo} alt="LeadFinder Pro" className="h-9 w-9 shrink-0" />
              </div>
              <h2 className="text-lg font-bold tracking-tight text-center">
                Outreach <span className="text-primary">CRM</span>
              </h2>
              <div />
            </div>

            <h3 className="text-center text-[20px] sm:text-[22px] font-bold leading-[1.25] tracking-tight mb-4 text-foreground">
              Your outreach pipeline starts here
            </h3>

            <div className="text-left text-[13px] text-muted-foreground/80 leading-relaxed space-y-2.5 w-full mb-5">
              <div className="flex items-start gap-2.5">
                <MessageCircle className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <span>Contact businesses via <strong className="text-foreground/90">WhatsApp, SMS or call</strong></span>
              </div>
              <div className="flex items-start gap-2.5">
                <BarChart3 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <span>Update statuses and set next actions to stay organised</span>
              </div>
              <div className="flex items-start gap-2.5">
                <Target className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <span>Track promising leads that show interest</span>
              </div>
            </div>

            <div className="w-full rounded-xl border border-primary/15 bg-primary/[0.04] px-4 py-3 mb-5">
              <p className="text-[12px] text-muted-foreground/70 leading-relaxed text-center">
                The 3 leads below are <strong className="text-foreground/80">editable examples</strong> to show how the system works. Replace them with real leads whenever you're ready.
              </p>
            </div>

            <button
              onClick={handleOutreachClose}
              className="btn-premium w-full h-11 rounded-xl text-[14px] font-semibold text-white flex items-center justify-center gap-2 transition-all"
            >
              Got it — show me Track Leads
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Track Leads Intro Popup */}
      <Dialog open={step === 'track'} onOpenChange={(v) => { if (!v) handleTrackClose(); }}>
        <DialogContent
          hideClose
          className="max-w-sm sm:max-w-[420px] mx-auto p-0 overflow-hidden border-border/40 bg-[hsl(220_50%_5%)] rounded-2xl outline-none focus:outline-none"
        >
          <div className="px-7 pt-7 pb-6 sm:px-8 sm:pt-8 sm:pb-7 flex flex-col items-center">
            <div className="grid grid-cols-[40px_1fr_40px] items-center w-full mb-5">
              <div className="flex justify-start">
                <img src={appLogo} alt="LeadFinder Pro" className="h-9 w-9 shrink-0" />
              </div>
              <h2 className="text-lg font-bold tracking-tight text-center">
                Track <span className="text-primary">Leads</span>
              </h2>
              <div />
            </div>

            <h3 className="text-center text-[20px] sm:text-[22px] font-bold leading-[1.25] tracking-tight mb-4 text-foreground">
              Your deal pipeline
            </h3>

            <div className="text-left text-[13px] text-muted-foreground/80 leading-relaxed space-y-2.5 w-full mb-5">
              <div className="flex items-start gap-2.5">
                <Target className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <span>Leads that show interest move here for <strong className="text-foreground/90">pipeline management</strong></span>
              </div>
              <div className="flex items-start gap-2.5">
                <BarChart3 className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <span>Add revenue estimates, notes, images, and project details</span>
              </div>
              <div className="flex items-start gap-2.5">
                <Phone className="h-4 w-4 text-primary shrink-0 mt-0.5" />
                <span>Set follow-up dates and track your progress from lead to paid client</span>
              </div>
            </div>

            <div className="w-full rounded-xl border border-primary/15 bg-primary/[0.04] px-4 py-3 mb-5">
              <p className="text-[12px] text-muted-foreground/70 leading-relaxed text-center">
                The example lead below shows what a tracked prospect looks like with full details filled in.
              </p>
            </div>

            <button
              onClick={handleTrackClose}
              className="btn-premium w-full h-11 rounded-xl text-[14px] font-semibold text-white flex items-center justify-center gap-2 transition-all"
            >
              Start exploring
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
