// Cloudflare Pages Function for /directory/:niche/:slug — a SMART handler: the second segment is
// either an AREA (a town/city with businesses in this niche) → renders a local area listing, OR a
// business SLUG → renders that business profile. Areas take precedence if a value could match both
// (towns vs business names rarely collide). Neither → a graceful 404.
//
// Both /directory/:niche/:slug shapes route here (Cloudflare can't have [slug].ts AND [area].ts at the
// same depth), so one function disambiguates. Fully SSR via the shared Findable shell (../_shared);
// data read with the anon key + Supabase REST, same method as the category page.

import {
  renderDirectoryPage, renderBreadcrumbs, escHtml, slugify, nicheLabel, nicheHeroImage, areaLabel,
  renderRankedCard, ratingHtml, describeBusiness, HERO_WAVE,
  IMG_OFFICE, IMG_DESK, DIRECTORY_NAME, type DirectoryBiz,
} from "../_shared";

const SUPABASE_URL = "https://ruusxpkkmwtljxxulhbq.supabase.co";
// Public anon key (safe to embed — identical to functions/r/[slug].ts).
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ1dXN4cGtrbXd0bGp4eHVsaGJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExODgzMzUsImV4cCI6MjA5Njc2NDMzNX0.4PoMZXJS0RDEHyK6wa9k0Q8F0fo2u1e7PMVegJ6nNbw";

const ANON_HEADERS = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };

/** Deterministic hero image so a given business always shows the same one (cycles the proven IDs). */
function heroFor(slug: string): string {
  const imgs = [IMG_OFFICE, IMG_DESK];
  const sum = [...slug].reduce((a, c) => a + c.charCodeAt(0), 0);
  return imgs[sum % imgs.length];
}

