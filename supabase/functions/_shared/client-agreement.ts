// _shared/client-agreement.ts — the agreement evidence, PDF and email, shared by client-agreement (the
// agreement page) and stripe-webhook (the checkout tick). One writer of each thing.
//
// ⛔ client_agreement_acceptances IS WRITE-ONCE (DB trigger refuses UPDATE/DELETE/TRUNCATE). Only INSERT.
// ⛔ THE ROW IS STORED BEFORE ANY EMAIL; a failed email is reported, never fatal.
import * as PDFLib from "npm:pdf-lib@1.17.1";
import {
  acceptanceRowFrom, renderAgreementText, sha256Hex, versionTemplateText,
  AGREEMENT_COPY_TO_PAUL, CLIENT_AGREEMENT_TITLE, CLIENT_AGREEMENT_VERSION, ukDateTime,
  type AgreementAcceptanceRow, type AgreementRoute,
} from "../../../src/lib/clientAgreement.ts";
import { buildAgreementPdf } from "../../../src/lib/agreementPdf.ts";
import { qaEmailHold } from "./qa-guard.ts";

// deno-lint-ignore no-explicit-any
type Service = any;

export const AGREEMENT_FROM = "Findable <alerts@findable.live>";
export const ACCEPTANCE_COLUMNS =
  "id,lead_id,business_name,service_route,agreement_version,agreed_text,agreed_text_sha256,method,legal_business_name,company_number,typed_name,typed_role,business_address,email,phone,website_domain,accepted_at,ip_address,user_agent,stripe_session_id,onboarding_id,authority_confirmed,marketing_opt_out,commercial_terms";

export async function reportAgreementError(service: Service, errorId: string, message: string, context: Record<string, unknown>) {
  try { await service.from("client_error_reports").insert({ error_id: errorId, message: String(message).slice(0, 1000), context }); } catch { /* never throws */ }
}

/** The version row exists exactly once; a different template under the same id is a hard stop. */
export async function ensureAgreementVersion(service: Service, version: string = CLIENT_AGREEMENT_VERSION): Promise<void> {
  const template = versionTemplateText(version);
  const sha = await sha256Hex(template);
  const { data, error } = await service.from("client_agreement_versions").select("template_sha256").eq("version", version).maybeSingle();
  if (error) throw error;
  if (data) {
    if (data.template_sha256 !== sha) throw new Error(`agreement version ${version} text differs from the stored version - publish a new version`);
    return;
  }
  const { error: insErr } = await service.from("client_agreement_versions")
    .insert({ version, title: CLIENT_AGREEMENT_TITLE, body_template: template, template_sha256: sha });
  if (insErr && insErr.code !== "23505") throw insErr;   // a concurrent first acceptance already wrote it
}

function b64(bytes: Uint8Array): string {
  let s = ""; const CH = 0x8000;
  for (let i = 0; i < bytes.length; i += CH) s += String.fromCharCode(...bytes.subarray(i, i + CH));
  return btoa(s);
}

/** The PDF of one stored acceptance, rebuilt from the record itself. */
export async function agreementPdfForRow(row: AgreementAcceptanceRow & { accepted_at: string }): Promise<Uint8Array> {
  return await buildAgreementPdf(PDFLib, {
    businessName: row.business_name, route: row.service_route,
    legalName: row.legal_business_name, companyNumber: row.company_number, contactName: row.typed_name, role: row.typed_role,
    address: row.business_address, email: row.email, phone: row.phone, websiteDomain: row.website_domain,
  }, { method: row.method, acceptedAtIso: row.accepted_at, version: row.agreement_version, sha256: row.agreed_text_sha256 });
}

/** Email the signed PDF. `to` always includes Paul's copy (AGREEMENT_COPY_TO_PAUL). */
export async function emailSignedAgreement(args: {
  clientEmail: string | null; businessName: string; acceptedAtIso: string; pdf: Uint8Array; method: "checkout" | "agree_page";
}): Promise<{ ok: boolean; detail: string; to: string[]; messageId: string | null }> {
  const to = [...new Set([args.clientEmail, AGREEMENT_COPY_TO_PAUL].filter((x): x is string => !!x))];
  const key = Deno.env.get("RESEND_API_KEY");
  if (!key) return { ok: false, detail: "RESEND_API_KEY not set", to, messageId: null };
  const when = ukDateTime(args.acceptedAtIso);
  const how = args.method === "checkout" ? "at checkout" : "on your agreement page";
  const text = [
    "Hello,",
    "",
    `Thank you. This is your copy of the Findable Client Service Agreement for ${args.businessName}, accepted ${how} on ${when}.`,
    "",
    "The attached PDF is exactly what was agreed. Please keep it for your records.",
    "",
    "Any questions, just reply to this email.",
    "",
    "Paul",
    "Findable",
  ].join("\n");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from: AGREEMENT_FROM, to, reply_to: AGREEMENT_COPY_TO_PAUL,
      subject: `Your Findable Client Service Agreement - ${args.businessName}`,
      text,
      attachments: [{ filename: `Findable Client Service Agreement - ${args.businessName.replace(/[\\/:*?"<>|]/g, "")}.pdf`, content: b64(args.pdf) }],
    }),
  });
  const body = await res.text();
  let messageId: string | null = null;
  try { messageId = res.ok ? String((JSON.parse(body) as { id?: unknown }).id ?? "") || null : null; } catch { /* kept as detail */ }
  return { ok: res.ok, detail: res.ok ? body.slice(0, 200) : `${res.status} ${body.slice(0, 300)}`, to, messageId };
}

/** Record what the email provider answered for one acceptance's copy (client_agreement_emails). Never
 *  throws. ⛔ 'sent' only when Resend accepted it — a copy is never claimed as sent on a guess. */
