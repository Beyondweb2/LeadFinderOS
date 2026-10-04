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
   ⛔ ONE NEXT ACTION (Paul, 2026-10-02): an outcome that DEFINITELY means a task saves it — Call back → "Call",
   Meeting booked → "Meeting", with no day (the person adds it) — through lead_set_follow_up (History). Every
   other suggestion is only pre-filled on the Work panel for the person to save. Not interested clears it.
   Returns the words for what changed, for the Work panel's result line. */
import { supabase } from '@/integrations/supabase/client';
import { leadRpc } from '@/lib/leadRpc';
import { notifyLeadChanged } from '@/lib/leadSync';
import { refusalText } from '@/lib/salesCrm';
import { outcomePlan, salesStateOf, REACHED_OUTCOMES, type LeadStateInput, type OutcomePlan, type SalesStateView } from '@/lib/leadState';
import { snapshotOf, toSnapshotArg } from '@/lib/nextActionStale';

export interface OutcomeLead extends LeadStateInput { id: string; next_action?: string | null; next_action_date?: string | null; next_action_time?: string | null }

/** The note the saved task carries (the person can change it). */
const OUTCOME_TASK_NOTE: Record<'call' | 'meeting', string | null> = { call: 'They asked to be called back', meeting: null };

export interface OutcomeResult { plan: OutcomePlan; said: string[]; failed: string[]; after: SalesStateView }

/** The reading after the plan, from the same facts plus what the plan writes. */
export function stateAfterPlan(lead: OutcomeLead, plan: OutcomePlan, outcome: string, logged: boolean, nowMs = Date.now()): SalesStateView {
  return salesStateOf({
    ...lead,
    /* A revive's status is the server's (lead_revive); for the reading here it is simply no longer a no. */
    status: plan.status ?? (plan.revive ? 'not_contacted' : lead.status),
    is_potential_work: plan.status === 'not_interested' ? false : plan.star ? true : lead.is_potential_work,
    call_booked_at: plan.clearMeeting ? null : lead.call_booked_at,
    /* An earlier real conversation still counts after this outcome (a later no-answer never downgrades). */
    lastLogged: logged ? { outcome, at: new Date(nowMs).toISOString(), reached: (lead.lastLogged?.reached ?? false) || REACHED_OUTCOMES.has(outcome) } : lead.lastLogged,
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
  /* A no becoming a yes (lead_revive, migration 20261002120000): the lead leaves Not interested for the
     workflow status its own WhatsApp history proves (Replied / You replied / Contacted / New), so a later
     reply still moves it to Replied. The server lifts ONLY the Not interested block — never Wrong number,
     an opt-out or any other block. The star is the separate step below. */
  if (plan.revive) {
    const r = await leadRpc('lead_revive', { _lead_id: lead.id });
    if (!r.ok) failed.push(`Not done: Moved back from Not interested (${refusalText(r.error)})`);
    else if (!r.unchanged) {
      said.push('Moved back from Not interested');
      if (r.block_lifted === true) said.push('Not interested block lifted (any other block stays)');
    }
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
  /* ⛔ The task an outcome saves never silently replaces one changed on another screen meanwhile (E-13): it
     expects what this screen showed; a stale screen is refused and said in the result line. */
  if (plan.setNextAction) await step('lead_set_follow_up', { _next_action: plan.setNextAction, _date: null, _note: OUTCOME_TASK_NOTE[plan.setNextAction],
    _expected: toSnapshotArg(snapshotOf(lead)) },
    `Next Action set: ${plan.setNextAction === 'call' ? 'Call' : 'Meeting'} · No date set`);
  if (plan.clearMeeting) await step('lead_set_call_booked', { _at: null }, 'Meeting cancelled');
  if (plan.suppressNumber) await step('lead_mark_wrong_number', {}, 'Number blocked: no templates, queue or automated WhatsApp');
  /* A refused write means the plan did not fully happen: the reading is then the contact alone, and no
     state change is claimed in History. */
  const after = failed.length ? stateAfterPlan(lead, { ...plan, star: false, status: null, revive: false, suppressNumber: false, clearMeeting: false }, outcome, logged) : stateAfterPlan(lead, plan, outcome, logged);
  if (!(await recordStateChange(lead.id, before, after, outcome))) failed.push('Not done: adding the status change to History');
  notifyLeadChanged(lead.id);
  return { plan, said, failed, after };
}
