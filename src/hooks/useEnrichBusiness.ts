import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { OutreachLead } from '@/types/outreach';

/**
 * Per-lead COMBINED enrichment (sub-phase 2A): one click gathers contacts
 * (email/FB/IG), the WhatsApp-capability signal (HLR line-type), and an image
 * pool — via the enrich-business edge function. Surfaces what it found; contacts
 * are only auto-applied when the match is high-confidence (the function decides),
 * and a low-confidence match is flagged for the operator to verify (never silently
 * attaches wrong-company data).
 */
export function useEnrichBusiness(
  lead: OutreachLead,
  onUpdate: (leadId: string, data: Partial<OutreachLead>) => Promise<unknown>,
) {
  const [enriching, setEnriching] = useState(false);
  const [limitReached, setLimitReached] = useState(false);
  const { toast } = useToast();

  const enrich = async () => {
    setEnriching(true);
    try {
      const { data, error } = await supabase.functions.invoke('enrich-business', {
        body: {
          lead_id: lead.id,
          place_id: lead.place_id ?? null,
          google_maps_url: lead.google_maps_url ?? null,
          phone: lead.phone ?? null,
          country: lead.country ?? null,
          business_name: lead.business_name ?? null,
          facebook_url: lead.facebook_url ?? null,
          instagram_url: lead.instagram_url ?? null,
          website: lead.website ?? null,
        },
      });
      if (error) throw error;
      if (data?.limit_reached) {
        setLimitReached(true);
        toast({ title: 'Daily enrichment limit reached', description: 'Try again tomorrow.', variant: 'destructive' });
        return data;
      }
      if (!data?.success) {
        toast({ title: 'Enrich failed', description: data?.error ?? 'Please try again.', variant: 'destructive' });
        return data;
      }

      const now = new Date().toISOString();
      const patch: Partial<OutreachLead> = {};
      if (data.lineType) { patch.line_type = data.lineType; patch.line_type_checked_at = now; }
      if (data.applied) {
        if (data.email) Object.assign(patch, { email: data.email, email_status: 'found', email_method: 'apify', enrichment_source: 'apify' });
        if (data.facebook) Object.assign(patch, { facebook_url: data.facebook, facebook_status: 'found', facebook_method: 'apify' });
        if (data.instagram) Object.assign(patch, { instagram_url: data.instagram, instagram_status: 'found', instagram_method: 'apify' });
      }
      if (Object.keys(patch).length) await onUpdate(lead.id, patch);

      const poolN = Array.isArray(data.imagePool) ? data.imagePool.length : 0;
      const b = data.poolBreakdown ?? { maps: 0, facebook: 0, instagram: 0 };
      const photos = `${poolN} photos (Maps ${b.maps} / FB ${b.facebook} / IG ${b.instagram})`;
      const found = [data.email && 'email', data.facebook && 'FB', data.instagram && 'IG'].filter(Boolean).join(', ');
      const lt = data.lineType && data.lineType !== 'unknown' ? ` · ${data.lineType}` : '';
      if (data.match?.lowConfidence) {
        toast({
          title: '⚠ Verify this is the right business',
          description: `Matched "${data.match.title ?? '—'}"${data.match.address ? ` · ${data.match.address}` : ''}. Contacts NOT auto-applied${lt}. ${photos}.`,
        });
      } else {
        toast({ title: 'Business enriched', description: `${found || 'no contacts found'}${lt} · ${photos}.` });
      }
      return data;
    } catch (e) {
      toast({ title: 'Enrich failed', description: (e as Error).message, variant: 'destructive' });
    } finally {
      setEnriching(false);
    }
  };

  return { enrich, enriching, limitReached };
}
