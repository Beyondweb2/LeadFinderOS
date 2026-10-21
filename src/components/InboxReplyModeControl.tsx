import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { invokeEdge, edgeErrorMessage } from '@/lib/edgeInvoke';
import { QUEUE_STATUS_KEY } from '@/lib/queueStatus';
import { AiDraftOutcomes } from '@/components/AiDraftOutcomes';
import { AutoSendSwitches, type AutoSendSettings } from '@/components/AutoSendSwitches';
import {
  INBOX_REPLY_MODES, INBOX_REPLY_MODE_HINTS, INBOX_REPLY_MODE_LABELS, INBOX_REPLY_MODE_QUESTION, parseInboxReplyMode, type InboxReplyMode,
} from '@/lib/inboxReplyMode';

/* THE INBOX REPLY MODE (2026-10-21, Paul) — ONE control in Inbox Settings replacing "When a prospect replies" (Do nothing / Audit only /
   Audit and reply) and the "AI handles replies" switch: Manual · Draft for approval · Auto. Rules: src/lib/inboxReplyMode.ts.
   Admin only: fn ai-reply-drafts refuses a non-admin's read and the control stays hidden. Under Auto, the per-reply-type
   "Sends by itself" switches (all off when shipped). Leaving Auto cancels every automatic reply still waiting (database trigger).
   "Audit and reply" is retired — there is no option that sends the old template reply. */
export function InboxReplyModeControl({ channel }: { channel: 'whatsapp' | 'sms' }) {
  const qc = useQueryClient();
  const { toast } = useToast();
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<InboxReplyMode>('manual');
  const [auto, setAuto] = useState<AutoSendSettings | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    let live = true;
    invokeEdge<{ ok: true; mode?: string; auto_send?: AutoSendSettings }>('ai-reply-drafts', { action: 'settings' })
      .then((r) => { if (live) { setMode(parseInboxReplyMode(r.mode)); setAuto(r.auto_send ?? null); setVisible(true); } })
      .catch(() => { /* not an admin, or not deployed yet: stay hidden */ });
    return () => { live = false; };
  }, []);

  if (!visible) return null;

  const pick = async (next: InboxReplyMode) => {
    if (next === mode) return;
    setSaving(true);
    const prev = mode;
    setMode(next);
    try {
      const r = await invokeEdge<{ ok: true; mode?: string; auto_send?: AutoSendSettings }>('ai-reply-drafts', { action: 'set_mode', mode: next });
      const saved = parseInboxReplyMode(r.mode);
      setMode(saved);
      if (r.auto_send) setAuto(r.auto_send);
      void qc.invalidateQueries({ queryKey: QUEUE_STATUS_KEY });
      const on = r.auto_send?.intents.length ?? 0;
      toast({
        title: `Inbox replies: ${INBOX_REPLY_MODE_LABELS[saved]}`,
        description: saved === 'auto'
          ? (on ? `${on} reply ${on === 1 ? 'type is' : 'types are'} switched on to send by themselves. Everything else waits for your approval.` : 'No reply type is switched on yet, so nothing sends by itself until you switch one on below.')
          : `${INBOX_REPLY_MODE_HINTS[saved]}${prev === 'auto' ? ' Any automatic reply still waiting was cancelled.' : ''}`,
        variant: saved === 'auto' ? 'destructive' : undefined,
      });
    } catch (e) {
      setMode(prev);
      toast({ title: "Couldn't change the Inbox mode", description: edgeErrorMessage(e), variant: 'destructive' });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-2" data-testid="inbox-reply-mode">
      <div className="space-y-1.5" role="radiogroup" aria-label={INBOX_REPLY_MODE_QUESTION}>
        {INBOX_REPLY_MODES.map((m) => {
          const lit = mode === m;
          return (
            <button key={m} type="button" role="radio" aria-checked={lit} disabled={saving} onClick={() => void pick(m)}
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
      {channel === 'sms' && (
        <p className="text-xs text-muted-foreground" data-testid="sms-reply-note">Texts are never drafted or sent automatically. On a text reply Draft for approval and Auto run the audit only; Manual runs nothing.</p>
      )}
      {mode === 'auto' && auto && <AutoSendSwitches initial={auto} />}
      <div className="flex justify-end"><AiDraftOutcomes /></div>
    </div>
  );
}
