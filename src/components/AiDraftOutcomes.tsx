import { useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Switch } from '@/components/ui/switch';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { invokeEdge, edgeErrorMessage } from '@/lib/edgeInvoke';
import { summariseDraftOutcomes, summariseAutoSent, intentLabel, pct, type AutoSentRow, type AutoSentSummary, type DraftOutcomeRow, type DraftOutcomeSummary } from '@/lib/draftOutcomes';

/* AI DRAFT OUTCOMES (2026-10-21, Paul) — a small admin-only readout beside "AI handles replies": what share of AI drafts
   went out unchanged, and which intents get edited most. Read on open (never polled) from ai_draft_outcome_summary(),
   which answers nothing to a non-admin. Rules: src/lib/draftOutcomes.ts.
   LEVEL 2 (same day): the automatic replies sent today and per reply type (ai_auto_send_summary), and the per-type
   "Sends by itself" switches + daily limit (fn ai-reply-drafts set_auto_send, admin only; all off when shipped). The rule
   that decides each send is src/lib/aiAutoSend.ts; "AI handles replies" stays the master kill switch. */
const DAYS = 90;

interface AutoSendSettings { intents: string[]; daily_cap: number; max_daily_cap: number; choices: Array<{ key: string; label: string }> }

export function AiDraftOutcomes() {
  const { toast } = useToast();
  const [data, setData] = useState<DraftOutcomeSummary | null>(null);
  const [auto, setAuto] = useState<AutoSentSummary | null>(null);
  const [settings, setSettings] = useState<AutoSendSettings | null>(null);
  const [capText, setCapText] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const rpc = supabase.rpc as unknown as (fn: string, a: unknown) => Promise<{ data: unknown; error: { message: string } | null }>;
  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [{ data: rows, error: e }, { data: autoRows, error: ae }, s] = await Promise.all([
        rpc('ai_draft_outcome_summary', { p_days: DAYS }),
        rpc('ai_auto_send_summary', { p_days: DAYS }),
        invokeEdge<{ ok: true; auto_send?: AutoSendSettings }>('ai-reply-drafts', { action: 'settings' }).catch(() => null),
      ]);
      if (e) throw new Error(e.message);
      setData(summariseDraftOutcomes((rows ?? []) as DraftOutcomeRow[]));
      setAuto(ae ? null : summariseAutoSent((autoRows ?? []) as AutoSentRow[]));
      if (s?.auto_send) { setSettings(s.auto_send); setCapText(String(s.auto_send.daily_cap)); }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load draft outcomes.');
    } finally {
      setLoading(false);
    }
  };

  const save = async (patch: { intents?: string[]; daily_cap?: number }) => {
    if (!settings) return;
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
    if (!settings) return;
    const next = on ? [...settings.intents, key] : settings.intents.filter((k) => k !== key);
    void save({ intents: next });
  };
  const saveCap = () => {
    if (!settings) return;
    const n = Number(capText);
    if (!Number.isInteger(n) || n === settings.daily_cap) { setCapText(String(settings.daily_cap)); return; }
    void save({ daily_cap: n });
  };

  return (
    <Popover onOpenChange={(open) => { if (open) void load(); }}>
      <PopoverTrigger asChild>
        <button type="button" className="inline-flex h-9 shrink-0 items-center gap-1.5 rounded-md px-2 text-sm font-medium text-muted-foreground hover:bg-muted hover:text-foreground"
          title="What happened to each AI draft" data-testid="ai-draft-outcomes">
          <BarChart3 className="h-4 w-4" />
          Draft outcomes
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="max-h-[80vh] w-[min(92vw,30rem)] overflow-y-auto p-4">
        <div className="mb-2 flex items-baseline justify-between gap-2">
          <p className="text-sm font-semibold">AI draft outcomes</p>
          <p className="text-xs text-muted-foreground">last {DAYS} days</p>
        </div>
        {loading && !data && <p className="text-sm text-muted-foreground">Loading…</p>}
        {error && <p className="text-sm text-destructive">{error} <button type="button" className="underline" onClick={() => void load()}>Retry</button></p>}
        {data && !error && (data.intents.length === 0 ? (
          <p className="text-sm text-muted-foreground">No AI drafts recorded yet.</p>
        ) : (
          <>
            <p className="text-sm" data-testid="ai-draft-unchanged-share">
              <span className="text-lg font-bold">{pct(data.unchangedShare)}</span> sent unchanged
              <span className="text-muted-foreground"> · {data.unchanged} of {data.sent} sent drafts</span>
            </p>
            <p className="mt-0.5 text-xs text-muted-foreground">
              {data.edited} edited · {data.regenerated} regenerated · {data.discarded} discarded{data.other ? ` · ${data.other} replaced or not used` : ''}
            </p>
            <table className="mt-3 w-full text-xs">
              <thead className="text-left text-muted-foreground">
                <tr><th className="pb-1 font-medium">Intent (most edited first)</th><th className="pb-1 text-right font-medium">Sent</th><th className="pb-1 text-right font-medium">Edited</th><th className="pb-1 text-right font-medium">Avg words</th><th className="pb-1 text-right font-medium">Regen</th><th className="pb-1 text-right font-medium">Disc.</th></tr>
              </thead>
              <tbody>
                {data.intents.map((i) => (
                  <tr key={i.intent} className="border-t border-border/60">
                    <td className="py-1 pr-2" title={i.intent}>{i.label}</td>
                    <td className="py-1 text-right tabular-nums">{i.sent}</td>
                    <td className="py-1 text-right tabular-nums">{i.edited}{i.sent ? <span className="text-muted-foreground"> ({pct(i.editedShare)})</span> : null}</td>
                    <td className="py-1 text-right tabular-nums">{i.avgWordsChanged == null ? '—' : i.avgWordsChanged}</td>
                    <td className="py-1 text-right tabular-nums">{i.regenerated}</td>
                    <td className="py-1 text-right tabular-nums">{i.discarded}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-[11px] leading-snug text-muted-foreground">Counted per draft version. "Avg words" = words added, removed or replaced in edited drafts. Regenerations before 21 Oct have no text kept.</p>
          </>
        ))}

        {/* LEVEL 2 — automatic replies: the count, then the switches. */}
        {auto && !error && (
          <div className="mt-3 border-t border-border/60 pt-3" data-testid="ai-auto-sent">
            <p className="text-sm"><span className="text-lg font-bold">{auto.today}</span> sent by AI today
              <span className="text-muted-foreground"> · {auto.inPeriod} in {DAYS} days{auto.waiting ? ` · ${auto.waiting} waiting` : ''}</span></p>
            {auto.intents.length > 0 && (
              <p className="mt-0.5 text-xs text-muted-foreground">
                {auto.intents.map((i) => `${intentLabel(i.intent)}: ${i.today} today, ${i.inPeriod} in ${DAYS} days`).join(' · ')}
              </p>
            )}
          </div>
        )}
        {settings && !error && (
          <div className="mt-3 border-t border-border/60 pt-3" data-testid="ai-auto-send-switches">
            <p className="text-sm font-semibold">Sends by itself</p>
            <p className="mb-2 text-[11px] leading-snug text-muted-foreground">
              Only the reply types switched on here are sent automatically, 3 to 8 minutes later and inside the lead's send hours.
              Everything else stays a draft to approve. Never sent by itself: price, guarantee or proof answers, Needs you, stops,
              complaints, clients, non-UK numbers, or a conversation someone typed in during the last 10 minutes.
              Turning off AI handles replies stops all of it, including replies already waiting.
            </p>
            <label className="mb-2 flex items-center gap-2 text-xs">
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
        )}
      </PopoverContent>
    </Popover>
  );
}
