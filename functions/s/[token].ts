// Cloudflare Pages Function for /s/:token — per-barber link previews.
//
// The barber-share route is a client-side SPA route, so social/WhatsApp crawlers
// would otherwise read the static index.html and show LeadFinder Pro branding.
// This mirrors the OLD claim.yoursites.uk OG worker: on every /s/:token request we
// fetch the site by its share_token and rewrite the <title>/og:/twitter: tags to
// the BARBER's business name + tagline, then return the normal SPA shell (so the
// app still boots and renders for humans). Best-effort: any failure falls back to
// the unmodified shell.
//
// Uses the PUBLIC anon key (same one shipped in the client bundle); anon has a
// column-level SELECT grant + RLS read on published generated_sites by share_token.

const SUPABASE_URL = "https://ruusxpkkmwtljxxulhbq.supabase.co";
// Public anon key (safe to embed — already public in the client bundle).
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ1dXN4cGtrbXd0bGp4eHVsaGJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExODgzMzUsImV4cCI6MjA5Njc2NDMzNX0.4PoMZXJS0RDEHyK6wa9k0Q8F0fo2u1e7PMVegJ6nNbw";
const SITE_ORIGIN = "https://yoursites.uk";

function escAttr(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;")
    .replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

/** Replace the content="" of a <meta property|name="key"> tag (robust to /> or >). */
function setMeta(html: string, key: string, value: string): string {
  const re = new RegExp(`(<meta\\s+(?:property|name)="${key}"\\s+content=")[^"]*(")`, "i");
  return re.test(html) ? html.replace(re, `$1${escAttr(value)}$2`) : html;
}

interface Env { ASSETS: { fetch: (req: Request | URL | string) => Promise<Response> } }

export const onRequestGet = async (context: { request: Request; params: Record<string, string>; env: Env }) => {
  const { request, params, env } = context;
  const token = String(params.token || "").trim();

  // Always serve the real SPA shell; we only swap the <head> preview tags.
  const shellRes = await env.ASSETS.fetch(new URL("/index.html", request.url));
  let html = await shellRes.text();

  try {
    if (token) {
      const apiUrl = `${SUPABASE_URL}/rest/v1/generated_sites` +
        `?share_token=eq.${encodeURIComponent(token)}&select=site_name,content&limit=1`;
      const r = await fetch(apiUrl, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      });
      if (r.ok) {
        const rows = await r.json() as Array<{ site_name?: string; content?: Record<string, unknown> }>;
        const row = Array.isArray(rows) ? rows[0] : null;
        if (row) {
          const content = (row.content ?? {}) as Record<string, unknown>;
          const biz = (typeof content.businessName === "string" && content.businessName.trim())
            ? content.businessName.trim() : (row.site_name || "Your new website");
          const desc = (typeof content.tagline === "string" && content.tagline.trim())
            ? content.tagline.trim() : "Your new website — take a look.";
          const img = (typeof content.heroImageUrl === "string" && content.heroImageUrl)
            || (typeof content.logoUrl === "string" && content.logoUrl) || "";
          const url = `${SITE_ORIGIN}/s/${token}`;

          html = html.replace(/<title>[^<]*<\/title>/i, `<title>${escAttr(biz)}</title>`);
          html = setMeta(html, "og:title", biz);
          html = setMeta(html, "og:description", desc);
          html = setMeta(html, "og:url", url);
          html = setMeta(html, "twitter:title", biz);
          html = setMeta(html, "twitter:description", desc);
          // Use the barber's image when we have one; otherwise blank it so the
          // LeadFinder logo never shows in a barber's preview.
          html = setMeta(html, "og:image", img);
          html = setMeta(html, "twitter:image", img);
        }
      }
    }
  } catch {
    // fall through to the unmodified shell
  }

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "public, max-age=0, must-revalidate",
    },
  });
};
