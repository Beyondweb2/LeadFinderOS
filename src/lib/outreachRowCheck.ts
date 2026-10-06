/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE OUTREACH ROW'S AI CHECK — one compact line per lead (2026-10-05,
   improve/outreach-compact-audit-rows; record docs/pre-sales-certification/outreach-compact-audit-rows.md).

   The big "Check before calling" results panel is gone: it was a second list on top of the first and
   did not scale past a batch. The Outreach rows are the one working list. Each row says, at most:
       Not checked · Waiting · Checking… · ChatGPT 1/3 · Gemini 0/3 · Check failed · Retry
   and offers "Call screen" once a result is in.

   ⛔ THE ROW CARRIES SCORES ONLY. No rival names, no answer text, no website findings, no best missed
      question, no explanation — those are the call screen's and the full audit's. Nothing in this file
      can produce them: RowScore holds two numbers per engine and a label, never a name or a sentence.
   ⛔ THE DENOMINATOR IS STORED, NEVER WRITTEN AS A FIGURE. "X/3" is named-of-answered from the same
      fold the report and the call screen print (buildReportData perEngine, cellNamed()), so a lost
      answer reads 1/2 and a three-run audit reads x/9 without a line changing here.
   ⛔ ONE STATE PER ROW, POSITIVE MATCHES. The rep's open batch item says waiting / checking / failed /
      skipped; otherwise the audit map (auditRowState) says ready / checking; anything else is
      "not checked". An unknown status never reads as ready.
   ⛔ PURE. Imported by node tests: relative .ts imports only.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { auditRowState, type LeadAuditState } from './auditRowState.ts';
import { SCORED_ENGINES, ENGINE_LABELS } from './auditReport.ts';
import { salesEngineLabel } from './scoreTone.ts';

export interface EngineScore { label: string; named: number; answered: number }
/** The two scored engines, in a fixed order (ChatGPT, Gemini). An engine with no answers is
 *  present with answered 0 — "Gemini –", never dropped and never 0/3. */
export interface RowScore { engines: EngineScore[] }

/** From buildReportData's perEngine ({label, named, total}) — the report's own fold. */
export function rowScoreFromPerEngine(perEngine: ReadonlyArray<{ label: string; named: number; total: number }> | null | undefined): RowScore | null {
  if (!perEngine) return null;
  const engines = SCORED_ENGINES.map((e) => {
    const label = ENGINE_LABELS[e] ?? e;
    const row = perEngine.find((p) => p.label === label);
    return { label, named: row ? Math.max(0, Math.floor(row.named)) : 0, answered: row ? Math.max(0, Math.floor(row.total)) : 0 };
  });
  return engines.some((e) => e.answered > 0) ? { engines } : null;
}

/** "ChatGPT 1/3" / "Google AI –" (no answer came back from that engine). ⛔ Sales screens say "Google AI"
 *  (sales-team-today, 2026-10-06); the engine's own label ('Gemini') stays the key the fold is matched on. */
export function engineScoreText(e: EngineScore): string {
  const label = salesEngineLabel(e.label);
  return e.answered > 0 ? `${label} ${e.named}/${e.answered}` : `${label} –`;
}
/** "ChatGPT 1/3 · Google AI 0/3" — the whole row summary. */
export function scoreLine(s: RowScore | null | undefined): string | null {
  return s ? s.engines.map(engineScoreText).join(' · ') : null;
}

/** The rep's batch item for a lead (useSalesChecks SalesCheckItemView, the fields read here). */
export interface RowBatchItem { lead_id: string; status: string; audit_source?: string | null; message?: string | null; reason?: string | null }

export type RowCheckKind = 'not_checked' | 'waiting' | 'checking' | 'ready' | 'failed' | 'skipped';
export interface RowCheckState {
  kind: RowCheckKind;
  /** A result reused from an earlier check (no new spend). INTERNAL ONLY: the row draws it exactly like a fresh result. */
  cached: boolean;
  /** The server's plain-words reason for a failed / skipped item (REASON_TEXT), else null. */
  message: string | null;
}

