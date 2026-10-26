/* THE DASHBOARD'S "YOUR NEXT ACTIONS" (Paul, 2026-10-26). One row per lead with a Next Action: how many days until it is
   due (or overdue), what it is, what to do (the note), when; Open goes where it is done; the Next Action cell edits it and
   ✓ completes it through the one write (NextActionEditor → lead_set_follow_up, History). Rules: src/lib/myNextActions.ts. */
import { useMemo, useState } from 'react';
import { ArrowRight, CalendarClock, Loader2, AlertTriangle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { Panel, Segmented, TONE, type Tone } from '@/components/salesDash/ui';
import { NextActionEditor } from '@/components/NextActionEditor';
import { useMyNextActions } from '@/hooks/useMyNextActions';
import { usePersistedState } from '@/hooks/usePersistedState';
import { buildMyNextActions, nextActionCounts, type MyNextActionRow, type NextActionScope } from '@/lib/myNextActions';
import { leadTarget, nextActionLink } from '@/lib/salesLinks';

const SHOW_FIRST = 12;

function toneOf(r: MyNextActionRow): Tone {
  if (r.view.bucket === 'overdue') return 'red';
  if (r.days === 0) return 'amber';
  if (r.days !== null && r.days <= 2) return 'blue';
  return 'grey';
}

export function NextActionsList({ meId, nameOf, cardMenu }: { meId: string | null; nameOf: (userId: string | null) => string | null; cardMenu?: React.ReactNode }) {
  const navigate = useNavigate();
  const q = useMyNextActions();
  const [scope, setScope] = usePersistedState<NextActionScope>('dashboard-next-actions-scope', 'mine');
  const [showAll, setShowAll] = useState(false);
  const rows = useMemo(() => q.data ? buildMyNextActions(q.data.leads, q.data.setters, meId, scope === 'everyone' ? 'everyone' : 'mine') : [], [q.data, meId, scope]);
  const counts = nextActionCounts(rows);
  const shown = showAll ? rows : rows.slice(0, SHOW_FIRST);
  return (
    <Panel title="Your next actions" icon={CalendarClock} tone={counts.overdue ? 'red' : counts.today ? 'amber' : 'blue'} action={cardMenu}
      hint="Next actions set on leads, soonest first: how many days until each is due, what to do, and ✓ to close it. Editing or closing here is the same as on the lead.">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <Segmented label="Whose next actions" value={scope === 'everyone' ? 'everyone' : 'mine'} onChange={(k) => setScope(k)}
          options={[{ key: 'mine', label: 'Set by me' }, { key: 'everyone', label: 'Everyone' }]} />
        {!!rows.length && (
          <p className="flex flex-wrap gap-x-3 text-xs" data-testid="next-actions-counts">
            <span className={TONE.red.text}>{counts.overdue} overdue</span>
            <span className={TONE.amber.text}>{counts.today} today</span>
            <span className="text-muted-foreground">{counts.week} in the next 7 days</span>
          </p>
        )}
      </div>
      {q.isError ? (
        <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-destructive/40 bg-destructive/10 p-3 text-sm">
          <AlertTriangle className="h-4 w-4 text-destructive" />Could not load your next actions: {(q.error as Error)?.message ?? 'error'}
          <Button size="sm" variant="outline" onClick={() => void q.refetch()}>Try again</Button>
        </div>
      ) : q.isLoading ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><Loader2 className="h-4 w-4 animate-spin" />Loading…</p>
        : !rows.length ? <p className="rounded-2xl bg-muted/30 px-4 py-6 text-center text-sm text-muted-foreground">{scope === 'everyone' ? 'No next actions set on any lead.' : 'You have no next actions set.'}</p> : (
        <>
          <ul className="divide-y divide-border/60 overflow-hidden rounded-2xl border border-border/60 bg-muted/10" data-testid="next-actions">
            {shown.map((r) => {
              const tone = toneOf(r);
              const [path] = leadTarget(nextActionLink(r.lead.next_action), r.lead.id);
              return (
                <li key={r.lead.id} className="flex min-w-0 flex-col gap-2 px-3 py-2.5 sm:flex-row sm:items-center">
                  <div className={cn('flex shrink-0 items-center justify-center rounded-xl px-2.5 py-1.5 text-center text-xs font-semibold sm:w-28', TONE[tone].soft, TONE[tone].text)} data-testid="next-action-days">
                    {r.daysLabel}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-baseline gap-x-2">
                      <span className="truncate text-sm font-semibold">{r.lead.is_potential_work && <span className="text-yellow-400">★ </span>}{r.lead.business_name || 'Unnamed lead'}</span>
                      {scope === 'everyone' && r.setBy && !r.mine && <span className="text-[11px] text-muted-foreground">set by {nameOf(r.setBy) ?? 'a team member'}</span>}
                    </p>
                    <p className={cn('text-xs', r.view.note ? 'text-foreground/90' : 'italic text-muted-foreground')}>{r.view.note ?? 'No note on what to do.'}</p>
                  </div>
                  <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                    {/* The action, day and time — click to edit, ✓ to close (the one Next Action editor). */}
                    <NextActionEditor lead={{ ...r.lead }} variant="pill" />
                    <Button size="sm" variant="outline" className="h-8 gap-1 rounded-full" onClick={() => navigate(path)} data-testid="next-action-open">
                      Open<ArrowRight className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </li>
              );
            })}
          </ul>
          {rows.length > SHOW_FIRST && (
            <button type="button" className="mt-2 text-xs font-semibold text-primary" onClick={() => setShowAll((v) => !v)}>
              {showAll ? 'Show fewer' : `Show all ${rows.length}`}
            </button>
          )}
        </>
      )}
    </Panel>
  );
}
