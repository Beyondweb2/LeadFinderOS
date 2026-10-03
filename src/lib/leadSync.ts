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
  /** The patch is what the person just chose and the server has NOT answered yet. Readers show it and
   *  do NOT re-read (a re-read now would bring back the old row). A second notice follows either way:
   *  after a yes, the confirmed patch; after a refusal, a plain notice, and every reader re-reads the
   *  true row — which is the revert. */
  optimistic?: boolean;
}

let channel: BroadcastChannel | null = null;
function bc(): BroadcastChannel | null {
  if (channel) return channel;
  try { channel = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel(CHANNEL) : null; } catch { channel = null; }
  return channel;
}

/** A lead row, its CRM fields or its activity changed. Call after the server said yes. */
export function notifyLeadChanged(leadId: string, origin?: string, patch?: Record<string, unknown>, optimistic?: boolean): void {
  if (!leadId || typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<LeadChangedDetail>(LEAD_CHANGED_EVENT, { detail: { leadId, origin, patch, optimistic } }));
  try { bc()?.postMessage({ leadId, patch, optimistic }); } catch { /* another tab is a bonus, never a requirement */ }
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
    ['lead-wrong-number', leadId],
  ];
}

/** Book-wide queries a lead change makes stale (not keyed by lead). The Sales dashboard's own numbers
 *  (fn sales-performance) counted a Next Action, an outcome or a status the person had just set only after
 *  its 60-second staleTime — so they are invalidated too, once per burst (BOOK_WIDE_DEBOUNCE_MS): a bulk
 *  edit fires one notice per lead, and an interval shorter than the query piles copies up (CLAUDE.md §4). */
export const BOOK_WIDE_LEAD_KEYS: readonly (readonly unknown[])[] = [['sales-performance'], ['my-whatsapp-queue']];
const BOOK_WIDE_DEBOUNCE_MS = 1500;

let installed = false;
/** Once, at the app root: relay other tabs' notices and invalidate the per-lead queries. */
export function installLeadSync(qc: QueryClient): () => void {
  if (installed || typeof window === 'undefined') return () => {};
  installed = true;
  let bookWideTimer: ReturnType<typeof setTimeout> | null = null;
  const off = onLeadChanged(({ leadId, optimistic }) => {
    if (optimistic) return; // nothing to re-read until the server has answered
    for (const key of leadQueryKeys(leadId)) void qc.invalidateQueries({ queryKey: key as unknown[] });
    if (bookWideTimer) clearTimeout(bookWideTimer);
    bookWideTimer = setTimeout(() => {
      bookWideTimer = null;
      for (const key of BOOK_WIDE_LEAD_KEYS) void qc.invalidateQueries({ queryKey: key as unknown[] });
    }, BOOK_WIDE_DEBOUNCE_MS);
  });
  const ch = bc();
  const onMsg = (m: MessageEvent) => {
    const d = m.data as { leadId?: string; patch?: Record<string, unknown>; optimistic?: boolean } | null;
    if (d?.leadId) window.dispatchEvent(new CustomEvent<LeadChangedDetail>(LEAD_CHANGED_EVENT, { detail: { leadId: d.leadId, patch: d.patch, optimistic: d.optimistic, remote: true } }));
  };
  ch?.addEventListener('message', onMsg);
  return () => { off(); if (bookWideTimer) clearTimeout(bookWideTimer); ch?.removeEventListener('message', onMsg); installed = false; };
}
