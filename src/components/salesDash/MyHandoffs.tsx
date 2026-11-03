import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { ArrowRight, ClipboardCheck } from 'lucide-react';
import { Panel } from '@/components/salesDash/ui';
import { invokeEdge } from '@/lib/edgeInvoke';
import { QuickCloseDialog } from '@/components/QuickCloseDialog';

/* ══ WHAT PAUL ASKED YOU FOR (2026-10-05; the handoff form it used to chase was removed 2026-11-03, docs/commission-owed.md) ═══════════
   A paid client leaves the salesperson's Outreach and Inbox, so this is where a request from Paul reaches them. Their OWN sales only (fn
   quick-close `my_handoffs`, sold_by_user_id), names only, never an amount. The notification's link (/sales-dashboard?handoff=<leadId>)
   opens that sale's screen directly. Renders nothing when he has asked for nothing. */
interface Sale {
  id: string; business_name: string | null; paid_on: string;
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
  const owed = (q.data?.sales ?? []).filter((s) => !!s.info_request);
  const dialog = open && <QuickCloseDialog leadId={open} open onOpenChange={(v) => { if (!v) { setOpen(null); void q.refetch(); } }} />;
  if (!owed.length) return dialog || null;
  return (
    <Panel title="Paul asked for details" icon={ClipboardCheck} tone="amber" hint="Your paid sales where Paul needs something you may know." className="ring-1 ring-amber-500/30">
      <ul className="space-y-1.5" data-testid="my-handoffs">
        {owed.map((s) => (
          <li key={s.id}>
            <button type="button" onClick={() => setOpen(s.id)} className="group flex w-full min-w-0 flex-col gap-0.5 rounded-xl bg-amber-500/[0.07] px-3 py-2.5 text-left text-sm ring-1 ring-inset ring-amber-500/20 transition hover:bg-amber-500/[0.12]">
              <span className="flex w-full min-w-0 items-center justify-between gap-2">
                <span className="min-w-0 truncate font-medium">{s.business_name ?? 'A client'}</span>
                <span className="flex shrink-0 items-center gap-1 text-xs font-semibold text-amber-700 dark:text-amber-300">
                  CLIENT INFO NEEDED<ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
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
