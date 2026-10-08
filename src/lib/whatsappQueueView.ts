/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE WHATSAPP QUEUE — WHAT IS ON SCREEN, FOR BOTH ROLES (2026-10-06, fix/whatsapp-queue-role-parity).

   ⛔ ONE QUEUE UI. The admin and a salesperson open the SAME panel (src/components/WhatsAppQueuePanel.tsx)
      on the same page (/whatsapp-queue). The only differences are the DATA SCOPE, which the server decides,
      and the controls that act on the whole team (pause / resume, a tick, sent today against the cap, the
      next paced send, test / live mode, cancelling a no-reply follow-up). There used to be two panels: the
      admin's on Outreach and a simplified "Your leads queued" list for Sales. That split was the bug.

   ⛔ THE SCOPE IS THE SERVER'S. Every row comes from the `sales_leads` view, which returns an admin every
      prospect and a salesperson ONLY leads assigned to them (my_role() + assigned_to_user_id = auth.uid(),
      never a client). Nothing here or in the panel filters by owner. A queue item IS its lead row — there is
      no separate queue table — so who may see it is who may work the lead now (can_work_lead), the same rule
      lead_unqueue checks before it removes anything.

   ⛔ ONLY REAL STATES. The processor has exactly these: a lead waiting in the opener lane (status 'queued'),
      a lead waiting in the no-reply follow-up lane (contact_followup_queued_at), the hook follow-up lane
      (hook_followup_queued_at, a count), and a queued lead that is archived (never sent). There is no
      "sending" row state: a tick sends and moves the lead on in one pass. Sent, failed and skipped leads
      leave the queue (their reason is on the lead, whatsapp_delivery_status) — the queue panel never showed
      them and still does not. The last BATCH a person queued is shown separately, as a batch, never as rows.

   Pure: no React, no Supabase. The hook (src/hooks/useWhatsAppQueue.ts) reads, the panel draws.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import type { Tone } from '@/components/salesDash/primitives';
import { coldWhatsAppVerdict } from './coldWhatsAppEligibility';
import { isColdOutreachTemplate } from './coldOutreach';

/** The columns the queue reads from `sales_leads` — the same list for both roles. */
export const QUEUE_ROW_COLUMNS =
  'id, business_name, status, is_archived, queued_at, whatsapp_template, phone, country, contact_followup_queued_at, hook_followup_queued_at';

/** Rows in ANY lane (or archived-but-queued): the one PostgREST `or` filter, for both roles. */
export const QUEUE_ROW_FILTER = 'status.eq.queued,contact_followup_queued_at.not.is.null,hook_followup_queued_at.not.is.null';

export const WHATSAPP_QUEUE_KEY = ['whatsapp-queue-rows'] as const;
/** Re-read every 30 s while anything waits — one mechanism, both roles. */
export const QUEUE_POLL_MS = 30_000;

/** Fired by every queue path (bulk queue for both roles, the lead popup, campaign launch / stop, remove). */
export const QUEUE_CHANGED_EVENT = 'whatsapp-queue-changed';
export function announceQueueChanged(): void {
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(QUEUE_CHANGED_EVENT));
}

export interface QueueRow {
  id: string;
  business_name: string | null;
  status: string | null;
  is_archived: boolean | null;
  queued_at: string | null;
  whatsapp_template: string | null;
  phone: string | null;
  country?: string | null;
  contact_followup_queued_at: string | null;
  hook_followup_queued_at: string | null;
}

export interface QueueView {
  /** Opener lane, send order (oldest queued first, id as the tiebreak — the processor's order). */
  waiting: QueueRow[];
  /** No-reply follow-up lane, drain order. Drains only once the opener lane is empty each tick. */
  followUps: QueueRow[];
  /** Hook follow-up lane: a count, as the admin panel always showed it. */
  hookCount: number;
  /** Queued but archived — the processor will NOT send these. */
  archivedWaiting: number;
  /** Waiting COLD openers whose number WhatsApp cannot reach (none, landline, not a UK mobile). The sender flags
   *  them No WhatsApp when it reaches them; this says so before then (positive allowlist: unknown = unsendable). */
  unsendable: number;
}

const byStamp = (k: 'queued_at' | 'contact_followup_queued_at') => (a: QueueRow, b: QueueRow) =>
  (a[k] ?? '').localeCompare(b[k] ?? '') || a.id.localeCompare(b.id);

/** Split the authorised rows into the lanes. Every count on screen comes from here — never a global
 *  number beside a scoped list. */
