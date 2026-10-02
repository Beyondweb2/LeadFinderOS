import { ExternalLink, Loader2, Sparkles } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { ageText, businessAge, companyProfileUrl, statusWords, type AgeState, type CompaniesHouseCheckRow } from '@/lib/companiesHouse';

/* ══ BUSINESS AGE — one cell (Find Leads) (2026-10-02) ═════════════════════════════════════════════
   "NEW · 3 weeks", "8 months", "2 years", "Possible match", "Not found", "Checking…", "Not checked", or
   "—" (has a website: never checked). A click opens WHY in plain words — the company, its date and the
   match evidence; never the raw record. NEW is the one stand-out, and it is a quiet one. */

const fmtDate = (iso: string | null) => (iso ? new Date(`${iso}T00:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' }) : 'not given');
const MATCH_WORDS = { strong: 'Strong match', possible: 'Possible match', none: 'Not found' } as const;

export function BusinessAgeCell({ state, row, unavailableWhy, compact = false }: {
  state: AgeState; row: CompaniesHouseCheckRow | null; unavailableWhy?: string | null; compact?: boolean;
}) {
  const text = compact ? 'text-[11px]' : 'text-xs';
  if (state === 'skipped') return <span className={cn(text, 'text-muted-foreground')} data-testid="business-age" data-age="skipped" title="Has a website — not checked">—</span>;
  if (state === 'checking') return <span className={cn(text, 'inline-flex items-center gap-1 text-muted-foreground')} data-testid="business-age" data-age="checking"><Loader2 className="h-3 w-3 animate-spin" />Checking…</span>;
  if (state === 'unavailable' || !row) return <span className={cn(text, 'text-muted-foreground')} data-testid="business-age" data-age="unavailable" title={unavailableWhy ?? 'Not checked yet'}>Not checked</span>;

  const age = row.match === 'strong' ? businessAge(row.incorporated_on, new Date()) : null;
  const label = state === 'possible' ? 'Possible match' : state === 'not_found' ? 'Not found' : age ? ageText(age) : 'Possible match';
  const tone = state === 'new'
    ? 'border-emerald-600/40 bg-emerald-500/10 text-emerald-800 dark:text-emerald-300 font-semibold'
    : state === 'months' || state === 'years' ? 'border-border bg-background text-foreground'
    : 'border-dashed border-border bg-transparent text-muted-foreground';
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" data-testid="business-age" data-age={state} onClick={(e) => e.stopPropagation()}
          className={cn('inline-flex max-w-full items-center gap-1 whitespace-nowrap rounded-full border px-2 py-0.5', text, tone)}
          aria-label={`Business age: ${label}. Show why.`}>
          {state === 'new' && <Sparkles className="h-3 w-3 shrink-0" />}<span className="truncate">{label}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-2 p-3 text-xs" align="start">
        <p className="text-sm font-semibold">{MATCH_WORDS[row.match]}</p>
        {row.company_name && (
          <div>
            <p className="text-muted-foreground">Companies House{row.match === 'possible' ? ' (closest record)' : ''}:</p>
            <p className="font-medium">{row.company_name}</p>
          </div>
        )}
        {row.company_name && (
          <div className="grid grid-cols-[auto,1fr] gap-x-2 gap-y-0.5">
            <span className="text-muted-foreground">Incorporated</span><span>{fmtDate(row.incorporated_on)}</span>
            <span className="text-muted-foreground">Status</span><span className="capitalize">{statusWords(row.company_status)}</span>
            {row.company_number && <><span className="text-muted-foreground">Company number</span><span>{row.company_number}</span></>}
            {(row.registered_locality || row.registered_postcode) && <><span className="text-muted-foreground">Registered office</span><span>{[row.registered_locality, row.registered_postcode].filter(Boolean).join(', ')}</span></>}
          </div>
        )}
        <div>
          <p className="mb-1 font-semibold">{row.match === 'none' ? 'Why' : 'Match evidence'}</p>
          <ul className="list-disc space-y-0.5 pl-4 text-muted-foreground">{(row.evidence ?? []).map((e, i) => <li key={i}>{e}</li>)}</ul>
        </div>
        {row.company_number && (
          <a href={companyProfileUrl(row.company_number)} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline">
            Open on Companies House <ExternalLink className="h-3 w-3" />
          </a>
        )}
        <p className="text-[11px] text-muted-foreground">Checked {new Date(row.checked_at).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' })}. A machine match — not confirmed.{row.match === 'none' ? ' Not found does not mean unregistered: sole traders have no record.' : ''}</p>
      </PopoverContent>
    </Popover>
  );
}
