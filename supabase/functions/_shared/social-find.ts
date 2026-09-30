// social-find — Find socials for ONE lead: what we already hold first, then (free) their own website,
// graded by the one rule (src/lib/socialProfiles.ts) and saved by the one upsert rule below. Read by fn
// social-profiles (Find socials / add / confirm / reject) and fn enrich-business (the paid lookup).
//
// ORDER (cheapest first; the site fetch runs only when the records leave a priority platform unknown):
//   1. our records — the lead's website crawl (lead_crawl_checks.result.siteInfo.socialLinks), its audit
//      crawls (ai_audit_runs.results_crawl_check), the social link Google gave as its "website", the
//      links the old Enrich left in the columns, and the same business on another row (place id / phone)
//   2. their own website — homepage + up to three contact / about pages, anchors AND schema sameAs,
//      cached per site for SITE_CACHE_DAYS (enrichment_cache `<host>:social_find_v1`) so it is never
//      fetched twice. Plain HTTP, $0, logged to api_usage_log like extract-email.
// ⛔ LinkedIn is never fetched. ⛔ No email is read or written here.
// ⛔ THE UPSERT RULE (saveGraded): a rejected row is never re-activated; a person's row (manual, or
//    confirmed_by set) is never touched by an automated find; a grade is only ever RAISED. The canonical
//    pick and the lead's columns are the database's job (_social_profiles_sync, a trigger).
import {
  extractSocialLinksFromHtml, gradeSocialCandidates, isStronger, normaliseSocialUrl, socialOutcomes, SOCIAL_SOURCE_LABEL, socialPlatformLabel,
  type GradedSocial, type SocialBusiness, type SocialCandidateInput, type SocialConfidence, type SocialProfileRow,
} from "../../../src/lib/socialProfiles.ts";
import { classifyLeadWebsite } from "../../../src/lib/leadWebsiteKind.ts";

// deno-lint-ignore no-explicit-any
type Service = any;

export const SOCIAL_LEAD_COLUMNS = "id, user_id, business_name, website, place_id, phone, derived_town, search_location, country, facebook_url, facebook_method, instagram_url, instagram_method, is_archived, assigned_to_user_id, amount_paid, status";
export const SOCIAL_ROW_COLUMNS = "id, lead_id, platform, url, url_key, handle, confidence, source, state, evidence, is_canonical, added_by, confirmed_by, confirmed_at, rejected_by, rejected_at, reject_reason, created_at, updated_at";

export interface SocialLead {
  id: string; user_id: string; business_name: string | null; website: string | null; place_id: string | null; phone: string | null;
  derived_town: string | null; search_location: string | null; country: string | null;
  facebook_url: string | null; facebook_method: string | null; instagram_url: string | null; instagram_method: string | null;
  is_archived?: boolean | null;
}

export const SITE_CACHE_DAYS = 30;
const SITE_FETCH_TIMEOUT_MS = 8_000;
const SITE_MAX_BYTES = 1_000_000;
const SITE_EXTRA_PAGES = 3;
const USER_AGENT = "Mozilla/5.0 (compatible; LeadFinderOS/1.0; +https://findable.live)";

export function businessOf(lead: SocialLead): SocialBusiness {
  return { name: lead.business_name, website: lead.website, town: lead.derived_town || lead.search_location };
}

const socialLinksOf = (v: unknown): string[] =>
  Array.isArray(v) ? v.map((x) => (x && typeof x === "object" ? String((x as { url?: unknown }).url ?? "") : "")).filter(Boolean) : [];

