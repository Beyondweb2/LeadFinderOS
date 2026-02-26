import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { ArrowRight, MessageCircle, MessageSquare } from 'lucide-react';
import appLogo from '@/assets/logo.png';

/**
 * Modal popup for walkthrough Step 4 — shown when the user reaches the
 * "contact a lead" step on the CRM page. Replaces the inline tooltip with
 * a full modal consistent with other walkthrough popups.
 */
export function Step4ContactModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const storageKey = 'step4_contact_modal_shown';

    const onTrigger = () => {
      if (localStorage.getItem(storageKey)) return;
      localStorage.setItem(storageKey, 'true');
      setOpen(true);
    };

    window.addEventListener('step4-contact-modal-trigger', onTrigger);
    return () => window.removeEventListener('step4-contact-modal-trigger', onTrigger);
  }, []);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) return; }}>
      <DialogContent
        className="sm:max-w-[400px] p-0 overflow-hidden rounded-2xl border-border/40 bg-[hsl(220_50%_5%)] z-[60]"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <div className="px-7 pt-7 pb-6 sm:px-8 sm:pt-8 sm:pb-7 flex flex-col items-center">
          {/* Brand */}
          <div className="grid grid-cols-[40px_1fr_40px] items-center w-full mb-6">
            <div className="flex justify-start">
              <img src={appLogo} alt="LeadFinder Pro" className="h-9 w-9 shrink-0" />
            </div>
            <h2 className="text-lg font-bold tracking-tight text-center">
              Lead<span className="text-primary">Finder</span> Pro
            </h2>
            <div />
          </div>

          {/* Title */}
          <DialogTitle className="text-center text-[22px] sm:text-2xl font-bold leading-[1.2] tracking-tight mb-5">
            <span className="text-foreground">Send initial </span>
            <span className="text-primary">message</span>
          </DialogTitle>

          {/* Body */}
          <div className="text-[13px] text-muted-foreground/80 leading-relaxed mb-6 space-y-4 w-full">
            <div className="flex items-start gap-3">
              <div className="flex items-center gap-1 shrink-0 mt-0.5">
                <MessageCircle className="h-4 w-4 text-blue-400" />
                <MessageSquare className="h-4 w-4 text-green-500" />
              </div>
              <p>Choose a contact method like <span className="font-semibold text-blue-400">SMS</span> or <span className="font-semibold text-green-400">WhatsApp</span></p>
            </div>
            <p>If you're on desktop, WhatsApp requires the WhatsApp Desktop app or your phone. You can also send the message directly from your phone while using desktop.</p>
            <p className="text-muted-foreground/60">This is just an example and can be skipped by closing the message popup.</p>
          </div>

          {/* CTA */}
          <button
            onClick={() => setOpen(false)}
            className="btn-premium w-full h-12 rounded-xl text-[15px] font-semibold text-white flex items-center justify-center gap-2 transition-all"
          >
            Got it
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
