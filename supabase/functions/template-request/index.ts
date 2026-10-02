import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { refusalBody, resolveActor } from "../_shared/access.ts";
import { checkTemplateRequest, replyToAddress, templateRequestEmail } from "../../../src/lib/templateRequest.ts";

/* ══ template-request — "Request a template" (2026-09-28, Paul) ══════════════════════════════════
   A signed-in team member (admin or sales) asks for a new WhatsApp template. The request is SAVED
   FIRST (template_requests, service role), then emailed to Paul, and the email's outcome is written
   back onto the row — so a Resend failure never loses a request, and the form can say honestly
   whether the email went. The wording is stored and emailed exactly as typed.
   ⛔ NOTHING GOES TO META. This function knows no Meta endpoint; Paul registers templates himself. */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
/* The same alert route as request-call / notify-onboarding-submit. */
const ADMIN_EMAIL = "paul@findable.live";
const FROM_OPERATOR = "Findable alerts <alerts@findable.live>";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  try {
    const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const who = await resolveActor(req, service);
    if (!who.ok) return json(refusalBody(who), who.status);

    const body = await req.json().catch(() => ({}));
    const checked = checkTemplateRequest(body);
    if (!checked.ok) return json({ ok: false, error: checked.error, field: checked.field }, 400);
    const v = checked.value;

    const { data: member } = await service.from("team_members").select("display_name").eq("user_id", who.actor.id).maybeSingle();
    const requesterName = (member as { display_name?: string } | null)?.display_name ?? null;
    const requesterEmail = who.actor.email ?? null;

    // 1. Save first.
    const { data: row, error: insErr } = await service.from("template_requests").insert({
      requested_by: who.actor.id,
      requester_name: requesterName,
      requester_email: requesterEmail,
      requester_role: who.actor.role,
      proposed_name: v.name,
      message_text: v.message,
      use_case: v.useCase,
      why_not_existing: v.whyNotExisting,
      source: v.source,
    }).select("id, created_at").single();
    if (insErr || !row) {
      console.error("[template-request] insert failed:", insErr?.message);
      return json({ ok: false, error: "not_saved" }, 500);
    }
    const saved = row as { id: string; created_at: string };

    // 2. Then email Paul. Its outcome is recorded; it never un-saves the request.
    const mail = templateRequestEmail({
      id: saved.id, createdAt: saved.created_at, requesterName, requesterEmail, requesterRole: who.actor.role,
      message: v.message, useCase: v.useCase, whyNotExisting: v.whyNotExisting, name: v.name, source: v.source,
    });
    let emailStatus: "sent" | "failed" | "not_configured" = "failed";
    let emailError: string | null = null;
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      emailStatus = "not_configured";
      emailError = "RESEND_API_KEY is not set";
    } else {
      try {
        const replyTo = replyToAddress(requesterEmail);
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: FROM_OPERATOR, to: [ADMIN_EMAIL], subject: mail.subject, text: mail.text, ...(replyTo ? { reply_to: replyTo } : {}) }),
        });
        if (res.ok) emailStatus = "sent";
        else emailError = `resend HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`;
      } catch (e) {
        emailError = `resend threw: ${(e as Error).message}`.slice(0, 250);
      }
    }
    const { error: upErr } = await service.from("template_requests").update({
      email_status: emailStatus, email_error: emailError, emailed_at: emailStatus === "sent" ? new Date().toISOString() : null,
    }).eq("id", saved.id);
    if (upErr) console.error("[template-request] status update failed:", upErr.message);
    if (emailError) console.error(`[template-request] ${saved.id}: ${emailError}`);

    return json({ ok: true, id: saved.id, emailed: emailStatus === "sent" });
  } catch (e) {
    console.error("[template-request] error:", (e as Error).message);
    return json({ ok: false, error: "server_error" }, 500);
  }
});
