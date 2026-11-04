import { CalendarDays, Sparkles, Undo2 } from 'lucide-react';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { SURFACE, gbp } from '@/components/salesDash/ui';
import { monthName, monthlyTracker, monthlyTrackerNextLine, type CommissionLine, type LadderSale } from '@/lib/commission';
import { BIG_MONTH_BONUS_FROM_SALE, BIG_MONTH_BONUS_GBP } from '@/lib/commissionConfig';
import { salePlanWordsOr } from '@/lib/salePlan';
import type { EarningsResponse } from '@/hooks/useEarnings';

/* ══ THE MONTH CARD — the Sales dashboard's hero (2026-10-01; fixed pounds 2026-11-04, docs/commission-owed.md) ═══════════
   The first thing a salesperson sees: how many sales this month and how far off the big-month bonus they are. Below that the month in
   two steps: the sales before the bonus and the sales that earn it, with one dot per sale that counts. Tapping a dot shows that sale.
   The money (earned this month, to date, expected) sits beside it in EarningsStats, so no figure is drawn twice.
   ⛔ STYLE (Paul, 2026-10-02): the dark card language of the work tiles — dark navy, a deep coloured
   wash, a coloured edge, white numbers. NOT a solid green card ("green on green with white text looks
   washed out"; "no green hero"). The steps sit side by side from lg and stack on a phone. */

const dayMonth = (iso: string) => new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', timeZone: 'Europe/London' });
/** How many empty dots the open-ended bonus step draws before it says "and every sale after". */
const BONUS_STEP_DOTS = 3;

type Client = EarningsResponse['clients'][number];
type StepState = 'done' | 'here' | 'ahead';
const DOT: Record<StepState, string> = { done: 'bg-teal-300', here: 'bg-amber-300', ahead: 'bg-slate-400' };

function SaleDot({ sale, client, plan, state }: { sale: LadderSale; client: Client | undefined; plan: string | null | undefined; state: StepState }) {
  const sold = salePlanWordsOr(plan, client?.package ?? '');
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button type="button" data-testid="ladder-sale" aria-label={`Sale ${sale.seq}: ${client?.business ?? 'Client'}`}
          className={cn('h-4 w-4 rounded-full shadow-sm transition lg:h-3 lg:w-3 hover:scale-125 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white/80 motion-reduce:transform-none', DOT[state])} />
      </PopoverTrigger>
      <PopoverContent className="w-64 space-y-1.5 p-3 text-xs" align="start">
        <p className="text-sm font-semibold">{client?.business ?? 'Client'}</p>
        <p className="text-muted-foreground">Sale {sale.seq} · {dayMonth(sale.occurredAt)}{sold ? ` · ${sold}` : ''}</p>
        <p><span className="font-semibold text-teal-600 dark:text-teal-300">{gbp(sale.commission)}</span> on the first payment{sale.seq >= BIG_MONTH_BONUS_FROM_SALE ? `, with the +£${BIG_MONTH_BONUS_GBP} big-month bonus` : ''}</p>
        <p className="text-muted-foreground">{!client ? null : client.commissionablePaymentsLeft > 0
          ? `Plus ${client.commissionablePaymentsLeft} more payment${client.commissionablePaymentsLeft === 1 ? '' : 's'} that earn${client.commissionablePaymentsLeft === 1 ? 's' : ''}${client.remainingPotential ? ` (up to ${gbp(client.remainingPotential)})` : ''}.`
          : 'Nothing more to come on this sale.'}</p>
      </PopoverContent>
    </Popover>
  );
}

