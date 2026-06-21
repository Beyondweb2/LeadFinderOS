import { useMemo, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { MailX, Loader2, Plus, Download, Search, ExternalLink, X } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { Lead } from '@/types/lead';

/**
 * Email List Builder (cold-email sourcing). Runs the FREE website email crawl
 * (extract-email, homepage + contact/about) across the discovered businesses and
 * shows each with email-or-"none", hit-rate, CSV export, and bulk add-to-Outreach.
 *
 * HONESTY: only real extracted emails (junk-filtered server-side) — never a guessed
 * info@domain. Not found = "none". A business with no website is "no website".
 */

const CONCURRENCY = 10;   // website crawl is plain HTTP — safe to parallelise.
const MAX_PER_RUN = 200;  // bound time per run.

type Found = { email: string | null; reachable: boolean };

interface EmailListBuilderProps {
  leads: Lead[];
  isLoading: boolean;
  isInOutreach: (lead: Lead) => boolean;
  /** Bulk add with the found email carried onto each lead. */
  onBulkAddEmails: (items: { lead: Lead; email: string | null }[]) => Promise<{ added: number; skipped: number }>;
}

function csvCell(v: string): string {
  const s = (v ?? '').replace(/"/g, '""');
  return /[",\n]/.test(s) ? `"${s}"` : s;
}

export function EmailListBuilder({ leads, isLoading, isInOutreach, onBulkAddEmails }: EmailListBuilderProps) {
  const { toast } = useToast();
  const [found, setFound] = useState<Record<string, Found>>({});
  const [finding, setFinding] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [processedIds, setProcessedIds] = useState<Set<string>>(new Set());
  const cancelRef = useRef(false);

  const withWebsite = useMemo(() => leads.filter((l) => !!l.websiteUrl), [leads]);
  const processedCount = Object.keys(found).length;
  const emailCount = useMemo(() => Object.values(found).filter((f) => f.email).length, [found]);

  const findEmails = async () => {
    const targets = withWebsite.filter((l) => !found[l.id]).slice(0, MAX_PER_RUN);
    if (!targets.length) {
      toast({ title: 'Nothing to crawl', description: withWebsite.length ? 'All businesses with a website are already done.' : 'No businesses in this list have a website to crawl.' });
      return;
    }
    const est = Math.max(3, Math.ceil((targets.length / CONCURRENCY) * 2));
    if (!window.confirm(`Find emails for ${targets.length} ${targets.length === 1 ? 'business' : 'businesses'} with a website?\n\nFree website crawl (no Apify) · ~${est}s. You can cancel partway.`)) return;

    cancelRef.current = false;
    setFinding(true);
    setProgress({ done: 0, total: targets.length });
    let done = 0;
    const queue = [...targets];
    const worker = async () => {
      while (queue.length) {
        if (cancelRef.current) return;
        const lead = queue.shift()!;
        let res: Found = { email: null, reachable: false };
        try {
          const { data } = await supabase.functions.invoke('extract-email', { body: { websiteUrl: lead.websiteUrl } });
          res = { email: (data?.email as string) ?? null, reachable: data?.reachable !== false };
        } catch { /* leave as none */ }
        setFound((prev) => ({ ...prev, [lead.id]: res }));
        done++;
        setProgress({ done, total: targets.length });
      }
    };
    try {
      await Promise.all(Array.from({ length: Math.min(CONCURRENCY, queue.length) }, worker));
    } finally {
      setFinding(false);
      setProgress(null);
    }
  };

  // Selectable = not already in Outreach / not just-added.
  const selectableIds = useMemo(
    () => leads.filter((l) => !isInOutreach(l) && !processedIds.has(l.id)).map((l) => l.id),
    [leads, isInOutreach, processedIds],
  );
  const withEmailIds = useMemo(
    () => selectableIds.filter((id) => found[id]?.email),
    [selectableIds, found],
  );

  const toggle = (id: string) => setSelected((prev) => {
    const n = new Set(prev); if (n.has(id)) n.delete(id); else n.add(id); return n;
  });
  const selectAllWithEmail = () => setSelected((prev) => {
    if (withEmailIds.every((id) => prev.has(id)) && withEmailIds.length) {
      const n = new Set(prev); withEmailIds.forEach((id) => n.delete(id)); return n;
    }
    return new Set([...prev, ...withEmailIds]);
  });

  const handleAdd = async () => {
    const items = leads
      .filter((l) => selected.has(l.id))
      .map((l) => ({ lead: l, email: found[l.id]?.email ?? null }));
    if (!items.length) return;
    setAdding(true);
    try {
      const { added, skipped } = await onBulkAddEmails(items);
      const withE = items.filter((i) => i.email).length;
      toast({ title: `Added ${added} to Outreach`, description: `${withE} with an email${skipped ? ` · ${skipped} skipped (already in list)` : ''}.` });
      setProcessedIds((prev) => new Set([...prev, ...items.map((i) => i.lead.id)]));
      setSelected(new Set());
    } finally {
      setAdding(false);
    }
  };

  const exportCsv = () => {
    const header = ['Business', 'Email', 'Maps', 'Website'];
    const body = leads.map((l) => {
      const f = found[l.id];
      const email = f ? (f.email ?? 'none') : '';
      return [l.name, email, l.googleMapsUrl, l.websiteUrl ?? ''];
    });
    const csv = [header, ...body].map((r) => r.map(csvCell).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `email-list-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(a.href);
  };

  if (isLoading) {
    return <div className="flex items-center justify-center py-12 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin mr-2" /> Searching…</div>;
  }
  if (!leads.length) return null;

  const emailCell = (l: Lead) => {
    const f = found[l.id];
    if (!f) return <span className="text-muted-foreground/50">—</span>;
    if (f.email) return <a href={`mailto:${f.email}`} className="text-blue-500 hover:underline">{f.email}</a>;
    return <span className="text-muted-foreground">{f.reachable ? 'none' : 'no site reached'}</span>;
  };

  return (
    <div className="space-y-3">
      {/* Action bar */}
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" className="h-8 text-xs" onClick={findEmails} disabled={finding || !withWebsite.length}>
          {finding ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Search className="h-3.5 w-3.5 mr-1.5" />}
          Find emails ({withWebsite.length} with a website)
        </Button>
        {progress && <span className="text-xs text-muted-foreground whitespace-nowrap">Finding emails {progress.done} of {progress.total}…</span>}
        {finding && (
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={() => { cancelRef.current = true; }}>
            <X className="h-3.5 w-3.5 mr-1.5" /> Cancel
          </Button>
        )}
        {processedCount > 0 && !finding && (
          <span className="text-xs text-muted-foreground">{emailCount} of {processedCount} have emails</span>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={selectAllWithEmail} disabled={!withEmailIds.length}>
            Select all w/ email ({withEmailIds.length})
          </Button>
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={exportCsv} disabled={!leads.length}>
            <Download className="h-3.5 w-3.5 mr-1.5" /> CSV
          </Button>
          <Button size="sm" className="h-8 text-xs" onClick={handleAdd} disabled={!selected.size || adding || finding}>
            {adding ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
            Add{selected.size ? ` ${selected.size}` : ''} to Outreach
          </Button>
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Only real emails found on the site (junk-filtered) — never guessed. “none” = none found.</p>

      {/* Table */}
      <div className="overflow-hidden rounded-lg border border-border">
        <table className="w-full text-sm">
          <thead className="bg-muted/40 text-xs text-muted-foreground">
            <tr>
              <th className="w-8 px-3 py-2"></th>
              <th className="px-3 py-2 text-left font-medium">Business</th>
              <th className="px-3 py-2 text-left font-medium">Email</th>
              <th className="px-3 py-2 text-left font-medium">Links</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/60">
            {leads.map((l) => {
              const inCrm = isInOutreach(l) || processedIds.has(l.id);
              return (
                <tr key={l.id} className="hover:bg-muted/20">
                  <td className="px-3 py-2">
                    <Checkbox checked={selected.has(l.id)} disabled={inCrm} onCheckedChange={() => toggle(l.id)} aria-label={`Select ${l.name}`} />
                  </td>
                  <td className="px-3 py-2">
                    <span className="font-medium">{l.name}</span>
                    {inCrm && <span className="ml-2 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">In CRM</span>}
                    {l.address && <span className="block truncate text-xs text-muted-foreground">{l.address}</span>}
                  </td>
                  <td className="px-3 py-2">
                    {l.websiteUrl ? emailCell(l) : <span className="inline-flex items-center gap-1 text-xs text-muted-foreground"><MailX className="h-3.5 w-3.5" /> no website</span>}
                  </td>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-3 text-muted-foreground">
                      {l.googleMapsUrl && <a href={l.googleMapsUrl} target="_blank" rel="noopener noreferrer" title="Open in Google Maps" className="inline-flex items-center gap-1 text-xs hover:text-foreground"><ExternalLink className="h-3.5 w-3.5" /> Maps</a>}
                      {l.websiteUrl && <a href={l.websiteUrl} target="_blank" rel="noopener noreferrer" title={l.websiteUrl} className="text-xs underline hover:text-foreground">Site</a>}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
