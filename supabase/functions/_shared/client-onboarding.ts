// client-onboarding — THE PAID CLIENT'S ONBOARDING LINK, DATABASE HALF (2026-10-07,
// docs/pre-sales-certification/sales-close-handoff-australia.md). The rules are src/lib/clientOnboardingForm.ts.
//
// Callers: fn paid-client-hub (admin: preview / make / revoke / share), fn client-onboarding (the public page:
// render and submit by token).
//
// ⛔ THE TOKEN IS THE ONLY KEY. 32 random bytes (64 hex), one row in client_onboarding_links, bound to ONE lead;
//    it reveals nothing but that client's business name and the questions; it cannot reach Paid Clients, any
//    other client, or any field outside the link's own question snapshot. Revocable (revoked_at); at most ONE
//    open link per client (partial unique index); a submitted link answers "Thanks, that's everything".
// ⛔ PAID CLIENTS ONLY, never an ended or refunded one — checked when the link is made AND when it is used.
// ⛔ NEVER OVERWRITES: answers land only in blank onboarding columns (planOnboardingWrite); anything else is a
//    conflict for Paul. Paul's confirmed facts (client_intake.overrides) are never asked and always win.
// ⛔ NO PAYMENT, NO MESSAGE from here. Sending is paid-client-hub's, under paymentLinkRoute's rule.
import { isPaidClient } from "../../../src/lib/paidClient.ts";
import { clientClosed } from "../../../src/lib/paymentState.ts";
import { serviceRouteForTotal, serviceRouteFromRow, type ServiceRoute } from "../../../src/lib/findableOffer.ts";
import { cleanOverrides, intakeCandidates, mergeClientProfile, type ProfileField } from "../../../src/lib/clientIntake.ts";
import {
  ONBOARDING_TOKEN_RE, columnsForAnswers, isGapQuestion, onboardingQuestionsFor, planOnboardingWrite, validateOnboarding,
  type KnownField, type OnbKey, type OnbQuestion, type OnboardingKnown,
} from "../../../src/lib/clientOnboardingForm.ts";
import { cleanCallNotes } from "../../../src/lib/quickClose.ts";
import { HANDOFF_GBP_CHECKLIST_KEY } from "../../../src/lib/handoffReadiness.ts";
import { loadIntakeSources, queueIntake } from "./client-intake.ts";
import { pickOnboarding, recordLeadEvent } from "./client-setup.ts";

// deno-lint-ignore no-explicit-any
type Service = any;
type Row = Record<string, unknown>;
const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

/** Every onboarding column the form reads or writes (all exist live — read back 2026-10-07). */
const ROW_COLUMNS =
  "id,lead_id,status,source,updated_at,created_at,business_name,business_website,confirmed_location,services,services_list,areas_list,areas_wanted," +
  "top_requests,contact_name,contact_email,confirmed_phone,website_platform,website_manager,website_manager_email,gbp_status,gbp_exists,domain_status," +
  "domain_owned,domain_access,domain_third_party,authority_confirmed,dns_permission,materials_confirmed,site_rights,photos_status,must_not_say," +
  "plan_tier,website_addon,quick_close";
export const LINK_COLUMNS = "id,lead_id,onboarding_id,route,questions,created_by,created_at,revoked_at,revoked_by,first_opened_at,last_opened_at,open_count,submitted_at,answers,conflicts,shared";

export interface OnboardingContext {
  lead: Row;
  row: Row | null;
  route: ServiceRoute | null;
  profile: ProfileField[];
  known: OnboardingKnown;
  questions: OnbQuestion[];
  /** Why no link can be made, when none can. */
  refusal: "not_paid" | "closed" | "no_route" | "no_onboarding_row" | null;
}

const fieldOf = (p: ProfileField[], key: string): KnownField | undefined => {
  const f = p.find((x) => x.key === key);
  return f ? { value: f.value, values: f.values, tier: f.tier, confirmed: f.status === "confirmed" } : undefined;
};

