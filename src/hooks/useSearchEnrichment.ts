import { useState, useCallback } from 'react';
import type { OutreachLead } from '@/types/outreach';

/**
 * Holds contact-enrichment results for search results *before* they're saved to
 * outreach. Keyed by place_id (the search Lead's `id`). The enrich-lead function
 * caches everything by place_id server-side, so these values carry over for free
 * when the lead is later added — see Index `onAddToOutreach`.
 *
 * Each stored entry is a `Partial<OutreachLead>` (the same patch the enrichment
 * engine produces), so it drops straight into the outreach insert.
 */
export function useSearchEnrichment() {
  const [searchEnrichment, setSearchEnrichment] = useState<Record<string, Partial<OutreachLead>>>({});

  // Patch shape matches useEnrichLead's onUpdate callback (leadId is ignored here;
  // we key by the search lead's place_id instead).
  const patchEnrichment = useCallback((placeId: string, patch: Partial<OutreachLead>) => {
    if (!placeId) return Promise.resolve(null);
    setSearchEnrichment((prev) => ({ ...prev, [placeId]: { ...prev[placeId], ...patch } }));
    return Promise.resolve(null);
  }, []);

  const getEnrichment = useCallback(
    (placeId: string | undefined): Partial<OutreachLead> | undefined =>
      placeId ? searchEnrichment[placeId] : undefined,
    [searchEnrichment],
  );

  return { searchEnrichment, patchEnrichment, getEnrichment };
}
