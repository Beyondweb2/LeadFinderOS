import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { ArrowRight, Phone, MessageSquare, ClipboardList } from 'lucide-react';
import appLogo from '@/assets/logo.png';
import { useAuth } from '@/hooks/useAuth';

export function PostContactModal() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  const storageKey = user?.id ? `post_contact_modal_shown_${user.id}` : null;

  useEffect(() => {
    if (!storageKey) return;

    const onContactDone = () => {
      if (localStorage.getItem(storageKey)) return;
      localStorage.setItem(storageKey, 'true');
      setOpen(true);
    };

    window.addEventListener('post-contact-modal-trigger', onContactDone);
    return () => window.removeEventListener('post-contact-modal-trigger', onContactDone);
  }, [storageKey]);

  useEffect(() => {
    if (open) {
      window.dispatchEvent(new Event('trial-modal-opened'));
    } else {
      window.dispatchEvent(new Event('trial-modal-closed'));
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setOpen(false); }}>
      <DialogContent
        className="sm:max-w-[420px] p-0 overflow-hidden rounded-2xl border-border/40 bg-[hsl(220_50%_5%)]"
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
            <span className="text-foreground">Great Start! </span>
            <span className="text-primary">Here's What To Do Next</span>
          </DialogTitle>

          {/* Tips */}
          <div className="text-left text-[13px] text-muted-foreground leading-relaxed mb-5 space-y-4 w-full">
            <div className="flex gap-3 items-start">
              <MessageSquare className="h-4 w-4 text-blue-400 shrink-0 mt-0.5" />
              <p><span className="text-foreground font-medium">No WhatsApp?</span> Try sending an <span className="text-foreground font-medium">SMS</span> instead — many businesses still check text messages regularly.</p>
            </div>
            <div className="flex gap-3 items-start">
              <Phone className="h-4 w-4 text-green-400 shrink-0 mt-0.5" />
              <p><span className="text-foreground font-medium">Calling is king</span> — it's the fastest way to land clients. Don't be afraid to pick up the phone and have a quick chat.</p>
            </div>
            <div className="flex gap-3 items-start">
              <ClipboardList className="h-4 w-4 text-primary shrink-0 mt-0.5" />
              <p><span className="text-foreground font-medium">When someone replies</span> — have a conversation, send a voice note. Then update their <span className="text-foreground font-medium">Status</span> and set a <span className="text-foreground font-medium">Next Action</span> like "Follow Up" so you never lose track.</p>
            </div>
          </div>

          {/* CTA */}
          <button
            onClick={() => setOpen(false)}
            className="btn-premium w-full h-12 rounded-xl text-[15px] font-semibold text-white flex items-center justify-center gap-2 transition-all"
          >
            Got it, let's keep going
            <ArrowRight className="h-4 w-4" />
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
