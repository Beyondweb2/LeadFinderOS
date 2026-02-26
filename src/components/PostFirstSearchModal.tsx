import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Eye, ClipboardList, ArrowRight } from 'lucide-react';
import appLogo from '@/assets/logo.png';

export function PostFirstSearchModal() {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const storageKey = 'post_first_search_modal_shown';

    const onSearchComplete = () => {
      if (localStorage.getItem(storageKey)) return;
      localStorage.setItem(storageKey, 'true');
      setOpen(true);
    };

    window.addEventListener('post-first-search-complete', onSearchComplete);
    return () => window.removeEventListener('post-first-search-complete', onSearchComplete);
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
            <span className="text-foreground">Turn these into</span>
            <br />
            <span className="text-primary">paying clients</span>
          </DialogTitle>

          {/* Body copy */}
          <div className="text-center text-[13px] text-muted-foreground/80 leading-relaxed mb-6 space-y-4">
            <p>You've just found businesses that may need your services</p>
            <div className="flex items-center justify-center gap-2">
              <Eye className="h-4 w-4 text-emerald-500 shrink-0" />
              <p>Click the green eye icon to view full details</p>
            </div>
            <div className="flex items-center justify-center gap-2">
              <ClipboardList className="h-4 w-4 text-emerald-500 shrink-0" />
              <p>When you're ready to reach out, tap the green clipboard to add the business to your Outreach CRM</p>
            </div>
            <p>Save a few strong leads and begin your outreach</p>
          </div>

          {/* CTA */}
          <button
            onClick={() => setOpen(false)}
            className="btn-premium w-full h-12 rounded-xl text-[15px] font-semibold text-white flex items-center justify-center gap-2 transition-all"
          >
            Got it – I'll save 3 leads
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
