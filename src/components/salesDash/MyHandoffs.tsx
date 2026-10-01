import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ClipboardCheck } from 'lucide-react';
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
    <section className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-4" data-testid="my-handoffs">
      <p className="flex items-center gap-2 text-sm font-semibold"><ClipboardCheck className="h-4 w-4 text-amber-600" />Your sales — finish the handoff</p>
      <ul className="mt-2 space-y-1.5">
        {owed.map((s) => (
          <li key={s.id}>
            <button type="button" onClick={() => setOpen(s.id)} className="flex w-full min-w-0 items-center justify-between gap-2 rounded-lg border bg-background px-3 py-2 text-left text-sm hover:bg-muted">
              <span className="min-w-0 truncate font-medium">{s.business_name ?? 'A client'}</span>
              <span className="shrink-0 text-xs text-amber-700 dark:text-amber-300">
                {!s.handoff_complete ? (s.missing ? `${s.missing} answer${s.missing === 1 ? '' : 's'} to give` : 'Handoff not saved') : 'Ready to submit?'}
              </span>
            </button>
          </li>
        ))}
      </ul>
      {open && <QuickCloseDialog leadId={open} open onOpenChange={(v) => { if (!v) { setOpen(null); void q.refetch(); } }} />}
    </section>
  );
}
