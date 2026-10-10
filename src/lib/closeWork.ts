/* ══ CLOSING DASHBOARD ITEMS (2026-10-10, Paul: "let the salesperson tidy What to do next and Follow-ups") ═══════
   One item, several, or a whole list, from the Sales dashboard. Two choices, nothing new underneath:
     · DONE, NO ACTION NEEDED → fn lead_close_work 'done' only: the Next Action is cleared through lead_set_follow_up
       (History "completed"), the lead is stamped closed (who + when, one History line). Status, the ⭐ and the
       campaign are never touched.
     · DEAD LEAD → the EXISTING outcome the Call tab records (Not interested / Wrong number), carried out by
       src/lib/leadOutcome.ts applyOutcome exactly as there (status, star, queue stop, number block, the History
       state line) — then stamped closed with lead_close_work 'dead'. No new status.
   ⛔ Nothing here sends a message. Not interested asks the queue to STOP (suppress_lead), as the Call tab does.
   ⛔ Permission is the server's (can_work_lead): a lead the person may not work comes back refused, untouched.
   A closed item stays off the dashboard until they reply again — salesWorkspace.ts isClosedItem. */
import { supabase } from '@/integrations/supabase/client';
import { leadRpc } from '@/lib/leadRpc';
import { applyOutcome, type OutcomeLead } from '@/lib/leadOutcome';
import { lastLoggedContactOf, salesStateOf } from '@/lib/leadState';
import { leadSourceFor } from '@/lib/outreachLeadColumns';
import { notifyLeadChanged } from '@/lib/leadSync';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const sb = supabase as any;

export type CloseChoice = 'done' | 'not_interested' | 'wrong_number';
/** The choices, in the order drawn. Dead lead = the two existing "stop" outcomes (CALL_OUTCOMES). */
export const CLOSE_CHOICES: readonly { key: CloseChoice; label: string; does: string; dead: boolean }[] = [
  { key: 'done', label: 'Done, no action needed', does: 'Clears the item and its Next Action. Status, star and campaign stay as they are.', dead: false },
  { key: 'not_interested', label: 'Dead lead: Not interested', does: 'Records Not interested, as on the Call tab: status Not interested, star removed, no more automatic messages.', dead: true },
  { key: 'wrong_number', label: 'Dead lead: Wrong number', does: 'Records Wrong number, as on the Call tab: the number is blocked from templates and the queue.', dead: true },
];
/** lead_close_work takes at most this many leads per call. */
export const CLOSE_BATCH = 500;

export interface CloseResult { closed: number; refused: { leadId: string; error: string }[]; failed: string[] }

const OUTCOME_COLUMNS = 'id, business_name, status, is_potential_work, amount_paid, whatsapp_sent_at, next_action, next_action_date, next_action_time, call_booked_at, sms_queued_at, sms_delivery_status';

async function closeCall(ids: string[], reason: 'done' | 'dead', outcome: string | null, out: CloseResult): Promise<Set<string>> {
  const done = new Set<string>();
  for (let i = 0; i < ids.length; i += CLOSE_BATCH) {
    const chunk = ids.slice(i, i + CLOSE_BATCH);
    const r = await leadRpc('lead_close_work', { _lead_ids: chunk, _reason: reason, _outcome: outcome });
    if (!r.ok) { for (const id of chunk) out.refused.push({ leadId: id, error: String(r.error ?? 'failed') }); continue; }
    const refused = new Set<string>();
    for (const x of (Array.isArray(r.refused) ? r.refused : []) as { lead_id: string; error: string }[]) { refused.add(x.lead_id); out.refused.push({ leadId: x.lead_id, error: x.error }); }
    for (const id of chunk) if (!refused.has(id)) done.add(id);
    out.closed += Number(r.closed ?? 0);
  }
  return done;
}

/** Close these leads' dashboard items. `role` picks where a Dead lead's row is read from (the admin's table or the
 *  salesperson's safe view). Leads run one at a time for a Dead lead (each is the Call tab's own sequence). */
export async function closeWork(leadIds: readonly string[], choice: CloseChoice, role: 'admin' | 'sales' | null | undefined): Promise<CloseResult> {
  const ids = [...new Set(leadIds)];
  const out: CloseResult = { closed: 0, refused: [], failed: [] };
  if (!ids.length) return out;
  if (choice === 'done') {
    const done = await closeCall(ids, 'done', null, out);
    for (const id of done) notifyLeadChanged(id);
    return out;
  }
  const src = leadSourceFor(role);
  for (const id of ids) {
    /* Close first: the server checks the person may work this lead before anything else is written. */
    const ok = await closeCall([id], 'dead', choice, out);
    if (!ok.has(id)) continue;
    const { data: row, error } = await sb.from(src.table).select(OUTCOME_COLUMNS).eq('id', id).maybeSingle();
    if (error || !row) { out.failed.push(`${id}: could not read the lead to record ${choice === 'wrong_number' ? 'Wrong number' : 'Not interested'}`); continue; }
    const { data: acts } = await sb.from('lead_activity').select('kind, body, data, created_at').eq('lead_id', id).order('created_at', { ascending: false }).limit(200);
    const wrong = await leadRpc('lead_wrong_number', { _lead_id: id });
    const last = lastLoggedContactOf(acts ?? []);
    const lead: OutcomeLead = { ...(row as OutcomeLead), lastLogged: last ? { outcome: last.outcomeValue ?? '', at: last.at, reached: last.everReached } : null, wrongNumber: wrong.ok ? wrong.wrong_number === true : null };
    const res = await applyOutcome(lead, choice, salesStateOf(lead), false);
    for (const f of res.failed) out.failed.push(`${(row as { business_name?: string | null }).business_name ?? 'A lead'}: ${f}`);
  }
  return out;
}
