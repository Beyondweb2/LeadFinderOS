import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { ArrowRight, CheckCircle2, Phone, ClipboardList } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ActionBar, DialogHero, IconTile } from '@/components/operator/ui';
import { useAuth } from '@/hooks/useAuth';

export function PostContactModal() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  const storageKey = user?.id ? `post_contact_modal_shown_${user.id}` : null;

  useEffect(() => {
    if (!storageKey) return;
    const onContactDone = () => {
      if (localStorage.getItem(storageKey)) return;
      localStorage.setItem(storageKey, 'true');
      setOpen(true);
    };
    window.addEventListener('post-contact-modal-trigger', onContactDone);
    return () => window.removeEventListener('post-contact-modal-trigger', onContactDone);
  }, [storageKey]);

  useEffect(() => {
    if (open) {
      window.dispatchEvent(new Event('trial-modal-opened'));
    } else {
      window.dispatchEvent(new Event('trial-modal-closed'));
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) setOpen(false); }}>
      <DialogContent className="sm:max-w-[420px]">
        {/* 2026-10-06 design consistency: the operator dialog look (icon tile + title), not the old
            dark LeadFinder-branded splash. Same words, same single dismiss. */}
        <DialogHero
          icon={CheckCircle2}
          tone="green"
          title={<>{t('postContact.greatStart')} {t('postContact.hereIsWhatNext')}</>}
        />

        <div className="space-y-3 text-[13px] leading-relaxed text-muted-foreground">
          {/* ⛔ The "No WhatsApp? Try SMS" tip is gone (Paul, 2026-10-01): we do no SMS outreach. */}
          <div className="flex items-start gap-3">
            <IconTile icon={Phone} tone="blue" size="sm" />
            <p><span className="font-medium text-foreground">{t('postContact.callingIsKing')}</span> {t('postContact.callingIsKingDesc')}</p>
          </div>
          <div className="flex items-start gap-3">
            <IconTile icon={ClipboardList} tone="blue" size="sm" />
            <p><span className="font-medium text-foreground">{t('postContact.whenSomeoneReplies')}</span> {t('postContact.whenSomeoneRepliesDesc')}</p>
          </div>
        </div>

        <ActionBar>
          <Button onClick={() => setOpen(false)} className="w-full gap-2 sm:w-auto">
            {t('postContact.gotItKeepGoing')}
            <ArrowRight className="h-4 w-4" />
          </Button>
        </ActionBar>
      </DialogContent>
    </Dialog>
  );
}
