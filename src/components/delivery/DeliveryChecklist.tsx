import { Link } from 'react-router-dom';
import { Check, Loader2 } from 'lucide-react';
import {
  DELIVERY_CHECKLIST_ITEMS, isPageBuilt, isPageLine, pagesProgress, remeasureStatus,
  type DeliveryChecklist as ChecklistMap,
} from '@/lib/deliveryCockpit';
import type { ClientPageLine } from '@/hooks/useClientPages';
import { claimWindowCloseIso } from '@/lib/remeasureResults';

/* ══ THE DELIVERY CHECKLIST — ONE COMPONENT, TWO HOMES (2026-09-13) ═══════════════════════════
   Rendered by the lead card's cockpit (Outreach / Inbox) AND the Dashboard's client delivery card,
   from the one shared item list in src/lib/deliveryCockpit.ts. Three kinds of line:
     tick      → a manual tick stored on outreach_leads.delivery_checklist
     pages     → derived: one sub-line per client_pages row, ticked when the page is live
     remeasure → the week-four clock (amber ≤7 days, red overdue) beside a manual "checked" tick,
                 plus whether the replay has actually fired (the lead's remeasure_audit_id)
   Presentation only. Every write goes back through the caller (onToggle / onTogglePage), so the
   two homes cannot disagree about what a tick means. */

export interface DeliveryChecklistProps {
  checklist: ChecklistMap;
  onToggle: (key: string) => void;
  /** null = not loaded (or the query is off); [] = loaded, none planned. */
  pages: ClientPageLine[] | null;
  pagesLoading?: boolean;
  onTogglePage: (pageId: string, built: boolean) => void;
  remeasure: { dueISO: string | null; fired: boolean };
  /** THE STAMP (outreach_leads.remeasure_results_sent_at) — written once by the results sender.
   *  null = not sent. `held` = the replay has finished but nothing was sent (the sender routed it
   *  to a task: copy not approved, replay gave up, or the number cannot be proven). */
  results: { sentAt: string | null; held: boolean };
  /** Whether the client's baseline audit has finished — shown as a fact beside "Baseline checked". */
  baselineDone: boolean;
  baselineDoneLabel?: string | null;
  /** Compact rows for the dashboard card. */
  compact?: boolean;
}

