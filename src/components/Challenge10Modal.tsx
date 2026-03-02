import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Target, ArrowRight } from 'lucide-react';
import appLogo from '@/assets/logo.png';

interface Challenge10ModalProps {
  open: boolean;
  onStart: () => void;
  onSkip: () => void;
}

export function Challenge10Modal({ open, onStart, onSkip }: Challenge10ModalProps) {
  const handleGotIt = () => {
    onStart(); // Auto-start the challenge
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleGotIt(); }}>
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

          {/* Icon + Title */}
          <div className="flex items-center gap-2.5 mb-3">
            <Target className="h-6 w-6 text-primary shrink-0" />
            <h3 className="text-[20px] sm:text-[22px] font-bold tracking-tight text-foreground">
              Daily Challenge
            </h3>
          </div>

          {/* Description */}
          <div className="text-center text-[13px] text-muted-foreground leading-relaxed mb-5 space-y-2">
            <p className="text-foreground font-medium text-[15px]">
              Contact <span className="text-primary font-bold">10</span> businesses today
            </p>
            <p>Your progress is tracked automatically on the Outreach page.</p>
            <p>Most freelancers stop at 3 — the ones who win push past 10.</p>
          </div>

          {/* CTA */}
          <button
            onClick={handleGotIt}
            className="btn-premium w-full h-12 rounded-xl text-[15px] font-semibold text-white flex items-center justify-center gap-2 transition-all"
          >
            Got it — Let's Go
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
