import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/hooks/useAuth';
import appLogo from '@/assets/logo.png';
import { MessageSquare, Phone, Send } from 'lucide-react';

type ContactMethod = 'whatsapp' | 'sms' | 'call' | null;

const ctaConfig: Record<string, { label: string; icon: React.ReactNode }> = {
  whatsapp: { label: 'Open WhatsApp & Send', icon: <Send className="h-4 w-4" /> },
  sms: { label: 'Send SMS Now', icon: <MessageSquare className="h-4 w-4" /> },
  call: { label: 'Start Call', icon: <Phone className="h-4 w-4" /> },
};

export function OutreachTipsDialog() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const [contactMethod, setContactMethod] = useState<ContactMethod>(null);

  const storageKey = user?.id ? `outreach_tips_dismissed_${user.id}` : null;

  useEffect(() => {
    if (!storageKey) return;
    const dismissed = localStorage.getItem(storageKey);
    if (dismissed) return;

    const onContactClick = (e: Event) => {
      if (!localStorage.getItem(storageKey)) {
        const method = (e as CustomEvent)?.detail?.method || 'whatsapp';
        setContactMethod(method);
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

  const handleClose = (skipped = false) => {
    setOpen(false);
    if (dontShowAgain && storageKey) {
      localStorage.setItem(storageKey, 'true');
    }
    if (skipped) {
      // Mark contact step as done so walkthrough can continue
      window.dispatchEvent(new CustomEvent('demo-checklist-contact'));
    }
  };

  const cta = ctaConfig[contactMethod || 'whatsapp'];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(true); else setOpen(true); }}>
      <DialogContent
        className="sm:max-w-[400px] p-0 overflow-hidden rounded-2xl border-border/40 bg-[hsl(220_50%_5%)]"
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

          {/* Headline */}
          <DialogTitle className="text-center text-[22px] sm:text-2xl font-bold leading-[1.2] tracking-tight mb-4">
            <span className="text-foreground">You're contacting a real business</span>
            <br />
            <span className="text-primary">without a website.</span>
          </DialogTitle>

          {/* Instructions */}
          <div className="text-center text-[13px] text-muted-foreground leading-relaxed mb-4 space-y-1">
            <p>If you're on desktop, download WhatsApp Desktop to send directly</p>
            <p>Or open LeadFinder on your phone and message them there</p>
            <p>You can also dial the number manually if preferred</p>
          </div>

          {/* Skip line */}
          <p className="text-center text-[12px] text-muted-foreground mb-5">
            Not ready to send yet?{' '}
            <button
              onClick={() => handleClose(true)}
              className="text-[13px] font-medium text-primary hover:text-primary/80 cursor-pointer transition-colors underline-offset-2 hover:underline"
            >
              Skip
            </button>
          </p>

          {/* CTA */}
          <button
            onClick={() => handleClose(false)}
            className="btn-premium w-full h-12 rounded-xl text-[15px] font-semibold text-white flex items-center justify-center gap-2 transition-all"
          >
            {cta.icon}
            {cta.label}
          </button>

          {/* Don't show again */}
          <div className="flex items-center justify-center gap-1.5 mt-3">
            <Checkbox
              id="dont-show-again"
              checked={dontShowAgain}
              onCheckedChange={(checked) => setDontShowAgain(checked === true)}
              className="h-3 w-3"
            />
            <label htmlFor="dont-show-again" className="text-[10px] text-muted-foreground/60 cursor-pointer">
              Don't show this again
            </label>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
