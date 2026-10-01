import { useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ThumbsDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Panel, Empty, TONE } from '@/components/salesDash/ui';
import type { AdminOverviewResponse } from '@/hooks/useAdminOverview';
import type { LostReasonLead } from '@/lib/adminMetrics';
import { LOST_REASON_LIST_MAX } from '@/lib/adminMetrics';
import { LOST_REASON_UNRECORDED } from '@/lib/lostReason';
import { outreachLeadLink } from '@/lib/salesLinks';

/* ══ WHY PROSPECTS SAY NO (2026-10-01) ═════════════════════════════════════════════════════════════
   The recorded reasons for the leads that said no in the dashboard's period (adminMetrics
   foldLostReasons), counts and share of the leads WITH a reason; "Reason not recorded" stands apart so
   it shows whether reasons are being logged. A row opens to the leads behind it (with the note), each a
   link to the lead. Presentational: nothing here is computed beyond the widths of the bars. */

type O = AdminOverviewResponse;
const num = (n: number) => n.toLocaleString('en-GB');

function LeadList({ leads, total }: { leads: LostReasonLead[]; total: number }) {
  return (
    <ul className="space-y-1 border-t border-border/60 px-3 py-2 text-xs">
      {leads.map((l) => (
        <li key={l.id} className="min-w-0">
          <Link to={outreachLeadLink(l.id)} className="font-medium text-primary hover:underline">{l.business}</Link>
          <span className="text-muted-foreground"> · {l.who}</span>
          {l.note && <span className="block text-muted-foreground">“{l.note}”</span>}
        </li>
      ))}
      {total > leads.length && <li className="text-muted-foreground">and {num(total - leads.length)} more (the newest {LOST_REASON_LIST_MAX} are listed)</li>}
    </ul>
  );
}

export function LostReasonsPanel({ o }: { o: O }) {
  const lr = o.lostReasons;
  const [open, setOpen] = useState<string | null>(null);
  if (!lr) return null; // an older admin-overview build: the section waits for the deploy rather than claiming zero
  const top = lr.rows[0]?.count ?? 0;
  const toggle = (k: string) => setOpen((v) => (v === k ? null : k));
  return (
    <Panel collapseKey="admin.cc.lost-reasons" title="Why prospects say no" icon={ThumbsDown} tone="red" defaultOpen={false}
      hint={`${o.period.label} · leads now Not interested that said no in this period, by the reason recorded. Percentages are of the ${num(lr.recorded)} with a reason.`}
      summary={lr.saidNo ? `${lr.rows.slice(0, 3).map((r) => `${r.label} ${num(r.count)}`).join(' · ') || 'No reasons yet'} · ${num(lr.unrecorded)} not recorded` : 'Nobody said no in this period'}>
      {lr.saidNo === 0 ? <Empty icon={ThumbsDown}>No lead was marked Not interested in this period.</Empty> : (
        <div className="space-y-3">
          {lr.rows.length > 0 ? (
            <ul className="divide-y divide-border/60 overflow-hidden rounded-xl border border-border/60" data-testid="lost-reason-rows">
              {lr.rows.map((r) => (
                <li key={r.key}>
                  <button type="button" onClick={() => toggle(r.key)} aria-expanded={open === r.key} data-reason={r.key}
                    className="grid w-full grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-3 py-2 text-left text-sm hover:bg-muted/40 sm:grid-cols-[17rem_minmax(0,1fr)_6.5rem]">
                    <span className="flex min-w-0 items-center gap-1.5"><ChevronDown className={cn('h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform', open === r.key && 'rotate-180')} /><span className="truncate">{r.label}</span></span>
                    <span className="col-span-2 row-start-2 h-2 overflow-hidden rounded bg-muted/60 sm:col-span-1 sm:row-start-auto">
                      <span className={cn('block h-full rounded', TONE.red.bar)} style={{ width: `${top ? Math.max(3, (r.count / top) * 100) : 0}%`, opacity: 0.6 }} />
                    </span>
                    <span className="text-right tabular-nums"><span className="font-semibold">{num(r.count)}</span><span className="text-muted-foreground"> · {r.pct}%</span></span>
                  </button>
                  {open === r.key && <LeadList leads={r.leads} total={r.count} />}
                </li>
              ))}
            </ul>
          ) : <Empty>No reason has been recorded for these leads yet.</Empty>}
          {lr.unrecorded > 0 && (
            <div className="overflow-hidden rounded-xl border border-dashed border-border/70" data-testid="lost-reason-unrecorded">
              <button type="button" onClick={() => toggle('__unrecorded')} aria-expanded={open === '__unrecorded'}
                className="flex w-full items-center justify-between gap-3 px-3 py-2 text-left text-sm hover:bg-muted/40">
                <span className="flex min-w-0 items-center gap-1.5 text-muted-foreground"><ChevronDown className={cn('h-3.5 w-3.5 shrink-0 transition-transform', open === '__unrecorded' && 'rotate-180')} />{LOST_REASON_UNRECORDED}</span>
                <span className="tabular-nums"><span className="font-semibold">{num(lr.unrecorded)}</span><span className="text-muted-foreground"> of {num(lr.saidNo)} who said no</span></span>
              </button>
              {open === '__unrecorded' && <LeadList leads={lr.unrecordedLeads} total={lr.unrecorded} />}
            </div>
          )}
        </div>
      )}
    </Panel>
  );
}
