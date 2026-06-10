// create-claim-link
//
// Admin-only. Given a site_id, mints a single-use 7-day claim token for that site
// and returns the plaintext claim path ONCE (only the SHA-256 hash is stored).
// The admin sends the resulting /claim/<token> link privately to the barber.
//
// Auth: mirrors generate-barber-site / admin-users exactly — verify the JWT
// manually (getClaims with getUser fallback), then confirm the 'admin' role via
// user_roles using the service-role client. verify_jwt is false in config.toml.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { checkRateLimit, rateLimitHeaders } from "../_shared/rate-limiter.ts";
import { generateToken, sha256Hex } from "../_shared/claim-crypto.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TOKEN_TTL_DAYS = 7;

function jsonResponse(
  body: unknown,
  status: number,
  extra?: Record<string, string>,
) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json", ...(extra || {}) },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return jsonResponse({ error: "Missing Authorization header" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claimsData, error: claimsError } = await userClient.auth.getClaims(token);

    let adminUserId: string;
    if (claimsError || !claimsData?.claims) {
      const { data: userData, error: userError } = await userClient.auth.getUser();
      if (userError || !userData?.user) {
        return jsonResponse({ error: "Invalid token" }, 401);
      }
      adminUserId = userData.user.id;
    } else {
      adminUserId = claimsData.claims.sub as string;
    }

    const rl = checkRateLimit(`create-claim-link:${adminUserId}`, 20, 60000);
    const rlHeaders = rateLimitHeaders(rl, 20);
    if (!rl.allowed) {
      return jsonResponse({ error: "Rate limit exceeded" }, 429, rlHeaders);
    }

    const serviceClient = createClient(
      supabaseUrl,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const { data: roleData } = await serviceClient
      .from("user_roles")
      .select("role")
      .eq("user_id", adminUserId)
      .eq("role", "admin")
      .maybeSingle();
    if (!roleData) {
      return jsonResponse({ error: "Not authorized - no admin role" }, 403, rlHeaders);
    }

    const body = await req.json().catch(() => ({}));
    const siteId = typeof body.site_id === "string" ? body.site_id.trim() : "";
    if (!siteId) {
      return jsonResponse({ error: "site_id required" }, 400, rlHeaders);
    }

    // Confirm the site exists (and surface whether it's already claimed, so the
    // admin isn't surprised when an owned site's link can't be redeemed).
    const { data: site, error: siteError } = await serviceClient
      .from("generated_sites")
      .select("id, owner_id, site_name")
      .eq("id", siteId)
      .maybeSingle();
    if (siteError) {
      return jsonResponse({ error: "Failed to read site" }, 500, rlHeaders);
    }
    if (!site) {
      return jsonResponse({ error: "Site not found" }, 404, rlHeaders);
    }
    if (site.owner_id) {
      // 200 so the admin client (supabase-js nulls data on non-2xx) can show it.
      return jsonResponse({ error: "already_claimed" }, 200, rlHeaders);
    }

    // One active link per site: drop any prior unredeemed tokens for this site
    // before issuing a fresh one (a re-generated link supersedes the old one).
    await serviceClient
      .from("claim_tokens")
      .delete()
      .eq("site_id", siteId)
      .is("used_at", null);

    const plaintext = generateToken();
    const tokenHash = await sha256Hex(plaintext);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { error: insertError } = await serviceClient.from("claim_tokens").insert({
      site_id: siteId,
      token_hash: tokenHash,
      expires_at: expiresAt,
      created_by: adminUserId,
    });
    if (insertError) {
      console.error("[CREATE-CLAIM-LINK] Insert failed:", insertError.message);
      return jsonResponse({ error: "Failed to create claim link" }, 500, rlHeaders);
    }

    console.log(JSON.stringify({
      level: "info",
      fn: "create-claim-link",
      admin_user_id: adminUserId,
      site_id: siteId,
      expires_at: expiresAt,
      timestamp: new Date().toISOString(),
    }));

    // Plaintext token returned ONCE. The link to SEND is the claim-share shim URL
    // (so social previews show barber branding, not LeadFinder); claim_path is
    // kept for reference / fallback. share_url is an absolute Supabase functions
    // URL, so the admin UI copies it as-is (no origin prepend).
    const shareUrl = `${supabaseUrl}/functions/v1/claim-share/${plaintext}`;
    return jsonResponse(
      { token: plaintext, share_url: shareUrl, claim_path: `/claim/${plaintext}`, expires_at: expiresAt },
      200,
      rlHeaders,
    );
  } catch (error) {
    console.error("[CREATE-CLAIM-LINK] Unhandled error:", (error as Error).message);
    return jsonResponse({ error: "Internal server error" }, 500);
  }
});
