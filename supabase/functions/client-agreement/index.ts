// client-agreement — PUBLIC agreement page + e-signature (Paul, 2026-10-02).
//
//   GET  ?token=<64 hex>          → the client's agreement page (sign / accepted / not ready)
//   POST ?token=<64 hex>          → form-encoded signature → evidence row → PDF → emails → confirmation
//   GET  ?token=<64 hex>&pdf=1    → the signed PDF of the latest agreement-page acceptance
//   GET  ?view=blank              → the general agreement (Stripe's Terms of Service URL)
//
// ⛔ THE ADDRESS A HUMAN SEES IS findable.live/agree/<token> (findable-site functions/agree/[token].ts
//    proxies here and forwards the visitor's IP as x-findable-client-ip). The gateway serves HTML from
//    this URL as text/plain, so this URL itself is never given to anyone.
// ⛔ THE EVIDENCE ROW IS WRITE-ONCE (_shared/client-agreement.ts). The exact text agreed and its
//    SHA-256 are stored on the row, so the record proves itself.
// ⛔ ONE REFUSAL FOR A BAD TOKEN. An unknown token gets the same page whatever is wrong with it.
// ⛔ THE ROUTE MUST BE RECORDED: client_agreement_links.service_route (set by Paul in the client hub,
//    or by the checkout) or the checkout-stamped contract_total_payments. With neither, the page
//    refuses to show the agreement — a guessed Build/Optimise would be a signature on the wrong terms.
// ⛔ THE CHECKOUT TICK DOES NOT REPLACE THIS PAGE (Paul): only an agree_page acceptance shows
//    "Accepted on … by …"; a client who ticked at checkout is still asked to sign here.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { acceptanceRowFrom, agreePageMissing, renderAgreementText, sha256Hex, type AgreementFill, type AgreementRoute, type AgreementAcceptanceRow } from "../../../src/lib/clientAgreement.ts";
import { agreementPageHtml, agreementUnavailableHtml, type AgreementFormValues } from "../../../src/lib/agreementPageHtml.ts";
import { serviceRouteForTotal } from "../../../src/lib/findableOffer.ts";
import { ACCEPTANCE_COLUMNS, agreementPdfForRow, reportAgreementError, storeAndSendAcceptance } from "../_shared/client-agreement.ts";
import { qaEmailHold } from "../_shared/qa-guard.ts";

// deno-lint-ignore no-explicit-any
type Service = any;

const TOKEN_RE = /^[0-9a-f]{64}$/;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const MAX_FIELD = 300;
const LEAD_COLUMNS = "id,business_name,email,phone,website,address,contract_total_payments";

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
  const linkRoute = link.service_route === "build" || link.service_route === "optimise" ? link.service_route as AgreementRoute : null;
  const route: AgreementRoute | null = linkRoute ?? serviceRouteForTotal(lead.contract_total_payments);
  return { lead, route, businessName: clip(lead.business_name) || "your business" };
}

async function latestPageAcceptance(service: Service, leadId: string): Promise<(AgreementAcceptanceRow & { accepted_at: string }) | null> {
  const { data, error } = await service.from("client_agreement_acceptances").select(ACCEPTANCE_COLUMNS)
    .eq("lead_id", leadId).eq("method", "agree_page").order("accepted_at", { ascending: false }).limit(1).maybeSingle();
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

    const existing = await latestPageAcceptance(service, ctx.lead.id);
    if (existing) {
      return html(agreementPageHtml({ mode: "accepted", businessName: ctx.businessName, acceptedAtIso: existing.accepted_at, acceptedBy: existing.typed_name ?? "", pdfHref }));
    }
    if (!ctx.route) return html(agreementPageHtml({ mode: "not_ready", businessName: ctx.businessName }));

    if (req.method === "GET") {
      /* Pre-filled only with what we already hold about the business; the name and role are always typed. */
      const values: AgreementFormValues = {
        email: clip(ctx.lead.email), phone: clip(ctx.lead.phone), address: clip(ctx.lead.address),
        websiteDomain: clip(ctx.lead.website).replace(/^https?:\/\//, "").replace(/\/$/, ""),
      };
      return html(agreementPageHtml({ mode: "sign", businessName: ctx.businessName, route: ctx.route, values, errors: [] }));
    }
    if (req.method !== "POST") return unavailable();

    // ── the signature ────────────────────────────────────────────────────────────────────────
    const form = new URLSearchParams(await req.text());
    const values: AgreementFormValues = {
      legalName: clip(form.get("legalName")), companyNumber: clip(form.get("companyNumber")),
      contactName: clip(form.get("contactName")), role: clip(form.get("role")),
      address: clip(form.get("address")), email: clip(form.get("email")).toLowerCase(), phone: clip(form.get("phone")),
      websiteDomain: clip(form.get("websiteDomain")), agree: form.get("agree") === "yes",
    };
    const fill: AgreementFill = { businessName: ctx.businessName, route: ctx.route, ...values };
    const errors = agreePageMissing(fill).map((k) => `${LABELS[k]} is required.`);
    if (values.email && !EMAIL_RE.test(values.email)) errors.push("Email for notices does not look like an email address.");
    if (!values.agree) errors.push("Please tick the box to confirm you agree.");
    /* ⛔ QA (2026-10-04, src/lib/qaSafety.ts): a test lead's signed copy goes ONLY to the QA sink — refused
       here, before anything is stored, with the reason on the form. Genuine clients are unaffected. */
    const qaRefusal = await qaEmailHold(service, ctx.lead.id, values.email ?? null);
    if (qaRefusal) errors.push(qaRefusal);
    if (errors.length) return html(agreementPageHtml({ mode: "sign", businessName: ctx.businessName, route: ctx.route, values, errors }), 422);

    const agreedText = renderAgreementText(fill);
    const row = acceptanceRowFrom({
      leadId: ctx.lead.id, fill, method: "agree_page", agreedText, sha256: await sha256Hex(agreedText),
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
