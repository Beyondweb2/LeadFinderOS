/* ════════════════════════════════════════════════════════════════════════════════════════════════
   "CHECK BEFORE CALLING" — the press (2026-10-04, fix/07): what will happen, in words, before anything
   starts. The results no longer have a panel of their own (2026-10-05, improve/outreach-compact-audit-
   rows): each lead's row says Waiting / Checking… / ChatGPT x · Gemini y, and the one-line check bar
   above the list carries the batch counts, the allowance, Stop and "Open next ready"
   (src/components/OutreachAiCheck.tsx).
   ⛔ NOTHING HERE CONTACTS ANYONE OR WRITES A LEAD. ⛔ NO COST IS SHOWN — the allowance is in checks.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { useEffect, useState } from 'react';
import { Loader2, SearchCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { SALES_CHECK_AUDIT_REUSE_DAYS, SALES_CHECK_BATCH_MAX, SALES_CHECK_REFRESH_MIN_DAYS } from '@/lib/salesCheck';
import type { useSalesChecks } from '@/hooks/useSalesChecks';

type Checks = ReturnType<typeof useSalesChecks>;

export function SalesCheckDialog({ open, onOpenChange, selected, checks, onConfirm }: {
  open: boolean; onOpenChange: (open: boolean) => void; selected: number; checks: Checks; onConfirm: (refresh: boolean) => void;
}) {
  const [refresh, setRefresh] = useState(false);
  useEffect(() => { if (open) setRefresh(false); }, [open]);
  const allowance = checks.view?.allowance ?? null;
  const max = checks.view?.max ?? SALES_CHECK_BATCH_MAX;
  const tooMany = selected > max;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><SearchCheck className="h-5 w-5" />Check {selected} lead{selected === 1 ? '' : 's'} before calling</DialogTitle>
          <DialogDescription>Research only. Nothing is sent to anyone — no WhatsApp, no email.</DialogDescription>
        </DialogHeader>
        <ul className="list-disc space-y-1.5 pl-5 text-sm text-muted-foreground">
          <li>Each lead gets the same AI check as the single “Run the AI check” button (ChatGPT and Google AI), plus a free check of their website.</li>
          <li>A lead checked in the last {SALES_CHECK_AUDIT_REUSE_DAYS} days reuses that result — free, and it doesn't use your allowance.</li>
          <li>New checks use your allowance{allowance ? <>: <b className="text-foreground">{allowance.remaining}</b> of {allowance.limit} left today</> : ''}.</li>
          <li>Leads that can't be checked (not yours, archived, a client, no trade or town) are skipped and say why.</li>
          <li>Each lead's row shows its progress, then its ChatGPT and Gemini result. Open the call screen from the row, or press “Open next ready”.</li>
        </ul>
        <label className="flex items-start gap-2 text-sm">
          <Checkbox checked={refresh} onCheckedChange={(v) => setRefresh(v === true)} className="mt-0.5" />
          <span>Check again even if checked recently <span className="text-muted-foreground">(only results at least {SALES_CHECK_REFRESH_MIN_DAYS} days old are re-checked)</span></span>
        </label>
        {tooMany && <p className="text-sm text-destructive">Select at most {max} leads per check — you selected {selected}.</p>}
        {checks.lastError && <p className="text-sm text-destructive">{checks.lastError}</p>}
        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button disabled={tooMany || checks.starting || selected === 0} onClick={() => onConfirm(refresh)} data-testid="sales-check-confirm">
            {checks.starting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <SearchCheck className="mr-1.5 h-4 w-4" />}
            Check {selected} lead{selected === 1 ? '' : 's'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
