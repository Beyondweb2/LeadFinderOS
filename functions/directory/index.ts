// Cloudflare Pages Function for /directory — the directory homepage.
//
// Fully server-rendered (via the shared shell in ./_shared). Queries directory_businesses with the
// PUBLIC anon key + Supabase REST (the same method as functions/r/[slug].ts), derives the DISTINCT
// niches present + a count per niche, and renders a hero + a grid of category cards linking to
// /directory/<niche>. No data → a graceful "coming soon" instead of an empty page.

import { renderDirectoryPage, escHtml, nicheLabel, IMG_OFFICE, HERO_WAVE, DIRECTORY_NAME, DIRECTORY_TAGLINE } from "./_shared";

const SUPABASE_URL = "https://ruusxpkkmwtljxxulhbq.supabase.co";
// Public anon key (safe to embed — already public in the client bundle; identical to functions/r/[slug].ts).
const SUPABASE_ANON_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InJ1dXN4cGtrbXd0bGp4eHVsaGJxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExODgzMzUsImV4cCI6MjA5Njc2NDMzNX0.4PoMZXJS0RDEHyK6wa9k0Q8F0fo2u1e7PMVegJ6nNbw";

interface NicheRow { niche?: string }

export const onRequestGet = async (context: { request: Request; params: Record<string, string> }) => {
  const origin = new URL(context.request.url).origin; // correct canonical/OG wherever this is served
  const canonical = `${origin}/directory`;

  // Pull the niches present. RLS/anon-read gates which rows are visible; a blocked/empty read just
  // yields the "coming soon" state below (never a broken page). Capped at PostgREST's default page.
  let rows: NicheRow[] = [];
  try {
    const apiUrl = `${SUPABASE_URL}/rest/v1/directory_businesses?select=niche`;
    const r = await fetch(apiUrl, {
      headers: { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${SUPABASE_ANON_KEY}` },
    });
    if (r.ok) {
      const data = await r.json();
      if (Array.isArray(data)) rows = data as NicheRow[];
    }
  } catch {
    // network/parse failure → treat as no data (graceful coming-soon)
  }

  // Distinct niches + counts (aggregated here; directory_businesses has no server-side group view yet).
  const counts = new Map<string, number>();
  for (const row of rows) {
    const n = (row.niche || "").trim().toLowerCase();
    if (!n) continue;
    counts.set(n, (counts.get(n) || 0) + 1);
  }
  const niches = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));

  const title = `${DIRECTORY_NAME} — ${DIRECTORY_TAGLINE}`;
  const metaDescription =
    "A UK business directory helping people find trusted local firms — browse by category to compare businesses in your area.";

  // JSON-LD: the directory as a WebSite + a CollectionPage listing the category links.
  const jsonLd = JSON.stringify({
    "@context": "https://schema.org",
    "@type": "CollectionPage",
    name: title,
    description: metaDescription,
    url: canonical,
    isPartOf: { "@type": "WebSite", name: DIRECTORY_NAME, url: `${origin}/directory` },
    hasPart: niches.map(([niche]) => ({
      "@type": "CollectionPage",
      name: nicheLabel(niche),
      url: `${origin}/directory/${encodeURIComponent(niche)}`,
    })),
  });

  // Hero with the proven office image behind a dark overlay (see .hero--img in _shared).
  const hero =
`<section class="hero hero--img" style="background-image:url('${IMG_OFFICE}')">
<div class="container">
<h1>Find trusted UK businesses</h1>
<p>Browse local firms by category, compare them side by side, and find the right one for you — accountants, tradespeople and more, all in one place.</p>
</div>
${HERO_WAVE}
</section>`;

  let categoriesSection: string;
  if (niches.length === 0) {
    // Graceful empty state — no data yet (or anon read not yet enabled).
    categoriesSection =
`<section class="section">
<div class="container">
<div class="empty">
<h2>Coming soon</h2>
<p>We're building this directory now. Categories and listings will appear here shortly.</p>
</div>
</div>
</section>`;
  } else {
    const cards = niches.map(([niche, count]) => {
      const label = nicheLabel(niche);
      const href = `/directory/${encodeURIComponent(niche)}`;
      const noun = count === 1 ? "business" : "businesses";
      return (
`<a class="card" href="${escHtml(href)}">
<h3>${escHtml(label)}</h3>
<div class="count">${count} ${noun}</div>
<span class="arrow">Browse ${escHtml(label.toLowerCase())} &rarr;</span>
</a>`
      );
    }).join("\n");
    const catNoun = niches.length === 1 ? "category" : "categories";
    categoriesSection =
`<section class="section">
<div class="container">
<div class="section-head">
<h2>Browse by category</h2>
<p class="sub">${niches.length} ${catNoun} of trusted UK businesses.</p>
</div>
<div class="grid">
${cards}
</div>
</div>
</section>`;
  }

  const bodyHtml = `${hero}\n${categoriesSection}`;

  const html = renderDirectoryPage({ title, metaDescription, canonical, jsonLd, bodyHtml });

  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=300, s-maxage=300" },
  });
};
