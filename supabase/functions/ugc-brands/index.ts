import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveUgcCaller } from "../_shared/ugc-access.ts";
import { allStopRefusal } from "../_shared/protection.ts";
import { getApifyRun, getApifyRunItems } from "../_shared/enrichment/apify.ts";
import { openAiUsd } from "../_shared/openai-usage.ts";
import {
  ENRICH_DEFAULT_TOP, ENRICH_MAX_TOP, THAILAND_AREAS, THAILAND_PLACE_TYPES, UGC_ACTORS, UGC_MAX_CONTACT_BRANDS, UGC_MAX_PITCHES_PER_DAY, UGC_PITCH_MODEL,
  clampCap, estimateRunUsd, isUgcCountry, isUgcNiche, ugcSpendRefusal, type UgcSource,
} from "../../../src/lib/ugc/config.ts";
import {
  candidatesFrom, contactsInput, creatorCollabsInput, creatorProfileUrl, fbAdsInput, fromContactItem, googleQueries,
  googleSearchInput, mergeWa, placesInput, waDigits, type BrandCandidate, type WaNumber,
} from "../../../src/lib/ugc/normalize.ts";
import { chooseTemplate, researchFields, researchMissing, runPitchPipeline, type PitchPlan, type PitchSystem, type ReviewOut, type WriteOut } from "../../../src/lib/ugc/pitch.ts";
import { TIER_RANK, tierFor, templateFamilyFor } from "../../../src/lib/ugc/tiers.ts";
import { bestContact } from "../../../src/lib/ugc/contactOrder.ts";
import { pitchedKeySet } from "../../../src/lib/ugc/pitchLog.ts";
import { inviteUgcMember } from "../_shared/ugc-member-invite.ts";
import { OPERATOR_APP_URL } from "../../../src/config/operatorApp.ts";

/* Where the invite email lands: the app's own set-password page (the same page the Team invite uses). */
const SET_PASSWORD_URL = `${(Deno.env.get("TEAM_APP_URL")?.trim() || OPERATOR_APP_URL).replace(/\/+$/, "")}/set-password`;

/* ugc-brands — the UGC Brand Finder's ONE server door (docs/ugc-brand-finder.md).
 *
 * ⛔ SEPARATE FROM FINDABLE. Reads and writes ugc_* only (plus the Apify usage snapshot, read-only). It never
 *    touches leads, campaigns, queues, audits, api_usage_log or any WhatsApp / SMS sender.
 * ⛔ WHO: a UGC member (ugc_members) or the admin — resolveUgcCaller. A salesperson or a role-less account is 403.
 * ⛔ MONEY: every Apify run shows its estimate first and is refused when (a) Paul's emergency stop is on,
 *    (b) the shared Apify account is at UGC_APIFY_STOP_PCT, (c) the member's own monthly budget would be passed,
 *    or (d) the usage cannot be read (fail closed). The estimate is ALSO sent to Apify as maxTotalChargeUsd with
 *    maxItems, so Apify itself stops the run at the ceiling.
 * ⛔ NOTHING IS SENT. Pitches are drafts; the send buttons are links Jess opens herself.
 *
 * Actions: state · estimate · start · contacts · named_contacts · poll · pitch · invite_member (admin). */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

// deno-lint-ignore no-explicit-any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Service = any;
type Row = Record<string, unknown>;

const SEARCH_SOURCES: ReadonlyArray<Exclude<UgcSource, "contacts">> = ["fb_ads", "creator_collabs", "places", "google_search"];
const TERMINAL_BAD = new Set(["FAILED", "ABORTED", "TIMED-OUT"]);

