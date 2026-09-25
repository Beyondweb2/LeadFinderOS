/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE WHATSAPP CUSTOMER-SERVICE WINDOW — one leaf, read by the Inbox and the warm-reply drafter.

   Meta lets a business send FREE-FORM text only within 24 hours of the customer's last inbound
   message; outside it only an approved template goes. The window is measured from the newest
   INBOUND row's `created_at`, never from anything we sent.

   ⚠️ `send-whatsapp-message` keeps its own copy of the 24-hour constant and is deliberately NOT
   changed by the warm-reply work (Paul, 2026-09-25: "do not change existing template-send
   protections"). That copy is the one that actually refuses a send; this one only decides what the
   Inbox offers. If the two ever disagree the sender wins, and a free-form draft outside the window
   is refused at send time exactly as before. `scripts/warm-lead-reply.test.ts` pins both to 24 h.

   Pure and edge-reachable (relative imports only, CLAUDE.md §3).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export const WHATSAPP_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000;

export interface ServiceWindowState {
  open: boolean;
  /** Whole hours left, rounded up, at least 1 while open; 0 when closed. */
  hoursLeft: number;
  /** When the window closes (ISO), or null when there has never been an inbound message. */
  closesAt: string | null;
}

/** The window for a conversation, from its newest inbound timestamp. No inbound → closed: a
 *  conversation the prospect never replied to has no window at all (absence is never "open"). */
export function serviceWindowState(lastInboundAt: string | null | undefined, nowMs: number = Date.now()): ServiceWindowState {
  if (!lastInboundAt) return { open: false, hoursLeft: 0, closesAt: null };
  const at = new Date(lastInboundAt).getTime();
  if (!Number.isFinite(at)) return { open: false, hoursLeft: 0, closesAt: null };
  const closesAtMs = at + WHATSAPP_SERVICE_WINDOW_MS;
  const closesAt = new Date(closesAtMs).toISOString();
  const left = closesAtMs - nowMs;
  if (left <= 0) return { open: false, hoursLeft: 0, closesAt };
  return { open: true, hoursLeft: Math.max(1, Math.ceil(left / (60 * 60 * 1000))), closesAt };
}
