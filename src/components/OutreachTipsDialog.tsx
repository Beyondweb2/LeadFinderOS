import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import appLogo from '@/assets/logo.png';

export function OutreachTipsDialog() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const storageKey = user?.id ? `outreach_tips_dismissed_${user.id}` : null;

  useEffect(() => {
    if (!storageKey) return;
    const dismissed = localStorage.getItem(storageKey);
    if (dismissed) return;

    const onContactClick = () => {
      if (!localStorage.getItem(storageKey)) {
        setOpen(true);
      }
    };
    window.addEventListener('outreach-first-contact-click', onContactClick);
    return () => window.removeEventListener('outreach-first-contact-click', onContactClick);
  }, [storageKey]);

  useEffect(() => {
    if (open) {
      window.dispatchEvent(new Event('trial-modal-opened'));
    } else {
      window.dispatchEvent(new Event('trial-modal-closed'));
    }
  }, [open]);

  const handleClose = () => {
    setOpen(false);
    if (dontShowAgain && storageKey) {
      localStorage.setItem(storageKey, 'true');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else setOpen(true); }}>
      <DialogContent
        className="sm:max-w-[400px] p-0 overflow-hidden border-border/40 bg-card rounded-2xl"
      >
        <div className="px-8 pt-8 pb-7 sm:px-9 sm:pt-9 sm:pb-8 flex flex-col items-center">
          {/* Brand — matches header exactly */}
          <div className="flex items-center gap-3 mb-8">
            <img src={appLogo} alt="LeadFinder Pro" className="h-9 w-9 shrink-0" />
            <h2 className="text-lg font-bold tracking-tight">
              Lead<span className="text-primary">Finder</span> Pro
            </h2>
          </div>

          {/* Headline */}
          <DialogTitle className="text-center text-xl sm:text-[22px] font-bold leading-[1.25] tracking-tight mb-5">
            <span className="text-foreground">You're contacting a real business</span>
            <br />
            <span className="text-primary">without a website.</span>
          </DialogTitle>

          {/* Instruction */}
          <div className="text-center text-[13px] text-muted-foreground leading-relaxed mb-5">
            <p>Keep it short.</p>
            <p>No links. No pitch.</p>
          </div>

          {/* Auto-rotation line */}
          <p className="text-center text-[11px] text-muted-foreground/70 mb-6">
            Each contact rotates between 6 proven openers.
          </p>

          {/* Revenue highlight card */}
          <div className="w-full rounded-xl border border-border/40 bg-muted/20 px-5 py-4 mb-7">
            <p className="text-center text-[12px] text-muted-foreground leading-relaxed">
              If 1 in 20 replies converts,
              <br />
              this search could generate{' '}
              <span className="font-bold text-primary">£1,000+</span>
            </p>
          </div>

          {/* CTA */}
          <Button size="lg" className="w-full" onClick={handleClose}>
            Send first message
          </Button>

          {/* Don't show again */}
          <div className="flex items-center justify-center gap-1.5 mt-5">
            <Checkbox
              id="dont-show-again"
              checked={dontShowAgain}
              onCheckedChange={(checked) => setDontShowAgain(checked === true)}
              className="h-3 w-3"
            />
            <label htmlFor="dont-show-again" className="text-[10px] text-muted-foreground/50 cursor-pointer">
              Don't show this again
            </label>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
