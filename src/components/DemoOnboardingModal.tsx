import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Check, Search, UserPlus, MessageSquare, TrendingUp, Sparkles } from 'lucide-react';
import { useAuth } from '@/hooks/useAuth';

const STORAGE_KEY = 'demo_onboarding_seen_v1';

function getSeenKey(userId?: string) {
  return userId ? `${STORAGE_KEY}_${userId}` : STORAGE_KEY;
}

interface DemoOnboardingModalProps {
  isDemoUser: boolean;
}

export function DemoOnboardingModal({ isDemoUser }: DemoOnboardingModalProps) {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [dontShowAgain, setDontShowAgain] = useState(true);

  useEffect(() => {
    if (!isDemoUser) return;
    const key = getSeenKey(user?.id);
    const seen = localStorage.getItem(key);
    if (!seen) {
      setOpen(true);
    }
  }, [isDemoUser, user?.id]);

  const dismiss = () => {
    setOpen(false);
    if (dontShowAgain) {
      localStorage.setItem(getSeenKey(user?.id), 'true');
    }
  };

  const steps = [
    { label: 'Search any area', desc: 'Find businesses without websites near you', icon: Search },
    { label: 'Add businesses to CRM', desc: 'Save hot leads with one click', icon: UserPlus },
    { label: 'Contact them', desc: 'WhatsApp, SMS, or call — templates included', icon: MessageSquare },
    { label: 'Update status', desc: 'Mark the outcome after you reach out', icon: TrendingUp },
    { label: 'Track responses', desc: 'Follow up and move leads through your pipeline', icon: Sparkles },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) dismiss(); }}>
      <DialogContent className="max-w-sm mx-auto border-primary/15 bg-gradient-to-b from-card to-background/95 backdrop-blur-xl p-0 overflow-hidden">
        {/* Top accent bar */}
        <div className="h-1 w-full bg-gradient-to-r from-primary/60 via-primary to-primary/60" />
        
        <div className="px-6 pt-5 pb-2">
          <DialogHeader className="text-center space-y-2">
            <div className="mx-auto flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 border border-primary/20">
              <Sparkles className="h-5 w-5 text-primary" />
            </div>
            <DialogTitle className="text-lg font-bold">
              Quick Walkthrough
            </DialogTitle>
            <DialogDescription className="text-sm text-muted-foreground leading-relaxed">
              Follow these steps to see everything in action.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="px-6 pb-2">
          <ol className="space-y-2.5">
            {steps.map((step, i) => (
              <li key={i} className="flex items-center gap-3 rounded-lg bg-muted/40 px-3 py-2.5 border border-border/50">
                <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary text-xs font-bold">
                  {i + 1}
                </span>
                <div className="min-w-0">
                  <span className="text-sm font-medium">{step.label}</span>
                  <p className="text-[11px] text-muted-foreground leading-snug">{step.desc}</p>
                </div>
              </li>
            ))}
          </ol>
        </div>

        <div className="px-6 pb-5 pt-2 space-y-3">
          <p className="text-[11px] text-muted-foreground text-center">
            A checklist in the bottom-right will guide you through each step.
          </p>

          <div className="flex items-center gap-2">
            <Checkbox
              id="dont-show"
              checked={dontShowAgain}
              onCheckedChange={(v) => setDontShowAgain(v === true)}
            />
            <label htmlFor="dont-show" className="text-[11px] text-muted-foreground cursor-pointer select-none">
              Don't show again
            </label>
          </div>

          <DialogFooter className="gap-2 sm:gap-2">
            <Button variant="ghost" size="sm" onClick={dismiss} className="text-muted-foreground">
              Skip
            </Button>
            <Button size="sm" onClick={dismiss}>
              <Check className="mr-1.5 h-3.5 w-3.5" />
              Let's go
            </Button>
          </DialogFooter>
        </div>
      </DialogContent>
    </Dialog>
  );
}
