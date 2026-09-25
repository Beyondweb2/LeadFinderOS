// PROSPECT PREVIEW — the operator's "Generate prospect preview" (AI Audit screen).
//
// One replacement HOMEPAGE + an EVIDENCE CARD + screenshots for a prospect whose AI audit went badly,
// stored privately for the operator to download and send by hand.
//
// ⛔ IT NEVER SENDS A MESSAGE. No Graph call, no import of any sender. It returns metadata, signed
// image URLs and a SUGGESTED message; a human decides what goes on WhatsApp.
// ⛔ IT IS NOT A WEBSITE BUILD. It never reads or writes outreach_leads.website_build, never deploys,
// never attaches a domain. The HTML is stored privately and is noindex.
// ⛔ NO OPENAI SPEND. Research reuses warm_lead_research when it is fresh for this website (read-only:
// that table belongs to warm-lead-reply), else the rule/crawl findings are assembled here with no
// model call. The only spend is Cloudflare Browser Rendering (the screenshots).
//
// Order of reuse: lead row → newest ordinary audit + its run → lead_crawl_checks (incl. a full crawl)
// → warm_lead_research → ONE homepage fetch (brand: logo/colours/photos, which nothing stores) and,
// only without a fresh full crawl, a few menu pages.
//
// Actions: "status" (DB only) · "generate" { regenerate?: boolean }.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveOperator, isUpstreamOutage } from "../_shared/operator-auth.ts";
import { isAggregatorUrl } from "../_shared/aggregators.ts";
import { shootHtml, shotConfigured } from "../_shared/prospect-preview-shot.ts";
import { buildReportData, type QueueRow, type RunRow } from "../../../src/lib/auditReport.ts";
import {
  planResearch, extractPageFacts, pickResearchPages, assembleResearch, usableFullCrawl,
  WARM_RESEARCH_FETCH_TIMEOUT_MS, WARM_RESEARCH_DEADLINE_MS, WARM_RESEARCH_MAX_PAGES,
  type CrawlRowInput, type PageFacts, type StoredResearchRow, type WarmLeadResearch,
} from "../../../src/lib/warmLeadResearch.ts";
import { extractSiteInfo } from "../../../src/lib/siteInfo.ts";
import { readBrand } from "../../../src/lib/prospectPreview/brand.ts";
import { pickHeadline, previewEligibility } from "../../../src/lib/prospectPreview/findings.ts";
import { generatePreview, buildCardHtml } from "../../../src/lib/prospectPreview/generate.ts";
import { selectTemplate, templateKey } from "../../../src/lib/prospectPreview/templates/index.ts";
import { tradePackFor } from "../../../src/lib/prospectPreview/trades.ts";
import { SHOTS } from "../../../src/lib/prospectPreview/shots.ts";
import { fingerprint, planGenerate, previewFreshness, PROSPECT_PREVIEW_GENERATOR_VERSION, FINGERPRINT_LABELS, type FingerprintParts } from "../../../src/lib/prospectPreview/freshness.ts";
import { PREVIEW_ASSETS, type PreviewStatus } from "../../../src/lib/prospectPreview/types.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};
const json = (b: unknown, s = 200) =>
  new Response(JSON.stringify(b), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");

const TABLE = "prospect_previews";
const BUCKET = "prospect-previews";
const SIGNED_URL_SECONDS = 3600;
/** A row stuck mid-generation longer than this is treated as dead, so a new click may start. */
const IN_PROGRESS_STALE_MS = 5 * 60_000;
const MAX_BODY_BYTES = 1_500_000;
const BROWSER_UA = "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";
const IN_PROGRESS: readonly string[] = ["gathering", "selecting_template", "building", "rendering"];

// deno-lint-ignore no-explicit-any
type Service = any;

interface LeadRow {
  id: string; user_id: string; business_name: string | null; website: string | null; phone: string | null; email: string | null;
  address: string | null; category: string | null; search_keyword: string | null; search_location: string | null; derived_town: string | null;
  rating: number | null; review_count: number | null; is_archived: boolean | null;
}

/* ───────────────────────── fetching (generate only) ───────────────────────── */

function isPublicHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (!/^https?:$/.test(u.protocol)) return false;
    const h = u.hostname.toLowerCase();
    if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || h.startsWith("[") || h.includes(":")) return false;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
      const [a, b] = h.split(".").map(Number);
      if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return false;
    }
    return true;
  } catch { return false; }
}

