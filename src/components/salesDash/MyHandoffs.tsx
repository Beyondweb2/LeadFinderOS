import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, ClipboardCheck } from 'lucide-react';
import { Panel } from '@/components/salesDash/ui';
import { invokeEdge } from '@/lib/edgeInvoke';
import { QuickCloseDialog } from '@/components/QuickCloseDialog';

/* ══ YOUR SALES THAT STILL OWE A HANDOFF (2026-10-02, docs/paid-client-automation.md) ═══════════════════
   A paid client leaves the salesperson's Outreach and Inbox, so this is where they finish the handoff:
   their OWN sales only (fn quick-close `my_handoffs`, sold_by_user_id), names and states only — never an
   amount. Each row opens the same Quick Close screen, where the handoff stays editable after payment.
   Renders nothing when there is nothing owed. */
interface Sale { id: string; business_name: string | null; paid_on: string; handoff_complete: boolean; missing: number; submitted: boolean }

export function MyHandoffs() {
  const [open, setOpen] = useState<string | null>(null);
  const q = useQuery({
    queryKey: ['my-handoffs'],
    staleTime: 60_000,
    queryFn: () => invokeEdge<{ ok: true; sales: Sale[] }>('quick-close', { mode: 'my_handoffs' }),
  });
  const owed = (q.data?.sales ?? []).filter((s) => !s.handoff_complete || !s.submitted);
  if (!owed.length) return null;
  return (
    <Panel title="Finish the handoff" icon={ClipboardCheck} tone="amber" hint="Your paid sales still waiting on the handoff answers." className="ring-1 ring-amber-500/30">
      <ul className="space-y-1.5" data-testid="my-handoffs">
        {owed.map((s) => (
          <li key={s.id}>
            <button type="button" onClick={() => setOpen(s.id)} className="group flex w-full min-w-0 items-center justify-between gap-2 rounded-xl bg-amber-500/[0.07] px-3 py-2.5 text-left text-sm ring-1 ring-inset ring-amber-500/20 transition hover:bg-amber-500/[0.12]">
              <span className="min-w-0 truncate font-medium">{s.business_name ?? 'A client'}</span>
              <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
                {!s.handoff_complete ? (s.missing ? `${s.missing} answer${s.missing === 1 ? '' : 's'} to give` : 'Handoff not saved') : 'Ready to submit?'}<ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
              </span>
            </button>
          </li>
        ))}
      </ul>
      {open && <QuickCloseDialog leadId={open} open onOpenChange={(v) => { if (!v) { setOpen(null); void q.refetch(); } }} />}
    </Panel>
  );
}
