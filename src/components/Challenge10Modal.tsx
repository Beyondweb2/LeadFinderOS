import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { CheckCircle2, ArrowRight } from 'lucide-react';

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
        className="max-w-[340px] sm:max-w-[380px] mx-auto p-0 overflow-hidden border-border/40 bg-card rounded-xl outline-none focus:outline-none focus-visible:outline-none [&:focus]:outline-none [&:focus-visible]:ring-0"
      >
        <div className="px-5 pt-5 pb-4 flex flex-col">
          {/* Header row with icon + title */}
          <div className="flex items-center gap-2.5 mb-2">
            <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
            <h3 className="text-[15px] font-bold text-primary tracking-tight">
              Daily Challenge
            </h3>
          </div>

          {/* Description */}
          <p className="text-[13px] text-muted-foreground leading-relaxed mb-4 pl-[30px]">
            Contact 10 businesses that need a website today.
          </p>

          {/* Actions */}
          <div className="flex items-center gap-2 pl-[30px]">
            <button
              onClick={onStart}
              className="h-8 px-4 rounded-lg bg-primary hover:bg-primary/90 text-[13px] font-semibold text-primary-foreground flex items-center gap-1.5 transition-colors"
            >
              Start
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
            <button
              onClick={onSkip}
              className="h-8 px-3 rounded-lg text-[12px] text-muted-foreground/70 hover:text-foreground transition-colors"
            >
              Skip
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
