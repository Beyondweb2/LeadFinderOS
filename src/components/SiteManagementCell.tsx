import { Building2, CircleHelp, Loader2, ShieldCheck } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { AGENCY_CLASS_LABEL } from '@/lib/agencyDetect';
import { agencyCellText, isHighConfidenceAgency, type AgencyCheckRow } from '@/lib/agencyCheck';

/* ══ "WHO RUNS THEIR WEBSITE?" — one cell (Find Leads; the lead's Work panel) (2026-10-01) ═════════
   Compact: "Agency likely · 92%", "No agency evidence · 78%", "Checking…", "Unknown", or "—" with no
   website. A click opens WHY in plain words — the rep never reads HTML. */

const confidenceWord = (c: number) => (c >= 85 ? 'High confidence' : c >= 70 ? 'Fair confidence' : 'Low confidence');

export function SiteManagementCell({ row, checking, hasWebsite, compact = false }: { row: AgencyCheckRow | null; checking: boolean; hasWebsite: boolean; compact?: boolean }) {
  if (!hasWebsite) return <span className="text-xs text-muted-foreground" data-testid="site-mgmt">—</span>;
  if (!row) {
    return checking
      ? <span className="inline-flex items-center gap-1 text-xs text-muted-foreground" data-testid="site-mgmt"><Loader2 className="h-3 w-3 animate-spin" />Checking…</span>
      : <span className="text-xs text-muted-foreground" data-testid="site-mgmt">Not checked</span>;
  }
  const high = isHighConfidenceAgency(row);
  const tone = row.classification === 'agency_likely'
    ? (high ? 'border-red-500/40 bg-red-500/10 text-red-700 dark:text-red-300' : 'border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300')
    : row.classification === 'no_evidence' ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300' : 'border-border bg-muted/50 text-muted-foreground';
  const Icon = row.classification === 'agency_likely' ? Building2 : row.classification === 'no_evidence' ? ShieldCheck : CircleHelp;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" data-testid="site-mgmt" data-site={row.classification} onClick={(e) => e.stopPropagation()}
          className={cn('inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5 font-medium', compact ? 'text-[11px]' : 'text-xs', tone)}
          aria-label={`Site management: ${agencyCellText(row)}. Show why.`}>
          <Icon className="h-3 w-3 shrink-0" /><span className="truncate">{agencyCellText(row, compact)}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-2 p-3 text-xs" align="start">
        <p className="text-sm font-semibold">{AGENCY_CLASS_LABEL[row.classification]}{row.classification !== 'unknown' ? ` · ${confidenceWord(row.confidence)}` : ''}</p>
        {row.agency && <p className="text-muted-foreground">Looks like it is run by <span className="font-medium text-foreground">{row.agency}</span>{row.agency_domain ? ` (${row.agency_domain})` : ''}.</p>}
        <div>
          <p className="mb-1 font-semibold">{row.classification === 'unknown' ? 'Why we could not tell' : 'Evidence'}</p>
          <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">{(row.evidence ?? []).map((e, i) => <li key={i}>{e}</li>)}</ul>
        </div>
        <p className="text-[11px] text-muted-foreground">{row.pages_checked} page{row.pages_checked === 1 ? '' : 's'} of {row.domain} checked {new Date(row.checked_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}. A machine check — not certain.</p>
      </PopoverContent>
    </Popover>
  );
}
