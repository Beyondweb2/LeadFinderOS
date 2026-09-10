import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { createMockupRow, fillMockupFromSite } from "../_shared/mockup-trigger.ts";
import { fetchMapsPool, mergePool, scorePoolForSort, sortPool, type PoolImage } from "../_shared/mockup-pool.ts";
import { rehostToMockupBucket, signMockupPath } from "../_shared/mockup-rehost.ts";
import { nicheByKey, MOCKUP_MAX_SERVICES, MOCKUP_MAX_AREAS } from "../../../src/lib/mockupNiche.ts";
import { slotsIn } from "../../../src/lib/mockupRender.ts";
import { stockAllowedInSlot, stockById, stockFor } from "../../../src/lib/mockupStock.ts";

/* ════════════════════════════════════════════════════════════════════════════════════════════════
   mockup — the operator's door to one prospect's mockup.

   Step 2 ships two actions; the picker (Step 3) adds the rest on the same seam:
     · prepare — create the draft row and read their website. Idempotent: an existing row is
                 returned rather than duplicated. This is also what makes the reply trigger
                 verifiable, since a webhook cannot be safely fired by hand.
     · get     — read one mockup back, for the picker and for the preview.

   ⛔ SAME CODE AS THE REPLY TRIGGER, NOT A SECOND COPY. Both actions call the shared
   _shared/mockup-trigger.ts. A hand-run "prepare" that behaved differently from the automatic one
   would make every manual test worthless — that is the duplicate-guard drift CLAUDE.md records
   four incidents of, applied to a test path.

   ⚠️ ONE DELIBERATE DIFFERENCE, AND IT IS ABOUT LATENCY ONLY: here the scrape is AWAITED. The
   webhook hands it to waitUntil because Meta retries a slow webhook; an operator pressing a button
   wants the answer. Same function, same result, different waiting.

   ⛔ NOTHING HERE PUBLISHES OR SENDS. Rows are `draft` — Step 1 proved anon cannot read those —
   and there is no code path to `published` in this function. The before/after image is sent by
   hand as a second WhatsApp message.

   Auth: admin JWT only (the pattern review-reply / page-generator use). verify_jwt is false in
   config.toml because the check happens in-handler, and the entry is added in the SAME commit —
   a function absent from config.toml deploys with the platform default verify_jwt = true and only
   internal callers die, silently, weeks later (CLAUDE.md §8).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ ok: false, error: "unauthorized" }, 401);
    const token = authHeader.slice(7);

    const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });
    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: u } = await userClient.auth.getUser();
    if (!u?.user) return json({ ok: false, error: "unauthorized" }, 401);

    /* Admin only. The mockup carries a prospect's scraped content and their competitors'
       context; it is operator material, not per-user data. */
    const { data: roleRow } = await service
      .from("user_roles").select("role").eq("user_id", u.user.id).eq("role", "admin").maybeSingle();
    if (!roleRow) return json({ ok: false, error: "forbidden" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = typeof body.action === "string" ? body.action : "";

    /* ── prepare ──────────────────────────────────────────────────────────────────────── */
    if (action === "prepare") {
      const leadId = typeof body.lead_id === "string" ? body.lead_id.trim() : "";
      if (!leadId) return json({ ok: false, error: "lead_id required" }, 400);

      const outcome = await createMockupRow(service, leadId);

      /* An existing row is not a failure — it is the idempotency guard doing its job. Return it
         with its content so the caller can act, and say plainly that nothing new was created. */
      if (!outcome.started) {
        if (outcome.reason === "already_exists" && outcome.detail) {
          const { data: row } = await service
            .from("generated_sites")
            .select("id, lead_id, template, status, content, created_at, updated_at")
            .eq("id", outcome.detail).maybeSingle();
          return json({ ok: true, created: false, reason: "already_exists", mockup: row ?? null });
        }
        return json({ ok: false, created: false, reason: outcome.reason, detail: outcome.detail ?? null });
      }

      // Awaited here, unlike the webhook — see the header.
      const fill = await fillMockupFromSite(
        service,
        outcome.siteId,
        {
          website: outcome.website,
          businessName: outcome.businessName,
          niche: outcome.niche,
          leadId,
          ownerId: outcome.ownerId,
        },
        { supabaseUrl, auth: { kind: "operator", jwt: token } },
      );

      const { data: row } = await service
        .from("generated_sites")
        .select("id, lead_id, template, status, content, created_at, updated_at")
        .eq("id", outcome.siteId).maybeSingle();

      return json({
        ok: true,
        created: true,
        mockup: row ?? null,
        niche: outcome.niche,
        niche_label: nicheByKey(outcome.niche)?.label ?? null,
        scrape: { ok: fill.ok, detail: fill.detail },
      });
    }

    /* ── get ──────────────────────────────────────────────────────────────────────────── */
    if (action === "get") {
      const leadId = typeof body.lead_id === "string" ? body.lead_id.trim() : "";
      const siteId = typeof body.id === "string" ? body.id.trim() : "";
      if (!leadId && !siteId) return json({ ok: false, error: "lead_id or id required" }, 400);

      let q = service
        .from("generated_sites")
        .select("id, lead_id, template, status, content, created_at, updated_at");
      q = siteId ? q.eq("id", siteId) : q.eq("lead_id", leadId);
      const { data: row, error } = await q.limit(1).maybeSingle();
      if (error) return json({ ok: false, error: "read_failed", detail: error.message }, 500);

      /* ⛔ SIGNED URLS ARE MINTED HERE, NEVER STORED. mockup-assets is PRIVATE (Step 1 proved the
         public barber bucket serves a draft row's images to anyone with the URL), so a placed photo
         has no readable address until it is signed — and a signature expires, so persisting one
         would give a mockup that silently loses its images a week later. The stored value is the
         path; this is where it becomes displayable.
         ⚠️ Returned in a SEPARATE map rather than written into content.slots, so a read can never
         accidentally persist an expiring URL back into the row. */
      const slotUrls: Record<string, string> = {};
      if (row) {
        const slots = (((row.content ?? {}) as Record<string, unknown>).slots ?? {}) as Record<string, Record<string, unknown>>;
        for (const [name, v] of Object.entries(slots)) {
          if (v?.kind === "stock") continue;                 // stock is served from /public, unsigned
          const path = typeof v?.path === "string" ? v.path : "";
          const signed = await signMockupPath(service, path);
          if (signed) slotUrls[name] = signed;
        }
      }

      /* ⛔ null IS A REAL ANSWER AND SAYS SO. "no mockup for this lead" and "the read failed"
         must never look the same to the picker — the RLS-returns-200-with-[] trap that has cost
         this codebase three features (CLAUDE.md §8). */
      return json({ ok: true, found: !!row, mockup: row ?? null, slot_urls: slotUrls });
    }

    /* ── refill: re-read their website into an existing mockup ────────────────────────── */
    if (action === "refill") {
      const siteId = typeof body.id === "string" ? body.id.trim() : "";
      if (!siteId) return json({ ok: false, error: "id required" }, 400);
      const { data: row } = await service
        .from("generated_sites").select("id, lead_id, template, content").eq("id", siteId).maybeSingle();
      if (!row) return json({ ok: false, error: "not_found" }, 404);
      const content = (row.content ?? {}) as Record<string, unknown>;
      const website = typeof content.current_site_url === "string" ? content.current_site_url : "";
      const business = (content.business ?? {}) as Record<string, unknown>;
      if (!website) return json({ ok: false, error: "no_website_on_row" }, 400);

      const fill = await fillMockupFromSite(
        service,
        siteId,
        {
          website,
          businessName: String(business.name ?? ""),
          niche: String(row.template ?? ""),
          leadId: String(row.lead_id ?? ""),
          /* refill runs as the operator, so the cost cap keys on the operator. */
          ownerId: u.user.id,
        },
        { supabaseUrl, auth: { kind: "operator", jwt: token } },
      );
      const { data: after } = await service
        .from("generated_sites")
        .select("id, lead_id, template, status, content, created_at, updated_at")
        .eq("id", siteId).maybeSingle();
      return json({ ok: fill.ok, detail: fill.detail, mockup: after ?? null });
    }

    /* ── list: the mockups-waiting list ──────────────────────────────────────────────────
       Paul asked for this in the app rather than in SQL, and the picker is where it belongs: the
       check for "did the reply trigger fire" should not be a query he has to remember. */
    if (action === "list") {
      const { data: rows, error } = await service
        .from("generated_sites")
        .select("id, lead_id, template, status, content, created_at, updated_at")
        .eq("status", "draft")
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) return json({ ok: false, error: "read_failed", detail: error.message }, 500);

      // generated_sites also holds 12 barber-era drafts; kind discriminates.
      const mockups = (rows ?? []).filter((r: Record<string, unknown>) =>
        ((r.content ?? {}) as Record<string, unknown>).kind === "mockup");
      const leadIds = mockups.map((m: Record<string, unknown>) => m.lead_id).filter(Boolean);
      const names = new Map<string, string>();
      if (leadIds.length) {
        const { data: leads } = await service
          .from("outreach_leads").select("id, business_name").in("id", leadIds);
        for (const l of (leads ?? []) as Array<Record<string, string>>) names.set(l.id, l.business_name);
      }
      return json({
        ok: true,
        mockups: mockups.map((m: Record<string, unknown>) => {
          const c = (m.content ?? {}) as Record<string, unknown>;
          const scrape = (c.scrape ?? null) as Record<string, unknown> | null;
          const slots = (c.slots ?? {}) as Record<string, unknown>;
          const biz = (c.business ?? {}) as Record<string, unknown>;
          return {
            id: m.id,
            lead_id: m.lead_id,
            business: names.get(String(m.lead_id)) ?? (biz.name ?? "(unknown)"),
            niche: m.template,
            created_at: m.created_at,
            /* ⛔ null AND 0 ARE DIFFERENT AND THE UI MUST TELL THEM APART. `scraped: false` means
               nobody has read their site; `services: 0` means we read it and they list none.
               Collapsing those is the absent-value fault, and here it means either retrying a
               scrape that already ran or not retrying one that never did. */
            scraped: !!scrape,
            services: scrape ? (((scrape.services as unknown[]) ?? []).length) : null,
            areas: scrape ? (((scrape.areas as unknown[]) ?? []).length) : null,
            pooled: Array.isArray(c.pool),
            pool_size: Array.isArray(c.pool) ? (c.pool as unknown[]).length : 0,
            placed: Object.keys(slots).length,
          };
        }),
      });
    }

    /* ── pool: gather Maps + own-site, score to sort, store ──────────────────────────────
       ⛔ MAPS IS PRIMARY (Paul, ~8.6/business measured); own-site is a bonus. Maps first, each
       carrying its source. SCORE TO SORT, NEVER AUTO-PLACE — see _shared/mockup-pool.ts. */
    if (action === "pool") {
      const siteId = typeof body.id === "string" ? body.id.trim() : "";
      if (!siteId) return json({ ok: false, error: "id required" }, 400);
      const { data: row } = await service
        .from("generated_sites").select("id, lead_id, template, content").eq("id", siteId).maybeSingle();
      if (!row) return json({ ok: false, error: "not_found" }, 404);
      const content = (row.content ?? {}) as Record<string, unknown>;

      const { data: lead } = await service
        .from("outreach_leads").select("google_maps_url, place_id").eq("id", row.lead_id).maybeSingle();

      const maps = await fetchMapsPool({
        googleMapsUrl: lead?.google_maps_url ?? null,
        placeId: lead?.place_id ?? null,
        apifyToken: Deno.env.get("APIFY_TOKEN") ?? "",
      });
      const ownSite: PoolImage[] = ((content.images ?? []) as Array<Record<string, unknown>>)
        .map((i) => ({
          url: String(i.url ?? ""),
          source: "own_site" as const,
          from: typeof i.from === "string" ? i.from : "img",
          ...(typeof i.alt === "string" ? { alt: i.alt } : {}),
        }))
        .filter((i) => i.url);

      const merged = mergePool(maps.images, ownSite);

      /* ⛔ THE SLOT LIST COMES FROM THE TEMPLATE AND NOWHERE ELSE, so the scorer is asked about
         exactly the slots the operator authored — name-as-intent, Paul's decision. */
      const tplFile = typeof body.template_html === "string" ? body.template_html : "";
      const slots = tplFile ? slotsIn(tplFile) : [];

      const scored = await scorePoolForSort(merged, {
        niche: String(row.template ?? ""),
        slots,
        openAiKey: Deno.env.get("OPENAI_API_KEY") ?? "",
      });
      const ordered = sortPool(scored.images);

      await service.from("generated_sites").update({
        content: { ...content, pool: ordered, pool_at: new Date().toISOString(), slot_names: slots },
      }).eq("id", siteId);

      try {
        await service.from("client_error_reports").insert({
          error_id: "mockup_pooled",
          context: {
            site_id: siteId, lead_id: row.lead_id,
            maps: maps.images.length, own_site: ownSite.length, merged: merged.length,
            scored: scored.scored, slots,
            // MEASURED from the API response, never estimated — Paul asked for the real number.
            vision_usd: scored.costUsd, maps_usd: maps.costUsd,
            maps_error: maps.error ?? null, vision_error: scored.error ?? null,
          },
        });
      } catch (_e) { /* recording never fails the caller */ }

      return json({
        ok: true, pool: ordered, slots,
        counts: { maps: maps.images.length, own_site: ownSite.length, merged: merged.length, scored: scored.scored },
        cost_usd: { maps: maps.costUsd, vision: scored.costUsd },
        errors: { maps: maps.error ?? null, vision: scored.error ?? null },
      });
    }

    /* ── place: assign one image to one slot ─────────────────────────────────────────────── */
    if (action === "place") {
      const siteId = typeof body.id === "string" ? body.id.trim() : "";
      const slot = typeof body.slot === "string" ? body.slot.trim() : "";
      const url = typeof body.url === "string" ? body.url.trim() : "";
      const stockId = typeof body.stock_id === "string" ? body.stock_id.trim() : "";
      const clear = body.clear === true;
      if (!siteId || !slot) return json({ ok: false, error: "id and slot required" }, 400);

      const { data: row } = await service
        .from("generated_sites").select("id, content").eq("id", siteId).maybeSingle();
      if (!row) return json({ ok: false, error: "not_found" }, 404);
      const content = (row.content ?? {}) as Record<string, unknown>;
      const slots = { ...((content.slots ?? {}) as Record<string, unknown>) };

      if (clear) {
        delete slots[slot];
        await service.from("generated_sites").update({ content: { ...content, slots } }).eq("id", siteId);
        return json({ ok: true, slot, cleared: true });
      }

      /* 🔴 STOCK NEVER GOES IN THE HERO. Paul's rule and the one exception in the whole image
         strategy: the hero renders in the WhatsApp preview, so stock where their shop should be
         reads as a template. REFUSED SERVER-SIDE, not merely hidden in the UI — a rule that lives
         only in a component is one keystroke from being bypassed. */
      if (stockId) {
        if (!stockAllowedInSlot(slot)) {
          return json({
            ok: false, error: "stock_not_allowed_in_slot",
            detail: `'${slot}' takes a real photo or none — stock is below-the-fold only`,
          }, 400);
        }
        const st = stockById(stockId);
        if (!st) return json({ ok: false, error: "unknown_stock_id", detail: stockId }, 400);
        slots[slot] = {
          kind: "stock", stock_id: st.id, path: st.path, alt: st.alt,
          caption: st.caption ?? null, placed_at: new Date().toISOString(),
        };
        await service.from("generated_sites").update({ content: { ...content, slots } }).eq("id", siteId);
        return json({ ok: true, slot, placed: slots[slot], display_url: st.path });
      }

      if (!url) return json({ ok: false, error: "url, stock_id or clear required" }, 400);

      /* Provenance is carried from the POOL entry, never guessed from the URL — after re-hosting
         the bucket path says nothing about origin, and a saved mockup that becomes a real build
         needs the Places-sourced images swapped FIRST. */
      const pool = (content.pool ?? []) as Array<Record<string, unknown>>;
      const entry = pool.find((p) => String(p.url) === url);
      const source = entry && typeof entry.source === "string" ? entry.source : "unknown";

      const rehosted = await rehostToMockupBucket(url, { client: service, siteId, slot });
      if (!rehosted.ok) {
        /* ⛔ THE SLOT IS LEFT UNSET rather than pointed at a URL that will 404 — the template's
           {{#if img slot}} then collapses it. An unset slot is honest; a broken image is not. */
        return json({ ok: false, error: "rehost_failed", detail: rehosted.detail ?? null, slot }, 200);
      }
      slots[slot] = {
        kind: "photo", path: rehosted.path, source, source_url: url,
        content_type: rehosted.contentType ?? null, bytes: rehosted.bytes ?? null,
        placed_at: new Date().toISOString(),
      };
      await service.from("generated_sites").update({ content: { ...content, slots } }).eq("id", siteId);
      const display = await signMockupPath(service, rehosted.path);
      return json({ ok: true, slot, placed: slots[slot], display_url: display });
    }

    /* ── services: save the operator's corrected list ────────────────────────────────────
       ⚠️ STORED SEPARATELY from the scrape. Overwriting content.scrape.services would destroy the
       evidence of what their site actually said, which is the only way to tell a correction from a
       scrape that got it right. */
    if (action === "services") {
      const siteId = typeof body.id === "string" ? body.id.trim() : "";
      if (!siteId) return json({ ok: false, error: "id required" }, 400);
      const incoming = Array.isArray(body.services) ? body.services : null;
      if (!incoming) return json({ ok: false, error: "services array required" }, 400);
      const { data: row } = await service
        .from("generated_sites").select("id, content").eq("id", siteId).maybeSingle();
      if (!row) return json({ ok: false, error: "not_found" }, 404);
      const content = (row.content ?? {}) as Record<string, unknown>;

      const clean = incoming
        .map((s: Record<string, unknown>) => {
          const name = typeof s?.name === "string" ? s.name.trim().slice(0, 120) : "";
          const price = typeof s?.price === "string" && s.price.trim() ? s.price.trim().slice(0, 60) : undefined;
          const description = typeof s?.description === "string" && s.description.trim() ? s.description.trim().slice(0, 300) : undefined;
          return name ? { name, ...(price ? { price } : {}), ...(description ? { description } : {}) } : null;
        })
        .filter((x: unknown) => x !== null)
        .slice(0, 60);   // stored generously; the RENDERER applies MOCKUP_MAX_SERVICES

      await service.from("generated_sites").update({
        content: { ...content, services_confirmed: clean, services_confirmed_at: new Date().toISOString() },
      }).eq("id", siteId);
      return json({ ok: true, services: clean, render_cap: MOCKUP_MAX_SERVICES, areas_cap: MOCKUP_MAX_AREAS });
    }

    /* ── stock: the curated set for a niche ──────────────────────────────────────────────── */
    if (action === "stock") {
      const niche = typeof body.niche === "string" ? body.niche : "";
      return json({ ok: true, stock: stockFor(niche) });
    }

    return json({ ok: false, error: "unknown_action", detail: action.slice(0, 40) }, 400);
  } catch (e) {
    console.error("[mockup]", e);
    return json({ ok: false, error: "internal_error", detail: e instanceof Error ? e.message : "unknown" }, 500);
  }
});
