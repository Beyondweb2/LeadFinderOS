import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { leadAccess, refusalBody, resolveActor } from "../_shared/access.ts";
import { checkSuppressed } from "../_shared/suppression.ts";
import { guardAction } from "../_shared/protection.ts";
import { loadQaExclusions } from "../_shared/qa-guard.ts";
import { qaSendVerdict } from "../../../src/lib/qaSafety.ts";
import { toWhatsAppDigits } from "../../../src/lib/waNumber.ts";
import { voiceAccessToken } from "../../../src/lib/twilioAuth.ts";
import { resolveTwilioEnv } from "../_shared/twilio.ts";

// twilio-voice-token — "I want to call THIS lead from my browser" (2026-10-09).
//
// Mints a SHORT-LIVED Twilio access token and, in the same step, writes the call_logs row that says WHO is calling
// WHOM. The browser then asks Twilio to connect; twilio-webhook (the TwiML App's Voice URL) reads the number to
// dial from THAT ROW — the browser never supplies a number, so a token cannot be used to dial anyone else.
//
// ⛔ A token is for one rep (identity = their user id) and one lead (the row), 5 minutes, outgoing only.
// ⛔ Lead access = the same rule as everything else (assigned and not a client for a rep; their book for admin).
// ⛔ UK numbers only (mobile or landline); premium / non-geographic ranges are refused. Opt-out / wrong number
//    (contact_suppressions, unreadable = refuse) block a call exactly as they block a text.
// ⛔ A QA fixture is SIMULATED (no token — the screen runs the call in pretend mode); a real business held by a test
//    account is refused. TWILIO_TEST_MODE (default on) simulates every call.
// ⛔ Opening the workspace or pressing Call records NOTHING about the lead. Only the real call events (twilio-webhook)
//    update this row, and the outcome is still logged by the rep.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** UK geographic (1,2), non-geographic business (3) and mobile (7). Not 08/09 premium or special-rate ranges. */
const UK_CALLABLE = /^44[1237]\d{8,9}$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
  try {
    const who = await resolveActor(req, service);
    if (!who.ok) return json(refusalBody(who), who.status);
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const leadId = String(body.lead_id ?? "");
    if (!UUID_RE.test(leadId)) return json({ ok: false, error: "bad_request", detail: "Missing lead." }, 400);

    const access = await leadAccess(service, who.actor, leadId);
    if (!access.ok) return json({ ok: false, error: "lead_not_found", detail: "That lead is not available to you." }, access.error === "lookup_failed" ? 503 : 404);
    const { data: lead, error } = await service.from("outreach_leads")
      .select("id, phone, country, email, assigned_to_user_id, is_archived").eq("id", leadId).maybeSingle();
    if (error || !lead) return json({ ok: false, error: "lookup_failed", detail: "Could not read the lead." }, 503);
    if (lead.is_archived === true) return json({ ok: false, error: "archived", detail: "That lead is archived." }, 409);

    const digits = toWhatsAppDigits(lead.phone as string, (lead.country as string | null) ?? null);
    if (!digits || !UK_CALLABLE.test(digits)) return json({ ok: false, error: "not_callable", detail: "Browser calling covers UK numbers only, and this number is not one." });

    const sup = await checkSuppressed(service, { phone: `+${digits}`, email: lead.email as string | null, leadId });
    if (sup.suppressed) {
      return json({ ok: false, error: sup.matchedOn === "lookup_failed" ? "suppression_unreadable" : sup.wrongNumber ? "wrong_number" : "opted_out",
        detail: sup.matchedOn === "lookup_failed" ? "Could not check whether they have opted out, so no call was started." : sup.wrongNumber ? "This number is marked wrong." : "They have asked not to be contacted." });
    }

    const env = resolveTwilioEnv();
    const ex = await loadQaExclusions(service);
    const qa = qaSendVerdict(ex, { leadId, phones: [lead.phone as string, digits], holderUserId: (lead.assigned_to_user_id as string | null) ?? null, actorUserId: who.actor.id });
    if (qa.kind === "refuse") return json({ ok: false, error: "qa_refused", detail: "This is a real business held by a test account, so no call was started." });
    const simulated = env.testMode || qa.kind === "simulate";
    if (!simulated && !env.voiceConfigured) return json({ ok: false, error: "not_configured", detail: "Browser calling is not set up yet — the Twilio settings are missing." });

    const g = await guardAction(service, who.actor.id, "voice_call", { fn: "twilio-voice-token", leadId, role: who.actor.role });
    if (!g.ok) return json(g.body, g.status);

    const { data: row, error: insErr } = await service.from("call_logs").insert({
      lead_id: leadId, user_id: who.actor.id, phone: digits, direction: "outbound",
      status: simulated ? "simulated" : "initiated", test_mode: simulated,
    }).select("id").single();
    if (insErr || !row) return json({ ok: false, error: "log_failed", detail: "Could not record the call, so it was not started." }, 500);

    if (simulated) return json({ ok: true, simulated: true, callId: row.id, phoneTail: digits.slice(-4) });
    const token = await voiceAccessToken({
      accountSid: env.accountSid, apiKeySid: env.apiKeySid, apiKeySecret: env.apiKeySecret, twimlAppSid: env.twimlAppSid,
      identity: who.actor.id, ttlSeconds: 300,
    });
    return json({ ok: true, simulated: false, callId: row.id, token, identity: who.actor.id, phoneTail: digits.slice(-4) });
  } catch (e) {
    console.error("[twilio-voice-token] error:", (e as Error).message);
    return json({ ok: false, error: "internal" }, 500);
  }
});
