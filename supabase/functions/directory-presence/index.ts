import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { requireAdmin, isInternalCall, refusalBody } from "../_shared/access.ts";
import { allStopRefusal } from "../_shared/protection.ts";
import { startApifyRun, getApifyRun, getApifyRunItems, abortApifyRun } from "../_shared/enrichment/apify.ts";
import { AI_SEARCH_ACTOR, toCountryCode } from "../_shared/enrichment/ai-search.ts";
import { USAGE_CRITICAL_PCT } from "../_shared/enrichment/apify-usage.ts";
import { isPublicHttpUrl, readCapped } from "../_shared/site-research.ts";
import {
  assemblePresence, buildIdentity, claimedCredentials, extractSiteSignals, foldClientCitations, mergePresence,
  operatorSetStatus, presenceQueries, presenceSummary,
  type CitationRow, type ListingCandidate, type PresenceReviewItem, type PresenceStatus, type StoredPresenceRow,
  type TradeEvidenceRow, tradeKeys,
} from "../../../src/lib/directoryPresence.ts";
import { sourceByKey, sourceForUrl } from "../../../src/lib/presenceSources.ts";
import { norm } from "../../../src/lib/buildPlaybook.ts";

/* ════════════════════════════════════════════════════════════════════════════════════════════
   directory-presence — WHERE IS THIS BUSINESS LISTED, DO THE LISTINGS AGREE, WHAT IS WORTH ADDING.

   Discovery and audit ONLY. It reads; it never creates, claims or edits a listing anywhere.
   The decisions are in src/lib/directoryPresence.ts (pure); this function gathers and stores.

   ACTIONS (POST { action, lead_id, … }):
     summary     — the stored rows grouped ALREADY ON / NEEDS ATTENTION / WORTH ADDING. Free.
     run         — gather and decide. `search: true` adds up to three organic web searches (Apify —
                   the only spend; refused under the emergency stop or at USAGE_CRITICAL_PCT of the
                   Apify cap). Without it the check reads only what we already hold plus the
                   business's own homepage (free).
     set_status  — the operator: added / verified / not_relevant / reset, on one source.

   Admin only (requireAdmin), or an internal caller (CRON_SECRET) for future scheduled rechecks.
   Evidence gathered without spend: the lead row, Google's record (phone_cache), the stored crawl,
   the homepage + contact page fetched now, every citation in this lead's own audits, and the
   trade-level citation fold for this trade (presence_trade_citation_hosts).
   docs/directory-presence.md is the record.
   ════════════════════════════════════════════════════════════════════════════════════════════ */

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-cron-secret, x-internal-job",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, status = 200) =>
  new Response(JSON.stringify(b), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

/** Marker only this code produces — the deploy check greps the bundle for it. */
const BUILD_ID = "directory-presence-2026-09-30b";
const RUN_POLL_MS = 3_000;
/** 100 s, up from the 60 s check-directory-listings used: three of eight live searches timed out at 60 s
 *  (2026-09-30). Everything else runs concurrently, so the whole run stays inside the ~150 s edge limit. */
const RUN_TIMEOUT_MS = 100_000;
const PAGE_TIMEOUT_MS = 8_000;
/** A run younger than this is treated as in flight: a second press returns it, never a second run. */
const IN_FLIGHT_MS = 4 * 60_000;
/** Estimate per organic query when Apify gives no billed figure (organic-only input, same actor). */
const COST_PER_QUERY_USD = 0.05;
const MAX_CITATION_ROWS = 3_000;

const reasonOf = (e: unknown) => (e instanceof Error ? e.message : String((e as { message?: unknown })?.message ?? e));

async function fetchPage(url: string): Promise<{ html: string; finalUrl: string; status: number } | null> {
  if (!isPublicHttpUrl(url)) return null;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), PAGE_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      headers: { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36", Accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8" },
      redirect: "follow", signal: controller.signal,
    });
    const type = res.headers.get("content-type") ?? "";
    const html = /html|xml|text/i.test(type) || !type ? await readCapped(res) : "";
    return { html, finalUrl: res.url && /^https?:\/\//i.test(res.url) ? res.url : url, status: res.status };
  } catch {
    return null;
  } finally {
    clearTimeout(t);
  }
}

