import { useMemo } from 'react';
import { LeadEnrichButtons } from '@/components/LeadEnrichButtons';
import type { Lead } from '@/types/lead';
import type { OutreachLead } from '@/types/outreach';

interface SearchLeadContactProps {
  lead: Lead;
  /** Enrichment already found for this place_id (carried in local search state). */
  enrichment: Partial<OutreachLead> | undefined;
  /** Patch search-enrichment state, keyed by place_id. */
  onPatch: (placeId: string, patch: Partial<OutreachLead>) => Promise<any>;
}

/**
 * Per-type contact-enrich controls (Email / Facebook / Instagram) shown for each
 * search result. The Email/Facebook/Instagram buttons trigger paid enrichment
 * only on click. Reuses the shared LeadEnrichButtons (and thus the enrich-lead
 * engine) by wrapping the search Lead in a lightweight pseudo OutreachLead.
 * Whether the lead has a website is already shown in the Website Status column.
 */
export function SearchLeadContact({ lead, enrichment, onPatch }: SearchLeadContactProps) {
  // A throwaway, valid UUID as lead_id. enrich-lead requires a lead_id and updates
  // outreach_leads by it; this matches no row (clean no-op) while the cache + the
  // returned value key off place_id. Stable for this row's lifetime.
  const pseudoId = useMemo(() => crypto.randomUUID(), []);

  const pseudoLead = useMemo(() => ({
    ...(enrichment ?? {}),
    id: pseudoId,
    place_id: lead.id,
    business_name: lead.name,
    website: lead.websiteUrl ?? null,
  } as OutreachLead), [enrichment, pseudoId, lead.id, lead.name, lead.websiteUrl]);

  const handleUpdate = useMemo(
    () => (_leadId: string, patch: Partial<OutreachLead>) => onPatch(lead.id, patch),
    [onPatch, lead.id],
  );

  return <LeadEnrichButtons lead={pseudoLead} onUpdate={handleUpdate} />;
}
