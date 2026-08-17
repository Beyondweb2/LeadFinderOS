import { MARKET_AUDIT_STALE_MS } from './marketView';

/* ============================================================
   THE "MEASURING NOW" FOLD — pure, client-free, testable. The hook in
   src/hooks/useInFlightMeasures.ts feeds it live rows; scripts/in-flight-measures.test.ts pins the
   one property that must never break: MARKET AUDITS ONLY — a paid baseline or business audit in
   flight must never render as a Coverage measure. See the hook for the derive-don't-store rationale.
   ============================================================ */

export interface InFlightMeasure {
  /** trade|||town, lowercased — the join key Coverage rows match against. */
  key: string;
  trade: string;
  town: string;
  auditIds: string[];
  questionsDone: number;
  questionsTotal: number;
  /** Earliest run start across the market's in-flight audits. */
  startedMs: number;
  /** Older than MARKET_AUDIT_STALE_MS — the run has stopped moving, not merely slow. */
  stalled: boolean;
}

export const inFlightKey = (trade: string, town: string): string =>
  `${trade.trim().toLowerCase()}|||${town.trim().toLowerCase()}`;

export interface RunRow { id: string; audit_id: string; status: string | null; created_at: string | null }
export interface AuditRow { id: string; business_type: string | null; location_text: string | null; is_market: boolean | null }
export interface QueueRow { run_id: string; status: string | null }

/** Pure fold: runs + audits + queue rows → one entry per market being measured.
 *  ⛔ MARKET AUDITS ONLY. Runs also carry business audits and the PAID BASELINE; `is_market` must be
 *  strictly true or a customer's baseline would render as a Coverage measure. Absence excludes. */
export function groupInFlight(
  runs: RunRow[],
  audits: AuditRow[],
  queueRows: QueueRow[],
  nowMs: number,
): InFlightMeasure[] {
  const marketById = new Map(audits.filter((a) => a.is_market === true).map((a) => [a.id, a]));
  const qByRun = new Map<string, QueueRow[]>();
  for (const q of queueRows) {
    const l = qByRun.get(q.run_id) ?? [];
    l.push(q);
    qByRun.set(q.run_id, l);
  }
  const byKey = new Map<string, InFlightMeasure>();
  for (const r of runs) {
    if (!['pending', 'running'].includes(r.status ?? '')) continue;
    const a = marketById.get(r.audit_id);
    if (!a) continue;   // business audit or baseline in flight — never shown here
    const trade = (a.business_type ?? '').trim();
    const town = (a.location_text ?? '').trim();
    if (!trade || !town) continue;
    const key = inFlightKey(trade, town);
    const startedMs = r.created_at ? Date.parse(r.created_at) : nowMs;
    const rows = qByRun.get(r.id) ?? [];
    const done = rows.filter((q) => q.status === 'done' || q.status === 'failed').length;
    const hit = byKey.get(key) ?? {
      key, trade, town, auditIds: [], questionsDone: 0, questionsTotal: 0,
      startedMs, stalled: false,
    };
    hit.auditIds.push(a.id);
    hit.questionsDone += done;
    hit.questionsTotal += rows.length;
    hit.startedMs = Math.min(hit.startedMs, startedMs);
    byKey.set(key, hit);
  }
  for (const m of byKey.values()) m.stalled = nowMs - m.startedMs > MARKET_AUDIT_STALE_MS;
  return [...byKey.values()].sort((a, b) => a.startedMs - b.startedMs);
}

