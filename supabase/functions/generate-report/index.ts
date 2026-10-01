// generate-report — RETIRED 2026-10-01 (Paul). Every call answers 410 Gone and writes nothing.
//
// It used to have gpt-4o write an "AI-search-optimised business profile" of one business and insert
// a PUBLISHED business_reports row, served at yoursites.uk/r/<slug> by functions/r/[slug].ts. Two
// callers: process-ai-audit-queue's auto-report (engaged leads) and AI Audit's "Generate listing".
// Both are removed. Why: a profile we wrote, published in the business's name (its JSON-LD named the
// business as author and publisher), on a host that is neither theirs nor ours by brand; never sent
// to anyone; never cited in 8,316 recorded AI answers. Record: docs/r-profile-pages-audit.md.
//
// ⛔ NOTHING CURRENT DEPENDED ON IT. Client and prospect reports are rendered LIVE by
// render-audit-report from the audit itself and need no business_reports row. The EXISTING rows are
// kept — render-audit-report still resolves the legacy name-plus-8-hex report slug through them —
// but no new row is ever needed for that: every link minted since 2026-08-05 is a UUID or short code.
//
// Kept as a stub (not deleted) so a stray or cached caller gets an explicit refusal instead of a
// 404 that reads like a deploy fault. The last working version is in git history before this commit.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

Deno.serve((req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  return new Response(
    JSON.stringify({ ok: false, error: "retired", detail: "Public business-profile listings were retired on 2026-10-01." }),
    { status: 410, headers: { ...corsHeaders, "Content-Type": "application/json" } },
  );
});
