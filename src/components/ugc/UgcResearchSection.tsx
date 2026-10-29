import { ExternalLink, FileSearch, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { SubSection, ToneChip } from '@/components/operator/ui';
import type { UgcBrand } from '@/hooks/useUgc';
import { RESEARCH_USD_CEILING, researchGaps, reviewsLine, type Sourced } from '@/lib/ugc/research';
import { formatUsd } from '@/lib/ugc/config';

/* Her required fields for one brand, each with the page it came from (auto-research, checked against that page).
   Unknown is shown as unknown — never guessed. */

function Field({ label, s }: { label: string; s: Sourced | null | undefined }) {
  return (
    <div className="text-xs">
      <span className="font-semibold">{label}:</span>{' '}
      {s ? <>{s.value} <a className="inline-flex items-center gap-0.5 text-primary underline" href={s.url} target="_blank" rel="noreferrer" title={`"${s.quote}"`}>source<ExternalLink className="h-3 w-3" /></a></>
        : <span className="text-muted-foreground">unknown</span>}
    </div>
  );
}

export function UgcResearchSection({ brand: b, busy, onResearch }: { brand: UgcBrand; busy: boolean; onResearch: () => void }) {
  const v = b.research?.verified ?? null;
  const gaps = researchGaps(v);
  const queued = b.research_status === 'queued' || b.research_status === 'running';
  return (
    <SubSection title="Research" icon={FileSearch} tone="blue" testId="ugc-research"
      action={b.track === 'brand' && (
        <Button size="sm" variant="outline" disabled={busy || queued || !b.website} onClick={onResearch}>
          {busy || b.research_status === 'running' ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : <FileSearch className="mr-1 h-3.5 w-3.5" />}
          {v ? 'Research again' : 'Research'} (up to {formatUsd(RESEARCH_USD_CEILING)})
        </Button>
      )}>
      {!v && <p className="text-xs text-muted-foreground">{queued ? 'Queued: researching after the contacts run…' : b.website ? 'Not researched yet. Reads the brand’s homepage, one product page, its shipping page and its Trustpilot page.' : 'No website to read.'}</p>}
      {v && (
        <div className="space-y-1">
          <Field label="Product" s={v.product} />
          <Field label="Verified product detail" s={v.product_detail} />
          <Field label="Pushing now" s={v.pushing_now} />
          <div className="text-xs"><span className="font-semibold">Reviews:</span>{' '}
            {v.reviews ? <>{reviewsLine(v.reviews)?.replace(/^Reviews: /, '')} {v.reviews.url && <a className="inline-flex items-center gap-0.5 text-primary underline" href={v.reviews.url} target="_blank" rel="noreferrer">source<ExternalLink className="h-3 w-3" /></a>}</> : <span className="text-muted-foreground">unknown</span>}</div>
          <div className="text-xs"><span className="font-semibold">Ships to Thailand:</span>{' '}
            {v.ships_to_thailand ? <>{v.ships_to_thailand.ships ? 'yes' : 'no'} <a className="inline-flex items-center gap-0.5 text-primary underline" href={v.ships_to_thailand.url} target="_blank" rel="noreferrer" title={`"${v.ships_to_thailand.quote}"`}>source<ExternalLink className="h-3 w-3" /></a></> : <span className="text-muted-foreground">unknown</span>}</div>
          <div className="text-xs"><span className="font-semibold">Instagram:</span>{' '}
            {v.instagram ? <a className="text-primary underline" href={v.instagram.url} target="_blank" rel="noreferrer">@{v.instagram.handle}</a> : <span className="text-muted-foreground">unverified</span>}</div>
          <p className="pt-1 text-[11px] text-muted-foreground">Pages read: {v.pages.map((p) => `${p.kind} ${p.ok ? '✓' : '✗'}`).join(' · ')}{b.researched_at ? ` · ${new Date(b.researched_at).toLocaleDateString('en-GB')}` : ''}</p>
          {gaps.length > 0
            ? <ToneChip tone="amber" className="mt-1">Not ready to pitch — missing: {gaps.join(', ')}</ToneChip>
            : <ToneChip tone="green" className="mt-1">Research complete</ToneChip>}
        </div>
      )}
    </SubSection>
  );
}