export const onRequestGet = async (context: { request: Request; params: Record<string, string> }) => {
  const origin = new URL(context.request.url).origin;
  const niche = String(context.params.niche || "").trim().toLowerCase();
  const segment = String(context.params.slug || "").trim().toLowerCase();
  if (!niche || !segment) return businessNotFound(origin, niche);

  // ONE fetch of the niche's rows serves both branches. Clients first so a slug collision resolves
  // to the client; review_count breaks rating ties (matches the category/area ranking).
  let rows: DirectoryBiz[] = [];
  try {
    const apiUrl = `${SUPABASE_URL}/rest/v1/directory_businesses` +
      `?niche=eq.${encodeURIComponent(niche)}` +
      `&select=name,website,phone,address,city,postal_code,category,rating,review_count,is_client,lead_id,description,area` +
      `&order=is_client.desc,rating.desc.nullslast,review_count.desc.nullslast`;
    const r = await fetch(apiUrl, { headers: ANON_HEADERS });
    if (r.ok) {
      const data = await r.json();
      if (Array.isArray(data)) rows = data as DirectoryBiz[];
    }
  } catch {
    // network/parse failure → not found
  }

  // DISAMBIGUATE. Areas take precedence: if the segment matches a distinct area value for this niche,
  // render the local area listing; otherwise try to match a business by slugified name.
  const areaSet = new Set(rows.map((b) => (b.area || "").trim().toLowerCase()).filter(Boolean));
  if (areaSet.has(segment)) {
    const inArea = rows.filter((b) => (b.area || "").trim().toLowerCase() === segment && (b.name || "").trim());
    return renderAreaPage(origin, niche, segment, inArea);
  }

  const match = rows.find((b) => slugify(b.name || "") === segment) ?? null;
  if (!match || !(match.name || "").trim()) return businessNotFound(origin, niche);
  const slug = segment;

  const b = match;
  const name = (b.name || "").trim();
  const label = nicheLabel(niche);
  const canonical = `${origin}/directory/${encodeURIComponent(niche)}/${slug}`;
  const description = (b.description || "").trim() || describeBusiness(b, niche);

  // Client → their published business_reports profile (matched by lead_id). Best-effort; failure = no link.
  let reportSlug = "";
  if (b.is_client && b.lead_id) {
    try {
      const rr = await fetch(
        `${SUPABASE_URL}/rest/v1/business_reports?lead_id=eq.${encodeURIComponent(b.lead_id)}` +
        `&status=eq.published&select=slug&order=created_at.desc&limit=1`,
        { headers: ANON_HEADERS },
      );
      if (rr.ok) {
        const rows = await rr.json();
        if (Array.isArray(rows) && rows[0]?.slug) reportSlug = String(rows[0].slug);
      }
    } catch { /* no report link */ }
  }

  const title = `${name} — ${label} — ${DIRECTORY_NAME}`;
  const metaDescription = description.slice(0, 300);

  // JSON-LD: LocalBusiness with the real NAP + rating (only fields the data supports).
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "LocalBusiness",
    name,
    url: canonical,
    description,
    ...(b.website ? { sameAs: b.website } : {}),
    ...(b.phone ? { telephone: b.phone } : {}),
    ...(b.category ? { additionalType: b.category } : {}),
    ...(b.address || b.city || b.postal_code ? {
      address: {
        "@type": "PostalAddress",
        streetAddress: b.address || undefined,
        addressLocality: b.city || undefined,
        postalCode: b.postal_code || undefined,
        addressCountry: "GB",
      },
    } : {}),
    ...(typeof b.rating === "number" ? {
      aggregateRating: { "@type": "AggregateRating", ratingValue: b.rating, reviewCount: b.review_count || undefined },
    } : {}),
  });

  const crumbs = renderBreadcrumbs([
    { label: "Home", href: "/directory" },
    { label, href: `/directory/${encodeURIComponent(niche)}` },
    { label: name },
  ]);

  const badge = b.is_client ? `<span class="featured">Featured</span>` : "";
  const rating = ratingHtml(b.rating, b.review_count);

  // Meta chips: rating · category · city (only what we have).
  const chips: string[] = [];
  if (rating) chips.push(rating);
  if ((b.category || "").trim()) chips.push(escHtml((b.category as string).trim()));
  if ((b.city || "").trim()) chips.push(escHtml((b.city as string).trim()));
  const chipLine = chips.join('<span class="dot">&middot;</span>');

  // NAP rows (address / phone / website), only when present.
  const napRows: string[] = [];
  const fullAddr = [b.address, b.city, b.postal_code].map((x) => (x || "").trim()).filter(Boolean).join(", ");
  if (fullAddr) napRows.push(`<div><strong>Address</strong> ${escHtml(fullAddr)}</div>`);
  if ((b.phone || "").trim()) napRows.push(`<div><strong>Phone</strong> ${escHtml((b.phone as string).trim())}</div>`);
  const website = (b.website || "").trim();
  if (website) napRows.push(`<div><strong>Website</strong> <a href="${escHtml(website)}" target="_blank" rel="nofollow noopener">${escHtml(website.replace(/^https?:\/\//i, ""))} &#8599;</a></div>`);

  const reportCta = reportSlug
    ? `<a class="report-cta" href="${escHtml(`/r/${reportSlug}`)}">View full profile &rarr;</a>` : "";

  const hero =
`<section class="hero hero--img" style="background-image:url('${heroFor(slug)}')">
<div class="container">
<div class="biz-hero-head">${badge}</div>
<h1>${escHtml(name)}</h1>
${chipLine ? `<p class="biz-hero-meta">${chipLine}</p>` : ""}
</div>
</section>`;

  const body =
`${hero}
<section class="section">
<div class="container">
${crumbs}
<div class="biz-profile" style="margin-top:16px">
<p class="biz-lead">${escHtml(description)}</p>
${napRows.length ? `<div class="biz-nap">${napRows.join("\n")}</div>` : ""}
${reportCta ? `<div class="biz-report">${reportCta}<p class="note">This business is a verified ${DIRECTORY_NAME} client — see their full profile.</p></div>` : ""}
<p class="biz-back"><a href="/directory/${encodeURIComponent(niche)}">&larr; Back to ${escHtml(label.toLowerCase())}</a></p>
</div>
</div>
</section>`;

  const html = renderDirectoryPage({ title, metaDescription, canonical, jsonLd, bodyHtml: body });
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300, s-maxage=300" },
  });
};