function monthStartIso(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

async function spendState(service: Service, owner: string) {
  const [settingsRes, runsRes, usageRes] = await Promise.all([
    service.from("ugc_settings").select("monthly_budget_usd, pitch_webhook_url, pitch_webhook_enabled").eq("owner_user_id", owner).maybeSingle(),
    service.from("ugc_runs").select("est_cost_usd, actual_cost_usd, status").eq("owner_user_id", owner).gte("created_at", monthStartIso()),
    service.from("apify_account_usage").select("monthly_usage_usd, max_monthly_usage_usd, usage_pct, captured_at").order("captured_at", { ascending: false }).limit(1).maybeSingle(),
  ]);
  if (settingsRes.error || runsRes.error) throw new Error(`ugc state read failed: ${settingsRes.error?.message ?? runsRes.error?.message}`);
  let settings = settingsRes.data as Row | null;
  if (!settings) {
    const ins = await service.from("ugc_settings").upsert({ owner_user_id: owner }, { onConflict: "owner_user_id" }).select("monthly_budget_usd, pitch_webhook_url, pitch_webhook_enabled").maybeSingle();
    settings = (ins.data as Row | null) ?? { monthly_budget_usd: 0, pitch_webhook_url: null, pitch_webhook_enabled: false };
  }
  /* A run's real cost once known, else its ceiling — so a running or uncosted run still counts. */
  const spent = ((runsRes.data ?? []) as Row[]).reduce((sum, r) => sum + Number(r.actual_cost_usd ?? r.est_cost_usd ?? 0), 0);
  const u = usageRes.error ? null : (usageRes.data as Row | null);
  const used = u?.monthly_usage_usd == null ? null : Number(u.monthly_usage_usd);
  const cap = u?.max_monthly_usage_usd == null ? null : Number(u.max_monthly_usage_usd);
  const apifyPct = used != null && cap ? used / cap : (u?.usage_pct == null ? null : Number(u.usage_pct));
  return {
    budgetUsd: Number(settings.monthly_budget_usd ?? 0),
    spentThisMonthUsd: Math.round(spent * 100) / 100,
    apifyPct,
    /* The webhook SLOT for an outside writer: only when the admin has switched it on with an https URL. */
    pitchWriter: settings.pitch_webhook_enabled === true && /^https:\/\/\S+$/i.test(String(settings.pitch_webhook_url ?? "")) ? "webhook" : "built_in",
    settings,
  };
}

/** Start an actor run with Apify's own hard stops: maxItems and maxTotalChargeUsd. */
async function startCappedRun(actor: string, input: Row, token: string, maxItems: number, maxUsd: number): Promise<{ runId: string }> {
  const qs = new URLSearchParams({ maxItems: String(maxItems), maxTotalChargeUsd: maxUsd.toFixed(2) });
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 20_000);
  try {
    const res = await fetch(`https://api.apify.com/v2/acts/${actor}/runs?${qs}`, {
      method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
      body: JSON.stringify(input), signal: controller.signal,
    });
    const body = await res.json().catch(() => null) as { data?: { id?: string } } | null;
    if (!res.ok || !body?.data?.id) throw new Error(`Apify start ${actor} HTTP ${res.status}`);
    return { runId: body.data.id };
  } finally { clearTimeout(t); }
}

/** Validate a search request into an actor input + its estimate. Null = bad input. */
function searchPlan(b: Row): { source: Exclude<UgcSource, "contacts">; input: Row; cap: number; estUsd: number; niche: string | null; country: string | null } | null {
  const source = String(b.source ?? "") as Exclude<UgcSource, "contacts">;
  if (!SEARCH_SOURCES.includes(source)) return null;
  const cap = clampCap(b.itemCap);
  const keyword = typeof b.keyword === "string" ? b.keyword.slice(0, 60) : undefined;
  if (source === "fb_ads" || source === "google_search") {
    if (!isUgcNiche(b.niche) || !isUgcCountry(b.country)) return null;
    const input = source === "fb_ads" ? fbAdsInput(b.niche, b.country, cap, keyword) : googleSearchInput(b.niche, b.country, cap, keyword);
    const estUsd = estimateRunUsd(source, cap, { queries: source === "google_search" ? googleQueries(b.niche, keyword).length : 1 });
    return { source, input, cap, estUsd, niche: b.niche, country: b.country };
  }
  if (source === "creator_collabs") {
    const creators = (Array.isArray(b.creators) ? b.creators : []).map(String).slice(0, 10);
    if (!creators.some((c) => creatorProfileUrl(c))) return null;
    const niche = isUgcNiche(b.niche) ? b.niche : null;
    return { source, input: creatorCollabsInput(creators, cap), cap, estUsd: estimateRunUsd(source, cap), niche, country: null };
  }
  const types = (Array.isArray(b.placeTypes) ? b.placeTypes : THAILAND_PLACE_TYPES).map(String).filter((t) => (THAILAND_PLACE_TYPES as readonly string[]).includes(t));
  const area = (THAILAND_AREAS as readonly string[]).includes(String(b.area)) ? String(b.area) : THAILAND_AREAS[0];
  if (!types.length) return null;
  return { source, input: placesInput(types, area, cap), cap, estUsd: estimateRunUsd(source, cap), niche: null, country: "TH" };
}

