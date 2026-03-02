import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { useAuth } from '@/hooks/useAuth';
import appLogo from '@/assets/logo.png';
import { MessageSquare, Phone, Send } from 'lucide-react';

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
    if (skipped) {
      window.dispatchEvent(new CustomEvent('walkthrough-skip-contact-steps'));
    }
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleClose(true); else setOpen(true); }}>
      <DialogContent className="sm:max-w-[400px] p-0 overflow-hidden rounded-2xl border-border/40 bg-[hsl(220_50%_5%)]">
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

          <DialogTitle className="text-center text-[22px] sm:text-2xl font-bold leading-[1.2] tracking-tight mb-5">
            <span className="text-foreground">{t('outreachTips.headline1')}</span>
            <br />
            <span className="text-primary">{t('outreachTips.headline2')}</span>
          </DialogTitle>

          <div className="text-left text-[13px] text-muted-foreground leading-relaxed mb-4 space-y-3 w-full">
            {[1, 2, 3, 4].map((n) => (
              <div key={n} className="flex gap-2.5">
                <span className="text-green-400 font-bold text-sm shrink-0">{n}.</span>
                <p><span className="text-foreground font-medium">{t(`outreachTips.tip${n}Title`)}</span> {t(`outreachTips.tip${n}Desc`)}</p>
              </div>
            ))}
          </div>

          <p className="text-center text-[12px] text-muted-foreground mb-5">
            {t('outreachTips.notReady')}{' '}
            <button
              onClick={() => handleClose(true)}
              className="text-[13px] font-medium text-primary hover:text-primary/80 cursor-pointer transition-colors underline-offset-2 hover:underline"
            >
              {t('common.skip')}
            </button>
          </p>

          <button
            onClick={() => handleClose(false)}
            className="btn-premium w-full h-12 rounded-xl text-[15px] font-semibold text-white flex items-center justify-center gap-2 transition-all"
          >
            <Send className="h-4 w-4" />
            {t('outreachTips.sendInitialText')}
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
