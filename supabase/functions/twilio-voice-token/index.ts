import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { leadAccess, refusalBody, resolveActor } from "../_shared/access.ts";
import { checkSuppressed } from "../_shared/suppression.ts";
import { guardAction } from "../_shared/protection.ts";
import { loadQaExclusions } from "../_shared/qa-guard.ts";
import { qaSendVerdict } from "../../../src/lib/qaSafety.ts";
import { VOICE_TOKEN_CALL_TTL_S, voiceAccessToken } from "../../../src/lib/twilioAuth.ts";
import { resolveTwilioEnv } from "../_shared/twilio.ts";
import { COUNTRY_OFF } from "../../../src/lib/outreachMarkets.ts";
import { ALWAYS_CALLABLE, LOW_BALANCE_WORDS, NON_GEOGRAPHIC_WORDS, NOT_CALLABLE_WORDS, OPTED_OUT_CALL_WORDS, WRONG_NUMBER_CALL_WORDS, PREMIUM_WORDS, balanceVerdict, browserCallAllowed, browserCallMarket, callHoursVerdict, pickCallNumber } from "../../../src/lib/callRules.ts";
import { alertLowBalance, twilioBalance } from "../_shared/twilio-balance.ts";
import { loadCountrySettings } from "../_shared/country-settings.ts";

