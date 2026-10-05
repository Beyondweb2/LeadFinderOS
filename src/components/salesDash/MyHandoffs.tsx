import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, ClipboardCheck } from 'lucide-react';
import { Panel } from '@/components/salesDash/ui';
import { invokeEdge } from '@/lib/edgeInvoke';
import { QuickCloseDialog } from '@/components/QuickCloseDialog';

/* ══ YOUR SALES THAT STILL OWE A HANDOFF (2026-10-02, docs/paid-client-automation.md) ═══════════════════
   A paid client leaves the salesperson's Outreach and Inbox, so this is where they finish the handoff:
   their OWN sales only (fn quick-close `my_handoffs`, sold_by_user_id), names and states only — never an
   amount. Each row opens the same Quick Close screen, where the handoff stays editable after payment.
   CLIENT INFO NEEDED (2026-10-05, client missing-info actions): a sale Paul has asked about is listed
   first with what he asked for, even if the handoff itself is complete; the notification's link
   (/sales-dashboard?handoff=<leadId>) opens that sale's screen directly.
   Renders nothing when there is nothing owed. */
interface Sale {
  id: string; business_name: string | null; paid_on: string; handoff_complete: boolean; missing: number; submitted: boolean;
  info_request?: { requested_at: string; items: string[] } | null;
}
const HANDOFF_PARAM = 'handoff';

export function MyHandoffs() {
  const [params, setParams] = useSearchParams();
  const [open, setOpen] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ['my-handoffs'],
    staleTime: 60_000,
    queryFn: () => invokeEdge<{ ok: true; sales: Sale[] }>('quick-close', { mode: 'my_handoffs' }),
  });
  /* The notification link. quick-close itself decides whether this person may open it (their own sale only). */
  const linked = params.get(HANDOFF_PARAM);
  useEffect(() => {
    if (!linked) return;
    setOpen(linked);
    const next = new URLSearchParams(params); next.delete(HANDOFF_PARAM); setParams(next, { replace: true });
  }, [linked, params, setParams]);
  const owed = (q.data?.sales ?? [])
    .filter((s) => !!s.info_request || !s.handoff_complete || !s.submitted)
    .sort((a, b) => Number(!!b.info_request) - Number(!!a.info_request));
  const dialog = open && <QuickCloseDialog leadId={open} open onOpenChange={(v) => { if (!v) { setOpen(null); void q.refetch(); } }} />;
  if (!owed.length) return dialog || null;
  return (
    <Panel title="Finish the handoff" icon={ClipboardCheck} tone="amber" hint="Your paid sales still waiting on the handoff answers." className="ring-1 ring-amber-500/30">
      <ul className="space-y-1.5" data-testid="my-handoffs">
        {owed.map((s) => (
          <li key={s.id}>
            <button type="button" onClick={() => setOpen(s.id)} className="group flex w-full min-w-0 flex-col gap-0.5 rounded-xl bg-amber-500/[0.07] px-3 py-2.5 text-left text-sm ring-1 ring-inset ring-amber-500/20 transition hover:bg-amber-500/[0.12]">
              <span className="flex w-full min-w-0 items-center justify-between gap-2">
                <span className="min-w-0 truncate font-medium">{s.business_name ?? 'A client'}</span>
                <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
                  {s.info_request ? 'CLIENT INFO NEEDED' : !s.handoff_complete ? (s.missing ? `${s.missing} answer${s.missing === 1 ? '' : 's'} to give` : 'Handoff not saved') : 'Ready to submit?'}<ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                </span>
              </span>
              {s.info_request && (
                <span className="text-xs text-muted-foreground" data-testid="my-handoff-request">Paul asked for: {s.info_request.items.join(' · ')}</span>
              )}
            </button>
          </li>
        ))}
      </ul>
      {dialog}
    </Panel>
  );
}
