import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { DemoUpgradeDialog } from '@/components/DemoUpgradeDialog';
import { 
  ClipboardList, 
  Phone, 
  MapPin, 
  MessageSquare, 
  MoreHorizontal,
  Trash2,
  Search
} from 'lucide-react';
import type { Lead } from '@/types/lead';

interface DemoCRMProps {
  demoLeads: Lead[];
  onRemoveLead?: (leadId: string) => void;
}

export default function DemoCRM({ demoLeads, onRemoveLead }: DemoCRMProps) {
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [lockedFeature, setLockedFeature] = useState('');
  const navigate = useNavigate();

  const handleLockedAction = (feature: string) => {
    setLockedFeature(feature);
    setUpgradeOpen(true);
  };

  if (demoLeads.length === 0) {
    return (
      <div className="space-y-4">
        <div className="text-center sm:text-left">
          <h1 className="text-lg sm:text-2xl font-bold tracking-tight">Outreach CRM</h1>
          <p className="text-xs sm:text-base text-muted-foreground max-w-lg">
            Your leads will appear here after you add them from search results.
          </p>
        </div>
        <div className="text-center py-16">
          <div className="inline-flex p-3 rounded-full bg-muted/50 mb-4">
            <ClipboardList className="h-8 w-8 text-muted-foreground" />
          </div>
          <p className="text-muted-foreground text-sm max-w-sm mx-auto mb-4">
            No leads added yet. Run a demo search and add businesses to your CRM.
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => navigate('/demo')}
          >
            <Search className="mr-2 h-4 w-4" />
            Go to Search
          </Button>
        </div>

        <DemoUpgradeDialog
          open={upgradeOpen}
          onOpenChange={setUpgradeOpen}
          featureName={lockedFeature}
        />
      </div>
    );
  }

  return (
    <div className="space-y-3 sm:space-y-6">
      <div className="text-center sm:text-left">
        <h1 className="text-lg sm:text-2xl font-bold tracking-tight">Outreach CRM</h1>
        <p className="text-xs sm:text-base text-muted-foreground max-w-lg">
          Manage your leads, track outreach, and close deals. 
          <span className="text-primary font-medium"> Start a free trial for full access.</span>
        </p>
      </div>

      {/* Demo leads list */}
      <Card className="border-border/50 bg-card shadow-sm">
        <CardContent className="p-3 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="text-sm font-medium text-muted-foreground">
              {demoLeads.length} lead{demoLeads.length !== 1 ? 's' : ''} added
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => handleLockedAction('Bulk Actions')}
              >
                <MoreHorizontal className="h-3.5 w-3.5 mr-1" />
                Actions
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            {demoLeads.map((lead) => (
              <div
                key={lead.id}
                className="flex items-center justify-between py-2.5 px-3 rounded-md border border-border bg-background/80"
              >
                <div className="flex-1 min-w-0 mr-2">
                  <p className="font-medium text-sm truncate leading-tight">{lead.name}</p>
                  {lead.category && (
                    <p className="text-xs text-muted-foreground truncate leading-tight capitalize">
                      {lead.category}
                    </p>
                  )}
                  {lead.phone && (
                    <p className="text-xs text-muted-foreground font-mono mt-0.5">{lead.phone}</p>
                  )}
                </div>
                <div className="flex items-center gap-1 flex-shrink-0">
                  <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-border">
                    Not Contacted
                  </Badge>
                  {lead.phone && (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleLockedAction('WhatsApp')}
                      >
                        <MessageSquare className="h-3.5 w-3.5 text-green-500" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-8 w-8"
                        onClick={() => handleLockedAction('Call')}
                      >
                        <Phone className="h-3.5 w-3.5 text-primary" />
                      </Button>
                    </>
                  )}
                  {lead.googleMapsUrl && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      asChild
                    >
                      <a href={lead.googleMapsUrl} target="_blank" rel="noopener noreferrer">
                        <MapPin className="h-3.5 w-3.5 text-primary" />
                      </a>
                    </Button>
                  )}
                  {onRemoveLead && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-muted-foreground hover:text-destructive"
                      onClick={() => onRemoveLead(lead.id)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <DemoUpgradeDialog
        open={upgradeOpen}
        onOpenChange={setUpgradeOpen}
        featureName={lockedFeature}
      />
    </div>
  );
}
