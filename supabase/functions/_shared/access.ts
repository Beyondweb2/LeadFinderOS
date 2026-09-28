// access — WHO is calling an edge function and WHAT they may do. The one place a role is decided.
//
// ⛔ THE ROLE COMES FROM public.user_roles, READ WITH THE SERVICE ROLE. Never from the request body,
// never from user_metadata (the user can edit that), never from the browser. user_roles has deny-all
// INSERT/UPDATE/DELETE policies for every signed-in role, so only the service role (the Team screen's
// admin-only function) can grant or remove one. Removing the row IS the disable switch: the next
// call is refused, whatever token the browser still holds.
//
// ⛔ POSITIVE MATCH ONLY. `admin` and `sales` are the two roles this app knows. Any other value, no
// row, or a failed read resolves to NO ROLE → 403. Absence is never a role (CLAUDE.md §4).
//
// The pure rules (pickRole, canWorkLead, isClientLead, salesAuditRefusal) live ONCE in
// src/lib/roleRules.ts, shared with the SPA and the tests. A future sales_manager is one more
// AppRole value and one more branch in canWorkLead there — nothing else.
import { resolveOperator } from "./operator-auth.ts";
import { recordDenial } from "./protection.ts";
import { canWorkLead, isClientLead, pickRole, type Actor, type AppRole } from "../../../src/lib/roleRules.ts";

export { canWorkLead, CLIENT_STATUSES, isClientLead, pickRole, salesAuditRefusal } from "../../../src/lib/roleRules.ts";
export type { Actor, AppRole } from "../../../src/lib/roleRules.ts";

export type ActorResolution =
  | { ok: true; actor: Actor }
  | { ok: false; status: 401 | 403 | 503; error: "unauthorized" | "auth_unavailable" | "no_role" | "admin_only"; detail: string };

// deno-lint-ignore no-explicit-any
type ServiceClient = any;

/** Signed-in caller + their role. 401 = no/refused token, 503 = auth service down, 403 = no role. */
export async function resolveActor(req: Request, service: ServiceClient): Promise<ActorResolution> {
  const who = await resolveOperator(req);
  if (!who.ok) return who;
  const { data, error } = await service.from("user_roles").select("role").eq("user_id", who.user.id);
  if (error) {
    console.warn(`[access] role read failed: ${String(error?.message ?? error)}`);
    return { ok: false, status: 503, error: "auth_unavailable", detail: "Could not confirm your access. Try again in a moment." };
  }
  const role = pickRole(data);
  if (!role) return { ok: false, status: 403, error: "no_role", detail: "This account has no access to LeadFinderOS." };
  return { ok: true, actor: { id: who.user.id, email: who.user.email, role } };
}

/** For a function that already verified the token itself: does this user hold a team role?
 *  Used where the handler's own auth stays as it is and only "a role is required" is added —
 *  so a disabled account (role row removed) is refused even while its token is still valid. */
export async function userTeamRole(userId: string): Promise<AppRole | null> {
  const { createClient } = await import("https://esm.sh/@supabase/supabase-js@2");
  const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
  const { data, error } = await service.from("user_roles").select("role").eq("user_id", userId);
  if (error) return null;
  return pickRole(data);
}

/** Admin-only functions: everything a salesperson must never reach (delivery, money, team, config). */
export async function requireAdmin(req: Request, service: ServiceClient): Promise<ActorResolution> {
  const r = await resolveActor(req, service);
  if (!r.ok) return r;
  if (r.actor.role !== "admin") {
    /* A signed-in salesperson calling an admin-only function: the UI never offers one, so this is a
       direct call — counted (record_denial; ten in ten minutes emails Paul). */
    let fn = "admin_only";
    try { fn = new URL(req.url).pathname.split("/").filter(Boolean).pop() ?? fn; } catch { /* keep */ }
    await recordDenial(service, r.actor.id, fn);
    return { ok: false, status: 403, error: "admin_only", detail: "This action is for the admin account only." };
  }
  return r;
}

/** A server-to-server call carrying the shared CRON_SECRET. An unset secret matches nothing. */
export function isInternalCall(req: Request): boolean {
  const expected = Deno.env.get("CRON_SECRET") ?? "";
  const got = req.headers.get("x-cron-secret") ?? "";
  if (!expected || got.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < expected.length; i++) diff |= expected.charCodeAt(i) ^ got.charCodeAt(i);
  return diff === 0;
}

/** May this actor run a write keyed by `leadId`? A real lead → canWorkLead. An id that matches NO
 *  lead is allowed: Find Leads enriches a search result with a synthetic id on purpose, and an
 *  update keyed to a missing row writes nothing. A failed read refuses (fail closed). */
export async function mayWriteLeadId(service: ServiceClient, actor: Actor, leadId: string): Promise<"ok" | "not_your_lead" | "lookup_failed"> {
  if (actor.role === "admin") return "ok";
  const { data, error } = await service.from("outreach_leads").select("id, assigned_to_user_id, amount_paid, status").eq("id", leadId).maybeSingle();
  if (error) return "lookup_failed";
  if (!data) return "ok";
  if (canWorkLead(actor, data) && !isClientLead(data)) return "ok";
  await recordDenial(service, actor.id, "lead_write", leadId);
  return "not_your_lead";
}