export async function logAgreementEmail(service: Service, acceptanceId: string | null, leadId: string, recipients: string[], status: "sent" | "failed" | "refused", detail: string | null, messageId: string | null): Promise<void> {
  if (!acceptanceId) return;
  try {
    const { error } = await service.from("client_agreement_emails").insert({ acceptance_id: acceptanceId, lead_id: leadId, recipients, status, detail: detail ? detail.slice(0, 500) : null, provider_message_id: messageId });
    if (error) console.error(`[client-agreement] email log not written: ${error.message}`);
  } catch (e) { console.error("[client-agreement] email log not written:", (e as Error).message); }
}

/** Store the row, then email the PDF. Returns the stored time and who was emailed (null on email failure). */
export async function storeAndSendAcceptance(service: Service, row: AgreementAcceptanceRow): Promise<{ acceptedAt: string; emailedTo: string[] | null; duplicate: boolean; acceptanceId: string | null }> {
  await ensureAgreementVersion(service, row.agreement_version);
  const { data: saved, error } = await service.from("client_agreement_acceptances").insert(row).select("id, accepted_at").single();
  if (error) {
    if (error.code === "23505") return { acceptedAt: "", emailedTo: null, duplicate: true, acceptanceId: null };  // the same session / sign-up again
    throw error;
  }
  const acceptedAt = (saved as { accepted_at: string }).accepted_at;
  const acceptanceId = String((saved as { id?: string }).id ?? "") || null;
  let emailedTo: string[] | null = null;
  try {
    /* ⛔ QA BACKSTOP (2026-10-04): a test lead's signed copy is never emailed to a non-sink address —
       refused and recorded, not redirected. The agree page refuses earlier; the checkout path is gated by
       the payment simulation. A failed read throws into the catch below: nothing is sent. */
    const qaRefusal = await qaEmailHold(service, row.lead_id, row.email ?? null);
    if (qaRefusal) {
      await reportAgreementError(service, "agreement_copy_email_qa_refused", qaRefusal, { lead_id: row.lead_id, method: row.method });
      await logAgreementEmail(service, acceptanceId, row.lead_id, [row.email ?? ""].filter(Boolean), "refused", qaRefusal, null);
    } else {
      const pdf = await agreementPdfForRow({ ...row, accepted_at: acceptedAt });
      const sent = await emailSignedAgreement({ clientEmail: row.email, businessName: row.business_name, acceptedAtIso: acceptedAt, pdf, method: row.method });
      if (sent.ok) emailedTo = sent.to;
      else await reportAgreementError(service, "agreement_copy_email_failed", sent.detail, { lead_id: row.lead_id, method: row.method });
      await logAgreementEmail(service, acceptanceId, row.lead_id, sent.to, sent.ok ? "sent" : "failed", sent.detail, sent.messageId);
    }
  } catch (e) {
    await reportAgreementError(service, "agreement_copy_email_failed", e instanceof Error ? e.message : JSON.stringify(e), { lead_id: row.lead_id, method: row.method });
    await logAgreementEmail(service, acceptanceId, row.lead_id, [row.email ?? ""].filter(Boolean), "failed", e instanceof Error ? e.message : "error", null);
  }
  return { acceptedAt, emailedTo, duplicate: false, acceptanceId };
}

/* ══ THE CHECKOUT TICK ═══════════════════════════════════════════════════════════════════════════
   Called by stripe-webhook on checkout.session.completed. Binding on its own (Paul, 2026-10-02).
   Stripe gives no IP, browser or role; the record holds what Stripe does give — the name and email
   from the payment form and the session id — plus the exact text, filled with those.
   ⛔ POSITIVE MATCH: only when Stripe says consent.terms_of_service === "accepted". */
export async function recordCheckoutAcceptance(service: Service, session: {
  id: string; consent?: { terms_of_service?: string | null } | null;
  customer_details?: { name?: string | null; email?: string | null } | null;
  metadata?: Record<string, string | undefined> | null;
}, lead: { id: string; business_name: string | null }): Promise<void> {
  try {
    if (session?.consent?.terms_of_service !== "accepted") return;
    const route = session.metadata?.service_route;
    if (route !== "build" && route !== "optimise") {
      await reportAgreementError(service, "agreement_checkout_no_route", "checkout consent with no route on the session", { session_id: session.id, lead_id: lead.id });
      return;
    }
    const fill = {
      businessName: String(lead.business_name ?? "").trim() || "your business",
      route: route as AgreementRoute,
      contactName: session.customer_details?.name ?? null,
      email: (session.customer_details?.email ?? "").toLowerCase() || null,
    };
    /* ⛔ The version the SESSION was created under (its metadata), never "whatever is current now" — a
       version change between the session and this webhook must not record the wrong text. Only legacy
       (pre-v3) sessions reach here; v3 has no checkout tick. */
    const version = session.metadata?.agreement_version === "v1" ? "v1" : null;
    if (!version) {
      await reportAgreementError(service, "agreement_checkout_unknown_version", "checkout consent on a session with no legacy agreement version", { session_id: session.id, lead_id: lead.id, version: session.metadata?.agreement_version ?? null });
      return;
    }
    const agreedText = renderAgreementText(fill, version);
    const row = acceptanceRowFrom({
      leadId: lead.id, fill, method: "checkout", agreedText, sha256: await sha256Hex(agreedText),
      stripeSessionId: session.id, version,
    });
    await storeAndSendAcceptance(service, row);
  } catch (e) {
    await reportAgreementError(service, "agreement_checkout_record_failed", e instanceof Error ? e.message : JSON.stringify(e), { session_id: session?.id, lead_id: lead?.id });
  }
}
