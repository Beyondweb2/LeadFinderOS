import { useState, useEffect } from 'react';
import { Dialog, DialogContent } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { MessageCircle, Link2Off, RefreshCw, X } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';

interface PostWalkthroughTipsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const tips = [
  {
    icon: MessageCircle,
    title: 'Start casual',
    description: "Ask if it's the right number - keep it friendly, not salesy.",
  },
  {
    icon: Link2Off,
    title: 'No links first',
    description: 'Wait for them to reply before sending any links or prices.',
  },
  {
    icon: RefreshCw,
    title: 'Follow up = close',
    description: "80% of deals happen after the 2nd message. Don't give up early.",
  },
];

export function PostWalkthroughTipsModal({ open, onOpenChange }: PostWalkthroughTipsModalProps) {
  const { user } = useAuth();
  const [dontShowAgain, setDontShowAgain] = useState(false);

  const handleClose = (keepGoing?: boolean) => {
    if (dontShowAgain && user?.id) {
      // Persist dismissal
      try {
        localStorage.setItem(`post_walkthrough_tips_dismissed_${user.id}`, 'true');
      } catch {}
      // Also persist to backend
      Promise.resolve(supabase
        .from('user_trials')
        .update({ walkthrough_completed: true } as any)
        .eq('user_id', user.id)
      ).catch(() => {});
    }
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        hideClose
        className="max-w-sm mx-auto p-0 overflow-hidden border-border/50 bg-card shadow-2xl animate-in fade-in-0 zoom-in-95 duration-300"
      >
        <div className="p-6 space-y-5">
          {/* Header */}
          <div className="text-center space-y-1.5 relative">
            <button
              onClick={() => handleClose()}
              className="absolute -top-1 -right-1 h-7 w-7 rounded-full hover:bg-muted flex items-center justify-center transition-colors"
              aria-label="Close"
            >
              <X className="h-4 w-4 text-muted-foreground" />
            </button>
            <h2 className="text-lg font-bold text-foreground">How to get replies 💬</h2>
            <p className="text-sm text-muted-foreground">3 tips to nail your first message and get more responses</p>
          </div>

          {/* Tip Cards */}
          <div className="space-y-3">
            {tips.map((tip, i) => {
              const Icon = tip.icon;
              return (
                <div
                  key={i}
                  className="flex items-start gap-3 p-3 rounded-lg bg-muted/40 border border-border/30"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10">
                    <Icon className="h-4 w-4 text-primary" />
                  </div>
                  <div>
                    <p className="text-sm font-semibold text-foreground">{tip.title}</p>
                    <p className="text-xs text-muted-foreground">{tip.description}</p>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Motivational line */}
          <p className="text-center text-xs text-muted-foreground italic">
            Consistency is everything - the people who send 10+ messages a day land clients within weeks, not months.
          </p>

          {/* Actions */}
          <div className="space-y-2">
            <Button size="lg" className="w-full" onClick={() => handleClose(true)}>
              Keep going 💪
            </Button>
          </div>

          {/* Don't show again */}
          <label className="flex items-center gap-2 cursor-pointer justify-center">
            <Checkbox
              checked={dontShowAgain}
              onCheckedChange={(v) => setDontShowAgain(!!v)}
              className="h-3.5 w-3.5"
            />
            <span className="text-[11px] text-muted-foreground">Don't show again</span>
          </label>
        </div>
      </DialogContent>
    </Dialog>
  );
}
