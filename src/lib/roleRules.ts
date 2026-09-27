/* THE ROLE RULES — pure, one copy, imported by the edge functions (supabase/functions/_shared/access.ts,
 * relative import with .ts) and by the SPA and the tests. No imports, no Deno, no network.
 *
 * ⛔ POSITIVE MATCH EVERYWHERE. 'admin' and 'sales' are the only roles; anything else is none. A
 * lead is workable by sales only when it is assigned to them AND is not a client. Their mirrors in
 * SQL (public.my_role, public.can_work_lead, public.lead_is_client in
 * supabase/migrations/20260927100100_multi_user_sales.sql) are held equal by scripts/role-rules.test.ts. */

export type AppRole = 'admin' | 'sales';
export type Actor = { id: string; email?: string; role: AppRole };

/** The role a set of user_roles rows grants. Admin outranks sales; anything else is nothing. */
export function pickRole(rows: ReadonlyArray<{ role?: unknown }> | null | undefined): AppRole | null {
  const roles = new Set((rows ?? []).map((r) => String(r?.role ?? '')));
  if (roles.has('admin')) return 'admin';
  if (roles.has('sales')) return 'sales';
  return null;
}

/** Paid, in delivery, completed or refunded: a client, not a prospect. Sales never works one. */
export const CLIENT_STATUSES: ReadonlySet<string> = new Set(['payment_received', 'in_delivery', 'completed', 'refunded']);
export function isClientLead(lead: { amount_paid?: unknown; status?: unknown } | null | undefined): boolean {
  if (!lead) return false;
  const paid = Number(lead.amount_paid ?? 0);
  return (Number.isFinite(paid) && paid > 0) || CLIENT_STATUSES.has(String(lead.status ?? ''));
}

/** May this actor WORK this lead? Admin: every lead. Sales: only one assigned to them. An
 *  unassigned lead must be CLAIMED first (atomic claim_lead) — working it unclaimed would let two
 *  reps message the same business. */
export function canWorkLead(actor: Actor, lead: { assigned_to_user_id?: string | null } | null | undefined): boolean {
  if (!lead) return false;
  if (actor.role === 'admin') return true;
  if (actor.role === 'sales') return typeof lead.assigned_to_user_id === 'string' && lead.assigned_to_user_id === actor.id;
  return false;
}

/** Why a SALES caller may not start this audit, or null for the one audit they may run — the HOOK
 *  audit on a lead. Full measurement, discovery, baseline, remeasure, a market audit with no lead
 *  and a repeat of an existing audit are all admin work. */
export function salesAuditRefusal(req: { purpose?: unknown; hookAudit: boolean; leadId: string | null; reuseAuditId: string | null }): string | null {
  const purpose = typeof req.purpose === 'string' ? req.purpose.trim() : '';
  if (purpose) return 'audit_mode_admin_only';
  if (!req.leadId) return 'audit_needs_lead';
  if (req.reuseAuditId) return 'audit_mode_admin_only';
  if (req.hookAudit !== true) return 'audit_mode_admin_only';
  return null;
}
