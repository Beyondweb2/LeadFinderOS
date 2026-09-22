// render-welcome-pack — PUBLIC (no-auth) server-rendered Welcome Pack page for a paid client.
//
// The /w/ sibling of render-audit-report. Given ?slug=<short code|audit uuid> it resolves the PAID
// BASELINE audit, checks that a lead actually claims it as its baseline, and returns the complete
// self-contained Welcome Pack document — the same HTML the operator's Download button prints,
// because both call _shared/welcome-pack-render.ts and nothing else.
//
// ⛔ THE UPSTREAM URL IS NEVER GIVEN TO A HUMAN. The Supabase gateway serves this as `text/plain`
//    with `X-Content-Type-Options: nosniff` whatever content-type we set, so a browser opening it
//    sees raw HTML source. The address a client receives is findable.live/w/<code>, a Cloudflare
//    Pages Function in the findable-site repo (functions/w/[code].ts) that forces text/html.
// ⛔ READ ONLY. No write of any kind, and no open-tracking: unlike the report there is no
//    bump_audit_open equivalent here, and adding one would be a write on a public route.
// ⛔ ONE REFUSAL FOR EVERY MISS. A bad code, a Discovery audit, a market audit, an unfinished
//    baseline and a lead that does not claim the audit all produce the SAME "not available" page.
//    Distinguishing them would tell an outsider which codes exist.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { renderWelcomePack } from "../_shared/welcome-pack-render.ts";

function htmlResponse(html: string, status = 200): Response {
  // String body, never a Uint8Array — bytes made the runtime drop our content-type and the browser
  // Latin-1-decoded correct UTF-8 (the mojibake incident recorded in render-audit-report).
  return new Response(html, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      // This document names the client's own measured visibility and their rivals. A header
      // protects the route; the document carries its own robots meta as well.
      "x-robots-tag": "noindex, nofollow, noarchive, nosnippet",
      "cache-control": status === 200 ? "public, max-age=120" : "public, max-age=0, must-revalidate",
    },
  });
}

/** Minimal, noindex fallback. The SAME words for every refusal — see the note above. */
function unavailable(): Response {
  return htmlResponse(
    `<!doctype html><html lang="en"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1"><title>Welcome pack unavailable</title>` +
    `<meta name="robots" content="noindex"></head>` +
    `<body style="font-family:system-ui,sans-serif;max-width:640px;margin:80px auto;padding:0 20px;color:#0f172a">` +
    `<h1>Welcome pack unavailable</h1><p>This link isn&rsquo;t ready yet, or it&rsquo;s no longer valid.</p>` +
    `<p><a href="https://findable.live" style="color:#1a3d7c">findable.live</a></p></body></html>`,
    404,
  );
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const slug = (url.searchParams.get("slug") || url.pathname.split("/").filter(Boolean).pop() || "").trim();
    if (!slug || slug.length > 80) return unavailable();

    const service = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );
    const result = await renderWelcomePack(service, slug);
    if (!result.ok || !result.html) {
      console.log(`[render-welcome-pack] refused ${slug}: ${result.error ?? "unknown"}`);
      return unavailable();
    }
    return htmlResponse(result.html);
  } catch (e) {
    // supabase-js errors are plain objects — String(e) is [object Object] (CLAUDE.md §4).
    console.error("[render-welcome-pack]", e instanceof Error ? e.message : JSON.stringify(e)?.slice(0, 300));
    return unavailable();
  }
});
