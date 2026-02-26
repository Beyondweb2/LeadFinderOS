import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { ArrowRight } from 'lucide-react';
import appLogo from '@/assets/logo.png';

export function PostCrmAddModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const storageKey = 'post_crm_add_modal_shown';

    const onCrmAdd = () => {
      if (localStorage.getItem(storageKey)) return;
      localStorage.setItem(storageKey, 'true');
      setOpen(true);
      // Pause walkthrough while this modal is open
      window.dispatchEvent(new CustomEvent('trial-modal-opened'));
    };

    window.addEventListener('crm-lead-added', onCrmAdd);
    return () => window.removeEventListener('crm-lead-added', onCrmAdd);
  }, []);

  useEffect(() => {
    if (open) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  const handleClose = () => {
    setOpen(false);
    // Resume walkthrough
    window.dispatchEvent(new CustomEvent('trial-modal-closed'));
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) return; }}>
      <DialogContent
        className="sm:max-w-[400px] p-0 overflow-hidden rounded-2xl border-border/40 bg-[hsl(220_50%_5%)] z-[60]"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
        hideClose
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

          {/* Headline */}
          <DialogTitle className="text-center text-[22px] sm:text-2xl font-bold leading-[1.2] tracking-tight mb-5">
            <span className="text-foreground">Your outreach</span>
            <br />
            <span className="text-primary">starts here</span>
          </DialogTitle>

          {/* Body copy */}
          <div className="text-center text-[13px] text-muted-foreground/80 leading-relaxed mb-6 space-y-4">
            <p>You've added your first business to the CRM</p>
            <p>From here, you'll contact them, update their status, and set follow ups</p>
            <p>This keeps your outreach organised and moving forward</p>
            <p className="font-medium text-foreground/70">Small actions build real clients</p>
          </div>

          {/* CTA */}
          <button
            onClick={handleClose}
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
