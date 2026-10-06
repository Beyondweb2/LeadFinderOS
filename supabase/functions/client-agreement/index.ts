// client-agreement — PUBLIC agreement page + e-signature (Paul, 2026-10-02; v3 sign-up 2026-10-05).
//
//   GET  ?token=<64 hex>          → the client's agreement page (sign / accepted + pay / not ready)
//   POST ?token=<64 hex>          → form-encoded: the signature (default) or action=pay
//   GET  ?token=<64 hex>&pdf=1    → the signed PDF of the latest agreement-page acceptance
//   GET  ?view=blank              → the general agreement (Stripe's Terms of Service URL)
//
// 🔴 v3 — THIS PAGE IS THE CLIENT'S SIGN-UP (clause 1.2: "before you make your initial payment").
//   · The sign-up it signs for is the lead's CURRENT UNPAID onboarding row (Quick Close's or the
//     questionnaire's), carried through the form as `s` and re-checked on every POST: a signature binds
//     to exactly one sign-up, and only that sign-up can pay on it (src/lib/signupGate.ts).
//   · After signing, "Continue to secure payment" (action=pay) asks findable-checkout — the ONLY creator
//     of Stripe sessions, which refuses without this signature — and answers with a page that forwards
//     to Stripe. findable.live's proxy forwards only the token and the body and passes HTML through, so
//     there is no query string and no redirect to lose.
//   · A paid client with no open sign-up (a legacy client — MCL, Ronnie) keeps the post-payment v1 flow
//     they were sent before v3: their own agreement version, never v3's terms.
// ⛔ THE ADDRESS A HUMAN SEES IS findable.live/agree/<token> (findable-site functions/agree/[token].ts
//    proxies here and forwards the visitor's IP as x-findable-client-ip).
// ⛔ THE EVIDENCE ROW IS WRITE-ONCE (_shared/client-agreement.ts). The exact text agreed and its SHA-256
//    are stored on the row, so the record proves itself.
// ⛔ ONE REFUSAL FOR A BAD TOKEN. An unknown token gets the same page whatever is wrong with it.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { acceptanceRowFrom, agreePageMissing, CLIENT_AGREEMENT_VERSION, renderAgreementText, sha256Hex, type AgreementFill, type AgreementRoute, type AgreementAcceptanceRow } from "../../../src/lib/clientAgreement.ts";
import { agreementPageHtml, agreementUnavailableHtml, type AgreementFormValues } from "../../../src/lib/agreementPageHtml.ts";
import { resolveAgreementRoute } from "../../../src/lib/agreementRoute.ts";
import { clientClosed } from "../../../src/lib/paymentState.ts";
import { serviceRouteFromRow } from "../../../src/lib/findableOffer.ts";
import { COMMERCIAL_TERMS_CURRENT } from "../../../src/lib/clientTimeline.ts";
import { ACCEPTANCE_COLUMNS, agreementPdfForRow, reportAgreementError, storeAndSendAcceptance } from "../_shared/client-agreement.ts";
import { qaEmailHold } from "../_shared/qa-guard.ts";

// deno-lint-ignore no-explicit-any
type Service = any;

const TOKEN_RE = /^[0-9a-f]{64}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_FIELD = 300;
const LEAD_COLUMNS = "id,business_name,email,phone,website,address,contract_total_payments,service_terminated_at,status,amount_paid";

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "x-robots-tag": "noindex, nofollow, noarchive, nosnippet",
      "cache-control": "no-store",
    },
  });
}
const unavailable = () => html(agreementUnavailableHtml(), 404);
const clip = (v: unknown) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, MAX_FIELD);

/** The link row + the lead + the route it is agreed on. null = unknown token. */
async function resolve(service: Service, token: string) {
  const { data: link, error } = await service.from("client_agreement_links").select("lead_id,service_route").eq("token", token).maybeSingle();
  if (error) throw error;
  if (!link) return null;
  const { data: lead, error: leadErr } = await service.from("outreach_leads").select(LEAD_COLUMNS).eq("id", link.lead_id).maybeSingle();
  if (leadErr) throw leadErr;
  if (!lead) return null;
  /* ⛔ WHAT THE CLIENT PAID ON OUTRANKS THE LINK (pre-sales fix 03, src/lib/agreementRoute.ts). */
  const route: AgreementRoute | null = resolveAgreementRoute(link.service_route, lead.contract_total_payments);
  return { lead, route, businessName: clip(lead.business_name) || "your business" };
}