async function fetchHtml(url: string): Promise<{ html: string; finalUrl: string; status: number; ok: boolean }> {
  if (!isPublicHttpUrl(url)) return { html: "", finalUrl: url, status: 0, ok: false };
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), WARM_RESEARCH_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { "User-Agent": BROWSER_UA, "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8" }, redirect: "follow", signal: controller.signal });
    const type = res.headers.get("content-type") ?? "";
    let html = "";
    if (/html|xml|text/i.test(type) || !type) {
      const buf = new Uint8Array(await res.arrayBuffer());
      html = new TextDecoder("utf-8", { fatal: false }).decode(buf.subarray(0, MAX_BODY_BYTES));
    }
    return { html, finalUrl: res.url && /^https?:\/\//i.test(res.url) ? res.url : url, status: res.status, ok: res.ok && html.length > 0 };
  } catch {
    return { html: "", finalUrl: url, status: 0, ok: false };
  } finally { clearTimeout(t); }
}

/* ───────────────────────── loading (DB) ───────────────────────── */

async function loadLead(service: Service, leadId: string, operatorId: string): Promise<LeadRow | null> {
  const { data, error } = await service.from("outreach_leads")
    .select("id, user_id, business_name, website, phone, email, address, category, search_keyword, search_location, derived_town, rating, review_count, is_archived")
    .eq("id", leadId).maybeSingle();
  if (error) throw error;
  const l = data as LeadRow | null;
  return l && l.user_id === operatorId ? l : null;
}

// deno-lint-ignore no-explicit-any
async function loadAudit(service: Service, leadId: string): Promise<{ audit: any; run: RunRow; rows: QueueRow[] } | null> {
  const { data } = await service.from("ai_audits")
    .select("id, business_name, business_type, location_text, audit_purpose, is_measurement, created_at, ai_audit_runs(id, audit_id, run_number, status, mention_rate, results, created_at)")
    .eq("lead_id", leadId).order("created_at", { ascending: false }).limit(10);
  // deno-lint-ignore no-explicit-any
  for (const a of (Array.isArray(data) ? data : []) as any[]) {
    const purpose = a.audit_purpose ?? null;
    // The same "ordinary audit" the warm reply reads: a hook / free check / manual audit — never a
    // paid measurement, whose report is an operator document.
    if (a.is_measurement === true || !(purpose === null || purpose === "audit" || purpose === "free_check")) continue;
    // deno-lint-ignore no-explicit-any
    const runs = (Array.isArray(a.ai_audit_runs) ? [...a.ai_audit_runs] : []).sort((x: any, y: any) => (y.run_number ?? 0) - (x.run_number ?? 0));
    // deno-lint-ignore no-explicit-any
    const run = runs.find((r: any) => r.status === "complete" || r.status === "capped");
    if (!run) continue;
    const rows: QueueRow[] = [];
    for (let from = 0; ; from += 1000) {
      const { data: page, error } = await service.from("ai_audit_queue").select("id, question, status, result")
        .eq("audit_id", a.id).order("created_at", { ascending: true }).order("id", { ascending: true }).range(from, from + 999);
      if (error) throw error;
      rows.push(...((page ?? []) as QueueRow[]));
      if (!page || page.length < 1000) break;
    }
    return { audit: a, run: run as RunRow, rows };
  }
  return null;
}

async function loadCrawl(service: Service, leadId: string): Promise<CrawlRowInput | null> {
  const { data } = await service.from("lead_crawl_checks").select("created_at, result, mode, full_evidence").eq("lead_id", leadId).maybeSingle();
  return (data as CrawlRowInput | null) ?? null;
}

