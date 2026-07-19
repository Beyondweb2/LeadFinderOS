// Cloudflare Pages Function for /directory/:niche/:slug — a single business profile page.
//
// Fully server-rendered via the shared Findable shell (../_shared). directory_businesses has no slug
// column, so we fetch the niche's rows (anon key + Supabase REST, same method as the category page)
// and match the one whose slugify(name) === the URL slug. Shows the AI description (falling back to a
// data-derived sentence), NAP + rating, a hero image, breadcrumbs, and — for clients with a published
// business_reports row (matched via lead_id) — a prominent link to their full /r/ report.

import {
  renderDirectoryPage, renderBreadcrumbs, escHtml, slugify, nicheLabel,
  IMG_OFFICE, IMG_DESK, DIRECTORY_NAME,
} from "../_shared";

const SUPABASE_URL = "https://ruusxpkkmwtljxxulhbq.supabase.co";
// Public anon key (safe to embed — identical to functions/r/[slug].ts).
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ1dXN4cGtrbXd0bGp4eHVsaGJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExODgzMzUsImV4cCI6MjA5Njc2NDMzNX0.4PoMZXJS0RDEHyK6wa9k0Q8F0fo2u1e7PMVegJ6nNbw";

const ANON_HEADERS = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` };

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
  description?: string | null;
}

/** Deterministic hero image so a given business always shows the same one (cycles the proven IDs). */
function heroFor(slug: string): string {
  const imgs = [IMG_OFFICE, IMG_DESK];
  const sum = [...slug].reduce((a, c) => a + c.charCodeAt(0), 0);
  return imgs[sum % imgs.length];
}

/** Fallback factual description from the row's own data (used when the AI description is null). */
function fallbackDescription(b: BizRow, singular: string): string {
  const noun = ((b.category || "").trim() || singular).toLowerCase();
  const where = (b.city || "").trim() || (b.address || "").trim();
  let s = where ? `A ${noun} based in ${where}.` : `A ${noun}.`;
  if (typeof b.rating === "number" && isFinite(b.rating)) {
    const rc = typeof b.review_count === "number" && b.review_count > 0
      ? ` from ${b.review_count} review${b.review_count === 1 ? "" : "s"}` : "";
    s += ` Rated ${b.rating.toFixed(1)} out of 5${rc}.`;
  }
  return s;
}

function ratingHtml(rating: number | null | undefined, reviewCount: number | null | undefined): string {
  if (typeof rating !== "number" || !isFinite(rating)) return "";
  const rc = typeof reviewCount === "number" && reviewCount > 0 ? ` <span class="rc">(${reviewCount})</span>` : "";
  return `<span class="rating"><span class="stars">&#9733;</span>${rating.toFixed(1)}${rc}</span>`;
}

export const onRequestGet = async (context: { request: Request; params: Record<string, string> }) => {
  const origin = new URL(context.request.url).origin;
  const niche = String(context.params.niche || "").trim().toLowerCase();
  const slug = String(context.params.slug || "").trim().toLowerCase();
  if (!niche || !slug) return businessNotFound(origin, niche);

  // No slug column → fetch the niche's rows and match by slugified name. Clients first so a slug
  // collision resolves to the client. Same anon-key + REST read as the category page.
  let match: BizRow | null = null;
  try {
    const apiUrl = `${SUPABASE_URL}/rest/v1/directory_businesses` +
      `?niche=eq.${encodeURIComponent(niche)}` +
      `&select=name,website,phone,address,city,postal_code,category,rating,review_count,is_client,lead_id,description` +
      `&order=is_client.desc,rating.desc.nullslast`;
    const r = await fetch(apiUrl, { headers: ANON_HEADERS });
    if (r.ok) {
      const rows = await r.json();
      if (Array.isArray(rows)) {
        match = (rows as BizRow[]).find((b) => slugify(b.name || "") === slug) ?? null;
      }
    }
  } catch {
    // network/parse failure → not found
  }

  if (!match || !(match.name || "").trim()) return businessNotFound(origin, niche);

  const b = match;
  const name = (b.name || "").trim();
  const label = nicheLabel(niche);
  const canonical = `${origin}/directory/${encodeURIComponent(niche)}/${slug}`;
  const description = (b.description || "").trim() || fallbackDescription(b, niche);

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
