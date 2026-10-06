import { Link } from 'react-router-dom';
import { ArrowLeft, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { PageHeader } from '@/components/salesDash/primitives';
import { WhatsAppQueuePanel } from '@/components/WhatsAppQueuePanel';
import { useLeadPermissions } from '@/hooks/useLeadPermissions';

/** THE WHATSAPP QUEUE PAGE (2026-10-06) — the one queue, both roles. The admin sees the whole team's queue
 *  and its controls; a salesperson sees the same queue holding only their own leads (the server decides). */
const WhatsAppQueue = () => {
  const perms = useLeadPermissions();
  return (
    <div className="space-y-3 sm:space-y-6">
      <PageHeader
        icon={MessageSquare}
        tone="blue"
        title="WhatsApp queue"
        subtitle={perms.queueControls
          ? 'Every lead waiting to be messaged, across the team, in the order the queue sends them.'
          : 'Your leads waiting to be messaged, in the order the queue sends them.'}
        actions={
          <Button asChild size="sm" variant="outline" className="h-8 gap-1.5 text-xs">
            <Link to="/outreach" data-testid="back-to-outreach"><ArrowLeft className="h-3.5 w-3.5" />Outreach</Link>
          </Button>
        }
      />
      <WhatsAppQueuePanel />
    </div>
  );
};

export default WhatsAppQueue;
