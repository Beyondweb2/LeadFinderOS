import { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Eye, UserPlus, ArrowRight } from 'lucide-react';
import appLogo from '@/assets/logo.png';

const STORAGE_KEY = 'post_first_search_modal_shown';

export function PostFirstSearchModal() {
  const [open, setOpen] = useState(false);
  const shownRef = useRef(false);

  useEffect(() => {
    // Already shown this session or previously
    if (localStorage.getItem(STORAGE_KEY)) {
      shownRef.current = true;
      return;
    }

    const show = () => {
      if (shownRef.current) return;
      if (localStorage.getItem(STORAGE_KEY)) return;
      shownRef.current = true;
      localStorage.setItem(STORAGE_KEY, 'true');
      setOpen(true);
    };

    window.addEventListener('post-first-search-complete', show);
    return () => window.removeEventListener('post-first-search-complete', show);
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
              <Eye className="h-4 w-4 text-primary shrink-0" />
              <p>Click the eye icon to view full details</p>
            </div>
            <div className="flex items-center justify-center gap-2">
              <UserPlus className="h-4 w-4 text-primary shrink-0" />
              <p>When you find one you want to contact, add it to your CRM</p>
            </div>
          </div>

          {/* Value highlight card */}
          <div className="w-full rounded-xl border border-primary/15 bg-gradient-to-br from-primary/[0.06] to-primary/[0.02] px-5 py-4 mb-6 shadow-[inset_0_1px_1px_rgba(255,255,255,0.04)]">
            <p className="text-center text-[12.5px] text-muted-foreground leading-relaxed">
              Save <span className="font-bold text-primary">3 leads</span> to unlock outreach
              <br />
              and continue the walkthrough
            </p>
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
