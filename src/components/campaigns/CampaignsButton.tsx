import { Link } from 'react-router-dom';
import { Megaphone } from 'lucide-react';
import { Button } from '@/components/ui/button';

/* Where campaigns live (Paul, 2026-10-03): the top right of Find Leads and Outreach, for both roles — never a
   menu item. Opens the Campaigns page (a salesperson's own; the admin's, everyone's — decided by the server). */
export function CampaignsButton() {
  return <Button asChild size="sm" variant="outline" className="h-8 gap-1.5 text-xs" data-testid="campaigns-button">
    <Link to="/campaigns"><Megaphone className="h-3.5 w-3.5" />Campaigns</Link>
  </Button>;
}
