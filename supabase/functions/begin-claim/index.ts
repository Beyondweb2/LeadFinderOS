import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { generateToken, sha256Hex } from "../_shared/claim-crypto.ts";

// begin-claim — mint-on-demand bridge from the share link to the EXISTING claim.
//
// The barber's /s/:token page carries an unguessable share_token. The existing
// account-creation claim (claim-info / claim-site / claim_generated_site) is
// keyed by a one-time claim_token. This function exchanges a valid share_token
// for a fresh one-time claim_token, so the page can hand off to the UNCHANGED
// /claim/<token> flow (claim-info / claim-site). The share_token is the
// barber's private credential, so no extra auth is required; the claim itself
// stays one-time (owner_id guard in claim_generated_site). verify_jwt = false.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const TOKEN_TTL_DAYS = 7;

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const body = await req.json().catch(() => ({}));
    const shareToken: string = typeof body.share_token === "string" ? body.share_token.trim() : "";
    if (!shareToken) return json({ ok: false, error: "share_token required" }, 400);

    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );

    const { data: site, error: findError } = await service
      .from("generated_sites")
      .select("id, owner_id")
      .eq("share_token", shareToken)
      .maybeSingle();
    if (findError) return json({ ok: false, error: "lookup_failed" }, 500);
    if (!site) return json({ ok: false, error: "not_found" }, 404);
    if (site.owner_id) return json({ ok: false, already_claimed: true });

    // One active link per site — drop any prior unredeemed tokens, then mint.
    await service.from("claim_tokens").delete().eq("site_id", site.id).is("used_at", null);

    const plaintext = generateToken();
    const tokenHash = await sha256Hex(plaintext);
    const expiresAt = new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const { error: insertError } = await service.from("claim_tokens").insert({
      site_id: site.id,
      token_hash: tokenHash,
      expires_at: expiresAt,
      created_by: null, // self-serve (barber-initiated from their share link)
    });
    if (insertError) {
      console.error("begin-claim insert failed:", insertError.message);
      return json({ ok: false, error: "mint_failed" }, 500);
    }

    return json({ ok: true, token: plaintext, claim_path: `/claim/${plaintext}` });
  } catch (e) {
    console.error("begin-claim error:", e);
    return json({ ok: false, error: "internal" }, 500);
  }
});