async function loadResearch(service: Service, leadId: string): Promise<StoredResearchRow | null> {
  const { data } = await service.from("warm_lead_research").select("research, generated_at, website, research_status, revalidated_at").eq("lead_id", leadId).maybeSingle();
  return (data as StoredResearchRow | null) ?? null;
}

// deno-lint-ignore no-explicit-any
async function loadRow(service: Service, leadId: string): Promise<any | null> {
  const { data, error } = await service.from(TABLE).select("*").eq("lead_id", leadId).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

// deno-lint-ignore no-explicit-any
async function signAssets(service: Service, paths: Record<string, string> | null): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  for (const [k, p] of Object.entries(paths ?? {})) {
    const { data } = await service.storage.from(BUCKET).createSignedUrl(p, SIGNED_URL_SECONDS);
    if (data?.signedUrl) out[k] = data.signedUrl;
  }
  return out;
}

// deno-lint-ignore no-explicit-any
async function view(service: Service, row: any, freshness: ReturnType<typeof previewFreshness> | null, extra: Record<string, unknown> = {}) {
  if (!row) return { ok: true, status: "not_generated", preview: null, ...extra };
  return {
    ok: true,
    status: row.status,
    preview: {
      status: row.status, statusDetail: row.status_detail, generatedAt: row.generated_at, updatedAt: row.updated_at,
      template: row.template_id ? `${row.template_id}@${row.template_version}` : null,
      headline: row.headline, primaryFinding: row.primary_finding, secondaryFindings: row.secondary_findings ?? [],
      notes: row.notes ?? [], message: row.message, facts: row.facts, timings: row.timings,
      stale: freshness?.state === "stale" ? freshness.changed.map((k) => FINGERPRINT_LABELS[k]) : [],
      assets: row.status === "ready" ? await signAssets(service, row.asset_paths) : {},
    },
    ...extra,
  };
}

/* ───────────────────────── gathering ───────────────────────── */

interface Gathered {
  lead: LeadRow;
  audit: NonNullable<Awaited<ReturnType<typeof loadAudit>>>;
  crawl: CrawlRowInput | null;
  researchRow: StoredResearchRow | null;
  parts: FingerprintParts;
  headline: ReturnType<typeof pickHeadline>;
  eligibility: ReturnType<typeof previewEligibility>;
}

async function gather(service: Service, lead: LeadRow): Promise<Gathered | { refusal: string }> {
  const audit = await loadAudit(service, lead.id);
  if (!audit) return { refusal: "No completed AI audit for this lead yet — run the audit first." };
  const [crawl, researchRow] = await Promise.all([loadCrawl(service, lead.id), loadResearch(service, lead.id)]);
  const a = audit.audit;
  const trade = (a.business_type ?? "").trim() || lead.category || lead.search_keyword || null;
  const town = (a.location_text ?? "").trim() || lead.derived_town || lead.search_location || null;
  const data = buildReportData(audit.rows, audit.run, {
    businessName: a.business_name ?? lead.business_name ?? "", businessType: a.business_type ?? "", locationText: a.location_text ?? "",
    specialisms: "", isAggregatorUrl, ownWebsite: (lead.website ?? "").trim() || undefined,
  });
  const headline = pickHeadline(data, { auditId: a.id, runId: audit.run.id ?? null, trade, town });
  const website = (lead.website ?? "").trim() && !isAggregatorUrl(lead.website!) ? lead.website!.trim() : null;
  const eligibility = previewEligibility({
    headline, auditComplete: true, hasWebsite: !!website, hasPhoneOrEmail: !!(lead.phone || lead.email), hasTown: !!town,
  });
  const choice = selectTemplate(tradePackFor(trade).key);
  const researchFresh = planResearch({ row: researchRow, leadWebsite: website, refresh: false, nowMs: Date.now() }).action === "reuse";
  const parts: FingerprintParts = {
    leadId: lead.id, website, auditId: a.id, runId: audit.run.id ?? null, crawlAt: crawl?.created_at ?? null,
    researchAt: researchFresh ? researchRow?.generated_at ?? null : null,
    template: choice.ok ? templateKey(choice.template) : "none", generator: PROSPECT_PREVIEW_GENERATOR_VERSION,
  };
  return { lead: { ...lead, website }, audit, crawl, researchRow, parts, headline, eligibility };
}

