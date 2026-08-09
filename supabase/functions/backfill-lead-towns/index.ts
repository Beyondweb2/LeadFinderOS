import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveDerivedTown } from "../_shared/place-town.ts";
import { selectInChunks } from "../_shared/chunked-in.ts";

/* ════════════════════════════════════════════════════════════════════════════════════════════
   BACKFILL THE TOWN ON LEADS THAT WERE ADDED WITHOUT ONE.

   ⛔ WHY 168 LEADS HAVE NO TOWN. search_keyword/search_location lived in Index.tsx useState set
   only by pressing Search, while the RESULTS were restored from sessionStorage — so returning to
   the page rather than re-searching left results on screen with no search behind them, and Add
   wrote nulls. Fixed at source in LeadSearchContext (results and their search are now one
   persisted object). This function repairs the rows already written.

   ⚠️ IT ONLY RECOVERS THE TOWN, NOT THE TRADE, and that is not a shortcut. Google's structured
   address genuinely knows where a business is; nothing in a Place Details response reliably says
   what a UK business SELLS at a tier I have verified. primaryType might, and its SKU tier has NOT
   been checked against a billed row — CLAUDE.md has four constants that were wrong exactly that
   way. So the trade is set by hand, in batches, from the Outreach table. Guessing it would put a
   wrong business_type on an audit, which is worse than an empty one: an empty one refuses to run.

   ⚠️ NO NEW GOOGLE CODE. resolveDerivedTown already does the whole job — Essentials-mask call,
   30-day cache, derived_town + address written, town_fetched_at/town_fetch_note stamped whatever
   happens. A second implementation here would be the third copy of the town rule.

   COST: the Essentials mask is $0.005 a lead. It is address-only ON PURPOSE — asking for a phone
   number or a rating would re-price the whole request at Enterprise, because Google bills one
   request once at the highest tier any requested field touches.

   AUTH: the caller's own JWT, owner-scoped. It spends money, so it is not internal-callable and
   there is no cron: it runs when an operator asks for it, on leads he selected and can see.
   ════════════════════════════════════════════════════════════════════════════════════════════ */

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY") ?? "";

/** Hard ceiling per call. 90 is the whole unarchived backlog; 150 leaves headroom without letting a
 *  mis-click spend real money. At $0.005 a lead the worst case is 75p. */
const MAX_PER_CALL = 150;
/** Google calls in flight. Small — this is one operator's button, not a pipeline. */
const CONCURRENCY = 6;
/** Matches place-town.ts's own rate. Stated here only to return an estimate to the UI. */
const ESSENTIALS_USD = 0.005;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

