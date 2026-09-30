import { Fragment, useState } from 'react';
import { ChevronDown, ChevronRight, HeartPulse } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Panel, Empty, TONE } from '@/components/salesDash/ui';
import type { AdminOverviewResponse } from '@/hooks/useAdminOverview';
import type { ClientRow } from '@/lib/adminMetrics';
import { blockerSection } from '@/lib/clientHealth';
import { SERVICE_ROUTE_NAME } from '@/lib/findableOffer';
import { WEEKLY_CLIENT_CAP_USD, WEEKLY_MOVE_MIN, WEEKLY_TOTAL_CAP_USD, type WeeklyEngine } from '@/lib/weeklyCheck';

/* ══ PAID CLIENT HEALTH (release 4) ════════════════════════════════════════════════════════════════
   Facts and blockers per client — no score. The weekly check is directional monitoring and says so;
   the official baseline / guarantee / four-week re-measure are separate and unchanged. */

type O = AdminOverviewResponse;
const ENG: { key: WeeklyEngine; label: string }[] = [{ key: 'chatgpt', label: 'ChatGPT' }, { key: 'gemini', label: 'Gemini' }];

function Weekly({ c }: { c: ClientRow }) {
  const w = c.health?.weekly;
  if (!w) return <span className="text-xs text-muted-foreground">—</span>;
  if (!w.thisWeek) return <span className="text-xs text-muted-foreground">{w.reason}</span>;
  /* ⛔ named / ANSWERED — never named / the set size. An engine that answered nothing reads "no
     answers", not "0/10": questions that never ran are not questions it was absent on. */
  const cell = (s: NonNullable<typeof w.thisWeek>, k: WeeklyEngine) => (s.answered[k] ? `${s.named[k]}/${s.answered[k]}` : 'no answers');
  return (
    <span className="block text-xs">
      {w.state === 'stopped' && <span className="block font-medium text-muted-foreground">Stopped (refunded)</span>}
      {ENG.map((e) => (
        <span key={e.key} className="block whitespace-nowrap tabular-nums">
          {e.label} <span className="font-semibold">{cell(w.thisWeek!, e.key)}</span>
          {w.lastWeek && <span className="text-muted-foreground"> · week of {w.lastWeek.week} {cell(w.lastWeek, e.key)}</span>}
        </span>
      ))}
      {w.coverageLabel && <span className={cn('block font-medium', TONE.amber.text)}>{w.coverageLabel}</span>}
      {w.trendLabel && <span className={cn('block font-medium', w.comparison?.trend === 'improving' ? TONE.green.text : w.comparison?.trend === 'slipping' ? TONE.red.text : 'text-muted-foreground')}>{w.trendLabel}</span>}
    </span>
  );
}

function Detail({ c }: { c: ClientRow }) {
  const w = c.health?.weekly;
  if (!w?.thisWeek) return <p className="text-xs text-muted-foreground">{w?.reason ?? 'No weekly check yet.'}</p>;
  const cmp = w.comparison;
  return (
    <div className="space-y-2 text-xs">
      {w.state === 'stopped' && <p className="text-muted-foreground">{w.reason}</p>}
      {w.coverageLabel && <p className={TONE.amber.text}>{w.coverageLabel}. A dash below is a question that was not answered that week — not a question they were absent on. Only questions answered in both weeks are ever compared.</p>}
      {cmp && (cmp.nowNamed.length > 0 || cmp.noLongerNamed.length > 0) && (
        <div>
          {cmp.nowNamed.map((q) => <p key={`+${q}`} className={TONE.green.text}>+ “{q}” now named</p>)}
          {cmp.noLongerNamed.map((q) => <p key={`-${q}`} className={TONE.red.text}>− “{q}” no longer named</p>)}
        </div>
      )}
      <table className="w-full min-w-[420px]">
        <thead><tr className="text-left text-[10px] uppercase tracking-wide text-muted-foreground"><th className="py-1 pr-2 font-semibold">Question (week of {w.thisWeek.week})</th>{ENG.map((e) => <th key={e.key} className="px-2 py-1 text-center font-semibold">{e.label}</th>)}</tr></thead>
        <tbody>{w.thisWeek.perQuestion.map((q) => (
          <tr key={q.question} className="border-t border-border/40">
            <td className="py-1 pr-2">{q.question}</td>
            {ENG.map((e) => <td key={e.key} className="px-2 py-1 text-center">{q.named[e.key] === null ? <span className="text-muted-foreground" title="Not answered this week">—</span> : q.named[e.key] ? <span className={TONE.green.text}>named</span> : <span className="text-muted-foreground">absent</span>}</td>)}
          </tr>
        ))}</tbody>
      </table>
      {w.thisWeek.competitors.length > 0 && <p className="text-muted-foreground">Named instead this week (internal — never shown to the client): {w.thisWeek.competitors.map((x) => `${x.name} (${x.count})`).join(', ')}</p>}
      <p className="text-muted-foreground">Weekly checks so far cost ${w.costToDateUsd.toFixed(2)}.</p>
    </div>
  );
}

