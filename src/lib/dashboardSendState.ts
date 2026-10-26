/* ═════════════════════════════════════════════════════════════════
   WHAT A "WHAT NEEDS YOU" ROW SHOWS AFTER ITS SEND BUTTON (Paul, 2026-10-26). Pure.
   The row's state comes from the SAME facts the Inbox thread shows: the outbound whatsapp_messages row (sent / delivered / read /
   failed + Meta's error) and the inbox_scheduled_sends row while it waits for their send hours. The press itself adds two local
   states the database cannot hold yet: "Sending…" (the request is out) and a refusal the sender answered with no row written.
   - Sending / queued / sent, delivered, read → the row is HANDLED: it moves to "Waiting on them" with the state, until they write
     again or something new happens on the row (its time-since moves past the send), or HANDLED_FOR_MS passes (the next due time).
   - Failed / refused → the row stays where it was, with the reason, and the button works again.
   - The button is OFF while sending or queued, and for DASHBOARD_RESEND_WINDOW_MS after the same template went (the server refuses
     it too: send-whatsapp-message recentDashboardSend). Nothing here sends or writes.
   ═════════════════════════════════════════════════════════════════ */
import { DASHBOARD_PENDING_QUEUE_STATUSES, DASHBOARD_RESEND_WINDOW_MS, noDoubleSendTemplate } from './dashboardTemplates';
import { queuedLabel } from './inboxSendWindow';
import { sendErrorLine, partsFromStoredError, type SendErrorParts } from './sendErrorMeaning';
import type { NeedsRow } from './needsMe';

/** A handled row comes back to its own group after this long with no reply (the next nudge is then due). */
export const HANDLED_FOR_MS = 48 * 3_600_000;

/** An outbound dashboard-template message, as the Inbox reads it. */
export interface DashboardSentFact {
  id: string; lead_id: string | null; template_name: string | null; status: string | null; created_at: string;
  error_code?: number | string | null; error_title?: string | null; error_details?: string | null; error?: string | null;
}
/** A send waiting for their send hours (inbox_scheduled_sends, as my_inbox_scheduled_sends returns it). */
export interface DashboardQueuedFact { id: string; lead_id: string | null; template_name: string | null; status: string; send_at: string; tz: string; created_at: string }

export type RowSendState =
  | { phase: 'sending'; template: string; at: string }
  | { phase: 'queued'; template: string; at: string; sendAt: string; tz: string }
  | { phase: 'sent' | 'delivered' | 'read'; template: string; at: string }
  | { phase: 'failed'; template: string; at: string; reason: string };

const PENDING = new Set<string>(DASHBOARD_PENDING_QUEUE_STATUSES);

function failedReason(m: DashboardSentFact): string {
  const n = m.error_code == null || m.error_code === '' ? null : Number(m.error_code);
  const stored = partsFromStoredError(m.error ?? null);
  const parts: SendErrorParts = { code: n != null && Number.isFinite(n) ? n : stored.code, title: m.error_title ?? stored.title, details: m.error_details ?? stored.details };
  return sendErrorLine('whatsapp', parts) ?? 'Meta did not say why.';
}

/** The newest dashboard send to this lead, from the database: a pending queued send wins, else the newest message. */
export function storedSendState(leadId: string | null, sent: readonly DashboardSentFact[], queued: readonly DashboardQueuedFact[]): RowSendState | null {
  if (!leadId) return null;
  const q = queued.filter((r) => r.lead_id === leadId && noDoubleSendTemplate(r.template_name) && PENDING.has(r.status))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  if (q) return q.status === 'sending' ? { phase: 'sending', template: q.template_name!, at: q.created_at } : { phase: 'queued', template: q.template_name!, at: q.created_at, sendAt: q.send_at, tz: q.tz };
  const m = sent.filter((r) => r.lead_id === leadId && noDoubleSendTemplate(r.template_name))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];
  if (!m) return null;
  const template = m.template_name!;
  /* Positive matches only: an unknown status reads as "sent" (it went to the sender), never as failed or as nothing. */
  if (m.status === 'failed') return { phase: 'failed', template, at: m.created_at, reason: failedReason(m) };
  if (m.status === 'delivered' || m.status === 'read') return { phase: m.status, template, at: m.created_at };
  return { phase: 'sent', template, at: m.created_at };
}

/** The press's own state against the stored one: "Sending…" always wins; else the newer of the two. */
export function mergeSendState(local: RowSendState | null | undefined, stored: RowSendState | null): RowSendState | null {
  if (!local) return stored;
  if (local.phase === 'sending') return local;
  if (!stored) return local;
  return Date.parse(stored.at) >= Date.parse(local.at) - 60_000 ? stored : local;
}

/** "14:02" today (London), "Mon 14:02" before that. */
function clock(iso: string, nowMs = Date.now()): string {
  const d = new Date(iso);
  const day = (x: Date) => x.toLocaleDateString('en-GB', { timeZone: 'Europe/London' });
  const time = d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit', timeZone: 'Europe/London' });
  return day(d) === day(new Date(nowMs)) ? time : `${d.toLocaleDateString('en-GB', { weekday: 'short', timeZone: 'Europe/London' })} ${time}`;
}

/** The one line on the row: "Sending…", "Queued, sends at 09:00 their time", "Sent 14:02", "Delivered", "Failed: …". */
export function sendStateLine(s: RowSendState): string {
  switch (s.phase) {
    case 'sending': return 'Sending…';
    case 'queued': return queuedLabel(s.sendAt, s.tz);
    case 'sent': return `Sent ${clock(s.at)}`;
    case 'delivered': return `Delivered · sent ${clock(s.at)}`;
    case 'read': return `Read · sent ${clock(s.at)}`;
    case 'failed': return `Failed: ${s.reason}`;
  }
}

/** Handled = it is going or has gone, and nothing new has happened on the row since. Failed is never handled. */
export function rowHandled(row: Pick<NeedsRow, 'sinceIso'>, s: RowSendState | null, nowMs: number): boolean {
  if (!s || s.phase === 'failed') return false;
  if (s.phase === 'sending' || s.phase === 'queued') return true;
  const at = Date.parse(s.at);
  if (!Number.isFinite(at) || nowMs - at >= HANDLED_FOR_MS) return false;
  const since = row.sinceIso ? Date.parse(row.sinceIso) : NaN;
  return !Number.isFinite(since) || at >= since;
}

/** Why the button is off, or null when it can be pressed. Only the SAME template is held; a failure frees it at once. */
export function sendLockedReason(s: RowSendState | null, template: string, nowMs: number): string | null {
  if (!s || s.phase === 'failed') return null;
  if (s.phase === 'sending') return 'Sending…';
  if (s.phase === 'queued') return s.template === template ? queuedLabel(s.sendAt, s.tz) : null;
  if (s.template !== template) return null;
  return nowMs - Date.parse(s.at) < DASHBOARD_RESEND_WINDOW_MS ? sendStateLine(s) : null;
}

/** The rows with their send state; a handled row moves to "Waiting on them". */
export function withSendStates(rows: readonly NeedsRow[], stateOf: (r: NeedsRow) => RowSendState | null, nowMs: number): (NeedsRow & { sendState: RowSendState | null })[] {
  return rows.map((r) => {
    const s = stateOf(r);
    return { ...r, sendState: s, group: rowHandled(r, s, nowMs) ? 'waiting' : r.group };
  });
}
