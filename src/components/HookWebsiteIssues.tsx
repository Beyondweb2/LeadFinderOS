import { Loader2 } from 'lucide-react';
import { useLeadWebsiteIssues } from '@/hooks/useLeadWebsiteIssues';
import { HookWebsiteIssuesView } from '@/components/HookWebsiteIssuesView';

export { HookWebsiteIssuesView, HOOK_ISSUES_SHOWN, websiteIssuesEmptyText } from '@/components/HookWebsiteIssuesView';

/* The loader half of the Inbox's website / online-presence issues block. What it shows, and why, is in
   HookWebsiteIssuesView.tsx; the read is useLeadWebsiteIssues (read only, the Call Script's selector). */
/** The loader half, mounted only while the details are open. */
export function HookWebsiteIssues({ leadId }: { leadId: string }) {
  const q = useLeadWebsiteIssues(leadId);
  if (q.isLoading) return <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground"><Loader2 className="h-3 w-3 animate-spin" /> Checking stored website findings…</p>;
  if (q.isError) return <p className="text-[11px] text-muted-foreground">Website issues: could not load the stored findings.</p>;
  if (!q.data) return null;
  return <HookWebsiteIssuesView data={q.data} />;
}