/** THE OPEN SIGN-UP: the lead's newest onboarding row that has not been paid. Its route (plan_tier) is
 *  what will be charged, so it is what is signed. null = nothing to sign up for. */
async function openSignup(service: Service, leadId: string): Promise<{ id: string; route: AgreementRoute | null; contactName: string | null; contactEmail: string | null } | null> {
  const { data, error } = await service.from("onboarding_responses").select("id,status,plan_tier,website_addon,contact_name,contact_email,created_at")
    .eq("lead_id", leadId).neq("status", "paid").order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  if (!data) return null;
  return { id: String(data.id), route: serviceRouteFromRow(data), contactName: data.contact_name ?? null, contactEmail: data.contact_email ?? null };
}

async function latestPageAcceptance(service: Service, leadId: string): Promise<(AgreementAcceptanceRow & { accepted_at: string }) | null> {
  const { data, error } = await service.from("client_agreement_acceptances").select(ACCEPTANCE_COLUMNS)
    .eq("lead_id", leadId).eq("method", "agree_page").order("accepted_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

/** The v3 signature for ONE sign-up (one per sign-up by unique index). */
async function signupAcceptance(service: Service, leadId: string, signupId: string): Promise<(AgreementAcceptanceRow & { accepted_at: string }) | null> {
  const { data, error } = await service.from("client_agreement_acceptances").select(ACCEPTANCE_COLUMNS)
    .eq("lead_id", leadId).eq("onboarding_id", signupId).eq("agreement_version", CLIENT_AGREEMENT_VERSION)
    .order("accepted_at", { ascending: false }).limit(1).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

function clientIp(req: Request): string | null {
  return clip(req.headers.get("x-findable-client-ip") || (req.headers.get("x-forwarded-for") || "").split(",")[0]) || null;
}

const LABELS: Record<string, string> = {
  legalName: "Legal name of the business", contactName: "Your full name", role: "Your role",
  address: "Business address", email: "Email for notices", phone: "Phone",
};

/** The words for a checkout refusal, shown on the page (never a raw code). */
const PAY_REFUSAL: Record<string, string> = {
  already_client: "This business has already paid. If you think that is wrong, email paul@findable.live.",
  route_undecided: "Your sign-up does not say which service you chose yet. Your salesperson or Paul will fix this and send the link again.",
  needs_trade: "We need one more detail about your business before you can pay. Paul will be in touch.",
  domain_unresolved: "We need to check who controls your website domain before you pay. Paul will be in touch.",
  cannot_serve: "We cannot take payment for this website set-up yet. Paul will be in touch.",
  agreement_unavailable: "The payment page could not be opened just now. Please try again in a minute.",
  payment_held: "A payment from you is already with us and Paul is reviewing it, so we will not take another. He will be in touch.",
};

Deno.serve(async (req) => {
  const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
  try {
    const url = new URL(req.url);
    if (req.method === "GET" && url.searchParams.get("view") === "blank") return html(agreementPageHtml({ mode: "blank" }));

    const token = String(url.searchParams.get("token") || "").trim().toLowerCase();
    if (!TOKEN_RE.test(token)) return unavailable();
    const ctx = await resolve(service, token);
    if (!ctx) return unavailable();
    const pdfHref = "?pdf=1";

    if (req.method === "GET" && url.searchParams.get("pdf") === "1") {
      const row = await latestPageAcceptance(service, ctx.lead.id);
      if (!row) return unavailable();
      return new Response(await agreementPdfForRow(row), {
        headers: {
          "content-type": "application/pdf",
          "content-disposition": `attachment; filename="Findable Client Service Agreement.pdf"`,
          "cache-control": "no-store", "x-robots-tag": "noindex",
        },
      });
    }

    const closed = clientClosed(ctx.lead);
    const signup = closed ? null : await openSignup(service, ctx.lead.id);
    const form = req.method === "POST" ? new URLSearchParams(await req.text()) : null;

    /* ══ THE v3 SIGN-UP ══════════════════════════════════════════════════════════════════════════════ */
    if (signup) {
      if (!signup.route) return html(agreementPageHtml({ mode: "not_ready", businessName: ctx.businessName }));
      const signed = await signupAcceptance(service, ctx.lead.id, signup.id);
      /* A POST must be for THIS sign-up: a stale tab from an older sign-up never signs or pays for this one. */
      if (form && clip(form.get("s")) !== signup.id) {
        return html(agreementPageHtml({ mode: "not_ready", businessName: ctx.businessName, message: "This page is out of date — your sign-up has changed. Please open your link again." }), 409);
      }

      if (signed) {
        if (signed.service_route !== signup.route) {
          /* The sign-up's service changed after it was signed: never pay on a signature for the other one. */
          return html(agreementPageHtml({ mode: "not_ready", businessName: ctx.businessName, message: "Your chosen service changed after you signed, so payment cannot open on this signature. Paul will send you a fresh link." }));
        }
        let payError: string | null = null;
        if (form && form.get("action") === "pay") {
          /* ⛔ THE ONE CHECKOUT, server to server. It re-runs every refusal and the agreement gate itself. */
          const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
          const res = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/findable-checkout`, {
            method: "POST",
            headers: { apikey: anon, Authorization: `Bearer ${anon}`, "Content-Type": "application/json", origin: "https://findable.live" },
            body: JSON.stringify({ onboarding_id: signup.id, lead_id: ctx.lead.id, purpose: "pay" }),
          });
          const out = await res.json().catch(() => ({})) as { ok?: boolean; url?: string; kind?: string; error?: string; refusal?: string };
          if (res.ok && out.ok && typeof out.url === "string" && /^https:\/\/checkout\.stripe\.com\//.test(out.url)) {
            return html(agreementPageHtml({ mode: "redirect", url: out.url }));
          }
          await reportAgreementError(service, "agreement_pay_refused", String(out.error ?? out.kind ?? res.status), { lead_id: ctx.lead.id, onboarding_id: signup.id, refusal: out.refusal ?? null });
          payError = PAY_REFUSAL[String(out.error ?? "")] ?? "The payment page could not be opened. Please try again, or email paul@findable.live.";
        }
        return html(agreementPageHtml({
          mode: "accepted", businessName: ctx.businessName, acceptedAtIso: signed.accepted_at, acceptedBy: signed.typed_name ?? "", pdfHref,
          payFor: { signupId: signup.id, route: signup.route }, payError,
        }));
      }

      if (!form) {
        const values: AgreementFormValues = {
          email: clip(signup.contactEmail || ctx.lead.email), phone: clip(ctx.lead.phone), address: clip(ctx.lead.address),
          contactName: clip(signup.contactName),
          websiteDomain: clip(ctx.lead.website).replace(/^https?:\/\//, "").replace(/\/$/, ""),
        };
        return html(agreementPageHtml({ mode: "sign", businessName: ctx.businessName, route: signup.route, values, errors: [], signupId: signup.id }));
      }
      if (form.get("action") === "pay") {
        return html(agreementPageHtml({ mode: "not_ready", businessName: ctx.businessName, message: "Please sign the agreement first — payment opens straight after." }), 409);
      }
      const values = readForm(form);
      const fill: AgreementFill = { businessName: ctx.businessName, route: signup.route, ...values };
      const errors = await signatureErrors(service, ctx.lead.id, fill, values);
      if (!values.authority) errors.push("Please confirm you have authority to sign for the business.");
      if (errors.length) return html(agreementPageHtml({ mode: "sign", businessName: ctx.businessName, route: signup.route, values, errors, signupId: signup.id }), 422);
      const agreedText = renderAgreementText(fill, CLIENT_AGREEMENT_VERSION);
      const row = acceptanceRowFrom({
        leadId: ctx.lead.id, fill, method: "agree_page", agreedText, sha256: await sha256Hex(agreedText), version: CLIENT_AGREEMENT_VERSION,
        ip: clientIp(req), userAgent: req.headers.get("user-agent")?.slice(0, 500) ?? null,
        v3: { onboardingId: signup.id, authorityConfirmed: true, marketingOptOut: values.marketingOptOut === true, commercialTerms: COMMERCIAL_TERMS_CURRENT },
      });
      const stored = await storeAndSendAcceptance(service, row);
      /* A double submit: the first signature stands (unique per sign-up); show it. */
      const winner = stored.duplicate ? await signupAcceptance(service, ctx.lead.id, signup.id) : null;
      return html(agreementPageHtml({
        mode: "accepted", businessName: ctx.businessName,
        acceptedAtIso: winner?.accepted_at ?? stored.acceptedAt, acceptedBy: winner?.typed_name ?? values.contactName!, pdfHref,
        justSigned: !winner, emailedTo: stored.emailedTo ? values.email! : null,
        payFor: { signupId: signup.id, route: signup.route },
      }));
    }

    /* ══ NO OPEN SIGN-UP: an existing (paid) client, or nothing to sign up for ═══════════════════════ */
    const existing = await latestPageAcceptance(service, ctx.lead.id);
    if (existing) {
      return html(agreementPageHtml({ mode: "accepted", businessName: ctx.businessName, acceptedAtIso: existing.accepted_at, acceptedBy: existing.typed_name ?? "", pdfHref, paid: Number(ctx.lead.amount_paid ?? 0) > 0 }));
    }
    /* ⛔ NO NEW SIGNATURE FOR A CLOSED CLIENT (pre-sales fix 03). */
    if (!ctx.route || closed) return html(agreementPageHtml({ mode: "not_ready", businessName: ctx.businessName }));
    /* A paid client from before v3 signs the agreement they bought under (v1, post-payment) — never v3's
       terms, which apply only to sales made on them (Paul: prospective unless he migrates someone). */
    const LEGACY_VERSION = "v1";
    if (!form) {
      const values: AgreementFormValues = {
        email: clip(ctx.lead.email), phone: clip(ctx.lead.phone), address: clip(ctx.lead.address),
        websiteDomain: clip(ctx.lead.website).replace(/^https?:\/\//, "").replace(/\/$/, ""),
      };
      return html(agreementPageHtml({ mode: "sign", businessName: ctx.businessName, route: ctx.route, values, errors: [], version: LEGACY_VERSION }));
    }
    const values = readForm(form);
    const fill: AgreementFill = { businessName: ctx.businessName, route: ctx.route, ...values };
    const errors = await signatureErrors(service, ctx.lead.id, fill, values);
    if (errors.length) return html(agreementPageHtml({ mode: "sign", businessName: ctx.businessName, route: ctx.route, values, errors, version: LEGACY_VERSION }), 422);
    const agreedText = renderAgreementText(fill, LEGACY_VERSION);
    const row = acceptanceRowFrom({
      leadId: ctx.lead.id, fill, method: "agree_page", agreedText, sha256: await sha256Hex(agreedText), version: LEGACY_VERSION,
      ip: clientIp(req), userAgent: req.headers.get("user-agent")?.slice(0, 500) ?? null,
    });
    const stored = await storeAndSendAcceptance(service, row);
    const emailedTo = stored.emailedTo ? values.email! : null;
    return html(agreementPageHtml({ mode: "accepted", businessName: ctx.businessName, acceptedAtIso: stored.acceptedAt, acceptedBy: values.contactName!, pdfHref, justSigned: true, emailedTo }));
  } catch (e) {
    const message = e instanceof Error ? e.message : JSON.stringify(e)?.slice(0, 300);
    console.error("[client-agreement]", message);
    await reportAgreementError(service, "client_agreement_failed", String(message), {});
    return html(agreementUnavailableHtml(), 500);
  }
});

function readForm(form: URLSearchParams): AgreementFormValues {
  return {
    legalName: clip(form.get("legalName")), companyNumber: clip(form.get("companyNumber")),
    contactName: clip(form.get("contactName")), role: clip(form.get("role")),
    address: clip(form.get("address")), email: clip(form.get("email")).toLowerCase(), phone: clip(form.get("phone")),
    websiteDomain: clip(form.get("websiteDomain")),
    /* ⛔ Only an affirmative "yes" from the client's own tick counts — nothing is ticked for them. */
    agree: form.get("agree") === "yes", authority: form.get("authority") === "yes", marketingOptOut: form.get("marketingOptOut") === "yes",
  };
}

async function signatureErrors(service: Service, leadId: string, fill: AgreementFill, values: AgreementFormValues): Promise<string[]> {
  const errors = agreePageMissing(fill).map((k) => `${LABELS[k]} is required.`);
  if (values.email && !EMAIL_RE.test(values.email)) errors.push("Email for notices does not look like an email address.");
  if (!values.agree) errors.push("Please tick the box to confirm you agree.");
  /* ⛔ QA (2026-10-04, src/lib/qaSafety.ts): a test lead's signed copy goes ONLY to the QA sink — refused
     here, before anything is stored, with the reason on the form. Genuine clients are unaffected. */
  const qaRefusal = await qaEmailHold(service, leadId, values.email ?? null);
  if (qaRefusal) errors.push(qaRefusal);
  return errors;
}