async function upsertCandidates(service: Service, owner: string, actor: string, cands: BrandCandidate[]): Promise<{ added: number; updated: number }> {
  if (!cands.length) return { added: 0, updated: 0 };
  const keys = cands.map((c) => c.brand_key);
  const { data: existing, error } = await service.from("ugc_brands").select("*").eq("owner_user_id", owner).in("brand_key", keys);
  if (error) throw new Error(`ugc brand read failed: ${error.message}`);
  const byKey = new Map(((existing ?? []) as Row[]).map((r) => [String(r.brand_key), r]));
  const u = <T,>(a: unknown, b: T[]) => [...new Set([...((a as T[] | null) ?? []), ...b])];
  let added = 0, updated = 0;
  for (const c of cands) {
    const was = byKey.get(c.brand_key);
    if (!was) {
      const { data: ins, error: e } = await service.from("ugc_brands").insert({
        owner_user_id: owner, brand_key: c.brand_key, name: c.name, website: c.website, domain: c.domain,
        facebook_url: c.facebook_url, facebook_page_id: c.facebook_page_id, instagram_url: c.instagram_url, linktree_url: c.linktree_url,
        phones: c.phones, wa_numbers: c.wa_numbers, niche: c.niche, country: c.country, sources: c.sources, live_ads_count: c.live_ads_count,
        ad_samples: c.ad_samples, ad_start_dates: c.ad_start_dates, track: c.sources.includes("places") ? "local" : "brand", creators_seen: c.creators_seen, page_created_at: c.page_created_at,
        admin_countries: c.admin_countries, shop_links: c.shop_links, has_address: c.has_address, research: { snippets: c.snippets },
      }).select("id").maybeSingle();
      if (e) { console.warn(`[ugc-brands] insert ${c.brand_key}: ${e.message}`); continue; }
      added++;
      if (ins?.id) await service.from("ugc_brand_events").insert({ brand_id: ins.id, owner_user_id: owner, kind: "found", detail: { sources: c.sources, live_ads: c.live_ads_count }, created_by: actor });
      continue;
    }
    /* Merge: fill what was empty, union the lists; a fresh ad count replaces the old one (ads come and go). */
    const research = (was.research as { snippets?: string[] } | null) ?? {};
    const patch: Row = {
      website: was.website ?? c.website, domain: was.domain ?? c.domain, facebook_url: was.facebook_url ?? c.facebook_url,
      facebook_page_id: was.facebook_page_id ?? c.facebook_page_id, instagram_url: was.instagram_url ?? c.instagram_url,
      phones: u(was.phones, c.phones), wa_numbers: mergeWa(was.wa_numbers as WaNumber[], c.wa_numbers), sources: u(was.sources, c.sources), creators_seen: u(was.creators_seen, c.creators_seen),
      admin_countries: u(was.admin_countries, c.admin_countries), shop_links: u(was.shop_links, c.shop_links).slice(0, 20),
      page_created_at: was.page_created_at ?? c.page_created_at, has_address: was.has_address ?? c.has_address,
      niche: was.niche ?? c.niche, country: was.country ?? c.country,
      research: { ...research, snippets: u(research.snippets, c.snippets).slice(0, 6) },
    };
    if (c.sources.includes("fb_ads")) { patch.live_ads_count = c.live_ads_count; patch.ad_samples = c.ad_samples; patch.ad_start_dates = c.ad_start_dates; }
    const { error: e } = await service.from("ugc_brands").update(patch).eq("id", was.id);
    if (!e) updated++;
  }
  return { added, updated };
}

