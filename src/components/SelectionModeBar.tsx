import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { selectionModeOf, selectionModeText } from '@/lib/selectionMode';

/* The bulk-tick bar over a leads table (2026-10-14): "Select this page" ticks ONLY the rows showing now (replacing
   any earlier ticks); "Select all" ticks every matching row on every page — the header box's existing behaviour.
   The line says how many are ticked and which mode is on (src/lib/selectionMode.ts). It never acts on a lead; the
   table's bulk actions read the same ticked ids they always did. */
export function SelectionModeBar({ pageIds, allIds, selected, onChange, allDisabled = false, allDisabledTitle, noun = 'lead', className }: {
  /** The selectable rows on the current page. */
  pageIds: readonly string[];
  /** Every selectable row matching the filters, across all pages (what "Select all" ticks). */
  allIds: readonly string[];
  selected: ReadonlySet<string>;
  onChange: (next: Set<string>) => void;
  /** "Select all" waits for the whole list (Outreach's progressive load). */
  allDisabled?: boolean;
  allDisabledTitle?: string;
  noun?: string;
  className?: string;
}) {
  if (!pageIds.length) return null;
  const mode = selectionModeOf(selected, pageIds, allIds);
  const onePage = allIds.length <= pageIds.length;
  return (
    <div className={cn('flex flex-wrap items-center gap-2 text-xs', className)} data-testid="selection-bar" data-mode={mode}>
      <Button type="button" size="sm" variant={mode === 'page' ? 'default' : 'outline'} className="h-7 text-xs"
        onClick={() => onChange(new Set(pageIds))} data-testid="select-page" aria-pressed={mode === 'page'}>
        Select this page ({pageIds.length})
      </Button>
      {!onePage && (
        <Button type="button" size="sm" variant={mode === 'all' ? 'default' : 'outline'} className="h-7 text-xs"
          onClick={() => onChange(new Set(allIds))} disabled={allDisabled} title={allDisabled ? allDisabledTitle : undefined}
          data-testid="select-all-pages" aria-pressed={mode === 'all'}>
          Select all {allIds.length.toLocaleString()} (every page)
        </Button>
      )}
      <span className={cn('font-medium', mode === 'none' ? 'text-muted-foreground' : mode === 'all' ? 'text-amber-700 dark:text-amber-400' : 'text-primary')}
        data-testid="selection-mode-text" aria-live="polite">
        {selectionModeText(mode, selected.size, allIds.length, noun)}
      </span>
      {mode !== 'none' && (
        <button type="button" className="text-muted-foreground underline underline-offset-2 hover:no-underline" onClick={() => onChange(new Set())} data-testid="select-clear">
          Clear
        </button>
      )}
    </div>
  );
}
