import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/* ════════════════════════════════════════════════════════════════════════════════════════════
   WHO FILLED IN MY FORM? — the questionnaire submissions, for the operator dashboard.

   ⛔ WHY AN ENDPOINT AND NOT A DIRECT READ. onboarding_responses has RLS ENABLED WITH NO POLICIES
   (migration 20260726). A SPA read with the user's session therefore returns HTTP 200 with [] —
   indistinguishable from "nobody has filled the form in", which is the exact thing this card
   exists to disprove. CLAUDE.md §4 records the same trap on apify_account_usage, where a comment
   promised the figure would be visible in the app and the policy was never added, so nothing ever
   displayed it. Routing through the service role, behind an operator check, is the fix that file
   prescribes.

   ⛔ IT RETURNS ROWS, NOT VERDICTS. `notifyStateFor` lives in src/hooks/useSubmissions.ts and is
   the single implementation of what "the email did not arrive" means — same rule as the coverage
   endpoint, so the card and any test cannot drift apart.
   ════════════════════════════════════════════════════════════════════════════════════════════ */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });

/** Enough to render a card. Deliberately NOT the answers themselves — this is a "who and what
 *  happened next" list, and the full questionnaire belongs on a record page, not a dashboard. */
const COLS = "id, lead_id, business_name, contact_email, confirmed_location, status, incomplete, created_at, notify_sent_at, notify_attempts, notify_error";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ ok: false, error: "Auth required" }, 401);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: u, error: uErr } = await userClient.auth.getUser(authHeader.slice(7));
    if (uErr || !u?.user) return json({ ok: false, error: "Auth required" }, 401);

    const body = await req.json().catch(() => ({}));
    /* Clamped. A dashboard card wants the recent ones; an unbounded limit from the client is how a
       card quietly becomes a full table scan. */
    const raw = Number(body.limit);
    const limit = Number.isFinite(raw) ? Math.min(Math.max(Math.trunc(raw), 1), 100) : 25;

    const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const { data, error } = await service
      .from("onboarding_responses")
      .select(COLS)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (error) return json({ ok: false, error: error.message }, 500);

    return json({ ok: true, rows: data ?? [] });
  } catch (e) {
    console.error("[submissions] error:", (e as Error).message);
    return json({ ok: false, error: (e as Error).message }, 500);
  }
});