/** Everything the form decision needs — the SAME consolidated profile the Paid Client page shows. */
export async function loadOnboardingContext(service: Service, leadId: string): Promise<OnboardingContext | null> {
  const loaded = await loadIntakeSources(service, leadId);
  if (!loaded) return null;
  const lead = loaded.lead;
  const [{ data: rows, error }, { data: rec }] = await Promise.all([
    service.from("onboarding_responses").select(ROW_COLUMNS).eq("lead_id", leadId).order("updated_at", { ascending: false }).limit(10),
    service.from("client_intake").select("overrides").eq("lead_id", leadId).maybeSingle(),
  ]);
  if (error) throw error;
  const row = pickOnboarding((rows ?? []) as Row[]);
  const profile = mergeClientProfile(intakeCandidates(loaded.rows), cleanOverrides(rec?.overrides));
  const route = serviceRouteForTotal((lead.contract_total_payments as number | null) ?? null) ?? serviceRouteFromRow(row as never) ?? null;
  const qc = (row?.quick_close ?? null) as { answers?: { manager?: string }; call?: unknown } | null;
  const control = text(lead.website_control);
  const known: OnboardingKnown = {
    route, row,
    profile: {
      contact_name: fieldOf(profile, "contact_name"), email: fieldOf(profile, "email"), phone: fieldOf(profile, "phone"),
      town: fieldOf(profile, "town"), services: fieldOf(profile, "services"), service_areas: fieldOf(profile, "service_areas"), website: fieldOf(profile, "website"),
    },
    callJobs: cleanCallNotes(qc?.call).jobs ?? null,
    siteControlKnown: ["client_controls", "agency_controls"].includes(control) || ["owner", "employee", "agency", "third_party"].includes(text(qc?.answers?.manager)),
    gbpConfirmedByFindable: (lead.delivery_checklist as Row | null)?.[HANDOFF_GBP_CHECKLIST_KEY] === true,
    hasWebsite: !!(text(lead.website) || text(row?.business_website)),
  };
  const refusal = !isPaidClient(lead as never) ? "not_paid" : clientClosed(lead as never) ? "closed" : !route ? "no_route" : !row ? "no_onboarding_row" : null;
  return { lead, row, route, profile, known, questions: refusal ? [] : onboardingQuestionsFor(known), refusal };
}

export const ONBOARDING_REFUSAL_TEXT: Record<NonNullable<OnboardingContext["refusal"]>, string> = {
  not_paid: "Only a paying client gets the onboarding form.",
  closed: "This client's engagement has ended or was refunded — no onboarding form.",
  no_route: "This client's plan (Build or Optimise) isn't recorded yet — set it first, so the form asks the right questions.",
  no_onboarding_row: "This client has no onboarding record yet, so there is nowhere to save their answers.",
};

function newToken(): string {
  const b = new Uint8Array(32);
  crypto.getRandomValues(b);
  return [...b].map((x) => x.toString(16).padStart(2, "0")).join("");
}

