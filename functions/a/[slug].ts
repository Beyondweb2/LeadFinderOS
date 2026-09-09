// Cloudflare Pages Function for /a/:slug — the RETIRED audit-report URL, now a permanent
// redirect onto the one domain audit reports live on.
//
// 🔴 IT USED TO PROXY, AND THAT IS WHY THE DOMAIN NEVER WENT AWAY. This route fetched
// render-audit-report and served the report's HTML AT yoursites.uk/a/<id>, so every pitch link
// already sent (64 of them, the UUID form) rendered a real report on the barber product's domain.
// Paul's call 2026-09-09: "all audit reports should be from the findable.live domain."
//
// ⛔ DELETING THE ROUTE WAS THE WRONG WAY TO DO THAT. Those 64 links are in prospects' phones and
// cannot be edited; a 404 turns an already-sent pitch into a dead end. A 301 keeps every one of
// them working AND moves the address bar onto findable.live, which is the actual requirement.
//
// ⛔ THE IDENTIFIER IS PASSED THROUGH UNCHANGED, AND IT HAS TO BE. render-audit-report accepts
// EITHER a UUID audit id OR a slug ending in the 8-hex audit code, and findable.live/report/<id>
// hands whatever it is straight to that same function — verified live 2026-09-09: a UUID and a
// slug-shaped value both reach render-audit-report's own "Report unavailable" 404 (411 bytes),
// NOT findable.live's home page. So one redirect covers both link shapes and no lookup is needed.
// ⚠️ The old proxy existed because the Supabase gateway serves render-audit-report as text/plain;
// that concern belongs to findable-site's functions/report/[id].ts now, which forces text/html.

/** Where audit reports live. The ONLY origin this file may send anyone to. */
const REPORT_PUBLIC_ORIGIN = "https://findable.live";

/** Crawlable, noindex dead end for a request with no identifier — never a bare redirect to the
 *  report root, which would just be findable.live's own 404 with an extra hop. */
function notFound(): Response {
  const html =
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1"><title>Report unavailable</title>` +
    `<meta name="robots" content="noindex"></head>` +
    `<body style="font-family:system-ui,sans-serif;max-width:640px;margin:80px auto;padding:0 20px;color:#0f172a">` +
    `<h1>Report unavailable</h1><p>This report doesn’t exist or isn’t published.</p></body></html>`;
  return new Response(html, {
    status: 404,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=0, must-revalidate" },
  });
}

export const onRequestGet = (context: { request: Request; params: Record<string, string> }) => {
  const slug = String(context.params.slug || "").trim();
  if (!slug) return notFound();

  /* encodeURIComponent on the DECODED param, so a value that arrived percent-encoded is not
     double-encoded on the way out. Both accepted shapes (UUID, name-plus-8-hex slug) are
     already URL-safe, so in practice this is a no-op guard rather than a transformation. */
  const target = `${REPORT_PUBLIC_ORIGIN}/report/${encodeURIComponent(slug)}`;

  return new Response(null, {
    status: 301,
    headers: {
      location: target,
      // Same robots posture as the report itself: a prospect's competitor list must never be
      // indexed, and neither should the hop that leads to it.
      "x-robots-tag": "noindex, nofollow",
      "cache-control": "public, max-age=3600",
    },
  });
};
