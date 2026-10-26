import { FileText } from 'lucide-react';
import type { DashboardTranscriptView } from '@/lib/dashboardTemplates';

/* A dashboard template in the Inbox thread (Paul, 2026-10-26): Meta's approved words when we have them
   (DASHBOARD_TEMPLATE_WORDING), else a clear "template sent" card — never a made-up sentence that reads as if we wrote it. */
export function DashboardTemplateBubble({ view }: { view: DashboardTranscriptView }) {
  if (view.words) return <p className="whitespace-pre-wrap break-words" data-testid="dashboard-template-words">{view.words}</p>;
  return (
    <div className="min-w-0 space-y-0.5" data-testid="dashboard-template-card">
      <p className="flex items-center gap-1.5 font-semibold"><FileText className="h-3.5 w-3.5 shrink-0 opacity-80" />{view.label}</p>
      {view.who && <p className="text-xs opacity-85">To {view.who}</p>}
      {view.neededItem && <p className="text-xs opacity-85">Needed: {view.neededItem}</p>}
      <p className="text-[11px] opacity-65">Meta's approved template wording</p>
    </div>
  );
}
