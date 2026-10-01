import { CalendarDays, Undo2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { gbp } from '@/components/salesDash/ui';
import { MONTHLY_TIERS, monthName, monthlyTracker, monthlyTrackerNextLine, type CommissionLine, type EarningsTotals, type LadderSale } from '@/lib/commission';
import type { EarningsResponse } from '@/hooks/useEarnings';

/* ══ THE MONTH'S LADDER (2026-10-01) ═══════════════════════════════════════════════════════════════
   The Sales page's top card: how many sales this month, the rate on the NEXT sale, how far the next
   rate is, and what was earned. One dot per sale that counts, in three tiers (src/lib/commission.ts
   MONTHLY_TIERS — the same table the database stamps with). Tapping a dot shows that sale. The tiers
   sit side by side from lg and stack on a phone, so the labels stay readable at every width. */

const pct = (r: number) => `${Math.round(r * 100)}%`;
const dayMonth = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' });
/** How many empty dots the open-ended top tier draws before it says "and every sale after". */
const TOP_TIER_DOTS = 3;

type Client = EarningsResponse['clients'][number];

function SaleDot({ sale, client }: { sale: LadderSale; client: Client | undefined }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" data-testid="ladder-sale" aria-label={`Sale ${sale.seq}: ${client?.business ?? 'Client'}`}
          className="h-4 w-4 rounded-full bg-emerald-500 ring-offset-2 ring-offset-card transition hover:scale-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-500" />
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
  return (
    <section className="min-w-0 rounded-2xl border border-emerald-500/30 bg-card p-4 shadow-sm sm:p-5" data-testid="monthly-ladder">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <p className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground"><CalendarDays className="h-3.5 w-3.5" />{monthName(t.monthStart)}</p>
          <p className="mt-1 text-3xl font-bold tracking-tight tabular-nums" data-testid="ladder-count">{t.counted} sale{t.counted === 1 ? '' : 's'} <span className="text-lg font-semibold text-muted-foreground">this month</span></p>
          <p className="mt-1 text-sm"><span className="font-semibold">Next sale earns {pct(t.nextSaleRate)}</span>
            {!t.topTier && t.salesToNextTier !== 0 && <span className="text-muted-foreground"> · {monthlyTrackerNextLine(t)}</span>}
            {!t.topTier && t.salesToNextTier === 0 && <span className="text-muted-foreground"> · a new rate starts with it</span>}
            {t.topTier && <span className="text-muted-foreground"> · top rate</span>}
          </p>
        </div>
        <div className="sm:text-right">
          <p className="text-xs text-muted-foreground">Earned this month</p>
          <p className="text-2xl font-bold tabular-nums text-emerald-600 dark:text-emerald-300" data-testid="ladder-earned">{gbp(totals.earnedThisMonth)}</p>
          <p className="text-xs text-muted-foreground">{gbp(totals.due)} due {new Date(`${totals.nextPayoutDate}T12:00:00Z`).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' })}</p>
        </div>
      </div>

      <div className="mt-4 grid gap-3 lg:grid-cols-[12fr_12fr_5fr]" role="list" aria-label="Sales this month by commission rate">
        {zones.map((z) => {
          const slots = z.to !== null ? z.to - z.from + 1 : Math.max(TOP_TIER_DOTS, counted.length - z.from + 2);
          const here = nextIndex + 1 >= z.from && (z.to === null || nextIndex + 1 <= z.to);
          return (
            <div key={z.i} role="listitem" data-testid="ladder-tier"
              className={cn('rounded-xl border p-3', here ? 'border-emerald-500/50 bg-emerald-500/[0.06]' : 'border-border/60')}>
              <div className="mb-2 flex items-baseline justify-between gap-2">
                <span className="text-lg font-bold tabular-nums">{pct(z.rate)}</span>
                <span className="text-xs text-muted-foreground">{z.to !== null ? `Sales ${z.from}–${z.to}` : `Sale ${z.from} onwards`}</span>
              </div>
              <div className="flex flex-wrap gap-1">
                {Array.from({ length: slots }, (_, k) => {
                  const idx = z.from - 1 + k;
                  const sale = counted[idx];
                  if (sale) return <SaleDot key={k} sale={sale} client={clientOf.get(sale.leadId)} />;
                  return <span key={k} aria-hidden className={cn('h-4 w-4 rounded-full border-2', idx === nextIndex ? 'border-emerald-500 border-dashed' : 'border-border')} />;
                })}
              </div>
              {here && <p className="mt-2 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">{t.salesToNextTier === 0 || z.to === null ? 'Your next sale is here' : `${(z.to ?? 0) - counted.length} to go at ${pct(z.rate)}`}</p>}
              {z.to === null && <p className="mt-2 text-[11px] text-muted-foreground">and every sale after</p>}
            </div>
          );
        })}
      </div>
      {gone.length > 0 && (
        <p className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground" data-testid="ladder-refunded"><Undo2 className="h-3.5 w-3.5" />
          {gone.length} sale{gone.length === 1 ? '' : 's'} refunded this month — {gone.length === 1 ? 'it no longer counts' : 'they no longer count'} towards your rate.</p>
      )}
      <p className="mt-3 text-[11px] text-muted-foreground">Each sale keeps the rate it earned. The count starts again on the 1st.</p>
    </section>
  );
}
