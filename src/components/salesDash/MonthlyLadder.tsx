import { CalendarDays, Check, Lock, Sparkles, Undo2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { gbp } from '@/components/salesDash/ui';
import { COMMISSION_RECURRING_COUNT, COMMISSION_RECURRING_RATE, MONTHLY_TIERS, monthName, monthlyTracker, monthlyTrackerNextLine, type CommissionLine, type EarningsTotals, type LadderSale } from '@/lib/commission';
import type { EarningsResponse } from '@/hooks/useEarnings';

/* ══ THE MONTH'S LADDER — the Sales dashboard's hero (2026-10-01; redesigned 2026-10-02) ═══════════
   The first thing a salesperson sees: how many sales this month, the progress line to the next rate,
   what the next sale earns, and what was earned. One solid green card (the page's money colour), so it
   is unmistakably the headline. Below the numbers, the three rates as three steps — unlocked (ticked),
   the one you are on (bright), and the ones still to unlock (locked) — with one dot per sale that counts
   (src/lib/commission.ts MONTHLY_TIERS, the same table the database stamps with). Tapping a dot shows
   that sale. The steps sit side by side from lg and stack on a phone, so every label stays readable. */

const pct = (r: number) => `${Math.round(r * 100)}%`;
const dayMonth = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' });
/** How many empty dots the open-ended top tier draws before it says "and every sale after". */
const TOP_TIER_DOTS = 3;
/** "1–12 sales this month = 30% · 13–24 = 40% · 25+ = 50%" from the tier table. */
const zoneWords = (zones: { rate: number; from: number; to: number | null }[]) =>
  zones.map((z, i) => `${z.to !== null ? `${z.from}–${z.to}` : `${z.from}+`}${i === 0 ? ' sales this month' : ''} = ${pct(z.rate)}`).join(' · ');

type Client = EarningsResponse['clients'][number];

function SaleDot({ sale, client }: { sale: LadderSale; client: Client | undefined }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" data-testid="ladder-sale" aria-label={`Sale ${sale.seq}: ${client?.business ?? 'Client'}`}
          className="h-4 w-4 rounded-full bg-white shadow-sm shadow-emerald-900/30 transition hover:scale-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white focus-visible:ring-offset-2 focus-visible:ring-offset-emerald-600 motion-reduce:transform-none" />
      </PopoverTrigger>
      <PopoverContent className="w-64 space-y-1.5 p-3 text-xs" align="start">
        <p className="text-sm font-semibold">{client?.business ?? 'Client'}</p>
        <p className="text-muted-foreground">Sale {sale.seq} · {dayMonth(sale.occurredAt)}{client?.package ? ` · ${client.package}` : ''}</p>
        <p><span className="font-semibold text-emerald-600 dark:text-emerald-300">{gbp(sale.commission)}</span> commission ({pct(sale.rate)} of the first payment)</p>
        <p className="text-muted-foreground">{!client ? null : client.commissionablePaymentsLeft > 0
          ? `Plus 20% of the next ${client.commissionablePaymentsLeft} monthly payment${client.commissionablePaymentsLeft === 1 ? '' : 's'}${client.remainingPotential ? ` (up to ${gbp(client.remainingPotential)})` : ''}.`
          : 'Monthly commission on this client: all received.'}</p>
      </PopoverContent>
    </Popover>
  );
}

