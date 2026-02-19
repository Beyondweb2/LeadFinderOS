import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { MessageSquare, Heart, Repeat, Rocket, Ban } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

const TIPS = [
  {
    icon: MessageSquare,
    title: 'Confirm the number first',
    description: '"Hi, is this [business name]?" — get a reply before anything else.',
  },
  {
    icon: Ban,
    title: 'No links or media',
    description: "Skip links, images & portfolios in your first message. Keep it conversational.",
  },
  {
    icon: Repeat,
    title: 'Follow up consistently',
    description: "Most deals close after the 2nd or 3rd message. Don't stop at one.",
  },
];

export function OutreachTipsDialog() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const storageKey = user?.id ? `outreach_tips_dismissed_${user.id}` : null;

  useEffect(() => {
    if (!storageKey) return;
    const dismissed = localStorage.getItem(storageKey);
    if (!dismissed) {
      // Small delay so the page renders first
      const timer = setTimeout(() => setOpen(true), 600);
      return () => clearTimeout(timer);
    }
  }, [storageKey]);

  const handleClose = () => {
    setOpen(false);
    if (dontShowAgain && storageKey) {
      localStorage.setItem(storageKey, 'true');
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(); else setOpen(true); }}>
      <DialogContent className="sm:max-w-sm p-0 overflow-hidden">
        <div className="p-5 space-y-4">
          <div className="text-center space-y-1">
            <DialogTitle className="text-base font-bold">
              Quick tips before you start 🚀
            </DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground">
              3 things that increase your reply rate
            </DialogDescription>
          </div>

          <div className="space-y-2">
            {TIPS.map(({ icon: Icon, title, description }) => (
              <div key={title} className="flex gap-2.5 p-2.5 rounded-lg bg-muted/40 border border-border/30">
                <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10">
                  <Icon className="h-3.5 w-3.5 text-primary" />
                </div>
                <div>
                  <p className="text-xs font-semibold text-foreground">{title}</p>
                  <p className="text-[11px] text-muted-foreground">{description}</p>
                </div>
              </div>
            ))}
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
