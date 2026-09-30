/* ══ CARRYING OUT A LOGGED OUTCOME (lead state audit, 2026-09-30) ═════════════════════════════════════
   The RULE is src/lib/leadState.ts (outcomePlan); this file only performs it, the same way for both
   roles and every screen (the Work panel in the popup and in Focus Mode):
     · every write is an ownership-checked lead function — lead_mark_interested, lead_set_stage,
       lead_set_follow_up (clearing only), lead_mark_wrong_number — so the admin's change and a
       salesperson's leave the SAME History rows;
     · Not interested also stops the queue for that lead (process-whatsapp-queue suppress_lead), for the
       admin too (the Inbox pill's admin path wrote no suppression row — found in this audit);
     · when the sales state reading changed, one 'state_changed' History row says so
       (lead_log_state_change: "Status: Contacted → Interested"), and only then.
   ⛔ It never sets a chosen Next Action: suggestions are pre-filled on the Work panel for the person to
   save. Clearing to 'none' on Not interested is the one automatic next-action write the rule allows.
   Returns the words for what changed, for the Work panel's result line. */
import { supabase } from '@/integrations/supabase/client';
import { leadRpc } from '@/lib/leadRpc';
import { notifyLeadChanged } from '@/lib/leadSync';
import { refusalText } from '@/lib/salesCrm';
import { outcomePlan, salesStateOf, type LeadStateInput, type OutcomePlan, type SalesStateView } from '@/lib/leadState';

export interface OutcomeLead extends LeadStateInput { id: string; next_action?: string | null }

export interface OutcomeResult { plan: OutcomePlan; said: string[]; failed: string[]; after: SalesStateView }

/** The reading after the plan, from the same facts plus what the plan writes. */
export function stateAfterPlan(lead: OutcomeLead, plan: OutcomePlan, outcome: string, logged: boolean, nowMs = Date.now()): SalesStateView {
  return salesStateOf({
    ...lead,
    status: plan.status ?? lead.status,
    is_potential_work: plan.status === 'not_interested' ? false : plan.star ? true : lead.is_potential_work,
    call_booked_at: plan.clearMeeting ? null : lead.call_booked_at,
    lastLogged: logged ? { outcome, at: new Date(nowMs).toISOString() } : lead.lastLogged,
    wrongNumber: plan.suppressNumber ? true : lead.wrongNumber,
  }, nowMs);
}

/** Record the state change in History, only when the reading moved. Best effort: the writes it
 *  describes have already happened, so a failure here is reported, never retried into a duplicate. */
export async function recordStateChange(leadId: string, before: SalesStateView, after: SalesStateView, outcome: string): Promise<boolean> {
  if (before.state === after.state) return true;
  const r = await leadRpc('lead_log_state_change', { _lead_id: leadId, _from: before.state, _to: after.state, _outcome: outcome });
  return r.ok;
}

/** Perform one outcome's plan. `logged` = the contact itself was already recorded (lead_log_contact);
 *  false for a WhatsApp conversation, whose messages are the record. */
export async function applyOutcome(lead: OutcomeLead, outcome: string, before: SalesStateView, logged: boolean): Promise<OutcomeResult> {
  const plan = outcomePlan(outcome, lead);
  const said: string[] = [];
  const failed: string[] = [];
  const step = async (name: string, args: Record<string, unknown>, ok: string) => {
    const r = await leadRpc(name, { _lead_id: lead.id, ...args });
    if (r.ok) { if (!r.unchanged) said.push(ok); } else failed.push(`Not done: ${ok} (${refusalText(r.error)})`);
    return r.ok;
  };
  /* A no becoming a yes: the database clears ONLY the Not interested suppression when the status leaves
     not_interested for interested / won (trigger, migration 20260930170000) — never Wrong number, an
     opt-out, the prospect's own "no" reply or any other block. The line says it, as the rule's words. */
  if (plan.status === 'interested' && await step('lead_set_stage', { _status: 'interested' }, 'Moved back to Interested') && lead.status === 'not_interested') {
    said.push('Not interested block lifted (any other block stays)');
  }
  if (plan.star) await step('lead_mark_interested', { _on: true }, 'Marked Interested ⭐');
  if (plan.status === 'not_interested') {
    if (await step('lead_set_stage', { _status: 'not_interested' }, 'Status set to Not interested')) {
      if (lead.is_potential_work) await step('lead_mark_interested', { _on: false }, 'Star removed');
      /* Stop the queue for this lead (and the suppression row other leads on the number respect). */
      void supabase.functions.invoke('process-whatsapp-queue', { body: { mode: 'suppress_lead', lead_id: lead.id, reason: 'not_interested' } });
      said.push('No more automatic messages');
    }
  }
  if (plan.clearNextAction) await step('lead_set_follow_up', { _next_action: 'none', _date: null, _note: null }, 'Next action cleared');
  if (plan.clearMeeting) await step('lead_set_call_booked', { _at: null }, 'Meeting cancelled');
  if (plan.suppressNumber) await step('lead_mark_wrong_number', {}, 'Number blocked: no templates, queue or automated WhatsApp');
  /* A refused write means the plan did not fully happen: the reading is then the contact alone, and no
     state change is claimed in History. */
  const after = failed.length ? stateAfterPlan(lead, { ...plan, star: false, status: null, suppressNumber: false, clearMeeting: false }, outcome, logged) : stateAfterPlan(lead, plan, outcome, logged);
  if (!(await recordStateChange(lead.id, before, after, outcome))) failed.push('Not done: adding the status change to History');
  notifyLeadChanged(lead.id);
  return { plan, said, failed, after };
}
