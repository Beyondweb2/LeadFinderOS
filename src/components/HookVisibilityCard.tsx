import { useState } from 'react';
import { useHookVisibility } from '@/hooks/useHookVisibility';
import { HookVisibilityView, type HookRunNewProps } from '@/components/HookVisibilityView';
import { HookWebsiteIssues } from '@/components/HookWebsiteIssues';
import { ProspectAuditDialog } from '@/components/ProspectAuditDialog';

export { HookVisibilityView } from '@/components/HookVisibilityView';

/* The loader half of the Inbox AI visibility card: one lead's audits, polled while the answer can still
   change (useHookVisibility). Everything it shows, and why, is in HookVisibilityView.tsx.
   "View full audit" opens the large detailed window (ProspectAuditDialog, 2026-10-05) instead of the old
   40vh overlay, wherever this card is mounted (Inbox, the lead popup's AI check, the Outreach audit popup). */
export function HookVisibilityCard({ leadId, onRunNew, runNewBusy, onReportCopied }: { leadId: string | null | undefined } & HookRunNewProps) {
  const q = useHookVisibility(leadId);
  const [fullOpen, setFullOpen] = useState(false);
  if (!leadId || q.isLoading || !q.data) {
    if (q.isError) return <div className="border-b border-border px-3 py-1.5 text-[11px] text-muted-foreground">AI visibility: could not load the audit results.</div>;
    return null;
  }
  return (
    <>
      <HookVisibilityView
        card={q.data.card}
        inFlight={q.data.inFlight}
        state={q.data.state}
        report={q.data.report}
        onRunNew={onRunNew}
        runNewBusy={runNewBusy}
        onReportCopied={onReportCopied}
        onRefresh={() => { void q.refetch(); }}
        refreshing={q.isFetching}
        issues={<HookWebsiteIssues leadId={leadId} />}
        onOpenFull={() => setFullOpen(true)}
      />
      <ProspectAuditDialog leadId={leadId} open={fullOpen} onOpenChange={setFullOpen} />
    </>
  );
}
