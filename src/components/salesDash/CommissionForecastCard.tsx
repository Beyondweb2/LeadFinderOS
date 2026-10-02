import { Info, PiggyBank, TrendingUp, UserX, Wallet } from 'lucide-react';
import type { ComponentType } from 'react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { Panel, TONE, gbp, type Tone } from '@/components/salesDash/ui';
import { COMMISSION_RECURRING_COUNT, COMMISSION_RECURRING_RATE, ENGAGEMENT_END_UNKNOWN, FORECAST_MONTHS, type CommissionForecast, type EarningsTotals, type ForecastMonth } from '@/lib/commission';

/* ══ YOUR EARNINGS — THE NEXT SIX MONTHS (Paul, 2026-10-02; redesigned the same day) ═══════════════
   What a salesperson has earned and what their EXISTING clients are expected to pay them, by London
   calendar month: this month and the next five (src/lib/commission.ts commissionForecast — computed on
   the server from the payments table and each live subscription's next billing date). Never a sale that
   has not happened. Three figures on top (earned to date, this month, expected over six months), then
   the six months as one bar chart: COLLECTED solid, EXPECTED pale, stacked, so the shape of the next
   half-year reads at a glance. Tapping a month lists the clients and payments behind it. Three columns on
   a phone, six from sm. */

const pct = (r: number) => `${Math.round(r * 100)}%`;
const shortMonth = (ms: string) => new Date(`${ms.slice(0, 7)}-15T12:00:00Z`).toLocaleString('en-GB', { month: 'short', timeZone: 'UTC' });
const longMonth = (ms: string) => new Date(`${ms.slice(0, 7)}-15T12:00:00Z`).toLocaleString('en-GB', { month: 'long', year: 'numeric', timeZone: 'UTC' });
const dayMonth = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' });
const dayMonthYear = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/London' });
const collectedOf = (m: ForecastMonth) => Math.round((m.earnedNewSale + m.earnedRecurring) * 100) / 100;
/** The bar area's height in px; a month with anything in it never draws thinner than BAR_MIN_PX. */
const BAR_PX = 112;
const BAR_MIN_PX = 6;

