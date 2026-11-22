import { useQuery } from '@tanstack/react-query';
import { BarChart3, Star, X } from 'lucide-react';
import { invokeEdge } from '@/lib/edgeInvoke';
import { ErrorState, LoadState, SubSection, ToneChip } from '@/components/operator/ui';
import { Button } from '@/components/ui/button';
import { templateLabel } from '@/types/outreach';
import { pct, type TemplatePerfRow } from '@/lib/campaignPerformance';

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   CAMPAIGN PERFORMANCE (Paul, 2026-11-22; docs/campaign-performance.md). One row per template sent in the
   campaign: Sent, Read %, Real reply % (raw beside it), Link/report open %, Interested. The best performer is
   highlighted; a template with fewer than the minimum sends is greyed and never judged. Numbers come folded
   from the campaign-performance edge function (role-checked there): counts only, no message text.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

interface PerfResponse {
  ok: boolean;
  error?: string;
  campaign?: { id: string; name: string };
  leads?: number;
  min_sends?: number;
  rows?: TemplatePerfRow[];
  best?: string | null;
  unattributed_opens?: number;
  bot_hits?: number;
}

const fmt = (n: number, d: number) => { const p = pct(n, d); return p == null ? '—' : `${p}%`; };

export function CampaignPerformanceTable({ campaignId, name, onClose }: { campaignId: string; name: string; onClose: () => void }) {
  const q = useQuery({
    queryKey: ['campaign-performance', campaignId],
    staleTime: 5 * 60_000,
    queryFn: () => invokeEdge<PerfResponse>('campaign-performance', { campaign_id: campaignId }),
  });
  const d = q.data;
  const min = d?.min_sends ?? 20;
  const rows = d?.rows ?? [];

  return <SubSection icon={BarChart3} tone="blue" title={`Performance · ${name}`} testId="campaign-performance"
    hint="Which message works best. Counted per lead; a reply is credited to the last message sent before it."
    action={<Button size="sm" variant="ghost" onClick={onClose} data-testid="campaign-performance-close"><X className="mr-1 h-3.5 w-3.5" />Close</Button>}>
    {q.isLoading && <LoadState label="Working out the numbers…" compact />}
    {q.isError && <ErrorState title="Could not load the numbers." onRetry={() => void q.refetch()} />}
    {d && !d.ok && <ErrorState title={d.error === 'not_found' ? 'This campaign is not available.' : 'Could not load the numbers.'} onRetry={() => void q.refetch()} />}
    {d?.ok && rows.length === 0 && <p className="text-sm text-muted-foreground" data-testid="campaign-performance-empty">No messages sent in this campaign yet.</p>}
    {d?.ok && rows.length > 0 && <div className="space-y-2">
      <div className="overflow-x-auto rounded-md border">
        <table className="w-full min-w-[640px] text-sm" data-testid="campaign-performance-table">
          <thead className="bg-muted/50 text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2 text-left font-medium">Message</th>
              <th className="px-3 py-2 text-right font-medium">Sent</th>
              <th className="px-3 py-2 text-right font-medium">Read</th>
              <th className="px-3 py-2 text-right font-medium" title="Not an auto-reply: no auto-reply wording and not within a minute of our message">Real reply</th>
              <th className="px-3 py-2 text-right font-medium" title="Every reply, auto-replies included">Raw reply</th>
              <th className="px-3 py-2 text-right font-medium" title="A person opened the report or clicked our link (link previews left out)">Link / report open</th>
              <th className="px-3 py-2 text-right font-medium">Interested</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const best = d.best === r.template;
              return <tr key={r.template} data-testid="campaign-performance-row" data-template={r.template} data-best={best ? '1' : undefined}
                className={`border-t ${best ? 'bg-emerald-50 dark:bg-emerald-950/30' : ''} ${r.judged ? '' : 'text-muted-foreground opacity-60'}`}>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-medium">{templateLabel(r.template)}</span>
                    {best && <ToneChip tone="green" icon={Star} testId="campaign-performance-best">Best</ToneChip>}
                    {!r.judged && <span className="text-[11px]" data-testid="campaign-performance-too-few">too few to judge ({r.sent}/{min})</span>}
                  </div>
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{r.sent}</td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(r.read, r.sent)}</td>
                <td className="px-3 py-2 text-right font-semibold tabular-nums">{fmt(r.repliedReal, r.sent)} <span className="text-xs font-normal text-muted-foreground">({r.repliedReal})</span></td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(r.repliedRaw, r.sent)} <span className="text-xs text-muted-foreground">({r.repliedRaw})</span></td>
                <td className="px-3 py-2 text-right tabular-nums">{fmt(r.opened, r.sent)} <span className="text-xs text-muted-foreground">({r.opened})</span></td>
                <td className="px-3 py-2 text-right tabular-nums">{r.interested}</td>
              </tr>;
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-muted-foreground" data-testid="campaign-performance-notes">
        Only messages with {min}+ sends are judged; greyed rows have too few. Read needs read receipts, so it is a floor.
        Every report open and link click is logged from 22 Nov 2026 (before that, only each report’s first open){d.bot_hits ? `; ${d.bot_hits} link previews left out` : ''}.
        {d.best ? '' : ' No message has enough sends and replies to call a best yet.'}
      </p>
    </div>}
  </SubSection>;
}
