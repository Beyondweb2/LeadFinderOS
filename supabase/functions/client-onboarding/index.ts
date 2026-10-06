// client-onboarding — PUBLIC onboarding form for a PAID client (Paul, 2026-10-07,
// docs/pre-sales-certification/sales-close-handoff-australia.md).
//
//   GET  ?token=<64 hex>  → the client's form: ONLY the questions still missing for their plan
//   POST ?token=<64 hex>  → form-encoded answers → saved to their onboarding record → "Thanks, that's everything"
//
// ⛔ THE ADDRESS A HUMAN SEES IS findable.live/details/<token> (findable-site functions/details/[token].ts proxies
//    here — the Supabase gateway would show this HTML as text). verify_jwt = false (config.toml): the token is the key.
// ⛔ NO PAYMENT. Nothing on this page prices, charges or links to Stripe.
// ⛔ ONE REFUSAL FOR A BAD TOKEN: unknown, revoked, or an ended client all get the same "isn't available" page.
// ⛔ Only the link's own questions are accepted; every value is validated (clientOnboardingForm.ts); answers fill
//    blank columns only (never overwrite); a double submit writes once. The rules live in
//    _shared/client-onboarding.ts.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { loadPublic, markOpened, submitPublic } from "../_shared/client-onboarding.ts";
import { onboardingDoneHtml, onboardingFormHtml, onboardingNothingHtml, onboardingUnavailableHtml } from "../../../src/lib/clientOnboardingPageHtml.ts";
import { ONBOARDING_QUESTION_KEYS } from "../../../src/lib/clientOnboardingForm.ts";

const BUILD_ID = "client-onboarding-2026-10-07a";
const MAX_BODY = 20_000;

function html(body: string, status = 200): Response {
  return new Response(body, {
    status,
    headers: { "content-type": "text/html; charset=utf-8", "x-robots-tag": "noindex, nofollow, noarchive, nosnippet", "cache-control": "no-store", "x-build": BUILD_ID },
  });
}

Deno.serve(async (req) => {
  const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
  try {
    const url = new URL(req.url);
    const token = String(url.searchParams.get("token") || "").trim().toLowerCase();
    if (req.method === "GET") {
      const p = await loadPublic(service, token);
      if (p.kind === "unavailable") return html(onboardingUnavailableHtml(), 404);
      if (p.kind === "submitted") return html(onboardingDoneHtml(p.businessName, true));
      await markOpened(service, p.link).catch(() => undefined);
      if (p.kind === "nothing") return html(onboardingNothingHtml(p.businessName));
      return html(onboardingFormHtml({ businessName: p.businessName, questions: p.questions }));
    }
    if (req.method === "POST") {
      const body = (await req.text()).slice(0, MAX_BODY);
      const form = new URLSearchParams(body);
      /* Only the catalogue's own keys are read at all; the link's snapshot narrows it further on the server. */
      const raw: Record<string, string> = {};
      for (const k of ONBOARDING_QUESTION_KEYS) { const v = form.get(k); if (v !== null) raw[k] = v; }
      const r = await submitPublic(service, token, raw);
      if (r.kind === "unavailable") return html(onboardingUnavailableHtml(), 404);
      if (r.kind === "submitted") return html(onboardingDoneHtml(r.businessName, true));
      if (r.kind === "invalid") return html(onboardingFormHtml({ businessName: r.businessName, questions: r.questions, values: r.values, errors: r.errors }), 422);
      return html(onboardingDoneHtml(r.businessName));
    }
    return html(onboardingUnavailableHtml(), 405);
  } catch (e) {
    console.error("[client-onboarding]", e instanceof Error ? e.message : e);
    try { await service.from("client_error_reports").insert({ error_id: "client_onboarding_failed", context: { detail: (e instanceof Error ? e.message : String(e)).slice(0, 300) } }); } catch { /* reporting is best effort */ }
    return html(onboardingUnavailableHtml(), 500);
  }
});
