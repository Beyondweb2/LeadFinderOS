import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { invokeEdge, edgeErrorMessage } from '@/lib/edgeInvoke';
import { QUEUE_STATUS_KEY } from '@/lib/queueStatus';
import { Switch } from '@/components/ui/switch';
import { AiDraftOutcomes } from '@/components/AiDraftOutcomes';
import { AutoSendSwitches, type AutoSendSettings } from '@/components/AutoSendSwitches';
import {
  INBOX_REPLY_MODES, INBOX_REPLY_MODE_HINTS, INBOX_REPLY_MODE_LABELS, INBOX_REPLY_MODE_QUESTION, parseInboxReplyMode, pitchNeedsAuditHint,
  REPLY_AUDIT_HINT, REPLY_AUDIT_OFF_PITCH_HINT, REPLY_AUDIT_QUESTION, type InboxReplyMode,
} from '@/lib/inboxReplyMode';

type SettingsReply = { ok: true; mode?: string; reply_audit?: boolean; auto_send?: AutoSendSettings };

/* THE INBOX REPLY SETTINGS (2026-10-21, Paul; split 2026-10-22). TWO controls in Inbox Settings:
     (a) "Audit after first reply" On / Off — the website check + audit on a first reply (whatsapp_outreach_state.reply_audit_enabled).
     (b) "AI replies" Manual · Draft for approval · Auto (ai_reply_mode). Rules: src/lib/inboxReplyMode.ts.
   Manual no longer turns the audit off. Admin only: fn ai-reply-drafts refuses a non-admin's read and the control stays hidden.
   Under Auto, the per-reply-type "Sends by itself" switches (all off when shipped). Leaving Auto cancels every automatic reply
   still waiting (database trigger). "Audit and reply" is retired — there is no option that sends the old template reply. */
