// Cloudflare Pages middleware — barber custom subdomains (<label>.yoursites.uk).
//
// Runs on EVERY request. For a barber subdomain it serves the normal SPA shell
// with the <head> preview tags rewritten to that barber's business name/tagline/
// image (so social crawlers + the browser tab are right), then the client boots
// and renders the barber's site by hostname. For the apex (yoursites.uk), reserved
// labels, *.pages.dev, and all non-HTML/asset requests it calls next() unchanged —
// so the operator app and the existing /s and /p routes are completely untouched.
//
// Mirrors functions/s/[token].ts: PUBLIC anon key, best-effort, any failure falls
// through to the unmodified shell.

const SUPABASE_URL = "https://ruusxpkkmwtljxxulhbq.supabase.co";
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ1dXN4cGtrbXd0bGp4eHVsaGJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExODgzMzUsImV4cCI6MjA5Njc2NDMzNX0.4PoMZXJS0RDEHyK6wa9k0Q8F0fo2u1e7PMVegJ6nNbw";
const ROOT_DOMAIN = "yoursites.uk";
// Booking-only domain (bookmybarber.uk/<slug>) — KEEP in sync with src/lib/subdomain.ts.
const BOOKING_HOST = "bookmybarber.uk";

// KEEP IN SYNC with src/lib/subdomain.ts + supabase/functions/connect-subdomain.
const RESERVED = new Set<string>([
  "www", "app", "api", "admin", "claim", "auth", "mail", "ftp",
  "barber", "barbers", "find-leads", "outreach", "dashboard", "settings",
  "login", "signup", "register", "account", "billing", "support", "help",
  "status", "blog", "docs", "dev", "staging", "test", "demo", "root",
  "ns1", "ns2", "smtp", "webmail", "email", "pages", "cdn", "assets",
  "static", "img", "images", "cloudflare", "yoursites", "leadfinder",
  "leadfinderos", "guide", "start", "terms", "feedback", "s", "p",
]);
const SUBDOMAIN_RE = /^[a-z0-9](?:[a-z0-9-]{1,61}[a-z0-9])$/;

function barberLabel(host: string): string | null {
  const h = (host || "").toLowerCase().split(":")[0].trim();
  const suffix = `.${ROOT_DOMAIN}`;
  if (!h.endsWith(suffix)) return null;
  const label = h.slice(0, -suffix.length);
  if (!label || label.includes(".")) return null;
  if (RESERVED.has(label)) return null;
  if (!SUBDOMAIN_RE.test(label)) return null;
  return label;
}

