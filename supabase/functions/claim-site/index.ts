// claim-site
//
// The barber's account-creation + claim endpoint. Two modes:
//   1. New account: body { token, email, password } — creates the auth user
//      server-side with email_confirm:true (so they can log straight in; no
//      confirmation email round-trip) and claims the site to them.
//   2. Existing/logged-in: a valid Authorization header + body { token } —
//      claims the site to the already-signed-in user.
//
// Barbers are INVITE-ONLY: an account is only ever created here, and only when a
// VALID token is presented, so there is no usable public barber signup. The claim
// itself runs through the claim_generated_site() SQL function for atomic,
// single-use, race-free redemption. Rate-limited by IP. verify_jwt is false.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, rateLimitHeaders } from "../_shared/rate-limiter.ts";
import { sha256Hex } from "../_shared/claim-crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function jsonResponse(body: unknown, status: number, extra?: Record<string, string>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...(extra || {}) },
  });
}

function clientIp(req: Request): string {
  return (req.headers.get("x-forwarded-for")?.split(",")[0] || "unknown").trim();
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** HTML-escape for safe interpolation into the notification email body. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Best-effort operator notification when a barber claims a site. Sends via
 *  Resend (raw fetch, RESEND_API_KEY) FROM the verified lead-finder-app.com
 *  sender — NEVER from yoursites.uk, which isn't verified in Resend. Any failure
 *  is logged and swallowed so it can never affect the claim itself. */
async function notifyAdminOfClaim(opts: {
  serviceClient: ReturnType<typeof createClient>;
  siteId: string;
  accountEmail: string;
  newAccount: boolean;
}): Promise<void> {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) {
    console.warn("[CLAIM-SITE] RESEND_API_KEY not set; skipping operator notification");
    return;
  }
  try {
    const { data: site } = await opts.serviceClient
      .from("generated_sites")
      .select("site_name, content")
      .eq("id", opts.siteId)
      .maybeSingle();

    const content = (site?.content ?? {}) as Record<string, unknown>;
    const slug = typeof site?.site_name === "string" ? site.site_name : "(unknown)";
    const shopName =
      typeof content.businessName === "string" && content.businessName.trim()
        ? content.businessName.trim()
        : slug;
    const account = opts.accountEmail
      ? `${opts.accountEmail} (${opts.newAccount ? "new account" : "existing account"})`
      : "existing/logged-in user";
    const publicUrl = `https://yoursites.uk/p/${slug}`;

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "LeadFinder Pro <noreply@lead-finder-app.com>",
        to: ["paul@yoursites.uk"],
        subject: `New barber claim: ${shopName}`,
        text:
          `A barber just claimed their site.\n\n` +
          `Shop:    ${shopName}\n` +
          `Slug:    ${slug}\n` +
          `Site:    ${publicUrl}\n` +
          `Account: ${account}\n`,
        html:
          `<div style="font-family:system-ui,-apple-system,sans-serif;font-size:14px;line-height:1.6;color:#1e293b">` +
          `<h2 style="margin:0 0 12px">New barber claim 🎉</h2>` +
          `<p style="margin:0 0 4px"><strong>Shop:</strong> ${esc(shopName)}</p>` +
          `<p style="margin:0 0 4px"><strong>Slug:</strong> ${esc(slug)}</p>` +
          `<p style="margin:0 0 4px"><strong>Site:</strong> <a href="${esc(publicUrl)}">${esc(publicUrl)}</a></p>` +
          `<p style="margin:0 0 4px"><strong>Account:</strong> ${esc(account)}</p>` +
          `</div>`,
      }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error("[CLAIM-SITE] notify email non-OK:", res.status, errBody.slice(0, 200));
    }
  } catch (e) {
    console.error("[CLAIM-SITE] notify email failed (non-blocking):", (e as Error).message);
  }
}

/** Best-effort confirmation email to the BARBER (their own signup email) right
 *  after a successful claim, so they know their site is live and how to log back
 *  in. Same Resend infra/verified domain as the operator notification, but
 *  barber-facing: FROM "Paul" (no "LeadFinder") with reply-to paul@move37.fun so
 *  replies reach a real inbox. Any failure is logged + swallowed — never blocks
 *  or fails the claim. */