export function deriveQueue(rows: readonly QueueRow[]): QueueView {
  const live = rows.filter((r) => r.is_archived !== true);
  return {
    waiting: live.filter((r) => r.status === 'queued').sort(byStamp('queued_at')),
    followUps: live.filter((r) => !!r.contact_followup_queued_at).sort(byStamp('contact_followup_queued_at')),
    hookCount: live.filter((r) => !!r.hook_followup_queued_at).length,
    archivedWaiting: rows.filter((r) => r.is_archived === true && r.status === 'queued').length,
    unsendable: live.filter((r) => r.status === 'queued'
      && isColdOutreachTemplate(r.whatsapp_template ?? '')
      && !coldWhatsAppVerdict(r.phone, r.country ?? null).eligible).length,
  };
}

/** The row chips — one map, both roles, so a state can never look different on the two screens. */
export type QueueRowState = 'waiting' | 'follow_up';
export const QUEUE_ROW_STATE: Record<QueueRowState, { label: string; tone: Tone; title: string }> = {
  waiting: { label: 'Waiting', tone: 'blue', title: 'In the queue. It sends at its paced turn, inside the sending window.' },
  follow_up: { label: 'No-reply follow-up', tone: 'blue', title: 'A follow-up to an opener that got no reply. These send after the openers.' },
};

/** The Outreach summary line: "3 waiting · 2 no-reply follow-ups". */
export function queueSummaryParts(v: QueueView): string[] {
  const parts: string[] = [];
  if (v.waiting.length) parts.push(`${v.waiting.length} waiting`);
  if (v.followUps.length) parts.push(`${v.followUps.length} no-reply follow-up${v.followUps.length === 1 ? '' : 's'}`);
  if (v.hookCount) parts.push(`${v.hookCount} hook follow-up${v.hookCount === 1 ? '' : 's'}`);
  return parts;
}

/* ══ THE LAST BATCH ═══════════════════════════════════════════════════════════════════════════════
   "Queued 0" with every lead skipped used to leave nothing behind but a toast — the queue then looked
   empty, as if the press had failed. The batch's own result (from sales_queue_opener, or the admin's
   queue path) is kept for this tab and shown as a batch: never as queue rows, never sent to the server.
   Per-viewer convenience only, so sessionStorage, wrapped (it can throw or be empty). */
/** `names`: up to a handful of the skipped businesses, so a salesperson can see WHICH ones and why. */
export interface QueueSkip { n: number; label: string; names?: string[] }
export interface QueueBatch { at: string; queued: number; skipped: QueueSkip[] }
const BATCH_KEY = 'whatsapp-queue.last-batch.v1';
export const QUEUE_BATCH_EVENT = 'whatsapp-queue-batch';
let memoryBatch: QueueBatch | null = null;

export const BATCH_SKIP_NAMES_MAX = 5;
export function recordQueueBatch(queued: number, skipped: QueueSkip[], now = new Date()): QueueBatch {
  const b: QueueBatch = {
    at: now.toISOString(), queued,
    skipped: skipped.filter((s) => s.n > 0).map((s) => (s.names?.length ? { ...s, names: s.names.slice(0, BATCH_SKIP_NAMES_MAX) } : { n: s.n, label: s.label })),
  };
  memoryBatch = b;
  try { globalThis.sessionStorage?.setItem(BATCH_KEY, JSON.stringify(b)); } catch { /* memory copy still serves this tab */ }
  if (typeof window !== 'undefined') window.dispatchEvent(new CustomEvent(QUEUE_BATCH_EVENT));
  return b;
}

/** The last batch this tab queued, if it is under BATCH_SHOWN_MS old. */
export const BATCH_SHOWN_MS = 60 * 60 * 1000;
export function readQueueBatch(now = new Date()): QueueBatch | null {
  let b = memoryBatch;
  if (!b) {
    try {
      const raw = globalThis.sessionStorage?.getItem(BATCH_KEY);
      const p = raw ? JSON.parse(raw) as QueueBatch : null;
      if (p && typeof p.at === 'string' && typeof p.queued === 'number' && Array.isArray(p.skipped)) b = p;
    } catch { b = null; }
  }
  if (!b) return null;
  const age = now.getTime() - new Date(b.at).getTime();
  return Number.isFinite(age) && age >= 0 && age <= BATCH_SHOWN_MS ? b : null;
}

/** Test-only. */
export function clearQueueBatch(): void {
  memoryBatch = null;
  try { globalThis.sessionStorage?.removeItem(BATCH_KEY); } catch { /* ignore */ }
}

/** "Queued 3" / "Queued 0 — 2 skipped" — the batch headline. */
export function batchHeadline(b: QueueBatch): string {
  const skipped = b.skipped.reduce((s, x) => s + x.n, 0);
  return skipped ? `Queued ${b.queued} · ${skipped} skipped` : `Queued ${b.queued}`;
}

/** UK clock for the "UK time" stat, read on the viewer's machine in Europe/London. */
export function ukClock(now = new Date()): string {
  return now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
}
