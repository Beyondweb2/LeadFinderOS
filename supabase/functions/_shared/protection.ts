// protection — the ONE server-side usage guard every paid or data-heavy action a person starts passes
// through (2026-09-29, docs/abuse-cost-protection.md). The decision lives in SQL (public.guard_action):
// suspension, the global mode (running / prospecting_paused / all_stop), per-user burst windows, per-user
// and team spend caps, warnings. This file only asks, and turns a refusal into ONE response shape.
//
// ⛔ CALL IT BEFORE SPENDING, AFTER THE ROLE CHECK, ONCE PER REQUEST. It records a ledger row
// (api_usage_log, api_type 'guard') for every allowed, warned and refused attempt — the counters ARE the
// ledger, so there is no second store to drift.
// ⛔ FAIL CLOSED FOR SALES: a guard that cannot answer refuses a salesperson (absence is never
// "allowed" on a spending path, CLAUDE.md §4). The admin is let through with a warning in the log, so
// a database hiccup never locks Paul out of his own tools; every admin action still hits the mode check
// whenever the guard does answer.
// ⛔ A SALESPERSON NEVER SEES A COST OR A PROVIDER — the refusal says "Usage temporarily paused —
// contact Paul" (USAGE_PAUSED_DETAIL), whatever the reason.
import { guardRefusalDetail, type GuardAction, type ProtectionMode, isProtectionMode } from "../../../src/lib/protectionLimits.ts";

export { USAGE_PAUSED_DETAIL } from "../../../src/lib/protectionLimits.ts";
export type { GuardAction, ProtectionMode } from "../../../src/lib/protectionLimits.ts";

// deno-lint-ignore no-explicit-any
type ServiceClient = any;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface GuardOptions {
  /** The function asking (recorded on the ledger row). */
  fn: string;
  leadId?: string | null;
  /** An ESTIMATE, only for work whose real provider rows are billed to the book owner, not the caller
   *  (a salesperson's hook audit). Everything else logs its real cost itself — leave this 0. */
  estCostUsd?: number;
  units?: number;
  /** The caller's role when the function already knows it — decides fail-open vs fail-closed. */
  role?: string | null;
}

export type GuardOutcome =
  | { ok: true; state: "normal" | "warning"; reason: string | null }
  | { ok: false; status: 429 | 403 | 503; reason: string; body: GuardRefusalBody };

export interface GuardRefusalBody {
  ok: false;
  success: false;
  error: "usage_paused";
  detail: string;
  /** Older callers print `message` / `error`; both carry the sentence, never a token or a cost. */
  message: string;
}

function refusal(reason: string, role: string | null | undefined, status: 429 | 403 | 503): GuardOutcome {
  const detail = guardRefusalDetail(reason, role);
  return { ok: false, status, reason, body: { ok: false, success: false, error: "usage_paused", detail, message: detail } };
}

/** Ask the guard. See the header for the rules. */
export async function guardAction(service: ServiceClient, actorId: string, action: GuardAction, opts: GuardOptions): Promise<GuardOutcome> {
  try {
    const { data, error } = await service.rpc("guard_action", {
      _actor: actorId,
      _action: action,
      // Find Leads passes synthetic ids that are not uuids; the ledger column is uuid, so only a real one is kept.
      _lead: typeof opts.leadId === "string" && UUID_RE.test(opts.leadId) ? opts.leadId : null,
      _est_cost: Math.max(0, Number(opts.estCostUsd ?? 0) || 0),
      _units: Math.max(1, Math.floor(Number(opts.units ?? 1) || 1)),
      _fn: opts.fn,
    });
    if (error || !data || typeof data !== "object") throw new Error(String(error?.message ?? "no answer"));
    const g = data as { ok?: unknown; state?: unknown; reason?: unknown; role?: unknown };
    const role = typeof g.role === "string" ? g.role : opts.role ?? null;
    if (g.ok === true) {
      return { ok: true, state: g.state === "warning" ? "warning" : "normal", reason: typeof g.reason === "string" ? g.reason : null };
    }
    const reason = typeof g.reason === "string" ? g.reason : "refused";
    if (reason === "no_role") return refusal(reason, role, 403);
    if (reason === "suspended" || reason === "not_allowed") return refusal(reason, role, 403);
    return refusal(reason, role, 429);
  } catch (e) {
    console.error(`[protection] guard_action failed for ${action}: ${e instanceof Error ? e.message : String(e)}`);
    if (opts.role === "admin") return { ok: true, state: "warning", reason: "guard_unavailable" };
    return refusal("guard_unavailable", opts.role, 503);
  }
}

/** A Response for a refusal, in the function's own CORS headers. */
export function guardResponse(g: Extract<GuardOutcome, { ok: false }>, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(g.body), { status: g.status, headers: { ...headers, "Content-Type": "application/json" } });
}

/* The global mode for BACKGROUND work (the audit queue, the drip's audit-ahead, bulk jobs), which has no
   person to guard. Cached per isolate for MODE_CACHE_MS so a 30-second cron does not re-read it per row.
   ⛔ A failed read answers "running" — background client work must not stop because one read failed —
   EXCEPT that a cached all_stop is kept until a successful read says otherwise. */
const MODE_CACHE_MS = 15_000;
let modeCache: { mode: ProtectionMode; at: number } | null = null;

export async function paidMode(service: ServiceClient): Promise<ProtectionMode> {
  if (modeCache && Date.now() - modeCache.at < MODE_CACHE_MS) return modeCache.mode;
  try {
    const { data, error } = await service.from("protection_settings").select("mode").eq("id", 1).maybeSingle();
    if (error) throw new Error(String(error.message ?? error));
    const mode: ProtectionMode = isProtectionMode(data?.mode) ? data.mode : "running";
    modeCache = { mode, at: Date.now() };
    return mode;
  } catch (e) {
    console.warn(`[protection] mode read failed: ${e instanceof Error ? e.message : String(e)}`);
    return modeCache?.mode === "all_stop" ? "all_stop" : "running";
  }
}

/** A server-side refusal worth counting (admin-only function, someone else's lead). Best-effort: a failed
 *  record never changes the refusal the caller was already going to give. */
export async function recordDenial(service: ServiceClient, actorId: string | null | undefined, what: string, leadId?: string | null, detail?: Record<string, unknown>): Promise<void> {
  if (!actorId) return;
  try {
    await service.rpc("record_denial", {
      _actor: actorId, _what: what.slice(0, 80),
      _lead: typeof leadId === "string" && UUID_RE.test(leadId) ? leadId : null, _detail: detail ?? {},
    });
  } catch (e) {
    console.warn(`[protection] record_denial failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}

/** For a single-purpose, admin-pressed paid tool (review replies, the AI opener, SEO scans): a Response
 *  refusing it while the EMERGENCY STOP is on, else null. Only all_stop — "prospecting paused" never
 *  touches the admin's delivery tools. */
export async function allStopRefusal(service: ServiceClient, headers: Record<string, string>): Promise<Response | null> {
  if ((await paidMode(service)) !== "all_stop") return null;
  const detail = guardRefusalDetail("all_stop", "admin");
  return new Response(JSON.stringify({ ok: false, success: false, error: "all_stop", detail, message: detail }), {
    status: 423, headers: { ...headers, "Content-Type": "application/json" },
  });
}
