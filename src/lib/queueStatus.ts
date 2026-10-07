import type { QueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

/* THE WHATSAPP QUEUE STATUS, READ ONCE AND SHARED (2026-09-27, Inbox/Outreach speed).
 *
 * 🔴 WHY. process-whatsapp-queue mode:'status' was called separately by the queue panel, the
 * selected-opener hook and the Inbox's first-reply panel — two or three identical calls on every
 * Outreach/Inbox load, each several seconds. One React Query key: a call already in flight is joined,
 * and a result younger than STATUS_STALE_MS is reused. An explicit refresh (the panel's button, or
 * after a pause/resume/setting change) passes fresh=true and always goes to the server.
 * Reading it sends nothing — 'status' returns before the drip. */
export const QUEUE_STATUS_KEY = ['whatsapp-queue-status'] as const;
export const STATUS_STALE_MS = 30_000;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type QueueStatusPayload = Record<string, any> & { ok?: boolean };

async function fetchQueueStatus(): Promise<QueueStatusPayload> {
  const { data, error } = await supabase.functions.invoke('process-whatsapp-queue', { body: { mode: 'status' } });
  if (error) throw error;
  return (data ?? {}) as QueueStatusPayload;
}

export function getQueueStatus(qc: QueryClient, fresh = false): Promise<QueueStatusPayload> {
  return qc.fetchQuery({ queryKey: QUEUE_STATUS_KEY, queryFn: fetchQueueStatus, staleTime: fresh ? 0 : STATUS_STALE_MS });
}

/* Is the queue sending? The pure words and type live in src/lib/queueLine.ts. */
import type { QueueState } from './queueLine.ts';
export { QUEUE_PAUSED_LINE, queuedLeadLine, type QueueState } from './queueLine.ts';
export const QUEUE_STATE_KEY = ['whatsapp-queue-state'] as const;

export async function fetchQueueState(): Promise<QueueState> {
  const { data, error } = await supabase.functions.invoke('process-whatsapp-queue', { body: { mode: 'queue_state' } });
  if (error) throw error;
  const d = (data ?? {}) as Partial<QueueState> & { ok?: boolean };
  if (d.ok !== true || typeof d.paused !== 'boolean' || typeof d.windowOpen !== 'boolean') throw new Error('queue state unreadable');
  return {
    paused: d.paused, windowOpen: d.windowOpen, windowStartHour: typeof d.windowStartHour === 'number' ? d.windowStartHour : 7,
  };
}

/** After a write that returns the status payload (pause/resume), keep the shared copy current. */
export function rememberQueueStatus(qc: QueryClient, payload: QueueStatusPayload | null | undefined) {
  if (payload?.ok) qc.setQueryData(QUEUE_STATUS_KEY, payload);
  else void qc.invalidateQueries({ queryKey: QUEUE_STATUS_KEY });
}
