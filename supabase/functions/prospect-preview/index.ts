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
// that table belongs to warm-lead-reply), else the rule/crawl findings are assembled with no model
// call. The only spend is Cloudflare Browser Rendering (the screenshots).
// ⛔ NEVER HOTLINKS. The few images the homepage shows are copied into the private bucket first
// (src/lib/prospectPreview/assets.ts) and the page renders from those copies.
//
// All judgement is in src/lib/prospectPreview (gather.ts → generate.ts); this file reads rows, fetches
// pages/images, stores files and takes the screenshots.
//
// Actions: "status" (DB only) · "generate" { regenerate?: boolean }.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { resolveOperator, isUpstreamOutage } from "../_shared/operator-auth.ts";
import { isAggregatorUrl } from "../_shared/aggregators.ts";
import { shootHtml, shotConfigured } from "../_shared/prospect-preview-shot.ts";
import type { QueueRow, RunRow } from "../../../src/lib/auditReport.ts";
import {
  extractPageFacts, pickResearchPages, WARM_RESEARCH_FETCH_TIMEOUT_MS, WARM_RESEARCH_DEADLINE_MS, WARM_RESEARCH_MAX_PAGES,
  type CrawlRowInput, type PageFacts, type StoredResearchRow,
} from "../../../src/lib/warmLeadResearch.ts";
import { gatherPreview, buildInputs, needsMenuPages, homeUrlFor, pickOrdinaryAudit, type AuditBundle, type Gathered } from "../../../src/lib/prospectPreview/gather.ts";
import { planPreview, generatePreview, buildCardHtml } from "../../../src/lib/prospectPreview/generate.ts";
import { copyImages, resolveStoredAssets } from "../../../src/lib/prospectPreview/assets.ts";
import { stylesheetsToRead } from "../../../src/lib/prospectPreview/brand.ts";
import { SHOTS } from "../../../src/lib/prospectPreview/shots.ts";
import { fingerprint, planGenerate, previewFreshness, PROSPECT_PREVIEW_GENERATOR_VERSION, FINGERPRINT_LABELS } from "../../../src/lib/prospectPreview/freshness.ts";
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
const MAX_HTML_BYTES = 1_500_000;
const MAX_CSS_BYTES = 600_000;
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
    if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal") || h.endsWith(".invalid") || h.startsWith("[") || h.includes(":")) return false;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
      const [a, b] = h.split(".").map(Number);
      if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return false;
    }
    return true;
  } catch { return false; }
}

/** Public address only, timed out, read no further than `maxBytes`. */
async function fetchCapped(url: string, maxBytes: number, accept: string): Promise<{ bytes: Uint8Array; contentType: string | null; finalUrl: string; status: number; ok: boolean } | null> {
  if (!isPublicHttpUrl(url)) return null;
  const controller = new AbortController();
  const t = setTimeout(() => controller.abort(), WARM_RESEARCH_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, { headers: { "User-Agent": BROWSER_UA, "Accept": accept }, redirect: "follow", signal: controller.signal });
    const finalUrl = res.url && /^https?:\/\//i.test(res.url) ? res.url : url;
    if (!isPublicHttpUrl(finalUrl)) return null;
    const chunks: Uint8Array[] = [];
    let total = 0;
    if (res.body) {
      const reader = res.body.getReader();
      try {
        while (total < maxBytes) {
          const { done, value } = await reader.read();
          if (done) break;
          if (value) { chunks.push(value); total += value.byteLength; }
        }
      } finally { try { await reader.cancel(); } catch { /* closed */ } }
    }
    const bytes = new Uint8Array(Math.min(total, maxBytes));
    let at = 0;
    for (const c of chunks) { const n = Math.min(c.byteLength, bytes.length - at); if (n <= 0) break; bytes.set(c.subarray(0, n), at); at += n; }
    return { bytes, contentType: res.headers.get("content-type"), finalUrl, status: res.status, ok: res.ok };
  } catch {
    return null;
  } finally { clearTimeout(t); }
}

