/* ════════════════════════════════════════════════════════════════════════════════════════════════
   MOCKUP PREPARATION ON A FIRST REPLY — Step 2 of the mockup build.

   A prospect replies to the opener. The existing three-mode reply rule already arms the audit
   (audit_only by default: measure, send nothing). This adds the second half of Paul's flow — get
   the MOCKUP's data ready — so that by the time he opens the picker the services, areas and their
   own photos are already there and he is not waiting on a scrape.

   ⛔ IT PREPARES; IT DOES NOT PUBLISH AND IT DOES NOT SEND. The row is created `draft`, which
   Step 1 proved anon cannot read, and nothing here queues a message. The before/after image is
   sent BY HAND, as a second WhatsApp message, after Paul has placed the images.

   ⛔ WHY IT HANGS OFF THE REPLY RULE RATHER THAN BEING ITS OWN TRIGGER. That chain already carries
   seven guards that took incidents to learn — the opener gate, the once-per-lead slot, decline
   detection, auto-responder detection, cross-channel suppression, never-touch-a-paying-customer,
   and archived-means-stop. Every one of them is the right answer for a mockup too, and CLAUDE.md
   records four separate incidents caused by a second copy of a guard drifting from the first. So
   this is called from INSIDE that chain, after those guards have already passed, and re-checks
   nothing they have decided.

   ⛔ WHAT IT ADDS ARE THE THREE REFUSALS THAT ARE SPECIFIC TO A MOCKUP, and none of them is a
   contact decision:
     1. no own website        — the before/after has nothing to put in the "before" panel. Paul's
                                explicit rule: say so and skip; they need a different pitch.
     2. website is an aggregator — a Facebook page or a Checkatrade profile is not their site, and
                                screenshotting one would label a directory as "your site today".
     3. no template for their trade — nicheForKeyword returns null. Building a locksmith mockup for
                                an accountant is worse than building nothing.

   ⚠️ IT CAN NEVER THROW. The caller is a webhook that has already stored the prospect's reply. A
   mockup failure must cost the mockup and nothing else — never the reply, never the lead status,
   never the audit. Every path returns a reason instead.

   🔴 AND IT IS SPLIT IN TWO BECAUSE THE CALLER IS A META WEBHOOK. Creating the row is one insert;
   scraping their website takes 8-25 SECONDS (measured: 3.2s to 25.9s across six real sites).
   Meta retries a webhook it considers slow, and a retried inbound would re-run the whole reply
   chain — so the scrape must not sit in the request path. `createMockupRow` is the fast half and
   is awaited; `fillMockupFromSite` is the slow half and is handed to EdgeRuntime.waitUntil, which
   runs it AFTER the response has gone back to Meta.
   ⚠️ If waitUntil is unavailable the fill is simply not scheduled — the row still exists with
   `scrape: null`, and the picker treats that as "not scraped yet" and can run it on demand. That
   is why null and empty are different values here: absent means nobody has looked, empty means we
   looked and they list nothing.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import { isAggregatorUrl } from "./aggregators.ts";
import { nicheForKeyword, MOCKUP_SCRAPE_MAX_AREAS } from "../../../src/lib/mockupNiche.ts";

/** Why a mockup row was or was not created. Recorded, never silent. */
export type MockupOutcome =
  | { started: true; siteId: string; niche: string; website: string; businessName: string }
  | {
    started: false;
    reason:
      | "already_exists"
      | "no_website"
      | "website_is_aggregator"
      | "no_template_for_trade"
      | "lead_unreadable"
      | "insert_failed"
      | "error";
    detail?: string;
  };

/**
 * THE FAST HALF: apply the three mockup refusals and create the draft row. One insert, no fetch.
 * Safe to await inside the webhook. Returns an outcome; never throws.
 */
