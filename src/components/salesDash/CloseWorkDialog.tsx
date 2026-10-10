import { useState } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { useSubscription } from '@/hooks/useSubscription';
import { cn } from '@/lib/utils';
import { refusalText } from '@/lib/salesCrm';
import { CLOSE_CHOICES, closeWork, type CloseChoice } from '@/lib/closeWork';

/* ══ CLOSE ITEMS (2026-10-10) ═════════════════════════════════════════════════════════════════════════════════
   The ONE confirmation for closing Sales dashboard items — one row's Close and the bulk "Close selected" both open
   it. It names the count, offers the two choices (src/lib/closeWork.ts CLOSE_CHOICES) and does nothing until the
   person presses the button. Never sends a message. */

export interface CloseTarget { ids: string[]; names: string[]; done?: () => void }

export function CloseWorkDialog({ target, onOpenChange }: { target: CloseTarget | null; onOpenChange: (open: boolean) => void }) {
  const { role } = useSubscription();
  const qc = useQueryClient();
  const { toast } = useToast();
  const [choice, setChoice] = useState<CloseChoice>('done');
  const [busy, setBusy] = useState(false);
  const n = target?.ids.length ?? 0;
  const items = `${n} ${n === 1 ? 'item' : 'items'}`;

  const run = async () => {
    if (!target || busy) return;
    setBusy(true);
    try {
      const r = await closeWork(target.ids, choice, role);
      void qc.invalidateQueries({ queryKey: ['sales-performance'] });
      const refused = r.refused.length ? ` ${r.refused.length} not closed: ${refusalText(r.refused[0].error)}.` : '';
      toast({
        title: r.closed ? `Closed ${r.closed} ${r.closed === 1 ? 'item' : 'items'}` : 'Nothing closed',
        description: `${refused}${r.failed.length ? ` ${r.failed.slice(0, 2).join(' ')}` : ''}`.trim() || (choice === 'done' ? 'Status, star and campaign unchanged. A new reply brings it back.' : 'Recorded as on the Call tab. A new reply brings it back.'),
        variant: r.closed ? undefined : 'destructive',
      });
      if (r.closed) target.done?.();
      onOpenChange(false);
      setChoice('done');
    } finally { setBusy(false); }
  };

  return (
    <Dialog open={!!target} onOpenChange={(o) => { if (!busy) onOpenChange(o); }}>
      <DialogContent className="max-w-md" data-testid="close-work-dialog">
        <DialogHeader>
          <DialogTitle>Close {items}?</DialogTitle>
          <DialogDescription>
            {n === 1 ? target?.names[0] : `${target?.names.slice(0, 3).join(', ')}${n > 3 ? ` and ${n - 3} more` : ''}`}. Nothing is sent. If they reply again it comes back.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-2" role="radiogroup" aria-label="How to close">
          {CLOSE_CHOICES.map((c) => (
            <button key={c.key} type="button" role="radio" aria-checked={choice === c.key} onClick={() => setChoice(c.key)}
              className={cn('flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left ring-1 ring-inset transition',
                choice === c.key ? 'bg-primary/10 ring-primary' : 'bg-muted/30 ring-border/60 hover:bg-muted/60')}>
              {c.dead ? <XCircle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" /> : <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />}
              <span className="min-w-0"><span className="block text-sm font-semibold">{c.label}</span><span className="block text-xs text-muted-foreground">{c.does}</span></span>
            </button>
          ))}
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={run} disabled={busy || n === 0} variant={choice === 'done' ? 'default' : 'destructive'}>
            {busy && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Close {items}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
