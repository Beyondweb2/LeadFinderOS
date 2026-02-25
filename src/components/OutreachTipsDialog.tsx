import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
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
      <DialogContent
        className="sm:max-w-[400px] p-0 overflow-hidden border-primary/15 bg-card rounded-2xl"
        style={{
          boxShadow: '0 0 60px hsl(var(--primary) / 0.06), 0 25px 50px -12px rgba(0,0,0,0.5)',
        }}
      >
        <div className="px-8 pt-10 pb-8 sm:px-9 sm:pt-11 sm:pb-9 flex flex-col items-center">
          {/* Logo with subtle glow */}
          <div className="relative mb-3">
            <div
              className="absolute inset-0 rounded-full"
              style={{
                background: 'radial-gradient(circle, hsl(var(--primary) / 0.15) 0%, transparent 70%)',
                transform: 'scale(2.2)',
              }}
            />
            <img src={logoIcon} alt="" className="h-12 w-12 relative z-10" />
          </div>

          {/* Brand label */}
          <span className="text-[10px] font-semibold tracking-[0.2em] uppercase text-foreground/50 mb-7">
            LeadFinder Pro
          </span>

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
          <div className="w-full rounded-xl border border-primary/15 bg-muted/20 px-5 py-4 mb-7">
            <p className="text-center text-[12px] text-muted-foreground leading-relaxed">
              If 1 in 20 replies converts,
              <br />
              this search could generate{' '}
              <span className="font-bold text-primary">£1,000+</span>
            </p>
          </div>

          {/* CTA */}
          <button
            onClick={handleClose}
            className="w-full h-12 rounded-lg text-[15px] font-semibold text-primary-foreground transition-all hover:brightness-110"
            style={{
              background: 'linear-gradient(180deg, hsl(var(--primary)) 0%, hsl(var(--primary) / 0.85) 100%)',
              boxShadow: '0 4px 14px hsl(var(--primary) / 0.25), 0 1px 3px rgba(0,0,0,0.2)',
            }}
          >
            Send first message
          </button>

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
