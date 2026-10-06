import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/hooks/useAuth';
import { Lightbulb, Send } from 'lucide-react';
import { ActionBar, DialogHero } from '@/components/operator/ui';

type ContactMethod = 'whatsapp' | 'sms' | 'call' | null;

export function OutreachTipsDialog() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [contactMethod, setContactMethod] = useState<ContactMethod>(null);

  const storageKey = user?.id ? `outreach_tips_dismissed_${user.id}` : null;

  useEffect(() => {
    if (!storageKey) return;
    const dismissed = localStorage.getItem(storageKey);
    if (dismissed) return;

    const onContactClick = (e: Event) => {
      if (!localStorage.getItem(storageKey)) {
        const method = (e as CustomEvent)?.detail?.method || 'whatsapp';
        setContactMethod(method);
        setOpen(true);
      }
    };
    const onSkipContact = () => {
      if (!localStorage.getItem(storageKey)) {
        setContactMethod('whatsapp');
        setOpen(true);
      }
    };

    window.addEventListener('outreach-first-contact-click', onContactClick);
    window.addEventListener('walkthrough-skip-contact-steps', onSkipContact);
    return () => {
      window.removeEventListener('outreach-first-contact-click', onContactClick);
      window.removeEventListener('walkthrough-skip-contact-steps', onSkipContact);
    };
  }, [storageKey]);

  useEffect(() => {
    if (open) {
      window.dispatchEvent(new Event('trial-modal-opened'));
    } else {
      window.dispatchEvent(new Event('trial-modal-closed'));
    }
  }, [open]);

  const handleClose = (skipped = false) => {
    setOpen(false);
    if (storageKey) {
      localStorage.setItem(storageKey, 'true');
    }
    // Skip always just closes back to outreach — no re-triggering contact steps
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(true); else setOpen(true); }}>
      <DialogContent className="sm:max-w-[400px]">
        {/* 2026-10-06 design consistency: the operator dialog look (icon tile + title), not the old
            dark LeadFinder-branded splash. Same words, same Skip and Send. */}
        <DialogHero
          icon={Lightbulb}
          tone="blue"
          title={<>{t('outreachTips.headline1')} {t('outreachTips.headline2')}</>}
        />

        <ol className="space-y-3 text-[13px] leading-relaxed text-muted-foreground">
          {[1, 2, 3, 4].map((n) => (
            <li key={n} className="flex gap-2.5">
              <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-blue-500/10 text-[11px] font-bold text-blue-700 dark:text-blue-300">{n}</span>
              <p><span className="font-medium text-foreground">{t(`outreachTips.tip${n}Title`)}</span> {t(`outreachTips.tip${n}Desc`)}</p>
            </li>
          ))}
        </ol>

        <ActionBar className="justify-between">
          <p className="text-[12px] text-muted-foreground">
            {t('outreachTips.notReady')}{' '}
            <button
              onClick={() => handleClose(true)}
              className="text-[13px] font-medium text-primary hover:text-primary/80 cursor-pointer transition-colors underline-offset-2 hover:underline"
            >
              {t('common.skip')}
            </button>
          </p>
          <Button onClick={() => handleClose(false)} className="gap-2">
            <Send className="h-4 w-4" />
            {t('outreachTips.sendInitialText')}
          </Button>
        </ActionBar>
      </DialogContent>
    </Dialog>
  );
}
