import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Heart } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

// Tips array removed to support new paragraph-based content structure

export function OutreachTipsDialog() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const storageKey = user?.id ? `outreach_tips_dismissed_${user.id}` : null;

  // Listen for first contact click event instead of auto-showing on page load
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

  // Pause walkthrough overlay while tips dialog is open
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
      <DialogContent className="sm:max-w-sm p-0 overflow-hidden">
        <div className="p-6 space-y-5">
          <div className="text-center space-y-2">
            <DialogTitle className="text-lg font-bold leading-tight">
              You’re about to contact a real business without a website.
            </DialogTitle>
          </div>

          <div className="space-y-4 text-sm leading-relaxed">
            <p className="font-semibold text-foreground">
              Most developers never take this step.
            </p>
            
            <p className="text-muted-foreground">
              Keep your first message short and casual. Avoid sending links or long pitches in the first contact.
            </p>
            
            <div className="p-3.5 rounded-lg bg-primary/5 border border-primary/10">
              <p className="text-primary font-bold text-center">
                If just 1 in 20 replies and converts, this single search could generate £1,000+ in project revenue.
              </p>
            </div>
            
            <p className="text-muted-foreground italic text-center text-xs">
              You’re not just sending a message - you’re starting a potential client conversation.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <Checkbox
              id="dont-show-again"
              checked={dontShowAgain}
              onCheckedChange={(checked) => setDontShowAgain(checked === true)}
              className="h-3.5 w-3.5"
            />
            <label htmlFor="dont-show-again" className="text-[11px] text-muted-foreground cursor-pointer">
              Don't show this again
            </label>
          </div>

          <Button onClick={handleClose} className="w-full" size="sm">
            <Heart className="mr-1.5 h-3.5 w-3.5" />
            Got it, let's go!
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
