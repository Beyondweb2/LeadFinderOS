import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ArrowRight, MessageSquare, Pause } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useQueueState } from '@/hooks/useQueueState';
import { useWhatsAppQueue } from '@/hooks/useWhatsAppQueue';
import { deriveQueue, queueSummaryParts, QUEUE_BATCH_EVENT, readQueueBatch, type QueueBatch } from '@/lib/whatsappQueueView';
import { BatchNote } from '@/components/WhatsAppQueuePanel';
import { IconTile, SURFACE, ToneChip } from '@/components/operator/ui';
import { cn } from '@/lib/utils';

/** Where the one WhatsApp queue lives (both roles). */
export const WHATSAPP_QUEUE_PATH = '/whatsapp-queue';

/**
 * OUTREACH'S QUEUE SHORTCUT (2026-10-06) — a summary, not a queue. Both roles see the same card: how many of
 * the leads they may see are waiting, whether the queue is paused, the last batch they queued in this tab,
 * and "Open queue" to the ONE queue (WhatsAppQueuePanel on /whatsapp-queue). It renders no rows and offers
 * no actions, so there is no second queue to keep in step. The numbers come from the same server-scoped read
 * as the queue page (useWhatsAppQueue), so the card and the page can never disagree.
 */
export function WhatsAppQueueSummary() {
  const q = useWhatsAppQueue();
  const view = useMemo(() => deriveQueue(q.data ?? []), [q.data]);
  const state = useQueueState();
  const [batch, setBatch] = useState<QueueBatch | null>(() => readQueueBatch());
  useEffect(() => {
    const h = () => setBatch(readQueueBatch());
    window.addEventListener(QUEUE_BATCH_EVENT, h);
    return () => window.removeEventListener(QUEUE_BATCH_EVENT, h);
  }, []);
  const parts = queueSummaryParts(view);
  const text = q.isPending ? 'Checking the queue…' : q.isError ? 'Could not read the queue.' : parts.length ? parts.join(' · ') : 'No messages waiting';

  return (
    <div className={cn(SURFACE, 'px-4 py-3')} data-testid="whatsapp-queue-summary">
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
        <div className="flex min-w-0 items-center gap-2.5">
          <IconTile icon={MessageSquare} tone="blue" size="sm" />
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm font-bold tracking-tight">WhatsApp queue</span>
              {state?.paused && <ToneChip tone="amber" icon={Pause}>PAUSED — no sends</ToneChip>}
            </div>
            <p className="truncate text-xs text-muted-foreground" data-testid="queue-summary-line">{text}</p>
          </div>
        </div>
        <Button asChild size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
          <Link to={WHATSAPP_QUEUE_PATH} data-testid="open-queue">Open queue <ArrowRight className="h-3.5 w-3.5" /></Link>
        </Button>
      </div>
      {batch && <BatchNote batch={batch} className="mt-2" />}
    </div>
  );
}
