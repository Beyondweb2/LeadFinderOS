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

    // Also show when user skips the contact walkthrough step
    const onSkipContact = () => {
      if (!localStorage.getItem(storageKey)) {
        setContactMethod('whatsapp');
        setOpen(true);
      }
    };

    window.addEventListener('outreach-first-contact-click', onContactClick);
    window.addEventListener('walkthrough-skip-contact-steps', onSkipContact);
    return () => {
      window.removeEventListener('outreach-first-contact-click', onContactClick);
      window.removeEventListener('walkthrough-skip-contact-steps', onSkipContact);
    };
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
      // Skip contact steps entirely so walkthrough moves to Track step
      window.dispatchEvent(new CustomEvent('walkthrough-skip-contact-steps'));
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
          <DialogTitle className="text-center text-[22px] sm:text-2xl font-bold leading-[1.2] tracking-tight mb-5">
            <span className="text-foreground">3 Tips Before</span>
            <br />
            <span className="text-primary">You Reach Out</span>
          </DialogTitle>

          {/* Tips */}
          <div className="text-left text-[13px] text-muted-foreground leading-relaxed mb-4 space-y-3 w-full">
            <div className="flex gap-2.5">
              <span className="text-primary font-bold text-sm shrink-0">1.</span>
              <p><span className="text-foreground font-medium">Keep it casual</span> — No links, images, or videos in your first message. Just be friendly and try to get a casual reply first.</p>
            </div>
            <div className="flex gap-2.5">
              <span className="text-primary font-bold text-sm shrink-0">2.</span>
              <p><span className="text-foreground font-medium">Try WhatsApp first</span> — If they don't have WhatsApp, try SMS. But the best option is to call — have a pitch ready using a pre-made script template.</p>
            </div>
            <div className="flex gap-2.5">
              <span className="text-primary font-bold text-sm shrink-0">3.</span>
              <p><span className="text-foreground font-medium">Make conversation</span> — Don't sell straight away. Ask a question, reference their business, and keep it natural.</p>
            </div>
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
