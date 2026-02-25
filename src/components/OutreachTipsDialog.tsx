import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/hooks/useAuth';
import { MessageCircle } from 'lucide-react';

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
      <DialogContent className="sm:max-w-[400px] p-0 overflow-hidden border-primary/20 bg-card shadow-[0_0_40px_hsl(var(--primary)/0.08)]">
        <div className="p-8 sm:p-9 space-y-6">
          {/* Icon */}
          <div className="flex justify-center">
            <div className="h-14 w-14 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center">
              <MessageCircle className="h-7 w-7 text-primary" />
            </div>
          </div>

          {/* Headline */}
          <DialogTitle className="text-center text-xl sm:text-[22px] font-bold leading-snug tracking-tight">
            You're contacting a real business without a website.
          </DialogTitle>

          {/* Instruction */}
          <p className="text-center text-sm font-semibold text-foreground/80">
            Keep it short. No links. No pitch.
          </p>

          {/* Divider */}
          <div className="border-t border-border/40" />

          {/* Auto-rotate hint */}
          <p className="text-center text-xs text-muted-foreground leading-relaxed">
            Each contact automatically cycles through 6 proven opening messages - so you don't have to think about what to say.
          </p>

          {/* Revenue hint */}
          <div className="text-center">
            <span className="inline-block text-xs font-medium text-primary/80 bg-primary/5 border border-primary/10 rounded-full px-3 py-1">
              If 1 in 20 replies converts, this search could generate £1,000+
            </span>
          </div>

          {/* CTA */}
          <Button onClick={handleClose} className="w-full font-semibold text-base h-12 shadow-[0_0_20px_hsl(var(--primary)/0.3)]" size="lg">
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