function TickBox({ on }: { on: boolean }) {
  return (
    <span className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border ${on ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-border'}`}>
      {on && <Check className="h-3 w-3" strokeWidth={3} />}
    </span>
  );
}

export function DeliveryChecklistList({
  checklist, onToggle, pages, pagesLoading, onTogglePage, remeasure, results, baselineDone, baselineDoneLabel, compact,
}: DeliveryChecklistProps) {
  const fmt = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('en-GB', { day: 'numeric', month: 'short' }) : null);
  const windowClose = claimWindowCloseIso(results.sentAt);
  const rm = remeasureStatus(remeasure.dueISO, Date.now());
  const rmTone =
    rm.state === 'red' ? 'border-red-500/50 bg-red-500/10 text-red-500'
    : rm.state === 'amber' ? 'border-amber-500/50 bg-amber-500/10 text-amber-600'
    : rm.state === 'ok' ? 'border-emerald-500/40 bg-emerald-500/5 text-emerald-600'
    : 'border-border/60 bg-muted/30 text-muted-foreground';
  const hintCls = compact ? 'hidden' : 'block text-[10.5px] text-muted-foreground/70';
  const rowCls = 'flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5 text-left hover:bg-muted/40';
  const lines = (pages ?? []).filter((p) => isPageLine(p.status));
  const prog = pagesProgress(pages);

  return (
    <div className="space-y-1">
      {DELIVERY_CHECKLIST_ITEMS.map((item) => {
        if (item.kind === 'pages') {
          return (
            <div key={item.key} className="rounded-lg px-2 py-1.5" title={item.hint}>
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-medium text-foreground/80">{item.label}</span>
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  {pagesLoading ? <Loader2 className="inline h-3 w-3 animate-spin" /> : pages === null ? '—' : `${prog.built}/${prog.total} live`}
                </span>
              </div>
              <span className={hintCls}>{item.hint}</span>
              {pages !== null && !pagesLoading && lines.length === 0 && (
                <p className="mt-1 text-[11px] text-muted-foreground">
                  No pages planned yet — <Link to="/page-plan" className="underline">build the page plan</Link>.
                </p>
              )}
              {lines.length > 0 && (
                <div className="mt-1 space-y-0.5 border-l border-border/60 pl-2">
                  {lines.map((p) => {
                    const on = isPageBuilt(p.status);
                    const name = p.job || [p.service, p.town].filter(Boolean).join(' · ') || 'page';
                    return (
                      <button key={p.id} type="button" onClick={() => onTogglePage(p.id, !on)}
                        className="flex w-full items-start gap-2 rounded px-1.5 py-1 text-left hover:bg-muted/40"
                        title={on ? 'Live — click to mark as not built' : 'Click when this page is live on their site'}>
                        <TickBox on={on} />
                        <span className={`text-[11.5px] ${on ? 'text-foreground' : 'text-foreground/80'}`}>
                          {name}
                          {p.status === 'held' && <span className="ml-1 rounded bg-amber-500/15 px-1 text-[9px] text-amber-600">held</span>}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}
            </div>
          );
        }
        if (item.kind === 'stamp') {
          /* THE SYSTEM'S STAMP, NEVER A TICK. Sent → date + when the 14-day window closes (derived).
             Held → the replay finished but nothing went out; the sender flagged why. Otherwise → not
             yet. No onClick: a person cannot start or undo a client's claim clock from here. */
          const sent = !!results.sentAt;
          return (
            <div key={item.key} className="flex w-full items-start gap-2.5 rounded-lg px-2 py-1.5" title={item.hint}>
              <TickBox on={sent} />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className={`text-xs font-medium ${sent ? 'text-foreground' : 'text-foreground/80'}`}>{item.label}</span>
                  {sent ? (
                    <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600">
                      sent {fmt(results.sentAt)}{windowClose ? ` · claim window closes ${fmt(windowClose)}` : ''}
                    </span>
                  ) : results.held ? (
                    <span className="rounded bg-red-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-red-500">results held — needs you</span>
                  ) : (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">not sent yet</span>
                  )}
                </span>
                <span className={hintCls}>{item.hint}</span>
              </span>
            </div>
          );
        }
        const on = checklist[item.key] === true;
        if (item.kind === 'remeasure') {
          return (
            <button key={item.key} type="button" onClick={() => onToggle(item.key)} className={rowCls} title={item.hint}>
              <TickBox on={on} />
              <span className="min-w-0 flex-1">
                <span className="flex flex-wrap items-center gap-1.5">
                  <span className={`text-xs font-medium ${on ? 'text-foreground' : 'text-foreground/80'}`}>{item.label}</span>
                  <span className={`rounded-full border px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide ${rmTone}`}>{rm.label}</span>
                  {remeasure.fired && <span className="rounded bg-sky-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-sky-600">replay fired</span>}
                </span>
                <span className={hintCls}>{item.hint}</span>
              </span>
            </button>
          );
        }
        return (
          <button key={item.key} type="button" onClick={() => onToggle(item.key)} className={rowCls} title={item.hint}>
            <TickBox on={on} />
            <span className="min-w-0 flex-1">
              <span className="flex flex-wrap items-center gap-1.5">
                <span className={`text-xs font-medium ${on ? 'text-foreground' : 'text-foreground/80'}`}>{item.label}</span>
                {item.key === 'baseline_checked' && (
                  baselineDone
                    ? <span className="rounded bg-emerald-500/15 px-1.5 py-0.5 text-[10px] font-semibold text-emerald-600">baseline done{baselineDoneLabel ? ` ${baselineDoneLabel}` : ''}</span>
                    : <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">baseline not finished</span>
                )}
              </span>
              <span className={hintCls}>{item.hint}</span>
            </span>
          </button>
        );
      })}
    </div>
  );
}