export function MonthlyLadder({ lines, clients, totals, todayIso = new Date().toISOString() }: {
  lines: CommissionLine[]; clients: Client[]; totals: EarningsTotals; todayIso?: string;
}) {
  const t = monthlyTracker(lines, todayIso);
  const clientOf = new Map(clients.map((c) => [c.leadId, c]));
  const counted = t.sales.filter((s) => s.counted);
  const gone = t.sales.filter((s) => !s.counted);
  const zones = MONTHLY_TIERS.map((z, i) => {
    const from = i === 0 ? 1 : MONTHLY_TIERS[i - 1].upTo + 1;
    const to = Number.isFinite(z.upTo) ? z.upTo : null;
    return { ...z, i, from, to };
  });
  const nextIndex = counted.length; // 0-based slot of the next sale
  const payout = new Date(`${totals.nextPayoutDate}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
  return (
    <section className="relative min-w-0 overflow-hidden rounded-[1.5rem] bg-gradient-to-br from-emerald-500 via-emerald-600 to-teal-700 p-5 text-white shadow-[0_18px_40px_-20px_rgba(5,150,105,0.65)] sm:p-6" data-testid="monthly-ladder">
      {/* Soft light in the corner: depth without a pattern. */}
      <span className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-white/10 blur-3xl" aria-hidden />
      <span className="pointer-events-none absolute -bottom-28 left-1/3 h-64 w-64 rounded-full bg-teal-300/10 blur-3xl" aria-hidden />

      <div className="relative flex flex-wrap items-start justify-between gap-x-8 gap-y-4">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-2.5 py-1 text-xs font-semibold"><CalendarDays className="h-3.5 w-3.5" />{monthName(t.monthStart)}</p>
          <p className="mt-3 text-5xl font-extrabold leading-none tracking-tight tabular-nums" data-testid="ladder-count">{t.counted}<span className="ml-2 text-xl font-semibold text-white/80">sale{t.counted === 1 ? '' : 's'} this month</span></p>
          {/* ⛔ THE PROGRESS LINE IS THE HEADLINE (Paul, 2026-10-02): "1 more sale to unlock 40%", then
              "40% unlocked · 12 more sales to unlock 50%". */}
          <p className="mt-3 text-xl font-bold leading-snug" data-testid="ladder-next-line">{monthlyTrackerNextLine(t)}</p>
          <p className="mt-0.5 text-sm text-white/80">Your next sale earns <span className="font-bold text-white">{pct(t.nextSaleRate)}</span> of its first payment</p>
        </div>
        <div className="rounded-2xl bg-white/15 px-4 py-3 ring-1 ring-inset ring-white/20 backdrop-blur-sm sm:min-w-[11rem] sm:text-right">
          <p className="text-xs font-semibold text-white/80">Earned this month</p>
          <p className="text-3xl font-extrabold tabular-nums tracking-tight" data-testid="ladder-earned">{gbp(totals.earnedThisMonth)}</p>
          <p className="text-xs text-white/80">{gbp(totals.due)} due to you on {payout}</p>
        </div>
      </div>

      <div className="relative mt-5 grid gap-2.5 lg:grid-cols-[12fr_12fr_5fr]" role="list" aria-label="Sales this month by commission rate">
        {zones.map((z) => {
          const slots = z.to !== null ? z.to - z.from + 1 : Math.max(TOP_TIER_DOTS, counted.length - z.from + 2);
          const here = nextIndex + 1 >= z.from && (z.to === null || nextIndex + 1 <= z.to);
          const done = z.to !== null && counted.length >= z.to;
          return (
            <div key={z.i} role="listitem" data-testid="ladder-tier"
              className={cn('rounded-2xl p-3 transition',
                here ? 'bg-white/20 ring-2 ring-inset ring-white/50' : done ? 'bg-white/15 ring-1 ring-inset ring-white/25' : 'bg-emerald-950/20 ring-1 ring-inset ring-white/10')}>
              <div className="mb-2 flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5">
                  <span className={cn('text-xl font-extrabold tabular-nums', !here && !done && 'text-white/70')}>{pct(z.rate)}</span>
                  {done && <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white text-emerald-700" title="Unlocked"><Check className="h-3 w-3" strokeWidth={3} /></span>}
                  {!done && !here && <Lock className="h-3.5 w-3.5 text-white/55" aria-label="Not yet unlocked" />}
                </span>
                <span className="text-xs font-medium text-white/75">{z.to !== null ? `Sales ${z.from}–${z.to}` : `Sale ${z.from}+`}</span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {Array.from({ length: slots }, (_, k) => {
                  const idx = z.from - 1 + k;
                  const sale = counted[idx];
                  if (sale) return <SaleDot key={k} sale={sale} client={clientOf.get(sale.leadId)} />;
                  return <span key={k} aria-hidden className={cn('h-4 w-4 rounded-full border-2', idx === nextIndex ? 'animate-pulse border-dashed border-white motion-reduce:animate-none' : 'border-white/30')} />;
                })}
              </div>
              {here && <p className="mt-2 flex items-center gap-1 text-[11px] font-semibold"><Sparkles className="h-3 w-3" />{z.to === null ? 'You are on the top rate' : `${(z.to ?? 0) - counted.length} to go at ${pct(z.rate)}`}</p>}
              {!here && z.to === null && <p className="mt-2 text-[11px] text-white/70">and every sale after</p>}
            </div>
          );
        })}
      </div>
      {gone.length > 0 && (
        <p className="relative mt-3 flex items-center gap-1.5 text-xs text-white/80" data-testid="ladder-refunded"><Undo2 className="h-3.5 w-3.5" />
          {gone.length} sale{gone.length === 1 ? '' : 's'} refunded this month — {gone.length === 1 ? 'it no longer counts' : 'they no longer count'} towards your rate.</p>
      )}
      {/* The whole scheme in one line, from the same constants that pay it. */}
      <p className="relative mt-4 border-t border-white/15 pt-3 text-xs leading-relaxed text-white/85" data-testid="ladder-scheme">
        {zoneWords(zones)} of the first payment, <span className="font-bold text-white">plus {pct(COMMISSION_RECURRING_RATE)} of the next {COMMISSION_RECURRING_COUNT} successful monthly payments</span> from each client. Each sale keeps the rate it earned; the count starts again on the 1st (UK time).
      </p>
    </section>
  );
}
