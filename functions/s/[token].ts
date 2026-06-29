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

// Template favicons (match src/templates/registry.ts). Injected into the served HTML
// so the browser tab shows the barber/salon mark immediately, with no one-frame flash
// of LeadFinder's /favicon.png before the SPA swaps it.
const BARBER_FAVICON = "data:image/svg+xml," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#0E0E10"/><g transform="translate(4 4)" fill="none" stroke="#E6A24B" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="6" cy="6" r="3"/><path d="M8.12 8.12 12 12"/><path d="M20 4 8.12 15.88"/><circle cx="6" cy="18" r="3"/><path d="M14.8 14.8 20 20"/></g></svg>',
);
const SALON_FAVICON = "data:image/svg+xml," + encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32"><rect width="32" height="32" rx="7" fill="#FAF6F3"/><g transform="translate(16 16)" fill="none" stroke="#C08497" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><circle cx="0" cy="0" r="2.6"/><path d="M0 -2.6V-8M0 2.6V8M2.6 0H8M-2.6 0H-8M1.84 -1.84 5.66 -5.66M-1.84 1.84 -5.66 5.66M1.84 1.84 5.66 5.66M-1.84 -1.84 -5.66 -5.66"/></g></svg>',
);
/** Replace the <link rel="icon"> with the template's SVG mark (matches the SPA). */
function setFavicon(html: string, isSalon: boolean): string {
  const href = isSalon ? SALON_FAVICON : BARBER_FAVICON;
  return html.replace(/<link\s+rel="icon"[^>]*>/i, `<link rel="icon" type="image/svg+xml" href="${href}">`);
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
        `?share_token=eq.${encodeURIComponent(token)}&select=site_name,content,template&limit=1`;
      const r = await fetch(apiUrl, {
        headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
      });
      if (r.ok) {
        const rows = await r.json() as Array<{ site_name?: string; content?: Record<string, unknown>; template?: string }>;
        const row = Array.isArray(rows) ? rows[0] : null;
        if (row) {
          const content = (row.content ?? {}) as Record<string, unknown>;
          const biz = (typeof content.businessName === "string" && content.businessName.trim())
            ? content.businessName.trim() : (row.site_name || "Your new website");
          const desc = (typeof content.tagline === "string" && content.tagline.trim())
            ? content.tagline.trim() : "Your new website — take a look.";
          // og:image: the barber's own hero, else their first gallery photo, else a
          // neutral stock photo for their template — never the LeadFinder logo.
          // The site's hero is `heroImageUrl || STOCK_HERO`, so we mirror that here.
          const gallery = Array.isArray(content.galleryImageUrls) ? content.galleryImageUrls : [];
          const isSalon = (typeof row.template === "string" ? row.template : "barber") === "salon";
          const fallbackImg = `${SITE_ORIGIN}/og-default-${isSalon ? "salon" : "barber"}.jpg`;
          const rawImg = (typeof content.heroImageUrl === "string" && content.heroImageUrl.trim())
            || (typeof gallery[0] === "string" && (gallery[0] as string).trim())
            || "";
          const abs = rawImg
            ? (/^https?:\/\//i.test(rawImg) ? rawImg : `${SITE_ORIGIN}${rawImg.startsWith("/") ? "" : "/"}${rawImg}`)
            : fallbackImg;
          // Custom hero uploads land in Supabase Storage and can be several MB —
          // WhatsApp silently drops OG images over ~300KB. Rewrite Supabase
          // public-object URLs to the on-the-fly image transform (1200x630, q70
          // → ~60KB) so the custom image actually renders. Defaults + any non-
          // Supabase URLs (already small) pass through untouched.
          const OBJ_PATH = "/storage/v1/object/public/";
          const img = abs.includes(OBJ_PATH)
            ? abs.replace(OBJ_PATH, "/storage/v1/render/image/public/") + "?width=1200&height=630&resize=cover&quality=70"
            : abs;
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
          html = setFavicon(html, isSalon);
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
