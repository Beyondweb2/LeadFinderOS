/* ════════════════════════════════════════════════════════════════════════════════════════════════
   A DASHBOARD SECTION THAT REMEMBERS WHETHER IT IS SHUT.

   🔴 WHY (Paul, 2026-09-13): "the cards added over the last two days are massive". Measured against
   live data before building, because line count is not height and I got this wrong once on the way:
   NextActionsCard renders 43 task rows with no `slice`, which looks like the worst offender and is
   not — it caps itself at max-h-[220px] and scrolls internally. The real one is
   CampaignStatsSection, the only card that multiplies a 386-line component by a row count (13
   campaigns, every one expanded, no cap anywhere in the chain).

   ⛔ TIER 'local', NOT 'session'. Paul's requirement is that a collapse survives navigation AND
   reload. Session storage survives navigation and dies on a new tab, which would quietly re-open
   everything he shut yesterday — the difference is invisible until it annoys you.

   ⛔ ONE KEY PER SECTION, and the key is passed in rather than derived from the title. A key built
   from a heading silently moves the moment the heading is reworded, and every card springs open
   again with nothing to explain why. usePersistedState binds its key once per hook lifetime
   anyway (§6c), so a changing key is the bug it already warns about.

   ⛔ WHAT THIS IS NOT: the review tab. That is not a card, does not collapse, and is deliberately
   not reachable from here — it is the one thing Paul must not be able to ignore, and a collapse
   control on it would make it ignorable in one click.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import type { ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { usePersistedState } from '@/hooks/usePersistedState';

interface DashboardSectionProps {
  /** Stable storage key. Never derive this from the title — see the header. */
  storageKey: string;
  title: string;
  /** Whether it starts OPEN the first time this browser ever sees it. */
  defaultOpen: boolean;
  /** Optional one-line summary shown while collapsed, so a shut card still says something. */
  collapsedHint?: string;
  children: ReactNode;
}

export function DashboardSection({ storageKey, title, defaultOpen, collapsedHint, children }: DashboardSectionProps) {
  const [open, setOpen] = usePersistedState<boolean>(
    `dashboard.section.${storageKey}`,
    defaultOpen,
    { tier: 'local' },
  );

  return (
    <section>
      <h2 className="mb-2 sm:mb-3">
        <button
          type="button"
          onClick={() => setOpen(!open)}
          aria-expanded={open}
          className="flex w-full items-center gap-1.5 text-left text-xs font-medium text-muted-foreground transition-colors hover:text-foreground sm:text-sm"
        >
          {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
          <span>{title}</span>
          {/* ⚠️ A COLLAPSED SECTION STILL SAYS SOMETHING. A row of bare headings gives no reason to
              open any of them, which turns "collapsed by default" into "gone". */}
          {!open && collapsedHint && (
            <span className="truncate font-normal text-muted-foreground/70">— {collapsedHint}</span>
          )}
        </button>
      </h2>
      {/* ⛔ UNMOUNTED WHEN SHUT, not hidden with CSS. These cards run their own React Query reads;
          leaving them mounted behind `display:none` would keep every one of them fetching and
          polling for a panel nobody can see, which is most of the cost this change exists to save. */}
      {open && children}
    </section>
  );
}
