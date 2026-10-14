/* THE REPORT-OFFER PRE-CHECK, CLIENT SIDE (2026-10-14, src/lib/reportOfferTemplate.ts). Asks process-whatsapp-queue
   (mode report_offer_check — the same resolver the send uses) which of these leads can get ai_visibility_report_offer,
   and why not. ⛔ Fails CLOSED: an unanswered check queues nothing. Warnings never block. */
import { supabase } from '@/integrations/supabase/client';

export interface ReportOfferLeadResult { ok: boolean; refusal: string | null; reason: string | null; warnings: string[] }
export interface ReportOfferCheck { ok: true; sender: string; results: Record<string, ReportOfferLeadResult> }

export async function checkReportOffer(leadIds: string[]): Promise<ReportOfferCheck | { ok: false }> {
  const results: Record<string, ReportOfferLeadResult> = {};
  let sender = '';
  for (let i = 0; i < leadIds.length; i += 200) {
    const { data, error } = await supabase.functions.invoke('process-whatsapp-queue', { body: { mode: 'report_offer_check', lead_ids: leadIds.slice(i, i + 200) } });
    const r = data as { ok?: boolean; sender?: string; results?: Record<string, ReportOfferLeadResult> } | null;
    if (error || !r?.ok || !r.results) return { ok: false };
    Object.assign(results, r.results);
    sender = r.sender ?? sender;
  }
  return { ok: true, sender, results };
}

export interface ReportOfferSummary {
  okIds: string[];
  /** Refused leads grouped by reason: label → business names. */
  refused: Array<{ label: string; names: string[] }>;
  /** Warnings (never blocking): label → business names. */
  warnings: Array<{ label: string; names: string[] }>;
}

/** Group a check into what can go, what cannot (and why) and the warnings, with business names for tracing. */
export function summariseReportOffer(check: ReportOfferCheck, ids: string[], nameOf: (id: string) => string): ReportOfferSummary {
  const okIds: string[] = [];
  const refused = new Map<string, string[]>();
  const warnings = new Map<string, string[]>();
  for (const id of ids) {
    const r = check.results[id];
    if (!r) { const k = 'could not be checked'; refused.set(k, [...(refused.get(k) ?? []), nameOf(id)]); continue; }
    if (r.ok) okIds.push(id);
    else { const k = r.reason ?? 'not sendable'; refused.set(k, [...(refused.get(k) ?? []), nameOf(id)]); }
    for (const w of r.warnings ?? []) warnings.set(w, [...(warnings.get(w) ?? []), nameOf(id)]);
  }
  const list = (m: Map<string, string[]>) => [...m.entries()].map(([label, names]) => ({ label, names }));
  return { okIds, refused: list(refused), warnings: list(warnings) };
}
