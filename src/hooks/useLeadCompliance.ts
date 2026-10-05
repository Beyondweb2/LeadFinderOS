import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { businessTypeOf, type BusinessTypeRecord, type BusinessTypeSource, type BusinessType, type BusinessTypeVerdict, type ChEvidence } from '@/lib/businessType';

/* A LEAD'S LEGAL FORM — read-only evidence (2026-10-05, docs/salesperson-onboarding.md §6). Two small
   reads under the caller's own session (RLS: admin any lead, sales their own): the stored Companies House
   check for the lead's place id (never a new lookup — that costs and belongs to Find Leads) and people's
   business-type records. A failed read is "no evidence" — the verdict then says unknown, never anything
   better. Nothing here allows or blocks a call or a message. TPS/CTPS is postponed (no read here). */

// lead_business_type_records and companies_house_checks are not in the generated types.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export interface LeadCompliance {
  businessType: BusinessTypeVerdict;
  loading: boolean;
}

export function useLeadCompliance(lead: { id: string; place_id?: string | null } | null, enabled = true): LeadCompliance {
  const q = useQuery({
    queryKey: ['lead-compliance', lead?.id ?? null, lead?.place_id ?? null],
    enabled: !!lead?.id && enabled,
    staleTime: 60_000,
    queryFn: async () => {
      const [ch, recs] = await Promise.all([
        lead!.place_id
          ? sb.from('companies_house_checks').select('match, company_name, company_number, company_status, company_type').eq('place_id', lead!.place_id).maybeSingle()
          : Promise.resolve({ data: null, error: null }),
        sb.from('lead_business_type_records').select('business_type, source, evidence_note, recorded_at').eq('lead_id', lead!.id).order('recorded_at', { ascending: false }).limit(20),
      ]);
      return {
        ch: ch.error ? null : (ch.data as ChEvidence | null),
        records: recs.error ? [] : ((recs.data ?? []) as BusinessTypeRecord[]),
      };
    },
  });
  return {
    businessType: businessTypeOf({ ch: q.data?.ch ?? null, records: q.data?.records ?? [] }),
    loading: q.isLoading,
  };
}

/** Record a lead's legal form (public.lead_record_business_type — the caller must be able to work the lead). */
export function useRecordBusinessType(leadId: string) {
  const qc = useQueryClient();
  return async (type: BusinessType, source: BusinessTypeSource, note: string): Promise<{ ok: boolean; error?: string }> => {
    const { data, error } = await sb.rpc('lead_record_business_type', { _lead_id: leadId, _type: type, _source: source, _note: note });
    if (error) return { ok: false, error: error.message };
    const r = data as { ok: boolean; error?: string };
    if (r?.ok) await qc.invalidateQueries({ queryKey: ['lead-compliance', leadId] });
    return r ?? { ok: false, error: 'no_answer' };
  };
}
