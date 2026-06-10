// claim-info
//
// Public, unauthenticated. Given a claim token, returns just enough to render the
// claim page: whether the token is valid/redeemable and the business name being
// claimed. Reveals nothing about sites you don't hold a token for. Rate-limited
// by IP to blunt token guessing. verify_jwt is false in config.toml.

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

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const rl = checkRateLimit(`claim-info:${clientIp(req)}`, 30, 60000);
    const rlHeaders = rateLimitHeaders(rl, 30);
    if (!rl.allowed) {
      return jsonResponse({ error: "Rate limit exceeded" }, 429, rlHeaders);
    }

    const body = await req.json().catch(() => ({}));
    const token = typeof body.token === "string" ? body.token.trim() : "";
    if (!token) {
      return jsonResponse({ valid: false }, 200, rlHeaders);
    }

    const serviceClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const tokenHash = await sha256Hex(token);
    const { data: row } = await serviceClient
      .from("claim_tokens")
      .select("site_id, expires_at, used_at")
      .eq("token_hash", tokenHash)
      .maybeSingle();

    // Uniform "invalid" for missing / used / expired — never disclose which.
    if (!row || row.used_at || new Date(row.expires_at).getTime() <= Date.now()) {
      return jsonResponse({ valid: false }, 200, rlHeaders);
    }

    const { data: site } = await serviceClient
      .from("generated_sites")
      .select("site_name, content, owner_id")
      .eq("id", row.site_id)
      .maybeSingle();

    if (!site) {
      return jsonResponse({ valid: false }, 200, rlHeaders);
    }

    const c = (site.content || {}) as Record<string, unknown>;
    const businessName =
      (typeof c.businessName === "string" ? c.businessName.trim() : "") ||
      (site.site_name as string) ||
      "your business";

    // Full content (token-gated) so the claim page can render the barber's ACTUAL
    // website as a preview before they sign up. It's the same content that becomes
    // public once the site is published, and the token holder is the intended
    // owner, so returning it here is fine.
    return jsonResponse(
      { valid: true, businessName, alreadyClaimed: !!site.owner_id, content: site.content },
      200,
      rlHeaders,
    );
  } catch (error) {
    console.error("[CLAIM-INFO] Unhandled error:", (error as Error).message);
    return jsonResponse({ valid: false }, 200);
  }
});