const ITEM_WAITING: ReadonlySet<string> = new Set(['queued', 'starting']);

/**
 * One reading for one row.
 *   1. The rep's own batch: queued/starting → waiting; running → checking.
 *   2. The audit map: in flight → checking; complete/capped → ready.
 *   3. The rep's own batch, terminal without a result: failed → failed; skipped → skipped.
 *   4. The audit map's latest run failed/cancelled → failed (Retry).
 *   5. Anything else → not checked.
 * A ready audit wins over an older failed/skipped item: the result on the lead is real either way.
 */
export function rowCheckState(map: LeadAuditState | null | undefined, item: RowBatchItem | null | undefined): RowCheckState {
  const st = item?.status ?? null;
  if (st && ITEM_WAITING.has(st)) return { kind: 'waiting', cached: false, message: null };
  if (st === 'running') return { kind: 'checking', cached: false, message: null };
  const m = auditRowState(map);
  if (m === 'running') return { kind: 'checking', cached: false, message: null };
  if (m === 'done') return { kind: 'ready', cached: st === 'reused' || item?.audit_source === 'reused', message: null };
  if (st === 'failed') return { kind: 'failed', cached: false, message: item?.message ?? null };
  if (st === 'skipped') return { kind: 'skipped', cached: false, message: item?.message ?? null };
  if (map && (map.status === 'failed' || map.status === 'cancelled')) return { kind: 'failed', cached: false, message: null };
  return { kind: 'not_checked', cached: false, message: null };
}

/** The short word for a state with no scores to show. */
export const ROW_CHECK_WORD: Record<RowCheckKind, string> = {
  not_checked: 'Not checked', waiting: 'Waiting', checking: 'Checking…', ready: 'Ready', failed: 'Check failed', skipped: 'Skipped',
};

/* ── OPEN NEXT READY ─────────────────────────────────────────────────────────────────────────────
   Walks the list the person is LOOKING AT — the page's owner scope and every filter and sort already
   applied — in the order shown, and offers the first lead with a ready AI check that is still worth a
   call and has not been opened from here this session. It reads the list it is handed; it can never
   reach a lead outside the scope (another rep's lead is not in a rep's list at all). */

export interface NextReadyLead {
  id: string;
  status?: string | null;
  is_archived?: boolean | null;
  amount_paid?: unknown;
}
/** Statuses that are not a call to make: a client, a lost lead, a won one. The same sets the sales
 *  check refuses on (salesCheck.ts leadEligibility) — held equal by the test. */
export const NEXT_READY_EXCLUDED_STATUSES: ReadonlySet<string> = new Set([
  'payment_received', 'in_delivery', 'completed', 'refunded',
  'not_interested', 'opted_out', 'won_pending_onboarding',
]);
export function isCallableLead(l: NextReadyLead): boolean {
  if (l.is_archived === true) return false;
  const paid = Number(l.amount_paid ?? 0);
  if (Number.isFinite(paid) && paid > 0) return false;
  return !NEXT_READY_EXCLUDED_STATUSES.has(String(l.status ?? ''));
}

export function nextReadyLead<T extends NextReadyLead>(
  list: readonly T[],
  stateOf: (lead: T) => RowCheckState,
  opened: ReadonlySet<string>,
): T | null {
  for (const l of list) {
    if (opened.has(l.id)) continue;
    if (!isCallableLead(l)) continue;
    if (stateOf(l).kind !== 'ready') continue;
    return l;
  }
  return null;
}

/** How many leads "Open next ready" would still walk through — the bar's count. */
export function readyCount<T extends NextReadyLead>(list: readonly T[], stateOf: (lead: T) => RowCheckState, opened: ReadonlySet<string> = new Set()): number {
  let n = 0;
  for (const l of list) if (!opened.has(l.id) && isCallableLead(l) && stateOf(l).kind === 'ready') n++;
  return n;
}