/** The client's open link (not revoked, not submitted), if any. */
export async function openLinkFor(service: Service, leadId: string): Promise<Row | null> {
  const { data, error } = await service.from("client_onboarding_links").select(`${LINK_COLUMNS},token`).eq("lead_id", leadId)
    .is("revoked_at", null).is("submitted_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return (data ?? null) as Row | null;
}

/** Make (or reuse) the client's link. A fresh one replaces the open one (revoked). Never a second open link:
 *  the partial unique index decides a race, and the loser reads the winner back. */
export async function makeOnboardingLink(service: Service, leadId: string, actorId: string, opts: { fresh?: boolean } = {}):
  Promise<{ ok: true; link: Row; reused: boolean } | { ok: false; error: string; detail: string }> {
  const ctx = await loadOnboardingContext(service, leadId);
  if (!ctx) return { ok: false, error: "not_found", detail: "Client not found." };
  if (ctx.refusal) return { ok: false, error: ctx.refusal, detail: ONBOARDING_REFUSAL_TEXT[ctx.refusal] };
  if (!ctx.questions.some(isGapQuestion)) return { ok: false, error: "nothing_missing", detail: "Nothing is missing — there is nothing to ask this client." };
  const open = await openLinkFor(service, leadId);
  if (open && !opts.fresh) return { ok: true, link: open, reused: true };
  if (open) {
    const { error } = await service.from("client_onboarding_links").update({ revoked_at: new Date().toISOString(), revoked_by: actorId }).eq("id", open.id).is("revoked_at", null);
    if (error) throw error;
  }
  const { data, error } = await service.from("client_onboarding_links").insert({
    lead_id: leadId, onboarding_id: ctx.row!.id, token: newToken(), route: ctx.route, created_by: actorId,
    questions: ctx.questions.map((q) => ({ key: q.key, prefill: q.prefill, confirm: q.confirm })),
  }).select(`${LINK_COLUMNS},token`).maybeSingle();
  if (error) {
    if ((error as { code?: string }).code === "23505") {
      const winner = await openLinkFor(service, leadId);
      if (winner) return { ok: true, link: winner, reused: true };
    }
    throw error;
  }
  await recordLeadEvent(service, leadId, "onboarding_link_sent", { actor: actorId, source: "admin", body: `Onboarding link made — ${ctx.questions.length} question${ctx.questions.length === 1 ? "" : "s"} for the client`, data: { link_id: data.id, keys: ctx.questions.map((q) => q.key), fresh: !!open } });
  return { ok: true, link: data as Row, reused: false };
}

export async function revokeOnboardingLink(service: Service, leadId: string, actorId: string): Promise<boolean> {
  const { data, error } = await service.from("client_onboarding_links").update({ revoked_at: new Date().toISOString(), revoked_by: actorId })
    .eq("lead_id", leadId).is("revoked_at", null).is("submitted_at", null).select("id");
  if (error) throw error;
  return Array.isArray(data) && data.length > 0;
}

/* ══ THE PUBLIC SIDE (fn client-onboarding) ═══════════════════════════════════════════════════════ */

export type PublicLoad =
  | { kind: "unavailable" }
  | { kind: "submitted"; businessName: string }
  | { kind: "nothing"; businessName: string; link: Row }
  | { kind: "form"; businessName: string; link: Row; questions: OnbQuestion[]; row: Row | null };

/** The questions still to ask on this link: its snapshot, minus anything filled since (Paul confirmed it, the
 *  client answered elsewhere). Never a key that was not on the link. */
function stillAsked(link: Row, ctx: OnboardingContext): OnbQuestion[] {
  const snap = new Map<string, Row>(((link.questions ?? []) as Row[]).map((q) => [text(q.key), q]));
  return ctx.questions.filter((q) => snap.has(q.key)).map((q) => ({ ...q, prefill: q.prefill ?? (text(snap.get(q.key)?.prefill) || null) }));
}

export async function loadPublic(service: Service, token: string): Promise<PublicLoad> {
  if (!ONBOARDING_TOKEN_RE.test(token)) return { kind: "unavailable" };
  const { data: link, error } = await service.from("client_onboarding_links").select(LINK_COLUMNS).eq("token", token).maybeSingle();
  if (error) throw error;
  if (!link || link.revoked_at) return { kind: "unavailable" };
  const ctx = await loadOnboardingContext(service, String(link.lead_id));
  if (!ctx) return { kind: "unavailable" };
  const businessName = text(ctx.lead.business_name) || "your business";
  if (link.submitted_at) return { kind: "submitted", businessName };
  /* ⛔ Re-checked on every use: an ended / refunded client's link stops working. */
  if (ctx.refusal === "not_paid" || ctx.refusal === "closed") return { kind: "unavailable" };
  const questions = stillAsked(link as Row, ctx);
  if (!questions.length) return { kind: "nothing", businessName, link: link as Row };
  return { kind: "form", businessName, link: link as Row, questions, row: ctx.row };
}

export async function markOpened(service: Service, link: Row): Promise<void> {
  const now = new Date().toISOString();
  await service.from("client_onboarding_links").update({ first_opened_at: link.first_opened_at ?? now, last_opened_at: now, open_count: Number(link.open_count ?? 0) + 1 }).eq("id", link.id);
}

export type SubmitResult =
  | { kind: "unavailable" }
  | { kind: "submitted"; businessName: string }
  | { kind: "invalid"; businessName: string; questions: OnbQuestion[]; values: Partial<Record<OnbKey, string>>; errors: Partial<Record<OnbKey, string>> }
  | { kind: "saved"; businessName: string; written: string[]; conflicts: number };

/** Validate against the link's questions, write blank columns only, close the link once, tell Paul, re-run the
 *  intake. ⛔ The close is CONDITIONAL (submitted_at is null) — a double submit cannot write twice. */
export async function submitPublic(service: Service, token: string, raw: Record<string, string>): Promise<SubmitResult> {
  const p = await loadPublic(service, token);
  if (p.kind === "unavailable") return { kind: "unavailable" };
  if (p.kind === "submitted") return { kind: "submitted", businessName: p.businessName };
  const link = p.link;
  const questions = p.kind === "form" ? p.questions : [];
  const v = validateOnboarding(questions, raw, p.kind === "form" ? p.row : null);
  if (!v.ok) {
    const values: Partial<Record<OnbKey, string>> = {};
    for (const q of questions) if (typeof raw[q.key] === "string") values[q.key] = raw[q.key].slice(0, 2000);
    return { kind: "invalid", businessName: p.businessName, questions, values, errors: v.errors };
  }
  /* Claim the submission first: only one submit wins. */
  const now = new Date().toISOString();
  const { data: claimed, error: cErr } = await service.from("client_onboarding_links").update({ submitted_at: now, answers: v.answers })
    .eq("id", link.id).is("submitted_at", null).is("revoked_at", null).select("id");
  if (cErr) throw cErr;
  if (!Array.isArray(claimed) || !claimed.length) return { kind: "submitted", businessName: p.businessName };
  const onbId = String(link.onboarding_id ?? "");
  const { data: rowNow, error: rErr } = await service.from("onboarding_responses").select(ROW_COLUMNS).eq("id", onbId).maybeSingle();
  if (rErr) throw rErr;
  const plan = planOnboardingWrite((rowNow ?? {}) as Row, columnsForAnswers(v.answers));
  const written = Object.keys(plan.patch);
  if (rowNow && written.length) {
    const { error } = await service.from("onboarding_responses").update({ ...plan.patch, updated_at: now }).eq("id", onbId);
    if (error) {
      await service.from("client_error_reports").insert({ error_id: "client_onboarding_write_failed", context: { lead_id: link.lead_id, link_id: link.id, detail: error.message } });
      throw error;
    }
  }
  await service.from("client_onboarding_links").update({ conflicts: plan.conflicts }).eq("id", link.id);
  const leadId = String(link.lead_id);
  await recordLeadEvent(service, leadId, "onboarding_form_submitted", {
    source: "client", body: `The client sent their details${plan.conflicts.length ? ` — ${plan.conflicts.length} answer${plan.conflicts.length === 1 ? "" : "s"} differ from what's on file` : ""}`,
    data: { link_id: link.id, written, conflicts: plan.conflicts.map((c) => c.column) },
  });
  try {
    const { data: owner } = await service.from("team_members").select("user_id").eq("is_book_owner", true).limit(1).maybeSingle();
    if (owner?.user_id) {
      await service.rpc("notify_person", {
        _user: owner.user_id, _kind: "client_onboarding", _title: `CLIENT DETAILS IN · ${p.businessName}`.slice(0, 120),
        _body: plan.conflicts.length ? `${plan.conflicts.length} answer${plan.conflicts.length === 1 ? "" : "s"} differ from what's on file — review them.` : "Their answers are on the client record.",
        _link: `/paid-clients/${leadId}`, _lead: leadId, _dedupe: `client_onboarding:${link.id}`, _priority: plan.conflicts.length ? 2 : 1,
      });
    }
  } catch (e) { console.error("[client-onboarding] notice failed (non-blocking):", (e as Error)?.message ?? e); }
  /* The intake re-reads everything, so "Still needed" updates on its own (the cron picks it up within a minute). */
  try { await queueIntake(service, leadId, "rerun"); } catch (e) { console.error("[client-onboarding] intake not queued (non-blocking):", (e as Error)?.message ?? e); }
  return { kind: "saved", businessName: p.businessName, written, conflicts: plan.conflicts.length };
}
