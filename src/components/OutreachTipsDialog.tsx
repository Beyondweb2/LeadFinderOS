import { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { MessageSquare, Phone, Heart, Repeat, Rocket } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

const TIPS = [
  {
    icon: MessageSquare,
    title: 'Start casual',
    description: "Open with a friendly message — introduce yourself and mention you noticed they don't have a website. Keep it short and personal.",
  },
  {
    icon: Phone,
    title: 'Mix your channels',
    description: 'Use WhatsApp, SMS and calls. Some people prefer texts, others pick up the phone. Covering all channels doubles your reply rate.',
  },
  {
    icon: Repeat,
    title: 'Follow up — always',
    description: "Most deals close on the 2nd or 3rd follow-up. If they don't reply, send a polite nudge 2–3 days later. Persistence pays off.",
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
      <DialogContent className="sm:max-w-md">
        <DialogHeader className="text-center space-y-3">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary/10">
            <Rocket className="h-7 w-7 text-primary" />
          </div>
          <DialogTitle className="text-xl font-bold">
            You're ready to start reaching out! 🚀
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Here are a few tips to help you land your first client faster.
          </DialogDescription>
        </DialogHeader>

        <div className="py-3 space-y-3">
          {TIPS.map(({ icon: Icon, title, description }) => (
            <div key={title} className="flex gap-3 p-3 rounded-lg bg-muted/50 border border-border">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary/10">
                <Icon className="h-4 w-4 text-primary" />
              </div>
              <div>
                <p className="text-sm font-semibold text-foreground">{title}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
              </div>
            </div>
          ))}
        </div>

        <div className="flex items-center gap-2 pt-1">
          <Checkbox
            id="dont-show-again"
            checked={dontShowAgain}
            onCheckedChange={(checked) => setDontShowAgain(checked === true)}
          />
          <label htmlFor="dont-show-again" className="text-xs text-muted-foreground cursor-pointer">
            Don't show this again
          </label>
        </div>

        <DialogFooter>
          <Button onClick={handleClose} className="w-full">
            <Heart className="mr-1.5 h-4 w-4" />
            Got it, let's go!
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