/** 1. Everything we already hold. No network call beyond the database. */
export async function candidatesFromRecords(service: Service, lead: SocialLead): Promise<{ candidates: SocialCandidateInput[]; sameBusinessIds: string[]; used: string[] }> {
  const out: SocialCandidateInput[] = [];
  const used = new Set<string>();

  /* A crawl of the lead's OWN site is the business pointing at its profiles. A crawl of a directory
     page (TradeHQ, Checkatrade…) is not — its links are graded like a found result: the name AND the
     town must match, and then only "likely". */
  const ownSite = classifyLeadWebsite(lead.website).source === "own_site";
  const town = lead.derived_town || lead.search_location || "";
  const crawled = (url: string): SocialCandidateInput => ownSite ? { url, source: "website" } : { url, source: "web_search", context: `${lead.business_name ?? ""} ${town}` };
  const { data: crawls } = await service.from("lead_crawl_checks").select("result").eq("lead_id", lead.id).limit(5);
  for (const c of (crawls ?? []) as Array<{ result: { siteInfo?: { socialLinks?: unknown } } | null }>) {
    for (const url of socialLinksOf(c.result?.siteInfo?.socialLinks)) { out.push(crawled(url)); used.add("website crawl"); }
  }
  const { data: audits } = await service.from("ai_audits").select("id").eq("lead_id", lead.id).order("created_at", { ascending: false }).limit(10);
  const auditIds = ((audits ?? []) as Array<{ id: string }>).map((a) => a.id);
  if (auditIds.length) {
    const { data: runs } = await service.from("ai_audit_runs").select("results_crawl_check").in("audit_id", auditIds).not("results_crawl_check", "is", null).limit(20);
    for (const r of (runs ?? []) as Array<{ results_crawl_check: { siteInfo?: { socialLinks?: unknown } } | null }>) {
      for (const url of socialLinksOf(r.results_crawl_check?.siteInfo?.socialLinks)) { out.push(crawled(url)); used.add("audit crawl"); }
    }
  }
  // Google gave a social profile as the business's "website" — the listing's own link.
  if (lead.website && lead.place_id && classifyLeadWebsite(lead.website).source === "social_profile") { out.push({ url: lead.website, source: "google_listing" }); used.add("Google listing"); }
  // Links a writer that predates the table left in the columns (the old Enrich, Find Leads' add).
  for (const [url, method] of [[lead.facebook_url, lead.facebook_method], [lead.instagram_url, lead.instagram_method]] as const) {
    if (url) { out.push({ url, source: "legacy", carried: (method === "manual" ? "confirmed" : "likely") as SocialConfidence }); used.add("earlier Enrich"); }
  }
  // The same business on another row: the same Google place, or the same phone number.
  const ids = new Set<string>();
  if (lead.place_id) {
    const { data } = await service.from("outreach_leads").select("id").eq("place_id", lead.place_id).neq("id", lead.id).limit(20);
    for (const r of (data ?? []) as Array<{ id: string }>) ids.add(r.id);
  }
  const digits = String(lead.phone ?? "").replace(/\D/g, "");
  if (digits.length >= 9 && lead.phone) {
    const { data } = await service.from("outreach_leads").select("id").eq("phone", lead.phone).neq("id", lead.id).limit(20);
    for (const r of (data ?? []) as Array<{ id: string }>) ids.add(r.id);
  }
  const sameBusinessIds = [...ids];
  if (sameBusinessIds.length) {
    const { data } = await service.from("lead_social_profiles").select("url, confidence").in("lead_id", sameBusinessIds).eq("state", "active").eq("is_canonical", true);
    for (const r of (data ?? []) as Array<{ url: string; confidence: SocialConfidence }>) { out.push({ url: r.url, source: "same_business", carried: r.confidence }); used.add("another record of this business"); }
  }
  return { candidates: out, sameBusinessIds, used: [...used] };
}

function isPrivateHost(h: string): boolean {
  if (["localhost", "127.0.0.1", "0.0.0.0", "::1", "metadata.google.internal"].includes(h)) return true;
  if (/^(10\.|192\.168\.|169\.254\.)/.test(h)) return true;
  const m = h.match(/^172\.(\d+)\./);
  if (m && Number(m[1]) >= 16 && Number(m[1]) <= 31) return true;
  return h.startsWith("fd") || h.startsWith("fe80");
}

async function fetchPage(url: string): Promise<string | null> {
  try {
    const u = new URL(url);
    if (!["http:", "https:"].includes(u.protocol) || isPrivateHost(u.hostname)) return null;
    const ctl = new AbortController();
    const timer = setTimeout(() => ctl.abort(), SITE_FETCH_TIMEOUT_MS);
    try {
      const res = await fetch(u.toString(), { signal: ctl.signal, redirect: "follow", headers: { "User-Agent": USER_AGENT, Accept: "text/html" } });
      if (!res.ok || !(res.headers.get("content-type") ?? "text/html").includes("html")) return null;
      const reader = res.body?.getReader();
      if (!reader) return null;
      const chunks: Uint8Array[] = [];
      let size = 0;
      while (size < SITE_MAX_BYTES) {
        const { done, value } = await reader.read();
        if (done || !value) break;
        chunks.push(value); size += value.length;
      }
      try { await reader.cancel(); } catch { /* already closed */ }
      const buf = new Uint8Array(size); let off = 0;
      for (const c of chunks) { buf.set(c.subarray(0, Math.min(c.length, size - off)), off); off += c.length; if (off >= size) break; }
      return new TextDecoder().decode(buf);
    } finally { clearTimeout(timer); }
  } catch { return null; }
}

