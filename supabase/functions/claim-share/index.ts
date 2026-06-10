// claim-share
//
// Link "shim" that fixes social previews for barber claim links. The app is a
// SPA, so crawlers (WhatsApp, iMessage, Telegram, Facebook…) that fetch a
// /claim/<token> URL only see index.html's static LeadFinder OG tags — the wrong
// thing for a barber. This function, given a claim token, returns a tiny HTML
// page with PER-BARBER OG tags for crawlers, and immediately redirects real
// humans through to the actual /claim/<token> page so the claim flow still works.
//
// This changes NOTHING about LeadFinder's own OG tags — OG is resolved per-URL,
// and only this function's URL serves barber branding.
//
// Public, no auth (verify_jwt=false in config.toml). The admin "Generate claim
// link" button hands out this function's URL as the share link.

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sha256Hex } from "../_shared/claim-crypto.ts";

// Where humans are sent on to (the real claim page). One spot to change.
const APP_ORIGIN = "https://lead-finder-app.com";

// Public https image shown in the preview when a site has no hero photo.
// MUST be a crawler-reachable absolute URL (e.g. a file in the public
// barber-site-images bucket). Empty = omit og:image rather than show anything
// LeadFinder. Set this once a neutral barber photo is uploaded.
const OG_FALLBACK_IMAGE = "";

const OG_DESCRIPTION = "Your new website — claim it here.";

function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function page(opts: {
  title: string;
  description: string;
  image: string;
  ogUrl: string;
  redirectTo: string;
}): string {
  const { title, description, image, ogUrl, redirectTo } = opts;
  const t = esc(title);
  const d = esc(description);
  const u = esc(ogUrl);
  const r = esc(redirectTo);
  const imageTags = image
    ? `<meta property="og:image" content="${esc(image)}" />
    <meta name="twitter:image" content="${esc(image)}" />`
    : "";
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${t}</title>
  <meta property="og:type" content="website" />
  <meta property="og:title" content="${t}" />
  <meta property="og:description" content="${d}" />
  <meta property="og:url" content="${u}" />
  ${imageTags}
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="${t}" />
  <meta name="twitter:description" content="${d}" />
  <meta name="robots" content="noindex" />
  <!-- Humans get redirected to the real claim page; crawlers read the tags above. -->
  <meta http-equiv="refresh" content="0; url=${r}" />
  <script>window.location.replace(${JSON.stringify(redirectTo)});</script>
</head>
<body style="background:#0E0E10;color:#a1a1aa;font-family:system-ui,sans-serif">
  Redirecting… <a href="${r}" style="color:#E6A24B">Continue</a>
</body>
</html>`;
}

serve(async (req) => {
  try {
    const url = new URL(req.url);

    // Token is the path segment after /claim-share/, or a ?token= fallback.
    const marker = "/claim-share/";
    const i = url.pathname.indexOf(marker);
    let token = i >= 0 ? url.pathname.slice(i + marker.length) : "";
    token = decodeURIComponent((token.split("/")[0] || "").trim());
    if (!token) token = (url.searchParams.get("token") || "").trim();

    const redirectTo = `${APP_ORIGIN}/claim/${encodeURIComponent(token)}`;
    const ogUrl = `${Deno.env.get("SUPABASE_URL") ?? ""}/functions/v1/claim-share/${encodeURIComponent(token)}`;

    // Default (also used for invalid/expired tokens — never disclose, never
    // 404, just show neutral barber branding and let the claim page explain).
    let title = "Your new website";
    let image = OG_FALLBACK_IMAGE;

    if (token) {
      try {
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

        if (row && !row.used_at && new Date(row.expires_at).getTime() > Date.now()) {
          const { data: site } = await serviceClient
            .from("generated_sites")
            .select("site_name, content")
            .eq("id", row.site_id)
            .maybeSingle();
          if (site) {
            const c = (site.content || {}) as Record<string, unknown>;
            const bn = typeof c.businessName === "string" ? c.businessName.trim() : "";
            if (bn) title = bn;
            const hero = typeof c.heroImageUrl === "string" ? c.heroImageUrl.trim() : "";
            if (hero) image = hero;
          }
        }
      } catch (e) {
        // Lookup failure → fall back to neutral branding; still redirect humans.
        console.error("[CLAIM-SHARE] lookup failed:", (e as Error).message);
      }
    }

    return new Response(page({ title, description: OG_DESCRIPTION, image, ogUrl, redirectTo }), {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        // Short cache: each token is a unique URL, so this is safe and lets
        // crawlers re-scrape if needed.
        "Cache-Control": "public, max-age=300",
      },
    });
  } catch (error) {
    console.error("[CLAIM-SHARE] Unhandled error:", (error as Error).message);
    // Even on error, bounce to the app's claim entry rather than showing nothing.
    return new Response(null, { status: 302, headers: { Location: `${APP_ORIGIN}/barber-login` } });
  }
});