// twilio-voice-token — "I want to call THIS lead from my browser" (2026-10-09).
//
// Mints a SHORT-LIVED Twilio access token and, in the same step, writes the call_logs row that says WHO is calling
// WHOM. The browser then asks Twilio to connect; twilio-webhook (the TwiML App's Voice URL) reads the number to
// dial from THAT ROW — the browser never supplies a number, so a token cannot be used to dial anyone else.
//
// ⛔ A token is for one rep (identity = their user id) and one lead (the row), outgoing only. It lasts as long as a sales
//    call may run (VOICE_TOKEN_CALL_TTL_S, one hour; it was 5 minutes until 2026-11-10 and Twilio reports an expired
//    token on the Device mid-call).
// ⛔ Lead access = the same rule as everything else (assigned and not a client for a rep; their book for admin).
// ⛔ 2026-11-16 (src/lib/callRules.ts): UK and Irish numbers always, Malaysia / Singapore behind their switch; the number is
//    E.164 first (callDigits); premium / special-rate ranges are refused; outside the PROSPECT'S calling hours and with
//    the Twilio balance gone nothing is written or dialled (low credit alerts Paul once a day). { refresh: true } mints a
//    fresh token for a call already live (the SDK's tokenWillExpire) — no row, no dial: the webhook only dials a row.
// ⛔ (until 2026-11-16) UK numbers only (mobile or landline); premium / non-geographic ranges are refused. Opt-out / wrong number
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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
  try {
    const who = await resolveActor(req, service);
    if (!who.ok) return json(refusalBody(who), who.status);
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;

    /* A call that is already live asks for a fresh token before the old one runs out (an hour). Only while this rep has a
       live call row: the token itself can dial nobody — twilio-webhook dials only a row written below, once. */
    if (body.refresh === true) {
      const env = resolveTwilioEnv();
      if (env.testMode || !env.voiceConfigured) return json({ ok: false, error: "not_configured" });
      const since = new Date(Date.now() - 3 * 3600_000).toISOString();
      const { data: liveRow } = await service.from("call_logs").select("id").eq("user_id", who.actor.id)
        .in("status", ["dialing", "ringing", "in-progress"]).gte("created_at", since).limit(1).maybeSingle();
      if (!liveRow) return json({ ok: false, error: "no_live_call" });
      const fresh = await voiceAccessToken({
        accountSid: env.accountSid, apiKeySid: env.apiKeySid, apiKeySecret: env.apiKeySecret, twimlAppSid: env.twimlAppSid,
        identity: who.actor.id, ttlSeconds: VOICE_TOKEN_CALL_TTL_S,
      });
      return json({ ok: true, refreshed: true, token: fresh });
    }
    const leadId = String(body.lead_id ?? "");
    if (!UUID_RE.test(leadId)) return json({ ok: false, error: "bad_request", detail: "Missing lead." }, 400);

    const access = await leadAccess(service, who.actor, leadId);
    if (!access.ok) return json({ ok: false, error: "lead_not_found", detail: "That lead is not available to you." }, access.error === "lookup_failed" ? 503 : 404);
    const { data: lead, error } = await service.from("outreach_leads")
      .select("id, phone, country, email, assigned_to_user_id, is_archived").eq("id", leadId).maybeSingle();
    if (error || !lead) return json({ ok: false, error: "lookup_failed", detail: "Could not read the lead." }, 503);
    if (lead.is_archived === true) return json({ ok: false, error: "archived", detail: "That lead is archived." }, 409);

    /* The best of the lead's numbers (mobile, landline, non-geographic; never 09), E.164 first (07… → 447…, an Irish 08… → 3538…, "+44 (0)7…" → 447…), then the one browser-calling rule. */
    const pick = pickCallNumber(lead.phone as string, (lead.country as string | null) ?? null);
    if (pick.premiumOnly) return json({ ok: false, error: "premium_number", detail: PREMIUM_WORDS });
    const digits = pick.digits;
    const callMarket = browserCallMarket(digits);
    /* 2026-11-16: a UK 0800 lead ("+44 800 774 7951") was refused HERE with "covers UK, Malaysia and Singapore numbers
       only", which read as a country block. A UK-shaped number that still is not callable now says it is the TYPE. */
    if (!digits || !callMarket) return json({ ok: false, error: "not_callable", detail: digits?.startsWith("44") ? NON_GEOGRAPHIC_WORDS : NOT_CALLABLE_WORDS });
    if (!browserCallAllowed(callMarket, ALWAYS_CALLABLE.has(callMarket) ? null : await loadCountrySettings(service))) {
      return json({ ok: false, error: COUNTRY_OFF, detail: "Browser calling to this country is switched off. Paul can turn it on in the WhatsApp queue settings." });
    }

    const sup = await checkSuppressed(service, { phone: `+${digits}`, email: lead.email as string | null, leadId });
    if (sup.suppressed) {
      return json({ ok: false, error: sup.matchedOn === "lookup_failed" ? "suppression_unreadable" : sup.wrongNumber ? "wrong_number" : "opted_out",
        detail: sup.matchedOn === "lookup_failed" ? "Could not check whether they have opted out, so no call was started." : sup.wrongNumber ? WRONG_NUMBER_CALL_WORDS : OPTED_OUT_CALL_WORDS });
    }

    const env = resolveTwilioEnv();
    /* Started now, read below: the credit check runs alongside the QA read instead of after it (no added wait). */
    const balanceP = env.testMode ? null : twilioBalance(env);
    const ex = await loadQaExclusions(service);
    const qa = qaSendVerdict(ex, { leadId, phones: [lead.phone as string, digits], holderUserId: (lead.assigned_to_user_id as string | null) ?? null, actorUserId: who.actor.id });
    if (qa.kind === "refuse") return json({ ok: false, error: "qa_refused", detail: "This is a real business held by a test account, so no call was started." });
    const simulated = env.testMode || qa.kind === "simulate";
    if (!simulated && !env.voiceConfigured) return json({ ok: false, error: "not_configured", detail: "Browser calling is not set up yet — the Twilio settings are missing." });
    if (!simulated) {
      /* The prospect's own calling hours (their number's country). A pretend QA call has no prospect, so it is never held. */
      const hours = callHoursVerdict(callMarket);
      if (!hours.open) return json({ ok: false, error: "outside_hours", detail: hours.words });
      const bal = balanceP ? await balanceP : null;
      const verdict = balanceVerdict(bal?.balance);
      if (verdict === "unknown") console.warn("[twilio-voice-token] balance not read:", bal?.error ?? "none");
      if (bal && (verdict === "low" || verdict === "empty")) await alertLowBalance(service, bal);
      if (verdict === "empty") return json({ ok: false, error: "low_balance", detail: LOW_BALANCE_WORDS });
    }

    const g = await guardAction(service, who.actor.id, "voice_call", { fn: "twilio-voice-token", leadId, role: who.actor.role });
    if (!g.ok) return json(g.body, g.status);

    const { data: row, error: insErr } = await service.from("call_logs").insert({
      lead_id: leadId, user_id: who.actor.id, phone: digits, direction: "outbound",
      status: simulated ? "simulated" : "initiated", test_mode: simulated,
    }).select("id").single();
    if (insErr || !row) return json({ ok: false, error: "log_failed", detail: "Could not record the call, so it was not started." }, 500);

    if (simulated) return json({ ok: true, simulated: true, callId: row.id, phoneTail: digits.slice(-4), numberKind: pick.kind });
    const token = await voiceAccessToken({
      accountSid: env.accountSid, apiKeySid: env.apiKeySid, apiKeySecret: env.apiKeySecret, twimlAppSid: env.twimlAppSid,
      identity: who.actor.id, ttlSeconds: VOICE_TOKEN_CALL_TTL_S,
    });
    return json({ ok: true, simulated: false, callId: row.id, token, identity: who.actor.id, phoneTail: digits.slice(-4), numberKind: pick.kind });
  } catch (e) {
    console.error("[twilio-voice-token] error:", (e as Error).message);
    return json({ ok: false, error: "internal" }, 500);
  }
});
