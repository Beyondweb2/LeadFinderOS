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
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) onSkip(); }}>
      <DialogContent
        hideClose
        className="max-w-sm sm:max-w-[420px] mx-auto p-0 overflow-hidden border-border/40 bg-[hsl(220_50%_5%)] rounded-2xl outline-none focus:outline-none focus-visible:outline-none [&:focus]:outline-none [&:focus-visible]:ring-0"
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

          {/* Icon */}
          <div className="w-14 h-14 rounded-2xl bg-primary/10 flex items-center justify-center mb-4">
            <Target className="h-7 w-7 text-primary" />
          </div>

          {/* Headline */}
          <h3 className="text-center text-[22px] sm:text-2xl font-bold leading-[1.2] tracking-tight mb-3 text-foreground">
            Quick Challenge: Contact 10 Businesses
          </h3>

          {/* Body */}
          <p className="text-center text-[14px] text-muted-foreground/80 leading-relaxed mb-6">
            Contact 10 businesses now so you can feel how fast you can build a pipeline. It only takes a few minutes!
          </p>

          {/* Primary CTA */}
          <button
            onClick={onStart}
            className="btn-premium w-full h-12 rounded-xl text-[15px] font-semibold text-white flex items-center justify-center gap-2 transition-all mb-3 outline-none focus:outline-none focus-visible:outline-none border-none ring-0 focus:ring-0 focus-visible:ring-0"
          >
            Start Challenge
            <ArrowRight className="h-4 w-4" />
          </button>

          {/* Secondary */}
          <button
            onClick={onSkip}
            className="w-full h-10 rounded-xl text-[13px] font-medium text-muted-foreground/70 hover:text-foreground transition-colors"
          >
            Skip for now
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
