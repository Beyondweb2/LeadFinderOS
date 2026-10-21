import { useEffect, useState } from 'react';
import { Switch } from '@/components/ui/switch';
import { useToast } from '@/hooks/use-toast';
import { invokeEdge, edgeErrorMessage } from '@/lib/edgeInvoke';

/* "SENDS BY ITSELF" — LEVEL 2's per-reply-type switches + the daily limit (fn ai-reply-drafts set_auto_send, admin only; all
   off when shipped). Moved out of the Draft outcomes popover into Inbox Settings, under the Auto mode (2026-10-21, Paul).
   The rule that decides each send is src/lib/aiAutoSend.ts; only the Auto mode lets any of them send. */
export interface AutoSendSettings { intents: string[]; daily_cap: number; max_daily_cap: number; choices: Array<{ key: string; label: string }> }

export function AutoSendSwitches({ initial }: { initial: AutoSendSettings }) {
  const { toast } = useToast();
  const [settings, setSettings] = useState<AutoSendSettings>(initial);
  const [capText, setCapText] = useState(String(initial.daily_cap));
  const [saving, setSaving] = useState(false);
  useEffect(() => { setSettings(initial); setCapText(String(initial.daily_cap)); }, [initial]);

  const save = async (patch: { intents?: string[]; daily_cap?: number }) => {
    setSaving(true);
    try {
      const r = await invokeEdge<{ ok: true; auto_send: AutoSendSettings }>('ai-reply-drafts', { action: 'set_auto_send', ...patch });
      setSettings(r.auto_send);
      setCapText(String(r.auto_send.daily_cap));
    } catch (e) {
      toast({ title: "Couldn't save automatic sending", description: edgeErrorMessage(e), variant: 'destructive' });
      setCapText(String(settings.daily_cap));
    } finally {
      setSaving(false);
    }
  };
  const flip = (key: string, on: boolean) => {
    const next = on ? [...settings.intents, key] : settings.intents.filter((k) => k !== key);
    void save({ intents: next });
  };
  const saveCap = () => {
    const n = Number(capText);
    if (!Number.isInteger(n) || n === settings.daily_cap) { setCapText(String(settings.daily_cap)); return; }
    void save({ daily_cap: n });
  };

  return (
    <div className="space-y-2 rounded-md border border-destructive/40 bg-destructive/5 p-3" data-testid="ai-auto-send-switches">
      <p className="text-sm font-semibold">Sends by itself</p>
      <p className="text-xs leading-snug text-muted-foreground">
        Only the reply types switched on here are sent automatically, 3 to 8 minutes later and inside the lead&apos;s send hours, once the
        audit and website check are complete. Everything else stays a draft for you to approve. Never sent by itself: price, guarantee,
        pay-on-results or proof answers, Needs you, stops, complaints, not interested, clients, non-UK numbers, or a conversation someone
        typed in during the last 10 minutes.
      </p>
      <label className="flex items-center gap-2 text-xs">
        Daily limit
        <input type="number" min={0} max={settings.max_daily_cap} value={capText} disabled={saving}
          onChange={(e) => setCapText(e.target.value)} onBlur={saveCap} onKeyDown={(e) => { if (e.key === 'Enter') saveCap(); }}
          className="h-7 w-16 rounded-md border border-input bg-background px-2 text-xs tabular-nums" data-testid="ai-auto-send-cap" />
        <span className="text-muted-foreground">automatic replies a day</span>
      </label>
      <ul className="space-y-1">
        {settings.choices.map((c) => (
          <li key={c.key} className="flex items-center justify-between gap-2 text-xs">
            <span title={c.key}>{c.label}</span>
            <Switch checked={settings.intents.includes(c.key)} disabled={saving} onCheckedChange={(v) => flip(c.key, v)}
              aria-label={`Send "${c.label}" automatically`} data-testid={`ai-auto-send-${c.key}`} />
          </li>
        ))}
      </ul>
    </div>
  );
}
