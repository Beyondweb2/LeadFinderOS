// welcome-pack-vars — THE THREE VARIABLES OF welcome_pack_ready, RESOLVED SERVER-SIDE (2026-10-29).
//
// {{1}} the client's first name (the paid sign-up's contact, else the lead's), else "there";
// {{2}} the business name; {{3}} their pack link findable.live/w/<short code> — from the lead's OWN baseline only
// (welcomePackReadiness: the same rule the hub's Stage 2 pill and the public /w/ page use). Nothing comes from the caller.
// ⛔ A current PAYING client only: not paid, ended or refunded refuses. A pack that is not ready or has no public link refuses.
import { welcomePackReadiness, welcomePackUrl } from "../../../src/lib/welcomePackData.ts";
import { isWelcomePackUrl, welcomePackGreeting } from "../../../src/lib/welcomePackWhatsApp.ts";
import { carriesMoney, clientClosed } from "../../../src/lib/paymentState.ts";

// deno-lint-ignore no-explicit-any
type Service = any;
export type WelcomePackVars = { ok: true; greeting: string; business: string; url: string } | { ok: false; reason: string };
const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

export async function resolveWelcomePackVars(service: Service, leadId: string): Promise<WelcomePackVars> {
  const { data: lead, error } = await service.from("outreach_leads")
    .select("id,business_name,contact_name,amount_paid,status,service_terminated_at,baseline_audit_id").eq("id", leadId).maybeSingle();
  if (error) throw error;
  if (!lead) return { ok: false, reason: "Client not found." };
  if (!carriesMoney(lead) || clientClosed(lead)) return { ok: false, reason: "The welcome pack is only for a current paying client." };
  const business = text(lead.business_name);
  if (!business) return { ok: false, reason: "This client has no business name." };
  const { data: audit, error: aErr } = lead.baseline_audit_id
    ? await service.from("ai_audits").select("id,audit_purpose,baseline_completed_at,short_code").eq("id", lead.baseline_audit_id).maybeSingle()
    : { data: null, error: null };
  if (aErr) throw aErr;
  const ready = welcomePackReadiness({ baseline_audit_id: lead.baseline_audit_id }, audit);
  if (ready.state !== "ready" || !ready.canShare || !ready.shortCode) return { ok: false, reason: "This client's welcome pack is not ready, or has no public link." };
  const url = welcomePackUrl(ready.shortCode);
  if (!isWelcomePackUrl(url)) return { ok: false, reason: "This client's welcome pack link is not in the expected form." };
  const { data: ob } = await service.from("onboarding_responses").select("contact_name")
    .eq("lead_id", leadId).eq("status", "paid").order("updated_at", { ascending: false }).limit(1).maybeSingle();
  return { ok: true, greeting: welcomePackGreeting(text(ob?.contact_name) || text(lead.contact_name)), business, url };
}
