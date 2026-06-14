import { useMemo } from 'react';
import { Globe, Phone } from 'lucide-react';
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
 * The free-info-at-a-glance + per-type enrich controls shown under each search
 * result. Free info (website / phone) is whatever Google already returned at no
 * cost; the Email/Facebook/Instagram buttons trigger paid enrichment only on
 * click. Reuses the shared LeadEnrichButtons (and thus the enrich-lead engine)
 * by wrapping the search Lead in a lightweight pseudo OutreachLead.
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

  const hasWebsite = !!lead.websiteUrl;

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Free info (no paid call) */}
      <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
        {hasWebsite ? (
          <a
            href={lead.websiteUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-blue-500 hover:text-blue-400"
            title={lead.websiteUrl}
            onClick={(e) => e.stopPropagation()}
          >
            <Globe className="h-3 w-3" /> Website
          </a>
        ) : (
          <span className="inline-flex items-center gap-1">
            <Globe className="h-3 w-3 opacity-50" /> No website
          </span>
        )}
        {lead.phone && (
          <a
            href={`tel:${lead.phone}`}
            className="inline-flex items-center gap-1 text-foreground/70 hover:text-foreground"
            onClick={(e) => e.stopPropagation()}
          >
            <Phone className="h-3 w-3" /> {lead.phone}
          </a>
        )}
      </div>

      {/* Paid, click-only enrichment */}
      <LeadEnrichButtons lead={pseudoLead} onUpdate={handleUpdate} />
    </div>
  );
}