const blank = (v: unknown) => !String(v ?? "").trim();

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "method not allowed" }, 405);

  try {
    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Auth required" }, 401);
    const token = authHeader.slice(7);
    const userClient = createClient(SUPABASE_URL, ANON_KEY, { global: { headers: { Authorization: authHeader } } });
    const { data: userData, error: uErr } = await userClient.auth.getUser(token);
    const user = userData?.user;
    if (uErr || !user) return json({ error: "Auth required" }, 401);

    const service = createClient(SUPABASE_URL, SERVICE_KEY, { auth: { persistSession: false } });
    const body = await req.json().catch(() => ({}));
    const dryRun = body.dry_run === true;
    const leadIds: string[] = Array.isArray(body.lead_ids)
      ? Array.from(new Set(body.lead_ids.filter((x: unknown) => typeof x === "string")))
      : [];

    /* Candidates: the caller's OWN leads, not archived, WITH a place_id (Google has nothing to say
       about a lead without one) and with no town yet. When lead_ids is given the selection is
       filtered to the same rule rather than trusted — a selection is a request, not a verdict. */
    const COLS = "id, business_name, place_id, derived_town, search_location, address, is_archived";
    const base = () => service.from("outreach_leads").select(COLS)
      .eq("user_id", user.id).eq("is_archived", false).not("place_id", "is", null);

    /* The exact shape the eligibility filter below reads. Typed rather than Record<string, unknown>
       so `blank(l.derived_town)` stays checkable — an unknown would have compiled and told us
       nothing. */
    interface LeadRow {
      id: string; business_name: string | null; place_id: string | null;
      derived_town: string | null; search_location: string | null; address: string | null;
      is_archived: boolean | null;
    }
    let rows: LeadRow[] = [];
    try {
      if (leadIds.length) {
        /* ⛔ CHUNKED. A single .in() with the operator's whole selection puts every id in the URL
           and the request line is dropped before PostgREST sees it — measured 2026-08-09: 200 ids
           fine, 400 ids "TypeError: fetch failed". Paul pressed this with ~1,000 leads selected and
           got a bare 500 from the catch below. See _shared/chunked-in.ts.
           ⚠️ The LIMIT is applied after merging, not per chunk, or it would mean something else. */
        rows = await selectInChunks<LeadRow>(leadIds, (chunk) => base().in("id", chunk));
        rows.sort((a, b) => String(a.id).localeCompare(String(b.id)));
      } else {
        const { data, error } = await base().order("id", { ascending: true }).limit(MAX_PER_CALL);
        if (error) return json({ error: error.message }, 500);
        rows = (data ?? []) as LeadRow[];
      }
    } catch (e) {
      /* Named, not swallowed. "internal" is what made this take a diagnosis instead of a glance. */
      return json({ error: `candidate lookup failed: ${(e as Error).message}` }, 500);
    }

    /* ⛔ "HAS A TOWN" IS A POSITIVE TEST, and it is the whole eligibility rule. A lead is a
       candidate only when we can see that every town field is genuinely empty — never "not one of
       the shapes I expected". derived_town is what an audit prefers; search_location and address
       are the fallbacks it accepts, so a lead holding either is already auditable and must not be
       paid for again. */
    const candidates = (rows ?? []).filter((l) =>
      blank(l.derived_town) && blank(l.search_location) && blank(l.address) && !blank(l.place_id));

    if (dryRun || !candidates.length) {
      return json({
        ok: true, dry_run: true, candidates: candidates.length,
        estimated_usd: Number((candidates.length * ESSENTIALS_USD).toFixed(2)),
        names: candidates.slice(0, 20).map((l) => l.business_name),
      });
    }

    let filled = 0, noTown = 0, failed = 0, capped = 0, attempted = 0;
    const unresolved: Array<{ id: string; business_name: string | null; reason: string }> = [];

    for (let i = 0; i < candidates.length; i += CONCURRENCY) {
      /* ⛔ STOP THE MOMENT THE COST CAP REFUSES. runEnrichSource checks a rolling 24h spend against
         DAILY_CAP_USD ($2, per user, across ALL enrichment) BEFORE it fetches, so once it says no it
         will say no to every remaining lead. On 2026-08-09 that produced 89 identical refusals in
         one run — free, but reported as "89 failed" with no cause, which sent Paul hunting a Google
         problem that did not exist. One refusal is the answer; 88 more are noise. */
      if (capped > 0) break;
      const slice = candidates.slice(i, i + CONCURRENCY);
      const out = await Promise.allSettled(slice.map((l) => resolveDerivedTown(service, l.id)));
      out.forEach((r, k) => {
        const lead = slice[k];
        if (r.status !== "fulfilled") {
          failed++; attempted++;
          unresolved.push({ id: lead.id, business_name: lead.business_name, reason: String((r.reason as Error)?.message ?? r.reason).slice(0, 140) });
          return;
        }
        /* ⛔ THREE OUTCOMES, NAMED SEPARATELY. "Google answered and this place has no postal_town"
           is not the same as "the call failed", and folding them together would send the operator
           to retry something that will never work. resolveDerivedTown already stamps the reason on
           the row; this reports it back so the button can say what happened. */
        if (r.value.town) { filled++; attempted++; return; }
        /* ⛔ THE COST CAP IS NOT A FAILURE AND IT IS NOT BILLED. runEnrichSource returns
           costUsd: 0 and never calls Google, so nothing was spent and nothing is wrong with the
           lead — the day's enrichment budget is simply used up. Counting it as "failed" is what made
           a free no-op look like 89 broken lookups. */
        if (/cost cap/i.test(r.value.error ?? "")) {
          capped++;
          unresolved.push({ id: lead.id, business_name: lead.business_name, reason: "daily enrichment cost cap reached — nothing spent" });
          return;
        }
        attempted++;
        if (r.value.error) {
          failed++;
          unresolved.push({ id: lead.id, business_name: lead.business_name, reason: r.value.error.slice(0, 140) });
        } else {
          noTown++;
          unresolved.push({ id: lead.id, business_name: lead.business_name, reason: "Google has no town in this address" });
        }
      });
    }

    console.log(`[backfill-lead-towns] user=${user.id} candidates=${candidates.length} attempted=${attempted} filled=${filled} noTown=${noTown} failed=${failed} capped=${capped}`);
    return json({
      ok: true,
      candidates: candidates.length,
      filled, no_town: noTown, failed, capped,
      /* ⛔ MEASURED, NOT ESTIMATED, AND THIS LINE USED TO LIE. It was candidates.length × the rate,
         under a comment calling itself "an honest spend figure" — which is only true if every
         attempt reached Google. On 2026-08-09 the cost cap refused all 89 before any request and
         this reported ~$0.45 of spend that never happened. Paul believed it, because why would the
         function be wrong about its own bill.
         attempted counts only the leads that actually got as far as a Google call. */
      attempted,
      spent_usd: Number((attempted * ESSENTIALS_USD).toFixed(2)),
      /* Stated so a zero is legible as "nothing was bought" rather than "nothing was found". */
      cap_blocked: capped > 0,
      unresolved: unresolved.slice(0, 40),
    });
  } catch (e) {
    console.error("[backfill-lead-towns] error:", (e as Error).message);
    return json({ error: "internal" }, 500);
  }
});