export function MonthlyLadder({ lines, clients, sales, todayIso = new Date().toISOString() }: {
  lines: CommissionLine[]; clients: Client[]; sales?: EarningsResponse['sales']; todayIso?: string;
}) {
  const t = monthlyTracker(lines, todayIso);
  const clientOf = new Map(clients.map((c) => [c.leadId, c]));
  const planOf = new Map((sales ?? []).map((s) => [s.leadId, s.plan]));
  const counted = t.sales.filter((s) => s.counted);
  const gone = t.sales.filter((s) => !s.counted);
  const beforeBonus = BIG_MONTH_BONUS_FROM_SALE - 1;
  const steps = [
    { key: 'before', title: `Sales 1–${beforeBonus}`, from: 1, to: beforeBonus as number | null, words: 'The plan’s commission' },
    { key: 'bonus', title: `Sale ${BIG_MONTH_BONUS_FROM_SALE}+`, from: BIG_MONTH_BONUS_FROM_SALE, to: null as number | null, words: `+£${BIG_MONTH_BONUS_GBP} big-month bonus` },
  ];
  const nextIndex = counted.length; // 0-based slot of the next sale
  return (
    <section className={cn('relative flex h-full min-w-0 flex-col overflow-hidden p-5 sm:p-6', SURFACE, 'border-indigo-400/30 bg-[hsl(226_52%_9%)]')} data-testid="monthly-ladder">
      {/* The work tiles' language, a step stronger: a deep indigo-to-violet wash on the dark card. */}
      <span className="pointer-events-none absolute inset-0 bg-gradient-to-br from-indigo-500/30 via-violet-600/[0.14] to-transparent" aria-hidden />
      <span className="pointer-events-none absolute -right-24 -top-28 h-72 w-72 rounded-full bg-violet-500/20 blur-3xl" aria-hidden />

      <div className="relative">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="inline-flex items-center gap-1.5 rounded-full bg-indigo-500/20 px-2.5 py-1 text-xs font-semibold text-indigo-100 ring-1 ring-inset ring-indigo-400/30"><CalendarDays className="h-3.5 w-3.5" />{monthName(t.monthStart)}</p>
          {t.bonusOn && <p className="text-xs font-medium text-slate-300">Your next sale earns <span className="rounded-full bg-amber-400 px-2 py-0.5 font-extrabold text-amber-950">+£{BIG_MONTH_BONUS_GBP}</span></p>}
        </div>
        <p className="mt-4 text-6xl font-extrabold leading-none tracking-tight tabular-nums text-white" data-testid="ladder-count">{t.counted}<span className="ml-3 text-xl font-semibold text-slate-300">sale{t.counted === 1 ? '' : 's'} this month</span></p>
        <p className="mt-3 text-xl font-bold leading-snug text-amber-200" data-testid="ladder-next-line">{monthlyTrackerNextLine(t)}</p>
      </div>

      <div className="relative mt-5 mb-4 grid gap-2.5 lg:grid-cols-[12fr_7fr]" role="list" aria-label="Sales this month">
        {steps.map((z) => {
          const slots = z.to !== null ? z.to - z.from + 1 : Math.max(BONUS_STEP_DOTS, counted.length - z.from + 2);
          const here = nextIndex + 1 >= z.from && (z.to === null || nextIndex + 1 <= z.to);
          const done = z.to !== null && counted.length >= z.to;
          const state: StepState = here ? 'here' : done ? 'done' : 'ahead';
          return (
            <div key={z.key} role="listitem" data-testid="ladder-tier"
              className={cn('rounded-2xl border p-3',
                state === 'here' ? 'border-amber-400/60 bg-amber-500/[0.14] shadow-[0_0_0_1px_rgba(251,191,36,0.15),0_10px_24px_-12px_rgba(245,158,11,0.45)]'
                  : state === 'done' ? 'border-teal-400/35 bg-teal-500/[0.10]' : 'border-white/[0.07] bg-slate-950/40')}>
              <div className="mb-2 flex flex-wrap items-center justify-between gap-x-2">
                <span className={cn('text-sm font-extrabold', state === 'here' ? 'text-amber-300' : state === 'done' ? 'text-teal-200' : 'text-slate-400')}>{z.words}</span>
                <span className={cn('whitespace-nowrap text-xs font-semibold', state === 'ahead' ? 'text-slate-500' : 'text-slate-300')}>{z.title}</span>
              </div>
              <div className="flex flex-wrap gap-1.5 lg:gap-1">
                {Array.from({ length: slots }, (_, k) => {
                  const idx = z.from - 1 + k;
                  const sale = counted[idx];
                  if (sale) return <SaleDot key={k} sale={sale} client={clientOf.get(sale.leadId)} plan={planOf.get(sale.leadId)} state={state} />;
                  return <span key={k} aria-hidden className={cn('h-4 w-4 rounded-full border-2 lg:h-3 lg:w-3 lg:border-[1.5px]', idx === nextIndex ? 'animate-pulse border-dashed border-amber-300 motion-reduce:animate-none' : state === 'here' ? 'border-amber-200/30' : 'border-slate-600/70')} />;
                })}
              </div>
              {state === 'here' && z.to !== null && <p className="mt-2 flex items-center gap-1 text-xs font-bold text-amber-200"><Sparkles className="h-3 w-3" />{z.to - counted.length} to go before the bonus</p>}
              {state !== 'here' && z.to === null && <p className="mt-2 text-[11px] text-slate-500">and every sale after</p>}
            </div>
          );
        })}
      </div>
      {gone.length > 0 && (
        <p className="relative mt-3 flex items-center gap-1.5 text-xs text-slate-300" data-testid="ladder-refunded"><Undo2 className="h-3.5 w-3.5" />
          {gone.length} sale{gone.length === 1 ? '' : 's'} refunded this month — {gone.length === 1 ? 'it no longer counts' : 'they no longer count'} towards the bonus.</p>
      )}
      {/* The whole scheme in one line, from the same constants that pay it. */}
      <p className="relative mt-4 border-t border-white/[0.08] pt-3 lg:mt-auto text-xs leading-relaxed text-slate-300" data-testid="ladder-scheme">
        Sale {BIG_MONTH_BONUS_FROM_SALE} and above in a month earns <span className="font-bold text-white">+£{BIG_MONTH_BONUS_GBP} once</span>, paid with that sale’s first commission. Sales are numbered when the first payment is collected. Never backdated; the count restarts on the 1st (UK time).
      </p>
    </section>
  );
}