/** May a SALESPERSON spend on / receive the Google or Maps details of this business? (2026-09-29)
 *  Refused when the business is already in the book and is not assigned to them — another rep's lead,
 *  Paul's, a client's. Without this, Find Leads' place ids + a place-details call rebuilt the phone
 *  and address of any lead the sales view deliberately hides. A business NOT in the book (a new
 *  search result) is allowed: that is ordinary prospecting. The admin is never checked.
 *  ⛔ FAIL CLOSED: a failed read refuses. */
export async function mayLookUpBusiness(service: ServiceClient, actor: Actor, ids: { placeId?: string | null; mapsUrl?: string | null }): Promise<"ok" | "not_your_lead" | "lookup_failed"> {
  if (actor.role === "admin") return "ok";
  const placeId = typeof ids.placeId === "string" ? ids.placeId.trim() : "";
  const mapsUrl = typeof ids.mapsUrl === "string" ? ids.mapsUrl.trim() : "";
  if (!placeId && !mapsUrl) return "ok";
  const filters = [placeId ? `place_id.eq.${placeId}` : "", mapsUrl ? `google_maps_url.eq.${mapsUrl}` : ""].filter(Boolean);
  /* PostgREST's or() splits on commas; a value with a comma or a bracket is matched one column at a
     time instead, so a crafted id can never widen the filter. */
  const unsafe = (v: string) => /[,()]/.test(v);
  const reads = unsafe(placeId) || unsafe(mapsUrl)
    ? [placeId ? service.from("outreach_leads").select("id, assigned_to_user_id, amount_paid, status").eq("place_id", placeId).limit(20) : null,
       mapsUrl ? service.from("outreach_leads").select("id, assigned_to_user_id, amount_paid, status").eq("google_maps_url", mapsUrl).limit(20) : null].filter(Boolean)
    : [service.from("outreach_leads").select("id, assigned_to_user_id, amount_paid, status").or(filters.join(",")).limit(20)];
  const results = await Promise.all(reads);
  const rows: Array<{ id: string; assigned_to_user_id: string | null; amount_paid: unknown; status: unknown }> = [];
  for (const r of results) {
    if (r.error) return "lookup_failed";
    rows.push(...((r.data ?? []) as typeof rows));
  }
  if (!rows.length) return "ok";
  /* In the book: only when EVERY matching row is the caller's own, non-client lead (a duplicate row
     owned by someone else keeps it refused — its phone is theirs to hide). */
  if (rows.every((l) => canWorkLead(actor, l) && !isClientLead(l))) return "ok";
  await recordDenial(service, actor.id, "business_lookup", rows[0]?.id ?? null);
  return "not_your_lead";
}

/** The account every lead row belongs to (team_members.is_book_owner) — explicit, never guessed
 *  from "the newest lead". For a book-wide READ by a salesperson (Coverage counts, the niche
 *  verdict), so they see the same market the admin sees. Null when unset: the caller refuses. */
export async function bookOwnerId(service: ServiceClient): Promise<string | null> {
  const { data, error } = await service.from("team_members").select("user_id").eq("is_book_owner", true).maybeSingle();
  if (error || !data) return null;
  return typeof data.user_id === "string" ? data.user_id : null;
}

/** A lead-scoped operator function: may this actor act on this lead, and under whose BOOK do its
 *  conversation rows live? admin: exactly the old rule (the lead's user_id is the caller) — every
 *  downstream query is unchanged. sales: assigned to them and not a client; the book is the lead's
 *  owner, so the caller reads the same thread the queue and the admin write into. */
export async function leadAccess(service: ServiceClient, actor: Actor, leadId: string): Promise<{ ok: true; bookUserId: string } | { ok: false; error: "lead_not_found" | "lookup_failed" }> {
  const { data, error } = await service.from("outreach_leads")
    .select("id, user_id, assigned_to_user_id, amount_paid, status").eq("id", leadId).maybeSingle();
  if (error) return { ok: false, error: "lookup_failed" };
  const l = data as { id: string; user_id: string; assigned_to_user_id: string | null; amount_paid: unknown; status: unknown } | null;
  if (!l) return { ok: false, error: "lead_not_found" };
  if (actor.role === "admin") return l.user_id === actor.id ? { ok: true, bookUserId: actor.id } : { ok: false, error: "lead_not_found" };
  if (canWorkLead(actor, l) && !isClientLead(l)) return { ok: true, bookUserId: l.user_id };
  await recordDenial(service, actor.id, "lead_access", leadId);
  return { ok: false, error: "lead_not_found" };
}

/** The JSON body every refusal answers with, so the browser can tell a role refusal from a crash. */
export function refusalBody(r: Extract<ActorResolution, { ok: false }>) {
  return { ok: false, error: r.error, detail: r.detail };
}
