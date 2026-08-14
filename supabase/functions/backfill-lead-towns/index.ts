import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveDerivedTown } from "../_shared/place-town.ts";
import { selectInChunks } from "../_shared/chunked-in.ts";
import { runEnrichSource } from "../_shared/enrichment/runner.ts";
import { nameMatches, normalizeForMatch } from "../_shared/enrichment/ai-search.ts";

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

/* ══ PLACE-ID RESOLUTION FOR ROWS THAT HAVE NONE (CSV imports) — 2026-08-14, Paul's Layer 1 ══════
   A CSV row carries no place_id, and every town derivation is keyed on one. This resolves it with
   ONE Places Text Search — and three guards, ALL of which must pass or NO id is written at all.
   The failure mode is closed: a refused row goes through resolveDerivedTown with no place_id, which
   stamps the SETTLED `no_place_id` note, so the lead grades `unverifiable` and every gate holds it.

   ⛔ THE TOP RESULT IS NEVER TAKEN ON RANK. Rank carries no identity; a name+address search can
   return a similar-named different business, and a wrong derived_town is worse than none.
     1. NAME GUARD  — nameMatches (the guarantee-grade matcher, reused unchanged, tried both ways
                      so "Timpson" ↔ "Timpson Ltd" passes whichever side is fuller). No scores.
     2. UNIQUENESS  — exactly ONE distinct place may pass; two survivors is ambiguity, and
                      ambiguity refuses.
     3. TOWN-HINT   — the row's own location text must share a significant token with the
                      candidate's formattedAddress (normalizeForMatch whole tokens, never
                      substrings — the plum-BING trap). A row with NO location text refuses
                      outright: a nationwide name-only match is exactly the wrong-business trap.
   The residual false match that survives all three is a same-name business in the same hinted
   town — whose derived_town is still the right town, the quantity being verified.

   ⛔ PRICED AND TIER-NAMED (§4's constants rule): Text Search **Pro** — the mask requests
   places.id, places.displayName, places.formattedAddress, and displayName/formattedAddress are
   Pro-tier fields, so the request bills once at Pro, $32/1,000 = $0.032. From Google's SKU table,
   not yet confirmed against a billed row. The IDs-only mask would be free but returns no name, and
   a resolver that cannot check the name is the blind-top-result this exists to prevent. */
const TEXT_SEARCH_PRO_USD = 0.032;
/** This source's own ceiling, mirroring PLACE_DETAILS_CAP_USD's reasoning in place-town.ts: judged
 *  against its own spend, not the day's unrelated audit spend. ~60 guarded lookups a day. */
const TEXT_SEARCH_CAP_USD = 2;

interface PlaceCandidate { id: string; name: string; address: string }

/** Significant tokens for the town-hint guard: alphabetic, 4+ chars — street numbers and short
 *  connectives cannot place a business. */
function significantTokens(s: string): string[] {
  return normalizeForMatch(s).split(/\s+/).filter((t) => t.length >= 4 && /^[a-z]+$/.test(t));
}

/** The three-guard match. Returns a place id or the refusal reason — never a guess. */
function guardedPlaceMatch(
  candidates: PlaceCandidate[],
  businessName: string,
  hint: string,
): { placeId: string } | { refused: string } {
  const hintTokens = new Set(significantTokens(hint));
  if (hintTokens.size === 0) return { refused: "no location text on the row to anchor a match" };
  if (candidates.length === 0) return { refused: "Google returned no result for the name and location" };
  const ctx = { town: hint };
  const passers = candidates.filter((c) => {
    const nameOk = nameMatches(c.name, businessName, ctx) || nameMatches(businessName, c.name, ctx);
    if (!nameOk) return false;
    const addr = new Set(significantTokens(c.address));
    return [...hintTokens].some((t) => addr.has(t));
  });
  const distinct = [...new Set(passers.map((c) => c.id))];
  if (distinct.length === 0) return { refused: `no result matched both the business name and its location (${candidates.length} candidate${candidates.length === 1 ? "" : "s"} rejected)` };
  if (distinct.length > 1) return { refused: `ambiguous: ${distinct.length} different places match the name and location` };
  return { placeId: distinct[0] };
}

/** One Text Search (New) call, guarded above. Wrapped in runEnrichSource so it is capped and
 *  logged like every other paid source. */
