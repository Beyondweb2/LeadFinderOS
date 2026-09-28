import { useState } from 'react';
import { Loader2, Search, ChevronLeft, ChevronRight, Hand } from 'lucide-react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/hooks/use-toast';
import { useSalesActions, useSalesPool } from '@/hooks/useSalesCrm';
import { refusalText } from '@/lib/salesCrm';

const PAGE = 50;

/** What the pool IS, in one line a new salesperson understands without training (Paul, 2026-09-28).
 *  The tab's hover text and this panel's subtitle both say it; the server rules it describes are
 *  sales_pool + claim_lead (unassigned, never contacted, not archived, not a client). */
export const CLAIM_POOL_HELP = 'Leads nobody owns and nobody has contacted yet. Claim one to add it to your pipeline — it becomes yours, with its history.';

/* AVAILABLE TO CLAIM — inside Outreach, for a salesperson (2026-09-27; was the bottom of My Leads).
 *
 * ⛔ The list is sales_pool (server): unassigned, never contacted, not archived, not a client — and
 * only names, trade, town and a few public listing facts. Claiming is claim_lead, which locks the row
 * and re-checks every one of those rules at the moment of the claim, so two reps pressing Claim on
 * the same business cannot both get it, and a business contacted since the list loaded is refused.
 * A claimed lead is then the rep's own, in their Outreach list, with its history untouched. */
export function AvailableToClaim({ onClaimed }: { onClaimed: () => void }) {
  const { toast } = useToast();
  const actions = useSalesActions();
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const [page, setPage] = useState(0);
  const pool = useSalesPool(query, page, PAGE);
  const [claiming, setClaiming] = useState<string | null>(null);

  const claim = async (id: string) => {
    setClaiming(id);
    try {
      const r = await actions.claim.mutateAsync({ leadId: id });
      if (!r.ok) { toast({ title: 'Not claimed', description: refusalText(r.error, r.owner_name as string | undefined), variant: 'destructive' }); return; }
      toast({ title: 'Claimed', description: 'It is yours now — it is in your Outreach list.' });
      onClaimed();
    } finally { setClaiming(null); }
  };

  const rows = pool.data ?? [];
  return (
    <Card className="bg-card/50 border-border/50 p-4 space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto">
          <h2 className="font-semibold">Available to claim</h2>
          <p className="text-xs text-muted-foreground">{CLAIM_POOL_HELP} Once a business has been contacted it leaves this list, so nobody can take a lead someone is already working.</p>
        </div>
        <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); setPage(0); setQuery(q.trim()); }}>
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Business, trade or town" className="h-8 w-56" />
          <Button size="sm" variant="outline" type="submit" aria-label="Search the pool"><Search className="h-4 w-4" /></Button>
        </form>
      </div>
      {pool.isLoading ? (
        <div className="py-6 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : pool.isError ? (
        <p className="py-3 text-sm text-destructive">Could not load the available leads. Try again.</p>
      ) : (
        <ul className="divide-y divide-border/50">
          {rows.map((p) => (
            <li key={p.id} className="flex items-center gap-3 py-2">
              <div className="flex-1 min-w-0">
                <div className="font-medium truncate">{p.business_name}</div>
                <div className="text-xs text-muted-foreground truncate">
                  {[p.trade, p.town, p.rating ? `${p.rating}★ (${p.review_count ?? 0})` : null, p.website ? 'has website' : 'no website', p.has_phone ? null : 'no phone'].filter(Boolean).join(' · ')}
                </div>
              </div>
              <Button size="sm" variant="outline" disabled={!!claiming} onClick={() => void claim(p.id)}>
                {claiming === p.id ? <Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" /> : <Hand className="h-3.5 w-3.5 mr-1" />}Claim
              </Button>
            </li>
          ))}
          {rows.length === 0 && <li className="py-3 text-sm text-muted-foreground">No available leads match.</li>}
        </ul>
      )}
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" disabled={page === 0} onClick={() => setPage((n) => n - 1)} aria-label="Previous page"><ChevronLeft className="h-4 w-4" /></Button>
        <Button size="sm" variant="ghost" disabled={rows.length < PAGE} onClick={() => setPage((n) => n + 1)} aria-label="Next page"><ChevronRight className="h-4 w-4" /></Button>
      </div>
    </Card>
  );
}
