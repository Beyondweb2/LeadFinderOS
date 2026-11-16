import { useQuery } from '@tanstack/react-query';
import { AlertTriangle } from 'lucide-react';
import { invokeEdge, edgeErrorMessage } from '@/lib/edgeInvoke';
import { useAuth } from '@/hooks/useAuth';
import { cn } from '@/lib/utils';

/* ══ YOUR QUEUE, IN ONE LINE (Paul, 2026-11-16) ═════════════════════════════════════════════════════════════════════════════
   process-whatsapp-queue mode 'my_queue' (both roles, read-only): "Queued: 12, next send ~14:20", "Paused: daily limit reached",
   or "Not moving since 13:10: <reason>". The words are the server's (_shared/queue-fairness.ts senderQueueLine), from the same
   scan, holds and per-sender turn order the queue sends by. A salesperson sees their own line; the admin also sees every
   sender's. Reading it sends nothing. */
export interface SenderLine { sender: string; name: string; queued: number; state: 'empty' | 'paused' | 'stuck' | 'queued'; line: string }
interface MyQueue { ok: true; mine: SenderLine; senders?: SenderLine[] }

export const MY_QUEUE_KEY = ['whatsapp-my-queue'] as const;

const TONE: Record<SenderLine['state'], string> = {
  stuck: 'border-destructive/40 bg-destructive/10 text-destructive',
  paused: 'border-amber-500/40 bg-amber-50/60 text-amber-800 dark:bg-amber-950/20 dark:text-amber-300',
  queued: 'border-border/60 bg-muted/40 text-foreground',
  empty: 'border-border/60 bg-muted/20 text-muted-foreground',
};

/* SHOWN AT ONCE (Paul, 2026-11-16): the last line this person saw is kept in this browser and drawn immediately, marked
   "updating", while the fresh one loads (the server read is light too: process-whatsapp-queue my_queue). A per-viewer
   convenience only — storage can be empty or blocked, and then the line simply appears when it arrives. */
const cacheKey = (userId: string) => `fos.myQueueLine.v1:${userId}`;
function readCached(userId: string | null): MyQueue | undefined {
  if (!userId) return undefined;
  try { const v = localStorage.getItem(cacheKey(userId)); return v ? (JSON.parse(v) as MyQueue) : undefined; } catch { return undefined; }
}
function writeCached(userId: string | null, v: MyQueue) {
  if (!userId) return;
  try { localStorage.setItem(cacheKey(userId), JSON.stringify(v)); } catch { /* blocked or full: nothing kept */ }
}

export function SenderQueueLines({ showTeam }: { showTeam: boolean }) {
  const { user } = useAuth();
  const userId = user?.id ?? null;
  const q = useQuery({
    queryKey: [...MY_QUEUE_KEY, userId],
    queryFn: async () => {
      const v = await invokeEdge<MyQueue>('process-whatsapp-queue', { mode: 'my_queue' });
      if (v?.ok) writeCached(userId, v);
      return v;
    },
    placeholderData: () => readCached(userId),
    enabled: !!userId,
    staleTime: 30_000,
    refetchInterval: 120_000,
  });
  if (q.isLoading && !q.data) return null;
  if (q.isError || !q.data) {
    return <p className="mt-2 text-[11px] text-muted-foreground" data-testid="my-queue-error">Your queue line could not be read: {edgeErrorMessage(q.error, 'try Refresh')}</p>;
  }
  const others = (q.data.senders ?? []).filter((s) => s.sender !== q.data.mine.sender && s.queued > 0);
  return (
    <div className="mt-2 space-y-1.5" data-testid="my-queue">
      <Line label="Your queue" s={q.data.mine} testId="my-queue-line" />
      {q.isPlaceholderData && <p className="text-[10px] text-muted-foreground" data-testid="my-queue-updating">Last seen — updating…</p>}
      {showTeam && others.length > 0 && (
        <div className="space-y-1" data-testid="team-queue-lines">
          {others.map((s) => <Line key={s.sender} label={s.name} s={s} testId={`sender-queue-${s.sender}`} />)}
        </div>
      )}
    </div>
  );
}

function Line({ label, s, testId }: { label: string; s: SenderLine; testId: string }) {
  return (
    <div className={cn('flex items-start gap-2 rounded-lg border px-3 py-1.5 text-[12px]', TONE[s.state])} data-testid={testId} data-state={s.state}>
      {s.state === 'stuck' && <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
      <span><span className="font-semibold">{label}:</span> {s.line}</span>
    </div>
  );
}
