/* WHO MAY USE THE UGC PAGE (docs/ugc-brand-finder.md). Relative imports only.
 *
 * ⛔ A UGC member is a row in ugc_members — NOT a team role. pickRole() stays null for them, so every Findable
 *    edge function keeps refusing them (no_role). This resolver is the only door, and fn ugc-brands the only caller.
 * ⛔ The admin may open the UGC page too (support / setup); a salesperson never may.
 * ⛔ Fails closed: a read that errors is a 503, never "member". */
import { resolveOperator } from "./operator-auth.ts";
import { pickRole } from "../../../src/lib/roleRules.ts";

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ServiceClient = any;

export type UgcCaller = { id: string; email?: string; member: boolean; admin: boolean };
export type UgcResolution =
  | { ok: true; caller: UgcCaller }
  | { ok: false; status: 401 | 403 | 503; error: "unauthorized" | "auth_unavailable" | "not_ugc_member"; detail: string };

export async function resolveUgcCaller(req: Request, service: ServiceClient): Promise<UgcResolution> {
  const who = await resolveOperator(req);
  if (!who.ok) return who;
  const [m, r] = await Promise.all([
    service.from("ugc_members").select("user_id").eq("user_id", who.user.id).maybeSingle(),
    service.from("user_roles").select("role").eq("user_id", who.user.id),
  ]);
  if (m.error || r.error) {
    console.warn(`[ugc-access] read failed: ${String(m.error?.message ?? r.error?.message)}`);
    return { ok: false, status: 503, error: "auth_unavailable", detail: "Could not confirm your access. Try again in a moment." };
  }
  const member = !!m.data?.user_id;
  const admin = pickRole(r.data) === "admin";
  if (!member && !admin) return { ok: false, status: 403, error: "not_ugc_member", detail: "This account does not have access to the UGC page." };
  return { ok: true, caller: { id: who.user.id, email: who.user.email, member, admin } };
}
