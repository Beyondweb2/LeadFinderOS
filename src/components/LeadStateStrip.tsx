import { AlertTriangle, CalendarCheck, Globe, History } from 'lucide-react';
import { useLeadCrmRow } from '@/components/LeadCrmPanel';
import { LeadOwnerControl } from '@/components/LeadOwnerControl';
import { NextActionPill } from '@/components/NextActionPill';
import { useLeadActivity, useTeamDirectory } from '@/hooks/useSalesCrm';
import { lastLoggedContact } from '@/lib/salesCrm';
import { ago } from '@/components/salesDash/ui';
import { cn } from '@/lib/utils';

/* THE LEAD'S CURRENT STATE, AT THE TOP OF THE POPUP (UI cleanup pass, 2026-09-29).
   Paul: "after I save it, the result is not prominent enough — the control feels like it did nothing."
   So what a person RECORDED on the Work tab shows here, above the tabs, on every tab:
     · the next action (the one stored value — src/lib/nextActionView.ts), tap → the Work tab to edit;
     · who owns the lead (the admin reassigns here; a salesperson sees it);
     · the last logged contact and its outcome ("Call · Spoke to owner · 2h ago · Sam") — derived from
       the timeline, never stored, so a Wrong number or Not interested stays visible after reopening;
     · the two facts that change how the lead is sold: an agency runs the site, a call is booked.
   It reads the SAME queries as the Work and History tabs (lead-crm, the activity timeline), so a save
   there shows here at once. Nothing on this strip writes, except the admin's owner picker. */

const OUTCOME_TONE = {
  good: 'text-emerald-700 dark:text-emerald-300',
  bad: 'text-red-700 dark:text-red-300',
  neutral: 'text-foreground',
} as const;

export function LeadStateStrip({ leadId, onOpenWork }: { leadId: string; onOpenWork: () => void }) {
  const crm = useLeadCrmRow(leadId);
  const activity = useLeadActivity(leadId);
  const team = useTeamDirectory();
  const row = crm.data;
  const last = lastLoggedContact(activity.data);
  const callAt = row?.call_booked_at ? new Date(row.call_booked_at) : null;
  /* A booked call is worth showing from 12 hours before now onwards (a call this morning still needs
     its outcome logged); an older one is history, which the timeline keeps. */
  const callShown = callAt && Number.isFinite(callAt.getTime()) && callAt.getTime() >= Date.now() - 12 * 3600_000;
  const agency = row?.website_control === 'agency_controls';
  const chip = 'inline-flex min-w-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium';
  return (
    <div className="mt-2.5 space-y-1.5" data-testid="lead-state-strip">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <LeadOwnerControl leadId={leadId} />
        <NextActionPill lead={row} onClick={onOpenWork} />
        {callShown && (
          <span className={cn(chip, 'border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300')} title="Call / meeting booked (Work tab)">
            <CalendarCheck className="h-3 w-3" />Call booked · {callAt!.toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' })} UK
          </span>
        )}
        {agency && (
          <span className={cn(chip, 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300')} title={row?.website_control_note ? `An agency controls the website — ${row.website_control_note}` : 'An agency controls the website'}>
            <Globe className="h-3 w-3" />Agency runs the site{row?.website_control_note ? <span className="truncate font-normal">· {row.website_control_note}</span> : null}
          </span>
        )}
      </div>
      {last && (
        <p className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground" data-testid="last-contact">
          {last.tone === 'bad' ? <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-red-500" /> : <History className="h-3.5 w-3.5 shrink-0" />}
          <span className="min-w-0 truncate" title={last.note ?? undefined}>
            Last contact: {last.channelLabel ? `${last.channelLabel} · ` : ''}
            <span className={cn('font-semibold', OUTCOME_TONE[last.tone])}>{last.outcomeLabel}</span>
            {' · '}{ago(last.at)}{last.actorId ? ` · ${team.byId.get(last.actorId)?.display_name ?? 'someone'}` : ''}
            {last.note ? ` · “${last.note}”` : ''}
          </span>
        </p>
      )}
    </div>
  );
}
