import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { 
  MessageSquare, 
  Clock, 
  AlertTriangle, 
  CheckCircle,
  TrendingUp,
  Users
} from 'lucide-react';
import type { OutreachLead } from '@/types/outreach';

interface DashboardStatsProps {
  leads: OutreachLead[];
}

export function DashboardStats({ leads }: DashboardStatsProps) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  
  const threeDaysAgo = new Date(today);
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);

  // Calculate stats
  const stats = {
    toContactToday: leads.filter(
      (l) => l.next_action_date && new Date(l.next_action_date) <= today && 
             l.status !== 'interested' && l.status !== 'not_interested'
    ).length,
    // Post-outreach leads awaiting a reply (was keyed on the removed legacy
    // sent_initial_text/sent_voice_note statuses; initial_contact is the live equivalent).
    awaitingReplies: leads.filter((l) => l.status === 'initial_contact').length,
    followUpsDue: leads.filter(
      (l) => l.next_action === 'send_follow_up' || l.next_action === 'follow_up'
    ).length,
    removalCandidates: leads.filter((l) => {
      if (!l.updated_at) return false;
      const lastUpdate = new Date(l.updated_at);
      // Was keyed on the removed legacy sent_* statuses; initial_contact is the live equivalent.
      return lastUpdate < threeDaysAgo && l.status === 'initial_contact';
    }).length,
    interested: leads.filter((l) => l.status === 'interested').length,
    totalActive: leads.filter(
      (l) => l.status !== 'not_interested' && l.status !== 'interested'
    ).length,
  };

  const statCards = [
    {
      title: 'To Contact Today',
      value: stats.toContactToday,
      icon: MessageSquare,
      color: 'text-primary',
      bgColor: 'bg-primary/10',
      description: 'Actions due today',
    },
    {
      title: 'Awaiting Replies',
      value: stats.awaitingReplies,
      icon: Clock,
      color: 'text-amber-500',
      bgColor: 'bg-amber-500/10',
      description: 'Waiting for response',
    },
    {
      title: 'Follow-ups Due',
      value: stats.followUpsDue,
      icon: TrendingUp,
      color: 'text-blue-500',
      bgColor: 'bg-blue-500/10',
      description: 'Need follow-up',
    },
    {
      title: '3-Day Removal',
      value: stats.removalCandidates,
      icon: AlertTriangle,
      color: 'text-red-500',
      bgColor: 'bg-red-500/10',
      description: 'No reply in 3+ days',
    },
    {
      title: 'Tracked',
      value: stats.interested,
      icon: CheckCircle,
      color: 'text-green-500',
      bgColor: 'bg-green-500/10',
      description: 'Potential clients',
    },
    {
      title: 'Active Leads',
      value: stats.totalActive,
      icon: Users,
      color: 'text-purple-500',
      bgColor: 'bg-purple-500/10',
      description: 'Total active leads',
    },
  ];

  return (
    <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
      {statCards.map((stat) => (
        <Card key={stat.title} className="border-border">
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {stat.title}
            </CardTitle>
            <div className={`p-2 rounded-lg ${stat.bgColor}`}>
              <stat.icon className={`h-4 w-4 ${stat.color}`} />
            </div>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stat.value}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {stat.description}
            </p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
