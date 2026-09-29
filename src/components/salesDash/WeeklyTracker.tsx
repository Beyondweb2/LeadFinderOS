import { CalendarRange } from 'lucide-react';
import { WEEKLY_TIERS, weeklyTracker, weeklyTrackerNextLine, type CommissionLine } from '@/lib/commission';
import { cn } from '@/lib/utils';
import { Panel, gbp } from './ui';

/* ══ THIS WEEK'S COMMISSION TIER (Paul, 2026-09-29) — src/lib/commission.ts weeklyTracker has the rule ══
   Monday–Sunday, from the SAME earnings lines the Earnings page lists. Compact: the count, what it earned,
   the current tier, and what the next client unlocks. */
const pct = (r: number) => `${Math.round(r * 100)}%`;
const dm = (d: string) => new Date(`${d}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });

export function WeeklyTierTracker({ lines, todayIso = new Date().toISOString() }: { lines: CommissionLine[] | undefined; todayIso?: string }) {
  if (!lines) return null;
  const t = weeklyTracker(lines, todayIso);
  const bands = WEEKLY_TIERS.map((b, i) => ({ ...b, from: i === 0 ? 1 : WEEKLY_TIERS[i - 1].upTo + 1 }));
  return (
    <Panel title="This week's tier" icon={CalendarRange} tone="green" hint={`Monday ${dm(t.weekStart)} – Sunday ${dm(t.weekEnd)}. Resets every Monday. Each client keeps the rate of their own place in the week.`}>
      <div className="flex flex-wrap items-end justify-between gap-3" data-testid="weekly-tier-tracker">
        <div>
          <p className="text-2xl font-bold tabular-nums">{t.clients} <span className="text-sm font-medium text-muted-foreground">client{t.clients === 1 ? '' : 's'} this week</span></p>
          <p className="text-sm text-muted-foreground">{gbp(t.earned)} initial-payment commission</p>
        </div>
        <div className="text-right">
          <p className="text-sm">Current tier: <span className="font-bold">{pct(t.currentRate)}</span></p>
          <p className={cn('text-sm font-semibold', t.topTier ? 'text-emerald-600 dark:text-emerald-300' : 'text-foreground')}>{weeklyTrackerNextLine(t)}</p>
        </div>
      </div>
      <ol className="mt-3 grid grid-cols-3 gap-1.5 text-center text-[11px]" aria-label="Weekly tiers">
        {bands.map((b) => {
          const active = t.currentRate === b.rate;
          return (
            <li key={b.rate} className={cn('rounded-lg border px-1 py-1.5', active ? 'border-emerald-500 bg-emerald-500/10 font-semibold' : 'border-border/60 text-muted-foreground')}>
              <span className="block text-sm tabular-nums">{pct(b.rate)}</span>
              {Number.isFinite(b.upTo) ? `clients ${b.from}–${b.upTo}` : `client ${b.from}+`}
            </li>
          );
        })}
      </ol>
    </Panel>
  );
}
