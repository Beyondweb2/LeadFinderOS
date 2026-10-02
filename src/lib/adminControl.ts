/* ══ THE ADMIN CONTROL CENTRE'S RULES (2026-10-02, docs/dashboards-redesign.md) ════════════════════
   Paul no longer does most of the outreach. The Admin dashboard is his business / sales control centre:
   the team, the exceptions, new sales and handoffs, money, his own actions. These pure rules decide
   which client sits where, what "needs you" means, and who is active — so ONE fact has ONE home:

   - NEW SALES & HANDOFFS owns every paid client still before delivery (Setup / Ready), plus anything sold
     in the last NEW_SALE_DAYS. Its row says the one next step — from the canonical Paid Clients view
     (deliveryStage.ts via paid-client-hub), never a second status system.
   - WHAT NEEDS YOU owns Paul's actions EVERYWHERE ELSE: in-delivery client steps that are his, a handoff
     beyond the handoff section, payments, replies, sign-ups — the server's attention list minus the
     two client kinds the canonical view replaces. Clients that live in the handoff section appear here as
     ONE line pointing there, never once per client.
   ⛔ The server's `setup_not_started` ("Start the baseline") and `remeasure_overdue` items are DROPPED here:
   they predate the canonical delivery flow (Setup → Ready → Discovery → questions → baseline) and would
   contradict it. The canonical next step carries both cases. */
import type { AttentionItem } from './adminMetrics.ts';

/** The handoff fields this file reads (paid-client-hub `list` → setupView). */
export interface HandoffClient {
  id: string; business_name: string; payment_date?: string | null; amount_paid?: number | null;
  sold_by_user_id?: string | null; sold_by_name?: string | null;
  handoff?: { stage: string; stage_label: string; state: string; state_label: string; done: number; total: number; missing: string[]; next: { label: string; action: boolean; section: string } } | null;
}

/** A client sold within this many days shows under New sales even once delivery has started. */
export const NEW_SALE_DAYS = 14;
/** A sales handoff still incomplete this many days after payment becomes Paul's to chase. */
export const HANDOFF_CHASE_DAYS = 2;
/** Activity within ACTIVE_HOURS = Active; within QUIET_DAYS = Quiet; older or none = Inactive. */
export const ACTIVE_HOURS = 24;
export const QUIET_DAYS = 3;
/** Server attention kinds the canonical delivery view replaces (see the header). */
export const REPLACED_ATTENTION_KINDS: ReadonlySet<string> = new Set(['setup_not_started', 'remeasure_overdue']);

const DAY = 86_400_000;
const daysSince = (iso: string | null | undefined, nowMs: number) => (iso ? Math.floor((nowMs - Date.parse(`${iso.slice(0, 10)}T12:00:00Z`)) / DAY) : null);

/** Before delivery: the handoff / setup stages. Positive match — an unknown stage is NOT pre-delivery. */
export const isPreDelivery = (c: HandoffClient) => c.handoff?.stage === 'setup' || c.handoff?.stage === 'ready';
const ended = (c: HandoffClient) => c.handoff?.stage === 'ended' || c.handoff?.state === 'ended';

/** A handoff card's next step: the canonical one, or — once a seller has left the handoff HANDOFF_CHASE_DAYS — Paul chasing them. */
export function handoffNext(c: HandoffClient, nowMs: number): { label: string; mine: boolean } {
  const d = daysSince(c.payment_date, nowMs);
  if (c.handoff?.state === 'waiting_sales' && d !== null && d >= HANDOFF_CHASE_DAYS) return { label: `Chase ${c.sold_by_name ?? 'the seller'} for the handoff (paid ${d} days ago)`, mine: true };
  return { label: c.handoff?.next.label ?? 'Open the client', mine: !!c.handoff?.next.action };
}

/** NEW SALES & HANDOFFS: pre-delivery clients, plus the recently sold. Most actionable first, then newest. */
export function handoffClients(clients: HandoffClient[], nowMs: number): HandoffClient[] {
  const rank = (c: HandoffClient) => (handoffNext(c, nowMs).mine ? 0 : c.handoff?.state === 'waiting_sales' ? 1 : isPreDelivery(c) ? 2 : 3);
  return clients
    .filter((c) => !ended(c) && (isPreDelivery(c) || ((daysSince(c.payment_date, nowMs) ?? Infinity) <= NEW_SALE_DAYS)))
    .sort((a, b) => rank(a) - rank(b) || String(b.payment_date ?? '').localeCompare(String(a.payment_date ?? '')));
}

/** WHAT NEEDS YOU: Paul's actions, one line each, most urgent first. */
export function needsYouItems(attention: AttentionItem[], clients: HandoffClient[], nowMs: number): AttentionItem[] {
  const out: AttentionItem[] = [];
  const live = clients.filter((c) => !ended(c) && c.handoff);
  /* Clients in NEW SALES & HANDOFFS live there — here they are ONE pointer line, never a line each. */
  const inHandoffs = new Set(handoffClients(clients, nowMs).map((c) => c.id));
  const chase = (c: HandoffClient) => { const d = daysSince(c.payment_date, nowMs); return c.handoff!.state === 'waiting_sales' && d !== null && d >= HANDOFF_CHASE_DAYS; };
  const readyNew = live.filter((c) => inHandoffs.has(c.id) && (c.handoff!.next.action || chase(c)));
  if (readyNew.length) out.push({
    key: 'handoffs-ready', group: 'today', kind: 'handoffs_ready', leadId: null,
    business: `${readyNew.length} new client${readyNew.length === 1 ? ' needs' : 's need'} you`,
    why: readyNew.slice(0, 3).map((c) => `${c.business_name}: ${chase(c) ? `chase ${c.sold_by_name ?? 'the seller'} for the handoff` : c.handoff!.next.label}`).join(' · ') + (readyNew.length > 3 ? ' …' : ''),
    owner: null, sinceIso: null, state: 'New sales', action: 'Open New sales & handoffs', open: 'client',
  });
  // In-delivery steps that are Paul's (Discovery, approve questions, run the baseline, build, remeasure…).
  for (const c of live) {
    if (inHandoffs.has(c.id) || !c.handoff!.next.action) continue;
    out.push({
      key: `client-next:${c.id}`, group: 'today', kind: 'client_next', leadId: c.id, business: c.business_name,
      why: `${c.handoff!.stage_label} · ${c.handoff!.state_label}`, owner: c.sold_by_name ?? null, sinceIso: c.payment_date ?? null,
      state: c.handoff!.stage_label, action: c.handoff!.next.label, open: 'client', section: c.handoff!.next.section,
    });
  }
  out.push(...attention.filter((i) => !REPLACED_ATTENTION_KINDS.has(i.kind)));
  const order = { urgent: 0, today: 1, review: 2, blocked: 3 } as const;
  return out.map((i, n) => ({ i, n })).sort((a, b) => order[a.i.group] - order[b.i.group] || a.n - b.n).map((x) => x.i);
}

export type ActivityStatus = 'active' | 'quiet' | 'inactive';
/** Derived, never stored. No recorded activity = inactive. */
export function activityStatus(lastIso: string | null | undefined, nowMs: number): ActivityStatus {
  if (!lastIso) return 'inactive';
  const h = (nowMs - Date.parse(lastIso)) / 3_600_000;
  return h <= ACTIVE_HOURS ? 'active' : h <= QUIET_DAYS * 24 ? 'quiet' : 'inactive';
}
