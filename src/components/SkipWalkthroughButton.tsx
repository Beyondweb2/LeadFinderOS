import { useState } from 'react';
import { useAuth } from '@/hooks/useAuth';
import { useDemoChecklist } from '@/contexts/DemoChecklistContext';
import { useWalkthroughStatus } from '@/hooks/useWalkthroughStatus';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

export function SkipWalkthroughButton() {
  const { user } = useAuth();
  const { isDemoUser } = useDemoChecklist();
  const { walkthroughOpen } = useWalkthroughStatus();
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (!walkthroughOpen || !isDemoUser) return null;

  const handleSkip = () => {
    if (!user?.id) return;
    // Set all dismiss/complete flags
    try {
      localStorage.setItem(`demo_walkthrough_dismissed_${user.id}`, 'true');
      localStorage.setItem(`walkthrough_completed_${user.id}`, 'true');
    } catch {}
    setConfirmOpen(false);
    // Immediately kill walkthrough overlay everywhere
    window.dispatchEvent(new CustomEvent('skip-walkthrough'));
    window.dispatchEvent(new CustomEvent('pulse-search-nav'));
  };

  return (
    <>
      <button
        onClick={() => setConfirmOpen(true)}
        className="text-[12px] text-primary hover:underline underline-offset-2 cursor-pointer transition-colors"
      >
        Skip walkthrough
      </button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle>Skip walkthrough?</DialogTitle>
            <DialogDescription>
              You can continue using the app without guided steps.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Continue walkthrough
            </Button>
            <Button onClick={handleSkip}>
              Yes, skip
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
