import { Link } from 'react-router-dom';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { LeadHookPanel } from '@/components/LeadCrmPanel';
import { useLeadPermissions } from '@/hooks/useLeadPermissions';

/* ══ THE OUTREACH ROW'S AUDIT POPUP (2026-09-28, both roles) ═══════════════════════════════════════
   Not a second audit: it is the prospect workspace's own Hook Audit panel (LeadHookPanel) in a small
   dialog. Three questions proposed by create-ai-audit's preview, editable, then the one hook path —
   3 questions × ChatGPT + Google AI × 1 run, stored, scored and reported exactly as everywhere else.
   ⛔ THE AUDIT BELONGS TO THE SERVER, NOT THIS DIALOG. Closing it, leaving the page or starting another
   business's audit changes nothing: the rows are queued and process-ai-audit-queue drains them. Opening
   it again reads the lead's audit (useHookVisibility) — running shows progress, finished shows the
   result — and the server refuses to start a second hook on a lead whose hook is still in flight.
   The AI Audit page stays the admin's advanced/manual route. */
export function HookAuditDialog({ lead, onOpenChange }: {
  lead: { id: string; business_name: string } | null;
  onOpenChange: (open: boolean) => void;
}) {
  const perms = useLeadPermissions();
  return (
    <Dialog open={!!lead} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] w-[calc(100vw-2rem)] max-w-xl overflow-y-auto" data-testid="hook-audit-dialog">
        <DialogHeader>
          <DialogTitle className="pr-6 text-base">{lead?.business_name ?? 'AI visibility check'}</DialogTitle>
          <DialogDescription className="text-xs">
            AI visibility check — 3 customer questions, each asked once on ChatGPT and Google AI. It runs on the server: close this any time.
          </DialogDescription>
        </DialogHeader>
        {lead && <LeadHookPanel key={lead.id} leadId={lead.id} autoPropose />}
        {lead && perms.auditAdmin && (
          <p className="pt-1 text-right text-[11px] text-muted-foreground">
            <Link className="underline underline-offset-2 hover:text-foreground" to={`/ai-audit?leadId=${lead.id}`}>Advanced audit options (AI Audit page)</Link>
          </p>
        )}
      </DialogContent>
    </Dialog>
  );
}
