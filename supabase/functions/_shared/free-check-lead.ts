/* ════════════════════════════════════════════════════════════════════════════════════════════
   FREE-CHECK → LEAD. The funnel's front door: a stranger fills in four fields on findable.live
   and becomes a real lead in Outreach — enriched, deduped, and visible.

   ⛔ THE OWNER IS RESOLVED FROM THE DATA, NEVER FROM ADMIN_EMAIL, AND NEVER FROM A HARDCODED UUID.
   Measured live 2026-08-19 with PAGINATED reads: one user_id owns ALL 1,646 outreach_leads, 465
   ai_audits and 515 ai_audit_runs, and it is NOT the ADMIN_EMAIL account — that address is the
   notification recipient and owns nothing. Because RLS scopes the SPA by user_id, a lead written
   under the wrong account saves with HTTP 200 and is then invisible in Outreach, the Inbox and
   every count. So the owner is read off the newest existing lead: whoever owns the book owns the
   new arrival, and the day the account changes this follows it with no code edit.
   ⚠️ An earlier note said "1000 leads" — that was PostgREST's silent 1000-row truncation, not a
   count. Paginate (§6) or do not quote a total.

   ⛔ THE DEDUPE IS THE DATABASE AND IT FAILS CLOSED. The same three keys addLead uses — place_id,
   exact phone, exact name — archived rows included, because an archived duplicate is still a
   duplicate. If a check itself ERRORS we refuse to create the lead: the 25 duplicate cold openers
   on 15–17 Aug came from a dedupe that answered "no duplicates" when it simply had not loaded.
   ⚠️ THE LADDER IS ORDERED BY COST, NOT BY STRENGTH. Name is free, so it runs FIRST and a repeat
   submission from the same business costs nothing at all. place_id needs the $0.032 search and
   phone needs the $0.020 details call, so each is checked the moment its key exists, never later.
   A false name match links this submission to an existing lead and says so in the operator email,
   which is recoverable; a false NEGATIVE creates the duplicate this whole ladder exists to stop.

   ⛔ SPEND IS CAPPED AND THE ROW IS NEVER LOST. Past the daily cap the questionnaire row still
   saves and the operator is still emailed — only the paid enrichment is skipped, and the email
   says so. Nothing here throws: every failure returns a verdict the caller reports.

   COST, per submission that reaches enrichment (§4: name the product AND the tier):
     Text Search **Pro**            $0.032   resolve which business they are
     Place Details **Essentials**   $0.005   town + coordinates, via resolveDerivedTown
     Place Details **Enterprise**   $0.020   phone (rating + reviews free at the same tier)
                                    ──────
                                    $0.057   ≈ 4.5p, and only when all three run
   ════════════════════════════════════════════════════════════════════════════════════════════ */
import { resolvePlaceId } from "./place-resolve.ts";
import { resolveDerivedTown } from "./place-town.ts";
import { ENTERPRISE_FIELDS, fetchPlaceDetails } from "./place-details.ts";

/** How many free-check leads may enrich themselves per rolling 24h. Paul's number, 2026-08-19.
 *  Generic mode has no rate limit of its own and each submission now costs real pence, so this is
 *  the blast radius if the form is scraped or spammed: 10 × $0.057 ≈ 57¢ a day. */
export const FREE_CHECK_DAILY_LEAD_CAP = 10;

export interface FreeCheckInput {
  businessName: string;
  town: string;
  trade: string;
  email: string | null;
}

export type FreeCheckOutcome =
  | { kind: "created"; leadId: string; placeId: string | null; phone: string | null; town: string | null; note: string | null }
  | { kind: "matched"; leadId: string; matchedOn: "place_id" | "phone" | "name"; existingName: string; archived: boolean }
  | { kind: "skipped"; reason: string }
  | { kind: "refused"; reason: string };

const blank = (v: unknown): boolean => typeof v !== "string" || v.trim() === "";

