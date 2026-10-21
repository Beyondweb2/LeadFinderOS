import { useState } from 'react';
import { Clock, Settings } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { InboxReplyModeControl } from '@/components/InboxReplyModeControl';
import { InboxVisibleRuleControl } from '@/components/InboxVisibleRuleControl';
import { ReplyHoursDialog } from '@/components/InboxSendWindow';
import { replyWindowFor, type ReplyHours } from '@/lib/inboxSendWindow';
import type { InboxChannel } from '@/lib/inboxChannel';
import { useCountrySettings } from '@/hooks/useCountrySettings';

/* THE INBOX SETTINGS POPUP (2026-10-21, Paul). The top row used to carry the reply rule, the AI switch, Draft outcomes, the parked-pitch
   count and more; now one Settings button opens them, grouped, each with a plain line on what it does. ⛔ LAYOUT ONLY: every control here
   is the same component with the same handlers and the same server call as before (AutoReplyToggle / AiRepliesToggle with layout="panel",
   ReplyHoursDialog) — nothing about what a setting DOES changed. Admin only (the caller renders it for perms.queueControls).
   2026-10-21 (later, Paul): the reply rule and the AI switch became ONE mode — Manual / Draft for approval / Auto
   (InboxReplyModeControl, src/lib/inboxReplyMode.ts), with the "Sends by itself" switches under Auto. "Audit and reply" is retired. */
const hhmm = (min: number | null): string => (min == null ? '' : `${String(Math.floor(min / 60)).padStart(2, '0')}:${String(min % 60).padStart(2, '0')}`);

function Section({ title, hint, children, testId }: { title: string; hint?: string; children: React.ReactNode; testId?: string }) {
  return (
    <section className="space-y-2 border-t border-border pt-4 first:border-t-0 first:pt-0" data-testid={testId}>
      <div>
        <h3 className="text-xs font-bold uppercase tracking-wide text-muted-foreground">{title}</h3>
        {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

export function InboxSettings({ channel, aiOn, isAdmin, replyHours, onSaveReplyHours }: {
  channel: InboxChannel;
  aiOn: boolean;
  isAdmin: boolean;
  replyHours: ReplyHours | null;
  onSaveReplyHours: (start: number | null, end: number | null) => Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [hoursOpen, setHoursOpen] = useState(false);
  const { settings } = useCountrySettings();
  /* The UK number's hours are the default the reply hours fall back to (the same window the dialog quotes on a thread). */
  const outreach = replyWindowFor(channel, '447700900000', { countrySettings: settings });
  const custom = replyHours && replyHours.startMin != null && replyHours.endMin != null;

  return (
    <>
      <Button size="sm" variant="outline" onClick={() => setOpen(true)} aria-label="Settings" data-testid="inbox-settings-button">
        <Settings className="h-4 w-4 sm:mr-1.5" /><span className="hidden sm:inline">Settings</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[88dvh] overflow-y-auto sm:max-w-xl" data-testid="inbox-settings-dialog">
          <DialogHeader>
            <DialogTitle>Inbox settings</DialogTitle>
            <DialogDescription>How replies are handled, and when Inbox messages go out.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <Section title="When a prospect replies" hint="One mode for WhatsApp and texts. It does not touch the outreach queue." testId="settings-replies">
              <InboxReplyModeControl channel={channel} />
            </Section>
            {isAdmin && (
              <Section title="Visible" hint="AI already names the business: no pitch is drafted or sent, it never shows Needs you, and its queued follow-ups are cancelled." testId="settings-visible">
                <InboxVisibleRuleControl />
              </Section>
            )}
            {isAdmin && (
              <Section title="Sending hours" testId="settings-hours">
                <div className="flex items-start justify-between gap-3">
                  <p className="text-xs text-muted-foreground">
                    Messages you send from the Inbox outside these hours are queued and go out when the lead&apos;s hours open. Nothing sends early.
                    {' '}Now: <span className="font-medium text-foreground">{custom ? `${hhmm(replyHours!.startMin)}–${hhmm(replyHours!.endMin)}` : `the outreach hours (${hhmm(outreach.startMin)}–${hhmm(outreach.endMin)})`}</span>.
                  </p>
                  <Button size="sm" variant="outline" className="shrink-0" onClick={() => setHoursOpen(true)}><Clock className="mr-1.5 h-3.5 w-3.5" />Reply hours</Button>
                </div>
              </Section>
            )}
          </div>
        </DialogContent>
      </Dialog>
      {isAdmin && hoursOpen && (
        <ReplyHoursDialog open={hoursOpen} onOpenChange={setHoursOpen} current={replyHours} outreach={outreach} onSave={onSaveReplyHours} />
      )}
    </>
  );
}
