// request-call — the report's "Request a call" button (Paul, 2026-09-16). A prospect on a public
// report taps it; PAUL gets an email with their business name + number. Designed to not be abusable:
//
//  · POST only (the report uses a <form method="POST">), so link-prefetchers / messaging-app
//    crawlers can't fire it. A GET returns the form-less info page, never an email.
//  · The ONLY input is the audit id already in the report URL. Business name + phone are read from
//    the lead SERVER-SIDE; the recipient is always Paul. A prospect can inject no content and no
//    recipient.
//  · One email per lead per 24h (call_requests dedupe). Re-taps are no-ops. So the worst anyone with
//    a report link can do is cause ONE email about that one real business per day — the intended
//    action, not spam.
//
// verify_jwt=false: it's public by design. Email goes through Resend, the SAME path
// notify-onboarding-submit uses (RESEND_API_KEY, alerts@findable.live → paul@move37.fun).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const ADMIN_EMAIL = "paul@move37.fun";
const FROM_OPERATOR = "Findable alerts <alerts@findable.live>";
const DEDUPE_MS = 24 * 60 * 60 * 1000;

function page(title: string, body: string, status = 200): Response {
  const html = `<!doctype html><html lang="en"><head><meta charset="utf-8"/>
<meta name="viewport" content="width=device-width, initial-scale=1"/>
<meta name="robots" content="noindex, nofollow"/><title>${title}</title>
<style>body{margin:0;background:#101114;color:#fff;font-family:-apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;display:flex;min-height:100vh;align-items:center;justify-content:center;padding:24px}
.card{max-width:420px;text-align:center}.mk{font-size:22px;font-weight:900;letter-spacing:-.02em;color:#FFD13F;margin-bottom:18px}
h1{font-size:22px;margin:0 0 10px}p{color:#c9cbd1;font-size:15px;line-height:1.55;margin:0}</style></head>
<body><div class="card"><div class="mk">Findable.</div>${body}</div></body></html>`;
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

async function readAuditId(req: Request): Promise<string> {
  const ct = req.headers.get("content-type") || "";
  try {
    if (ct.includes("application/json")) {
      const j = await req.json().catch(() => ({}));
      return String(j?.audit ?? j?.audit_id ?? "").trim();
    }
    const form = await req.formData();
    return String(form.get("audit") ?? "").trim();
  } catch { return ""; }
}

Deno.serve(async (req) => {
  // A GET (someone opening the URL directly, or a prefetch) never sends an email.
  if (req.method !== "POST") {
    return page("Request a call", `<h1>Request a call</h1><p>Open your report and tap “Request a call”, or message us on WhatsApp.</p>`);
  }
  try {
    const auditId = await readAuditId(req);
    if (!auditId || auditId.length > 100) {
      return page("Request a call", `<h1>Something went wrong</h1><p>We couldn’t read your report reference. Please WhatsApp us instead.</p>`, 400);
    }
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    // Audit → lead. Business name + phone come from HERE, never from the request.
    const { data: audit } = await service.from("ai_audits").select("id, lead_id, business_name").eq("id", auditId).maybeSingle();
    if (!audit) {
      return page("Request a call", `<h1>Something went wrong</h1><p>We couldn’t find your report. Please WhatsApp us instead.</p>`, 404);
    }
    const leadId = (audit as { lead_id?: string | null }).lead_id ?? null;
    let businessName = String((audit as { business_name?: string }).business_name ?? "").trim();
    let phone = "";
    if (leadId) {
      const { data: lead } = await service.from("outreach_leads").select("business_name, phone, contact_name").eq("id", leadId).maybeSingle();
      const l = lead as { business_name?: string; phone?: string; contact_name?: string } | null;
      if (l?.business_name) businessName = l.business_name.trim();
      phone = String(l?.phone ?? "").trim();
    }

    // Dedupe: one email per lead per 24h. A re-tap (or a second prospect on the same link) is a no-op.
    const dedupeKey = leadId ?? `audit:${auditId}`;
    const since = new Date(Date.now() - DEDUPE_MS).toISOString();
    const { data: recent } = await service.from("call_requests")
      .select("id").eq("dedupe_key", dedupeKey).gte("created_at", since).limit(1).maybeSingle();
    if (recent) {
      return page("Request a call", `<h1>You’re on the list</h1><p>Thanks — Paul already has your request and will call you shortly.</p>`);
    }

    // Send the email (Resend — the working path). Record the request either way so a Resend blip is
    // visible in the row rather than lost.
    let notifyError: string | null = null;
    const resendKey = Deno.env.get("RESEND_API_KEY");
    if (!resendKey) {
      notifyError = "RESEND_API_KEY is not set";
      console.error("[request-call] RESEND_API_KEY not set");
    } else {
      try {
        const res = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: { "Authorization": `Bearer ${resendKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            from: FROM_OPERATOR,
            to: [ADMIN_EMAIL],
            subject: `Call request: ${businessName || "a prospect"}`,
            text: `${businessName || "A prospect"} tapped "Request a call" on their AI visibility report.\n\n`
              + `Business: ${businessName || "(unknown)"}\n`
              + `Phone: ${phone || "(none on the lead)"}\n`
              + `Report: https://findable.live/report/${auditId}\n\n`
              + `They are expecting a call.`,
          }),
        });
        if (!res.ok) {
          notifyError = `resend HTTP ${res.status}: ${(await res.text().catch(() => "")).slice(0, 200)}`;
          console.error(`[request-call] ${notifyError}`);
        }
      } catch (e) {
        notifyError = `resend threw: ${(e as Error).message}`.slice(0, 250);
        console.error(`[request-call] ${notifyError}`);
      }
    }

    await service.from("call_requests").insert({
      dedupe_key: dedupeKey, lead_id: leadId, audit_id: auditId, notify_error: notifyError,
    }).then(({ error }) => { if (error) console.error("[request-call] insert failed:", error.message); });

    return page("Request a call", `<h1>Thanks — Paul will call you</h1><p>Your request is in. Paul will be in touch shortly.</p>`);
  } catch (e) {
    console.error("[request-call] error:", (e as Error).message);
    return page("Request a call", `<h1>Something went wrong</h1><p>Please WhatsApp us instead — we’ll get straight back to you.</p>`, 500);
  }
});
