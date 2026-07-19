// Shared SSR shell for every /directory/* page (homepage, category, business).
//
// Every directory route imports renderDirectoryPage() so they all share ONE header/nav/footer and
// ONE stylesheet — a consistent, professional directory look. Fully self-contained: inline CSS +
// Google Fonts, no external stylesheet, no client JS (mirrors the SSR approach of functions/r/[slug].ts).
//
// Underscore-prefixed (`_shared.ts`) so Cloudflare Pages does not treat it as a route; it exports no
// request handler, so even if it were mapped it would just fall through. Route files import it by
// relative path (./_shared).

export const DIRECTORY_NAME = "Findable Directory";
export const DIRECTORY_TAGLINE = "Find trusted UK businesses";

// License-free Unsplash CDN images (commercial-free, no key). BOTH IDs are the ones already proven
// live by the report pages (functions/r/[slug].ts) — office + desk/documents. Used as hero backgrounds.
export const IMG_OFFICE = "https://images.unsplash.com/photo-1497215728101-856f4ea42174?w=1600&q=80";
export const IMG_DESK = "https://images.unsplash.com/photo-1450101499163-c8848c66ca85?w=1600&q=80";

/** Pick a hero background for a niche. Only PROVEN-LIVE image IDs are used (office default,
 *  desk/documents for finance-type niches). Add per-niche entries here as new IDs are confirmed. */
export function nicheHeroImage(niche: string): string {
  const key = (niche || "").trim().toLowerCase();
  const map: Record<string, string> = {
    accountant: IMG_DESK, accountants: IMG_DESK, bookkeeper: IMG_DESK, bookkeepers: IMG_DESK,
  };
  return map[key] || IMG_OFFICE;
}

/** business name → clean URL slug (mirrors the generator's slugify). Used to link category cards
 *  to /directory/<niche>/<slug> and, in piece 3, to resolve the business page. */
export function slugify(name: string): string {
  return String(name || "")
    .toLowerCase().normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 80).replace(/-+$/, "");
}

/** Raw niche ("accountant", "letting agent") → display label ("Accountants", "Letting Agents").
 *  Title-cases each word and pluralises; the URL keeps the raw niche unchanged. */
export function nicheLabel(niche: string): string {
  const n = (niche || "").trim().toLowerCase();
  if (!n) return "";
  const titled = n.replace(/\b\w/g, (c) => c.toUpperCase());
  const pluralise = (w: string): string =>
    /[^aeiou]y$/i.test(w) ? w.replace(/y$/i, "ies")
    : /(s|x|z|ch|sh)$/i.test(w) ? `${w}es`
    : /s$/i.test(w) ? w
    : `${w}s`;
  // Pluralise only the final word (e.g. "Letting Agent" → "Letting Agents").
  const words = titled.split(" ");
  words[words.length - 1] = pluralise(words[words.length - 1]);
  return words.join(" ");
}