function Stat({ label, value, sub, tone, icon: I, solid, testId }: { label: string; value: number; sub?: string; tone: Tone; icon: ComponentType<{ className?: string }>; solid?: boolean; testId: string }) {
  return (
    <div className={cn('relative min-w-0 overflow-hidden rounded-2xl p-4', solid ? TONE[tone].solid : TONE[tone].tint)}>
      <div className="flex items-center justify-between gap-2">
        <p className={cn('text-xs font-semibold', solid ? 'text-white/85' : 'text-muted-foreground')}>{label}</p>
        <span className={cn('flex h-7 w-7 shrink-0 items-center justify-center rounded-lg', solid ? 'bg-white/20' : TONE[tone].solid)}><I className="h-3.5 w-3.5" /></span>
      </div>
      <p className={cn('mt-1 text-2xl font-extrabold tabular-nums tracking-tight sm:text-[1.75rem]', !solid && TONE[tone].text)} data-testid={testId}>{gbp(value)}</p>
      {sub && <p className={cn('mt-0.5 text-[11px] leading-snug', solid ? 'text-white/80' : 'text-muted-foreground')}>{sub}</p>}
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
          className={cn('group flex w-full min-w-0 flex-col items-center rounded-2xl px-1.5 pb-2.5 pt-3 text-center transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500',
            current ? 'bg-emerald-500/10 ring-1 ring-inset ring-emerald-500/35' : 'hover:bg-muted/60')}>
          <span className="text-sm font-extrabold tabular-nums tracking-tight">{gbp(m.total)}</span>
          <span className="mt-2 flex w-full items-end justify-center" style={{ height: BAR_PX }} aria-hidden>
            <span className="flex w-full max-w-[2.75rem] flex-col justify-end overflow-hidden rounded-xl bg-muted/70" style={{ height: BAR_PX }}>
              {m.expected > 0 && <span className="w-full bg-gradient-to-b from-violet-400/60 to-violet-500/50 transition-[height]" style={{ height: px(m.expected) }} />}
              {collected > 0 && <span className="w-full bg-gradient-to-b from-emerald-400 to-emerald-600 transition-[height]" style={{ height: px(collected) }} />}
            </span>
          </span>
          <span className={cn('mt-2 text-xs font-semibold', current ? 'text-emerald-700 dark:text-emerald-300' : 'text-muted-foreground group-hover:text-foreground')}>{shortMonth(m.monthStart)}</span>
          {current && <span className="mt-0.5 text-[10px] font-bold uppercase tracking-wide text-emerald-700 dark:text-emerald-300">Now</span>}
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
                <span className={cn('shrink-0 font-semibold tabular-nums', it.state === 'earned' ? 'text-emerald-600 dark:text-emerald-300' : 'text-violet-600 dark:text-violet-300')}>{gbp(it.amount)}</span>
              </li>
            ))}
          </ul>
        )}
        <p className="flex justify-between gap-2 border-t border-border/60 pt-1.5">
          <span className="font-medium text-emerald-700 dark:text-emerald-300" data-testid="forecast-month-collected">{gbp(collected)} collected</span>
          <span className="text-violet-700 dark:text-violet-300" data-testid="forecast-month-expected">{gbp(m.expected)} expected</span>
        </p>
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
    <Panel title="Your earnings" icon={TrendingUp} tone="green" hint={`What you've earned, and what clients you've already sold are expected to pay you over the next ${FORECAST_MONTHS} months.`}>
      <div data-testid="commission-forecast">
        {ended && (
          <p className="mb-3 flex items-start gap-1.5 rounded-xl border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-800 dark:text-amber-200" data-testid="forecast-engagement-ended">
            <UserX className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Engagement ended{engagement?.endedAt && engagement.endedAt !== ENGAGEMENT_END_UNKNOWN ? ` on ${dayMonthYear(engagement.endedAt)}` : ''}. Commission earned before then stays payable; client payments after it earn no new commission.
          </p>
        )}
        <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-3">
          <Stat solid tone="green" icon={Wallet} label="Total earned to date" value={totals.earned} sub="Collected, after any refunds" testId="forecast-earned-total" />
          {now && <Stat tone="green" icon={PiggyBank} label="This month" value={now.total} sub={`${gbp(collectedOf(now))} collected · ${gbp(now.expected)} expected`} testId="forecast-this-month" />}
          <Stat tone="purple" icon={TrendingUp} label={`Expected over ${FORECAST_MONTHS} months`} value={forecast.expectedTotal} sub="From clients you've already sold" testId="forecast-expected" />
        </div>

        <div className="mt-4 rounded-2xl bg-muted/25 p-2 ring-1 ring-inset ring-border/50">
          <div className="grid grid-cols-3 gap-1 sm:grid-cols-6" role="list" aria-label="Commission by month">
            {forecast.months.map((m, i) => <div key={m.monthStart} role="listitem" className="min-w-0"><MonthBar m={m} current={i === 0} max={max} /></div>)}
          </div>
          <div className="mt-1 flex flex-wrap items-center justify-center gap-x-4 gap-y-1 px-2 pb-1 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-emerald-500" />Collected</span>
            <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-violet-400/70" />Expected</span>
            <span>Tap a month to see the clients behind it</span>
          </div>
        </div>

        {forecast.undated.length > 0 && (
          <p className="mt-2 text-[11px] text-muted-foreground" data-testid="forecast-undated">
            Not in any month yet: {forecast.undated.map((u) => `${u.business} (${gbp(u.amount)})`).join(', ')} — Stripe has not set a billing date.
          </p>
        )}
        <p className="mt-3 flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
          <Info className="mt-0.5 h-3 w-3 shrink-0" />
          <span>
            <span className="font-semibold text-emerald-700 dark:text-emerald-300">Collected</span> is commission on money clients have paid.{' '}
            <span className="font-semibold text-violet-700 dark:text-violet-300">Expected</span> is {pct(COMMISSION_RECURRING_RATE)} of each live client's next monthly payments (up to {COMMISSION_RECURRING_COUNT} per client), on the date Stripe will bill them — not earned until they pay. A failed or refunded payment drops out. New sales are never guessed.
          </span>
        </p>
      </div>
    </Panel>
  );
}
