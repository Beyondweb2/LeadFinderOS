import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';
import appLogo from '@/assets/logo.png';
import { ArrowRight, MessageSquare, Phone, Send } from 'lucide-react';

/**
 * One-time popup shown when the walkthrough reaches the Outreach page.
 * Explains the CRM briefly, then on dismiss advances walkthrough to
 * "go to Track Leads" step.
 */
export function OutreachIntroModal() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  const storageKey = user?.id ? `outreach_intro_shown_${user.id}` : null;

  useEffect(() => {
    const handler = () => {
      if (storageKey && localStorage.getItem(storageKey)) return;
      setOpen(true);
    };
    window.addEventListener('show-outreach-intro', handler);
    return () => window.removeEventListener('show-outreach-intro', handler);
  }, [storageKey]);

  useEffect(() => {
    if (open) {
      window.dispatchEvent(new Event('trial-modal-opened'));
    } else {
      window.dispatchEvent(new Event('trial-modal-closed'));
    }
  }, [open]);

  const handleDismiss = () => {
    setOpen(false);
    if (storageKey) {
      localStorage.setItem(storageKey, 'true');
    }
    // Advance walkthrough: mark outreach intro done
    window.dispatchEvent(new CustomEvent('outreach-intro-dismissed'));
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleDismiss(); }}>
      <DialogContent
        hideClose
        className="max-w-sm sm:max-w-[400px] mx-auto p-0 overflow-hidden border-border/40 bg-[hsl(220_50%_5%)] rounded-2xl outline-none focus:outline-none focus-visible:outline-none [&:focus]:outline-none [&:focus-visible]:ring-0"
      >
        <div className="px-7 pt-7 pb-6 sm:px-8 sm:pt-8 sm:pb-7 flex flex-col items-center">
          <div className="grid grid-cols-[40px_1fr_40px] items-center w-full mb-5">
            <div className="flex justify-start">
              <img src={appLogo} alt="LeadFinder Pro" className="h-9 w-9 shrink-0" />
            </div>
            <h2 className="text-lg font-bold tracking-tight text-center">
              Lead<span className="text-primary">Finder</span> Pro
            </h2>
            <div />
          </div>

          <h3 className="text-center text-[20px] sm:text-[22px] font-bold leading-[1.25] tracking-tight mb-4 text-foreground">
            Your <span className="text-primary">Outreach CRM</span> 📋
          </h3>

          <div className="text-left text-[13px] text-muted-foreground leading-relaxed mb-5 space-y-3 w-full">
            <div className="flex gap-2.5">
              <div className="flex items-center gap-1 text-primary shrink-0 mt-0.5">
                <MessageSquare className="h-3.5 w-3.5" />
              </div>
              <p>
                <span className="text-foreground font-medium">Contact leads directly</span> — reach out via WhatsApp, SMS, or call. The contact method and status update automatically.
              </p>
            </div>
            <div className="flex gap-2.5">
              <div className="flex items-center gap-1 text-primary shrink-0 mt-0.5">
                <Send className="h-3.5 w-3.5" />
              </div>
              <p>
                <span className="text-foreground font-medium">Set next actions</span> — schedule follow-ups, calls, or reminders so nothing falls through the cracks.
              </p>
            </div>
            <div className="flex gap-2.5">
              <div className="flex items-center gap-1 text-primary shrink-0 mt-0.5">
                <Phone className="h-3.5 w-3.5" />
              </div>
              <p>
                <span className="text-foreground font-medium">Track interested leads</span> — if a business seems interested, track them to close the deal.
              </p>
            </div>
          </div>

          <p className="text-center text-[12px] text-muted-foreground/70 mb-5">
            These sample leads show how your pipeline works. Add real leads from Find Leads to get started.
          </p>

          <button
            onClick={handleDismiss}
            className="btn-premium w-full h-12 rounded-xl text-[15px] font-semibold text-white flex items-center justify-center gap-2 transition-all outline-none focus:outline-none focus-visible:outline-none border-none ring-0 focus:ring-0 focus-visible:ring-0"
          >
            Got it
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
