import { SEARCH_DEPTHS, SEARCH_DEPTH_LABEL, type SearchDepth } from '@/lib/townSearchArea';
import { depthNote } from '@/lib/searchDepthWords';

/* Standard / Thorough (src/lib/townSearchArea.ts). ONE control, used by Coverage and by Find Leads, so the two
   never look or behave differently. The note under it says what Thorough does and (admins only) its ceiling. */
export function SearchDepthToggle({ value, onChange, showMoney, disabled = false, showNote = true }: {
  value: SearchDepth; onChange: (d: SearchDepth) => void; showMoney: boolean; disabled?: boolean; showNote?: boolean;
}) {
  return (
    <div className="min-w-0 space-y-1">
      <div className={`inline-flex rounded-full border border-border bg-muted/40 p-0.5 text-xs font-medium ${disabled ? 'opacity-50' : ''}`}
        role="group" aria-label="Search depth" data-testid="search-depth">
        {SEARCH_DEPTHS.map((d) => (
          <button key={d} type="button" aria-pressed={value === d} disabled={disabled} onClick={() => onChange(d)}
            data-testid={`search-depth-${d}`}
            className={`rounded-full px-3 py-1 transition-colors ${value === d ? 'bg-primary text-primary-foreground' : 'text-foreground/80 hover:text-primary'}`}>
            {SEARCH_DEPTH_LABEL[d]}
          </button>
        ))}
      </div>
      {showNote && <p className="text-[11px] text-muted-foreground" data-testid="search-depth-note">{depthNote(value, showMoney)}</p>}
    </div>
  );
}
