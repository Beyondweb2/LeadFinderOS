import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/hooks/useAuth';
import logoIcon from '@/assets/leadfinder-logo-icon.png';

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
      <DialogContent className="sm:max-w-[380px] p-0 overflow-hidden border-border/50 bg-card">
        <div className="p-7 sm:p-8 space-y-5">
          {/* Icon */}
          <div className="flex justify-center">
            <img src={logoIcon} alt="" className="h-12 w-12 opacity-40" />
          </div>

          {/* Headline */}
          <DialogTitle className="text-center text-[18px] sm:text-xl font-bold leading-snug tracking-tight">
            You're contacting a real business without a website.
          </DialogTitle>

          {/* Instruction */}
          <p className="text-center text-sm font-medium text-muted-foreground">
            Keep it short. No links. No pitch.
          </p>

          {/* Revenue hint */}
          <p className="text-center text-xs text-muted-foreground/70">
            If 1 in 20 replies converts, this search could generate £1,000+.
          </p>

          {/* CTA */}
          <Button onClick={handleClose} className="w-full font-semibold" size="lg">
            Send first message
          </Button>

          {/* Don't show again */}
          <div className="flex items-center justify-center gap-2">
            <Checkbox
              id="dont-show-again"
              checked={dontShowAgain}
              onCheckedChange={(checked) => setDontShowAgain(checked === true)}
              className="h-3.5 w-3.5"
            />
            <label htmlFor="dont-show-again" className="text-[11px] text-muted-foreground/60 cursor-pointer">
              Don't show this again
            </label>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