export function ClientHealthPanel({ o, onOpen }: { o: O; onOpen: (leadId: string, section?: string) => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const live = o.clients.filter((c) => !c.refunded);
  const blocked = live.filter((c) => (c.health?.blockers.length ?? 0) > 0).length;
  const healthRead = o.clients.some((c) => !!c.health);
  return (
    <Panel collapseKey="admin.cc.clients" title="Paid client health" icon={HeartPulse} tone="green"
      hint="Real statuses only — no health score. The weekly check is Paul's directional monitoring, separate from the official baseline, the guarantee and the four-week re-measure."
      summary={`${live.length} active client${live.length === 1 ? '' : 's'}${blocked ? ` · ${blocked} with a blocker` : ''}`}>
      {!o.clients.length ? <Empty>No paid clients yet.</Empty> : (
        <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
          {!healthRead && <p className="mb-2 text-xs text-amber-700 dark:text-amber-300">The weekly check and improvement items could not be read just now — only the basics are shown.</p>}
          <table className="w-full min-w-[980px] text-sm">
            <thead><tr className="border-b border-border/60 text-left text-[11px] uppercase tracking-wide text-muted-foreground">
              {['', 'Client', 'Route', 'Site live', 'Baseline', 'Weekly AI visibility', 'Official re-measure', 'Open items', 'Directory issues', 'Payment', 'Blockers'].map((h, i) => <th key={h + i} className={cn('py-2 font-semibold', i <= 1 ? 'pr-2' : 'px-2')}>{h}</th>)}
            </tr></thead>
            <tbody>{o.clients.map((c) => {
              const h = c.health;
              const isOpen = open === c.leadId;
              return (
                <Fragment key={c.leadId}>
                  <tr className={cn('border-b border-border/40 align-top', c.refunded && 'text-muted-foreground')}>
                    <td className="py-1.5 pr-1"><button type="button" aria-label={isOpen ? 'Hide details' : 'Show details'} aria-expanded={isOpen} onClick={() => setOpen(isOpen ? null : c.leadId)} className="rounded p-0.5 text-muted-foreground hover:bg-muted">{isOpen ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}</button></td>
                    <td className="py-1.5 pr-2"><button type="button" className="text-left font-medium hover:underline" onClick={() => onOpen(c.leadId)}>{c.business}</button><span className="block text-[10px] text-muted-foreground">sold by {c.seller}</span></td>
                    <td className="px-2 py-1.5 text-xs">{c.route ? SERVICE_ROUTE_NAME[c.route].replace('Findable ', '') : 'Not recorded'}</td>
                    <td className="px-2 py-1.5 text-xs">{h?.siteLive === null || h === undefined ? <span className="text-muted-foreground">n/a (own site)</span> : h.siteLive ? 'Live' : <span className={TONE.amber.text}>Not yet</span>}</td>
                    <td className="px-2 py-1.5 text-xs">{c.baselineStarted ? 'Started' : <span className={TONE.amber.text}>Not started</span>}</td>
                    <td className="px-2 py-1.5"><Weekly c={c} /></td>
                    <td className="px-2 py-1.5 text-xs tabular-nums">{c.remeasured ? 'Done' : c.refunded ? <span className="text-muted-foreground">Not running (refunded)</span> : c.remeasureDue ?? '—'}</td>
                    <td className="px-2 py-1.5 text-xs tabular-nums">{h ? `${h.openImprovements} open · ${h.implementedImprovements} done` : '—'}</td>
                    <td className="px-2 py-1.5 text-xs tabular-nums">{h ? h.directoryIssues : '—'}</td>
                    <td className="px-2 py-1.5 text-xs">{c.payment}</td>
                    <td className="px-2 py-1.5 text-xs">{h?.blockers.length ? h.blockers.map((b) => (
                      <button key={b} type="button" onClick={() => onOpen(c.leadId, blockerSection(b) ?? undefined)} title="Open the client at this stage"
                        className={cn('block text-left hover:underline', TONE.red.text)}>{b}</button>
                    )) : <span className="text-muted-foreground">None</span>}</td>
                  </tr>
                  {isOpen && <tr className="border-b border-border/40"><td /><td colSpan={10} className="py-2 pr-2"><Detail c={c} /></td></tr>}
                </Fragment>
              );
            })}</tbody>
          </table>
        </div>
      )}
      <p className="mt-3 text-[11px] text-muted-foreground">
        Weekly check: the client's frozen questions (their Hook Audit's, then the official baseline's), ChatGPT and Gemini, one run a week. It starts when a Build client's new site is live, or when an Optimise client's first improvements are marked live.
        {' '}The trend word moves only when an engine changes by {WEEKLY_MOVE_MIN}+ questions — smaller moves are week-to-week noise. Capped at ${WEEKLY_CLIENT_CAP_USD.toFixed(2)} per client and ${WEEKLY_TOTAL_CAP_USD.toFixed(2)} in total per week.
      </p>
    </Panel>
  );
}
