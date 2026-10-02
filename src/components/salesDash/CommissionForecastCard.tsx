import { TrendingUp, UserX } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { gbp } from '@/components/salesDash/ui';
import { COMMISSION_RECURRING_COUNT, COMMISSION_RECURRING_RATE, ENGAGEMENT_END_UNKNOWN, FORECAST_MONTHS, type CommissionForecast, type EarningsTotals, type ForecastMonth } from '@/lib/commission';

/* ══ THE NEXT SIX MONTHS (Paul, 2026-10-02) ════════════════════════════════════════════════════════
   What a salesperson has earned and what their EXISTING clients are expected to pay them, by London
   calendar month: this month and the next five (src/lib/commission.ts commissionForecast — computed on
   the server from the payments table and each live subscription's next billing date). Never a sale that
   has not happened. Every month keeps COLLECTED (solid) apart from EXPECTED (pale); tapping a month lists
   the clients and payments behind it. Six columns from lg, three on a tablet, stacked on a phone. */

const pct = (r: number) => `${Math.round(r * 100)}%`;
const shortMonth = (ms: string) => new Date(`${ms.slice(0, 7)}-15T12:00:00Z`).toLocaleString('en-GB', { month: 'short', year: 'numeric', timeZone: 'UTC' });
const longMonth = (ms: string) => new Date(`${ms.slice(0, 7)}-15T12:00:00Z`).toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const dayMonth = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' });
const dayMonthYear = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' });
const collectedOf = (m: ForecastMonth) => Math.round((m.earnedNewSale + m.earnedRecurring) * 100) / 100;

function Stat({ label, value, sub, tone, testId }: { label: string; value: number; sub?: string; tone?: 'green'; testId: string }) {
  return (
    <div className="min-w-0 rounded-xl border border-border/60 p-3">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={cn('text-xl font-bold tabular-nums', tone === 'green' && 'text-emerald-600 dark:text-emerald-300')} data-testid={testId}>{gbp(value)}</p>
      {sub && <p className="text-[11px] text-muted-foreground">{sub}</p>}
    </div>
  );
}

function MonthBlock({ m, current, max }: { m: ForecastMonth; current: boolean; max: number }) {
  const collected = collectedOf(m);
  const w = (n: number) => `${max > 0 ? Math.max(0, Math.min(100, (n / max) * 100)) : 0}%`;
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" data-testid="forecast-month" aria-label={`${longMonth(m.monthStart)}: ${gbp(collected)} collected, ${gbp(m.expected)} expected`}
          className={cn('w-full min-w-0 rounded-xl border p-3 text-left transition-colors hover:bg-muted/50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500',
            current ? 'border-emerald-500/50 bg-emerald-500/[0.06]' : 'border-border/60')}>
          <p className="flex items-baseline justify-between gap-2 text-xs font-medium text-muted-foreground">
            <span>{shortMonth(m.monthStart)}</span>{current && <span className="text-[10px] font-semibold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">This month</span>}
          </p>
          <p className="mt-0.5 text-lg font-bold tabular-nums">{gbp(m.total)}</p>
          <div className="mt-1.5 flex h-1.5 overflow-hidden rounded-full bg-muted" aria-hidden>
            <span className="h-full bg-emerald-500" style={{ width: w(collected) }} />
            <span className="h-full bg-emerald-500/35" style={{ width: w(m.expected) }} />
          </div>
          <p className="mt-1.5 text-[11px] tabular-nums text-emerald-700 dark:text-emerald-300" data-testid="forecast-month-collected">{gbp(collected)} collected</p>
          <p className="text-[11px] tabular-nums text-muted-foreground" data-testid="forecast-month-expected">{gbp(m.expected)} expected</p>
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
                    {it.kind === 'reversal' ? 'Refunded — taken back' : `${it.state === 'earned' ? 'Collected' : 'Expected'} · ${it.kind === 'new_sale' ? 'first payment' : 'monthly payment'}`}{it.at ? ` · ${dayMonth(it.at)}` : ''}
                  </span>
                </span>
                <span className={cn('shrink-0 font-semibold tabular-nums', it.state === 'earned' ? 'text-emerald-600 dark:text-emerald-300' : 'text-muted-foreground')}>{gbp(it.amount)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="border-t border-border/60 pt-1.5 text-muted-foreground">{gbp(collected)} collected · {gbp(m.expected)} expected</p>
      </PopoverContent>
    </Popover>
  );
}

export function CommissionForecastCard({ forecast, totals, engagement }: {
  forecast: CommissionForecast; totals: EarningsTotals; engagement: { status: 'active' | 'ended'; endedAt: string | null } | null;
}) {
  const max = Math.max(0, ...forecast.months.map((m) => m.total));
  const now = forecast.months[0];
  const ended = engagement?.status === 'ended';
  return (
    <section className="min-w-0 rounded-2xl border border-border/60 bg-card p-4 shadow-sm sm:p-5" data-testid="commission-forecast">
      <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground"><TrendingUp className="h-3.5 w-3.5" />Your next {FORECAST_MONTHS} months</p>
      {ended && (
        <p className="mt-2 flex items-start gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-2.5 py-1.5 text-xs text-amber-800 dark:text-amber-200" data-testid="forecast-engagement-ended">
          <UserX className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Engagement ended{engagement?.endedAt && engagement.endedAt !== ENGAGEMENT_END_UNKNOWN ? ` on ${dayMonthYear(engagement.endedAt)}` : ''}. Commission earned before then stays payable; client payments after it earn no new commission.
        </p>
      )}
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3">
        <Stat label="Total earned to date" value={totals.earned} tone="green" sub="Collected, after any refunds" testId="forecast-earned-total" />
        {now && <Stat label="This month" value={now.total} sub={`${gbp(collectedOf(now))} collected · ${gbp(now.expected)} expected`} testId="forecast-this-month" />}
        <Stat label={`Expected over ${FORECAST_MONTHS} months`} value={forecast.expectedTotal} sub="Not yet collected · from clients you've already sold" testId="forecast-expected" />
      </div>
      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-3 lg:grid-cols-6" role="list" aria-label="Commission by month">
        {forecast.months.map((m, i) => <div key={m.monthStart} role="listitem" className="min-w-0"><MonthBlock m={m} current={i === 0} max={max} /></div>)}
      </div>
      {forecast.undated.length > 0 && (
        <p className="mt-2 text-[11px] text-muted-foreground" data-testid="forecast-undated">
          Not in any month yet: {forecast.undated.map((u) => `${u.business} (${gbp(u.amount)})`).join(', ')} — Stripe has not set a billing date.
        </p>
      )}
      <p className="mt-3 text-[11px] text-muted-foreground">
        <span className="font-medium text-emerald-700 dark:text-emerald-300">Collected</span> = commission on money clients have actually paid.{' '}
        <span className="font-medium">Expected</span> = {pct(COMMISSION_RECURRING_RATE)} of each live client's next monthly payments (up to {COMMISSION_RECURRING_COUNT} per client), on the date Stripe will bill them — not earned until they pay. A failed or refunded payment drops out. New sales are never guessed.
      </p>
    </section>
  );
}
