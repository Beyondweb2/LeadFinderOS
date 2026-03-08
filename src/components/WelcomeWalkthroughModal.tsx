import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import appLogo from '@/assets/logo.png';
import { ArrowRight } from 'lucide-react';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';

export function WelcomeWalkthroughModal() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [show, setShow] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!user?.id) return;
    let cancelled = false;

    supabase
      .from('user_trials')
      .select('has_seen_walkthrough_prompt')
      .eq('user_id', user.id)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled) return;
        setChecked(true);
        if (data && !data.has_seen_walkthrough_prompt) {
          setShow(true);
          (window as any).__welcomeModalActive = true;
        }
      });

    return () => { cancelled = true; };
  }, [user?.id]);

  const dismiss = async (startWalkthrough: boolean) => {
    setShow(false);
    (window as any).__welcomeModalActive = false;

    if (user?.id) {
      try {
        await supabase.functions.invoke('ensure-trial', {
          body: { action: 'mark_walkthrough_prompt_seen' },
        });
      } catch {}
    }

    if (startWalkthrough) {
      window.dispatchEvent(new CustomEvent('start-walkthrough'));
    } else {
      if (user?.id) {
        try {
          localStorage.setItem(`demo_walkthrough_dismissed_${user.id}`, 'true');
          localStorage.setItem(`walkthrough_completed_${user.id}`, 'true');
        } catch {}
      }
      window.dispatchEvent(new CustomEvent('skip-walkthrough'));
    }
  };

  if (!checked || !show) return null;

  return (
    <Dialog open={show} onOpenChange={(v) => { if (!v) dismiss(false); }}>
      <DialogContent
        hideClose
        className="max-w-sm sm:max-w-[400px] mx-auto p-0 overflow-hidden border-border/40 bg-[hsl(220_50%_5%)] rounded-2xl outline-none focus:outline-none focus-visible:outline-none [&:focus]:outline-none [&:focus-visible]:ring-0"
      >
        <div className="px-7 pt-7 pb-6 sm:px-8 sm:pt-8 sm:pb-7 flex flex-col items-center">
          <div className="grid grid-cols-[40px_1fr_40px] items-center w-full mb-6">
            <div className="flex justify-start">
              <img src={appLogo} alt="LeadFinder Pro" className="h-9 w-9 shrink-0" />
            </div>
            <h2 className="text-lg font-bold tracking-tight text-center">
              Lead<span className="text-primary">Finder</span> Pro
            </h2>
            <div />
          </div>

          <h3 className="text-center text-[22px] sm:text-2xl font-bold leading-[1.2] tracking-tight mb-4 text-foreground">
            {t('welcome.headline')} <span className="text-primary">{t('welcome.headlineAccent')}</span> {t('welcome.headlineEmoji')}
          </h3>

          <p className="text-center text-[14px] text-muted-foreground/80 leading-relaxed mb-4">
            {t('welcome.body')}
          </p>
          <div className="text-left text-[13px] text-muted-foreground/70 leading-relaxed mb-6 space-y-1.5 w-full px-2">
            <p className="flex items-center gap-2"><span className="text-emerald-400 font-semibold">1.</span> {t('welcome.step1')}</p>
            <p className="flex items-center gap-2"><span className="text-emerald-400 font-semibold">2.</span> {t('welcome.step2')}</p>
            <p className="flex items-center gap-2"><span className="text-emerald-400 font-semibold">3.</span> {t('welcome.step3')}</p>
            <p className="flex items-center gap-2"><span className="text-emerald-400 font-semibold">4.</span> {t('welcome.step4')}</p>
          </div>

          <button
            onClick={() => dismiss(true)}
            className="btn-premium w-full h-12 rounded-xl text-[15px] font-semibold text-white flex items-center justify-center gap-2 transition-all mb-3 outline-none focus:outline-none focus-visible:outline-none border-none ring-0 focus:ring-0 focus-visible:ring-0"
          >
            {t('welcome.cta')}
            <ArrowRight className="h-4 w-4" />
          </button>

          <p className="text-center text-[12px] text-muted-foreground/60">
            Takes less than a minute.
          </p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
