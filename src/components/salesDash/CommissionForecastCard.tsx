import { CalendarRange, Info, PiggyBank, TrendingUp, UserX, Wallet } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { KpiCard, Panel, gbp } from '@/components/salesDash/ui';
import { COMMISSION_RECURRING_COUNT_V3, COMMISSION_RECURRING_RATE, ENGAGEMENT_END_UNKNOWN, FORECAST_MONTHS, type CommissionForecast, type EarningsTotals, type ForecastMonth } from '@/lib/commission';

/* ══ YOUR MONEY — THREE FIGURES AND THE NEXT SIX MONTHS (Paul, 2026-10-02; redesigned the same day) ══
   EarningsStats: the three money figures, each once, beside the month's ladder — earned this month,
   total earned to date, and expected over the next six months. CommissionForecastCard: the six months
   (this month and the next five, London calendar months) as ONE bar chart, collected solid teal and
   expected violet stacked, tap a month for the clients behind it.
   Everything comes from src/lib/commission.ts commissionForecast / earningsTotals, computed on the server
   from the payments table and each live subscription's next billing date. Never a sale that has not
   happened. */

const pct = (r: number) => `${Math.round(r * 100)}%`;
const shortMonth = (ms: string) => new Date(`${ms.slice(0, 7)}-15T12:00:00Z`).toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' });
const longMonth = (ms: string) => new Date(`${ms.slice(0, 7)}-15T12:00:00Z`).toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const dayMonth = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' });
const dayMonthYear = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' });
const collectedOf = (m: ForecastMonth) => Math.round((m.earnedNewSale + m.earnedRecurring) * 100) / 100;
/** The bar area's height in px; a month with anything in it never draws thinner than BAR_MIN_PX. */
const BAR_PX = 120;
const BAR_MIN_PX = 6;

/** The three money figures, beside the hero. Stacked from lg; three across on a tablet; stacked on a phone. */
export function EarningsStats({ totals, forecast }: { totals: EarningsTotals; forecast: CommissionForecast | null }) {
  const payout = new Date(`${totals.nextPayoutDate}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-3 lg:grid-cols-1" data-testid="earnings-stats">
      <KpiCard tone="green" icon={PiggyBank} label="Earned this month" value={<span data-testid="ladder-earned">{gbp(totals.earnedThisMonth)}</span>} sub={`${gbp(totals.due)} due to you on ${payout}`} />
      <KpiCard tone="blue" icon={Wallet} label="Total earned to date" value={<span data-testid="forecast-earned-total">{gbp(totals.earned)}</span>} sub="Collected, after any refunds" />
      {forecast && <KpiCard tone="purple" icon={TrendingUp} label={`Expected over ${FORECAST_MONTHS} months`} value={<span data-testid="forecast-expected">{gbp(forecast.expectedTotal)}</span>} sub="From clients you've already sold" />}
    </div>
  );
}

function MonthBar({ m, current, max }: { m: ForecastMonth; current: boolean; max: number }) {
  const collected = collectedOf(m);
  const px = (n: number) => (max > 0 && n > 0 ? Math.max(BAR_MIN_PX, Math.round((n / max) * BAR_PX)) : 0);
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" data-testid="forecast-month" aria-label={`${longMonth(m.monthStart)}: ${gbp(collected)} collected, ${gbp(m.expected)} expected`}
          className={cn('group flex w-full min-w-0 flex-col items-center rounded-2xl border px-1.5 pb-3 pt-3 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-400',
            current ? 'border-teal-400/40 bg-teal-500/[0.10]' : 'border-transparent hover:border-border/70 hover:bg-muted/40')}>
          <span className="text-sm font-extrabold tabular-nums tracking-tight sm:text-base">{gbp(m.total)}</span>
          <span className="mt-2.5 flex w-full items-end justify-center" style={{ height: BAR_PX }} aria-hidden>
            <span className="flex w-full max-w-[3rem] flex-col justify-end overflow-hidden rounded-xl bg-muted/60" style={{ height: BAR_PX }}>
              {m.expected > 0 && <span className="w-full bg-gradient-to-b from-violet-400 to-violet-600" style={{ height: px(m.expected) }} />}
              {collected > 0 && <span className="w-full bg-gradient-to-b from-teal-300 to-teal-500" style={{ height: px(collected) }} />}
            </span>
          </span>
          <span className={cn('mt-2.5 text-xs font-bold', current ? 'text-teal-600 dark:text-teal-300' : 'text-muted-foreground group-hover:text-foreground')}>{current ? 'This month' : shortMonth(m.monthStart)}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 space-y-2 p-3 text-xs" align="center" data-testid="forecast-month-detail">
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
                <span className={cn('shrink-0 font-semibold tabular-nums', it.state === 'earned' ? 'text-teal-600 dark:text-teal-300' : 'text-violet-600 dark:text-violet-300')}>{gbp(it.amount)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="flex justify-between gap-2 border-t border-border/60 pt-1.5">
          <span className="font-medium text-teal-700 dark:text-teal-300" data-testid="forecast-month-collected">{gbp(collected)} collected</span>
          <span className="text-violet-700 dark:text-violet-300" data-testid="forecast-month-expected">{gbp(m.expected)} expected</span>
        </p>
      </PopoverContent>
    </Popover>
  );
}

/** The next six months as one bar chart. */
export function CommissionForecastCard({ forecast, engagement }: {
  forecast: CommissionForecast; engagement: { status: 'active' | 'ended'; endedAt: string | null } | null;
}) {
  const max = Math.max(0, ...forecast.months.map((m) => m.total));
  const ended = engagement?.status === 'ended';
  return (
    <Panel title={`Your next ${FORECAST_MONTHS} months`} icon={CalendarRange} tone="purple" className="h-full"
      hint="What you've collected and what clients you've already sold are expected to pay you. Tap a month for the clients.">
      <div data-testid="commission-forecast">
        {ended && (
          <p className="mb-3 flex items-start gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200" data-testid="forecast-engagement-ended">
            <UserX className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Engagement ended{engagement?.endedAt && engagement.endedAt !== ENGAGEMENT_END_UNKNOWN ? ` on ${dayMonthYear(engagement.endedAt)}` : ''}. Commission earned before then stays payable; client payments after it earn no new commission.
          </p>
        )}
        <div className="grid grid-cols-3 gap-1.5 sm:grid-cols-6" role="list" aria-label="Commission by month">
          {forecast.months.map((m, i) => <div key={m.monthStart} role="listitem" className="min-w-0"><MonthBar m={m} current={i === 0} max={max} /></div>)}
        </div>
        <div className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-xs text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-teal-400" />Collected</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-violet-500" />Expected</span>
        </div>
        {forecast.undated.length > 0 && (
          <p className="mt-2 text-[11px] text-muted-foreground" data-testid="forecast-undated">
            Not in any month yet: {forecast.undated.map((u) => `${u.business} (${gbp(u.amount)})`).join(', ')} — Stripe has not set a billing date.
          </p>
        )}
        <p className="mt-3 flex items-start gap-1.5 border-t border-border/60 pt-3 text-[11px] leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 h-3 w-3 shrink-0" />
          <span>
            Expected is {pct(COMMISSION_RECURRING_RATE)} of each live client's next monthly payments (up to {COMMISSION_RECURRING_COUNT_V3} per client on the current terms), plus first-payment commission still pending its Approval Date, on the date Stripe will bill them — not earned until they pay. A failed or refunded payment drops out. New sales are never guessed.
          </span>
        </p>
      </div>
    </Panel>
  );
}