/** The organic-only input check-directory-listings uses: no ChatGPT / Gemini add-ons, one page. */
function organicInput(query: string, countryCode: string): Record<string, unknown> {
  return { queries: query, countryCode: (countryCode || "gb").toLowerCase(), maxPagesPerQuery: 1, languageCode: "en" };
}

async function awaitRun(runId: string, token: string): Promise<{ items: unknown[]; billedUsd: number | null }> {
  const deadline = Date.now() + RUN_TIMEOUT_MS;
  for (;;) {
    if (Date.now() > deadline) {
      /* Abort it: a run we have stopped waiting for would otherwise run on and bill for nothing. */
      await abortApifyRun(runId, token).catch(() => {});
      throw new Error(`Apify run ${runId} timed out after ${RUN_TIMEOUT_MS / 1000}s (aborted)`);
    }
    await new Promise((r) => setTimeout(r, RUN_POLL_MS));
    const run = await getApifyRun(runId, token);
    if (run.status === "SUCCEEDED") return { items: await getApifyRunItems(runId, token), billedUsd: run.usageTotalUsd };
    if (run.status === "FAILED" || run.status === "ABORTED" || run.status === "TIMED-OUT") throw new Error(`Apify run ${runId} ${run.status}`);
  }
}

const LEAD_COLS = "id, user_id, business_name, phone, website, address, derived_town, search_location, search_keyword, category, place_id, google_maps_url, facebook_url, facebook_method, instagram_url, instagram_method, country";
const ROW_COLS = "id, lead_id, source_key, source_label, source_kind, status, status_source, previous_status, match_confidence, listing_url, match_signals, found_details, inconsistencies, fields_compared, priority, reason, evidence, discovered_via, first_seen_at, last_checked_at, last_seen_at, status_changed_at, verified_at, check_count, last_run_id, operator_note";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: { ...corsHeaders, "x-build": BUILD_ID } });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);

  const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
  const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } });

  let runId = "";
  try {
    let actorId: string | null = null;
    if (!isInternalCall(req)) {
      const who = await requireAdmin(req, service);
      if (!who.ok) return json(refusalBody(who), who.status);
      actorId = who.actor.id;
    }
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = String(body.action ?? "summary");
    const leadId = typeof body.lead_id === "string" ? body.lead_id.trim() : "";
    if (!/^[0-9a-f-]{36}$/i.test(leadId)) return json({ ok: false, error: "lead_id_required" }, 400);

    const { data: lead, error: leadErr } = await service.from("outreach_leads").select(LEAD_COLS).eq("id", leadId).maybeSingle();
    if (leadErr) return json({ ok: false, error: "lead_lookup_failed", detail: leadErr.message }, 500);
    if (!lead) return json({ ok: false, error: "lead_not_found" }, 404);

    const loadRows = async (): Promise<StoredPresenceRow[]> => {
      const { data, error } = await service.from("lead_directory_presence").select(ROW_COLS).eq("lead_id", leadId).order("id").limit(1000);
      if (error) throw new Error(`lead_directory_presence: ${error.message}`);
      return (data ?? []) as StoredPresenceRow[];
    };
    const lastRun = async () => {
      const { data } = await service.from("lead_directory_presence_runs")
        .select("id, status, searched, finished_at, review").eq("lead_id", leadId).neq("status", "running")
        .order("started_at", { ascending: false }).limit(1).maybeSingle();
      return data as { finished_at: string | null; searched: boolean; review: PresenceReviewItem[] } | null;
    };

    if (action === "summary") {
      return json({ ok: true, build: BUILD_ID, summary: presenceSummary(leadId, await loadRows(), await lastRun()) });
    }

    if (action === "set_status") {
      const key = String(body.source_key ?? "").trim().toLowerCase();
      const to = String(body.status ?? "");
      if (!key) return json({ ok: false, error: "source_key_required" }, 400);
      if (to !== "reset" && !["added", "verified", "not_relevant"].includes(to)) return json({ ok: false, error: "status_not_allowed", allowed: ["added", "verified", "not_relevant", "reset"] }, 400);
      const now = new Date().toISOString();
      const rows = await loadRows();
      let row = rows.find((r) => r.source_key === key) ?? null;
      if (!row) {
        /* Marking a source we hold no row for (e.g. "we just created their Yell listing"). Only a
           known source or a parseable host — never free text. */
        const src = sourceByKey(key) ?? sourceForUrl(key)?.source;
        if (!src) return json({ ok: false, error: "unknown_source" }, 400);
        row = {
          lead_id: leadId, source_key: src.key, source_label: src.label, source_kind: src.kind, status: "worth_adding",
          status_source: "check", previous_status: null, match_confidence: null, listing_url: null, match_signals: [],
          found_details: {}, inconsistencies: [], fields_compared: [], priority: null, reason: "Recorded by the operator.",
          evidence: {}, discovered_via: [], first_seen_at: now, last_checked_at: now, last_seen_at: null,
          status_changed_at: now, verified_at: null, check_count: 0, last_run_id: null,
        };
      }
      const next = operatorSetStatus(row, to as PresenceStatus | "reset", now);
      if (!next) return json({ ok: false, error: "status_not_allowed" }, 400);
      const url = typeof body.listing_url === "string" && /^https?:\/\//i.test(body.listing_url) ? body.listing_url : null;
      const note = typeof body.note === "string" ? body.note.slice(0, 1000) : undefined;
      const { id: _id, ...rest } = next;
      const { error } = await service.from("lead_directory_presence").upsert({
        ...rest, user_id: lead.user_id, listing_url: url ?? next.listing_url,
        ...(note !== undefined ? { operator_note: note } : {}),
        operator_updated_by: actorId, operator_updated_at: now, updated_at: now,
      }, { onConflict: "lead_id,source_key" });
      if (error) return json({ ok: false, error: "write_failed", detail: error.message }, 500);
      return json({ ok: true, summary: presenceSummary(leadId, await loadRows(), await lastRun()) });
    }

    if (action !== "run") return json({ ok: false, error: "unknown_action" }, 400);
    if (!String(lead.business_name ?? "").trim()) return json({ ok: false, error: "lead_has_no_name" }, 400);
    const search = body.search === true;

    /* ── one run at a time per lead ── */
    const { data: inflight } = await service.from("lead_directory_presence_runs").select("id, started_at")
      .eq("lead_id", leadId).eq("status", "running").gte("started_at", new Date(Date.now() - IN_FLIGHT_MS).toISOString())
      .order("started_at", { ascending: false }).limit(1).maybeSingle();
    if (inflight) return json({ ok: true, already_running: true, run_id: inflight.id });

    /* ── spend gates, before anything is written, only when a search was asked for ── */
    let apifyToken = "";
    if (search) {
      const stopped = await allStopRefusal(service, corsHeaders);
      if (stopped) return stopped;
      apifyToken = Deno.env.get("APIFY_TOKEN") ?? Deno.env.get("APIFY_API_TOKEN") ?? "";
      if (!apifyToken) return json({ ok: false, error: "apify_not_configured" }, 500);
      const { data: usage, error: usageErr } = await service.from("apify_account_usage")
        .select("monthly_usage_usd, max_monthly_usage_usd").order("captured_at", { ascending: false }).limit(1).maybeSingle();
      const used = Number(usage?.monthly_usage_usd ?? NaN);
      const cap = Number(usage?.max_monthly_usage_usd ?? NaN);
      const blind = !!usageErr || !usage || !Number.isFinite(used) || !Number.isFinite(cap) || cap <= 0;
      const pct = blind ? 1 : used / cap;
      if (blind || pct >= USAGE_CRITICAL_PCT) {
        const line = blind ? "Refused: the Apify spend snapshot is unreadable, so the headroom is unknown. Nothing was spent."
          : `Refused: Apify is at ${(pct * 100).toFixed(1)}% of its monthly cap ($${used.toFixed(2)} of $${cap.toFixed(2)}). Audits share this account.`;
        await service.from("lead_directory_presence_runs").insert({ lead_id: leadId, user_id: lead.user_id, requested_by: actorId, status: "refused_cap", searched: false, error: line, finished_at: new Date().toISOString() });
        return json({ ok: false, status: "refused_cap", error: line }, 200);
      }
    }

    const { data: runRow, error: runErr } = await service.from("lead_directory_presence_runs")
      .insert({ lead_id: leadId, user_id: lead.user_id, requested_by: actorId, status: "running", searched: search })
      .select("id").single();
    if (runErr || !runRow) throw new Error(`could not open the run row: ${runErr?.message ?? "no row"}`);
    runId = String(runRow.id);
    const notes: string[] = [];
    const sourcesUsed: string[] = ["lead_record"];

    /* ── gather everything that costs nothing, concurrently ── */
    const website = String(lead.website ?? "").trim();
    const ownSite = website && sourceForUrl(website)?.source.kind === "other" ? (/^https?:\/\//i.test(website) ? website : `https://${website}`) : "";

    const placesP = lead.place_id
      ? service.from("phone_cache").select("phone, website, address, category, google_maps_uri").eq("place_id", lead.place_id).maybeSingle()
      : Promise.resolve({ data: null });
    const crawlP = service.from("lead_crawl_checks").select("result, full_evidence").eq("lead_id", leadId).maybeSingle();
    const homeP = ownSite ? fetchPage(ownSite) : Promise.resolve(null);
    const auditsP = service.from("ai_audits").select("id, business_type, created_at").eq("lead_id", leadId).order("created_at", { ascending: false }).limit(200);
    const [placesRes, crawlRes, home, auditsRes] = await Promise.all([placesP, crawlP, homeP, auditsP]);

    /* ── THE TRADE FOLD, SCOPED TO THIS TRADE ─────────────────────────────────────────────────────
       NOT playbook-evidence: it folds the whole ai_audit_queue through PostgREST and dies on the 8 s
       statement timeout ("canceling statement due to statement timeout", measured 2026-09-30). The
       trade's audits are picked here with the SAME norm() rule the fold keys on (tradeKeys), and the
       database aggregates only those (presence_trade_citation_hosts, service role only). */
    const tradeRaw = String(auditsRes.data?.find((a: { business_type: string | null }) => a.business_type)?.business_type ?? lead.search_keyword ?? lead.category ?? "");
    const keys = tradeKeys(tradeRaw);
    const evidenceP = (async (): Promise<{ evidence: TradeEvidenceRow[]; tradeAuditTotals: Record<string, number> } | null> => {
      if (!keys.length) return null;
      const ids: string[] = [];
      for (let from = 0; ; from += 1000) {
        const { data, error } = await service.from("ai_audits").select("id, business_type").order("id").range(from, from + 999);
        if (error) throw new Error(`ai_audits: ${error.message}`);
        for (const a of (data ?? []) as Array<{ id: string; business_type: string | null }>) if (keys.includes(norm(a.business_type))) ids.push(a.id);
        if ((data ?? []).length < 1000) break;
      }
      if (!ids.length) return { evidence: [], tradeAuditTotals: { [keys[0]]: 0 } };
      const { data, error } = await service.rpc("presence_trade_citation_hosts", { _audit_ids: ids });
      if (error) throw new Error(`presence_trade_citation_hosts: ${error.message}`);
      const rows = (data ?? []) as Array<{ host: string; citations: number; audits: number }>;
      return { evidence: rows.map((r) => ({ trade: keys[0], host: r.host, citations: r.citations, audits: r.audits })), tradeAuditTotals: { [keys[0]]: ids.length } };
    })().catch((e) => { notes.push(`trade evidence unavailable: ${reasonOf(e)}`); return null; });
    const places = (placesRes as { data: { phone?: string; website?: string; address?: string; category?: string; google_maps_uri?: string } | null }).data;
    if (places) sourcesUsed.push("places_cache");

    /* The homepage, then a contact/about page it links to (same site only). */
    const pages: Array<{ url: string; html: string }> = [];
    if (home && home.html) { pages.push({ url: home.finalUrl, html: home.html }); sourcesUsed.push("homepage"); }
    else if (ownSite) notes.push(`homepage not readable (${home ? `HTTP ${home.status}` : "no response"})`);
    if (home?.html) {
      const first = extractSiteSignals(home.html, home.finalUrl);
      const homeHost = (() => { try { return new URL(home.finalUrl).hostname; } catch { return ""; } })();
      const extra = first.links.filter((u) => { try { const x = new URL(u); return x.hostname === homeHost && /contact|about|find-us|reviews/i.test(x.pathname); } catch { return false; } }).slice(0, 2);
      for (const p of await Promise.all(extra.map(fetchPage))) if (p?.html) pages.push({ url: p.finalUrl, html: p.html });
    }
    const signals = pages.map((p) => extractSiteSignals(p.html, p.url));
    const siteText = signals.map((s) => s.text).join(" \n ");

    /* ── the searches (the only spend), started now, awaited below ── */
    const identity0 = buildIdentity({
      lead, auditTrade: auditsRes.data?.find((a: { business_type: string | null }) => a.business_type)?.business_type ?? null,
      places: places ?? null,
      site: { servedUrl: home?.html ? home.finalUrl : null, phones: signals.flatMap((s) => s.phones), postcodes: signals.flatMap((s) => s.postcodes) },
    });
    const queries = search ? presenceQueries(identity0) : [];
    const attempts: Array<{ query: string; run_id: string | null; state: string; billed_usd: number | null; error: string | null }> = [];
    const searchP = (async () => {
      if (!queries.length) return [] as unknown[];
      const country = toCountryCode(lead.country as string | null);
      const started = await Promise.allSettled(queries.map((q) => startApifyRun(AI_SEARCH_ACTOR, organicInput(q, country), apifyToken)));
      started.forEach((s, i) => attempts.push(s.status === "fulfilled"
        ? { query: queries[i], run_id: s.value.runId, state: "started", billed_usd: null, error: null }
        : { query: queries[i], run_id: null, state: "start_failed", billed_usd: null, error: reasonOf(s.reason) }));
      await service.from("lead_directory_presence_runs").update({ queries_run: queries, apify_runs: attempts }).eq("id", runId);
      const polled = await Promise.allSettled(attempts.map((a) => a.run_id ? awaitRun(a.run_id, apifyToken) : Promise.reject(new Error(a.error ?? "not started"))));
      const items: unknown[] = [];
      polled.forEach((p, i) => {
        if (p.status === "fulfilled") { attempts[i].state = "succeeded"; attempts[i].billed_usd = p.value.billedUsd; items.push(...p.value.items); }
        else { attempts[i].state = attempts[i].state === "started" ? "failed" : attempts[i].state; attempts[i].error = reasonOf(p.reason); }
      });
      return items;
    })();

    /* ── this lead's own audit citations ── */
    const auditIds = (auditsRes.data ?? []).map((a: { id: string }) => a.id);
    const citationRows: CitationRow[] = [];
    for (let from = 0; auditIds.length && from < MAX_CITATION_ROWS; from += 500) {
      const { data, error } = await service.from("ai_audit_queue").select("id, question, result").in("audit_id", auditIds)
        .eq("status", "done").order("id").range(from, from + 499);
      if (error) { notes.push(`citations unreadable: ${error.message}`); break; }
      citationRows.push(...((data ?? []) as CitationRow[]));
      if ((data ?? []).length < 500) break;
    }
    if (citationRows.length) sourcesUsed.push("audit_citations");

    const evidence = await evidenceP as { evidence?: TradeEvidenceRow[]; tradeAuditTotals?: Record<string, number> } | null;
    if (evidence?.evidence) sourcesUsed.push("trade_evidence");
    const searchItems = await searchP;
    if (queries.length) sourcesUsed.push("web_search");

    /* ── candidates ── */
    const candidates: ListingCandidate[] = [];
    const seenUrl = new Set<string>();
    const push = (c: ListingCandidate) => { const k = `${c.via}|${c.url.toLowerCase()}`; if (!seenUrl.has(k)) { seenUrl.add(k); candidates.push(c); } };
    for (const s of signals) {
      for (const url of s.links) {
        const src = sourceForUrl(url);
        if (!src || src.source.kind === "other") continue; // an unknown outbound link is not a listing
        push({ url, via: "website", linkedFromSite: true });
      }
    }
    /* The stored crawl saw more pages than the homepage read now. */
    const crawl = (crawlRes as { data: { result?: { siteInfo?: { socialLinks?: Array<{ url?: string }> } }; full_evidence?: { business?: { profiles?: Array<{ value?: string } | string>; credentials?: Array<{ value?: string } | string> } } } | null }).data;
    if (crawl) sourcesUsed.push("stored_crawl");
    for (const l of crawl?.result?.siteInfo?.socialLinks ?? []) if (l?.url) push({ url: String(l.url), via: "website", linkedFromSite: true });
    for (const p of crawl?.full_evidence?.business?.profiles ?? []) {
      const v = typeof p === "string" ? p : String(p?.value ?? "");
      const url = v.match(/https?:\/\/\S+/)?.[0];
      if (url) push({ url, via: "website", linkedFromSite: true });
    }
    if (lead.facebook_url) push({ url: String(lead.facebook_url), via: "lead_record", operatorRecorded: lead.facebook_method === "manual" });
    if (lead.instagram_url) push({ url: String(lead.instagram_url), via: "lead_record", operatorRecorded: lead.instagram_method === "manual" });
    if (lead.place_id) {
      const mapsUrl = String(lead.google_maps_url || places?.google_maps_uri || `https://www.google.com/maps/place/?q=place_id:${lead.place_id}`);
      push({ url: mapsUrl, via: "places", placeIdMatch: true, details: places ? { phone: places.phone, website: places.website, address: places.address, category: places.category } : null });
    }
    for (const raw of searchItems) {
      const list = ((raw ?? {}) as Record<string, unknown>).organicResults;
      if (!Array.isArray(list)) continue;
      for (const r of list) {
        const rec = (r ?? {}) as Record<string, unknown>;
        if (typeof rec.url !== "string") continue;
        push({ url: rec.url, title: typeof rec.title === "string" ? rec.title : null, text: typeof rec.description === "string" ? rec.description : null, via: "search" });
      }
    }

    /* ── decide ── */
    const identity = identity0;
    const { findings, review } = assemblePresence({
      identity,
      candidates,
      citations: foldClientCitations(citationRows, identity),
      tradeEvidence: evidence?.evidence ?? [],
      tradeAuditTotals: evidence?.tradeAuditTotals ?? {},
      /* The full crawl read more pages than the homepage; its credential lines are the site's own words. */
      claimed: claimedCredentials([siteText, ...(crawl?.full_evidence?.business?.credentials ?? []).map((c) => (typeof c === "string" ? c : String(c?.value ?? "")))].join(" | ")),
      searched: search && attempts.some((a) => a.state === "succeeded"),
    });

    const now = new Date().toISOString();
    const stored = await loadRows();
    const merged = mergePresence(leadId, stored, findings, now, runId);
    if (merged.length) {
      const payload = merged.map(({ id: _id, ...r }) => ({ ...r, user_id: lead.user_id, operator_note: r.operator_note ?? null, updated_at: now }));
      const { error } = await service.from("lead_directory_presence").upsert(payload, { onConflict: "lead_id,source_key" });
      if (error) throw new Error(`could not store the rows: ${error.message}`);
    }

    const billed = attempts.filter((a) => typeof a.billed_usd === "number");
    const okRuns = attempts.filter((a) => a.state === "succeeded").length;
    const cost = !attempts.length ? 0 : billed.length ? billed.reduce((n, a) => n + (a.billed_usd ?? 0), 0) : okRuns * COST_PER_QUERY_USD;
    const partial = search && okRuns < attempts.length;
    if (partial) notes.push(`${okRuns} of ${attempts.length} searches completed: ${attempts.filter((a) => a.state !== "succeeded").map((a) => `"${a.query}" (${a.error ?? a.state})`).join("; ")}`);
    const summary = presenceSummary(leadId, await loadRows(), { finished_at: now, searched: search && okRuns > 0, review });
    await service.from("lead_directory_presence_runs").update({
      status: partial ? "partial" : "ok", finished_at: now, cost_usd: cost, sources_used: sourcesUsed,
      queries_run: queries, apify_runs: attempts, counts: summary.counts, review, notes,
    }).eq("id", runId);
    return json({ ok: true, build: BUILD_ID, run_id: runId, partial, notes, summary });
  } catch (e) {
    const msg = reasonOf(e);
    console.error("[directory-presence]", msg);
    if (runId) await service.from("lead_directory_presence_runs").update({ status: "error", error: msg, finished_at: new Date().toISOString() }).eq("id", runId);
    return json({ ok: false, error: "presence_failed", detail: msg }, 500);
  }
});
