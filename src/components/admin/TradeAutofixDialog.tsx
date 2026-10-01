import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Loader2, Wand2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { fetchAllRows } from '@/lib/fetchAllRows';
import { isLiveLeadWithoutTrade } from '@/lib/leadTrade';
import { inferTrade, TRADE_SOURCE_LABEL, type TradeVerdict } from '@/lib/tradeInference';
import { notifyLeadChanged } from '@/lib/leadSync';

/* ══ "FIX AUTOMATICALLY" — missing trades from data we already hold (2026-10-01) ══════════════════
   Admin only (the button is on the admin's Needs your attention; the database function refuses anyone
   else). Free: reads the leads, their campaigns and their audits — no AI, no Google, no crawl. High
   confidence is saved at once (admin_set_lead_trade: search_keyword only, History records the evidence);
   medium is listed for one-click review; low is left alone. Nothing is sent and no status, owner or
   Next Action changes. */

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

interface Row { id: string; business_name: string | null; campaign_id: string | null; status: string | null; is_archived: boolean | null; amount_paid: number | null; search_keyword: string | null; category: string | null }
interface Result { leadId: string; name: string; v: TradeVerdict; saved: boolean }

async function check(): Promise<Result[]> {
  const leads = (await fetchAllRows<Row>('trade-autofix leads', (a, b) => sb.from('outreach_leads')
    .select('id, business_name, campaign_id, status, is_archived, amount_paid, search_keyword, category')
    .or('search_keyword.is.null,search_keyword.eq.').order('id').range(a, b))).rows.filter(isLiveLeadWithoutTrade);
  const { data: camps } = await sb.from('campaigns').select('id, name, trade_slug');
  const campById = new Map(((camps ?? []) as { id: string; name: string | null; trade_slug: string | null }[]).map((c) => [c.id, c]));
  const ids = leads.map((l) => l.id);
  const audits = new Map<string, string[]>();
  for (let i = 0; i < ids.length; i += 200) {
    const { data } = await sb.from('ai_audits').select('lead_id, business_type').in('lead_id', ids.slice(i, i + 200));
    for (const a of (data ?? []) as { lead_id: string; business_type: string | null }[]) if (a.business_type) audits.set(a.lead_id, [...(audits.get(a.lead_id) ?? []), a.business_type]);
  }
  return leads.map((l) => {
    const c = l.campaign_id ? campById.get(l.campaign_id) : undefined;
    return { leadId: l.id, name: l.business_name ?? 'Unnamed', saved: false,
      v: inferTrade({ businessName: l.business_name, campaignName: c?.name ?? null, campaignTradeSlug: c?.trade_slug ?? null, auditBusinessTypes: audits.get(l.id) ?? [] }) };
  });
}

async function save(r: Result): Promise<boolean> {
  if (!r.v.trade || r.v.confidence === 'low') return false;
  const { data, error } = await sb.rpc('admin_set_lead_trade', {
    _lead_id: r.leadId, _trade: r.v.trade, _source: r.v.evidence.find((e) => e.trade === r.v.trade)?.source ?? null,
    _confidence: r.v.confidence, _evidence: r.v.evidence,
  });
  if (error || !data?.ok) return false;
  notifyLeadChanged(r.leadId);
  return true;
}

export function TradeAutofixDialog({ open, onOpenChange, onDone }: { open: boolean; onOpenChange: (v: boolean) => void; onDone: () => void }) {
  const [busy, setBusy] = useState(false);
  const [results, setResults] = useState<Result[] | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const run = async () => {
    setBusy(true); setFailed(null);
    try {
      const rs = await check();
      for (const r of rs) if (r.v.confidence === 'high') r.saved = await save(r);
      setResults(rs); onDone();
    } catch (e) { setFailed(e instanceof Error ? e.message : String(e)); } finally { setBusy(false); }
  };
  const accept = async (r: Result) => {
    setBusy(true);
    try { const ok = await save(r); setResults((prev) => (prev ?? []).map((x) => (x.leadId === r.leadId ? { ...x, saved: ok } : x))); onDone(); } finally { setBusy(false); }
  };
  const fixed = (results ?? []).filter((r) => r.saved);
  const review = (results ?? []).filter((r) => !r.saved && r.v.confidence === 'medium');
  const unresolved = (results ?? []).filter((r) => !r.saved && r.v.confidence !== 'medium');
  return (
    <Dialog open={open} onOpenChange={(v) => { if (!busy) { onOpenChange(v); if (!v) setResults(null); } }}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Wand2 className="h-5 w-5 text-violet-500" />Fill in missing trades</DialogTitle>
          <DialogDescription>
            Works out each lead&rsquo;s trade from what we already hold: its audit, its campaign&rsquo;s trade or name, and a clear trade word in the business name.
          </DialogDescription>
        </DialogHeader>
        {!results ? (
          <div className="space-y-2 text-sm">
            <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
              <li><span className="text-foreground">Cost: free.</span> No AI, no Google, no website visits.</li>
              <li>Saved automatically when the evidence is strong; a business name on its own is listed for you to check; anything unclear is left alone.</li>
              <li>Only the trade is written. No messages are sent; status, owner and Next Action do not change. Each change is recorded in the lead&rsquo;s History with its evidence.</li>
            </ul>
            {failed && <p className="text-xs text-destructive">It stopped: {failed}. Nothing after that point was changed.</p>}
          </div>
        ) : (
          <div className="space-y-3 text-sm" data-testid="trade-autofix-result">
            <p className="font-semibold">{results.length} checked · {fixed.length} fixed · {review.length} need review · {unresolved.length} unresolved</p>
            {review.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Check these</p>
                <ul className="divide-y divide-border/60 rounded-lg border border-border/60">
                  {review.map((r) => (
                    <li key={r.leadId} className="flex items-center justify-between gap-2 px-3 py-2 text-xs">
                      <span className="min-w-0"><span className="font-medium">{r.name}</span> → <span className="font-semibold">{r.v.trade}</span><span className="block text-muted-foreground">{r.v.reason}</span></span>
                      <Button size="sm" variant="outline" className="h-7 shrink-0 text-xs" disabled={busy} onClick={() => void accept(r)}>Save</Button>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {unresolved.length > 0 && (
              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Left for you</p>
                <ul className="space-y-0.5 text-xs text-muted-foreground">
                  {unresolved.slice(0, 12).map((r) => <li key={r.leadId}><span className="text-foreground">{r.name}</span> — {r.v.reason}</li>)}
                  {unresolved.length > 12 && <li>…and {unresolved.length - 12} more</li>}
                </ul>
                <Link to="/outreach?show=no_trade" onClick={() => onOpenChange(false)} className="mt-1 inline-block text-xs text-primary hover:underline">Show the {unresolved.length + review.length} still without a trade in Outreach</Link>
              </div>
            )}
            {fixed.length > 0 && <p className="text-xs text-muted-foreground">Saved from {[...new Set(fixed.flatMap((r) => r.v.evidence.filter((e) => e.trade === r.v.trade).map((e) => TRADE_SOURCE_LABEL[e.source])))].join(', ')}. Each is in the lead&rsquo;s History.</p>}
          </div>
        )}
        <DialogFooter>
          {!results
            ? <Button disabled={busy} onClick={() => void run()} data-testid="trade-autofix-run">{busy ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}Fix automatically</Button>
            : <Button variant="outline" disabled={busy} onClick={() => { onOpenChange(false); setResults(null); }}>Done</Button>}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
