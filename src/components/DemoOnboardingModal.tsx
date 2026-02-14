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
    { label: 'Add 3 businesses to CRM', desc: 'Save hot leads with one click', icon: UserPlus },
    { label: 'Contact one of them', desc: 'WhatsApp, SMS, or call — templates included', icon: MessageSquare },
    { label: 'Update their status', desc: 'Mark the outcome after you reach out', icon: TrendingUp },
    { label: 'Track a positive response', desc: 'When they reply positively, move them to Track Leads', icon: Sparkles },
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) dismiss(); }}>
      <DialogContent className="max-w-md mx-auto">
        <DialogHeader className="text-center space-y-3">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-primary/10">
            <Sparkles className="h-6 w-6 text-primary" />
          </div>
          <DialogTitle className="text-xl font-bold">
            Your lead-finding workflow — in 60 seconds
          </DialogTitle>
          <DialogDescription className="text-sm text-muted-foreground">
            Here's how to find, contact, and close leads — all from one place. Follow the checklist to see the full workflow.
          </DialogDescription>
        </DialogHeader>

        <ol className="space-y-3 py-3">
          {steps.map((step, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <step.icon className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <span className="text-sm font-medium leading-5">{step.label}</span>
                <p className="text-xs text-muted-foreground leading-4">{step.desc}</p>
              </div>
            </li>
          ))}
        </ol>

        <p className="text-xs text-muted-foreground text-center">
          Follow the checklist in the bottom-right to see every feature in action.
        </p>

        <div className="flex items-center gap-2 pt-1">
          <Checkbox
            id="dont-show"
            checked={dontShowAgain}
            onCheckedChange={(v) => setDontShowAgain(v === true)}
          />
          <label htmlFor="dont-show" className="text-xs text-muted-foreground cursor-pointer select-none">
            Don't show again
          </label>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" size="sm" onClick={dismiss}>
            Show me later
          </Button>
          <Button size="sm" onClick={dismiss}>
            <Check className="mr-1.5 h-3.5 w-3.5" />
            Let's go
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