export async function createMockupRow(
  // deno-lint-ignore no-explicit-any
  service: any,
  leadId: string,
): Promise<MockupOutcome> {
  try {
    /* ── Idempotent: one mockup per lead, ever ────────────────────────────────────────────
       ⚠️ CHECKED ON lead_id AND NOT ON `template`. A repeat reply from the same business must
       not build a second mockup, whatever niche the first one was — and Paul's flow is one
       screen per business, so a second row would just be a second thing to pick images for.
       Re-generating is a deliberate operator action on the picker, not something a reply does. */
    const { data: existing, error: exErr } = await service
      .from("generated_sites").select("id").eq("lead_id", leadId).limit(1).maybeSingle();
    if (exErr) {
      /* ⛔ FAIL CLOSED. An unreadable existence check must not create a duplicate — the
         duplicate-openers incident (CLAUDE.md §8) was exactly this shape: a dedupe read that
         returned nothing was treated as "no duplicates exist". */
      return { started: false, reason: "error", detail: `existence check failed: ${exErr.message ?? "unknown"}` };
    }
    if (existing?.id) return { started: false, reason: "already_exists", detail: existing.id };

    const { data: lead, error: leadErr } = await service
      .from("outreach_leads")
      .select("id, user_id, business_name, website, search_keyword, category, derived_town, search_location, address, phone, email")
      .eq("id", leadId).maybeSingle();
    if (leadErr || !lead?.business_name || !lead?.user_id) {
      return { started: false, reason: "lead_unreadable", detail: leadErr?.message ?? "missing name or owner" };
    }

    /* ── The three mockup-specific refusals ─────────────────────────────────────────────── */
    const website = typeof lead.website === "string" ? lead.website.trim() : "";
    if (!website) return { started: false, reason: "no_website" };
    if (isAggregatorUrl(website)) return { started: false, reason: "website_is_aggregator", detail: website };

    /* ⚠️ TRADE FROM search_keyword, NOT category. category is populated on 1 lead of 3,203
       (measured 2026-09-10); search_keyword on 3,063. `category` is kept as a second look only
       because it costs nothing, but it is not the signal. */
    const niche = nicheForKeyword(lead.search_keyword) ?? nicheForKeyword(lead.category);
    if (!niche) {
      return {
        started: false,
        reason: "no_template_for_trade",
        detail: String(lead.search_keyword ?? lead.category ?? "").slice(0, 60),
      };
    }

    /* ── Create the row FIRST, draft, and own it before spending anything ────────────────
       ⛔ ROW BEFORE SCRAPE, deliberately. The scrape costs money and takes 8-25 seconds; if it
       were first, a crash between the two would leave a paid-for scrape with nowhere to live and
       the next reply would pay again. The row is also what makes the work visible: a mockup that
       exists with empty content is diagnosable, a mockup that does not exist is not.
       ⛔ status 'draft' AND NEVER 'published'. Step 1 proved anon reads only published rows
       (105 rows: 93 published visible to anon, 12 draft returning [] by id AND by name), so
       draft is the whole privacy boundary for the mockup's content. Nothing here may publish. */
    const siteName = `mockup-${leadId.slice(0, 8)}-${Date.now().toString(36)}`;
    const { data: created, error: insErr } = await service
      .from("generated_sites")
      .insert({
        lead_id: leadId,
        owner_id: lead.user_id,
        site_name: siteName,
        template: niche,
        status: "draft",
        content: {
          kind: "mockup",
          niche,
          created_by: "first_reply",
          /* The business facts, from the lead row — already paid for at lead-creation time.
             ⚠️ These are the PREFILL, not the confirmed values. Google Places terms allow
             place_id to be stored indefinitely and nothing else long-term, so a Places-sourced
             value may fill a draft and must be operator-confirmed before it is published
             anywhere. Nothing here publishes, which is what makes the prefill legitimate. */
          business: {
            name: lead.business_name,
            town: lead.derived_town ?? lead.search_location ?? null,
            phone: lead.phone ?? null,
            email: lead.email ?? null,
            address: lead.address ?? null,
          },
          current_site_url: website,
          /* Filled by the scrape below, and by the picker afterwards. Absent is not empty:
             a consumer must be able to tell "not scraped yet" from "they list no services". */
          scrape: null,
          images: [],
          slots: {},
        },
      })
      .select("id").single();
    if (insErr || !created?.id) {
      return { started: false, reason: "insert_failed", detail: insErr?.message ?? "no id returned" };
    }

    return { started: true, siteId: created.id, niche, website, businessName: lead.business_name };
  } catch (e) {
    // Never throws — see the header. The caller has already stored the prospect's reply.
    return { started: false, reason: "error", detail: (e as Error).message?.slice(0, 200) };
  }
}

/**
 * THE SLOW HALF: read their own website and fill the row's `scrape` + `images`.
 *
 * ⚠️ NEVER AWAIT THIS IN A WEBHOOK — hand it to EdgeRuntime.waitUntil (see the header). It is also
 * safe to call directly from an operator action (the picker's retry), where waiting is fine.
 * Never throws; a failure leaves `scrape` null, which is NOT the same as an empty scrape.
 */
/**
 * How to authenticate the call to scan-site-details.
 *
 * 🔴 THIS EXISTS BECAUSE THE OBVIOUS WAY IS DEAD. The first version sent
 * `Authorization: Bearer <SUPABASE_SERVICE_ROLE_KEY>` + x-internal-job, which is the shape most
 * of this repo's internal calls are written in — and it returned 401 on the first real run.
 * CLAUDE.md §8 has the whole record: since the ~2026-08-11 key rotation the service-role key is
 * `sb_secret_…` shaped, not a JWT, so scan-site-details' `getClaims(token)` cannot read it. Every
 * service-role-bearer branch in this project is dead, and it is NOT a key-hunting problem: the
 * gateway only forwards a JWT-shaped bearer, while `sb_` keys are accepted only in `apikey`. No
 * combination satisfies both.
 *
 * So there are exactly two doors, and the caller says which it is holding:
 *   · operator — the operator's own JWT, straight through. scan-site-details already accepts this
 *                and needs NO change. This is the picker and every hand-run fill.
 *   · internal — CRON_SECRET via x-cron-secret + x-internal-job, the pattern extract-competitors
 *                and generate-report use. ⚠️ NEEDS AN INTERNAL BRANCH ADDING TO
 *                scan-site-details, which does not have one yet — until then the webhook path
 *                cannot pre-scrape and the row is simply left with `scrape: null` for the picker.
 */
