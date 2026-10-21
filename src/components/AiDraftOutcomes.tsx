import { useState } from 'react';
import { BarChart3 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { supabase } from '@/integrations/supabase/client';
import { summariseDraftOutcomes, summariseAutoSent, intentLabel, pct, type AutoSentRow, type AutoSentSummary, type DraftOutcomeRow, type DraftOutcomeSummary } from '@/lib/draftOutcomes';

/* AI DRAFT OUTCOMES (2026-10-21, Paul) — a small admin-only readout beside "AI handles replies": what share of AI drafts
   went out unchanged, and which intents get edited most. Read on open (never polled) from ai_draft_outcome_summary(),
   which answers nothing to a non-admin. Rules: src/lib/draftOutcomes.ts.
   LEVEL 2 (same day): the automatic replies sent today and per reply type (ai_auto_send_summary). The per-type "Sends by
   itself" switches moved to Inbox Settings under the Auto mode (AutoSendSwitches, 2026-10-21). */
const DAYS = 90;

export function AiDraftOutcomes() {
  const [data, setData] = useState<DraftOutcomeSummary | null>(null);
  const [auto, setAuto] = useState<AutoSentSummary | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const rpc = supabase.rpc as unknown as (fn: string, a: unknown) => Promise<{ data: unknown; error: { message: string } | null }>;
  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const [{ data: rows, error: e }, { data: autoRows, error: ae }] = await Promise.all([
        rpc('ai_draft_outcome_summary', { p_days: DAYS }),
        rpc('ai_auto_send_summary', { p_days: DAYS }),
      ]);
      if (e) throw new Error(e.message);
      setData(summariseDraftOutcomes((rows ?? []) as DraftOutcomeRow[]));
      setAuto(ae ? null : summariseAutoSent((autoRows ?? []) as AutoSentRow[]));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load draft outcomes.');
    } finally {
      setLoading(false);
    }
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

        {/* LEVEL 2 — automatic replies sent (recorded as auto_sent). */}
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
      </PopoverContent>
    </Popover>
  );
}
