import { useQuery } from '@tanstack/react-query';
import { fetchQueueState, QUEUE_STATE_KEY, type QueueState } from '@/lib/queueStatus';

/** Is the WhatsApp queue sending? (paused / window) — both roles. Returns undefined while reading and
 *  null when it could not be read, so a caller can never mistake "unknown" for "sending". */
export function useQueueState(enabled = true): QueueState | null | undefined {
  const q = useQuery({ queryKey: QUEUE_STATE_KEY, queryFn: fetchQueueState, staleTime: 60_000, retry: 1, enabled });
  if (q.isError) return null;
  return q.data;
}
