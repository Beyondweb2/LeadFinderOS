import { useState } from 'react';
import { Check, ClipboardCopy, Loader2, Search } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { edgeErrorMessage, invokeEdge } from '@/lib/edgeInvoke';
import { MISSING_INFO_LABEL, WEBSITE_CONTROL_WORDS, type KnownCandidate, type KnownForItem, type SellerWebsiteControl } from '@/lib/clientMissingInfo';

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   FIND WHAT WE ALREADY HAVE (Paul, 2026-10-05) — inside the Missing information box. One press reads
   what other forms, the website crawl, the salesperson's handoff and Quick Close already hold for each
   missing item (paid-client-hub gather_known → clientMissingInfo.gatherKnown). Each source is shown
   on its own and labelled; Use applies THAT one (the server re-gathers it by id). A website find says it
   is a guess until the client confirms. Nothing is applied without a press; nothing is sent.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
export function KnownInfoFinder({ leadId, onChanged }: { leadId: string; onChanged: () => void }) {
  const { toast } = useToast();
  const [busy, setBusy] = useState<string | null>(null);
  const [found, setFound] = useState<{ known: KnownForItem[]; crawl_on_file: boolean } | null>(null);

  const look = async () => {
    setBusy('look');
    try { setFound(await invokeEdge<{ ok: true; known: KnownForItem[]; crawl_on_file: boolean }>('paid-client-hub', { action: 'gather_known', lead_id: leadId })); }
    catch (e) { toast({ title: 'Could not look', description: edgeErrorMessage(e), variant: 'destructive' }); }
    finally { setBusy(null); }
  };
  const use = async (c: KnownCandidate) => {
    setBusy(c.id);
    try {
      await invokeEdge('paid-client-hub', { action: 'apply_known', lead_id: leadId, candidate_id: c.id });
      toast({ title: 'Added to the client', description: `${c.label} — the setup checklist has been re-checked.` });
      onChanged();
      await look();
    } catch (e) { toast({ title: 'Not added', description: edgeErrorMessage(e), variant: 'destructive' }); }
    finally { setBusy(null); }
  };
  const copy = async (t: string) => {
    try { await navigator.clipboard.writeText(t); toast({ title: 'Copied' }); } catch { toast({ title: 'Copy blocked by the browser', description: t, variant: 'destructive' }); }
  };
  const shown = (c: KnownCandidate) => c.items?.join(', ') ?? (c.apply === 'website_control' ? WEBSITE_CONTROL_WORDS[c.value as SellerWebsiteControl] ?? c.value : c.value) ?? '';

  if (!found) {
    return (
      <Button size="sm" variant="outline" onClick={() => void look()} disabled={!!busy} data-testid="find-known"
        title="Looks at other forms they filled in, the website crawl, the salesperson's handoff and the sales-call answers. Nothing is changed until you press Use.">
        {busy === 'look' ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <Search className="mr-1 h-4 w-4" />}Find what we already have
      </Button>
    );
  }
  const withFinds = found.known.filter((k) => k.candidates.length);
  const without = found.known.filter((k) => !k.candidates.length);
  return (
    <div className="w-full space-y-2 rounded-md border bg-background/60 p-2.5 text-sm" data-testid="known-results">
      <div className="flex items-center justify-between gap-2">
        <p className="font-semibold">What we already have</p>
        <button type="button" className="text-xs text-primary hover:underline" onClick={() => setFound(null)}>Close</button>
      </div>
      {withFinds.length === 0 && <p className="text-xs text-muted-foreground" data-testid="known-none">Nothing more on file for these.{found.crawl_on_file ? '' : ' Their website has not been crawled yet.'}</p>}
      {withFinds.map((k) => (
        <div key={k.key} className="space-y-1" data-testid={`known-${k.key}`}>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{MISSING_INFO_LABEL[k.key] ?? k.key}</p>
          {k.candidates.map((c) => (
            <div key={c.id} className="flex flex-wrap items-start justify-between gap-2 rounded border px-2 py-1.5">
              <div className="min-w-0 flex-1">
                <p className="break-words">{shown(c)}</p>
                <p className="text-xs text-muted-foreground">{c.label}{c.note ? ` · ${c.note}` : ''}</p>
              </div>
              {c.apply
                ? <Button size="sm" className="h-7 text-xs" onClick={() => void use(c)} disabled={!!busy}>{busy === c.id ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <Check className="mr-1 h-3.5 w-3.5" />}Use</Button>
                : <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => void copy(shown(c))}><ClipboardCopy className="mr-1 h-3.5 w-3.5" />Copy</Button>}
            </div>
          ))}
        </div>
      ))}
      {without.length > 0 && (
        <p className="text-xs text-muted-foreground">
          Nothing on file for: {without.map((k) => MISSING_INFO_LABEL[k.key] ?? k.key).join(', ')}
          {without.some((k) => k.clientOnly) ? ' — domain, Google access and their setup form can only come from the client.' : '.'}
        </p>
      )}
    </div>
  );
}
