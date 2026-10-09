import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { refusalBody, resolveActor } from "../_shared/access.ts";
import { sendSmsToLead } from "../_shared/twilio-sms.ts";
import { resolveTwilioEnv } from "../_shared/twilio.ts";
import { diagnoseTwilio } from "../_shared/twilio-diagnose.ts";
import { isSmsTemplate, SMS_LINK_TEMPLATE } from "../../../src/lib/smsMessages.ts";
import { smsTemplateAvailability } from "../../../src/lib/inboxChannel.ts";
import { toWhatsAppDigits } from "../../../src/lib/waNumber.ts";
import { smsSize } from "../../../src/lib/channelCosts.ts";

// twilio-sms-send — a rep texts ONE of their own leads from the Inbox / prospect workspace (2026-10-09).
//
// Modes: send · status (is SMS/voice set up?)
// ⛔ The lead decides the number; the browser sends a lead id, never a phone number.
// ⛔ THE TEXTS ARE THE WHATSAPP TEMPLATES (src/lib/smsMessages.ts): the two cold openers and the plain continuations, rendered by the
//    same function the WhatsApp sender uses. The sign-up link template (findable_signup_link) is refused here: it is made and sent by
//    quick-close (the authoritative flow, which also attributes the sale to the rep). Plain replies carry no typed link.
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
    if (mode !== "send" && mode !== "preview") return json({ ok: false, error: "unknown_mode" }, 400);

    const leadId = String(body.lead_id ?? "");
    if (!UUID_RE.test(leadId)) return json({ ok: false, error: "bad_request", detail: "Missing lead." }, 400);
    const template = body.template_name ? String(body.template_name) : null;
    const text = body.text != null ? String(body.text) : null;
    if (template) {
      if (template === SMS_LINK_TEMPLATE) {
        return json({ ok: false, error: "use_quick_close", detail: "The setup and agreement links are sent from Quick Close, which creates the right link for this customer." }, 400);
      }
    }
    /* ⛔ ANY OTHER WHATSAPP TEMPLATE (2026-10-09, one Inbox): its text is built by the WhatsApp sender itself — the same endpoint the WhatsApp
       Inbox previews with (send-whatsapp-message mode:"dry_run": every guard, nothing sent, nothing written) — called with the REP'S OWN
       session, so ownership and the lead's records are exactly what a WhatsApp send would meet. Wording and placeholder filling are therefore
       WhatsApp's by construction, not a second copy. Templates a text cannot carry are refused with the reason (smsTemplateAvailability). */
    let extended: { template: string; body: string } | null = null;
    if (template && !isSmsTemplate(template)) {
      const avail = smsTemplateAvailability(template);
      if (!avail.ok) return json({ ok: false, error: "template_unavailable", detail: avail.reason }, 400);
      const { data: lead } = await service.from("outreach_leads").select("phone, country").eq("id", leadId).maybeSingle();
      const digits = toWhatsAppDigits(String(lead?.phone ?? ""), (lead?.country as string | null) ?? null);
      if (!digits) return json({ ok: false, error: "bad_request", detail: "That lead has no usable number." }, 400);
      const wa = await fetch(`${Deno.env.get("SUPABASE_URL")}/functions/v1/send-whatsapp-message`, {
        method: "POST",
        headers: { "Content-Type": "application/json", "Authorization": req.headers.get("authorization") ?? "", "apikey": req.headers.get("apikey") ?? Deno.env.get("SUPABASE_ANON_KEY") ?? "" },
        body: JSON.stringify({ mode: "dry_run", phone: digits, lead_id: leadId, country: (lead?.country as string | null) ?? null, template_name: template, allow_resend: true }),
      }).then((x) => x.json()).catch(() => null) as { ok?: boolean; mode?: string; body?: string; error?: string; reason?: string } | null;
      if (!wa?.ok || wa.mode !== "dry_run" || !wa.body) {
        return json({ ok: false, error: wa?.error ?? "template_unavailable", detail: wa?.reason ?? "That template can't be built for this lead right now." }, 200);
      }
      extended = { template, body: wa.body };
    }
    if (mode === "preview") {
      if (!template) return json({ ok: false, error: "bad_request", detail: "Choose a template to preview." }, 400);
      if (!extended) return json({ ok: false, error: "use_send", detail: "Preview applies to the extended templates." }, 400);
      return json({ ok: true, mode: "preview", body: extended.body, segments: smsSize(extended.body).segments });
    }
    const r = await sendSmsToLead(service, {
      actor: who.actor, leadId,
      template: extended ? undefined : ((template as never) ?? undefined), extended, text: template ? null : text,
      idempotencyKey: String(body.idempotency_key ?? ""), allowResend: body.allow_resend === true,
    });
    return json(r, r.ok ? 200 : (r.status ?? 200));
  } catch (e) {
    console.error("[twilio-sms-send] error:", (e as Error).message);
    return json({ ok: false, error: "internal" }, 500);
  }
});
