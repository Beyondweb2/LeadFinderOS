import { Building2, Globe, Mail, MapPin, Phone, User, Megaphone, Compass } from 'lucide-react';
import { useCampaigns } from '@/hooks/useCampaigns';
import { useTeamDirectory } from '@/hooks/useSalesCrm';
import { leadSourceLabel } from '@/lib/salesPerformance';
import type { OutreachLead } from '@/types/outreach';
import { FindEmailButton } from '@/components/FindEmailButton';
import { isDemoLead } from '@/lib/demoLeads';

/* WHO IS THIS? — the prospect in one card, for the workspace's Prospect tab (2026-09-28). Only what we
   genuinely hold: a contact name shows only when one was recorded, never a guess from the business
   name. Reads the dialog's complete row (the caller's own source), so a salesperson sees exactly the
   safe view's fields and nothing more. */
export function ProspectFacts({ lead }: { lead: OutreachLead }) {
  const { campaigns } = useCampaigns();
  const team = useTeamDirectory();
  const campaign = lead.campaign_id ? campaigns.find((c) => c.id === lead.campaign_id)?.name ?? 'A campaign' : 'No campaign';
  const town = lead.derived_town || lead.search_location || null;
  const owner = lead.assigned_to_user_id ? team.byId.get(lead.assigned_to_user_id)?.display_name ?? 'A teammate' : 'Unassigned';
  const site = lead.website ? (/^https?:\/\//i.test(lead.website) ? lead.website : 'https://' + lead.website) : null;
  const rows: { icon: typeof Phone; label: string; value: React.ReactNode }[] = [
    { icon: Building2, label: 'Business', value: [lead.business_name, lead.search_keyword || lead.category].filter(Boolean).join(' · ') },
    { icon: User, label: 'Contact', value: lead.contact_name || <span className="italic text-muted-foreground/60">Not known</span> },
    { icon: Phone, label: 'Phone', value: lead.phone ? <a href={`tel:${lead.phone}`} className="font-semibold hover:underline">{lead.phone}</a> : <span className="italic text-muted-foreground/60">None</span> },
    { icon: Globe, label: 'Website', value: site ? <a href={site} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline">{lead.website!.replace(/^https?:\/\/(www\.)?/i, '').replace(/\/$/, '')}</a> : <span className="italic text-muted-foreground/60">None on file</span> },
    { icon: Mail, label: 'Email', value: lead.email ? <a href={`mailto:${lead.email}`} className="hover:underline">{lead.email}</a> : <span className="inline-flex flex-wrap items-center gap-x-2"><span className="italic text-muted-foreground/60">None on file</span>{!isDemoLead(lead.id) && <FindEmailButton leadId={lead.id} website={lead.website} />}</span> },
    { icon: MapPin, label: 'Location', value: [town, lead.address && lead.address !== town ? lead.address : null].filter(Boolean).join(' · ') || <span className="italic text-muted-foreground/60">Unknown</span> },
    { icon: Compass, label: 'Source', value: leadSourceLabel(lead.lead_source) },
    { icon: Megaphone, label: 'Campaign', value: campaign },
    { icon: User, label: 'Owner', value: owner },
  ];
  return (
    <section className="rounded-xl border border-border/60 bg-card/60 p-3.5 shadow-sm" data-testid="prospect-facts">
      <ul className="grid gap-x-4 gap-y-1.5 text-xs sm:grid-cols-2">
        {rows.map((r) => (
          <li key={r.label} className="flex min-w-0 items-start gap-2">
            <r.icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="w-16 shrink-0 text-muted-foreground/80">{r.label}</span>
            <span className="min-w-0 flex-1 break-words">{r.value}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