async function fetchPage(url: string): Promise<{ html: string; facts: PageFacts }> {
  const r = await fetchCapped(url, MAX_HTML_BYTES, "text/html,application/xhtml+xml;q=0.9,*/*;q=0.8");
  const isHtml = !!r && (/html|xml|text/i.test(r.contentType ?? "") || !r.contentType);
  const html = r && isHtml ? new TextDecoder("utf-8", { fatal: false }).decode(r.bytes) : "";
  return { html, facts: extractPageFacts(html, url, r?.finalUrl ?? url, r?.status ?? 0, !!r?.ok && html.length > 0) };
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

async function loadAudit(service: Service, leadId: string): Promise<AuditBundle | null> {
  const { data } = await service.from("ai_audits")
    .select("id, business_name, business_type, location_text, audit_purpose, is_measurement, created_at, ai_audit_runs(id, audit_id, run_number, status, mention_rate, results, created_at)")
    .eq("lead_id", leadId).order("created_at", { ascending: false }).limit(10);
  const picked = pickOrdinaryAudit(Array.isArray(data) ? data : []);
  if (!picked) return null;
  const rows: QueueRow[] = [];
  for (let from = 0; ; from += 1000) {
    const { data: page, error } = await service.from("ai_audit_queue").select("id, question, status, result")
      .eq("audit_id", picked.audit.id).order("created_at", { ascending: true }).order("id", { ascending: true }).range(from, from + 999);
    if (error) throw error;
    rows.push(...((page ?? []) as QueueRow[]));
    if (!page || page.length < 1000) break;
  }
  return { audit: picked.audit, run: picked.run as RunRow, rows };
}

async function loadCrawl(service: Service, leadId: string): Promise<CrawlRowInput | null> {
  const { data } = await service.from("lead_crawl_checks").select("created_at, result, mode, full_evidence").eq("lead_id", leadId).maybeSingle();
  return (data as CrawlRowInput | null) ?? null;
}

async function loadResearch(service: Service, leadId: string): Promise<StoredResearchRow | null> {
  const { data } = await service.from("warm_lead_research").select("research, generated_at, website, research_status, revalidated_at").eq("lead_id", leadId).maybeSingle();
  return (data as StoredResearchRow | null) ?? null;
}

/** The number LeadFinder is actually messaging for this lead: the newest WhatsApp row's, else the lead's. */
async function loadContactPhone(service: Service, lead: LeadRow): Promise<string | null> {
  const { data } = await service.from("whatsapp_messages").select("phone").eq("lead_id", lead.id).order("created_at", { ascending: false }).limit(1);
  const p = Array.isArray(data) && data[0]?.phone ? String(data[0].phone) : null;
  return p || lead.phone || null;
}

// deno-lint-ignore no-explicit-any
async function loadRow(service: Service, leadId: string): Promise<any | null> {
  const { data, error } = await service.from(TABLE).select("*").eq("lead_id", leadId).maybeSingle();
  if (error) throw error;
  return data ?? null;
}

async function signPaths(service: Service, paths: string[]): Promise<Record<string, string>> {
  const out: Record<string, string> = {};
  if (!paths.length) return out;
  const { data } = await service.storage.from(BUCKET).createSignedUrls(paths, SIGNED_URL_SECONDS);
  for (const d of (data ?? []) as Array<{ path: string | null; signedUrl: string | null }>) if (d.path && d.signedUrl) out[d.path] = d.signedUrl;
  return out;
}

// deno-lint-ignore no-explicit-any
async function view(service: Service, row: any, freshness: ReturnType<typeof previewFreshness> | null, extra: Record<string, unknown> = {}) {
  if (!row) return { ok: true, status: "not_generated", preview: null, ...extra };
  const assetPaths = (row.asset_paths ?? {}) as Record<string, string>;
  const imagePaths = ((row.facts?.images ?? []) as Array<{ stored: string | null }>).map((x) => x.stored).filter((x): x is string => !!x);
  const signed = row.status === "ready" ? await signPaths(service, [...Object.values(assetPaths), ...imagePaths]) : {};
  return {
    ok: true,
    status: row.status,
    preview: {
      status: row.status, statusDetail: row.status_detail, generatedAt: row.generated_at, updatedAt: row.updated_at,
      template: row.template_id ? `${row.template_id}@${row.template_version}` : null,
      headline: row.headline, primaryFinding: row.primary_finding, secondaryFindings: row.secondary_findings ?? [],
      notes: row.notes ?? [], message: row.message, facts: row.facts, timings: row.timings,
      stale: freshness?.state === "stale" ? freshness.changed.map((k) => FINGERPRINT_LABELS[k]) : [],
      assets: Object.fromEntries(Object.entries(assetPaths).map(([k, p]) => [k, signed[p]]).filter(([, u]) => !!u)),
      /** Stored image copies, by path — the panel swaps them into the homepage HTML to view it. */
      storedImages: Object.fromEntries(imagePaths.map((p) => [p, signed[p]]).filter(([, u]) => !!u)),
    },
    ...extra,
  };
}

/* ───────────────────────── gathering ───────────────────────── */

interface Loaded { audit: AuditBundle; crawl: CrawlRowInput | null; researchRow: StoredResearchRow | null; g: Gathered }

async function load(service: Service, lead: LeadRow): Promise<Loaded | { refusal: string }> {
  const audit = await loadAudit(service, lead.id);
  if (!audit) return { refusal: "No completed AI audit for this lead yet — run the audit first." };
  const [crawl, researchRow] = await Promise.all([loadCrawl(service, lead.id), loadResearch(service, lead.id)]);
  const g = gatherPreview({ lead, audit, crawl, researchRow, isAggregatorUrl, nowMs: Date.now() });
  return { audit, crawl, researchRow, g };
}

/* ───────────────────────── handlers ───────────────────────── */

async function handleStatus(service: Service, lead: LeadRow) {
  const row = await loadRow(service, lead.id);
  const l = await load(service, lead);
  if ("refusal" in l) return json(await view(service, row, null, { eligible: false, reason: l.refusal }));
  const e = l.g.eligibility;
  return json(await view(service, row, previewFreshness(row, l.g.parts), {
    eligible: e.eligible, reason: e.eligible ? null : e.reason, eligibilityNotes: e.eligible ? e.notes : [],
    headline: l.g.headline, shotsConfigured: shotConfigured(),
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
  const l = await load(service, lead);
  if ("refusal" in l) return json({ ok: false, error: "not_eligible", detail: l.refusal }, 409);
  const g = l.g;
  if (!g.eligibility.eligible) return json({ ok: false, error: "not_eligible", detail: g.eligibility.reason }, 409);
  if (!g.headline) return json({ ok: false, error: "not_eligible", detail: "No usable audit example." }, 409);

  const plan = planGenerate(existing, g.parts, regenerate);
  if (plan.action === "reuse") {
    return json(await view(service, existing, previewFreshness(existing, g.parts), { plan: plan.stale ? "reuse_stale" : "reuse" }));
  }
  if (!shotConfigured()) return json({ ok: false, error: "not_configured", detail: "Screenshots need CLOUDFLARE_ACCOUNT_ID and CLOUDFLARE_BROWSER_TOKEN." }, 503);

  /* Claim the row. A concurrent click loses the conditional write and is told so. */
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
  const fp = fingerprint(g.parts);
  const dir = `${lead.id}/${fp}`;
  const put = async (path: string, bytes: Uint8Array | string, type: string) => {
    const { error } = await service.storage.from(BUCKET).upload(path, typeof bytes === "string" ? new Blob([bytes], { type }) : bytes, { contentType: type, upsert: true });
    if (error) throw new Error(`storage upload ${path}: ${error.message}`);
  };
  try {
    /* ── gathering: their homepage (brand + words), menu pages only when nothing fresher is held ── */
    const t0 = Date.now();
    const pages: PageFacts[] = [];
    let homeHtml = "";
    if (g.website) {
      const homeUrl = homeUrlFor(g.website);
      // Twice before anything is said about it: a transient failure is not "your site is down".
      let home = await fetchPage(homeUrl);
      if (!home.facts.ok) home = await fetchPage(homeUrl);
      homeHtml = home.html;
      pages.push(home.facts);
      if (home.facts.ok && needsMenuPages(g, l.crawl, homeUrl, Date.now())) {
        const deadline = Date.now() + WARM_RESEARCH_DEADLINE_MS;
        const targets = pickResearchPages(home.facts, WARM_RESEARCH_MAX_PAGES - 1);
        pages.push(...await Promise.all(targets.map(async (u) => (Date.now() > deadline ? extractPageFacts("", u, u, 0, false) : (await fetchPage(u)).facts))));
      }
    }
    // Their own theme stylesheet(s) — the only place most sites declare their brand colour.
    let css = "";
    if (homeHtml) {
      const sheets = stylesheetsToRead(homeHtml, pages[0]?.finalUrl || homeUrlFor(g.website!));
      const got = await Promise.all(sheets.map((u) => fetchCapped(u, MAX_CSS_BYTES, "text/css,*/*;q=0.5")));
      css = got.filter((r) => r?.ok).map((r) => new TextDecoder("utf-8", { fatal: false }).decode(r!.bytes)).join("\n");
    }
    const contactPhone = await loadContactPhone(service, lead);
    const inputs = buildInputs({ lead, gathered: g, crawl: l.crawl, researchRow: l.researchRow, pages, homeHtml, contactPhone, nowIso, css });
    timings.gatherMs = Date.now() - t0;

    /* ── selecting_template, then copy ONLY the images that template will show ── */
    await setStatus(service, lead.id, "selecting_template");
    const planned = planPreview(inputs.facts);
    if (planned.ok === false) {
      await setStatus(service, lead.id, "failed", `${planned.stage}: ${planned.reason}`);
      return json({ ok: false, error: "generation_failed", stage: planned.stage, detail: planned.reason }, 422);
    }
    const t1 = Date.now();
    const images = await copyImages(planned.imagesToCopy, dir, {
      fetchBytes: async (url, max) => { const r = await fetchCapped(url, max, "image/avif,image/webp,image/*;q=0.9,*/*;q=0.5"); return r && r.ok ? { bytes: r.bytes, contentType: r.contentType } : null; },
      store: (path, bytes, type) => put(path, bytes, type),
    });
    timings.imagesMs = Date.now() - t1;

    /* ── building ── */
    await setStatus(service, lead.id, "building");
    const t2 = Date.now();
    const result = generatePreview({ facts: inputs.facts, headline: g.headline, research: inputs.research, images });
    timings.buildMs = Date.now() - t2;
    if (!result.ok) {
      const detail = [result.reason, ...(result.problems ?? []), ...(result.contamination ?? []).map((h) => `${h.why}: ${h.value}`)].join(" · ").slice(0, 900);
      await setStatus(service, lead.id, "failed", `${result.stage}: ${detail}`);
      return json({ ok: false, error: "generation_failed", stage: result.stage, detail }, 422);
    }
    const p = result.preview;

    /* ── rendering: from our stored copies, through short-lived signed URLs ── */
    await setStatus(service, lead.id, "rendering");
    const t3 = Date.now();
    const signed = await signPaths(service, images.map((i) => i.stored).filter((x): x is string => !!x));
    const live = (html: string) => resolveStoredAssets(html, (path) => signed[path] ?? null);
    const assetPaths: Record<string, string> = {};
    // Stored with the placeholder origin: the saved page never carries an expiring link.
    assetPaths.homepage_html = `${dir}/homepage.html`;
    await put(assetPaths.homepage_html, p.homepageHtml, "text/html; charset=utf-8");
    let mobileHero: Uint8Array | null = null;
    for (const s of SHOTS) {
      let html = live(p.homepageHtml);
      if (s.doc === "card") {
        const b64 = mobileHero ? btoa(Array.from(mobileHero, (c) => String.fromCharCode(c)).join("")) : null;
        const card = buildCardHtml(p, b64 ? `data:image/png;base64,${b64}` : null);
        if (!card.ok) throw new Error(`card refused: ${card.contamination.map((h) => h.value).join(", ")}`);
        html = card.html;
        assetPaths.card_html = `${dir}/card.html`;
        await put(assetPaths.card_html, card.html, "text/html; charset=utf-8");
      }
      const shot = await shootHtml(html, s);
      if (!shot.ok) throw new Error(`screenshot ${s.asset}: ${shot.refusal} ${shot.detail ?? ""}`);
      if (s.asset === "mobile_hero") mobileHero = shot.bytes;
      assetPaths[s.asset] = `${dir}/${s.asset}.png`;
      await put(assetPaths[s.asset], shot.bytes, "image/png");
    }
    timings.renderMs = Date.now() - t3;
    timings.totalMs = Date.now() - started;
    const missing = PREVIEW_ASSETS.filter((a) => !assetPaths[a]);
    if (missing.length) throw new Error(`missing assets: ${missing.join(", ")}`);

    await setStatus(service, lead.id, "ready", null, {
      audit_id: g.parts.auditId, template_id: p.template.id, template_version: p.template.version,
      generator_version: PROSPECT_PREVIEW_GENERATOR_VERSION, fingerprint: fp, fingerprint_parts: g.parts,
      source_website: g.website, source_crawl_at: l.crawl?.created_at ?? null,
      headline: g.headline, primary_finding: p.selection.primary, secondary_findings: p.selection.secondary,
      facts: {
        business: p.config.business, services: p.config.services, areas: p.config.areas, proof: p.config.proof,
        brand: { logo: p.config.brand.logoUrl, primary: p.config.brand.primary, accent: p.config.brand.accent },
        // Provenance: every copied image, source URL → stored path (or why it was left out).
        images,
        conflicts: p.config.conflicts, requiresResolution: p.config.requiresResolution, rejectedAreas: p.config.rejectedAreas,
        researchSource: inputs.researchSource, contactPhone,
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
