/* "Check before calling" — what the salespeople's bulk pre-call checks did and cost (admin, fix/07).
   Read through fn sales-prospect-check admin_overview (requireAdmin). Spend: the ESTIMATE booked per fresh
   check, and the real Apify cost of those runs (ai_audit_runs.actor_cost_usd) once they have finished.
   Reused results cost nothing and are counted apart. No provider key or secret is ever read here. */
import { useQuery } from '@tanstack/react-query';
import { Loader2, SearchCheck } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { edgeErrorMessage, invokeEdge } from '@/lib/edgeInvoke';

interface Counts { total: number; queued: number; running: number; done: number; reused: number; failed: number; skipped: number }
interface Overview {
  since: string;
  batches: Array<{ id: string; actor_name: string | null; created_at: string; status: string; refresh: boolean; counts: Counts; fresh: number; est_usd: number; actual_usd: number | null }>;
  reps: Array<{ actor_user_id: string; actor_name: string | null; batches: number; leads: number; fresh: number; reused: number; failed: number; skipped: number; est_usd: number; actual_usd: number }>;
  problems: Array<{ at: string; actor_name: string | null; business_name: string | null; status: string; reason: string | null; message: string | null }>;
}

const usd = (n: number | null | undefined) => (typeof n === 'number' && Number.isFinite(n) ? `$${n.toFixed(2)}` : '—');
const when = (iso: string) => { try { return new Date(iso).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' }); } catch { return iso; } };

export function SalesChecksAdminCard() {
  const q = useQuery({
    queryKey: ['sales-checks-admin'],
    queryFn: async () => (await invokeEdge<{ overview: Overview }>('sales-prospect-check', { action: 'admin_overview', days: 7 })).overview,
    staleTime: 30_000,
    refetchOnWindowFocus: false,
  });
  const o = q.data;
  return (
    <Card data-testid="sales-checks-admin">
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base"><SearchCheck className="h-4 w-4" />Check before calling — salespeople, last 7 days</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3 text-sm">
        <p className="text-xs text-muted-foreground">
          Every batch a salesperson ran. "Fresh" checks are paid (one per lead, estimate booked on the guard row);
          reused results are free. Actual cost appears once a run has finished. The daily allowance per salesperson is the
          "pre-call checks" line in the thresholds above.
        </p>
        {q.isLoading && <p className="flex items-center gap-2 text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading…</p>}
        {q.error && <p className="text-destructive">{edgeErrorMessage(q.error, 'Couldn\'t load the checks')}</p>}
        {o && o.reps.length === 0 && <p className="text-muted-foreground">No salesperson has run a check in the last 7 days.</p>}
        {o && o.reps.length > 0 && (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Salesperson</TableHead><TableHead className="text-right">Batches</TableHead><TableHead className="text-right">Leads</TableHead>
                <TableHead className="text-right">Fresh</TableHead><TableHead className="text-right">Reused</TableHead><TableHead className="text-right">Failed</TableHead>
                <TableHead className="text-right">Skipped</TableHead><TableHead className="text-right">Estimated</TableHead><TableHead className="text-right">Actual</TableHead>
              </TableRow></TableHeader>
              <TableBody>{o.reps.map((r) => (
                <TableRow key={r.actor_user_id}>
                  <TableCell>{r.actor_name ?? 'Unnamed'}</TableCell><TableCell className="text-right">{r.batches}</TableCell>
                  <TableCell className="text-right">{r.leads}</TableCell><TableCell className="text-right">{r.fresh}</TableCell>
                  <TableCell className="text-right">{r.reused}</TableCell><TableCell className="text-right">{r.failed}</TableCell>
                  <TableCell className="text-right">{r.skipped}</TableCell><TableCell className="text-right">{usd(r.est_usd)}</TableCell>
                  <TableCell className="text-right">{usd(r.actual_usd)}</TableCell>
                </TableRow>
              ))}</TableBody>
            </Table>
          </div>
        )}
        {o && o.batches.length > 0 && (
          <details>
            <summary className="cursor-pointer text-xs text-muted-foreground">Batches ({o.batches.length})</summary>
            <div className="mt-2 overflow-x-auto">
              <Table>
                <TableHeader><TableRow>
                  <TableHead>When</TableHead><TableHead>Salesperson</TableHead><TableHead>Status</TableHead><TableHead className="text-right">Leads</TableHead>
                  <TableHead className="text-right">Ready</TableHead><TableHead className="text-right">Fresh</TableHead><TableHead className="text-right">Failed / skipped</TableHead>
                  <TableHead className="text-right">Estimated</TableHead><TableHead className="text-right">Actual</TableHead>
                </TableRow></TableHeader>
                <TableBody>{o.batches.map((b) => (
                  <TableRow key={b.id}>
                    <TableCell className="whitespace-nowrap">{when(b.created_at)}{b.refresh ? ' · re-check' : ''}</TableCell>
                    <TableCell>{b.actor_name ?? 'Unnamed'}</TableCell><TableCell>{b.status}</TableCell>
                    <TableCell className="text-right">{b.counts.total}</TableCell><TableCell className="text-right">{b.counts.done + b.counts.reused}</TableCell>
                    <TableCell className="text-right">{b.fresh}</TableCell><TableCell className="text-right">{b.counts.failed} / {b.counts.skipped}</TableCell>
                    <TableCell className="text-right">{usd(b.est_usd)}</TableCell><TableCell className="text-right">{usd(b.actual_usd)}</TableCell>
                  </TableRow>
                ))}</TableBody>
              </Table>
            </div>
          </details>
        )}
        {o && o.problems.length > 0 && (
          <details>
            <summary className="cursor-pointer text-xs text-muted-foreground">Failed and skipped leads ({o.problems.length})</summary>
            <ul className="mt-2 space-y-1 text-xs">
              {o.problems.map((p, i) => (
                <li key={i} className="break-words"><span className="text-muted-foreground">{when(p.at)} · {p.actor_name ?? 'Unnamed'} · </span>
                  <span className="font-medium">{p.business_name ?? 'a lead'}</span> — {p.status}: {p.message ?? p.reason}</li>
              ))}
            </ul>
          </details>
        )}
      </CardContent>
    </Card>
  );
}
