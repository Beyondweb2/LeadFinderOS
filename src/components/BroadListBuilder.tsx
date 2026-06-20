import { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Globe, Instagram, Facebook, Loader2, Plus, ExternalLink } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import type { Lead } from '@/types/lead';

/**
 * Broad list-builder view (breadth-first sourcing). Renders the FULL fast-discovery
 * list with cheap signal filters + bulk-add to Outreach.
 *
 * HONEST LIMITATION: fast Maps discovery returns the listing's website field only —
 * NOT a deep social check. So "IG/FB signal" = the listing's website IS an
 * instagram/facebook link, and "Has website" = a real own site. These are LISTING
 * SIGNALS, not guarantees — labelled as such. Real socials come from Enrich.
 */

function domainOf(url?: string | null): string {
  if (!url) return '';
  try {
    return new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

interface BroadListBuilderProps {
  leads: Lead[];
  isLoading: boolean;
  isInOutreach: (lead: Lead) => boolean;
  /** Adds the given leads to Outreach (deduped); returns how many were added/skipped. */
  onBulkAdd: (leads: Lead[]) => Promise<{ added: number; skipped: number }>;
}

export function BroadListBuilder({ leads, isLoading, isInOutreach, onBulkAdd }: BroadListBuilderProps) {
  const { toast } = useToast();
  const [fHasWebsite, setFHasWebsite] = useState(false);
  const [fIg, setFIg] = useState(false);
  const [fFb, setFFb] = useState(false);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);

  // Derive the cheap listing signals once per lead.
  const rows = useMemo(() => leads.map((l) => {
    const d = domainOf(l.websiteUrl);
    return {
      lead: l,
      hasWebsite: l.websiteStatus === 'HAS_OWN_WEBSITE',
      ig: d === 'instagram.com',
      fb: d === 'facebook.com',
      inOutreach: isInOutreach(l),
    };
  }), [leads, isInOutreach]);

  const filtered = useMemo(
    () => rows.filter((r) => (!fHasWebsite || r.hasWebsite) && (!fIg || r.ig) && (!fFb || r.fb)),
    [rows, fHasWebsite, fIg, fFb],
  );

  // Only leads not already in Outreach are selectable.
  const selectableIds = useMemo(() => filtered.filter((r) => !r.inOutreach).map((r) => r.lead.id), [filtered]);
  const allSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  const toggle = (id: string) => setSelected((prev) => {
    const n = new Set(prev);
    if (n.has(id)) n.delete(id); else n.add(id);
    return n;
  });
  const toggleAll = () => setSelected((prev) => {
    if (selectableIds.every((id) => prev.has(id))) {
      const n = new Set(prev);
      selectableIds.forEach((id) => n.delete(id));
      return n;
    }
    return new Set([...prev, ...selectableIds]);
  });

  const selectedLeads = useMemo(
    () => filtered.filter((r) => selected.has(r.lead.id)).map((r) => r.lead),
    [filtered, selected],
  );

  const handleAdd = async () => {
    if (!selectedLeads.length) return;
    setAdding(true);
    try {
      const { added, skipped } = await onBulkAdd(selectedLeads);
      toast({
        title: `Added ${added} to Outreach`,
        description: skipped ? `${skipped} skipped (already in your list).` : 'All added — enrich the promising ones next.',
      });
      setSelected(new Set());
    } finally {
      setAdding(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" /> Searching…
      </div>
    );
  }
  if (!leads.length) return null;

  return (
    <div className="space-y-3">
      {/* Filter chips + count + bulk actions */}
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs text-muted-foreground mr-1">Signals (from listing — verify on Enrich):</span>
        <Button variant={fHasWebsite ? 'default' : 'outline'} size="sm" className="h-8 text-xs" onClick={() => setFHasWebsite((v) => !v)}>
          <Globe className="h-3.5 w-3.5 mr-1.5" /> Has website
        </Button>
        <Button variant={fIg ? 'default' : 'outline'} size="sm" className="h-8 text-xs" onClick={() => setFIg((v) => !v)}>
          <Instagram className="h-3.5 w-3.5 mr-1.5" /> IG signal
        </Button>
        <Button variant={fFb ? 'default' : 'outline'} size="sm" className="h-8 text-xs" onClick={() => setFFb((v) => !v)}>
          <Facebook className="h-3.5 w-3.5 mr-1.5" /> FB signal
        </Button>
        <span className="text-xs text-muted-foreground">{filtered.length} of {leads.length}</span>
        <div className="ml-auto flex items-center gap-2">
          <Button variant="outline" size="sm" className="h-8 text-xs" onClick={toggleAll} disabled={!selectableIds.length}>
            {allSelected ? 'Clear all' : `Select all (${selectableIds.length})`}
          </Button>
          <Button size="sm" className="h-8 text-xs" onClick={handleAdd} disabled={!selected.size || adding}>
            {adding ? <Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1.5" />}
            Add{selected.size ? ` ${selected.size}` : ''} to Outreach
          </Button>
        </div>
      </div>

      {/* List */}
      <div className="rounded-lg border border-border divide-y divide-border/60">
        {filtered.map((r) => (
          <div key={r.lead.id} className="flex items-center gap-3 px-3 py-2">
            <Checkbox
              checked={selected.has(r.lead.id)}
              disabled={r.inOutreach}
              onCheckedChange={() => toggle(r.lead.id)}
              aria-label={`Select ${r.lead.name}`}
            />
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <span className="truncate text-sm font-medium">{r.lead.name}</span>
                {r.inOutreach && <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">In CRM</span>}
              </div>
              {r.lead.address && <span className="block truncate text-xs text-muted-foreground">{r.lead.address}</span>}
            </div>
            <div className="flex shrink-0 items-center gap-2 text-muted-foreground">
              {r.hasWebsite && <Globe className="h-3.5 w-3.5 text-emerald-500" aria-label="Has website (listing)" />}
              {r.ig && <Instagram className="h-3.5 w-3.5 text-pink-500" aria-label="Instagram signal (listing)" />}
              {r.fb && <Facebook className="h-3.5 w-3.5 text-blue-600" aria-label="Facebook signal (listing)" />}
              {r.lead.googleMapsUrl && (
                <a href={r.lead.googleMapsUrl} target="_blank" rel="noopener noreferrer" title="Open in Google Maps" className="hover:text-foreground">
                  <ExternalLink className="h-3.5 w-3.5" />
                </a>
              )}
            </div>
          </div>
        ))}
        {filtered.length === 0 && (
          <div className="px-3 py-6 text-center text-sm text-muted-foreground">No leads match the active signal filters.</div>
        )}
      </div>
    </div>
  );
}
