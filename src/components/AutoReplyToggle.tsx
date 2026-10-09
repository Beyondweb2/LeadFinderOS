import { useEffect, useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { WHATSAPP_TEMPLATES } from '@/types/outreach';
import { getQueueStatus, QUEUE_STATUS_KEY } from '@/lib/queueStatus';
import {
  DEFAULT_FIRST_REPLY_MODE,
  DEFAULT_FIRST_REPLY_TEMPLATE,
  FIRST_REPLY_MODES,
  FIRST_REPLY_MODE_HINTS,
  FIRST_REPLY_MODE_LABELS,
  FIRST_REPLY_MODE_QUESTION,
  type FirstReplyMode,
} from '@/lib/firstReplyMode';
import { effectiveFirstReplyMode } from '@/lib/firstReplyAutomation';

/* "WHEN A PROSPECT REPLIES" — ONE SETTING FOR BOTH CHANNELS (2026-10-09). A text reply is governed by the SAME stored rule as a WhatsApp
   reply (whatsapp_outreach_state via process-whatsapp-queue), because it is one question about one prospect and the audit it starts is the
   same audit. The only difference: on the SMS tab "Audit and reply" is disabled — a text reply never sends an automatic message, so if the
   shared setting is "Audit and reply" a text runs the audit only (say so, never imply a send). Moved here from Inbox.tsx unchanged. */
/** The reply rule's THREE-WAY control (Off / Run audit only / Audit + auto-send).
 *
 *  Reads and writes whatsapp_outreach_state via process-whatsapp-queue (admin-gated modes
 *  'status' / 'set_first_reply_mode'), so it renders ONLY for admins — a 403 on status hides it.
 *  The AUTO_AUDIT_REPLY_ENABLED env kill-switch is the emergency stop for the whole automation —
 *  audit and send. "Do nothing" here is honoured by arming too (effectiveFirstReplyMode, 2026-09-28):
 *  a first reply then starts no audit. The guards (client, decline, auto-responder, suppression,
 *  opener) are firstReplyGuard in src/lib/firstReplyAutomation.ts, one set for every lead.
 *
 *  ⛔ WHY A SEGMENTED CONTROL AND NOT A SWITCH PLUS A MODIFIER. The dangerous state is "sending
 *  when I thought it was only measuring", and a switch beside a modifier lets the two be read
 *  separately — the eye takes in "on" and stops. Three buttons where exactly one is lit can only
 *  be read as one answer, and the lit one either says the word "send" or it does not. */
export function AutoReplyToggle({ channel = 'whatsapp' }: { channel?: 'whatsapp' | 'sms' }) {
  const sms = channel === 'sms';
  const statusQc = useQueryClient();
  const { toast } = useToast();
  const [visible, setVisible] = useState(false);
  const [mode, setMode] = useState<FirstReplyMode>(DEFAULT_FIRST_REPLY_MODE);
  const [envOn, setEnvOn] = useState(false);
  const [saving, setSaving] = useState(false);
  const [readyCount, setReadyCount] = useState<number | null>(null);
  const [replyTemplate, setReplyTemplate] = useState<string>(DEFAULT_FIRST_REPLY_TEMPLATE);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      /* The shared status read (src/lib/queueStatus.ts) — one call, not one per panel. */
      const data = await getQueueStatus(statusQc).catch(() => null);
      if (cancelled || !data?.ok) return; // non-admin (403) or failure → stay hidden
      /* The rule is OFF unless the boolean says so; the stored mode only chooses between the two
         working behaviours. Reading it the other way round would paint "Run audit only" over a
         rule the trigger treats as paused. */
      setMode(effectiveFirstReplyMode(data.autoReplyEnabled, data.firstReplyMode)); // the one reading the server arms by
      setEnvOn(data.autoReplyEnvOn === true);
      setReadyCount(typeof data.auditOnlyReadyCount === 'number' ? data.auditOnlyReadyCount : null);
      setReplyTemplate((data.firstReplyTemplate as string | null) ?? DEFAULT_FIRST_REPLY_TEMPLATE);
      setVisible(true);
    })();
    return () => { cancelled = true; };
  }, []);

  if (!visible) return null;

  // The template an auto-send uses. Only reachable in send mode; server-validated allowlist.
  const pickTemplate = async (value: string) => {
    const prev = replyTemplate;
    setReplyTemplate(value); // optimistic
    const { data, error } = await supabase.functions.invoke('process-whatsapp-queue', {
      body: { mode: 'set_first_reply_template', template: value },
    });
    if (error || !data?.ok) {
      setReplyTemplate(prev);
      toast({ title: "Couldn't set the reply template", description: error?.message ?? data?.detail ?? data?.error ?? 'Failed (has the SQL been run?)', variant: 'destructive' });
      return;
    }
    void statusQc.invalidateQueries({ queryKey: QUEUE_STATUS_KEY });
    toast({ title: 'Reply template set', description: `Auto-sends now use "${value}" (guards + 3-min cancel window unchanged).` });
  };

  const pickMode = async (next: FirstReplyMode) => {
    if (next === mode) return;
    setSaving(true);
    const prev = mode;
    setMode(next); // optimistic
    const { data, error } = await supabase.functions.invoke('process-whatsapp-queue', {
      body: { mode: 'set_first_reply_mode', value: next },
    });
    setSaving(false);
    if (error || !data?.ok) {
      setMode(prev);
      toast({ title: "Couldn't change the reply mode", description: error?.message ?? data?.detail ?? data?.error ?? 'Failed (has the SQL been run?)', variant: 'destructive' });
      return;
    }
    void statusQc.invalidateQueries({ queryKey: QUEUE_STATUS_KEY });
    /* The confirmation states what WILL happen, and for send mode it leads with the risk. A toast
       that only says "saved" is how an operator ends up unsure which mode is live. */
    toast({
      title: next === 'off' ? 'On reply: do nothing' : next === 'audit_only' ? 'On reply: audit only' : 'On reply: audit and reply',
      description: next === 'send' && !envOn
        ? 'Saved — but the AUTO_AUDIT_REPLY_ENABLED secret is off, so nothing will actually send yet.'
        : FIRST_REPLY_MODE_HINTS[next],
      variant: next === 'send' ? 'destructive' : undefined,
    });
  };

  const sending = mode === 'send';
  return (
    /* ══ PLACEMENT (Inbox top bar, 2026-10-01) ══ The control is laid out for the page header it lives in:
       from 1440px it sits on the title row beside Send now / New (1600px in send mode, whose template
       picker makes it wider: measured, it does not fit a 1440 screen); below that it takes its own
       full-width row under the title (order-last + w-full), so the primary actions never wrap away from
       the title. Below lg the question and the count share one line and the three answers fill the next.
       It uses the same h-9 / text-sm as every other control on the bar, with no box of its own. */
    <div className={cn('order-last flex w-full flex-wrap items-center gap-x-3 gap-y-2',
      sending
        ? 'min-[1600px]:order-none min-[1600px]:w-auto min-[1600px]:border-r min-[1600px]:border-border min-[1600px]:pr-4'
        : 'min-[1440px]:order-none min-[1440px]:w-auto min-[1440px]:border-r min-[1440px]:border-border min-[1440px]:pr-4')}>
      {/* 🔴 "On reply" WAS TOO SHORT TO CARRY THE SCOPE. With options reading "Run audit only" and
          "Audit + auto-send", the control looked like a global audit switch: Paul set it expecting
          it to govern the outreach QUEUE and then reasonably believed it was why outreach had
          stopped. It governs neither — the drip never reads this. The full question is rendered
          now, and the options are answers to it. */}
      <span className="whitespace-nowrap text-sm font-medium text-muted-foreground" title="What happens automatically when a business replies to your opener. This does NOT affect the outreach queue — queued leads are always audited and sent.">
        {FIRST_REPLY_MODE_QUESTION}{sending && !envOn ? ' ⚠' : ''}
      </span>
      {/* Exactly one lit segment, so the state cannot be half-read. */}
      <div className="order-last flex h-9 w-full items-stretch overflow-hidden rounded-md border border-input lg:order-none lg:w-auto">
        {FIRST_REPLY_MODES.map((m) => (
          <button
            key={m}
            type="button"
            disabled={saving || (sms && m === 'send')}
            onClick={() => pickMode(m)}
            title={sms && m === 'send' ? 'Audit and reply is WhatsApp only. A text reply can run the audit; it never sends an automatic message.' : FIRST_REPLY_MODE_HINTS[m]}
            className={`flex-1 whitespace-nowrap px-3 text-sm font-medium transition disabled:opacity-60 lg:flex-none ${
              mode === m
                ? (m === 'send' ? 'bg-destructive text-destructive-foreground' : 'bg-primary text-primary-foreground')
                : 'bg-transparent text-muted-foreground hover:text-foreground'
            } ${sms && m === 'send' ? 'cursor-not-allowed opacity-50' : ''}`}
          >
            {FIRST_REPLY_MODE_LABELS[m]}
          </button>
        ))}
      </div>
      {/* Audit-only mode's whole point: how many leads are measured and waiting for ME to send.
          Counts leads with a COMPLETED audit, never parked rows — see auditOnlyReadyCount. */}
      {mode === 'audit_only' && readyCount !== null && readyCount > 0 && (
        <span className="ml-auto whitespace-nowrap text-xs text-muted-foreground lg:order-last lg:ml-0" title="Leads whose audit auto-ran and has finished — send the warm template by hand">
          {readyCount} ready to send
        </span>
      )}
      {sms && (
        <span className="text-xs text-muted-foreground" data-testid="sms-reply-note">
          {sending ? 'On a text reply this runs the audit only — it never sends an automatic text.' : 'Audit and reply is WhatsApp only.'}
        </span>
      )}
      {sending && !sms && (
        <Select value={replyTemplate} onValueChange={pickTemplate}>
          <SelectTrigger className="order-last h-9 w-full lg:w-[160px]" aria-label="Template sent on a first reply"><SelectValue /></SelectTrigger>
          <SelectContent>
            {WHATSAPP_TEMPLATES.map((t) => (
              <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      )}
    </div>
  );
}
