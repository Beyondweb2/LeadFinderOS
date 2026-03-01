import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import type { OutreachLead } from '@/types/outreach';

interface PipelineSnapshotCardProps {
  leads: OutreachLead[];
}

export function PipelineSnapshotCard({ leads }: PipelineSnapshotCardProps) {
  const contactedStatuses = [
    'contacted', 'sent_initial_text', 'sent_voice_note', 'no_whatsapp',
    'sms', 'whatsapp', 'facebook_msg', 'call_back', 'not_answered', 'on_hold',
  ];
  const repliedStatuses = ['replied', 'awaiting_decision'];
  const callBookedStatuses = ['interested', 'wants_draft', 'waiting', 'reviewing_draft'];
  const closedWonStatuses = ['paid_for_draft', 'completed'];

  const stages = [
    { label: 'Contacted', count: leads.filter(l => contactedStatuses.includes(l.status)).length },
    { label: 'Replied', count: leads.filter(l => repliedStatuses.includes(l.status)).length },
    { label: 'Call Booked', count: leads.filter(l => callBookedStatuses.includes(l.status)).length },
    { label: 'Closed Won', count: leads.filter(l => closedWonStatuses.includes(l.status)).length },
  ];

  const maxCount = Math.max(...stages.map(s => s.count), 1);

  return (
    <Card className="bg-gradient-to-br from-purple-500/8 via-purple-500/3 to-transparent border-purple-500/20">
      <CardHeader className="pb-1 sm:pb-2 p-3 sm:p-4 md:p-6">
        <CardTitle className="text-xs sm:text-sm font-medium text-muted-foreground">
          Pipeline
        </CardTitle>
      </CardHeader>
      <CardContent className="p-3 pt-0 sm:p-4 sm:pt-0 md:p-6 md:pt-0">
        <div className="space-y-3 sm:space-y-4">
          {stages.map((stage) => (
            <div key={stage.label}>
              <div className="flex items-baseline justify-between mb-1">
                <span className="text-xs sm:text-sm text-muted-foreground">{stage.label}</span>
                <span className="text-sm sm:text-base font-semibold text-foreground">{stage.count}</span>
              </div>
              <div className="h-1.5 rounded-full bg-muted/50 overflow-hidden">
                <div
                  className="h-full rounded-full bg-purple-500/60 transition-all duration-500"
                  style={{ width: `${Math.max((stage.count / maxCount) * 100, stage.count > 0 ? 4 : 0)}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