export function InboxReplyModeControl({ channel }: { channel: 'whatsapp' | 'sms' }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<InboxReplyMode>('manual');
  const [auditOn, setAuditOn] = useState<boolean | null>(null);
  const [auto, setAuto] = useState<AutoSendSettings | null>(null);
  const [saving, setSaving] = useState<null | 'mode' | 'audit'>(null);

  useEffect(() => {
    let live = true;
    invokeEdge<SettingsReply>('ai-reply-drafts', { action: 'settings' })
      .then((r) => { if (live) { setMode(parseInboxReplyMode(r.mode)); setAuditOn(typeof r.reply_audit === 'boolean' ? r.reply_audit : null); setAuto(r.auto_send ?? null); setVisible(true); } })
      .catch(() => { /* not an admin, or not deployed yet: stay hidden */ });
    return () => { live = false; };
  }, []);

  if (!visible) return null;

  const pick = async (next: InboxReplyMode) => {
    if (next === mode) return;
    setSaving('mode');
    const prev = mode;
    setMode(next);
    try {
      const r = await invokeEdge<SettingsReply>('ai-reply-drafts', { action: 'set_mode', mode: next });
      const saved = parseInboxReplyMode(r.mode);
      setMode(saved);
      if (r.auto_send) setAuto(r.auto_send);
      void qc.invalidateQueries({ queryKey: QUEUE_STATUS_KEY });
      const on = r.auto_send?.intents.length ?? 0;
      toast({
        title: `AI replies: ${INBOX_REPLY_MODE_LABELS[saved]}`,
        description: saved === 'auto'
          ? (on ? `${on} reply ${on === 1 ? 'type is' : 'types are'} switched on to send by themselves. Everything else waits for your approval.` : 'No reply type is switched on yet, so nothing sends by itself until you switch one on below.')
          : `${INBOX_REPLY_MODE_HINTS[saved]}${prev === 'auto' ? ' Any automatic reply still waiting was cancelled.' : ''}`,
        variant: saved === 'auto' ? 'destructive' : undefined,
      });
    } catch (e) {
      setMode(prev);
      toast({ title: "Couldn't change AI replies", description: edgeErrorMessage(e), variant: 'destructive' });
    } finally {
      setSaving(null);
    }
  };

  const setAudit = async (next: boolean) => {
    if (next === auditOn) return;
    setSaving('audit');
    const prev = auditOn;
    setAuditOn(next);
    try {
      const r = await invokeEdge<SettingsReply>('ai-reply-drafts', { action: 'set_reply_audit', on: next });
      setAuditOn(r.reply_audit === true);
      void qc.invalidateQueries({ queryKey: QUEUE_STATUS_KEY });
      toast({ title: `${REPLY_AUDIT_QUESTION}: ${r.reply_audit ? 'On' : 'Off'}`, description: r.reply_audit ? REPLY_AUDIT_HINT : 'A first reply no longer starts an audit. You can still run one from the thread.' });
    } catch (e) {
      setAuditOn(prev);
      toast({ title: "Couldn't change the audit setting", description: edgeErrorMessage(e), variant: 'destructive' });
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className="space-y-4" data-testid="inbox-reply-mode">
      <div className="flex items-start justify-between gap-3 rounded-md border border-input px-3 py-2" data-testid="reply-audit-control">
        <div className="min-w-0">
          <p className="text-sm font-medium">{REPLY_AUDIT_QUESTION}</p>
          <p className="text-xs text-muted-foreground">{REPLY_AUDIT_HINT}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2 pt-0.5">
          <span className="text-xs font-medium text-muted-foreground">{auditOn === null ? '…' : auditOn ? 'On' : 'Off'}</span>
          <Switch checked={auditOn === true} disabled={saving !== null || auditOn === null} onCheckedChange={(v) => void setAudit(v)}
            aria-label={REPLY_AUDIT_QUESTION} data-testid="reply-audit-switch" />
        </div>
      </div>
      <div className="space-y-1.5">
        <p className="text-sm font-medium">{INBOX_REPLY_MODE_QUESTION}</p>
        <div className="space-y-1.5" role="radiogroup" aria-label={INBOX_REPLY_MODE_QUESTION}>
          {INBOX_REPLY_MODES.map((m) => {
            const lit = mode === m;
            return (
              <button key={m} type="button" role="radio" aria-checked={lit} disabled={saving !== null} onClick={() => void pick(m)}
                data-testid={`inbox-reply-mode-${m}`}
                className={cn('w-full rounded-md border px-3 py-2 text-left transition disabled:opacity-60',
                  lit ? (m === 'auto' ? 'border-destructive bg-destructive/10' : 'border-primary bg-primary/5') : 'border-input hover:bg-muted/50')}>
                <span className="flex items-center gap-2 text-sm font-medium">
                  <span className={cn('h-3 w-3 shrink-0 rounded-full border', lit ? (m === 'auto' ? 'border-destructive bg-destructive' : 'border-primary bg-primary') : 'border-muted-foreground/50')} />
                  {INBOX_REPLY_MODE_LABELS[m]}
                  {m === 'auto' && <span className="rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-destructive">Can send by itself</span>}
                </span>
                <span className="mt-0.5 block pl-5 text-xs text-muted-foreground">{INBOX_REPLY_MODE_HINTS[m]}</span>
              </button>
            );
          })}
        </div>
        {pitchNeedsAuditHint(mode, auditOn) && (
          <p className="text-xs font-medium text-amber-700 dark:text-amber-300" data-testid="reply-audit-off-hint">{REPLY_AUDIT_OFF_PITCH_HINT}</p>
        )}
      </div>
      {channel === 'sms' && (
        <p className="text-xs text-muted-foreground" data-testid="sms-reply-note">Texts are never drafted or sent automatically. On a text reply only the audit runs, when {REPLY_AUDIT_QUESTION} is on.</p>
      )}
      {mode === 'auto' && auto && <AutoSendSwitches initial={auto} />}
      <div className="flex justify-end"><AiDraftOutcomes /></div>
    </div>
  );
}
