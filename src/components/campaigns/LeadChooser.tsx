import { useMemo, useState } from 'react';
import { AlertCircle, Loader2, RefreshCw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { useCampaignCandidates, type CandidateLead } from '@/hooks/useMyCampaigns';
import { OUTREACH_STATUS_OPTIONS } from '@/types/outreach';

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   CHOOSE LEADS FOR A CAMPAIGN (2026-10-03). The list is the server's (campaign_candidates): the leads this
   person may work — a salesperson's own, never another rep's or a client — and for each one whether the
   first message can actually go (the same checks the queue makes: new, never contacted, a mobile, not
   opted out). Filters are the useful ones only: search, trade, town, "not in a campaign", "can be messaged".
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

const ALL = '';
const statusLabel = (s: string | null) => OUTREACH_STATUS_OPTIONS.find((o) => o.value === s)?.label ?? (s ?? '—');
const norm = (s: string | null) => (s ?? '').trim();

export function LeadChooser({ campaignId, selected, onChange }: { campaignId: string | null; selected: Set<string>; onChange: (next: Set<string>) => void }) {
  const q = useCampaignCandidates(campaignId, true);
  const [search, setSearch] = useState('');
  const [trade, setTrade] = useState(ALL);
  const [town, setTown] = useState(ALL);
  const [freeOnly, setFreeOnly] = useState(true);
  const [sendableOnly, setSendableOnly] = useState(true);

  const rows = useMemo(() => (q.data ?? []).filter((l) => !l.in_this), [q.data]);
  const trades = useMemo(() => [...new Set(rows.map((l) => norm(l.trade)).filter(Boolean))].sort(), [rows]);
  const towns = useMemo(() => [...new Set(rows.map((l) => norm(l.town)).filter(Boolean))].sort(), [rows]);
  const shown = useMemo(() => {
    const s = search.trim().toLowerCase();
    return rows.filter((l) =>
      (!freeOnly || !l.in_other_campaign) && (!sendableOnly || l.sendable)
      && (trade === ALL || norm(l.trade) === trade) && (town === ALL || norm(l.town) === town)
      && (!s || `${l.business_name ?? ''} ${l.trade ?? ''} ${l.town ?? ''}`.toLowerCase().includes(s)));
  }, [rows, search, trade, town, freeOnly, sendableOnly]);

  const allShownSelected = shown.length > 0 && shown.every((l) => selected.has(l.id));
  const toggleAll = () => {
    const next = new Set(selected);
    if (allShownSelected) shown.forEach((l) => next.delete(l.id)); else shown.forEach((l) => next.add(l.id));
    onChange(next);
  };
  const toggle = (l: CandidateLead) => { const next = new Set(selected); if (next.has(l.id)) next.delete(l.id); else next.add(l.id); onChange(next); };
  const sendableSelected = (q.data ?? []).filter((l) => selected.has(l.id) && l.sendable).length;

  if (q.isLoading) return <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading your leads…</p>;
  if (q.isError) return <div role="alert" className="flex flex-wrap items-center gap-2 text-sm text-destructive"><AlertCircle className="h-4 w-4" />Could not load your leads.<Button size="sm" variant="outline" onClick={() => void q.refetch()}><RefreshCw className="mr-1 h-4 w-4" />Try again</Button></div>;

  const sel = 'h-9 rounded-md border bg-background px-2 text-sm';
  return <div className="space-y-3" data-testid="lead-chooser">
    <div className="grid gap-2 sm:grid-cols-3">
      <Input placeholder="Search name, trade or town" value={search} onChange={(e) => setSearch(e.target.value)} className="h-9" />
      <select aria-label="Trade" className={sel} value={trade} onChange={(e) => setTrade(e.target.value)}><option value={ALL}>All trades</option>{trades.map((t) => <option key={t} value={t}>{t}</option>)}</select>
      <select aria-label="Town" className={sel} value={town} onChange={(e) => setTown(e.target.value)}><option value={ALL}>All towns</option>{towns.map((t) => <option key={t} value={t}>{t}</option>)}</select>
    </div>
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2 text-sm">
      <label className="flex items-center gap-2"><Checkbox checked={sendableOnly} onCheckedChange={(v) => setSendableOnly(v === true)} />Only leads that can be messaged</label>
      <label className="flex items-center gap-2"><Checkbox checked={freeOnly} onCheckedChange={(v) => setFreeOnly(v === true)} />Not already in a campaign</label>
    </div>
    <div className="flex flex-wrap items-center justify-between gap-2 border-y py-2 text-sm">
      <label className="flex items-center gap-2 font-medium"><Checkbox checked={allShownSelected} onCheckedChange={toggleAll} disabled={shown.length === 0} />Select all {shown.length} shown</label>
      <span className="font-semibold" data-testid="selected-count">{selected.size} selected{selected.size > 0 ? ` · ${sendableSelected} can be messaged` : ''}</span>
    </div>
    {rows.length === 0
      ? <p className="text-sm text-muted-foreground">You have no leads to add yet. Claim or add leads in Outreach or Find Leads first.</p>
      : shown.length === 0
        ? <p className="text-sm text-muted-foreground">No leads match these filters.</p>
        : <ul className="max-h-[40vh] divide-y overflow-y-auto rounded-md border">
            {shown.slice(0, 500).map((l) => <li key={l.id}>
              <label className="flex cursor-pointer items-start gap-3 px-3 py-2 text-sm hover:bg-muted/50">
                <Checkbox className="mt-0.5" checked={selected.has(l.id)} onCheckedChange={() => toggle(l)} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-medium">{l.business_name ?? 'Unnamed business'}</span>
                  <span className="block truncate text-xs text-muted-foreground">
                    {[l.trade, l.town, statusLabel(l.status)].filter(Boolean).join(' · ')}
                    {l.in_other_campaign ? ` · in ${l.campaign_name ? `“${l.campaign_name}”` : 'another campaign'}` : ''}
                    {!l.sendable ? ' · cannot be messaged' : ''}
                  </span>
                </span>
              </label>
            </li>)}
          </ul>}
    {shown.length > 500 && <p className="text-xs text-muted-foreground">Showing the first 500 — narrow the filters to see the rest. Select all still selects all {shown.length}.</p>}
  </div>;
}