/* ───────────────────────── handlers ───────────────────────── */

async function handleStatus(service: Service, lead: LeadRow) {
  const row = await loadRow(service, lead.id);
  const g = await gather(service, lead);
  if ("refusal" in g) return json(await view(service, row, null, { eligible: false, reason: g.refusal }));
  return json(await view(service, row, previewFreshness(row, g.parts), {
    eligible: g.eligibility.eligible, reason: g.eligibility.eligible ? null : g.eligibility.reason,
    eligibilityNotes: g.eligibility.eligible ? g.eligibility.notes : [],
    headline: g.headline, shotsConfigured: shotConfigured(),
  }));
}

async function setStatus(service: Service, leadId: string, status: PreviewStatus, detail: string | null = null, extra: Record<string, unknown> = {}) {
  const { error } = await service.from(TABLE).update({ status, status_detail: detail, updated_at: new Date().toISOString(), ...extra }).eq("lead_id", leadId);
  if (error) throw error;
}

async function handleGenerate(service: Service, lead: LeadRow, regenerate: boolean) {
  const started = Date.now();
  const existing = await loadRow(service, lead.id);
  if (existing && IN_PROGRESS.includes(existing.status) && Date.now() - new Date(existing.updated_at).getTime() < IN_PROGRESS_STALE_MS) {
    return json({ ok: false, error: "in_progress", detail: "A preview is already being generated for this lead." }, 409);
  }
  const g = await gather(service, lead);
  if ("refusal" in g) return json({ ok: false, error: "not_eligible", detail: g.refusal }, 409);
  if (!g.eligibility.eligible) return json({ ok: false, error: "not_eligible", detail: g.eligibility.reason }, 409);
  if (!g.headline) return json({ ok: false, error: "not_eligible", detail: "No usable audit example." }, 409);

  const plan = planGenerate(existing, g.parts, regenerate);
  if (plan.action === "reuse") {
    return json(await view(service, existing, previewFreshness(existing, g.parts), { plan: plan.stale ? "reuse_stale" : "reuse" }));
  }
  if (!shotConfigured()) return json({ ok: false, error: "not_configured", detail: "Screenshots need CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_BROWSER_TOKEN." }, 503);

  /* Claim the row. A concurrent click loses the conditional update and is told so. */
  const nowIso = new Date().toISOString();
  if (!existing) {
    const { error } = await service.from(TABLE).insert({ lead_id: lead.id, user_id: lead.user_id, status: "gathering", updated_at: nowIso });
    if (error) return json({ ok: false, error: "in_progress", detail: "A preview is already being generated for this lead." }, 409);
  } else {
    const { data: claimed } = await service.from(TABLE).update({ status: "gathering", status_detail: null, updated_at: nowIso })
      .eq("lead_id", lead.id).eq("updated_at", existing.updated_at).select("id");
    if (!claimed?.length) return json({ ok: false, error: "in_progress", detail: "A preview is already being generated for this lead." }, 409);
  }

  const timings: Record<string, number> = {};
  try {
    /* ── gathering: research + their homepage ── */
    const t0 = Date.now();
    const website = g.lead.website;
    let research: WarmLeadResearch | null = null;
    let homeHtml = "";
    let homeUrl = "";
    const pages: PageFacts[] = [];
    if (website) {
      homeUrl = /^https?:\/\//i.test(website) ? website : `https://${website}`;
      const home = await fetchHtml(homeUrl);
      homeHtml = home.html;
      const homeFacts = extractPageFacts(home.html, homeUrl, home.finalUrl, home.status, home.ok);
      pages.push(homeFacts);
      if (g.parts.researchAt && g.researchRow?.research) {
        research = g.researchRow.research;
      } else {
        const full = usableFullCrawl(g.crawl, homeUrl, Date.now());
        if (homeFacts.ok && !full) {
          const deadline = Date.now() + WARM_RESEARCH_DEADLINE_MS;
          const targets = pickResearchPages(homeFacts, WARM_RESEARCH_MAX_PAGES - 1);
          const rest = await Promise.all(targets.map(async (u) => {
            if (Date.now() > deadline) return extractPageFacts("", u, u, 0, false);
            const r = await fetchHtml(u);
            return extractPageFacts(r.html, u, r.finalUrl, r.status, r.ok);
          }));
          pages.push(...rest);
        }
        research = assembleResearch({
          nowIso, website: homeUrl, businessName: lead.business_name, trade: g.headline.trade, town: g.headline.town,
          pages, crawl: g.crawl, audit: null, model: null, modelError: null, fetchMs: Date.now() - t0, analyseMs: null, researchMs: 0,
          nowYear: new Date().getUTCFullYear(),
        });
      }
    }
    const stored = g.crawl?.result?.siteInfo ?? null;
    let origin = "";
    try { origin = homeUrl ? new URL(pages[0]?.finalUrl || homeUrl).origin : ""; } catch { /* no origin */ }
    const siteInfo = stored ?? (homeHtml && origin ? extractSiteInfo(homeHtml, { origin }) : null);
    const brand = homeHtml ? readBrand(homeHtml, pages[0]?.finalUrl || homeUrl, lead.business_name) : null;
    timings.gatherMs = Date.now() - t0;

    /* ── selecting_template + building ── */
    await setStatus(service, lead.id, "selecting_template");
    const t1 = Date.now();
    const conflicts = (research?.strongestFindings ?? []).concat(research?.technicalFindings ?? [], research?.contentFindings ?? [])
      .filter((f) => /conflict/.test(f.kind)).map((f) => ({ kind: f.kind, title: f.title, detail: f.detail, evidence: f.evidence }));
    await setStatus(service, lead.id, "building");
    const result = generatePreview({
      facts: {
        lead: { ...g.lead },
        audit: { trade: g.headline.trade, town: g.headline.town },
        siteInfo: siteInfo as never,
        pages: pages.map((p) => ({ url: p.finalUrl, ok: p.ok, text: p.text, metaDescription: p.metaDescription, title: p.title })),
        brand,
        researchConflicts: conflicts,
      },
      headline: g.headline,
      research: research ? { status: research.status, technicallyClean: research.technicallyClean, strongestFindings: research.strongestFindings, technicalFindings: research.technicalFindings, contentFindings: research.contentFindings, localVisibilityFindings: research.localVisibilityFindings } : (website ? null : { status: "no_website", technicallyClean: false, strongestFindings: [] }),
    });
    timings.buildMs = Date.now() - t1;
    if (!result.ok) {
      const detail = [result.reason, ...(result.problems ?? []), ...(result.contamination ?? []).map((h) => `${h.why}: ${h.value}`)].join(" · ").slice(0, 900);
      await setStatus(service, lead.id, "failed", `${result.stage}: ${detail}`);
      return json({ ok: false, error: "generation_failed", stage: result.stage, detail }, 422);
    }
    const p = result.preview;

    /* ── rendering ── */
    await setStatus(service, lead.id, "rendering");
    const t2 = Date.now();
    const fp = fingerprint(g.parts);
    const dir = `${lead.id}/${fp}`;
    const assetPaths: Record<string, string> = {};
    const put = async (name: string, bytes: Uint8Array | string, type: string) => {
      const path = `${dir}/${name}`;
      const { error } = await service.storage.from(BUCKET).upload(path, typeof bytes === "string" ? new Blob([bytes], { type }) : bytes, { contentType: type, upsert: true });
      if (error) throw new Error(`storage upload ${name}: ${error.message}`);
      return path;
    };
    assetPaths.homepage_html = await put("homepage.html", p.homepageHtml, "text/html; charset=utf-8");
    let mobileHero: Uint8Array | null = null;
    for (const s of SHOTS) {
      let html = p.homepageHtml;
      if (s.doc === "card") {
        const b64 = mobileHero ? btoa(Array.from(mobileHero, (c) => String.fromCharCode(c)).join("")) : null;
        const card = buildCardHtml(p, b64 ? `data:image/png;base64,${b64}` : null);
        if (!card.ok) throw new Error(`card refused: ${card.contamination.map((h) => h.value).join(", ")}`);
        html = card.html;
        assetPaths.card_html = await put("card.html", card.html, "text/html; charset=utf-8");
      }
      const shot = await shootHtml(html, s);
      if (!shot.ok) throw new Error(`screenshot ${s.asset}: ${shot.refusal} ${shot.detail ?? ""}`);
      if (s.asset === "mobile_hero") mobileHero = shot.bytes;
      assetPaths[s.asset] = await put(`${s.asset}.png`, shot.bytes, "image/png");
    }
    timings.renderMs = Date.now() - t2;
    timings.totalMs = Date.now() - started;
    const missing = PREVIEW_ASSETS.filter((a) => !assetPaths[a]);
    if (missing.length) throw new Error(`missing assets: ${missing.join(", ")}`);

    await setStatus(service, lead.id, "ready", null, {
      audit_id: g.parts.auditId, template_id: p.template.id, template_version: p.template.version,
      generator_version: PROSPECT_PREVIEW_GENERATOR_VERSION, fingerprint: fp, fingerprint_parts: g.parts,
      source_website: website, source_crawl_at: g.crawl?.created_at ?? null,
      headline: g.headline, primary_finding: p.selection.primary, secondary_findings: p.selection.secondary,
      facts: {
        business: p.config.business, services: p.config.services, areas: p.config.areas, proof: p.config.proof,
        brand: { logo: p.config.brand.logoUrl, primary: p.config.brand.primary, accent: p.config.brand.accent, photos: p.config.brand.photos.length },
        conflicts: p.config.conflicts, rejectedAreas: p.config.rejectedAreas, researchSource: g.parts.researchAt ? "warm_lead_research" : "assembled_here",
      },
      notes: p.notes, message: p.message, asset_paths: assetPaths, timings, generated_at: new Date().toISOString(),
    });
    const row = await loadRow(service, lead.id);
    return json(await view(service, row, previewFreshness(row, g.parts), { plan: plan.reason }));
  } catch (e) {
    const detail = String((e as { message?: unknown })?.message ?? e).slice(0, 600);
    await setStatus(service, lead.id, "failed", detail).catch(() => {});
    return json({ ok: false, error: "generation_failed", detail }, 500);
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ ok: false, error: "method_not_allowed" }, 405);
  try {
    const who = await resolveOperator(req);
    if (!who.ok) return json({ ok: false, error: who.error, detail: who.detail }, who.status);
    const body = await req.json().catch(() => ({})) as Record<string, unknown>;
    const action = text(body.action) || "status";
    const leadId = text(body.lead_id);
    if (!leadId) return json({ ok: false, error: "lead_id_required", detail: "This audit has no linked lead." }, 400);
    const service = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", { auth: { persistSession: false } });
    const lead = await loadLead(service, leadId, who.user.id);
    if (!lead) return json({ ok: false, error: "lead_not_found", detail: "That lead is not in your account." }, 404);
    if (lead.is_archived === true) return json({ ok: false, error: "lead_archived", detail: "This lead is archived." }, 409);
    if (action === "status") return await handleStatus(service, lead);
    if (action === "generate") return await handleGenerate(service, lead, body.regenerate === true);
    return json({ ok: false, error: "unknown_action" }, 400);
  } catch (e) {
    const message = String((e as { message?: unknown })?.message ?? e);
    console.error("[prospect-preview] error:", message);
    if (isUpstreamOutage(e)) return json({ ok: false, error: "upstream_timeout", detail: "The database did not answer in time. Try again in a moment." }, 503);
    return json({ ok: false, error: "internal", detail: message.slice(0, 300) }, 500);
  }
});