/** AREA page — "<Niche>s in <Area>" — ranked businesses in this niche+area (local intent). Same
 *  ranked-card style as the category page; each card links to the business profile. `businesses` is
 *  already ordered (clients first, then rating, then reviews) and pre-filtered to the area. */
function renderAreaPage(origin: string, niche: string, area: string, businesses: DirectoryBiz[]): Response {
  const label = nicheLabel(niche);
  const areaLbl = areaLabel(area);
  const canonical = `${origin}/directory/${encodeURIComponent(niche)}/${encodeURIComponent(area)}`;
  const heading = `${label} in ${areaLbl}`;

  const title = `${heading} — ${DIRECTORY_NAME}`;
  const metaDescription =
    `Compare the best ${label.toLowerCase()} in ${areaLbl} — ratings, reviews and credentials, side by side. ` +
    `Find a trusted local firm and check them before you get in touch.`;

  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "ItemList",
    name: heading,
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
          address: { "@type": "PostalAddress", streetAddress: b.address || undefined, addressLocality: b.city || undefined, postalCode: b.postal_code || undefined, addressCountry: "GB" },
        } : {}),
        ...(typeof b.rating === "number" ? {
          aggregateRating: { "@type": "AggregateRating", ratingValue: b.rating, reviewCount: b.review_count || undefined },
        } : {}),
      },
    })),
  });

  const crumbs = renderBreadcrumbs([
    { label: "Home", href: "/directory" },
    { label, href: `/directory/${encodeURIComponent(niche)}` },
    { label: areaLbl },
  ]);

  const hero =
`<section class="hero hero--img" style="background-image:url('${nicheHeroImage(niche)}')">
<div class="container">
<h1>${escHtml(heading)}</h1>
<p>Compare ${escHtml(label.toLowerCase())} in ${escHtml(areaLbl)} — check ratings, reviews and credentials, then choose a trusted local firm. Featured clients are marked, and listed honestly among the rest.</p>
</div>
${HERO_WAVE}
</section>`;

  const cards = businesses.map((b, i) => renderRankedCard(b, i, niche)).join("\n");
  const listSection =
`<section class="section">
<div class="container">
${crumbs}
<div class="section-head" style="margin-top:14px">
<h2>${businesses.length} best ${escHtml(label.toLowerCase())} in ${escHtml(areaLbl)}, ranked</h2>
<p class="sub">Ranked by rating and reviews. <a href="/directory/${encodeURIComponent(niche)}">Back to all ${escHtml(label.toLowerCase())}</a>.</p>
</div>
<div class="rank-list">
${cards}
</div>
</div>
</section>`;

  const html = renderDirectoryPage({ title, metaDescription, canonical, jsonLd, bodyHtml: `${hero}\n${listSection}` });
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300, s-maxage=300" },
  });
}

/** Graceful, noindex 404 when no business matches — kept in the Findable shell. */
function businessNotFound(origin: string, niche: string): Response {
  const label = niche ? nicheLabel(niche) : "Directory";
  const crumbs = renderBreadcrumbs([
    { label: "Home", href: "/directory" },
    ...(niche ? [{ label, href: `/directory/${encodeURIComponent(niche)}` }] : []),
    { label: "Not found" },
  ]);
  const body =
`<section class="section">
<div class="container">
${crumbs}
<div class="empty" style="margin-top:16px">
<h2>Business not found</h2>
<p>We couldn't find that business. <a href="/directory/${encodeURIComponent(niche)}">Browse ${escHtml(label.toLowerCase())}</a> or <a href="/directory">start over</a>.</p>
</div>
</div>
</section>`;
  const html = renderDirectoryPage({
    title: `Not found — ${DIRECTORY_NAME}`,
    metaDescription: "",
    canonical: `${origin}/directory/${encodeURIComponent(niche)}`,
    bodyHtml: body,
    noindex: true,
  });
  return new Response(html, {
    status: 404,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=0, must-revalidate" },
  });
}
