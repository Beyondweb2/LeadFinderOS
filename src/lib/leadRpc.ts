import { supabase } from '@/integrations/supabase/client';
import { planSalesPatch } from '@/lib/salesPatchPlan';

/* HOW A SALESPERSON'S EDIT REACHES A LEAD (2026-09-27, the shared Outreach + Inbox).
 *
 * ⛔ SALES HAS NO DIRECT WRITE ON outreach_leads, AND THIS FILE DOES NOT GIVE THEM ONE. A restrictive
 * RLS policy makes every direct update from a sales session touch ZERO rows — and PostgREST answers
 * that with a 200 and no error, so a direct write would LOOK saved and change nothing. Every change a
 * salesperson makes on the shared screens therefore goes through one of the SECURITY DEFINER lead
 * functions (supabase/migrations/20260927100100 + 20260927140000), each of which checks the role and,
 * for sales, that the lead is assigned to them and is not a client — before touching the row.
 *
 * Which function each field becomes is decided in ONE pure place, src/lib/salesPatchPlan.ts
 * (positive match — an unknown key is refused and nothing is written). This file only runs the plan. */

// The generated types lag the database: the lead functions are called untyped.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export type RpcResult = { ok: boolean; error?: string; [k: string]: unknown };

export async function leadRpc(name: string, args: Record<string, unknown>): Promise<RpcResult> {
  const { data, error } = await sb.rpc(name, args);
  /* A raised refusal (no_role, not_your_lead) arrives as an error whose message IS the code. */
  if (error) return { ok: false, error: String(error.message ?? error) };
  return (data ?? { ok: false, error: 'empty_response' }) as RpcResult;
}

export interface SalesPatchResult {
  ok: boolean;
  /** The refusal code (refusalText turns it into words). */
  error?: string;
  /** Keys in the patch a salesperson may not change — nothing was written for them. */
  refused: string[];
  /** True when at least one server function actually ran (the caller then re-reads the row). */
  wrote: boolean;
}

/** Apply a lead patch as a SALES caller. The first refusal stops the rest. */
export async function salesPatchLead(leadId: string, patch: Record<string, unknown>): Promise<SalesPatchResult> {
  const plan = planSalesPatch(patch);
  if (plan.refused.length) return { ok: false, error: 'admin_only', refused: plan.refused, wrote: false };
  let wrote = false;
  for (const step of plan.steps) {
    let r: RpcResult;
    switch (step.fn) {
      case 'lead_mark_interested': r = await leadRpc(step.fn, { _lead_id: leadId, _on: step.on }); break;
      case 'lead_set_stage': r = await leadRpc(step.fn, { _lead_id: leadId, _status: step.status }); break;
      case 'lead_set_details':
        r = await leadRpc(step.fn, { _lead_id: leadId, _contact_name: step.contact_name, _search_keyword: step.search_keyword, _search_location: step.search_location });
        break;
      case 'lead_set_archived': r = await leadRpc(step.fn, { _lead_id: leadId, _archived: step.archived }); break;
      case 'lead_set_follow_up': {
        /* lead_set_follow_up writes all three follow-up columns at once. The table's editor holds only
           the action or the date — the list does not download the note — so the current values are
           READ first rather than sent as blanks, which would wipe the note. */
        const { data, error } = await sb.from('sales_leads').select('next_action, next_action_date, next_action_note').eq('id', leadId).maybeSingle();
        if (error || !data) { r = { ok: false, error: error ? String(error.message ?? error) : 'not_your_lead' }; break; }
        const cur = data as { next_action: string | null; next_action_date: string | null; next_action_note: string | null };
        const nextAction = step.hasNextAction ? (step.nextAction ?? 'none') : (cur.next_action ?? 'none');
        const date = step.hasDate ? (step.date ?? null) : cur.next_action_date;
        r = await leadRpc(step.fn, { _lead_id: leadId, _next_action: nextAction, _date: nextAction === 'none' ? null : date, _note: cur.next_action_note });
        break;
      }
    }
    if (!r.ok) return { ok: false, error: r.error, refused: [], wrote };
    wrote = true;
  }
  return { ok: true, refused: [], wrote };
}

/** "Remove from my leads" (sales only; migration 20260928230000). The SERVER decides per lead, under
 *  the row lock: never contacted → released (unassigned; claimable again from Find Leads if otherwise
 *  eligible); contacted on any channel → archived with the owner kept (never claimable); anything else
 *  refused (not theirs / a client, an opener waiting in the queue, won / onboarding). Never a delete. */
export interface RemoveFromMyLeadsResult extends RpcResult {
  released?: number;
  archived?: number;
  skipped?: Record<string, number>;
  results?: Array<{ id: string; outcome: 'released' | 'archived' | 'refused'; reason?: string }>;
}
export function salesRemoveLeads(leadIds: string[]): Promise<RemoveFromMyLeadsResult> {
  return leadRpc('sales_remove_leads', { _lead_ids: leadIds }) as Promise<RemoveFromMyLeadsResult>;
}

/** The Outreach selection's "Move to campaign" for a salesperson: every lead goes through
 *  lead_set_campaign (the workspace card's own rule) inside leads_set_campaign. An EXISTING campaign or
 *  null ("No campaign"); leads they may not work are skipped and counted. */
export function leadsSetCampaign(leadIds: string[], campaignId: string | null): Promise<RpcResult & { moved?: number; unchanged?: number; skipped?: Record<string, number> }> {
  return leadRpc('leads_set_campaign', { _lead_ids: leadIds, _campaign_id: campaignId });
}

/** Bulk initial outreach for a salesperson: THE TEMPLATE THEY CHOSE for this batch, stored on each
 *  lead by the server (sales_queue_opener). Never a default, never a substitute. */
export function salesQueueOpener(leadIds: string[], template: string): Promise<RpcResult> {
  return leadRpc('sales_queue_opener', { _lead_ids: leadIds, _template: template });
}
