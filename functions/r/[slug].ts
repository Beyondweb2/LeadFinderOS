// Cloudflare Pages Function for /r/:slug — RETIRED 2026-10-01 (Paul). Every URL answers 410 Gone.
//
// This route served the public "business profile" listings: gpt-4o pages written about one business,
// published under the business's own name (the JSON-LD named it as author and publisher), canonical
// yoursites.uk/r/<slug>. The feature was retired and its generator (fn generate-report) answers 410
// too. Record: docs/r-profile-pages-audit.md.
//
// ⛔ 410, NOT 404, AND NO DATABASE READ. 410 tells a crawler the page is gone on purpose, so it drops
// out of any index instead of being retried. Nothing is fetched: the content must not be reachable
// at all, from any host this project answers on.
//
// ⛔ THE business_reports ROWS ARE KEPT. render-audit-report still resolves the legacy
// name-plus-8-hex REPORT slug (findable.live/report/<slug>) through them. That is a different URL on
// a different host; this file never served it.
//
// ⚠️ NOT findable.live/r/<code>. That is the live short report link and lives in the findable-site
// repo (functions/r/[code].ts). It is unrelated to this file.

const GONE_HTML =
  `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
  `<meta name="viewport" content="width=device-width, initial-scale=1"><title>Page removed</title>` +
  `<meta name="robots" content="noindex, nofollow"></head>` +
  `<body style="font-family:system-ui,sans-serif;max-width:640px;margin:80px auto;padding:0 20px;color:#0f172a">` +
  `<h1>This page has been removed</h1><p>This business profile is no longer published.</p></body></html>`;

export const onRequest = async (): Promise<Response> =>
  new Response(GONE_HTML, {
    status: 410,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "x-robots-tag": "noindex, nofollow",
      "cache-control": "public, max-age=3600",
    },
  });
