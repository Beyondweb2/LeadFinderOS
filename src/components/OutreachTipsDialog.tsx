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
        <div className="p-6 sm:p-7 space-y-6">
          {/* Logo */}
          <div className="flex justify-center">
            <img src={logoIcon} alt="" className="h-8 w-8 opacity-60" />
          </div>

          {/* Headline */}
          <div className="text-center space-y-1">
            <DialogTitle className="text-[17px] sm:text-lg font-bold leading-snug tracking-tight">
              You're about to contact a real business{' '}
              <span className="text-primary">without a website.</span>
            </DialogTitle>
          </div>

          {/* Body */}
          <div className="space-y-3 text-[13px] leading-relaxed">
            <p className="font-semibold text-foreground">
              Most developers never take this step.
            </p>
            <p className="text-muted-foreground">
              Keep your first message short and casual. Avoid links and long pitches in the first contact.
            </p>
          </div>

          {/* Insight strip */}
          <div className="px-3.5 py-3 rounded-lg border border-primary/15 bg-primary/[0.04]">
            <p className="text-[12px] sm:text-[13px] text-foreground/80 text-center leading-relaxed">
              If 1 in 20 replies converts, this single search could generate{' '}
              <span className="font-bold text-foreground">£1,000+</span> in project revenue.
            </p>
          </div>

          {/* Closing line */}
          <p className="text-[12px] text-muted-foreground text-center">
            This is how consistent client flow starts.
          </p>

          {/* CTA */}
          <Button onClick={handleClose} className="w-full" size="default">
            Start conversation
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