async function applyContacts(service: Service, owner: string, actor: string, brandIds: string[], items: unknown[], enriched: boolean): Promise<number> {
  const finds = items.map(fromContactItem).filter((f): f is NonNullable<typeof f> => !!f);
  const { data: brands } = await service.from("ugc_brands").select("id, website, domain, linktree_url, emails, wa_numbers, phones, instagram_url, named_contacts").eq("owner_user_id", owner).in("id", brandIds);
  let touched = 0;
  for (const b of (brands ?? []) as Row[]) {
    const mine = finds.filter((f) => (b.domain && f.domain === b.domain) || f.startUrl === b.website || f.startUrl === b.linktree_url);
    const merge = (a: unknown, more: string[]) => [...new Set([...((a as string[] | null) ?? []), ...more])];
    const now = new Date().toISOString();
    const patch: Row = { contacts_checked_at: now };
    if (enriched) patch.enriched_at = now;
    if (mine.length) {
      const named = mine.flatMap((f) => f.named);
      /* A named person's own mobile is a WhatsApp number too, tagged as theirs. */
      const personWa: WaNumber[] = named.map((n) => ({ d: waDigits(n.phone), n })).filter((x) => x.d).map((x) => ({ number: x.d!, source: "named_person" as const, label: x.n.name }));
      patch.emails = merge(b.emails, mine.flatMap((f) => f.emails));
      patch.wa_numbers = mergeWa(mergeWa(b.wa_numbers as WaNumber[], mine.flatMap((f) => f.wa_numbers)), personWa);
      patch.phones = merge(b.phones, mine.flatMap((f) => f.phones));
      patch.instagram_url = b.instagram_url ?? mine.flatMap((f) => f.instagrams)[0] ?? null;
      patch.linktree_url = b.linktree_url ?? mine.map((f) => f.linktree).find(Boolean) ?? null;
      patch.has_about_page = mine.some((f) => f.hasAboutPage);
      if (enriched) patch.named_contacts = named;
    }
    await service.from("ugc_brands").update(patch).eq("id", b.id);
    await service.from("ugc_brand_events").insert({ brand_id: b.id, owner_user_id: owner, kind: "contacts", created_by: actor,
      detail: { found: mine.length > 0, named: enriched, emails: (patch.emails as string[] | undefined)?.length ?? 0, named_people: (patch.named_contacts as unknown[] | undefined)?.length ?? 0, whatsapps: (patch.wa_numbers as unknown[] | undefined)?.length ?? 0 } });
    touched++;
  }
  return touched;
}

/** One JSON model call (the writer and the independent reviewer each make their own). */
async function modelJson<T>(system: string, user: string, temperature: number): Promise<{ out: T | null; usd: number; error?: string }> {
  const key = Deno.env.get("OPENAI_API_KEY");
  if (!key) return { out: null, usd: 0, error: "openai_not_configured" };
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 30_000);
  try {
    const res = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST", headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
      body: JSON.stringify({ model: UGC_PITCH_MODEL, temperature, max_tokens: 1200, response_format: { type: "json_object" },
        messages: [{ role: "system", content: system }, { role: "user", content: user }] }),
      signal: controller.signal,
    });
    if (!res.ok) return { out: null, usd: 0, error: "openai_http_" + res.status };
    const data = await res.json();
    const usd = openAiUsd(UGC_PITCH_MODEL, data.usage?.prompt_tokens ?? 0, data.usage?.completion_tokens ?? 0);
    try { return { out: JSON.parse(String(data.choices?.[0]?.message?.content ?? "")) as T, usd }; }
    catch { return { out: null, usd, error: "bad_json" }; }
  } catch (e) {
    return { out: null, usd: 0, error: (e as Error)?.name === "AbortError" ? "openai_timeout" : "openai_request_failed" };
  } finally { clearTimeout(t); }
}

/** The webhook SLOT: an outside writer (Jess's own system), only when the admin switched it on. Its answer still
 *  goes through the independent review and every code check. */
