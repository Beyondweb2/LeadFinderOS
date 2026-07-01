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

// ── Phone → synthetic email (Phase 1) ───────────────────────────────────────
// The barber enters only a phone; we derive a deterministic synthetic email and
// run account creation through the normal email path (Supabase Phone provider
// needs Twilio we don't have yet). This MUST stay byte-identical to
// src/lib/phoneAuth.ts so an account created here can log in from the frontend.
//
// MIGRATION NOTE: these `<e164digits>@claimed.yoursites.uk` accounts are a stop-
// gap. Once Move37 Twilio is live + the Phone provider is enabled, migrate each
// to a real phone identifier (set auth.users.phone, drop the synthetic email).
// Not built now — flagged so it isn't a surprise later.
const SYNTHETIC_EMAIL_DOMAIN = "claimed.yoursites.uk";
function toE164Digits(phone: string): string {
  let cleaned = (phone || "").replace(/[^\d+]/g, "");
  cleaned = cleaned.replace(/^\+/, "");
  if (cleaned.startsWith("0")) cleaned = "44" + cleaned.slice(1);
  return cleaned;
}
function phoneToSyntheticEmail(phone: string): string {
  return `${toE164Digits(phone)}@${SYNTHETIC_EMAIL_DOMAIN}`;
}
function isSyntheticEmail(email: string): boolean {
  return email.toLowerCase().endsWith(`@${SYNTHETIC_EMAIL_DOMAIN}`);
}

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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serviceClient: any; // injected service client — loose-typed to avoid supabase-js generic friction
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
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  serviceClient: any; // injected service client — loose-typed to avoid supabase-js generic friction
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
      .select("site_name, content, booking_only")
      .eq("id", opts.siteId)
      .maybeSingle();

    const content = (site?.content ?? {}) as Record<string, unknown>;
    const slug = typeof site?.site_name === "string" ? site.site_name : "";
    const shopName =
      typeof content.businessName === "string" && content.businessName.trim()
        ? content.businessName.trim()
        : (slug || "your business");
    // Booking-only sites live at bookmybarber.uk/<slug> and ARE booking pages, not
    // marketing websites — the email wording + link branch on this.
    const bookingOnly = (site as { booking_only?: boolean } | null)?.booking_only === true;
    const productNoun = bookingOnly ? "online booking page" : "website";
    const publicUrl = bookingOnly ? `https://bookmybarber.uk/${slug}` : `https://yoursites.uk/p/${slug}`;
    const liveLabel = bookingOnly ? "Your booking page" : "Your live site";
    const makeItYoursText = bookingOnly
      ? `You can edit everything yourself from the dashboard - your services, prices and opening hours, and manage your staff and bookings. No tech skills needed.`
      : `You can edit everything yourself from the dashboard - change your text, prices and services, and swap in your own photos (hero image and gallery). No tech skills needed.`;
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
        subject: bookingOnly ? "Your online booking page is live" : "Your new website is live",
        text:
          `Hi ${shopName},\n\n` +
          `Great news - your new ${productNoun} is live and yours to keep.\n\n` +
          `${liveLabel}:\n${publicUrl}\n\n` +
          `Log in any time to manage it:\n${dashUrl}\n` +
          `Just use this email address to log in.\n\n` +
          `Make it yours:\n` +
          `${makeItYoursText}\n\n` +
          `Install it as an app (optional, but handy):\n` +
          `- iPhone (Safari): open ${dashUrl}, tap the Share button, scroll down, then "Add to Home Screen."\n` +
          `- Android (Chrome): open ${dashUrl}, tap the menu (three dots, top-right), then "Install app" (or "Add to Home screen").\n` +
          `- Desktop (Chrome or Edge): open ${dashUrl}, then click the install icon at the right-hand end of the address bar (a small screen icon with a down-arrow). Don't see it? In Chrome: menu (three dots) > "Cast, save, and share" > "Install page as app". In Edge: menu > "Apps" > "Install this site as an app". (It won't show in a private/Incognito window or if it's already installed.)\n` +
          `It'll appear as an app with its own icon, opens full-screen, and is the quickest way back to your bookings.\n\n` +
          `Any questions, just reply to this email.\n\n` +
          `Paul`,
        html:
          `<div style="font-family:system-ui,-apple-system,sans-serif;font-size:15px;line-height:1.6;color:#1e293b;max-width:560px">` +
          `<p style="margin:0 0 12px">Hi ${esc(shopName)},</p>` +
          `<p style="margin:0 0 16px">Great news — your new ${esc(productNoun)} is live and yours to keep.</p>` +
          `<p style="margin:0 0 2px"><strong>${esc(liveLabel)}</strong></p>` +
          `<p style="margin:0 0 16px"><a href="${esc(publicUrl)}">${esc(publicUrl)}</a></p>` +
          `<p style="margin:0 0 2px"><strong>Log in any time to manage it</strong></p>` +
          `<p style="margin:0 0 16px"><a href="${dashUrl}">${dashUrl}</a><br>Just use this email address to log in.</p>` +
          `<p style="margin:0 0 2px"><strong>Make it yours</strong></p>` +
          `<p style="margin:0 0 16px">${esc(makeItYoursText)}</p>` +
          `<p style="margin:0 0 4px"><strong>Install it as an app</strong> (optional, but handy)</p>` +
          `<ul style="margin:0 0 8px;padding-left:18px">` +
          `<li style="margin:0 0 6px"><strong>iPhone (Safari):</strong> open <a href="${dashUrl}">yoursites.uk/barber</a>, tap the Share button, scroll down, then "Add to Home Screen."</li>` +
          `<li style="margin:0 0 6px"><strong>Android (Chrome):</strong> open it, tap the menu (⋮, top-right), then "Install app" (or "Add to Home screen").</li>` +
          `<li style="margin:0 0 6px"><strong>Desktop (Chrome or Edge):</strong> open it, then click the install icon at the right-hand end of the address bar (a small screen icon with a down-arrow). Don't see it? Chrome: ⋮ menu → "Cast, save, and share" → "Install page as app". Edge: ⋯ menu → "Apps" → "Install this site as an app".</li>` +
          `</ul>` +
          `<p style="margin:0 0 16px;font-size:13px;color:#64748b">The desktop install option won't appear in a private/Incognito window, or if it's already installed.</p>` +
          `<p style="margin:0 0 16px">It'll appear as an app with its own icon, opens full-screen, and is the quickest way back to your bookings.</p>` +
          `<p style="margin:0 0 12px">Any questions, just reply to this email.</p>` +
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
    const phone = typeof body.phone === "string" ? body.phone.trim() : "";
    const password = typeof body.password === "string" ? body.password : "";
    // Set when we create a new phone-based account; reused for sign-in + guards.
    let syntheticEmail = "";
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
      // New-account mode — barber enters only a PHONE; we derive a synthetic email
      // and create the account through the email path. Expected validation outcomes
      // are returned as HTTP 200 with { ok:false, error } so the browser client
      // (supabase-js treats any non-2xx as a null-data error) can branch on them.
      const digits = toE164Digits(phone);
      if (digits.length < 10) {
        return jsonResponse({ ok: false, error: "invalid_phone" }, 200, rlHeaders);
      }
      if (password.length < 8) {
        return jsonResponse({ ok: false, error: "weak_password" }, 200, rlHeaders);
      }

      syntheticEmail = phoneToSyntheticEmail(phone);
      const { data: created, error: createError } = await serviceClient.auth.admin.createUser({
        email: syntheticEmail,
        password,
        email_confirm: true, // invite-only via token → trusted; no confirmation email
      });

      if (createError || !created?.user) {
        const msg = (createError?.message || "").toLowerCase();
        // This phone already has an account → tell the client to send them to login.
        if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
          return jsonResponse({ ok: false, error: "account_exists" }, 200, rlHeaders);
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

    // Resolve who claimed: a new phone account is the synthetic email; the rare
    // existing/logged-in claim has no signup value in the body, so look it up.
    let barberEmail = syntheticEmail;
    if (!barberEmail && userId) {
      try {
        const { data: u } = await serviceClient.auth.admin.getUserById(userId);
        barberEmail = u?.user?.email ?? "";
      } catch (e) {
        console.error("[CLAIM-SITE] barber email lookup failed:", (e as Error).message);
      }
    }

    // Notify the operator (best-effort; never blocks or fails the claim). Show the
    // PHONE for phone-claims; a real email otherwise; "logged-in user" if neither.
    await notifyAdminOfClaim({
      serviceClient,
      siteId: claimedSiteId as string,
      accountEmail: phone || (isSyntheticEmail(barberEmail) ? "" : barberEmail),
      newAccount: !!createdUserId,
    });

    // Capture email + send the barber a confirmation ONLY for a REAL inbox — never
    // a synthetic phone address (it has no inbox: a send would bounce and it would
    // pollute the lead's email field). Best-effort; never blocks the claim.
    if (barberEmail && !isSyntheticEmail(barberEmail)) {
      try {
        const { data: linkedSite } = await serviceClient
          .from("generated_sites")
          .select("lead_id")
          .eq("id", claimedSiteId)
          .maybeSingle();
        const leadId = (linkedSite as { lead_id: string | null } | null)?.lead_id;
        if (leadId) {
          await serviceClient
            .from("outreach_leads")
            .update({ email: barberEmail, email_status: "found", email_method: "barber_claim" })
            .eq("id", leadId);
        }
      } catch (e) {
        console.error("[CLAIM-SITE] email capture to lead failed (non-blocking):", (e as Error).message);
      }

      await notifyBarberOfClaim({
        serviceClient,
        siteId: claimedSiteId as string,
        toEmail: barberEmail,
      });
    }

    // New phone accounts: the client signs in with login_email + the password it
    // already holds. (login_email is the hidden synthetic email — never shown.)
    return jsonResponse(
      { ok: true, site_id: claimedSiteId, new_account: !!createdUserId, login_email: syntheticEmail || null },
      200,
      rlHeaders,
    );
  } catch (error) {
    console.error("[CLAIM-SITE] Unhandled error:", (error as Error).message);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
