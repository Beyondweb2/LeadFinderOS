import type { JSX } from 'react';
import { Megaphone, SlidersHorizontal } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { Empty, TONE } from '@/components/salesDash/ui';
import { templateLabel, WHATSAPP_TEMPLATES } from '@/types/outreach';
import { STALE_OFFER_TEMPLATES } from '@/lib/findableOffer';
import { ASSIGNED_CAMPAIGN_KEY, CHANNEL_LABELS, rate, type CampaignRow, type SalesPerformance, type TemplateRow } from '@/lib/salesPerformance';
import { campaignKey, toggleHidden, inactiveKeys, INACTIVE_DAYS } from '@/lib/dashboardVisibility';

/* ══ THE BREAKDOWN TABLES (moved out of SalesDashboard.tsx unchanged, 2026-10-01) ══════════════════
   Campaigns, templates, channels and lead sources, drawn under the Sales page's folded "More numbers". */

const pct = (n: number, d: number) => { const r = rate(n, d); return r === null ? '—' : `${r}%`; };

/** Meta's state for a template, from the one sendable registry (a name there is registered and
 *  approved at Meta — CLAUDE.md §6); a blocked offer body and a retired name say so. */
function metaStatus(t: string): { label: string; tone: 'green' | 'red' | 'grey' } {
  if (STALE_OFFER_TEMPLATES.has(t)) return { label: 'Blocked', tone: 'red' };
  if (WHATSAPP_TEMPLATES.some((x) => x.value === t)) return { label: 'Approved', tone: 'green' };
  return { label: 'Retired', tone: 'grey' };
}

type Cell = { v: string | number | JSX.Element; sub?: string; wide?: boolean; key?: string };
const MIN_FOR_RANK = 10;

/** Which row is best / lowest on a rate, among rows with enough behind them to mean anything. */
function rank<T>(rows: T[], num: (r: T) => number, den: (r: T) => number): { best: T | null; worst: T | null } {
  const eligible = rows.filter((r) => den(r) >= MIN_FOR_RANK);
  if (eligible.length < 2) return { best: null, worst: null };
  const by = (r: T) => num(r) / den(r);
  const best = eligible.reduce((a, b) => (by(b) > by(a) ? b : a));
  const worst = eligible.reduce((a, b) => (by(b) < by(a) ? b : a));
  return best === worst ? { best: null, worst: null } : { best, worst };
}

