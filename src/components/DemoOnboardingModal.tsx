import { useState, useEffect } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Check } from 'lucide-react';
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
    'Search an area you know',
    'Add a business to your CRM',
    'Contact them',
    'Track the outcome (Won / Lost)',
  ];

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) dismiss(); }}>
      <DialogContent className="max-w-md mx-auto">
        <DialogHeader>
          <DialogTitle className="text-lg font-bold">
            Try the full workflow in 60 seconds
          </DialogTitle>
          <DialogDescription className="pt-2 text-sm text-muted-foreground">
            Here's the quickest way to feel the value during your free demo:
          </DialogDescription>
        </DialogHeader>

        <ol className="space-y-3 py-2">
          {steps.map((step, i) => (
            <li key={i} className="flex items-start gap-3">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-semibold">
                {i + 1}
              </span>
              <span className="text-sm leading-6">{step}</span>
            </li>
          ))}
        </ol>

        <p className="text-xs text-muted-foreground">
          You've got 1 demo search — use it to test the process end to end.
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
            Got it
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
