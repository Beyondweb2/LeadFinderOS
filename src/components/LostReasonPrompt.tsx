import { useEffect, useState } from 'react';
import { Loader2 } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { useToast } from '@/hooks/use-toast';
import { cn } from '@/lib/utils';
import { LOST_REASONS, LOST_REASON_NOTE_MAX, lostReasonLabel, lostReasonProblem, isLostReason } from '@/lib/lostReason';
import { LOST_REASON_ASK_EVENT, saveLostReason, type LostReasonAsk } from '@/lib/lostReasonAsk';

/* ══ "WHY DID THEY SAY NO?" — the one prompt (2026-10-01) ═════════════════════════════════════════
   Mounted once in AppLayout; opened by askLostReason (src/lib/lostReasonAsk.ts) from every place a person
   marks one lead Not interested, and from the lead's "Why they said no" line to add or correct one.
   Small on purpose: one tap on a reason, an optional note (needed only for Other), Save. Skip leaves the
   lead "Reason not recorded" — the status change has already happened and is never undone here. */
export function LostReasonPrompt() {
  const { toast } = useToast();
  const [ask, setAsk] = useState<LostReasonAsk | null>(null);
  const [reason, setReason] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const h = (e: Event) => {
      const d = (e as CustomEvent<LostReasonAsk>).detail;
      if (!d?.leadId) return;
      setAsk(d);
      setReason(isLostReason(d.reason) ? d.reason : null);
      setNote(d.note ?? '');
      setError(null);
    };
    window.addEventListener(LOST_REASON_ASK_EVENT, h);
    return () => window.removeEventListener(LOST_REASON_ASK_EVENT, h);
  }, []);

  const close = () => { if (!saving) setAsk(null); };
  const correcting = !!ask?.reason;
  const problem = lostReasonProblem(reason, note);

  const save = async () => {
    if (!ask || !reason || problem) { setError(problem); return; }
    setSaving(true);
    const r = await saveLostReason(ask.leadId, reason, note.trim() || null);
    setSaving(false);
    if (!r.ok) { setError(r.error ?? 'Not saved'); return; }
    toast({ title: r.unchanged ? 'No change' : `Reason saved: ${lostReasonLabel(reason)}` });
    setAsk(null);
  };

  return (
    <Dialog open={!!ask} onOpenChange={(v) => { if (!v) close(); }}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-md" data-testid="lost-reason-prompt">
        <DialogHeader>
          <DialogTitle className="text-base">Why did they say no?</DialogTitle>
          <DialogDescription className="text-xs">
            {ask?.businessName ? `${ask.businessName} · ` : ''}{correcting ? 'Change the recorded reason. History keeps the old one.' : 'Marked Not interested. One tap helps us learn what loses prospects.'}
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2" role="radiogroup" aria-label="Reason">
          {LOST_REASONS.map((r) => (
            <button key={r.value} type="button" role="radio" aria-checked={reason === r.value} data-reason={r.value}
              onClick={() => { setReason(r.value); setError(null); }}
              className={cn('min-h-9 rounded-md border px-2.5 py-1.5 text-left text-sm transition-colors',
                reason === r.value ? 'border-primary bg-primary/10 font-medium text-foreground' : 'border-border/70 text-muted-foreground hover:bg-muted hover:text-foreground')}>
              {r.label}
            </button>
          ))}
        </div>
        <label className="block text-xs font-medium text-muted-foreground">
          {reason === 'other' ? 'Why? (needed for Other)' : 'Note (optional)'}
          <Textarea value={note} onChange={(e) => { setNote(e.target.value); setError(null); }} maxLength={LOST_REASON_NOTE_MAX} rows={2}
            className="mt-1 text-sm" placeholder={reason === 'other' ? 'In a few words, why they said no' : 'Anything useful, e.g. what they said about the price'} data-testid="lost-reason-note" />
        </label>
        {error && <p className="text-xs text-destructive" role="alert">{error}</p>}
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={close} disabled={saving} data-testid="lost-reason-skip">{correcting ? 'Cancel' : 'Skip'}</Button>
          <Button size="sm" onClick={() => void save()} disabled={saving || !!problem} data-testid="lost-reason-save">
            {saving && <Loader2 className="mr-1.5 h-4 w-4 animate-spin" />}Save reason
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
