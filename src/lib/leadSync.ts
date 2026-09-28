import type { QueryClient } from '@tanstack/react-query';

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   ONE SIGNAL FOR "THIS LEAD CHANGED" (2026-09-28, Paul: Inbox and Outreach must never drift).

   There is ONE CRM truth — the lead row and lead_activity in the database. Every screen reads it; no
   screen keeps a second copy that it edits. What drifted was the NOTICE that a row had changed: the
   CRM panel told Outreach, the Inbox status pill told nobody, and the Inbox listened to nothing.

   ⛔ So every writer calls notifyLeadChanged(leadId) after a successful save, and every reader
   listens through onLeadChanged. The one listener installed by installLeadSync (App) invalidates the
   per-lead queries (CRM panel, activity, onboarding link, call playbook), and each list hook re-reads
   that ONE row from the server — never a guess patched from the writer's arguments.
   ⛔ Across browser tabs it is relayed by BroadcastChannel, so a salesperson with Outreach in one tab
   and the Inbox in another sees the same row. (Realtime on outreach_leads cannot do this for Sales:
   the table's restrictive admin-only policy means a salesperson never receives its change events.)
   The event name is the one the app already used, so the existing dispatchers keep working.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export const LEAD_CHANGED_EVENT = 'lead-row-changed';
const CHANNEL = 'lfos-lead-sync';

export interface LeadChangedDetail {
  leadId: string;
  /** Which hook instance wrote it — that instance already holds the fresh row and may skip a re-read. */
  origin?: string;
  /** True when relayed from another tab. */
  remote?: boolean;
  /** Column values the SERVER has just accepted (sent only after a yes). A reader may show them at
   *  once and then re-reads the row as usual, so the screen is instant and the database still wins. */
  patch?: Record<string, unknown>;
}

let channel: BroadcastChannel | null = null;
function bc(): BroadcastChannel | null {
  if (channel) return channel;
  try { channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL) : null; } catch { channel = null; }
  return channel;
}

/** A lead row, its CRM fields or its activity changed. Call after the server said yes. */
export function notifyLeadChanged(leadId: string, origin?: string, patch?: Record<string, unknown>): void {
  if (!leadId || typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<LeadChangedDetail>(LEAD_CHANGED_EVENT, { detail: { leadId, origin, patch } }));
  try { bc()?.postMessage({ leadId, patch }); } catch { /* another tab is a bonus, never a requirement */ }
}

/** Subscribe; returns the unsubscribe. */
export function onLeadChanged(cb: (d: LeadChangedDetail) => void): () => void {
  const h = (e: Event) => {
    const d = (e as CustomEvent<LeadChangedDetail>).detail;
    if (d?.leadId) cb(d);
  };
  window.addEventListener(LEAD_CHANGED_EVENT, h);
  return () => window.removeEventListener(LEAD_CHANGED_EVENT, h);
}

/** The per-lead React Query keys a change makes stale. */
export function leadQueryKeys(leadId: string): readonly (readonly unknown[])[] {
  return [
    ['lead-crm', leadId],
    ['sales', 'activity', leadId],
    ['onboarding-link', leadId],
    ['cold-call-playbook', leadId],
  ];
}

let installed = false;
/** Once, at the app root: relay other tabs' notices and invalidate the per-lead queries. */
export function installLeadSync(qc: QueryClient): () => void {
  if (installed || typeof window === 'undefined') return () => {};
  installed = true;
  const off = onLeadChanged(({ leadId }) => {
    for (const key of leadQueryKeys(leadId)) void qc.invalidateQueries({ queryKey: key as unknown[] });
  });
  const ch = bc();
  const onMsg = (m: MessageEvent) => {
    const d = m.data as { leadId?: string; patch?: Record<string, unknown> } | null;
    if (d?.leadId) window.dispatchEvent(new CustomEvent<LeadChangedDetail>(LEAD_CHANGED_EVENT, { detail: { leadId: d.leadId, patch: d.patch, remote: true } }));
  };
  ch?.addEventListener('message', onMsg);
  return () => { off(); ch?.removeEventListener('message', onMsg); installed = false; };
}