async function resolvePlaceId(
  // deno-lint-ignore no-explicit-any
  service: any,
  userId: string,
  businessName: string,
  hint: string,
  country: string | null,
  apiKey: string,
): Promise<{ placeId: string | null; refused: string | null; capped: boolean; spent: boolean }> {
  const query = `${businessName}, ${hint}`;
  const outcome = await runEnrichSource<PlaceCandidate[] | null>({
    service,
    userId,
    type: "place_search",
    cacheKey: `place_search:${normalizeForMatch(query)}`,
    estCostUsd: TEXT_SEARCH_PRO_USD,
    capUsd: TEXT_SEARCH_CAP_USD,
    run: async () => {
      const res = await fetch("https://places.googleapis.com/v1/places:searchText", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Goog-Api-Key": apiKey,
          "X-Goog-FieldMask": "places.id,places.displayName,places.formattedAddress",
        },
        body: JSON.stringify({
          textQuery: query,
          // GB unless the lead says otherwise — the same default the lead rows carry.
          regionCode: (country ?? "UK") === "UK" ? "GB" : String(country ?? "GB"),
          maxResultCount: 5,
        }),
      });
      if (!res.ok) {
        console.warn(`[backfill-lead-towns] place search ${res.status} for "${query}"`);
        return { result: null, costUsd: 0 };
      }
      // deno-lint-ignore no-explicit-any
      const d = await res.json() as any;
      const places: PlaceCandidate[] = (Array.isArray(d.places) ? d.places : []).map((p: Record<string, unknown>) => ({
        id: String(p.id ?? ""),
        name: String((p.displayName as { text?: string } | undefined)?.text ?? ""),
        address: String(p.formattedAddress ?? ""),
      })).filter((p: PlaceCandidate) => p.id);
      return { result: places, costUsd: TEXT_SEARCH_PRO_USD };
    },
    isEmpty: (r) => !r || r.length === 0,
    /* A null result is a TRANSIENT Google failure — never cache it, or a 24h empty-cache entry
       would make the retry return the same nothing for free and look permanent. */
    noCacheWrite: (r) => r === null,
  });
  if (outcome.capReached) return { placeId: null, refused: null, capped: true, spent: false };
  if (outcome.result === null || outcome.result === undefined) {
    // TRANSIENT (Google errored) — no refusal is stamped; the lead stays unchecked and retryable.
    return { placeId: null, refused: null, capped: false, spent: false };
  }
  const verdict = guardedPlaceMatch(outcome.result, businessName, hint);
  return "placeId" in verdict
    ? { placeId: verdict.placeId, refused: null, capped: false, spent: !outcome.cached }
    : { placeId: null, refused: verdict.refused, capped: false, spent: !outcome.cached };
}

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
    const COLS = "id, business_name, place_id, derived_town, search_location, address, is_archived, country";
    /* ⛔ THE place_id REQUIREMENT APPLIES TO THE DEFAULT SWEEP ONLY. An EXPLICIT selection may now
       include id-less rows (CSV imports) — that is the whole point of the resolution step above.
       The default no-selection sweep keeps the old strict rule, so pressing the bare button never
       silently starts paying the higher guarded-search rate on rows nobody chose. */
    const base = (requirePlaceId: boolean) => {
      let q = service.from("outreach_leads").select(COLS)
        .eq("user_id", user.id).eq("is_archived", false);
      if (requirePlaceId) q = q.not("place_id", "is", null);
      return q;
    };

    /* The exact shape the eligibility filter below reads. Typed rather than Record<string, unknown>
       so `blank(l.derived_town)` stays checkable — an unknown would have compiled and told us
       nothing. */
    interface LeadRow {
      id: string; business_name: string | null; place_id: string | null;
      derived_town: string | null; search_location: string | null; address: string | null;
      is_archived: boolean | null; country: string | null;
    }
    let rows: LeadRow[] = [];
    try {
      if (leadIds.length) {
        /* ⛔ CHUNKED. A single .in() with the operator's whole selection puts every id in the URL
           and the request line is dropped before PostgREST sees it — measured 2026-08-09: 200 ids
           fine, 400 ids "TypeError: fetch failed". Paul pressed this with ~1,000 leads selected and
           got a bare 500 from the catch below. See _shared/chunked-in.ts.
           ⚠️ The LIMIT is applied after merging, not per chunk, or it would mean something else. */
        rows = await selectInChunks<LeadRow>(leadIds, (chunk) => base(false).in("id", chunk));
        rows.sort((a, b) => String(a.id).localeCompare(String(b.id)));
      } else {
        const { data, error } = await base(true).order("id", { ascending: true }).limit(MAX_PER_CALL);
        if (error) return json({ error: error.message }, 500);
        rows = (data ?? []) as LeadRow[];
      }
    } catch (e) {
      /* Named, not swallowed. "internal" is what made this take a diagnosis instead of a glance. */
      return json({ error: `candidate lookup failed: ${(e as Error).message}` }, 500);
    }

    /* ⛔ "WHERE IS THIS BUSINESS?" IS NOT "CAN THIS BE AUDITED?", AND CONFLATING THEM AIMED THIS
       BUTTON AT THE WRONG LEADS. The first version also required search_location to be blank, on the
       reasoning that a lead holding one is already auditable and must not be paid for twice. True
       for auditing — and exactly wrong here, because search_location is the town Paul SEARCHED, not
       where the business is, and it is the thing under suspicion. Requiring it blank disqualified
       precisely the leads that need checking.
       Measured 2026-08-09: the old rule targeted 89 leads, mostly barbers from the retired product
       line, while missing 112 audited leads with no location evidence at all — 51 plumbers, 25
       locksmiths, 24 accountants, 12 electricians, every one in a trade Paul works and unarchived.
       ⚠️ STILL A POSITIVE TEST. A lead is a candidate only when derived_town AND address are both
       provably empty and a place_id exists — never "not one of the shapes I expected". Those two are
       the only fields that say where a business IS. */
    /* An EXPLICIT selection needs only a missing town — the address on a CSV row is unverified
       text, not evidence, and the id-less rows are exactly the ones the resolution step exists
       for. The default sweep keeps the strict no-evidence rule (see the comment above it). */
    const explicit = leadIds.length > 0;
    const candidates = (rows ?? []).filter((l) => explicit
      ? blank(l.derived_town)
      : blank(l.derived_town) && blank(l.address) && !blank(l.place_id));

    const perLeadUsd = (l: LeadRow) => (blank(l.place_id) ? TEXT_SEARCH_PRO_USD + ESSENTIALS_USD : ESSENTIALS_USD);
    if (dryRun || !candidates.length) {
      return json({
        ok: true, dry_run: true, candidates: candidates.length,
        estimated_usd: Number(candidates.reduce((s, l) => s + perLeadUsd(l), 0).toFixed(2)),
        names: candidates.slice(0, 20).map((l) => l.business_name),
      });
    }

    let filled = 0, noTown = 0, failed = 0, capped = 0, attempted = 0;
    let placeIdsResolved = 0, matchRefused = 0;
    let searchSpentUsd = 0;
    const unresolved: Array<{ id: string; business_name: string | null; reason: string }> = [];

    /* The per-lead pipeline. With a place_id it is exactly what it always was: resolveDerivedTown.
       Without one it FIRST runs the guarded place resolution above, and the outcomes are kept
       apart with care, because two of them must never be conflated:
         * REFUSED (Google answered; no confident match) → resolveDerivedTown with no place_id,
           which stamps the SETTLED no_place_id note → the lead grades unverifiable → gated. The
           refusal reason is reported beside it.
         * TRANSIENT (no API key / search unavailable / this source's cost cap) → NOTHING is
           stamped. Stamping a settled note on our own outage or our own budget would permanently
           gate a good lead on a fault that is ours — the exact thing SETTLED_TOWN_NOTES exists to
           prevent. The lead stays unchecked and a later run retries it. */
    const apiKey = Deno.env.get("GOOGLE_MAPS_API_KEY") ?? "";
    type LeadOutcome =
      | { kind: "town"; result: Awaited<ReturnType<typeof resolveDerivedTown>> }
      | { kind: "refused"; reason: string }
      | { kind: "transient"; reason: string }
      | { kind: "search_capped" };
    const processLead = async (l: LeadRow): Promise<LeadOutcome> => {
      if (blank(l.place_id)) {
        if (!apiKey) return { kind: "transient", reason: "GOOGLE_MAPS_API_KEY not set — nothing attempted" };
        const name = String(l.business_name ?? "").trim();
        const hint = String(l.address ?? "").trim() || String(l.search_location ?? "").trim();
        const r = await resolvePlaceId(service, user.id, name, hint, l.country, apiKey);
        if (r.spent) searchSpentUsd += TEXT_SEARCH_PRO_USD;
        if (r.capped) return { kind: "search_capped" };
        if (r.placeId) {
          placeIdsResolved++;
          const { error: upErr } = await service.from("outreach_leads")
            .update({ place_id: r.placeId }).eq("id", l.id);
          if (upErr) return { kind: "transient", reason: `place_id write failed: ${upErr.message}` };
        } else if (r.refused) {
          matchRefused++;
          /* Definitive refusal: run the derivation WITHOUT a place_id so the settled no_place_id
             stamp lands and the gates hold this lead. The reason travels in the report. */
          await resolveDerivedTown(service, l.id);
          return { kind: "refused", reason: r.refused };
        } else {
          return { kind: "transient", reason: "place search unavailable — will retry on a later run" };
        }
      }
      return { kind: "town", result: await resolveDerivedTown(service, l.id) };
    };

    for (let i = 0; i < candidates.length; i += CONCURRENCY) {
      /* ⛔ STOP THE MOMENT THE COST CAP REFUSES. runEnrichSource checks a rolling 24h spend against
         DAILY_CAP_USD ($2, per user, across ALL enrichment) BEFORE it fetches, so once it says no it
         will say no to every remaining lead. On 2026-08-09 that produced 89 identical refusals in
         one run — free, but reported as "89 failed" with no cause, which sent Paul hunting a Google
         problem that did not exist. One refusal is the answer; 88 more are noise. */
      if (capped > 0) break;
      const slice = candidates.slice(i, i + CONCURRENCY);
      const out = await Promise.allSettled(slice.map((l) => processLead(l)));
      out.forEach((r, k) => {
        const lead = slice[k];
        if (r.status !== "fulfilled") {
          failed++; attempted++;
          unresolved.push({ id: lead.id, business_name: lead.business_name, reason: String((r.reason as Error)?.message ?? r.reason).slice(0, 140) });
          return;
        }
        if (r.value.kind === "search_capped") {
          capped++;
          unresolved.push({ id: lead.id, business_name: lead.business_name, reason: "place-search cost cap reached — nothing spent" });
          return;
        }
        if (r.value.kind === "transient") {
          failed++;
          unresolved.push({ id: lead.id, business_name: lead.business_name, reason: r.value.reason });
          return;
        }
        if (r.value.kind === "refused") {
          /* The guarded match said no. Settled and GATED — reported with the exact reason, because
             "no_place_id" alone does not tell the operator whether the CSV needs a town column or
             the name is genuinely ambiguous. */
          noTown++;
          unresolved.push({ id: lead.id, business_name: lead.business_name, reason: `unverifiable — ${r.value.reason}` });
          return;
        }
        /* ⛔ THREE OUTCOMES, NAMED SEPARATELY. "Google answered and this place has no postal_town"
           is not the same as "the call failed", and folding them together would send the operator
           to retry something that will never work. resolveDerivedTown already stamps the reason on
           the row; this reports it back so the button can say what happened. */
        const v = r.value.result;
        if (v.town) { filled++; attempted++; return; }
        /* ⛔ THE COST CAP IS NOT A FAILURE AND IT IS NOT BILLED. runEnrichSource returns
           costUsd: 0 and never calls Google, so nothing was spent and nothing is wrong with the
           lead — the day's enrichment budget is simply used up. Counting it as "failed" is what made
           a free no-op look like 89 broken lookups. */
        if (/cost cap/i.test(v.error ?? "")) {
          capped++;
          unresolved.push({ id: lead.id, business_name: lead.business_name, reason: "daily enrichment cost cap reached — nothing spent" });
          return;
        }
        attempted++;
        if (v.error) {
          failed++;
          unresolved.push({ id: lead.id, business_name: lead.business_name, reason: v.error.slice(0, 140) });
        } else {
          noTown++;
          unresolved.push({ id: lead.id, business_name: lead.business_name, reason: "Google has no town in this address" });
        }
      });
    }

    console.log(`[backfill-lead-towns] user=${user.id} candidates=${candidates.length} attempted=${attempted} filled=${filled} noTown=${noTown} failed=${failed} capped=${capped} placeIdsResolved=${placeIdsResolved} matchRefused=${matchRefused}`);
    return json({
      ok: true,
      candidates: candidates.length,
      filled, no_town: noTown, failed, capped,
      /* The import path's numbers: id-less rows whose place was confidently matched, and rows the
         three-guard match refused (now settled unverifiable — gated). */
      place_ids_resolved: placeIdsResolved,
      match_refused: matchRefused,
      /* ⛔ MEASURED, NOT ESTIMATED, AND THIS LINE USED TO LIE. It was candidates.length × the rate,
         under a comment calling itself "an honest spend figure" — which is only true if every
         attempt reached Google. On 2026-08-09 the cost cap refused all 89 before any request and
         this reported ~$0.45 of spend that never happened. Paul believed it, because why would the
         function be wrong about its own bill.
         attempted counts only the leads that actually got as far as a Google call. */
      attempted,
      spent_usd: Number((attempted * ESSENTIALS_USD + searchSpentUsd).toFixed(2)),
      /* Stated so a zero is legible as "nothing was bought" rather than "nothing was found". */
      cap_blocked: capped > 0,
      unresolved: unresolved.slice(0, 40),
    });
  } catch (e) {
    console.error("[backfill-lead-towns] error:", (e as Error).message);
    return json({ error: "internal" }, 500);
  }
});
