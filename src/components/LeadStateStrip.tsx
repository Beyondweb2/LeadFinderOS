import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Globe, PhoneOff } from 'lucide-react';
import { useLeadCrmRow, useWrongNumber, wrongNumberKey } from '@/components/LeadCrmPanel';
import { useSubscription } from '@/hooks/useSubscription';
import { useToast } from '@/hooks/use-toast';
import { leadPermissions } from '@/lib/access';
import { leadRpc } from '@/lib/leadRpc';
import { notifyLeadChanged } from '@/lib/leadSync';
import { refusalText } from '@/lib/salesCrm';
import { LeadOwnerControl } from '@/components/LeadOwnerControl';
import { NextActionPill } from '@/components/NextActionPill';
import { useTeamDirectory } from '@/hooks/useSalesCrm';
import { useLeadSalesState } from '@/hooks/useLeadSalesState';
import { LastContactLine } from '@/components/SalesStatePill';
import { cn } from '@/lib/utils';

/* THE LEAD'S CURRENT STATE, AT THE TOP OF THE POPUP (UI cleanup pass, 2026-09-29).
   Paul: "after I save it, the result is not prominent enough — the control feels like it did nothing."
   So what a person RECORDED on the Work tab shows here, above the tabs, on every tab:
     · the next action (the one stored value — src/lib/nextActionView.ts), tap → the Work tab to edit;
     · who owns the lead (the admin reassigns here; a salesperson sees it);
     · the last contact and its outcome ("Call · Spoke to owner · 2h ago · Sam", or "WhatsApp · Sent")
       — derived (leadState lastContactOf), never stored, so it stays visible after reopening;
     · the facts that change how the lead is sold: an agency runs the site, the number is wrong.
   The booked meeting is part of the sales state now ("Meeting booked · Thu 2 Oct 14:30", the pill in
   the header — lead state audit, 2026-09-30), so it is not drawn twice here.
   It reads the SAME queries as the Work and History tabs (lead-crm, the activity timeline), so a save
   there shows here at once. Nothing on this strip writes, except the admin's owner picker. */

export function LeadStateStrip({ leadId, onOpenWork }: { leadId: string; onOpenWork: () => void }) {
  const crm = useLeadCrmRow(leadId);
  const team = useTeamDirectory();
  const row = crm.data;
  const { lastContact: last } = useLeadSalesState(leadId);
  const agency = row?.website_control === 'agency_controls';
  /* WRONG NUMBER (2026-09-29): the number's canonical suppression — no templates, queue or automated
     WhatsApp. The admin (assignOwner = the admin's own lead powers) can clear a mark made in error. */
  const wrong = useWrongNumber(leadId);
  const { role } = useSubscription();
  const canClear = leadPermissions(role).assignOwner;
  const qc = useQueryClient();
  const { toast } = useToast();
  const [clearing, setClearing] = useState(false);
  const clearWrong = async () => {
    if (!window.confirm('Clear Wrong number? Templates, the queue and automated WhatsApp can reach this number again.')) return;
    setClearing(true);
    const r = await leadRpc('lead_clear_wrong_number', { _lead_id: leadId });
    setClearing(false);
    if (!r.ok) { toast({ title: 'Not cleared', description: refusalText(r.error), variant: 'destructive' }); return; }
    toast({ title: 'Wrong number cleared', description: r.still_suppressed ? 'The number is still held back for another reason (archived, not interested or a decline).' : 'Messaging is available again.' });
    void qc.invalidateQueries({ queryKey: wrongNumberKey(leadId) });
    notifyLeadChanged(leadId);
  };
  const chip = 'inline-flex min-w-0 items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium';
  return (
    <div className="mt-2.5 space-y-1.5" data-testid="lead-state-strip">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <LeadOwnerControl leadId={leadId} />
        <NextActionPill lead={row} onClick={onOpenWork} />
        {wrong.data?.wrong && (
          <span className={cn(chip, 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300')} data-testid="wrong-number-pill" title="Marked Wrong number: no templates, queue or automated WhatsApp go to this number. History is kept.">
            <PhoneOff className="h-3 w-3" />Wrong number · no WhatsApp outreach
            {canClear && <button type="button" onClick={() => void clearWrong()} disabled={clearing} className="ml-1 font-semibold underline underline-offset-2 hover:no-underline" data-testid="clear-wrong-number">{clearing ? 'Clearing…' : 'Clear'}</button>}
          </span>
        )}
        {agency && (
          <span className={cn(chip, 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300')} title={row?.website_control_note ? `An agency controls the website — ${row.website_control_note}` : 'An agency controls the website'}>
            <Globe className="h-3 w-3" />Agency runs the site{row?.website_control_note ? <span className="truncate font-normal">· {row.website_control_note}</span> : null}
          </span>
        )}
      </div>
      <p className="flex min-w-0 items-center"><LastContactLine v={last} actorName={last?.actorId ? team.byId.get(last.actorId)?.display_name ?? 'someone' : null} /></p>
    </div>
  );
}
