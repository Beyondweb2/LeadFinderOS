import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { refusalBody, resolveActor } from "../_shared/access.ts";
import { sendSmsToLead } from "../_shared/twilio-sms.ts";
import { resolveTwilioEnv } from "../_shared/twilio.ts";
import { diagnoseTwilio } from "../_shared/twilio-diagnose.ts";
import { SMS_TEMPLATES } from "../../../src/lib/smsMessages.ts";

// twilio-sms-send — a rep texts ONE of their own leads from the Inbox / prospect workspace (2026-10-09).
//
// Modes: send · status (is SMS/voice set up?)
// ⛔ The lead decides the number; the browser sends a lead id, never a phone number.
// ⛔ Link texts for the SETUP and AGREEMENT links are refused here: those links are generated and sent by
//    quick-close (the authoritative flow, which also attributes the sale to the rep). Here: the Findable website
//    link, the follow-up, and plain replies — never a typed link.
// ⛔ Every guard lives in _shared/twilio-sms.ts. Signed-in callers only (verify_jwt = true) AND a team role.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
  try {
    const who = await resolveActor(req, service);
    if (!who.ok) return json(refusalBody(who), who.status);
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const mode = String(body.mode ?? "send");
    const env = resolveTwilioEnv();

    if (mode === "status") {
      // Tells the screen whether to offer SMS / calling. Booleans only — never a value, never a secret.
      return json({ ok: true, smsConfigured: env.smsConfigured, voiceConfigured: env.voiceConfigured, testMode: env.testMode });
    }
    if (mode === "diagnose") {
      // Admin-only, read-only configuration check: booleans and plain words, never a secret value (twilio-diagnose.ts).
      if (who.actor.role !== "admin") return json({ ok: false, error: "admin_only" }, 403);
      return json({ ok: true, ...(await diagnoseTwilio(env)) });
    }
    if (mode !== "send") return json({ ok: false, error: "unknown_mode" }, 400);

    const leadId = String(body.lead_id ?? "");
    if (!UUID_RE.test(leadId)) return json({ ok: false, error: "bad_request", detail: "Missing lead." }, 400);
    const templateKey = body.template_key ? String(body.template_key) : null;
    const text = body.text != null ? String(body.text) : null;
    if (templateKey) {
      const t = SMS_TEMPLATES[templateKey as keyof typeof SMS_TEMPLATES];
      if (!t) return json({ ok: false, error: "bad_request", detail: "Unknown text." }, 400);
      if (t.linkKind === "setup" || t.linkKind === "agreement") {
        return json({ ok: false, error: "use_quick_close", detail: "The setup and agreement links are sent from Quick Close, which creates the right link for this customer." }, 400);
      }
    }
    const website = templateKey === "website_link" ? "https://findable.live" : null;
    const r = await sendSmsToLead(service, {
      actor: who.actor, leadId,
      templateKey: (templateKey as never) ?? undefined, linkUrl: website, text: templateKey ? null : text,
      idempotencyKey: String(body.idempotency_key ?? ""), allowResend: body.allow_resend === true,
    });
    return json(r, r.ok ? 200 : (r.status ?? 200));
  } catch (e) {
    console.error("[twilio-sms-send] error:", (e as Error).message);
    return json({ ok: false, error: "internal" }, 500);
  }
});
