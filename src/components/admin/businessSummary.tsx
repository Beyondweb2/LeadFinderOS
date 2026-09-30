import { useState } from 'react';
import { Loader2, RefreshCw, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Panel, Empty, ago } from '@/components/salesDash/ui';
import type { AdminOverviewResponse } from '@/hooks/useAdminOverview';
import { SUMMARY_MIN_INTERVAL_MINUTES } from '@/lib/businessSummary';

/* ══ THE AI BUSINESS SUMMARY (release 6) ═══════════════════════════════════════════════════════════
   Written from the dashboard's own numbers; every number in it was checked against them before it
   was stored as 'ok'. A rejected draft is never shown — the page shows the fixed checks instead. */

type O = AdminOverviewResponse;

export function BusinessSummaryPanel({ o, onRefresh }: { o: O; onRefresh: () => Promise<string | null> }) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const s = o.latestSummary;
  const fresh = s ? (Date.now() - Date.parse(s.created_at)) / 60_000 < SUMMARY_MIN_INTERVAL_MINUTES : false;
  const refresh = async () => { setBusy(true); setNote(null); try { setNote(await onRefresh()); } finally { setBusy(false); } };
  return (
    <Panel collapseKey="admin.cc.summary" title="This week in plain English" icon={Sparkles} tone="purple"
      hint="An AI briefing written only from the numbers on this page. Every number in it was checked against them; it changes nothing."
      summary={s ? `${s.period_label} · written ${ago(s.created_at)}` : 'No briefing yet'}
      action={<Button variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={() => void refresh()} disabled={busy || fresh} title={fresh ? `One refresh an hour` : 'Write a briefing for the last 7 days'}>
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}{busy ? 'Writing…' : 'Write one now'}
      </Button>}>
      {note && <p className="mb-2 text-xs text-muted-foreground">{note}</p>}
      {!s ? <Empty>No briefing yet. One is written every Monday morning for the week before — or press “Write one now” for the last 7 days.</Empty> : (
        <div className="space-y-3">
          {s.status === 'ok' && s.summary ? <p className="text-sm leading-relaxed">{s.summary}</p> : (
            <p className="rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
              {s.status === 'rejected' ? `The AI's draft used a figure that is not in the data (${s.reason?.replace('numbers not in the data: ', '') ?? 'unknown'}), so it is not shown. The checks below come straight from the numbers.` : `The briefing could not be written (${s.reason ?? 'unknown error'}). The checks below come straight from the numbers.`}
            </p>
          )}
          {!!s.look_at?.length && (
            <div>
              <p className="mb-1 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">What I would look at</p>
              <ul className="list-disc space-y-1 pl-5 text-sm">{s.look_at.map((x) => <li key={x}>{x}</li>)}</ul>
            </div>
          )}
          <p className="text-[11px] text-muted-foreground">{s.kind === 'weekly' ? 'Last full week (Monday–Sunday, UK time) against the week before' : 'Last 7 days against the 7 before'} · {s.period_from} → {s.period_to}{s.model ? ` · ${s.model}` : ''}</p>
        </div>
      )}
    </Panel>
  );
}
