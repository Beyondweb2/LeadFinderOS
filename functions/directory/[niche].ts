// Cloudflare Pages Function for /directory/:niche — a category page listing real businesses.
//
// Fully server-rendered via the shared shell (./_shared). Queries directory_businesses for the niche
// (same anon-key + Supabase REST method as functions/directory/index.ts), ordered clients-first then
// by rating/review_count, and renders a category hero + a list of business cards. Each card links to
// the business page /directory/<niche>/<slug> (built in piece 3). No businesses → a graceful 404.

import {
  renderDirectoryPage, renderBreadcrumbs, escHtml, slugify, nicheLabel, nicheHeroImage, areaLabel,
  renderRankedCard, HERO_WAVE, DIRECTORY_NAME, type DirectoryBiz,
} from "./_shared";

const SUPABASE_URL = "https://ruusxpkkmwtljxxulhbq.supabase.co";
// Public anon key (safe to embed — identical to functions/r/[slug].ts).
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ1dXN4cGtrbXd0bGp4eHVsaGJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExODgzMzUsImV4cCI6MjA5Njc2NDMzNX0.4PoMZXJS0RDEHyK6wa9k0Q8F0fo2u1e7PMVegJ6nNbw";

export const onRequestGet = async (context: { request: Request; params: Record<string, string> }) => {
  const origin = new URL(context.request.url).origin;
  const niche = String(context.params.niche || "").trim().toLowerCase();
  if (!niche) return categoryNotFound(origin, niche);

  const label = nicheLabel(niche);
  const canonical = `${origin}/directory/${encodeURIComponent(niche)}`;

  // Clients featured near the top, then best-rated, then most-reviewed. NULLs sort last so
  // unrated firms don't outrank rated ones. Same anon-key + REST read as the homepage.
  let rows: DirectoryBiz[] = [];
  try {
    const apiUrl = `${SUPABASE_URL}/rest/v1/directory_businesses` +
      `?niche=eq.${encodeURIComponent(niche)}` +
      `&select=name,website,phone,address,city,postal_code,category,rating,review_count,is_client,lead_id,area` +
      `&order=is_client.desc,rating.desc.nullslast,review_count.desc.nullslast`;
    const r = await fetch(apiUrl, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    });
    if (r.ok) {
      const data = await r.json();
      if (Array.isArray(data)) rows = data as DirectoryBiz[];
    }
  } catch {
    // network/parse failure → treat as no listings (graceful 404 below)
  }

  const businesses = rows.filter((b) => (b.name || "").trim());
  if (businesses.length === 0) return categoryNotFound(origin, niche);

  // Distinct areas for this niche → the "Browse by area" links (local-intent pages at
  // /directory/<niche>/<area>). Sorted alphabetically; "uk" (national) kept but shown as "UK".
  const areas = [...new Set(businesses.map((b) => (b.area || "").trim().toLowerCase()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b));

  const title = `${label} in the UK — ${DIRECTORY_NAME}`;
  const metaDescription =
    `Compare ${label.toLowerCase()} in the UK — ratings, reviews and services, side by side. ` +
    `Find a trusted firm and check their credentials before you get in touch.`;

  // JSON-LD: an ItemList of the businesses in listed order.
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: `${label} in the UK`,
    url: canonical,
    numberOfItems: businesses.length,
    itemListElement: businesses.map((b, i) => ({
      "@type": "ListItem",
      position: i + 1,
      item: {
        "@type": "LocalBusiness",
        name: (b.name || "").trim(),
        url: `${origin}/directory/${encodeURIComponent(niche)}/${slugify(b.name || "")}`,
        ...(b.website ? { sameAs: b.website } : {}),
        ...(b.address || b.city ? {
          address: { "@type": "PostalAddress", streetAddress: b.address || undefined, addressLocality: b.city || undefined, postalCode: b.postal_code || undefined },
        } : {}),
        ...(typeof b.rating === "number" ? {
          aggregateRating: { "@type": "AggregateRating", ratingValue: b.rating, reviewCount: b.review_count || undefined },
        } : {}),
      },
    })),
  });

  const crumbs = renderBreadcrumbs([{ label: "Home", href: "/directory" }, { label }]);

  const hero =
`<section class="hero hero--img" style="background-image:url('${nicheHeroImage(niche)}')">
<div class="container">
<h1>Best ${escHtml(label)} in the UK</h1>
<p>Compare ${escHtml(label.toLowerCase())} across the country — check ratings, reviews and credentials, then choose the firm that fits. Featured clients are marked, and listed honestly among the rest.</p>
</div>
${HERO_WAVE}
</section>`;

  // RANKED, NUMBERED cards via the shared helper (same markup as the area page). Query order =
  // clients first, then rating, then reviews, so the rank number reflects the honest "best of" order.
  const cards = businesses.map((b, i) => renderRankedCard(b, i, niche)).join("\n");

  // "Browse by area" — local-intent links into /directory/<niche>/<area>. Only when areas exist.
  const areaSection = areas.length
    ? `<section class="section" style="padding-bottom:0">
<div class="container">
<div class="section-head">
<h2>Browse by area</h2>
<p class="sub">Find ${escHtml(label.toLowerCase())} in a specific town or city.</p>
</div>
<div class="area-links">
${areas.map((a) => `<a href="/directory/${encodeURIComponent(niche)}/${encodeURIComponent(a)}">${escHtml(areaLabel(a))}</a>`).join("\n")}
</div>
</div>
</section>`
    : "";

  const listSection =
`<section class="section">
<div class="container">
${crumbs}
<div class="section-head" style="margin-top:14px">
<h2>${businesses.length} best ${escHtml(label.toLowerCase())}, ranked</h2>
<p class="sub">Ranked by rating and reviews. Featured clients appear near the top but are listed alongside everyone else — the ranking is honest.</p>
</div>
<div class="rank-list">
${cards}
</div>
</div>
</section>`;

  const html = renderDirectoryPage({ title, metaDescription, canonical, jsonLd, bodyHtml: `${hero}\n${areaSection}\n${listSection}` });
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300, s-maxage=300" },
  });
};

/** Graceful 404 for a niche with no businesses (or not yet anon-readable). Uses the shared shell so
 *  the header/nav/footer stay consistent; noindex-friendly via a 404 status. */
function categoryNotFound(origin: string, niche: string): Response {
  const label = niche ? nicheLabel(niche) : "Category";
  const crumbs = renderBreadcrumbs([{ label: "Home", href: "/directory" }, { label }]);
  const body =
`<section class="section">
<div class="container">
${crumbs}
<div class="empty" style="margin-top:16px">
<h2>No listings yet</h2>
<p>We don't have any ${escHtml(niche ? label.toLowerCase() : "businesses")} in the directory yet. <a href="/directory">Browse other categories</a>.</p>
</div>
</div>
</section>`;
  const html = renderDirectoryPage({
    title: `${label} — ${DIRECTORY_NAME}`,
    metaDescription: `No ${escHtml(niche ? label.toLowerCase() : "businesses")} are listed in the ${DIRECTORY_NAME} directory yet.`,
    canonical: `${origin}/directory/${encodeURIComponent(niche)}`,
    bodyHtml: body,
    noindex: true,
  });
  return new Response(html, {
    status: 404,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=0, must-revalidate" },
  });
}
