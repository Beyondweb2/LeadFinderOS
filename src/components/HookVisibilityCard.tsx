import { useHookVisibility } from '@/hooks/useHookVisibility';
import { HookVisibilityView, type HookRunNewProps } from '@/components/HookVisibilityView';

export { HookVisibilityView } from '@/components/HookVisibilityView';

/* The loader half of the Inbox AI visibility card: one lead's audits, polled while the answer can still
   change (useHookVisibility). Everything it shows, and why, is in HookVisibilityView.tsx. */
export function HookVisibilityCard({ leadId, onRunNew, runNewBusy }: { leadId: string | null | undefined } & HookRunNewProps) {
  const q = useHookVisibility(leadId);
  if (!leadId || q.isLoading || !q.data) {
    if (q.isError) return <div className="border-b border-border px-3 py-1.5 text-[11px] text-muted-foreground">AI visibility: could not load the audit results.</div>;
    return null;
  }
  return (
    <HookVisibilityView
      card={q.data.card}
      inFlight={q.data.inFlight}
      state={q.data.state}
      report={q.data.report}
      onRunNew={onRunNew}
      runNewBusy={runNewBusy}
      onRefresh={() => { void q.refetch(); }}
      refreshing={q.isFetching}
    />
  );
}
