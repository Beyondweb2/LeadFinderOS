// A MISSING /assets FILE IS A 404, NEVER index.html (2026-11-17).
//
// A page opened before a deploy still asks for the OLD hashed chunk names. The SPA fallback in public/_redirects
// ("/*  /index.html  200") used to answer those with index.html, so iPad Safari showed "Something went wrong.
// 'text/html' is not a valid JavaScript MIME type". public/_redirects now rewrites any /assets path that has no file
// to this function (a 200 rewrite only applies when no static file matches, so real chunks are never touched and
// this function is invoked only for missing ones). A 404 makes the browser report a plain failed import, which
// src/lib/staleChunk.ts recognises and cures with one reload.
//
// no-store: a missing chunk must never be cached as anything (the /assets rule in _headers is a 1-year cache).
export const onRequest = (): Response =>
  new Response('Not found: this file is from an older version of the app. Reload the page.', {
    status: 404,
    headers: { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' },
  });
