// link-template-vars — THE VARIABLES OF findable_signup_link / findable_onboarding, RESOLVED SERVER-SIDE
// (2026-10-07, docs/pre-sales-certification/sales-close-handoff-australia.md). Read by send-whatsapp-message only.
//
// ⛔ NEVER FROM THE BROWSER. {{2}} is the link stored for THIS lead:
//    · findable_signup_link — the prospect's CURRENT, USABLE sign-up link from Quick Close (quick_close.link_url,
//      link_kind 'signup', linkUsable): findable.live/agree/<token>, which leads sign-up → agreement → Stripe.
//      A stored Stripe checkout URL is never usable (linkUsable) and fails the shape check anyway.
//    · findable_onboarding — the PAID client's OPEN onboarding-form link (client_onboarding_links: not revoked,
//      not submitted): findable.live/details/<token>. No payment on it.
// ⛔ Each refuses (ok:false with a reason) rather than returning a partial: a template whose whole point is the
//    link is spam without the right one.
import { isPaidClient } from "../../../src/lib/paidClient.ts";
import { clientClosed } from "../../../src/lib/paymentState.ts";
import { linkUsable, quickCloseClosedRefusal, type QuickCloseRecord } from "../../../src/lib/quickClose.ts";
import { displayBusinessName } from "../../../src/lib/displayName.ts";
import { onboardingFormUrl } from "../../../src/lib/clientOnboardingForm.ts";
import { isOnboardingFormUrl, isSignupLinkUrl, linkTemplateGreeting } from "../../../src/lib/whatsappLinkTemplates.ts";

// deno-lint-ignore no-explicit-any
type Service = any;
type Row = Record<string, unknown>;
const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export type LinkVars = { ok: true; greeting: string; url: string; business: string } | { ok: false; reason: string };

async function leadAndRows(service: Service, leadId: string) {
  const [{ data: lead, error }, { data: rows, error: rErr }] = await Promise.all([
    service.from("outreach_leads").select("id,business_name,contact_name,derived_town,amount_paid,status,service_terminated_at").eq("id", leadId).maybeSingle(),
    service.from("onboarding_responses").select("id,status,source,contact_name,quick_close,created_at").eq("lead_id", leadId).order("created_at", { ascending: false }).limit(10),
  ]);
  if (error) throw error;
  if (rErr) throw rErr;
  return { lead: (lead ?? null) as Row | null, rows: ((rows ?? []) as Row[]).filter((r) => text(r.source) !== "free_check") };
}

const greetingFor = (lead: Row, row: Row | null) =>
  linkTemplateGreeting(text(row?.contact_name) || text(lead.contact_name), displayBusinessName(text(lead.business_name), { town: text(lead.derived_town), style: "greet" }));

export async function resolveSignupLinkVars(service: Service, leadId: string): Promise<LinkVars> {
  const { lead, rows } = await leadAndRows(service, leadId);
  if (!lead) return { ok: false, reason: "Lead not found." };
  const closed = quickCloseClosedRefusal(lead as never, null);
  if (closed) return { ok: false, reason: closed.detail };
  /* The sign-up being closed: the newest unpaid row that holds a usable sign-up link. */
  const row = rows.find((r) => text(r.status) !== "paid" && linkUsable((r.quick_close ?? null) as QuickCloseRecord | null)) ?? null;
  const url = text((row?.quick_close as QuickCloseRecord | null)?.link_url);
  if (!row || !isSignupLinkUrl(url)) return { ok: false, reason: "There is no usable sign-up link for this lead — create it in Quick Close first." };
  return { ok: true, greeting: greetingFor(lead, row), url, business: text(lead.business_name) };
}

export async function resolveOnboardingFormVars(service: Service, leadId: string): Promise<LinkVars> {
  const { lead, rows } = await leadAndRows(service, leadId);
  if (!lead) return { ok: false, reason: "Client not found." };
  if (!isPaidClient(lead as never) || clientClosed(lead as never)) return { ok: false, reason: "The onboarding form is only for a current paying client." };
  const { data: link, error } = await service.from("client_onboarding_links").select("token").eq("lead_id", leadId)
    .is("revoked_at", null).is("submitted_at", null).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  const url = link?.token ? onboardingFormUrl(String(link.token)) : "";
  if (!isOnboardingFormUrl(url)) return { ok: false, reason: "There is no open onboarding link for this client — make it on their Paid Client page first." };
  const row = rows.find((r) => text(r.status) === "paid") ?? rows[0] ?? null;
  return { ok: true, greeting: greetingFor(lead, row), url, business: text(lead.business_name) };
}