/** Escape for HTML text/attribute contexts (titles, labels, attributes). */
export function escHtml(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

export interface BreadcrumbItem {
  label: string;
  href?: string; // omit (or leave off the last item) → renders as the current page
}

/** Breadcrumb trail for category/business pages. The final item renders as the current page
 *  (no link); earlier items with an href render as links. Empty input → empty string. */
export function renderBreadcrumbs(items: BreadcrumbItem[]): string {
  if (!items || items.length === 0) return "";
  const parts = items.map((it, i) => {
    const isLast = i === items.length - 1;
    return it.href && !isLast
      ? `<a href="${escHtml(it.href)}">${escHtml(it.label)}</a>`
      : `<span aria-current="page">${escHtml(it.label)}</span>`;
  });
  return `<nav class="crumbs" aria-label="Breadcrumb">${parts.join('<span class="crumb-sep">/</span>')}</nav>`;
}

export interface RenderPageOpts {
  title: string;               // <title> + OG title
  metaDescription?: string;    // meta description + OG/twitter description
  canonical?: string;          // absolute canonical URL (also OG:url)
  jsonLd?: string;             // JSON-LD string (already JSON.stringify'd); injected in a <script>
  bodyHtml: string;            // page-specific content, injected inside <main class="container">
}

const FONTS =
`<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Playfair+Display:wght@600;700;800&display=swap" rel="stylesheet">`;

// Professional, trustworthy directory styling — navy brand header, light body, card grid, clean type.
const STYLE =
`:root{--ink:#16202c;--body:#3d4b5a;--muted:#6b7a89;--line:#e4e9ee;--bg:#f7f9fb;--card:#fff;--accent:#1e6fd9;--brand:#0f2740}
*{box-sizing:border-box}
html{-webkit-text-size-adjust:100%}
body{margin:0;background:var(--bg);color:var(--body);font-family:'Inter',system-ui,-apple-system,sans-serif;font-size:16px;line-height:1.65;-webkit-font-smoothing:antialiased}
a{color:var(--accent);text-decoration:none}
a:hover{text-decoration:underline}
img{max-width:100%;display:block}
.container{max-width:1080px;margin:0 auto;padding:0 24px}
/* header */
.site-header{background:var(--brand);color:#fff;position:sticky;top:0;z-index:10}
.site-header .container{display:flex;align-items:center;justify-content:space-between;height:64px;gap:16px}
.brand{font-family:'Playfair Display',Georgia,serif;font-weight:800;font-size:20px;color:#fff;letter-spacing:-.01em;white-space:nowrap}
.brand:hover{text-decoration:none;opacity:.92}
.nav{display:flex;gap:22px;font-size:14px;font-weight:500}
.nav a{color:rgba(255,255,255,.85)}
.nav a:hover{color:#fff;text-decoration:none}
/* hero */
.hero{background:linear-gradient(180deg,#0f2740,#16324f);color:#fff;padding:64px 0 56px;text-align:center}
.hero h1{font-family:'Playfair Display',Georgia,serif;font-weight:800;font-size:clamp(30px,5vw,46px);line-height:1.1;margin:0 0 14px;text-wrap:balance}
.hero p{font-size:clamp(16px,2.2vw,19px);color:rgba(255,255,255,.82);max-width:60ch;margin:0 auto}
/* hero with a background image — the page sets background-image inline; an overlay keeps text legible */
.hero.hero--img{position:relative;background-color:#0f2740;background-size:cover;background-position:center;isolation:isolate}
.hero.hero--img::after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(12,28,46,.66),rgba(12,28,46,.82));z-index:-1}
.hero.hero--img p{color:rgba(255,255,255,.9)}
/* main + sections */
main{display:block;padding-bottom:56px}
.section{padding:48px 0}
.section-head h2{font-family:'Playfair Display',Georgia,serif;font-weight:700;font-size:clamp(22px,3vw,28px);color:var(--ink);margin:0 0 6px}
.section-head .sub{color:var(--muted);margin:0 0 26px}
/* category grid */
.grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(240px,1fr));gap:16px}
.card{display:block;background:var(--card);border:1px solid var(--line);border-radius:12px;padding:20px;transition:box-shadow .15s,border-color .15s,transform .15s}
.card:hover{text-decoration:none;border-color:#cdd8e3;box-shadow:0 6px 22px rgba(15,39,64,.08);transform:translateY(-1px)}
.card h3{font-family:'Playfair Display',Georgia,serif;font-weight:700;font-size:19px;color:var(--ink);margin:0 0 4px;text-transform:capitalize}
.card .count{font-size:13px;color:var(--muted)}
.card .arrow{color:var(--accent);font-size:13px;font-weight:600;margin-top:12px;display:inline-block}
/* business list (category page) */
.biz-list{display:flex;flex-direction:column;gap:14px}
.biz{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:18px 20px;transition:box-shadow .15s,border-color .15s}
.biz:hover{border-color:#cdd8e3;box-shadow:0 6px 22px rgba(15,39,64,.07)}
.biz-head{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin:0 0 4px}
.biz-name{font-family:'Playfair Display',Georgia,serif;font-weight:700;font-size:19px;color:var(--ink);margin:0}
.biz-name a{color:var(--ink)}
.biz-name a:hover{color:var(--accent);text-decoration:none}
.badge{font-size:11px;font-weight:700;letter-spacing:.04em;text-transform:uppercase;color:#17529f;background:#e8f1fd;border:1px solid #cfe2fb;border-radius:999px;padding:2px 9px}
.biz-meta{font-size:14px;color:var(--muted);display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.biz-meta .dot{color:#cdd8e3}
.rating{color:var(--ink);font-weight:600;white-space:nowrap}
.rating .stars{color:#e0a13a;margin-right:3px}
.rating .rc{color:var(--muted);font-weight:400}
.biz-links{margin-top:10px;display:flex;gap:16px;font-size:14px;font-weight:600}
.biz-links a{color:var(--accent)}
/* empty state */
.empty{background:var(--card);border:1px dashed #cdd8e3;border-radius:12px;padding:48px 24px;text-align:center;color:var(--muted)}
.empty h2{font-family:'Playfair Display',Georgia,serif;color:var(--ink);margin:0 0 8px;font-size:22px}
/* breadcrumbs */
.crumbs{font-size:13px;color:var(--muted);padding:18px 0 0}
.crumbs a{color:var(--accent)}
.crumb-sep{margin:0 8px;color:#cdd8e3}
.crumbs span[aria-current]{color:var(--body)}
/* footer */
.site-footer{border-top:1px solid var(--line);background:#fff;padding:32px 0;color:var(--muted);font-size:14px}
.site-footer .brand-f{font-family:'Playfair Display',Georgia,serif;font-weight:700;color:var(--ink);font-size:16px;display:block;margin-bottom:4px}
@media(max-width:640px){.hero{padding:44px 0 40px}.section{padding:34px 0}.site-header .container{height:56px}.nav{gap:16px}}`;

/** The consistent shell. Every directory page passes its head metadata + body HTML through here so
 *  header / nav / footer / styling stay identical across the homepage, category and business pages. */
export function renderDirectoryPage(opts: RenderPageOpts): string {
  const { title, metaDescription, canonical, jsonLd, bodyHtml } = opts;
  const desc = (metaDescription || "").trim();
  const url = (canonical || "").trim();
  // Guard our own JSON-LD string against an accidental </script> breakout.
  const jsonLdSafe = (jsonLd || "").trim().replace(/<\/script/gi, "<\\/script");

  const head =
`<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escHtml(title)}</title>
${desc ? `<meta name="description" content="${escHtml(desc)}">\n` : ""}${url ? `<link rel="canonical" href="${escHtml(url)}">\n` : ""}<meta property="og:type" content="website">
<meta property="og:site_name" content="${escHtml(DIRECTORY_NAME)}">
<meta property="og:title" content="${escHtml(title)}">
${desc ? `<meta property="og:description" content="${escHtml(desc)}">\n` : ""}${url ? `<meta property="og:url" content="${escHtml(url)}">\n` : ""}<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escHtml(title)}">
${desc ? `<meta name="twitter:description" content="${escHtml(desc)}">\n` : ""}${jsonLdSafe ? `<script type="application/ld+json">${jsonLdSafe}</script>\n` : ""}${FONTS}`;

  return (
`<!doctype html>
<html lang="en">
<head>
${head}
<style>${STYLE}</style>
</head>
<body>
<header class="site-header">
<div class="container">
<a class="brand" href="/directory">${escHtml(DIRECTORY_NAME)}</a>
<nav class="nav" aria-label="Primary">
<a href="/directory">Home</a>
</nav>
</div>
</header>
<main>
${bodyHtml}
</main>
<footer class="site-footer">
<div class="container">
<span class="brand-f">${escHtml(DIRECTORY_NAME)}</span>
${escHtml(DIRECTORY_TAGLINE)} — a UK directory helping people find trusted local businesses.
</div>
</footer>
</body>
</html>`
  );
}
