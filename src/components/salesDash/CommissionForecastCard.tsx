import { TrendingUp } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { gbp } from '@/components/salesDash/ui';
import { COMMISSION_RECURRING_COUNT, COMMISSION_RECURRING_RATE, type CommissionForecast, type EarningsTotals, type ForecastMonth } from '@/lib/commission';

/* ══ THE NEXT SIX MONTHS (Paul, 2026-10-01) ════════════════════════════════════════════════════════
   What a salesperson has earned and what their EXISTING clients are expected to pay them, by London
   calendar month: this month and the next five (src/lib/commissionForecast — computed on the server
   from the payments table and each live subscription's next billing date). Never a sale that has not
   happened. Each month splits collected from expected; tapping one lists the clients behind it.
   Six columns from lg, three on a tablet, stacked on a phone. */

const pct = (r: number) => `${Math.round(r * 100)}%`;
const shortMonth = (ms: string) => new Date(`${ms.slice(0, 7)}-15T12:00:00Z`).toLocaleString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const longMonth = (ms: string) => new Date(`${ms.slice(0, 7)}-15T12:00:00Z`).toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const dayMonth = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' });

function Stat({ label, value, sub, tone, testId }: { label: string; value: number; sub?: string; tone?: 'green' | 'muted'; testId: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border/60 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('text-xl font-bold tabular-nums', tone === 'green' && 'text-emerald-600 dark:text-emerald-300')} data-testid={testId}>{gbp(value)}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function MonthBlock({ m, current, max }: { m: ForecastMonth; current: boolean; max: number }) {
  const earned = m.earnedNewSale + m.earnedRecurring;
  const w = (n: number) => `${max > 0 ? Math.max(0, Math.min(100, (n / max) * 100)) : 0}%`;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" data-testid="forecast-month" aria-label={`${longMonth(m.monthStart)}: ${gbp(m.total)}`}
          className={cn('w-full min-w-0 rounded-xl border p-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500',
            current ? 'border-emerald-500/50 bg-emerald-500/[0.06]' : 'border-border/60')}>
          <p className="flex items-baseline justify-between gap-2 text-xs font-medium text-muted-foreground">
            <span>{shortMonth(m.monthStart)}</span>{current && <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">This month</span>}
          </p>
          <p className="mt-0.5 text-lg font-bold tabular-nums">{gbp(m.total)}</p>
          <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
            <span className="h-full bg-emerald-500" style={{ width: w(earned) }} />
            <span className="h-full bg-emerald-500/35" style={{ width: w(m.expected) }} />
          </div>
          <p className="mt-1.5 text-[11px] tabular-nums"><span className="text-emerald-700 dark:text-emerald-300">{gbp(earned)} collected</span></p>
          <p className="text-[11px] tabular-nums text-muted-foreground">{gbp(m.expected)} expected</p>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-2 p-3 text-xs" align="start" data-testid="forecast-month-detail">
        <p className="text-sm font-semibold">{longMonth(m.monthStart)}</p>
        {m.items.length === 0 ? <p className="text-muted-foreground">Nothing collected or expected this month.</p> : (
          <ul className="space-y-1">
            {m.items.map((it, i) => (
              <li key={`${it.leadId}-${it.state}-${it.kind}-${i}`} className="flex items-baseline justify-between gap-2">
                <span className="min-w-0">
                  <span className="block truncate font-medium">{it.business}</span>
                  <span className="text-muted-foreground">
                    {it.kind === 'reversal' ? 'Refunded — taken back' : `${it.state === 'earned' ? 'Collected' : 'Expected'} · ${it.kind === 'new_sale' ? 'new sale' : 'monthly payment'}`}{it.at ? ` · ${dayMonth(it.at)}` : ''}
                  </span>
                </span>
                <span className={cn('shrink-0 font-semibold tabular-nums', it.state === 'earned' ? 'text-emerald-600 dark:text-emerald-300' : 'text-muted-foreground')}>{gbp(it.amount)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="border-t border-border/60 pt-1.5 text-muted-foreground">{gbp(earned)} collected · {gbp(m.expected)} expected</p>
      </PopoverContent>
    </Popover>
  );
}

export function CommissionForecastCard({ forecast, totals }: { forecast: CommissionForecast; totals: EarningsTotals }) {
  const max = Math.max(0, ...forecast.months.map((m) => m.total));
  return (
    <section className="min-w-0 rounded-2xl border border-border/60 bg-card p-4 shadow-sm sm:p-5" data-testid="commission-forecast">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground"><TrendingUp className="h-3.5 w-3.5" />Your next 6 months</p>
      <div className="mt-3 grid grid-cols-2 gap-2 lg:grid-cols-4">
        <Stat label="Earned this month" value={totals.earnedThisMonth} tone="green" testId="forecast-earned-month" />
        <Stat label="Total earned to date" value={totals.earned} testId="forecast-earned-total" />
        <Stat label="Expected next 6 months" value={forecast.expectedTotal} sub="From clients you've already sold" testId="forecast-expected" />
        <Stat label="6-month total" value={forecast.periodTotal} sub="Collected + expected" testId="forecast-period-total" />
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-6" role="list" aria-label="Commission by month">
        {forecast.months.map((m, i) => <div key={m.monthStart} role="listitem" className="min-w-0"><MonthBlock m={m} current={i === 0} max={max} /></div>)}
      </div>
      {forecast.undated.length > 0 && (
        <p className="mt-2 text-[11px] text-muted-foreground" data-testid="forecast-undated">
          Not counted yet: {forecast.undated.map((u) => `${u.business} (${gbp(u.amount)})`).join(', ')} — no billing date from Stripe yet.
        </p>
      )}
      <p className="mt-3 text-[11px] text-muted-foreground">
        Expected = {pct(COMMISSION_RECURRING_RATE)} of each live client's next monthly payments (up to {COMMISSION_RECURRING_COUNT} per client), on the date Stripe will bill them. A payment that fails or is refunded drops out. New sales are never guessed.
      </p>
    </section>
  );
}
