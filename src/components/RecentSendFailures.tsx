import { useState } from 'react';
import { AlertTriangle, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { edgeErrorMessage, invokeEdge } from '@/lib/edgeInvoke';
import { SendErrorNote } from '@/components/SendErrorNote';
import { cn } from '@/lib/utils';
import { sendFailureReason } from '@/lib/sendFailureReason';

/* FAILED WHATSAPP SENDS, LAST 7 DAYS (2026-10-15, admin only) — the queue panel's list of every failed send (queue,
   Inbox and follow-up lanes) with Meta's raw code and its plain-English meaning. Read through process-whatsapp-queue
   mode 'recent_failures' (whatsapp_sends is service-role only). Loaded only when opened. */
interface FailureRow {
  id: string;
  at: string;
  business: string | null;
  template: string | null;
  byPerson: boolean;
  deliveryStatus: string | null;
  market: string | null;
  phoneEnd: string | null;
  code: number | null;
  title: string | null;
  details: string | null;
  /** 2026-10-22: the lead's flag now — the stored reason for a failure Meta reported after sending. */
  leadStatus?: string | null;
  leadDelivery?: string | null;
}

const MARKET_NAME: Record<string, string> = { UK: 'UK', MY: 'Malaysia', SG: 'Singapore', AU: 'Australia' };

function when(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
}

export function RecentSendFailures() {
  const [open, setOpen] = useState(false);
  const [rows, setRows] = useState<FailureRow[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const load = async () => {
    setLoading(true); setErr(null);
    try {
      const r = await invokeEdge<{ ok?: boolean; failures?: FailureRow[] }>('process-whatsapp-queue', { mode: 'recent_failures' });
      if (!r?.ok) throw new Error('Could not read failed sends');
      setRows(r.failures ?? []);
    } catch (e) {
      setErr(edgeErrorMessage(e, 'Could not read failed sends'));
    } finally { setLoading(false); }
  };

  const toggle = () => {
    const next = !open;
    setOpen(next);
    if (next && rows === null) void load();
  };

  return (
    <div className="mt-2 rounded-xl bg-muted/30 px-3 py-2 ring-1 ring-inset ring-border/40" data-testid="queue-recent-failures">
      <button type="button" className="flex w-full items-center gap-1.5 text-left text-xs font-semibold" onClick={toggle}>
        {open ? <ChevronDown className="h-3.5 w-3.5" /> : <ChevronRight className="h-3.5 w-3.5" />}
        <AlertTriangle className="h-3.5 w-3.5 text-red-600" /> Failed sends — last 7 days
        {rows && <span className="font-normal text-muted-foreground">({rows.length})</span>}
      </button>
      {open && (
        <div className="mt-2 space-y-1.5">
          {loading && <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Reading…</p>}
          {err && <p className="text-[11px] text-red-700">{err} <button type="button" className="underline" onClick={() => void load()}>Try again</button></p>}
          {rows && rows.length === 0 && !loading && <p className="text-[11px] text-muted-foreground">No failed WhatsApp sends in the last 7 days.</p>}
          {rows?.map((r) => { const why = sendFailureReason({ code: r.code, deliveryStatus: r.deliveryStatus, leadStatus: r.leadStatus ?? null, leadDelivery: r.leadDelivery ?? null }); return (
            <div key={r.id} className={cn('rounded-lg bg-background/70 px-2 py-1.5 text-[11px]')} data-testid="queue-failure-row">
              <div className="flex flex-wrap items-center gap-x-2 text-muted-foreground">
                <span className="font-semibold text-foreground">{r.business || 'Unknown business'}</span>
                {r.market && <span>{MARKET_NAME[r.market] ?? r.market}</span>}
                {r.phoneEnd && <span>…{r.phoneEnd}</span>}
                {r.template && <span>{r.template}</span>}
                <span>{r.byPerson ? 'sent by a person' : 'queue'}</span>
                <span>{when(r.at)}</span>
              </div>
              {(r.code != null || r.title || r.details)
                ? <SendErrorNote channel="whatsapp" parts={{ code: r.code, title: r.title, details: r.details }} className="block font-medium text-red-700 dark:text-red-300" />
                : <span className="block text-red-700 dark:text-red-300" data-testid="queue-failure-reason">{why.words}</span>}
              {r.details && <span className="block text-muted-foreground">Meta said: {r.details}</span>}
              {r.market && r.market !== 'UK' && <span className="block text-muted-foreground">{why.countsTowardAutoOff ? 'Counts toward this country switching itself off.' : 'Not counted toward this country switching itself off.'}</span>}
            </div>
          ); })}
        </div>
      )}
    </div>
  );
}
