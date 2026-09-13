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
/* The dedupe's judgement lives in its own pure module, with the measured collisions as its tests.
   ⛔ ANY CHANGE THERE NEEDS BOTH CONSUMERS OF THIS FILE REDEPLOYED — findable-onboarding is the
   only entry point today, but that is a fact to check, not to assume (the four-day result-email
   outage was one undeployed consumer of one shared module). */
import {
  pickSameBusiness, pickByPlaceId,
  type SameBusinessCandidate, type SameBusinessVerdict,
} from "./same-business.ts";

// The SAME normaliser the send path uses, so a stored number is always one we can dial.
import { toWhatsAppNumber } from "./whatsapp-send.ts";

/** How many free-check leads may enrich themselves per rolling 24h. Paul's number, 2026-08-19.
 *  Generic mode has no rate limit of its own and each submission now costs real pence, so this is
 *  the blast radius if the form is scraped or spammed: 10 × $0.057 ≈ 57¢ a day. */
export const FREE_CHECK_DAILY_LEAD_CAP = 10;

export interface FreeCheckInput {
  businessName: string;
  town: string;
  trade: string;
  email: string | null;
  /** OPTIONAL, and typed by the visitor. Normalised to WhatsApp form before it is used for anything
   *  — a typed "07700 900123" and a stored "+447700900123" are the same number, and an unnormalised
   *  compare would miss every duplicate and store a number the send path cannot dial. */
  phone?: string | null;
  /** OPTIONAL, and typed by the visitor on the pre-pay panel. Set at CREATION for the same reason
   *  the phone is: findable-onboarding's write-through keys on the REQUEST's lead_id, and a cold
   *  signup has none — the lead does not exist until this function makes it. So the name was
   *  captured on the onboarding row and never reached the lead, on every signup ever made.
   *  ⚠️ It is the CONTACT's name, not the business's. It prints in the contact line of every page
   *  the generator builds and is {{1}} in the questionnaire follow-up. */
  contactName?: string | null;
  /* ⛔ WHY THE VISITOR IS HERE, AND IT CHANGES ONE THING ONLY: WHETHER THE DAILY CAP APPLIES.
     'free_check' (the default) is someone asking for a free audit, and the cap exists because each
     one costs real pence and nothing else rate-limits that form. 'signup' is someone ON THEIR WAY
     TO PAY with no ?lead= tag, and refusing them because ten strangers wanted a free check first
     would turn a spend guard into a lost sale. A paying customer is worth 4.5p unconditionally.
     ⚠️ Everything else - the dedupe, its fail-closed behaviour, the three-guard place resolution,
     the town derivation - is IDENTICAL for both. This flag must never grow into a second code path;
     the day it decides anything but the cap and the provenance label, split the function instead. */
  purpose?: "free_check" | "signup";
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

/**
 * One keyed dedupe read — EVERY match, not the first one.
 *
 * ⛔ IT USED TO BE `.limit(1).maybeSingle()`, AND THAT WAS THE BUG. Seven leads share the name
 * "Timpson Locksmiths and Safe Engineers" and fifteen share Timpson's national phone number; the
 * old read took whichever row Postgres happened to return, so which business a prospect got
 * attributed to was a coin toss. The caller can only apply a town rule if it can see all the
 * candidates, so the read has to return them.
 * ⚠️ Still throws on error so the caller fails CLOSED. A dedupe that cannot prove a lead is new
 * must not create one.
 * ⚠️ The cap is generous rather than absent: the largest real group is 15, and a key matching
 * hundreds of leads is a data problem this function should not try to resolve.
 */
// deno-lint-ignore no-explicit-any
async function findAllBy(service: any, column: string, value: string): Promise<SameBusinessCandidate[]> {
  const { data, error } = await service
    .from("outreach_leads")
    /* derived_town FIRST, search_location as the fallback: the derived town is what Google says the
       business's address is in, and the search location is only where we were looking when we found
       it. Preferring the search would compare a prospect's town against our own search radius. */
    .select("id, business_name, derived_town, search_location, address, place_id, is_archived, created_at")
    .eq(column, value)
    .limit(50);
  if (error) throw new Error(`dedupe read on ${column} failed: ${error.message}`);
  // deno-lint-ignore no-explicit-any
  return ((data ?? []) as any[]).map((r) => ({
    id: String(r.id),
    business_name: r.business_name ?? null,
    town: (r.derived_town ?? null) as string | null,
    searchLocation: (r.search_location ?? null) as string | null,
    address: (r.address ?? null) as string | null,
    place_id: r.place_id ?? null,
    is_archived: r.is_archived ?? null,
    created_at: r.created_at ?? null,
  }));
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
    const purpose = input.purpose ?? "free_check";   // absent = the capped free-check path
    if (!businessName) return { kind: "refused", reason: "no business name given" };

    const userId = await resolveOwnerUserId(service);
    if (!userId) return { kind: "refused", reason: "could not resolve the owning account from existing leads" };

    /* ⛔ EVERY REFUSED MATCH IS COLLECTED, NOT DISCARDED. A new lead created because the name hit a
       chain in another town is a DIFFERENT event from one created because nothing matched at all,
       and the operator needs to be able to tell them apart — that is the whole lesson of the alert
       that narrated a state nobody had checked. These end up in the created lead's note. */
    const nearMisses: string[] = [];
    const matchFrom = (
      v: SameBusinessVerdict,
      candidates: SameBusinessCandidate[],
      on: "place_id" | "phone" | "name",
    ): FreeCheckOutcome | null => {
      if (v.kind === "match") {
        const hit = candidates.find((c) => c.id === v.leadId)!;
        return {
          kind: "matched",
          leadId: v.leadId,
          matchedOn: on,
          existingName: String(hit.business_name ?? businessName),
          archived: hit.is_archived === true,
        };
      }
      /* Only a genuine near miss is worth recording. "no lead has this name" is the normal case and
         would be noise on every single new lead. */
      if (candidates.length > 0) nearMisses.push(v.reason);
      return null;
    };

    // ── 1. NAME DEDUPE — free, so it goes first ──────────────────────────────────────────────
    /* ⛔ AND IT IS NO LONGER TOWN-BLIND. An exact business_name matched a chain across towns and
       took an arbitrary one of them: "Timpson" exists in Blyth AND Wisbech, and "Timpson Locksmiths
       and Safe Engineers" on seven leads in three towns. Measured 2026-09-07 over 3,192 leads: 87
       exact names are shared and 4 are provably different businesses. The town now has to agree,
       and two candidates in the SAME town refuse rather than guess. */
    try {
      const byName = await findAllBy(service, "business_name", businessName);
      const hit = matchFrom(pickSameBusiness(byName, town, "business name"), byName, "name");
      if (hit) return hit;
    } catch (e) {
      return { kind: "refused", reason: (e as Error).message };
    }

    /* ── 2. THE DAILY CAP, checked BEFORE the first paid call ─────────────────────────────────
       ⛔ SKIPPED ENTIRELY FOR A SIGNUP. See `purpose` on the input: the cap protects a free form
          from costing money at volume, and a signup is not that. It still runs for free checks. */
    const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: spentToday, error: capErr } = await service
      .from("onboarding_responses")
      .select("id", { count: "exact", head: true })
      .eq("source", "free_check")
      .not("lead_id", "is", null)
      .gte("created_at", since);
    if (capErr) return { kind: "refused", reason: `could not read the daily cap: ${capErr.message}` };
    if (purpose !== "signup" && (spentToday ?? 0) >= FREE_CHECK_DAILY_LEAD_CAP) {
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
        /* ⛔ place_id IS EXEMPT FROM THE TOWN RULE, DELIBERATELY. It identifies the business
           itself, so two leads sharing one are duplicates of a single shop rather than two shops —
           and it is the ONLY thing that separates Fletcher Lock & Safe Co's two Sunderland
           branches. Ties resolve to the OLDEST lead, deterministically. */
        const byPlace = await findAllBy(service, "place_id", placeId);
        const hit = matchFrom(pickByPlaceId(byPlace), byPlace, "place_id");
        if (hit) return hit;
      } catch (e) {
        return { kind: "refused", reason: (e as Error).message };
      }
    }

    /* ── 4b. THE PHONE THEY TYPED — CHECKED BEFORE WE SPEND ANYTHING ─────────────────────────
       ⛔ ORDERED BEFORE PLACE DETAILS ON PURPOSE, and it is a saving rather than a nicety: a
       supplied phone can match an existing lead for FREE, where discovering the same number through
       Google costs the $0.020 Enterprise call first. A repeat submitter who gives their number
       therefore costs nothing at all.
       ⚠️ Normalised through the same toWhatsAppNumber the send path uses, so what is compared and
       what is stored are the form the rest of the system dials. An unparseable number is dropped
       rather than stored raw — a number we cannot dial is not a phone, and storing it would make
       the lead look contactable when it is not. */
    const typedPhone = toWhatsAppNumber(input.phone ?? "", null);
    if (typedPhone) {
      try {
        /* ⛔ THE PHONE RUNG IS THE RISKIEST OF THE THREE, so it gets the same town rule. Measured
           2026-09-07: 105 numbers are shared across leads and 29 of those sit on DIFFERENT business
           names. The worst is 448000187187 — Timpson's national switchboard — on fifteen leads
           across eight towns; Toolstation's 443303333303 spans March, Hampshire and Bath. Matching
           on that alone attributed a prospect to an arbitrary branch. */
        const byTyped = await findAllBy(service, "phone", typedPhone);
        const hit = matchFrom(pickSameBusiness(byTyped, town, "phone"), byTyped, "phone");
        if (hit) return hit;
      } catch { /* a failed lookup must not stop the lead being created — the later guards remain */ }
    }

    // ── 5. THE PHONE (Place Details Enterprise; rating + reviews ride along free) ────────────
    let phone: string | null = typedPhone;
    let rating: number | null = null;
    let reviewCount: number | null = null;
    let website: string | null = null;
    if (placeId && apiKey) {
      const d = await fetchPlaceDetails(placeId, apiKey, ENTERPRISE_FIELDS);
      /* ⚠️ THEIRS WINS. They typed this number minutes ago asking us to contact them; Google's
         listing may be a switchboard, an old number, or an agency's. Only fall back to Google when
         they gave us nothing. */
      phone = phone ?? d?.phone ?? null;
      rating = d?.rating ?? null;
      reviewCount = d?.reviewCount ?? null;
      website = d?.website ?? null;
    }

    // ── 6. PHONE DEDUPE — catches the same operator trading under a different name ───────────
    if (phone) {
      try {
        /* The phone Google gave us, same rule as the typed one. */
        const byPhone = await findAllBy(service, "phone", phone);
        const hit = matchFrom(pickSameBusiness(byPhone, town, "phone"), byPhone, "phone");
        if (hit) return hit;
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
      enrichment_source: purpose === "signup" ? "signup" : "free_check",
      notes: purpose === "signup"
        ? `Signed up directly on findable.live${trade ? ` — ${trade}` : ""}${town ? ` in ${town}` : ""}. No prospecting; they arrived with no lead link.`
        : `Came in through the free AI check on findable.live${trade ? ` — asked about ${trade}` : ""}${town ? ` in ${town}` : ""}.`,
    };
    /* ⛔ A NEW LEAD CREATED DESPITE A NEAR MISS SAYS SO ON THE ROW. Otherwise the two reasons for
       creating one — "nothing matched" and "a chain matched in another town and we refused to
       guess" — are indistinguishable, and the second is the one an operator may want to look at
       (it can mean a genuine duplicate, or a chain worth knowing about). Appended rather than
       replacing the provenance line, because both facts matter. */
    if (nearMisses.length > 0) {
      row.notes = `${row.notes} Created as a NEW lead rather than reusing an existing one: `
        + `${nearMisses.join("; ")}.`;
    }
    if (placeId) row.place_id = placeId;
    if (phone) row.phone = phone;
    /* Set on the INSERT, so it cannot be missed by a write-through that runs before the lead
       exists. Nothing can be overwritten here by definition — the row is new. */
    if (!blank(input.contactName)) row.contact_name = String(input.contactName).trim().slice(0, 120);
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