function escAttr(s: string): string {
  return String(s).replace(/&/g, "&amp;").replace(/"/g, "&quot;")
    .replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function setMeta(html: string, key: string, value: string): string {
  const re = new RegExp(`(<meta\\s+(?:property|name)="${key}"\\s+content=")[^"]*(")`, "i");
  return re.test(html) ? html.replace(re, `$1${escAttr(value)}$2`) : html;
}

// A request is for a static asset if its path has a file extension (.js, .css, .png,
// .ico, .woff2, .webmanifest, …). Page navigations ("/", "/book", "/<slug>") have
// none → they get the OG-rewritten shell. We gate on the PATH, not the Accept header:
// WhatsApp/social crawlers send `Accept: */*`, so an Accept="text/html" check skipped
// them and leaked the default LeadFinder OG (the reported preview bug).
function isAssetPath(pathname: string): boolean {
  return /\.[a-z0-9]+$/i.test(pathname);
}

interface Env { ASSETS: { fetch: (req: Request | URL | string) => Promise<Response> } }

export const onRequest = async (context: {
  request: Request;
  env: Env;
  next: () => Promise<Response>;
}) => {
  const { request, env, next } = context;
  const host = request.headers.get("host") || new URL(request.url).hostname;
  const hostLc = host.toLowerCase().split(":")[0].trim();

  // Booking-only domain (bookmybarber.uk): /<slug> → inject that barber's booking
  // title/OG; bare root → a generic title. The client renders the booking page.
  if (hostLc === BOOKING_HOST || hostLc === `www.${BOOKING_HOST}`) {
    if (request.method !== "GET" || isAssetPath(new URL(request.url).pathname)) return next();
    const slug = new URL(request.url).pathname.replace(/^\/+/, "").split("/")[0];
    const shellRes = await env.ASSETS.fetch(new URL("/index.html", request.url));
    let html = await shellRes.text();
    if (!slug) {
      html = html.replace(/<title>[^<]*<\/title>/i, `<title>Online booking</title>`);
      return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=0, must-revalidate" } });
    }
    try {
      const apiUrl = `${SUPABASE_URL}/rest/v1/generated_sites` +
        `?site_name=eq.${encodeURIComponent(slug)}&select=site_name,content&limit=1`;
      const r = await fetch(apiUrl, { headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` } });
      if (r.ok) {
        const rows = await r.json() as Array<{ site_name?: string; content?: Record<string, unknown> }>;
        const row = Array.isArray(rows) ? rows[0] : null;
        if (row) {
          const content = (row.content ?? {}) as Record<string, unknown>;
          const biz = (typeof content.businessName === "string" && content.businessName.trim())
            ? content.businessName.trim() : (row.site_name || "Book an appointment");
          const title = `Book — ${biz}`;
          const rawImg = (typeof content.heroImageUrl === "string" && content.heroImageUrl.trim()) || "";
          const OBJ_PATH = "/storage/v1/object/public/";
          const img = rawImg
            ? (rawImg.includes(OBJ_PATH) ? rawImg.replace(OBJ_PATH, "/storage/v1/render/image/public/") + "?width=1200&height=630&resize=cover&quality=70" : rawImg)
            : "";
          html = html.replace(/<title>[^<]*<\/title>/i, `<title>${escAttr(title)}</title>`);
          html = setMeta(html, "og:title", title);
          html = setMeta(html, "og:description", `Book an appointment with ${biz} online.`);
          html = setMeta(html, "og:url", `https://${BOOKING_HOST}/${slug}`);
          html = setMeta(html, "twitter:title", title);
          html = setMeta(html, "og:image", img);
          html = setMeta(html, "twitter:image", img);
        }
      }
    } catch {
      // fall through to the unmodified shell
    }
    return new Response(html, { headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=0, must-revalidate" } });
  }

  const label = barberLabel(host);

  // Apex / reserved / pages.dev / localhost → operator app, unchanged.
  if (!label) return next();

  // Only rewrite page navigations; assets pass straight through. PATH-based (not the
  // Accept header) so crawlers sending `Accept: */*` still get the per-barber OG.
  if (request.method !== "GET" || isAssetPath(new URL(request.url).pathname)) return next();

  const shellRes = await env.ASSETS.fetch(new URL("/index.html", request.url));
  let html = await shellRes.text();

  try {
    const apiUrl = `${SUPABASE_URL}/rest/v1/generated_sites` +
      `?subdomain=eq.${encodeURIComponent(label)}&select=site_name,content&limit=1`;
    const r = await fetch(apiUrl, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    });
    if (r.ok) {
      const rows = await r.json() as Array<{ site_name?: string; content?: Record<string, unknown> }>;
      const row = Array.isArray(rows) ? rows[0] : null;
      if (row) {
        const content = (row.content ?? {}) as Record<string, unknown>;
        const biz = (typeof content.businessName === "string" && content.businessName.trim())
          ? content.businessName.trim() : (row.site_name || "Your website");
        const desc = (typeof content.tagline === "string" && content.tagline.trim())
          ? content.tagline.trim() : "Take a look.";
        const origin = `https://${label}.${ROOT_DOMAIN}`;
        const gallery = Array.isArray(content.galleryImageUrls) ? content.galleryImageUrls : [];
        const rawImg = (typeof content.heroImageUrl === "string" && content.heroImageUrl.trim())
          || (typeof gallery[0] === "string" && (gallery[0] as string).trim()) || "";
        // Supabase public objects can be multi-MB → use the render/image transform.
        const OBJ_PATH = "/storage/v1/object/public/";
        const img = rawImg
          ? (rawImg.includes(OBJ_PATH)
              ? rawImg.replace(OBJ_PATH, "/storage/v1/render/image/public/") + "?width=1200&height=630&resize=cover&quality=70"
              : rawImg)
          : "";

        html = html.replace(/<title>[^<]*<\/title>/i, `<title>${escAttr(biz)}</title>`);
        html = setMeta(html, "og:title", biz);
        html = setMeta(html, "og:description", desc);
        html = setMeta(html, "og:url", origin);
        html = setMeta(html, "twitter:title", biz);
        html = setMeta(html, "twitter:description", desc);
        html = setMeta(html, "og:image", img);
        html = setMeta(html, "twitter:image", img);
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
