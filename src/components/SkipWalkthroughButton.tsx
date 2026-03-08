import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { useDemoChecklist } from '@/contexts/DemoChecklistContext';
import { supabase } from '@/integrations/supabase/client';
import { useWalkthroughStatus } from '@/hooks/useWalkthroughStatus';

export function SkipWalkthroughButton() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const { isDemoUser } = useDemoChecklist();
  const { walkthroughOpen } = useWalkthroughStatus();

  if (!walkthroughOpen || !isDemoUser || walkthroughCompleted) return null;

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
    window.dispatchEvent(new CustomEvent('skip-walkthrough'));
    window.dispatchEvent(new CustomEvent('pulse-search-nav'));
  };

  return (
    <button
      onClick={handleSkip}
      className="text-[12px] text-primary hover:underline underline-offset-2 cursor-pointer transition-colors"
    >
      {t('skipWalkthrough.buttonLabel')}
    </button>
  );
}