/** Campaigns as cards: the reply rate as a bar, "best / lowest" only with 10+ contacted behind it. */
export function CampaignCards({ rows, onOpen }: { rows: CampaignRow[]; onOpen: (campaignId: string | null) => void }) {
  const { best, worst } = rank(rows, (r) => r.responded, (r) => r.contacted);
  if (rows.length === 0) return <Empty icon={Megaphone}>No campaign activity yet.</Empty>;
  return (
    <>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {rows.map((r) => {
          const rr = rate(r.responded, r.contacted);
          const tag = r === best ? 'best' : r === worst ? 'lowest' : null;
          return (
            <li key={campaignKey(r)}>
              <button type="button" onClick={() => onOpen(r.campaignId)} disabled={!r.campaignId || r.campaignId === ASSIGNED_CAMPAIGN_KEY}
                className={cn('flex h-full w-full flex-col gap-2.5 rounded-xl border p-3.5 text-left transition',
                  tag === 'best' ? 'border-emerald-500/40 bg-emerald-500/[0.05]' : 'border-border/60',
                  r.campaignId && r.campaignId !== ASSIGNED_CAMPAIGN_KEY && 'hover:border-primary/40 hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary')}>
                <span className="flex items-start justify-between gap-2">
                  <span className="min-w-0"><span className="block truncate text-sm font-semibold" title={r.name}>{r.name}</span><span className="text-[11px] text-muted-foreground">{r.leads} {r.leads === 1 ? "lead" : "leads"} · {r.contacted} contacted</span></span>
                  {tag && <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold', tag === 'best' ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-red-500/10 text-red-700 dark:text-red-300')}>{tag === 'best' ? 'Best reply rate' : 'Lowest reply rate'}</span>}
                </span>
                <span>
                  <span className="mb-1 flex items-baseline justify-between text-xs"><span className="text-muted-foreground">Reply rate</span><span className="font-semibold tabular-nums text-blue-700 dark:text-blue-300">{rr === null ? '—' : `${rr}%`}</span></span>
                  <span className="block h-1.5 overflow-hidden rounded-full bg-muted"><span className="block h-full rounded-full bg-blue-500" style={{ width: `${rr ?? 0}%` }} /></span>
                </span>
                <span className="grid grid-cols-4 gap-1 text-center">
                  {([['Replied', r.responded, 'blue'], ['Interested', r.interested, 'green'], ['Link', r.onboardingSent, 'amber'], ['Won', r.won, 'green']] as const).map(([k, v, tone]) => (
                    <span key={k} className="rounded-lg bg-muted/40 px-1 py-1.5"><span className={cn('block text-sm font-bold tabular-nums', v ? TONE[tone].text : 'text-muted-foreground/60')}>{v}</span><span className="block text-[10px] text-muted-foreground">{k}</span></span>
                  ))}
                </span>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-[10px] text-muted-foreground">Best / lowest only among campaigns with at least {MIN_FOR_RANK} leads contacted.</p>
    </>
  );
}

export function ChannelBars({ rows }: { rows: SalesPerformance['channels'] }) {
  if (rows.length === 0) return <Empty>No contact recorded yet.</Empty>;
  const max = Math.max(1, ...rows.map((r) => r.contacted));
  return (
    <ul className="space-y-2.5">
      {rows.map((c) => (
        <li key={c.channel}>
          <div className="mb-1 flex items-baseline justify-between text-sm"><span className="font-medium">{CHANNEL_LABELS[c.channel]}</span><span className="text-xs tabular-nums text-muted-foreground">{c.contacted} contacted · {c.responded} replied · <span className="font-semibold text-blue-700 dark:text-blue-300">{pct(c.responded, c.contacted)}</span></span></div>
          <div className="relative h-2 overflow-hidden rounded-full bg-muted">
            <div className="absolute inset-y-0 left-0 rounded-full bg-muted-foreground/30" style={{ width: `${(c.contacted / max) * 100}%` }} />
            <div className="absolute inset-y-0 left-0 rounded-full bg-blue-500" style={{ width: `${(c.responded / max) * 100}%` }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** "Manage campaigns / templates": tick what shows on YOUR dashboard. Nothing is deleted or re-counted. */
export function ManageRows({ kind, all, hidden, onChange }: {
  kind: 'campaigns' | 'templates';
  all: { key: string; label: string; lastActivityAt: string | null }[];
  hidden: string[];
  onChange: (next: string[]) => void;
}) {
  const h = new Set(hidden);
  const hiddenHere = all.filter((r) => h.has(r.key)).length;
  const stale = inactiveKeys(all, (r) => r.key);
  const day = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'Europe/London' }) : 'no activity');
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[11px] text-muted-foreground" data-testid={`manage-${kind}`}>
          <SlidersHorizontal className="h-3.5 w-3.5" />Manage {kind}{hiddenHere ? ` (${hiddenHere} hidden)` : ''}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-3">
        <p className="text-xs font-semibold">Show on my dashboard</p>
        <p className="mb-2 text-[11px] text-muted-foreground">Only changes what you see. Totals above still include everything, and nothing is deleted.</p>
        <div className="mb-2 flex gap-1.5">
          <Button size="sm" variant="outline" className="h-7 text-[11px]" disabled={hiddenHere === 0} onClick={() => onChange(hidden.filter((k) => !all.some((r) => r.key === k)))}>Show all</Button>
          <Button size="sm" variant="outline" className="h-7 text-[11px]" disabled={stale.every((k) => h.has(k))} onClick={() => onChange([...new Set([...hidden, ...stale])])} title={`Hides anything with nothing sent or logged in ${INACTIVE_DAYS} days`}>Hide inactive ({INACTIVE_DAYS}+ days)</Button>
        </div>
        <ul className="max-h-72 space-y-1 overflow-y-auto pr-1 thin-scrollbar">
          {all.map((r) => (
            <li key={r.key}>
              <label className="flex cursor-pointer items-start gap-2 rounded px-1 py-1 text-xs hover:bg-muted/50">
                <Checkbox checked={!h.has(r.key)} onCheckedChange={(v) => onChange(toggleHidden(hidden, r.key, v !== true))} className="mt-0.5" />
                <span className="min-w-0 flex-1"><span className="block truncate">{r.label}</span><span className="text-[10px] text-muted-foreground">Last active: {day(r.lastActivityAt)}</span></span>
              </label>
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

export function TemplateTable({ rows }: { rows: TemplateRow[] }) {
  const { best, worst } = rank(rows, (r) => r.replies, (r) => r.leadsSent);
  return (
    <DataTable
      head={[{ v: 'Template' }, { v: 'Meta', wide: true }, { v: 'Sent to' }, { v: 'Sends', wide: true }, { v: 'Replies' }, { v: 'Unclear', wide: true }, { v: 'Interested' }, { v: 'Not int.', wide: true }, { v: 'Link sent' }, { v: 'Opened' }, { v: 'Won' }]}
      rows={rows.map((r) => ({
        tag: r === best ? 'best' : r === worst ? 'lowest' : null,
        cells: [
          { v: templateLabel(r.template) }, { v: <MetaBadge t={r.template} />, wide: true, key: metaStatus(r.template).label }, { v: r.leadsSent }, { v: r.sends, wide: true },
          { v: r.replies, sub: pct(r.replies, r.leadsSent) }, { v: r.repliesContested, wide: true },
          { v: r.interested }, { v: r.notInterested, wide: true }, { v: r.onboardingSent }, { v: r.onboardingOpened }, { v: r.won },
        ],
      }))}
      rankNote="by reply rate"
      empty="No template sends yet."
    />
  );
}

function DataTable({ head, rows, empty, rankNote }: { head: Cell[]; rows: { tag: 'best' | 'lowest' | null; cells: Cell[] }[]; empty: string; rankNote?: string }) {
  if (rows.length === 0) return <p className="text-xs text-muted-foreground">{empty}</p>;
  const hide = (c: Cell) => (c.wide ? 'hidden md:table-cell' : '');
  return (
    <div className="-mx-1 overflow-x-auto thin-scrollbar">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-border/60 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
            {head.map((h, i) => <th key={h.key ?? String(h.v)} className={cn('px-1.5 py-1.5 font-semibold', i > 0 && 'text-right', hide(h))}>{h.v}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className={cn('border-b border-border/30 last:border-0', r.tag === 'best' && 'bg-emerald-500/[0.07]', r.tag === 'lowest' && 'bg-rose-500/[0.05]')}>
              {r.cells.map((c, ci) => (
                <td key={ci} className={cn('px-1.5 py-1.5 align-top', ci === 0 ? 'max-w-[13rem] font-medium' : 'text-right tabular-nums', hide(c))} title={ci === 0 ? String(c.v) : undefined}>
                  {ci === 0 ? (
                    <div className="min-w-0">
                      <div className="truncate">{c.v}</div>
                      {r.tag && <div className={cn('text-[10px] font-semibold', r.tag === 'best' ? 'text-emerald-600 dark:text-emerald-400' : 'text-rose-600 dark:text-rose-400')}>{r.tag === 'best' ? 'Best' : 'Lowest'} {rankNote}</div>}
                    </div>
                  ) : (
                    <>
                      <div className={cn(c.v === 0 && 'text-muted-foreground/60')}>{c.v}</div>
                      {c.sub && c.sub !== '—' && <div className="text-[10px] text-muted-foreground">{c.sub}</div>}
                    </>
                  )}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      {rankNote && <p className="mt-1.5 text-[10px] text-muted-foreground">Best / lowest only among rows with at least {MIN_FOR_RANK} behind them.</p>}
    </div>
  );
}

export function SimpleTable({ head, rows, empty }: { head: string[]; rows: (string | number)[][]; empty: string }) {
  if (rows.length === 0) return <p className="text-xs text-muted-foreground">{empty}</p>;
  return (
    <div className="-mx-1 overflow-x-auto thin-scrollbar">
      <table className="w-full border-collapse text-xs">
        <thead>
          <tr className="border-b border-border/60 text-left text-[10px] uppercase tracking-wide text-muted-foreground">
            {head.map((h, i) => <th key={h} className={cn('px-1.5 py-1.5 font-semibold', i > 0 && 'text-right')}>{h}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-b border-border/30 last:border-0">
              {r.map((c, ci) => <td key={ci} className={cn('px-1.5 py-1.5', ci === 0 ? 'max-w-[14rem] truncate font-medium' : 'text-right tabular-nums')} title={ci === 0 ? String(c) : undefined}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}


function MetaBadge({ t }: { t: string }) {
  const m = metaStatus(t);
  return <span className={cn('inline-block rounded-full px-1.5 py-0.5 text-[10px] font-semibold', TONE[m.tone].soft, TONE[m.tone].text)} title="Meta's state for this template name">{m.label}</span>;
}
