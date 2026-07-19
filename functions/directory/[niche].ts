// Cloudflare Pages Function for /directory/:niche — a category page listing real businesses.
//
// Fully server-rendered via the shared shell (./_shared). Queries directory_businesses for the niche
// (same anon-key + Supabase REST method as functions/directory/index.ts), ordered clients-first then
// by rating/review_count, and renders a category hero + a list of business cards. Each card links to
// the business page /directory/<niche>/<slug> (built in piece 3). No businesses → a graceful 404.

import {
  renderDirectoryPage, renderBreadcrumbs, escHtml, slugify, nicheLabel, nicheHeroImage,
  DIRECTORY_NAME,
} from "./_shared";

const SUPABASE_URL = "https://ruusxpkkmwtljxxulhbq.supabase.co";
// Public anon key (safe to embed — identical to functions/r/[slug].ts).
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ1dXN4cGtrbXd0bGp4eHVsaGJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExODgzMzUsImV4cCI6MjA5Njc2NDMzNX0.4PoMZXJS0RDEHyK6wa9k0Q8F0fo2u1e7PMVegJ6nNbw";

interface BizRow {
  name?: string;
  website?: string | null;
  phone?: string | null;
  address?: string | null;
  city?: string | null;
  postal_code?: string | null;
  category?: string | null;
  rating?: number | null;
  review_count?: number | null;
  is_client?: boolean | null;
  lead_id?: string | null;
}

/** Rating snippet: "★ 4.8 (123)" — omitted entirely when there's no rating. */
function ratingHtml(rating: number | null | undefined, reviewCount: number | null | undefined): string {
  if (typeof rating !== "number" || !isFinite(rating)) return "";
  const rc = typeof reviewCount === "number" && reviewCount > 0
    ? ` <span class="rc">(${reviewCount})</span>` : "";
  return `<span class="rating"><span class="stars">&#9733;</span>${rating.toFixed(1)}${rc}</span>`;
}

export const onRequestGet = async (context: { request: Request; params: Record<string, string> }) => {
  const origin = new URL(context.request.url).origin;
  const niche = String(context.params.niche || "").trim().toLowerCase();
  if (!niche) return categoryNotFound(origin, niche);

  const label = nicheLabel(niche);
  const canonical = `${origin}/directory/${encodeURIComponent(niche)}`;

  // Clients featured near the top, then best-rated, then most-reviewed. NULLs sort last so
  // unrated firms don't outrank rated ones. Same anon-key + REST read as the homepage.
  let rows: BizRow[] = [];
  try {
    const apiUrl = `${SUPABASE_URL}/rest/v1/directory_businesses` +
      `?niche=eq.${encodeURIComponent(niche)}` +
      `&select=name,website,phone,address,city,postal_code,category,rating,review_count,is_client,lead_id` +
      `&order=is_client.desc,rating.desc.nullslast,review_count.desc.nullslast`;
    const r = await fetch(apiUrl, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    });
    if (r.ok) {
      const data = await r.json();
      if (Array.isArray(data)) rows = data as BizRow[];
    }
  } catch {
    // network/parse failure → treat as no listings (graceful 404 below)
  }

  const businesses = rows.filter((b) => (b.name || "").trim());
  if (businesses.length === 0) return categoryNotFound(origin, niche);

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
<h1>${escHtml(label)} in the UK</h1>
<p>Compare ${escHtml(label.toLowerCase())} across the country — check ratings, reviews and credentials, then choose the firm that fits. Verified clients are marked, and listed honestly among the rest.</p>
</div>
</section>`;

  const cards = businesses.map((b) => {
    const name = (b.name || "").trim();
    const href = `/directory/${encodeURIComponent(niche)}/${slugify(name)}`;
    const badge = b.is_client ? `<span class="badge">Verified</span>` : "";
    const rating = ratingHtml(b.rating, b.review_count);
    // Meta line: rating · category · city, separated by dots (only the parts we have).
    const metaBits: string[] = [];
    if (rating) metaBits.push(rating);
    if ((b.category || "").trim()) metaBits.push(escHtml((b.category as string).trim()));
    if ((b.city || "").trim()) metaBits.push(escHtml((b.city as string).trim()));
    const meta = metaBits.join('<span class="dot">&middot;</span>');
    const website = (b.website || "").trim();
    const websiteLink = website
      ? `<a href="${escHtml(website)}" target="_blank" rel="nofollow noopener">Visit website &#8599;</a>` : "";
    return (
`<article class="biz">
<div class="biz-head"><h3 class="biz-name"><a href="${escHtml(href)}">${escHtml(name)}</a></h3>${badge}</div>
${meta ? `<div class="biz-meta">${meta}</div>\n` : ""}<div class="biz-links"><a href="${escHtml(href)}">View profile &rarr;</a>${websiteLink}</div>
</article>`
    );
  }).join("\n");

  const listSection =
`<section class="section">
<div class="container">
${crumbs}
<div class="section-head" style="margin-top:14px">
<h2>${businesses.length} ${escHtml(label.toLowerCase())} listed</h2>
<p class="sub">Ordered by rating and reviews. Verified clients appear near the top but are listed alongside everyone else.</p>
</div>
<div class="biz-list">
${cards}
</div>
</div>
</section>`;

  const html = renderDirectoryPage({ title, metaDescription, canonical, jsonLd, bodyHtml: `${hero}\n${listSection}` });
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
    metaDescription: "",
    canonical: `${origin}/directory/${encodeURIComponent(niche)}`,
    bodyHtml: body,
  });
  return new Response(html, {
    status: 404,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=0, must-revalidate" },
  });
}