/** Contact / about pages linked from the homepage, same site only. */
function contactPages(html: string, base: URL): string[] {
  const out = new Set<string>();
  for (const m of html.matchAll(/href\s*=\s*["']([^"'#\s]+)["']/gi)) {
    let u: URL;
    try { u = new URL(m[1], base); } catch { continue; }
    if (u.hostname.replace(/^www\./, "") !== base.hostname.replace(/^www\./, "")) continue;
    if (/\/(contact|contact-us|about|about-us|find-us|get-in-touch|connect|follow-us)(\/|\.html?|\.php)?$/i.test(u.pathname)) out.add(u.origin + u.pathname);
    if (out.size >= SITE_EXTRA_PAGES) break;
  }
  return [...out];
}

export interface SiteScan { reachable: boolean; pages: number; cached: boolean; links: Array<{ url: string; via: "link" | "schema" }> }

/** 2. Their own website, free, cached per site. null = no own site to read (none, or a profile page). */
export async function candidatesFromSite(service: Service, lead: SocialLead, actorId: string): Promise<SiteScan | null> {
  const site = String(lead.website ?? "").trim();
  if (!site || classifyLeadWebsite(site).source !== "own_site") return null;
  let base: URL;
  try { base = new URL(/^https?:\/\//i.test(site) ? site : `https://${site}`); } catch { return null; }
  const host = base.hostname.toLowerCase().replace(/^www\./, "");
  const cacheKey = `${host}:social_find_v1`;
  const { data: cached } = await service.from("enrichment_cache").select("result, expires_at").eq("cache_key", cacheKey).maybeSingle();
  if (cached && (!cached.expires_at || new Date(cached.expires_at).getTime() > Date.now())) {
    const r = cached.result as SiteScan;
    return { reachable: !!r?.reachable, pages: Number(r?.pages ?? 0), cached: true, links: Array.isArray(r?.links) ? r.links : [] };
  }
  const links = new Map<string, { url: string; via: "link" | "schema" }>();
  let pages = 0;
  const home = await fetchPage(base.toString());
  if (home !== null) {
    pages++;
    for (const l of extractSocialLinksFromHtml(home)) links.set(l.urlKey, { url: l.url, via: l.via });
    const extra = await Promise.all(contactPages(home, base).map((u) => fetchPage(u)));
    for (const html of extra) {
      if (html === null) continue;
      pages++;
      for (const l of extractSocialLinksFromHtml(html)) if (!links.has(l.urlKey) || l.via === "schema") links.set(l.urlKey, { url: l.url, via: l.via });
    }
  }
  const scan: SiteScan = { reachable: pages > 0, pages, cached: false, links: [...links.values()] };
  try {
    await service.from("api_usage_log").insert({ user_id: actorId, function_name: "social-profiles", api_type: "website_scrape", calls_made: Math.max(1, pages), cache_hit: false, estimated_cost_usd: 0, trigger_source: "social_find" });
  } catch { /* best-effort */ }
  // An unreachable site is remembered for one day only, so a later Find retries it.
  const days = scan.reachable ? SITE_CACHE_DAYS : 1;
  try {
    await service.from("enrichment_cache").upsert({ cache_key: cacheKey, enrichment_type: "social_find", result: scan, expires_at: new Date(Date.now() + days * 86_400_000).toISOString() }, { onConflict: "cache_key" });
  } catch { /* best-effort */ }
  return scan;
}

export function siteCandidates(scan: SiteScan | null): SocialCandidateInput[] {
  return (scan?.links ?? []).map((l) => ({ url: l.url, source: l.via === "schema" ? "website_schema" as const : "website" as const }));
}

/** How many OTHER businesses (not this one, not its duplicates) already hold each link. */
export async function sharedCounts(service: Service, leadId: string, sameBusinessIds: string[], keys: string[]): Promise<Record<string, number>> {
  if (!keys.length) return {};
  const { data } = await service.from("lead_social_profiles").select("lead_id, url_key").in("url_key", keys).eq("state", "active").neq("lead_id", leadId).limit(500);
  const skip = new Set(sameBusinessIds);
  const per: Record<string, Set<string>> = {};
  for (const r of (data ?? []) as Array<{ lead_id: string; url_key: string }>) {
    if (skip.has(r.lead_id)) continue;
    (per[r.url_key] ??= new Set()).add(r.lead_id);
  }
  return Object.fromEntries(Object.entries(per).map(([k, s]) => [k, s.size]));
}

export async function readRows(service: Service, leadId: string): Promise<SocialProfileRow[]> {
  const { data, error } = await service.from("lead_social_profiles").select(SOCIAL_ROW_COLUMNS).eq("lead_id", leadId).order("created_at", { ascending: true });
  if (error) throw error;
  return (data ?? []) as SocialProfileRow[];
}

/** THE UPSERT RULE (header). Returns how many rows were added or raised. */
export async function saveGraded(service: Service, lead: SocialLead, graded: GradedSocial[], actorId: string | null): Promise<number> {
  if (!graded.length) return 0;
  const { data: existing, error } = await service.from("lead_social_profiles").select("id, platform, url_key, confidence, source, state, confirmed_by")
    .eq("lead_id", lead.id).in("url_key", graded.map((g) => g.urlKey));
  if (error) throw error;
  let changed = 0;
  for (const g of graded) {
    const e = ((existing ?? []) as Array<{ id: string; platform: string; url_key: string; confidence: SocialConfidence; source: string; state: string; confirmed_by: string | null }>)
      .find((x) => x.platform === g.platform && x.url_key === g.urlKey);
    if (!e) {
      const { error: insErr } = await service.from("lead_social_profiles").insert({
        lead_id: lead.id, user_id: lead.user_id, platform: g.platform, url: g.url, url_key: g.urlKey, handle: g.handle,
        confidence: g.confidence, source: g.source, evidence: g.evidence, added_by: actorId,
      });
      if (insErr && !/duplicate key/i.test(String(insErr.message ?? ""))) throw insErr;
      if (!insErr) changed++;
      continue;
    }
    if (e.state === "rejected") continue;                       // a "Not them" stays not them
    if (e.source === "manual" || e.confirmed_by) continue;      // a person's choice beats every guess
    if (!isStronger(g.confidence, e.confidence)) continue;      // a grade is only ever raised
    const { error: upErr } = await service.from("lead_social_profiles").update({ confidence: g.confidence, source: g.source, evidence: g.evidence }).eq("id", e.id);
    if (upErr) throw upErr;
    changed++;
  }
  return changed;
}

/** A History line per priority platform whose canonical profile changed (added, replaced, cleared). */
export async function logCanonicalChanges(service: Service, leadId: string, actorId: string | null, before: SocialProfileRow[], after: SocialProfileRow[]): Promise<void> {
  const canon = (rows: SocialProfileRow[]) => new Map(rows.filter((r) => r.is_canonical).map((r) => [r.platform, r]));
  const b = canon(before); const a = canon(after);
  for (const platform of new Set([...b.keys(), ...a.keys()])) {
    const was = b.get(platform); const now = a.get(platform);
    if (was?.url === now?.url && was?.confidence === now?.confidence) continue;
    const what = now
      ? `${socialPlatformLabel(platform)} ${now.confidence === "confirmed" ? "confirmed" : "likely"} — ${SOCIAL_SOURCE_LABEL[now.source as keyof typeof SOCIAL_SOURCE_LABEL] ?? now.source}: ${now.url}`
      : `${socialPlatformLabel(platform)} cleared`;
    await service.from("lead_activity").insert({ lead_id: leadId, actor_user_id: actorId, kind: "details_set", data: { social: what } });
  }
}

export interface FindResult { rows: SocialProfileRow[]; added: number; site: SiteScan | null; used: string[]; rejected: number }

/** Records → (only if a priority platform is still unknown) the site → grade → save. */
export async function findSocials(service: Service, lead: SocialLead, actorId: string | null, opts: { site: boolean } = { site: true }): Promise<FindResult> {
  const before = await readRows(service, lead.id);
  const rec = await candidatesFromRecords(service, lead);
  const business = businessOf(lead);
  let pre = gradeSocialCandidates(rec.candidates, business);
  const known = socialOutcomes([...before, ...pre.graded.map((g) => ({ id: "", platform: g.platform, url: g.url, confidence: g.confidence, source: g.source, state: "active", is_canonical: g.confidence !== "unverified" }))]);
  const needSite = opts.site && known.some((o) => o.platform !== "linkedin" && o.state !== "confirmed");
  const site = needSite ? await candidatesFromSite(service, lead, actorId ?? lead.user_id) : null;
  const all = [...rec.candidates, ...siteCandidates(site)];
  const keys = all.map((c) => normaliseSocialUrl(c.url)).flatMap((n) => (n.ok ? [n.urlKey] : []));
  const shared = await sharedCounts(service, lead.id, rec.sameBusinessIds, [...new Set(keys)]);
  pre = gradeSocialCandidates(all, business, shared);
  const added = await saveGraded(service, lead, pre.graded, actorId);
  const rows = await readRows(service, lead.id);
  await logCanonicalChanges(service, lead.id, actorId, before, rows);
  return { rows, added, site, used: [...rec.used, ...(site ? [site.cached ? "their website (checked recently)" : "their website"] : [])], rejected: pre.rejected.length };
}
