import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { useDemoChecklist } from '@/contexts/DemoChecklistContext';
import { supabase } from '@/integrations/supabase/client';
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
  const { t } = useTranslation();
  const { user } = useAuth();
  const { isDemoUser } = useDemoChecklist();
  const { walkthroughOpen } = useWalkthroughStatus();
  const [confirmOpen, setConfirmOpen] = useState(false);

  if (!walkthroughOpen || !isDemoUser) return null;

  const handleSkip = () => {
    if (!user?.id) return;
    try {
      localStorage.setItem(`demo_walkthrough_dismissed_${user.id}`, 'true');
      localStorage.setItem(`walkthrough_completed_${user.id}`, 'true');
    } catch {}
    Promise.resolve(supabase.rpc('log_walkthrough_event' as any, {
      p_event_type: 'walkthrough_skip',
      p_meta: { step: 0, walkthrough_id: 'main' },
    })).catch(() => {});
    setConfirmOpen(false);
    window.dispatchEvent(new CustomEvent('skip-walkthrough'));
    window.dispatchEvent(new CustomEvent('pulse-search-nav'));
  };

  return (
    <>
      <button
        onClick={() => setConfirmOpen(true)}
        className="text-[12px] text-primary hover:underline underline-offset-2 cursor-pointer transition-colors"
      >
        {t('skipWalkthrough.buttonLabel')}
      </button>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-[380px]">
          <DialogHeader>
            <DialogTitle>{t('skipWalkthrough.title')}</DialogTitle>
            <DialogDescription>{t('skipWalkthrough.description')}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              {t('skipWalkthrough.continueWalkthrough')}
            </Button>
            <Button onClick={handleSkip}>
              {t('skipWalkthrough.yesSkip')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
