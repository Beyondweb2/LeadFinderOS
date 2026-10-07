/* WHICH SERVER FUNCTION A SALESPERSON'S LEAD EDIT BECOMES — pure, no imports beyond constants, so the
 * suite can drive it (scripts/sales-shared-workflow.test.ts). src/lib/leadRpc.ts executes the plan.
 *
 * ⛔ POSITIVE MATCH: a key not listed here is REFUSED, never passed on. A salesperson has no direct
 * write on outreach_leads; each accepted key maps to one ownership-checked lead function. */
import { SALES_SETTABLE_STATUSES } from './salesCrm.ts';

/** Keys the SERVER writes (contact_check / the WhatsApp check) — never a salesperson's edit. */
export const SERVER_WRITTEN_KEYS: ReadonlySet<string> = new Set(['whatsapp_status', 'whatsapp_checked_at']);
/** Cosmetic bookkeeping the admin's table writes on a click; for a salesperson it is not stored. */
export const NOT_STORED_FOR_SALES: ReadonlySet<string> = new Set(['outreach_attempts', 'last_outreach_attempt_at']);
/** The two ROUTES the app itself chooses between (the Call button, the WhatsApp queue). contact_method for a
 *  salesperson is stored only as one of these (lead_set_contact_method, migration 20261015110000); any other
 *  pill value stays the accepted no-op it always was for them. The function's allowlist is the same two. */
export const SALES_CONTACT_ROUTES: readonly string[] = ['call', 'whatsapp'];
export const DETAIL_KEYS = ['contact_name', 'search_keyword', 'search_location'] as const;
export const FOLLOW_UP_KEYS: ReadonlySet<string> = new Set(['next_action', 'next_action_date']);

export type SalesPatchStep =
  | { fn: 'lead_mark_interested'; on: boolean }
  | { fn: 'lead_set_stage'; status: string }
  /** The follow-up needs the current values of the fields the patch does not carry (read first). */
  | { fn: 'lead_set_follow_up'; nextAction?: string; date?: string | null; hasNextAction: boolean; hasDate: boolean }
  | { fn: 'lead_set_details'; contact_name: string | null; search_keyword: string | null; search_location: string | null }
  | { fn: 'lead_set_archived'; archived: boolean }
  | { fn: 'lead_set_contact_method'; method: string };

export interface SalesPatchPlan { steps: SalesPatchStep[]; refused: string[] }

const KNOWN = new Set<string>([...SERVER_WRITTEN_KEYS, ...NOT_STORED_FOR_SALES, ...FOLLOW_UP_KEYS, ...DETAIL_KEYS,
  'contact_method', 'status', 'is_potential_work', 'is_archived', 'previous_status']);

export function planSalesPatch(patch: Record<string, unknown>): SalesPatchPlan {
  const keys = Object.keys(patch);
  const refused = keys.filter((k) => !KNOWN.has(k));
  const steps: SalesPatchStep[] = [];
  if ('status' in patch) {
    const status = String(patch.status ?? '');
    /* "Interested" is the ⭐ flag, not a status — as on the admin's screens. */
    if (status === 'interested') steps.push({ fn: 'lead_mark_interested', on: true });
    else if ((SALES_SETTABLE_STATUSES as readonly string[]).includes(status)) steps.push({ fn: 'lead_set_stage', status });
    else refused.push('status');
  }
  /* previous_status only ever rides along with a status the admin's queue writes; never on its own. */
  if ('previous_status' in patch && !('status' in patch)) refused.push('previous_status');
  if ('is_potential_work' in patch) steps.push({ fn: 'lead_mark_interested', on: patch.is_potential_work === true });
  if (keys.some((k) => FOLLOW_UP_KEYS.has(k))) {
    steps.push({
      fn: 'lead_set_follow_up',
      hasNextAction: 'next_action' in patch, nextAction: 'next_action' in patch ? String(patch.next_action ?? 'none') : undefined,
      hasDate: 'next_action_date' in patch, date: 'next_action_date' in patch ? ((patch.next_action_date as string | null) ?? null) : undefined,
    });
  }
  if (DETAIL_KEYS.some((k) => k in patch)) {
    /* null = leave that field alone (the function's contract); '' clears it. */
    const arg = (k: typeof DETAIL_KEYS[number]) => (k in patch ? String(patch[k] ?? '') : null);
    steps.push({ fn: 'lead_set_details', contact_name: arg('contact_name'), search_keyword: arg('search_keyword'), search_location: arg('search_location') });
  }
  if ('is_archived' in patch) steps.push({ fn: 'lead_set_archived', archived: patch.is_archived === true });
  if (typeof patch.contact_method === 'string' && SALES_CONTACT_ROUTES.includes(patch.contact_method)) {
    steps.push({ fn: 'lead_set_contact_method', method: patch.contact_method });
  }
  /* A patch with ANY refused key writes nothing at all — never half a change. */
  return refused.length ? { steps: [], refused } : { steps, refused };
}