async function notifyBarberOfClaim(opts: {
  serviceClient: ReturnType<typeof createClient>;
  siteId: string;
  toEmail: string;
}): Promise<void> {
  const resendKey = Deno.env.get("RESEND_API_KEY");
  if (!resendKey) {
    console.warn("[CLAIM-SITE] RESEND_API_KEY not set; skipping barber confirmation");
    return;
  }
  if (!opts.toEmail) {
    console.warn("[CLAIM-SITE] no barber email resolved; skipping barber confirmation");
    return;
  }
  try {
    const { data: site } = await opts.serviceClient
      .from("generated_sites")
      .select("site_name, content")
      .eq("id", opts.siteId)
      .maybeSingle();

    const content = (site?.content ?? {}) as Record<string, unknown>;
    const slug = typeof site?.site_name === "string" ? site.site_name : "";
    const shopName =
      typeof content.businessName === "string" && content.businessName.trim()
        ? content.businessName.trim()
        : (slug || "your business");
    const publicUrl = `https://yoursites.uk/p/${slug}`;
    const dashUrl = "https://yoursites.uk/barber";

    const res = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${resendKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        from: "Paul <noreply@lead-finder-app.com>",
        reply_to: "paul@move37.fun",
        to: [opts.toEmail],
        subject: "Your website is live",
        text:
          `Hi ${shopName},\n\n` +
          `Your website is claimed and live: ${publicUrl}\n\n` +
          `To edit it or manage bookings, log in here anytime: ${dashUrl}\n` +
          `Just log in with this email address.\n\n` +
          `Any questions, reply to this email.\n\n` +
          `Paul`,
        html:
          `<div style="font-family:system-ui,-apple-system,sans-serif;font-size:15px;line-height:1.6;color:#1e293b">` +
          `<p style="margin:0 0 12px">Hi ${esc(shopName)},</p>` +
          `<p style="margin:0 0 12px">Your website is claimed and live: <a href="${esc(publicUrl)}">${esc(publicUrl)}</a></p>` +
          `<p style="margin:0 0 4px">To edit it or manage bookings, log in here anytime: <a href="${dashUrl}">${dashUrl}</a></p>` +
          `<p style="margin:0 0 12px">Just log in with this email address.</p>` +
          `<p style="margin:0 0 12px">Any questions, reply to this email.</p>` +
          `<p style="margin:0">Paul</p>` +
          `</div>`,
      }),
    });
    if (!res.ok) {
      const errBody = await res.text().catch(() => "");
      console.error("[CLAIM-SITE] barber email non-OK:", res.status, errBody.slice(0, 200));
    }
  } catch (e) {
    console.error("[CLAIM-SITE] barber email failed (non-blocking):", (e as Error).message);
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rl = checkRateLimit(`claim-site:${clientIp(req)}`, 15, 60000);
    const rlHeaders = rateLimitHeaders(rl, 15);
    if (!rl.allowed) {
      return jsonResponse({ error: "Rate limit exceeded" }, 429, rlHeaders);
    }

    const body = await req.json().catch(() => ({}));
    const token = typeof body.token === "string" ? body.token.trim() : "";
    const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body.password === "string" ? body.password : "";
    if (!token) {
      return jsonResponse({ error: "token required" }, 400, rlHeaders);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
    const serviceClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    // --- Resolve the user we'll claim to ---------------------------------------
    // Authed mode wins if a real session token is present (an already-logged-in
    // barber redeeming their link); otherwise we create a new account.
    let userId: string | null = null;
    let createdUserId: string | null = null; // set only if we just created it (for cleanup)

    const authHeader = req.headers.get("Authorization");
    const bearer = authHeader?.startsWith("Bearer ") ? authHeader.replace("Bearer ", "") : "";
    // The supabase-js client sends the anon key as a Bearer token for logged-out
    // calls; that is NOT a user session, so ignore it.
    const isRealSession = bearer && bearer !== supabaseAnonKey;

    if (isRealSession) {
      const userClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: `Bearer ${bearer}` } },
      });
      const { data: userData } = await userClient.auth.getUser();
      if (userData?.user) userId = userData.user.id;
    }

    if (!userId) {
      // New-account mode — needs valid credentials. Expected validation outcomes
      // are returned as HTTP 200 with { ok:false, error } so the browser client
      // (supabase-js treats any non-2xx as a null-data error) can branch on them.
      if (!EMAIL_RE.test(email)) {
        return jsonResponse({ ok: false, error: "invalid_email" }, 200, rlHeaders);
      }
      if (password.length < 8) {
        return jsonResponse({ ok: false, error: "weak_password" }, 200, rlHeaders);
      }

      const { data: created, error: createError } = await serviceClient.auth.admin.createUser({
        email,
        password,
        email_confirm: true, // invite-only via token → trusted; skip confirmation email
      });

      if (createError || !created?.user) {
        const msg = (createError?.message || "").toLowerCase();
        // Already-registered email: tell the client to send them to barber-login.
        if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
          return jsonResponse({ ok: false, error: "email_exists" }, 200, rlHeaders);
        }
        console.error("[CLAIM-SITE] createUser failed:", createError?.message);
        return jsonResponse({ ok: false, error: "signup_failed" }, 200, rlHeaders);
      }
      userId = created.user.id;
      createdUserId = userId;
    }

    // --- Atomic claim ----------------------------------------------------------
    const tokenHash = await sha256Hex(token);
    const { data: claimedSiteId, error: claimError } = await serviceClient.rpc(
      "claim_generated_site",
      { p_token_hash: tokenHash, p_user_id: userId },
    );

    if (claimError || !claimedSiteId) {
      // Map the SQL exception to a stable client code.
      const raw = (claimError?.message || "").toLowerCase();
      let code = "claim_failed";
      if (raw.includes("invalid_token")) code = "invalid_token";
      else if (raw.includes("already_used")) code = "already_used";
      else if (raw.includes("expired")) code = "expired";
      else if (raw.includes("already_claimed")) code = "already_claimed";

      // If we created a brand-new user just for this and the claim didn't land,
      // delete the orphan so a failed attempt leaves no stray account behind.
      if (createdUserId) {
        await serviceClient.auth.admin.deleteUser(createdUserId).catch(() => {});
      }

      // Expected redemption failures → 200 { ok:false } (client branches on it).
      // A truly unexpected failure (claim_failed) → 500 (client shows generic).
      if (code === "claim_failed") {
        return jsonResponse({ ok: false, error: code }, 500, rlHeaders);
      }
      return jsonResponse({ ok: false, error: code }, 200, rlHeaders);
    }

    console.log(JSON.stringify({
      level: "info",
      fn: "claim-site",
      user_id: userId,
      site_id: claimedSiteId,
      new_account: !!createdUserId,
      timestamp: new Date().toISOString(),
    }));

    // Record the claim in the Phase 1 tracking funnel — best-effort, never
    // blocks the claim. Sets claimed_at once + logs a site_events row, so a
    // claim shows in LeadFinder regardless of how it was initiated.
    try {
      await serviceClient
        .from("generated_sites")
        .update({ claimed_at: new Date().toISOString() })
        .eq("id", claimedSiteId)
        .is("claimed_at", null);
      await serviceClient
        .from("site_events")
        .insert({ site_id: claimedSiteId, event_type: "claim", meta: { source: "claim-site" } });
    } catch (e) {
      console.error("[CLAIM-SITE] tracking write failed (non-blocking):", (e as Error).message);
    }

    // Notify the operator (best-effort; never blocks or fails the claim).
    await notifyAdminOfClaim({
      serviceClient,
      siteId: claimedSiteId as string,
      accountEmail: email,
      newAccount: !!createdUserId,
    });

    // Confirmation email to the BARBER. Fires exactly once per successful claim
    // (this path only runs after claim_generated_site succeeds, which is atomic +
    // one-time). Recipient is the barber's OWN signup email; for the rare
    // existing/logged-in claim (no signup email in the body) we look it up from
    // their auth record. Best-effort — never blocks the claim.
    let barberEmail = email;
    if (!barberEmail && userId) {
      try {
        const { data: u } = await serviceClient.auth.admin.getUserById(userId);
        barberEmail = u?.user?.email ?? "";
      } catch (e) {
        console.error("[CLAIM-SITE] barber email lookup failed:", (e as Error).message);
      }
    }
    await notifyBarberOfClaim({
      serviceClient,
      siteId: claimedSiteId as string,
      toEmail: barberEmail,
    });

    // For new accounts the client now signs in with the same email/password.
    return jsonResponse(
      { ok: true, site_id: claimedSiteId, new_account: !!createdUserId },
      200,
      rlHeaders,
    );
  } catch (error) {
    console.error("[CLAIM-SITE] Unhandled error:", (error as Error).message);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
