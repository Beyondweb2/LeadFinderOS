import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { ArrowRight, ClipboardList, MessageSquare, Phone, Send } from 'lucide-react';
import { ActionBar, DialogHero, IconTile } from '@/components/operator/ui';

/**
 * One-time popup shown when the walkthrough reaches the Outreach page.
 * Explains the CRM briefly, then on dismiss advances walkthrough to
 * "go to Track Leads" step.
 */
export function OutreachIntroModal() {
  const { t } = useTranslation();
  const { user } = useAuth();
  const [open, setOpen] = useState(false);

  const storageKey = user?.id ? `outreach_intro_shown_${user.id}` : null;

  useEffect(() => {
    const handler = () => {
      if (storageKey && localStorage.getItem(storageKey)) return;
      setOpen(true);
    };
    window.addEventListener('show-outreach-intro', handler);
    return () => window.removeEventListener('show-outreach-intro', handler);
  }, [storageKey]);

  useEffect(() => {
    if (open) {
      window.dispatchEvent(new Event('trial-modal-opened'));
    } else {
      window.dispatchEvent(new Event('trial-modal-closed'));
    }
  }, [open]);

  const handleDismiss = () => {
    setOpen(false);
    if (storageKey) {
      localStorage.setItem(storageKey, 'true');
    }
    // Advance walkthrough: mark outreach intro done
    window.dispatchEvent(new CustomEvent('outreach-intro-dismissed'));
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { if (!v) handleDismiss(); }}>
      <DialogContent hideClose className="sm:max-w-[400px]">
        {/* 2026-10-06 design consistency: the operator dialog look (icon tile + title — the dialog now has
            an accessible title), not the old dark LeadFinder-branded splash. Same words, same Got it. */}
        <DialogHero
          icon={ClipboardList}
          tone="blue"
          title="Your Outreach CRM"
          subtitle="These sample leads show how your pipeline works. Add real leads from Find Leads to get started."
        />

        <div className="space-y-3 text-[13px] leading-relaxed text-muted-foreground">
          <div className="flex items-start gap-3">
            <IconTile icon={MessageSquare} tone="blue" size="sm" />
            <p>
              <span className="font-medium text-foreground">Contact leads directly</span> — reach out via WhatsApp or a call. The contact method and status update automatically.
            </p>
          </div>
          <div className="flex items-start gap-3">
            <IconTile icon={Send} tone="blue" size="sm" />
            <p>
              <span className="font-medium text-foreground">Set next actions</span> — schedule follow-ups, calls, or reminders so nothing falls through the cracks.
            </p>
          </div>
          <div className="flex items-start gap-3">
            <IconTile icon={Phone} tone="blue" size="sm" />
            <p>
              <span className="font-medium text-foreground">Track interested leads</span> — if a business seems interested, track them to close the deal.
            </p>
          </div>
        </div>

        <ActionBar>
          <Button onClick={handleDismiss} className="w-full gap-2 sm:w-auto">
            Got it
            <ArrowRight className="h-4 w-4" />
          </Button>
        </ActionBar>
      </DialogContent>
    </Dialog>
  );
}
