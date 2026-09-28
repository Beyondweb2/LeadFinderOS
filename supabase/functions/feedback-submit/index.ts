import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { refusalBody, resolveActor } from "../_shared/access.ts";
import { checkFeedback, feedbackEmail, FEEDBACK_ERROR_TEXT } from "../../../src/lib/feedback.ts";
import { replyToAddress } from "../../../src/lib/templateRequest.ts";

/* ══ feedback-submit (Sales Experience release 5, 2026-09-28) ═══════════════════════════════════════
   A signed-in team member sends feedback. SAVED FIRST (feedback_items, service role), then emailed to
   the admin, and the email's outcome written back onto the row — a Resend failure never loses feedback,
   and the form says honestly whether the email went (the same shape as template-request).
   ⛔ Context is the positive allowlist in src/lib/feedback.ts — nothing else is stored or emailed. */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ADMIN_EMAIL = "paul@move37.fun";
const FROM_OPERATOR = "Findable alerts <alerts@findable.live>";
/** A person may send at most this many in an hour — a stuck button cannot flood the inbox. */
const MAX_PER_HOUR = 20;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) => new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  try {
    const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const who = await resolveActor(req, service);
    if (!who.ok) return json(refusalBody(who), who.status);
    const checked = checkFeedback(await req.json().catch(() => ({})));
    if (!checked.ok) return json({ ok: false, error: checked.error, detail: FEEDBACK_ERROR_TEXT[checked.error] ?? "Please check your feedback and try again." }, 400);
    const v = checked.value;

    const { count } = await service.from("feedback_items").select("id", { count: "exact", head: true })
      .eq("user_id", who.actor.id).gte("created_at", new Date(Date.now() - 3_600_000).toISOString());
    if ((count ?? 0) >= MAX_PER_HOUR) return json({ ok: false, error: "too_many", detail: FEEDBACK_ERROR_TEXT.too_many }, 429);

    const { data: member } = await service.from("team_members").select("display_name").eq("user_id", who.actor.id).maybeSingle();
    const authorName = (member as { display_name?: string } | null)?.display_name ?? null;
    const authorEmail = who.actor.email ?? null;
    const { data: row, error: insErr } = await service.from("feedback_items").insert({
      user_id: who.actor.id, author_name: authorName, author_email: authorEmail, author_role: who.actor.role,
      kind: v.kind, message: v.message, context: { ...v.context, role: who.actor.role },
    }).select("id").single();
    if (insErr || !row) { console.error("[feedback-submit] insert failed:", insErr?.message); return json({ ok: false, error: "not_saved" }, 500); }
    const id = (row as { id: string }).id;

    const mail = feedbackEmail({ id, kind: v.kind, message: v.message, context: v.context, authorName, authorEmail, role: who.actor.role });
    let emailStatus: "sent" | "failed" | "not_configured" = "failed";
    let emailError: string | null = null;
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) { emailStatus = "not_configured"; emailError = "RESEND_API_KEY is not set"; }
    else {
      try {
        const replyTo = replyToAddress(authorEmail);
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({ from: FROM_OPERATOR, to: [ADMIN_EMAIL], subject: mail.subject, text: mail.text, ...(replyTo ? { reply_to: replyTo } : {}) }),
        });
        if (res.ok) emailStatus = "sent";
        else emailError = `resend HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`;
      } catch (e) { emailError = `resend threw: ${(e as Error).message}`.slice(0, 250); }
    }
    const { error: upErr } = await service.from("feedback_items").update({ email_status: emailStatus, email_error: emailError, emailed_at: emailStatus === "sent" ? new Date().toISOString() : null }).eq("id", id);
    if (upErr) console.error("[feedback-submit] status update failed:", upErr.message);
    return json({ ok: true, id, emailed: emailStatus === "sent" });
  } catch (e) {
    console.error("[feedback-submit] error:", (e as Error).message);
    return json({ ok: false, error: "server_error" }, 500);
  }
});