export type FillAuth =
  | { kind: "operator"; jwt: string }
  | { kind: "internal"; cronSecret: string };

export async function fillMockupFromSite(
  // deno-lint-ignore no-explicit-any
  service: any,
  siteId: string,
  args: { website: string; businessName: string; niche: string; leadId: string },
  opts: { supabaseUrl: string; auth: FillAuth },
): Promise<{ ok: boolean; detail: string }> {
  try {
    const authHeaders: Record<string, string> = opts.auth.kind === "operator"
      ? { Authorization: `Bearer ${opts.auth.jwt}` }
      : { "x-cron-secret": opts.auth.cronSecret, "x-internal-job": "1" };
    const res = await fetch(`${opts.supabaseUrl}/functions/v1/scan-site-details`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...authHeaders,
      },
      body: JSON.stringify({
        website: args.website,
        business_name: args.businessName,
        audit_id: `mockup-${siteId}`, // scopes scan-site-details' 30-day cache to THIS mockup
        max_areas: MOCKUP_SCRAPE_MAX_AREAS,
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok || !body?.success) {
      return { ok: false, detail: `scan failed: ${String(body?.error ?? res.status).slice(0, 140)}` };
    }

    /* ⛔ READ-MODIFY-WRITE ON content, NOT AN OVERWRITE. The picker may already have written
       image assignments into `slots` by the time a retry lands, and clobbering an operator's
       placements with a fresh scrape would be the worst possible bug on this screen — silent,
       and it destroys the only manual work in the whole flow. Merge, and let slots win. */
    const { data: row } = await service
      .from("generated_sites").select("content").eq("id", siteId).maybeSingle();
    const prev = (row?.content ?? {}) as Record<string, unknown>;
    const prevBusiness = (prev.business ?? {}) as Record<string, unknown>;
    const d = (body.details ?? {}) as Record<string, unknown>;

    const next = {
      ...prev,
      business: {
        ...prevBusiness,
        /* ⚠️ THE SCRAPE WINS OVER THE LEAD ROW, but only where it found something. Their own
           website is a better source for what a mockup prints than a Places record: it is the
           business's own statement about itself, and it is what the prospect will compare the
           mockup against. A null from the scrape leaves the existing value rather than blanking it. */
        phone: d.phone ?? prevBusiness.phone ?? null,
        email: d.email ?? prevBusiness.email ?? null,
        address: d.address ?? prevBusiness.address ?? null,
        hours: d.hours ?? prevBusiness.hours ?? null,
      },
      scrape: {
        at: new Date().toISOString(),
        services: Array.isArray(d.services) ? d.services : [],
        areas: Array.isArray(d.areas) ? d.areas : [],
        source_urls: Array.isArray(body.source_urls) ? body.source_urls : [],
        cost_usd: typeof body.cost_usd === "number" ? body.cost_usd : null,
        diag: body.diag ?? null,
      },
      /* Their own site's images, each carrying where it came from.
         ⛔ SOURCE IS RECORDED AT HARVEST, NOT INFERRED LATER. Once these are re-hosted into our
            own bucket a Places photo and an own-site photo are both just bucket URLs —
            indistinguishable. That is exactly how the old picker lost provenance, and Paul needs
            it because a saved mockup may become a real build, at which point Places-sourced
            images must be swapped FIRST. */
      images: Array.isArray(body.images) ? body.images : (prev.images ?? []),
      // slots is deliberately NOT touched — see the read-modify-write note above.
    };

    const { error: upErr } = await service
      .from("generated_sites").update({ content: next }).eq("id", siteId);
    if (upErr) return { ok: false, detail: `update failed: ${String(upErr.message ?? "").slice(0, 140)}` };

    const nSvc = Array.isArray(d.services) ? d.services.length : 0;
    const nArea = Array.isArray(d.areas) ? d.areas.length : 0;
    const nImg = Array.isArray(body.images) ? body.images.length : 0;
    return { ok: true, detail: `${nSvc} services, ${nArea} areas, ${nImg} own-site images` };
  } catch (e) {
    return { ok: false, detail: `scan threw: ${String((e as Error).message ?? "").slice(0, 140)}` };
  }
}
