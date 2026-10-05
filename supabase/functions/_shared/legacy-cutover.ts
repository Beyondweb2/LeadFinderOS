// _shared/legacy-cutover.ts — the I/O half of the legacy Findable checkout cutover (2026-10-05).
// The rules are src/lib/legacyCutover.ts; this lists Stripe's OPEN Checkout Sessions and ACTIVE Payment
// Links, reads the stored Quick Close links, and — only on EXECUTE with the reviewed plan hash — expires
// the legacy sessions and deactivates the Findable Payment Links. Nothing else is ever written to Stripe.
// ⛔ REPORT IS READ-ONLY. EXECUTE refuses unless the plan it would run is byte-for-byte the one reviewed.
// ⛔ Completed sessions (history) are never listed, never touched. Non-Findable objects are never touched.
import { sha256Hex } from "../../../src/lib/clientAgreement.ts";
import {
  buildCutoverPlan, cutoverReportText, planTargets, CUTOVER_CONFIRM_PHRASE,
  type CutoverPlan, type StoredQuickCloseLink, type StripePaymentLinkLite, type StripeSessionLite,
} from "../../../src/lib/legacyCutover.ts";

// deno-lint-ignore no-explicit-any
type Service = any;
type FetchLike = (url: string, init?: RequestInit) => Promise<Response>;

async function stripeGet(fetcher: FetchLike, secret: string, path: string): Promise<Record<string, unknown>> {
  const res = await fetcher(`https://api.stripe.com/v1/${path}`, { method: "GET", headers: { Authorization: `Bearer ${secret}` } });
  const text = await res.text();
  if (!res.ok) throw new Error(`Stripe GET ${path.split("?")[0]} failed: ${res.status} ${text.slice(0, 200)}`);
  return JSON.parse(text);
}
async function listAll<T extends { id: string }>(fetcher: FetchLike, secret: string, path: string): Promise<T[]> {
  const out: T[] = [];
  let after = "";
  for (let page = 0; page < 50; page++) {
    const sep = path.includes("?") ? "&" : "?";
    const j = await stripeGet(fetcher, secret, `${path}${sep}limit=100${after ? `&starting_after=${encodeURIComponent(after)}` : ""}`);
    const data = (j.data ?? []) as T[];
    out.push(...data);
    if (!j.has_more || data.length === 0) break;
    after = data[data.length - 1].id;
  }
  return out;
}

export interface CutoverReport { plan: CutoverPlan; planHash: string; text: string }

export async function cutoverReport(service: Service, opts: { fetcher?: FetchLike; secret: string }): Promise<CutoverReport> {
  const fetcher = opts.fetcher ?? ((u: string, i?: RequestInit) => fetch(u, i));
  const openSessions = await listAll<StripeSessionLite>(fetcher, opts.secret, "checkout/sessions?status=open");
  const links = await listAll<StripePaymentLinkLite & { line_items?: unknown }>(fetcher, opts.secret, "payment_links?active=true");
  const activeLinks: StripePaymentLinkLite[] = [];
  for (const l of links) {
    const li = await stripeGet(fetcher, opts.secret, `payment_links/${encodeURIComponent(l.id)}/line_items?limit=100`);
    activeLinks.push({ id: l.id, active: l.active ?? true, url: l.url ?? null, metadata: l.metadata ?? null, line_items: (li.data ?? []) as StripePaymentLinkLite["line_items"] });
  }
  const { data: qcRows, error } = await service.from("onboarding_responses")
    .select("id, lead_id, status, qc_url:quick_close->>link_url, qc_session:quick_close->>link_session_id, qc_kind:quick_close->>link_kind")
    .not("quick_close", "is", null).limit(5000);
  if (error) throw new Error(`could not read Quick Close rows: ${error.message}`);
  const quickClose: StoredQuickCloseLink[] = ((qcRows ?? []) as Array<{ id: string; lead_id: string | null; status: string | null; qc_url: string | null; qc_session: string | null; qc_kind: string | null }>)
    .map((r) => ({ onboarding_id: r.id, lead_id: r.lead_id, status: r.status, link_url: r.qc_url, link_session_id: r.qc_session, link_kind: r.qc_kind }));
  const plan = buildCutoverPlan({ openSessions, activeLinks, quickClose });
  const planHash = await sha256Hex(planTargets(plan));
  return { plan, planHash, text: cutoverReportText(plan, planHash) };
}

export type ExecuteOutcome =
  | { kind: "refused"; reason: string; report: CutoverReport }
  | { kind: "executed"; expired: Array<{ id: string; ok: boolean; detail: string }>; deactivated: Array<{ id: string; ok: boolean; detail: string }>; after: CutoverReport };

/** EXECUTE: only the plan Paul reviewed (same hash, confirm phrase). Then reports again. */
export async function executeCutover(service: Service, opts: { fetcher?: FetchLike; secret: string; planHash: string; confirm: string }): Promise<ExecuteOutcome> {
  const fetcher = opts.fetcher ?? ((u: string, i?: RequestInit) => fetch(u, i));
  const report = await cutoverReport(service, { fetcher, secret: opts.secret });
  if (opts.confirm !== CUTOVER_CONFIRM_PHRASE) return { kind: "refused", reason: `the confirm phrase must be exactly "${CUTOVER_CONFIRM_PHRASE}"`, report };
  if (opts.planHash !== report.planHash) return { kind: "refused", reason: "the plan changed since it was reviewed (new or closed objects) — read the new report and execute with its hash", report };
  const post = async (path: string, body?: URLSearchParams) => {
    const res = await fetcher(`https://api.stripe.com/v1/${path}`, { method: "POST", headers: { Authorization: `Bearer ${opts.secret}`, ...(body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}) }, ...(body ? { body: body.toString() } : {}) });
    const text = await res.text();
    return { ok: res.ok, detail: res.ok ? "done" : `${res.status} ${text.slice(0, 200)}` };
  };
  /* Links first: no NEW session can be opened from them while the open ones are being closed. */
  const deactivated = [];
  for (const l of report.plan.deactivateLinks) deactivated.push({ id: l.id, ...(await post(`payment_links/${encodeURIComponent(l.id)}`, new URLSearchParams({ active: "false" }))) });
  const expired = [];
  for (const s of report.plan.expireSessions) expired.push({ id: s.id, ...(await post(`checkout/sessions/${encodeURIComponent(s.id)}/expire`)) });
  try {
    await service.from("client_error_reports").insert({ error_id: "legacy_checkout_cutover_executed", context: { plan_hash: report.planHash, expired, deactivated } });
  } catch { /* the outcome is returned either way */ }
  const after = await cutoverReport(service, { fetcher, secret: opts.secret });
  return { kind: "executed", expired, deactivated, after };
}