async function webhookWrite(url: string, payload: unknown): Promise<WriteOut | null> {
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), 25_000);
  try {
    const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload), signal: controller.signal });
    if (!res.ok) return null;
    return await res.json().catch(() => null) as WriteOut | null;
  } catch { return null; } finally { clearTimeout(t); }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
    const gate = await resolveUgcCaller(req, service);
    if (!gate.ok) return json({ ok: false, error: gate.error, detail: gate.detail }, gate.status);
    const caller = gate.caller;
    const body = (await req.json().catch(() => ({}))) as Row;
    const action = String(body.action ?? "");

    /* ── admin: invite Jess (a UGC member, never a team role). The auth service EMAILS her its standard invite;
          the link never comes back here, so no credential passes through this function, a log or the screen. ── */
    if (action === "invite_member") {
      if (!caller.admin) return json({ ok: false, error: "admin_only" }, 403);
      const r = await inviteUgcMember({
        inviteByEmail: async ({ email, displayName }) => {
          const { data, error } = await service.auth.admin.inviteUserByEmail(email, { redirectTo: SET_PASSWORD_URL, data: { display_name: displayName } });
          return { id: data?.user?.id ?? null, error: error ? String(error.message ?? "invite failed") : null };
        },
        deleteAuthUser: async (id) => { await service.from("ugc_members").delete().eq("user_id", id); await service.auth.admin.deleteUser(id); },
        writeMember: async (id, displayName, senderEmail, by) => {
          const { error } = await service.from("ugc_members").insert({ user_id: id, display_name: displayName, sender_email: senderEmail, created_by: by });
          if (error) return String(error.message);
          const s = await service.from("ugc_settings").upsert({ owner_user_id: id }, { onConflict: "owner_user_id" });
          return s.error ? String(s.error.message) : null;
        },
      }, caller.id, body);
      if (!r.ok) return json({ ok: false, error: r.error, detail: r.detail }, r.status);
      console.log(JSON.stringify({ level: "info", fn: "ugc-brands", action, admin: caller.id, invited: r.user_id }));
      return json({ ok: true, user_id: r.user_id });
    }

    /* Whose workspace: a member works their own. The admin works a member's (the named one, else the first member
       invited — today there is one, Jess), so an admin test lands in her list and her budget; with no member yet,
       the admin's own (setup). */
    let owner = caller.id;
    if (!caller.member && caller.admin) {
      const q = service.from("ugc_members").select("user_id").order("created_at", { ascending: true }).limit(1);
      const { data: m } = typeof body.ownerUserId === "string"
        ? await service.from("ugc_members").select("user_id").eq("user_id", body.ownerUserId).maybeSingle()
        : await q.maybeSingle();
      if (m?.user_id) owner = m.user_id;
    }

    if (action === "state") {
      const st = await spendState(service, owner);
      return json({ ok: true, owner, member: caller.member, admin: caller.admin, budgetUsd: st.budgetUsd, spentThisMonthUsd: st.spentThisMonthUsd, apifyPct: st.apifyPct, pitchWriter: st.pitchWriter });
    }

    if (action === "estimate" || action === "start") {
      const plan = searchPlan(body);
      if (!plan) return json({ ok: false, error: "bad_input" }, 400);
      const st = await spendState(service, owner);
      const refusal = ugcSpendRefusal({ estUsd: plan.estUsd, spentThisMonthUsd: st.spentThisMonthUsd, budgetUsd: st.budgetUsd, apifyPct: st.apifyPct });
      if (action === "estimate") return json({ ok: true, estUsd: plan.estUsd, itemCap: plan.cap, refusal, budgetUsd: st.budgetUsd, spentThisMonthUsd: st.spentThisMonthUsd });
      const stop = await allStopRefusal(service, corsHeaders);
      if (stop) return json({ ok: false, error: "all_stop" }, 423);
      if (refusal) return json({ ok: false, error: refusal, estUsd: plan.estUsd }, 409);
      return await startRun(service, owner, plan.source, plan.input, plan.cap, plan.estUsd, { niche: plan.niche, country: plan.country });
    }

    if (action === "contacts") {
      const ids = (Array.isArray(body.brandIds) ? body.brandIds : []).map(String).slice(0, UGC_MAX_CONTACT_BRANDS);
      if (!ids.length) return json({ ok: false, error: "bad_input" }, 400);
      const { data: brands, error } = await service.from("ugc_brands").select("id, website, linktree_url").eq("owner_user_id", owner).in("id", ids);
      if (error) return json({ ok: false, error: "read_failed" }, 503);
      const urls = ((brands ?? []) as Row[]).flatMap((b) => [b.website, b.linktree_url].filter(Boolean) as string[]);
      if (!urls.length) return json({ ok: false, error: "no_websites" }, 400);
      const estUsd = estimateRunUsd("contacts", 1, { sites: urls.length });
      const st = await spendState(service, owner);
      const refusal = ugcSpendRefusal({ estUsd, spentThisMonthUsd: st.spentThisMonthUsd, budgetUsd: st.budgetUsd, apifyPct: st.apifyPct });
      if (body.estimateOnly === true) return json({ ok: true, estUsd, sites: urls.length, refusal });
      const stop = await allStopRefusal(service, corsHeaders);
      if (stop) return json({ ok: false, error: "all_stop" }, 423);
      if (refusal) return json({ ok: false, error: refusal, estUsd }, 409);
      const input = contactsInput(urls);
      return await startRun(service, owner, "contacts", input, Number(input.maxRequests), estUsd, { brand_ids: ((brands ?? []) as Row[]).map((b) => b.id) });
    }

    if (action === "poll") {
      const { data: run, error } = await service.from("ugc_runs").select("*").eq("id", String(body.runId ?? "")).eq("owner_user_id", owner).maybeSingle();
      if (error || !run) return json({ ok: false, error: "run_not_found" }, 404);
      if (run.status !== "running" || !run.apify_run_id) return json({ ok: true, run });
      const token = Deno.env.get("APIFY_TOKEN") ?? "";
      const info = await getApifyRun(String(run.apify_run_id), token);
      if (info.status === "SUCCEEDED") {
        /* ONE poller processes a finished run: the conditional claim (finished_at still null) is the guard, so two
           open tabs polling at once never import the same results twice. */
        const finishedAt = new Date().toISOString();
        const { data: claimed } = await service.from("ugc_runs").update({ finished_at: finishedAt }).eq("id", run.id).is("finished_at", null).select("id").maybeSingle();
        if (!claimed) return json({ ok: true, run: { ...run, apify_status: "PROCESSING" } });
        const ctx = ((run.input as Row)?._ctx as Row) ?? {};
        const patch: Row = { status: "succeeded", finished_at: finishedAt, actual_cost_usd: info.usageTotalUsd };
        try {
          const items = await getApifyRunItems(String(run.apify_run_id), token);
          patch.items_found = items.length;
          if (run.source === "contacts" || run.source === "named_contacts") {
            patch.brands_updated = await applyContacts(service, owner, caller.id, ((ctx.brand_ids as string[]) ?? []), items, run.source === "named_contacts");
          } else {
            const cands = candidatesFrom(run.source as Exclude<UgcSource, "contacts">, items, { niche: (ctx.niche as string) ?? null, country: (ctx.country as string) ?? null });
            const r = await upsertCandidates(service, owner, caller.id, cands);
            patch.brands_added = r.added; patch.brands_updated = r.updated;
          }
        } catch (e) {
          /* The claim is held: a failure here closes the run as failed (with its cost), never leaves it stuck. */
          patch.status = "failed"; patch.error = String((e as Error)?.message ?? e).slice(0, 300);
        }
        const { data: done } = await service.from("ugc_runs").update(patch).eq("id", run.id).select("*").maybeSingle();
        return json({ ok: true, run: done ?? { ...run, ...patch } });
      }
      if (TERMINAL_BAD.has(String(info.status))) {
        const patch = { status: info.status === "ABORTED" ? "aborted" : "failed", finished_at: new Date().toISOString(), actual_cost_usd: info.usageTotalUsd, error: `apify_${String(info.status).toLowerCase()}` };
        await service.from("ugc_runs").update(patch).eq("id", run.id);
        return json({ ok: true, run: { ...run, ...patch } });
      }
      return json({ ok: true, run: { ...run, apify_status: info.status } });
    }

    if (action === "named_contacts") {
      /* Named marketing people for the TOP-RANKED brands only (her tiers, not raw ad count): default 50 a run. */
      const top = Math.min(Math.max(1, Math.floor(Number(body.top ?? ENRICH_DEFAULT_TOP)) || ENRICH_DEFAULT_TOP), ENRICH_MAX_TOP);
      const [{ data: rows, error }, ps, log] = await Promise.all([
        service.from("ugc_brands").select("id, name, website, domain, brand_key, country, page_created_at, admin_countries, shop_links, has_about_page, has_address, ad_start_dates, tier_override, company_country, ships_to, ships_thailand, creator_programme_country, research, live_ads_count, creators_seen, track, enriched_at, status")
          .eq("owner_user_id", owner).eq("track", "brand").not("website", "is", null).is("enriched_at", null)
          .in("status", ["new", "researching", "pitch_ready", "needs_jess"]).order("live_ads_count", { ascending: false }).limit(1000),
        service.from("ugc_pitch_system").select("blocked_list").eq("owner_user_id", owner).maybeSingle(),
        service.from("ugc_pitch_log").select("brand_key, brand_name, repitch_ok_from").eq("owner_user_id", owner).limit(5000),
      ]);
      if (error || ps.error || log.error) return json({ ok: false, error: "read_failed" }, 503);
      const ctx = { blocked: (ps.data?.blocked_list as string[] | null) ?? [], pitchedKeys: pitchedKeySet((log.data ?? []) as never) };
      const ranked = ((rows ?? []) as Row[])
        .map((b) => ({ b, t: tierFor({ ...(b as never), text: (((b.research as Row)?.snippets as string[] | undefined) ?? []).join(" ") }, ctx).tier }))
        .filter((x) => x.t !== "skip")
        .sort((x, y) => (TIER_RANK[x.t] - TIER_RANK[y.t]) || (Number(y.b.live_ads_count ?? 0) - Number(x.b.live_ads_count ?? 0)))
        .slice(0, top).map((x) => x.b);
      const urls = ranked.map((b) => String(b.website));
      if (!urls.length) return json({ ok: false, error: "no_websites" }, 400);
      const estUsd = estimateRunUsd("named_contacts", 1, { sites: urls.length });
      const st = await spendState(service, owner);
      const refusal = ugcSpendRefusal({ estUsd, spentThisMonthUsd: st.spentThisMonthUsd, budgetUsd: st.budgetUsd, apifyPct: st.apifyPct });
      if (body.estimateOnly === true) {
        return json({ ok: true, estUsd, brands: urls.length, extraUsd: Math.round((estUsd - estimateRunUsd("contacts", 1, { sites: urls.length })) * 100) / 100, refusal });
      }
      const stop = await allStopRefusal(service, corsHeaders);
      if (stop) return json({ ok: false, error: "all_stop" }, 423);
      if (refusal) return json({ ok: false, error: refusal, estUsd }, 409);
      const input = contactsInput(urls, true);
      return await startRun(service, owner, "named_contacts", input, Number(input.maxRequests), estUsd, { brand_ids: ranked.map((b) => b.id) });
    }

    if (action === "pitch") {
      /* Her pitch system is PRIVATE to her: it is read here with the service role and NEVER returned — only the draft
         (which lives on the brand, as every draft does) comes back. The member pitches her own brands; the admin may
         run a pitch on a member's workspace (Paul, 2026-10-29: the stage-2 live test) but still never sees her system,
         rates or pitch log. A pitch on the admin's own setup workspace has no system to read and is refused. */
      if (!(caller.member && owner === caller.id) && !(caller.admin && owner !== caller.id)) return json({ ok: false, error: "pitch_system_private" }, 403);
      const { data: brand, error } = await service.from("ugc_brands").select("*").eq("id", String(body.brandId ?? "")).eq("owner_user_id", owner).maybeSingle();
      if (error || !brand) return json({ ok: false, error: "brand_not_found" }, 404);
      const dayAgo = new Date(Date.now() - 86_400_000).toISOString();
      const { count } = await service.from("ugc_brand_events").select("id", { count: "exact", head: true }).eq("owner_user_id", owner).eq("kind", "pitch").gte("created_at", dayAgo);
      if ((count ?? 0) >= UGC_MAX_PITCHES_PER_DAY) return json({ ok: false, error: "pitch_daily_limit" }, 429);
      const stop = await allStopRefusal(service, corsHeaders);
      if (stop) return json({ ok: false, error: "all_stop" }, 423);
      const [{ data: ps }, { data: log }, st] = await Promise.all([
        /* ⛔ rates are never selected here: they cannot reach the writer. */
        service.from("ugc_pitch_system").select("content, about_jess, templates, blocked_list, signoff_html").eq("owner_user_id", owner).maybeSingle(),
        service.from("ugc_pitch_log").select("brand_key, brand_name, repitch_ok_from").eq("owner_user_id", owner).limit(5000),
        spendState(service, owner),
      ]);
      const sys: PitchSystem = { content: String(ps?.content ?? ""), about_jess: String(ps?.about_jess ?? ""), templates: (ps?.templates as PitchSystem["templates"]) ?? {}, signoff_html: String(ps?.signoff_html ?? "") };
      const tier = tierFor({ ...(brand as never), text: (((brand.research as Row)?.snippets as string[] | undefined) ?? []).join(" ") },
        { blocked: (ps?.blocked_list as string[] | null) ?? [], pitchedKeys: pitchedKeySet((log ?? []) as never) });
      if (tier.tier === "skip") return json({ ok: false, error: "brand_is_a_hard_no", detail: tier.why }, 409);
      const route = bestContact(brand as never);
      const variant: PitchPlan["variant"] = route.variant ?? "standard";
      const track = brand.track === "local" ? "local" : "brand";
      const template = chooseTemplate({ track, tierFamily: templateFamilyFor(tier.tier), variant });
      const now = new Date().toISOString();
      if (!template) {
        const why = "Tier not set: Jess to set A, B, C or D.";
        await service.from("ugc_brands").update({ status: ["new", "researching", "pitch_ready"].includes(String(brand.status)) ? "needs_jess" : brand.status, pitch_working: { tier, why }, pitch_attempts: 0 }).eq("id", brand.id);
        return json({ ok: true, outcome: "needs_jess", why });
      }
      const plan: PitchPlan = { track, template, variant, personName: route.person?.name ?? null };
      const research = researchFields(brand as never);
      let spent = 0;
      const result = await runPitchPipeline({
        write: async (p) => {
          if (st.pitchWriter === "webhook") return await webhookWrite(String(st.settings.pitch_webhook_url), { plan, research, prompt: p });
          const r = await modelJson<WriteOut>(p.system, p.user, 0.7); spent += r.usd; return r.out;
        },
        review: async (p) => { const r = await modelJson<ReviewOut>(p.system, p.user, 0); spent += r.usd; return r.out; },
      }, sys, plan, research, researchMissing(research, route, track));
      const working = { tier, route: { kind: route.kind, label: route.label }, template, attempts: result.attempts };
      if (result.outcome === "drafted") {
        const statusPatch = ["new", "researching", "needs_jess"].includes(String(brand.status)) ? { status: "pitch_ready" } : {};
        await service.from("ugc_brands").update({ pitch_subject: result.subject, pitch_body: result.body, pitch_writer: template, pitch_written_at: now, pitch_working: working, pitch_attempts: result.attempts.length, ...statusPatch }).eq("id", brand.id);
      } else {
        /* Needs Jess: NOTHING is drafted — an older draft is cleared so it can never be sent by mistake. */
        await service.from("ugc_brands").update({ pitch_subject: null, pitch_body: null, pitch_writer: null, pitch_working: { ...working, why: result.why }, pitch_attempts: result.attempts.length,
          status: ["new", "researching", "pitch_ready"].includes(String(brand.status)) ? "needs_jess" : brand.status }).eq("id", brand.id);
      }
      await service.from("ugc_brand_events").insert({ brand_id: brand.id, owner_user_id: owner, kind: "pitch", created_by: caller.id, detail: { outcome: result.outcome, template, attempts: result.attempts.length, usd: Math.round(spent * 10000) / 10000 } });
      return json({ ok: true, outcome: result.outcome, template, attempts: result.attempts.length, ...(result.outcome === "drafted" ? { subject: result.subject, body: result.body } : { why: result.why }) });
    }

    return json({ ok: false, error: "unknown_action" }, 400);
  } catch (e) {
    console.error("[ugc-brands]", e instanceof Error ? e.message : e);
    return json({ ok: false, error: "server_error" }, 500);
  }
});

async function startRun(service: Service, owner: string, source: UgcSource, input: Row, cap: number, estUsd: number, ctx: Row): Promise<Response> {
  const token = Deno.env.get("APIFY_TOKEN") ?? "";
  if (!token) return json({ ok: false, error: "apify_failed" }, 503);
  const { data: run, error } = await service.from("ugc_runs").insert({
    owner_user_id: owner, source, input: { ...input, _ctx: ctx }, item_cap: Math.min(cap, 500), est_cost_usd: estUsd, status: "running",
  }).select("*").single();
  if (error || !run) return json({ ok: false, error: "run_write_failed" }, 503);
  try {
    const { runId } = await startCappedRun(UGC_ACTORS[source], input, token, cap, estUsd);
    await service.from("ugc_runs").update({ apify_run_id: runId }).eq("id", run.id);
    return json({ ok: true, run: { ...run, apify_run_id: runId } });
  } catch (e) {
    await service.from("ugc_runs").update({ status: "failed", finished_at: new Date().toISOString(), actual_cost_usd: 0, error: String((e as Error)?.message ?? e).slice(0, 300) }).eq("id", run.id);
    return json({ ok: false, error: "apify_failed" }, 502);
  }
}
