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

  const handleClose = () => {
    setOpen(false);
    if (dontShowAgain && storageKey) {
      localStorage.setItem(storageKey, 'true');
    }
  };

  const cta = ctaConfig[contactMethod || 'whatsapp'];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else setOpen(true); }}>
      <DialogContent
        className="sm:max-w-[400px] p-0 overflow-hidden rounded-2xl border-border/40 bg-[hsl(220_50%_5%)]"
      >
        <div className="px-7 pt-7 pb-6 sm:px-8 sm:pt-8 sm:pb-7 flex flex-col items-center">
          {/* Brand — exact match to app header */}
          <div className="flex items-center gap-3 mb-6">
            <img src={appLogo} alt="LeadFinder Pro" className="h-9 w-9 shrink-0" />
            <h2 className="text-lg font-bold tracking-tight">
              Lead<span className="text-primary">Finder</span> Pro
            </h2>
          </div>

          {/* Headline */}
          <DialogTitle className="text-center text-[22px] sm:text-2xl font-bold leading-[1.2] tracking-tight mb-4">
            <span className="text-foreground">You're contacting a real business</span>
            <br />
            <span className="text-primary">without a website.</span>
          </DialogTitle>

          {/* Guidance */}
          <div className="text-center text-[13px] text-muted-foreground/80 leading-relaxed mb-3 space-y-0.5">
            <p>Keep it short.</p>
            <p>No links. No pitch.</p>
          </div>

          <p className="text-center text-[11px] text-muted-foreground/50 mb-5">
            Each contact rotates between 6 proven openers.
          </p>

          {/* Value highlight card */}
          <div className="w-full rounded-xl border border-primary/15 bg-gradient-to-br from-primary/[0.06] to-primary/[0.02] px-5 py-4 mb-6 shadow-[inset_0_1px_1px_rgba(255,255,255,0.04)]">
            <p className="text-center text-[12.5px] text-muted-foreground leading-relaxed">
              If 1 in 20 replies converts,
              <br />
              this search could generate{' '}
              <span className="font-bold text-primary">£1,000+</span>
            </p>
          </div>

          {/* CTA */}
          <button
            onClick={handleClose}
            className="btn-premium w-full h-12 rounded-xl text-[15px] font-semibold text-white flex items-center justify-center gap-2 transition-all"
          >
            {cta.icon}
            {cta.label}
          </button>

          {/* Don't show again */}
          <div className="flex items-center justify-center gap-1.5 mt-4">
            <Checkbox
              id="dont-show-again"
              checked={dontShowAgain}
              onCheckedChange={(checked) => setDontShowAgain(checked === true)}
              className="h-3 w-3"
            />
            <label htmlFor="dont-show-again" className="text-[10px] text-muted-foreground/40 cursor-pointer">
              Don't show this again
            </label>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