/** The owner of the book, read off the newest lead. Null means the table is empty — which is not a
 *  thing that can happen here (1,646 rows) but is still refused rather than guessed at. */
// deno-lint-ignore no-explicit-any
async function resolveOwnerUserId(service: any): Promise<string | null> {
  const { data, error } = await service
    .from("outreach_leads")
    .select("user_id")
    .not("user_id", "is", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data?.user_id) return null;
  return String(data.user_id);
}

/** One keyed dedupe read. Throws on error so the caller can fail CLOSED. */
// deno-lint-ignore no-explicit-any
async function findBy(service: any, column: string, value: string) {
  const { data, error } = await service
    .from("outreach_leads")
    .select("id, business_name, is_archived")
    .eq(column, value)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`dedupe read on ${column} failed: ${error.message}`);
  return data ?? null;
}

/**
 * Create (or match) a lead for one free-check submission.
 *
 * NEVER THROWS — every path returns a FreeCheckOutcome. The questionnaire row has already been
 * saved by the time this runs, so nothing here may put that at risk.
 */
export async function createFreeCheckLead(
  // deno-lint-ignore no-explicit-any
  service: any,
  input: FreeCheckInput,
): Promise<FreeCheckOutcome> {
  try {
    const businessName = input.businessName.trim();
    const town = input.town.trim();
    const trade = input.trade.trim();
    if (!businessName) return { kind: "refused", reason: "no business name given" };

    const userId = await resolveOwnerUserId(service);
    if (!userId) return { kind: "refused", reason: "could not resolve the owning account from existing leads" };

    // ── 1. NAME DEDUPE — free, so it goes first ──────────────────────────────────────────────
    let existing;
    try {
      existing = await findBy(service, "business_name", businessName);
    } catch (e) {
      return { kind: "refused", reason: (e as Error).message };
    }
    if (existing) {
      return {
        kind: "matched",
        leadId: String(existing.id),
        matchedOn: "name",
        existingName: String(existing.business_name ?? businessName),
        archived: existing.is_archived === true,
      };
    }

    // ── 2. THE DAILY CAP, checked BEFORE the first paid call ─────────────────────────────────
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: spentToday, error: capErr } = await service
      .from("onboarding_responses")
      .select("id", { count: "exact", head: true })
      .eq("source", "free_check")
      .not("lead_id", "is", null)
      .gte("created_at", since);
    if (capErr) return { kind: "refused", reason: `could not read the daily cap: ${capErr.message}` };
    if ((spentToday ?? 0) >= FREE_CHECK_DAILY_LEAD_CAP) {
      return {
        kind: "skipped",
        reason: `daily cap reached (${spentToday} free-check leads in 24h, cap ${FREE_CHECK_DAILY_LEAD_CAP}) — the answers are saved and nothing was spent`,
      };
    }

    // ── 3. RESOLVE WHICH BUSINESS THEY ARE (Text Search Pro, three guards) ───────────────────
    const apiKey = Deno.env.get("GOOGLE_MAPS_API_KEY") ?? "";
    let placeId: string | null = null;
    let resolveNote: string | null = null;
    if (!apiKey) {
      resolveNote = "GOOGLE_MAPS_API_KEY is not set on this function";
    } else if (!town) {
      // The town-hint guard would refuse anyway; say so without paying to be told.
      resolveNote = "no town given, so no place could be matched safely";
    } else {
      const r = await resolvePlaceId(service, userId, businessName, town, "UK", apiKey);
      placeId = r.placeId;
      resolveNote = r.capped
        ? "the place-search daily cap was reached"
        : r.refused ?? (r.placeId ? null : "Google did not answer the place search (transient)");
    }

    // ── 4. place_id DEDUPE — the moment that key exists ──────────────────────────────────────
    if (placeId) {
      try {
        const byPlace = await findBy(service, "place_id", placeId);
        if (byPlace) {
          return {
            kind: "matched",
            leadId: String(byPlace.id),
            matchedOn: "place_id",
            existingName: String(byPlace.business_name ?? businessName),
            archived: byPlace.is_archived === true,
          };
        }
      } catch (e) {
        return { kind: "refused", reason: (e as Error).message };
      }
    }

    // ── 5. THE PHONE (Place Details Enterprise; rating + reviews ride along free) ────────────
    let phone: string | null = null;
    let rating: number | null = null;
    let reviewCount: number | null = null;
    let website: string | null = null;
    if (placeId && apiKey) {
      const d = await fetchPlaceDetails(placeId, apiKey, ENTERPRISE_FIELDS);
      phone = d?.phone ?? null;
      rating = d?.rating ?? null;
      reviewCount = d?.reviewCount ?? null;
      website = d?.website ?? null;
    }

    // ── 6. PHONE DEDUPE — catches the same operator trading under a different name ───────────
    if (phone) {
      try {
        const byPhone = await findBy(service, "phone", phone);
        if (byPhone) {
          return {
            kind: "matched",
            leadId: String(byPhone.id),
            matchedOn: "phone",
            existingName: String(byPhone.business_name ?? businessName),
            archived: byPhone.is_archived === true,
          };
        }
      } catch (e) {
        return { kind: "refused", reason: (e as Error).message };
      }
    }

    /* ── 7. CREATE ────────────────────────────────────────────────────────────────────────────
       `not_contacted` and list_type 'no_website' are the same literals addLead writes (the latter
       is a leftover of the old product line and is NOT a website signal — CLAUDE.md §9). The trade
       and town go to search_keyword / search_location, which is where every audit entry point
       already looks for them. */
    const row: Record<string, unknown> = {
      user_id: userId,
      business_name: businessName,
      search_keyword: trade || null,
      search_location: town || null,
      status: "not_contacted",
      list_type: "no_website",
      country: "UK",
      enrichment_source: "free_check",
      notes: `Came in through the free AI check on findable.live${trade ? ` — asked about ${trade}` : ""}${town ? ` in ${town}` : ""}.`,
    };
    if (placeId) row.place_id = placeId;
    if (phone) row.phone = phone;
    if (website) row.website = website;
    if (rating !== null) row.rating = rating;
    if (reviewCount !== null) row.review_count = reviewCount;
    /* The email they typed themselves, with the provenance columns the rest of the system reads.
       Better than anything enrichment produces — the same reasoning findable-onboarding's
       write-through uses for a KNOWN lead. */
    if (!blank(input.email)) {
      row.email = String(input.email).trim();
      row.email_method = "free_check";
      row.email_status = "found";
      row.email_last_checked_at = new Date().toISOString();
    }

    const { data: created, error: insErr } = await service
      .from("outreach_leads").insert(row).select("id").maybeSingle();
    if (insErr || !created?.id) {
      return { kind: "refused", reason: `lead insert failed: ${insErr?.message ?? "no row returned"}` };
    }
    const leadId = String(created.id);

    /* ── 8. THE TOWN, through the ONE path that stamps it correctly ───────────────────────────
       resolveDerivedTown owns derived_town / town_fetched_at / town_fetch_note / lat / lng /
       address and their 30-day cache. Duplicating that stamping here is how the SETTLED_TOWN_NOTES
       semantics — which decide whether every send gate holds this lead — would drift. It never
       throws, and with no place_id it stamps the settled `no_place_id` note, which correctly leaves
       the lead town-GATED rather than silently sendable. */
    let derivedTown: string | null = null;
    try {
      const t = await resolveDerivedTown(service, leadId);
      derivedTown = t.town;
    } catch (e) {
      console.warn(`[free-check-lead] town resolution threw for ${leadId}: ${(e as Error).message}`);
    }

    return { kind: "created", leadId, placeId, phone, town: derivedTown, note: resolveNote };
  } catch (e) {
    // A catch-all that REPORTS rather than swallows (§4: a catch-all message is worse than none).
    return { kind: "refused", reason: `free-check lead creation threw: ${(e as Error).message}` };
  }
}
