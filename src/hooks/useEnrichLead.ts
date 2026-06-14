import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import type { OutreachLead } from '@/types/outreach';

export type EnrichType = 'email' | 'facebook' | 'instagram';

const LABEL: Record<EnrichType, string> = {
  email: 'Email',
  facebook: 'Facebook',
  instagram: 'Instagram',
};

/**
 * Phase 2 enrichment trigger. Calls the single `enrich-lead` edge function for a
 * given type (email | facebook | instagram), then syncs the resolved fields into
 * local lead state via `onUpdate`. The edge function is authoritative (it writes
 * the lead, cache, usage + cost rows server-side); this re-applies the same
 * values so the UI updates immediately. Surfaces the durable daily-cap refusal.
 */
export function useEnrichLead(
  lead: OutreachLead,
  onUpdate: (leadId: string, data: Partial<OutreachLead>) => Promise<any>,
) {
  const [enriching, setEnriching] = useState<EnrichType | null>(null);
  const [limitReached, setLimitReached] = useState(false);
  const { toast } = useToast();

  const enrich = useCallback(async (type: EnrichType) => {
    setEnriching(type);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const { data, error } = await supabase.functions.invoke('enrich-lead', {
        body: {
          lead_id: lead.id,
          enrichment_type: type,
          place_id: lead.place_id ?? '',
          business_name: lead.business_name ?? '',
          website: lead.website ?? null,
        },
        headers: session ? { Authorization: `Bearer ${session.access_token}` } : undefined,
      });

      if (error) throw error;

      if (data?.limit_reached) {
        setLimitReached(true);
        toast({
          title: 'Daily enrichment limit reached',
          description: data.error ?? 'Try again tomorrow.',
          variant: 'destructive',
        });
        return;
      }
      setLimitReached(false);

      const now = new Date().toISOString();
      const found = !!data?.found;
      const value: string | null = data?.value ?? null;
      const method: string = data?.method ?? 'apify';
      const source: string = data?.source ?? 'apify';

      const patch: Partial<OutreachLead> = { enrichment_source: source };
      if (type === 'email') {
        if (found && value) patch.email = value;
        patch.email_status = found ? 'found' : 'none';
        patch.email_method = method;
        patch.email_last_checked_at = now;
      } else if (type === 'facebook') {
        if (found && value) patch.facebook_url = value;
        patch.facebook_status = found ? 'found' : 'none';
        patch.facebook_method = method;
        patch.facebook_last_checked_at = now;
      } else {
        if (found && value) patch.instagram_url = value;
        patch.instagram_status = found ? 'found' : 'none';
        patch.instagram_method = method;
        patch.instagram_last_checked_at = now;
      }
      await onUpdate(lead.id, patch);

      toast(found
        ? { title: `${LABEL[type]} found`, description: value ?? undefined }
        : { title: `No ${LABEL[type]} found` });
    } catch (err) {
      const now = new Date().toISOString();
      const patch: Partial<OutreachLead> = {};
      if (type === 'email') { patch.email_status = 'error'; patch.email_last_checked_at = now; }
      else if (type === 'facebook') { patch.facebook_status = 'error'; patch.facebook_last_checked_at = now; }
      else { patch.instagram_status = 'error'; patch.instagram_last_checked_at = now; }
      await onUpdate(lead.id, patch);
      toast({ title: `${LABEL[type]} lookup failed`, description: 'Try again.', variant: 'destructive' });
    } finally {
      setEnriching(null);
    }
  }, [lead.id, lead.place_id, lead.business_name, lead.website, onUpdate, toast]);

  return { enrich, enriching, limitReached };
}
