import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { DashboardStats } from '@/components/DashboardStats';
import { useOutreach } from '@/hooks/useOutreach';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { 
  Loader2, 
  Phone, 
  ExternalLink, 
  ArrowRight,
  Calendar,
  MessageSquare
} from 'lucide-react';
import type { OutreachLead } from '@/types/outreach';

const Dashboard = () => {
  const { leads, isLoading } = useOutreach();

  const todaysTasks = useMemo(() => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    return leads
      .filter((lead) => {
        if (lead.status === 'interested' || lead.status === 'not_interested') return false;
        if (!lead.next_action_date) return false;
        const actionDate = new Date(lead.next_action_date);
        actionDate.setHours(0, 0, 0, 0);
        return actionDate <= today;
      })
      .sort((a, b) => {
        const dateA = a.next_action_date ? new Date(a.next_action_date).getTime() : Infinity;
        const dateB = b.next_action_date ? new Date(b.next_action_date).getTime() : Infinity;
        return dateA - dateB;
      })
      .slice(0, 10);
  }, [leads]);

  const getActionLabel = (lead: OutreachLead) => {
    switch (lead.next_action) {
      case 'send_initial_text':
        return 'Send initial text';
      case 'send_voice_note':
        return 'Send voice note';
      case 'send_follow_up':
        return 'Send follow-up';
      case 'check_3_day_removal':
        return 'Check for removal';
      case 'call':
        return 'Call';
      case 'follow_up':
        return 'Follow up';
      case 'send_draft':
        return 'Send draft';
      default:
        return 'Action needed';
    }
  };

  const isOverdue = (date: string | null) => {
    if (!date) return false;
    const actionDate = new Date(date);
    actionDate.setHours(0, 0, 0, 0);
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return actionDate < today;
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-full py-16">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-8">
      {/* Stats Overview */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Pipeline Overview</h2>
        <DashboardStats leads={leads} />
      </section>

      {/* Today's Tasks */}
      <section>
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-semibold">Today's Actions</h2>
          <Button variant="outline" size="sm" asChild>
            <Link to="/outreach">
              View All
              <ArrowRight className="h-4 w-4 ml-2" />
            </Link>
          </Button>
        </div>

        {todaysTasks.length === 0 ? (
          <Card className="bg-card/50 border-border/50">
            <CardContent className="py-8 text-center">
              <Calendar className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
              <h3 className="font-medium mb-2">All caught up!</h3>
              <p className="text-sm text-muted-foreground mb-4">
                No actions due today. Search for new leads or check your pipeline.
              </p>
              <div className="flex gap-2 justify-center">
                <Button asChild>
                  <Link to="/">Find New Leads</Link>
                </Button>
                <Button variant="outline" asChild>
                  <Link to="/outreach">View Pipeline</Link>
                </Button>
              </div>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-3">
            {todaysTasks.map((lead) => (
              <Card 
                key={lead.id} 
                className="bg-card/50 border-border/50 hover:bg-card/70 transition-colors"
              >
                <CardContent className="py-4">
                  <div className="flex items-center justify-between gap-4">
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="p-2 rounded-lg bg-primary/10 shrink-0">
                        <MessageSquare className="h-4 w-4 text-primary" />
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          {lead.country === 'AUS' && (
                            <span className="text-xs">🇦🇺</span>
                          )}
                          <h3 className="font-medium truncate">{lead.business_name}</h3>
                          {isOverdue(lead.next_action_date) && (
                            <Badge variant="destructive" className="text-xs">
                              Overdue
                            </Badge>
                          )}
                        </div>
                        <p className="text-sm text-muted-foreground">
                          {getActionLabel(lead)}
                          {lead.next_action_date && (
                            <span className="ml-2 text-xs">
                              • {new Date(lead.next_action_date).toLocaleDateString()}
                            </span>
                          )}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      {lead.phone && (
                        <Button variant="ghost" size="icon" asChild>
                          <a href={`tel:${lead.phone}`}>
                            <Phone className="h-4 w-4" />
                          </a>
                        </Button>
                      )}
                      {lead.google_maps_url && (
                        <Button variant="ghost" size="icon" asChild>
                          <a 
                            href={lead.google_maps_url} 
                            target="_blank" 
                            rel="noopener noreferrer"
                          >
                            <ExternalLink className="h-4 w-4" />
                          </a>
                        </Button>
                      )}
                      <Button variant="outline" size="sm" asChild>
                        <Link to="/outreach">
                          Open
                        </Link>
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </section>

      {/* Quick Links */}
      <section>
        <h2 className="text-lg font-semibold mb-4">Quick Actions</h2>
        <div className="grid gap-4 md:grid-cols-3">
          <Card className="bg-card/50 border-border/50 hover:bg-card/70 transition-colors cursor-pointer">
            <Link to="/">
              <CardHeader>
                <CardTitle className="text-base">Search for Leads</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Find businesses without websites in your target area.
                </p>
              </CardContent>
            </Link>
          </Card>
          <Card className="bg-card/50 border-border/50 hover:bg-card/70 transition-colors cursor-pointer">
            <Link to="/templates">
              <CardHeader>
                <CardTitle className="text-base">Edit Templates</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Customize your text messages and voice note scripts.
                </p>
              </CardContent>
            </Link>
          </Card>
          <Card className="bg-card/50 border-border/50 hover:bg-card/70 transition-colors cursor-pointer">
            <Link to="/outreach">
              <CardHeader>
                <CardTitle className="text-base">View Pipeline</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-muted-foreground">
                  Manage all your leads and track outreach progress.
                </p>
              </CardContent>
            </Link>
          </Card>
        </div>
      </section>
    </div>
  );
};

export default Dashboard;
