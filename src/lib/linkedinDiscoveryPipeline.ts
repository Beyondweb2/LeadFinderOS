/* ════════════════════════════════════════════════════════════════════════════════════════════════
   LINKEDIN DECISION-MAKER DISCOVERY — THE PIPELINE (2026-09-30).

   The whole flow, with its storage and its network INJECTED so every branch is driven by a test
   (scripts/linkedin-decision-maker.test.ts). The edge function (_shared/linkedin-discovery.ts) supplies
   the real store (Supabase, service role) and the real IO (page fetch, Companies House, Apify).

   ORDER (⛔ structural — the cheap answer is always tried before the paid one):
     1. held      a profile a person already confirmed or pasted            → return it, spend nothing
     2. cache     a finished run for the same inputs, not expired            → return it, spend nothing
     3. in flight a run for this lead started < RUNNING_STALE_MS ago         → say so, spend nothing
     4. free      the lead's contact name, a manually typed person, the business's own pages (text,
                  schema, the LinkedIn links on them), Companies House (UK, when a key is set)
     5. no person → record 'no_person', return the manual-search links, spend nothing
     6. a person whose own-site LinkedIn link carries their name              → CONFIRMED, no search
     7. spend gate (fails closed) → claim the run row (one per lead) → ONE search per remaining person,
        at most MAX_SEARCHES_PER_RUN → score → optional verify (admin) → record cost + result.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import {
  extractPeopleFromJsonLd, extractPeopleFromText, jsonLdNodes, linkedInLinksOnPage, pageTextWithBlocks,
  peopleFromCompaniesHouse, rankDecisionMakers, roleFromText, tidyPersonName,
  type CompaniesHouseOfficer, type DecisionMakerCandidate,
} from './decisionMaker.ts';
import {
  canonicalLinkedInUrl, companyMatches, companyNameKey, discoveryCountry, domainKey, manualLinkedInSearchLinks,
  resolveProfiles, scoreProfile, type MatchContext, type ProfileCandidate, type ScoredProfile,
} from './linkedinMatch.ts';
import {
  buildSearchInput, buildSearchQuery, buildVerifyInput, LINKEDIN_SEARCH_ACTOR, LINKEDIN_SEARCH_EST_USD,
  LINKEDIN_VERIFY_ACTOR, LINKEDIN_VERIFY_EST_USD, mapVerifiedProfile, parseSearchItems,
} from './linkedinProviders.ts';
import {
  cacheTtlMs, inputFingerprint, LINKEDIN_DISCOVERY_VERSION, MAX_SEARCHES_PER_RUN, nameFromSlug, personResult, planDiscovery,
  siteProfileFor, spendGate, spendRefusalText, splitSiteLinkedIn, summarise,
  type DecisionMakerResult, type DiscoveryStatus, type HeldLinkedIn, type LinkedInDiscoveryResult, type PersonLinkedIn,
  type PriorRun, type SpendRefusal,
} from './linkedinDiscovery.ts';

/* ── Injected pieces ────────────────────────────────────────────────────────────────────────────── */

export interface DiscoveryLead {
  id: string;
  business_name: string;
  website: string | null;
  town: string | null;
  country: string | null;
  contact_name: string | null;
}

export interface DiscoveryActor { id: string; role: 'admin' | 'sales' }

export interface SpendSnapshot {
  apify: { captured_at: string; monthly_usage_usd: number | null; max_monthly_usage_usd: number | null } | null;
  /** null = could not be read (the gate then refuses). */
  spentLast24hUsd: number | null;
  userRunsLast24h: number | null;
}

export interface DiscoveryStore {
  loadHeld(leadId: string): Promise<HeldLinkedIn[]>;
  latestRun(leadId: string): Promise<PriorRun | null>;
  /** Insert the `running` row. The database's one-running-per-lead index is the dedupe. */
  claimRun(args: { leadId: string; fingerprint: string; actorId: string }): Promise<{ ok: true; runId: string } | { ok: false; reason: 'in_progress' | 'store_error' }>;
  finishRun(runId: string, patch: {
    status: DiscoveryStatus; result: LinkedInDiscoveryResult; cost_usd: number; cost_is_estimate: boolean;
    provider_calls: number; expires_at: string; error: string | null;
  }): Promise<void>;
  /** Record a no-spend answer (no_person / site-linked) so the next open is a cache hit. */
  recordFreeRun(args: { leadId: string; fingerprint: string; actorId: string; status: DiscoveryStatus; result: LinkedInDiscoveryResult; expires_at: string }): Promise<void>;
  spendSnapshot(actorId: string): Promise<SpendSnapshot>;
  /** The app-wide usage guard (guard_action 'enrich': the global mode, suspensions, per-user caps).
   *  Asked once, only when a run is about to spend. Returns the refusal sentence, or null to proceed. */
  guard?: () => Promise<string | null>;
  /** The shared ledgers (enrichment_usage + api_usage_log) — one row per paid provider call. */
  logCost(entry: { actorId: string; leadId: string; runId: string; actor: string; costUsd: number; isEstimate: boolean }): Promise<void>;
}

export interface FetchedPage { ok: boolean; finalUrl: string; body: string; contentType: string | null }

export interface DiscoveryIO {
  fetchPage(url: string): Promise<FetchedPage>;
  /** Absent when no COMPANIES_HOUSE_API_KEY is configured — the step is then skipped, not failed. */
  companiesHouse?: (businessName: string) => Promise<{ companyUrl: string; officers: CompaniesHouseOfficer[] } | null>;
  /** One Apify run. Returns the dataset and Apify's own cost figure (null when it could not be read). */
  runActor(actor: string, input: Record<string, unknown>): Promise<{ items: unknown[]; costUsd: number | null }>;
}

export interface DiscoveryRequest {
  lead: DiscoveryLead;
  actor: DiscoveryActor;
  mode: 'peek' | 'run';
  /** Admin only (the caller refuses it for sales). Skips the cache, never a held confirmed profile. */
  force?: boolean;
  /** Admin only. One profile-scraper call to check the single best LIKELY profile. */
  verify?: boolean;
  /** A salesperson typed the decision maker's name (optionally with a role). */
  manualPerson?: { name: string; role?: string | null } | null;
  now?: number;
}

export type DiscoveryResponse =
  | { ok: true; result: LinkedInDiscoveryResult }
  | { ok: true; result: null; note: 'nothing_cached' }
  | { ok: false; error: 'in_progress' | SpendRefusal | 'store_error' | 'usage_paused'; detail: string; manual_search: { linkedin: string; google: string } };

/* ── Page picking ───────────────────────────────────────────────────────────────────────────────── */

/** Pages on the business's own site that name people: about / team / meet / contact / our story. */
const PEOPLE_PAGE = /\b(about|team|meet|people|staff|our[- ]story|who[- ]we[- ]are|founder|owner|contact)\b/i;
export const MAX_SITE_PAGES = 5;

export function pickPeoplePages(homeHtml: string, homeUrl: string): string[] {
  let base: URL;
  try { base = new URL(homeUrl); } catch { return []; }
  const out: string[] = [];
  for (const m of (homeHtml || '').matchAll(/<a\b[^>]*href=["']([^"'#]+)["'][^>]*>([\s\S]*?)<\/a>/gi)) {
    const href = m[1];
    const label = m[2].replace(/<[^>]+>/g, ' ');
    if (!PEOPLE_PAGE.test(href) && !PEOPLE_PAGE.test(label)) continue;
    let u: URL;
    try { u = new URL(href, base); } catch { continue; }
    if (u.hostname.replace(/^www\./, '') !== base.hostname.replace(/^www\./, '')) continue;
    if (!/^https?:$/.test(u.protocol) || /\.(pdf|jpe?g|png|gif|webp|svg|docx?)$/i.test(u.pathname)) continue;
    u.hash = '';
    const s = u.toString();
    if (s !== base.toString() && !out.includes(s)) out.push(s);
    if (out.length >= MAX_SITE_PAGES - 1) break;
  }
  if (!out.length) for (const p of ['/about', '/about-us', '/contact']) out.push(new URL(p, base).toString());
  return out.slice(0, MAX_SITE_PAGES - 1);
}

/** Never fetch a private / local address from the edge (a lead's website field is typed by people). */
export function isFetchableWebsite(url: string | null | undefined): boolean {
  if (!url) return false;
  let u: URL;
  try { u = new URL(/^https?:\/\//i.test(url) ? url : `https://${url}`); } catch { return false; }
  if (!/^https?:$/.test(u.protocol)) return false;
  const h = u.hostname.toLowerCase();
  if (!h.includes('.') || h === 'localhost' || h.endsWith('.local') || h.endsWith('.internal') || h.endsWith('.localhost')) return false;
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(h) || h.startsWith('[')) return false;
  return true;
}

/** From Companies House search items, the ONE active company whose name key equals the business's.
 *  Two exact matches, or none, is no answer — a wrong company's directors are worse than none. */
export function pickCompaniesHouseCompany(items: Array<{ title?: string; company_number?: string; company_status?: string }>, businessName: string): string | null {
  const key = companyNameKey(businessName);
  if (!key) return null;
  const hits = (items ?? []).filter((c) => c.company_status === 'active' && companyNameKey(c.title ?? '') === key && c.company_number);
  return hits.length === 1 ? hits[0].company_number! : null;
}

/* ── The pipeline ───────────────────────────────────────────────────────────────────────────────── */

export async function discoverDecisionMaker(req: DiscoveryRequest, store: DiscoveryStore, io: DiscoveryIO): Promise<DiscoveryResponse> {
  const now = req.now ?? Date.now();
  const { lead, actor } = req;
  const country = discoveryCountry(lead.country);
  const town = lead.town?.trim() || null;
  const manualName = req.manualPerson?.name ? tidyPersonName(req.manualPerson.name) : null;
  const fingerprint = inputFingerprint({ businessName: lead.business_name, website: lead.website, town, country: lead.country, manualPerson: manualName, contactName: lead.contact_name });
  const businessLinks = manualLinkedInSearchLinks({ businessName: lead.business_name, town });

  // 1–3. held → in flight → cache
  const held = await store.loadHeld(lead.id);
  const latest = await store.latestRun(lead.id);
  const plan = planDiscovery({ held, latestRun: latest, fingerprint, now, mode: req.mode, force: req.force && actor.role === 'admin' });
  if (plan.action === 'return_held') return { ok: true, result: heldResult(lead, plan.held, town, country, now, businessLinks) };
  if (plan.action === 'return_cached') return { ok: true, result: { ...plan.run.result!, served_from: 'cache' } };
  if (plan.action === 'in_progress') return { ok: false, error: 'in_progress', detail: 'A LinkedIn lookup for this lead is already running.', manual_search: businessLinks };
  if (plan.action === 'nothing_cached') return { ok: true, result: null, note: 'nothing_cached' };

  // 4. free sources
  const sources: string[] = [];
  const found: DecisionMakerCandidate[] = [];
  const siteLinks: string[] = [];
  if (manualName) {
    const r = roleFromText(req.manualPerson?.role ?? '');
    found.push({ name: manualName, partial: !manualName.includes(' '), role: r?.role ?? null, roleLabel: r?.label ?? (req.manualPerson?.role?.trim() || null), evidence: [{ source: 'manual', url: null, quote: `Entered by a salesperson: ${manualName}` }], rank: 0 });
    sources.push('manual entry');
  }
  if (lead.contact_name?.trim()) {
    const name = tidyPersonName(lead.contact_name);
    if (name.length >= 2) {
      found.push({ name, partial: !name.includes(' '), role: null, roleLabel: 'Contact', evidence: [{ source: 'lead_contact', url: null, quote: `Contact name on the lead: ${name}` }], rank: 0 });
      sources.push('lead contact name');
    }
  }
  const home = lead.website && isFetchableWebsite(lead.website) ? (/^https?:\/\//i.test(lead.website) ? lead.website : `https://${lead.website}`) : null;
  if (home) {
    const first = await io.fetchPage(home);
    const pages: FetchedPage[] = first.ok ? [first] : [];
    if (first.ok) {
      const more = pickPeoplePages(first.body, first.finalUrl);
      for (const u of more) {
        const p = await io.fetchPage(u);
        if (p.ok && /html/i.test(p.contentType ?? 'text/html')) pages.push(p);
      }
    }
    for (const p of pages) {
      const nodes = jsonLdNodes(p.body);
      found.push(...extractPeopleFromText(pageTextWithBlocks(p.body), p.finalUrl, lead.business_name));
      found.push(...extractPeopleFromJsonLd(nodes, p.finalUrl, lead.business_name));
      siteLinks.push(...linkedInLinksOnPage(p.body, nodes));
    }
    sources.push(pages.length ? `website (${pages.length} page${pages.length === 1 ? '' : 's'})` : 'website (could not be read)');
  }
  if (country === 'UK' && io.companiesHouse) {
    try {
      const ch = await io.companiesHouse(lead.business_name);
      if (ch) found.push(...peopleFromCompaniesHouse(ch.officers, ch.companyUrl));
      sources.push(ch ? 'Companies House' : 'Companies House (no single matching company)');
    } catch { sources.push('Companies House (unavailable)'); }
  }

  const site = splitSiteLinkedIn(siteLinks);
  const companyPage = site.companies.length === 1 ? site.companies[0] : null;
  const identified = rankDecisionMakers(found);
  const base = {
    version: LINKEDIN_DISCOVERY_VERSION, lead_id: lead.id, company_name: lead.business_name,
    company_linkedin_url: companyPage, company_linkedin_confidence: companyPage ? 'confirmed' as const : null,
    location: { town, country }, sources_checked: sources, checked_at: new Date(now).toISOString(),
    manual_search: businessLinks,
  };

  // 5. nobody identified
  if (identified.status === 'none') {
    const result: LinkedInDiscoveryResult = {
      ...base, status: 'no_person', served_from: 'fresh', people: [], canonical_candidate: null,
      provider: null, provider_calls: 0, provider_cost_usd: 0, provider_cost_is_estimate: false, error: null,
    };
    await store.recordFreeRun({ leadId: lead.id, fingerprint, actorId: actor.id, status: 'no_person', result, expires_at: new Date(now + cacheTtlMs('no_person')).toISOString() });
    return { ok: true, result };
  }

  const ctxFor = (p: DecisionMakerCandidate): MatchContext => ({
    personName: p.name, personPartial: p.partial, personRole: p.role, businessName: lead.business_name,
    domain: domainKey(lead.website), town, country, companyLinkedInUrl: companyPage, siteLinkedProfiles: site.people,
  });

  // 6. own-site LinkedIn links — free CONFIRMED where the slug carries the person's name
  const people = identified.people;
  const linked = new Map<string, PersonLinkedIn>();
  for (const p of people) {
    const url = siteProfileFor(p.name, p.partial, site.people);
    if (!url) continue;
    const scored = scoreProfile(siteCandidate(url, p.name), ctxFor(p));
    if (scored && scored.confidence === 'confirmed') linked.set(p.name, fromResolve({ outcome: 'match', best: scored, alternatives: [] }));
  }
  const toSearch = people.filter((p) => !linked.has(p.name) && !p.partial).slice(0, MAX_SEARCHES_PER_RUN);
  const notSearched = (p: DecisionMakerCandidate, note: string): PersonLinkedIn => ({ status: 'not_searched', linkedin_url: null, confidence: null, confidence_reasons: [], cautions: [], candidates: [], note });

  if (!toSearch.length) {
    const results = people.map((p) => personResult(p, linked.get(p.name) ?? notSearched(p, p.partial ? 'Only a first name is known — search LinkedIn by hand.' : 'Not searched (search limit per lookup).'), lead.business_name, town));
    const { status, canonical } = summarise(results, true);
    const result: LinkedInDiscoveryResult = { ...base, status, served_from: 'fresh', people: results, canonical_candidate: canonical, provider: null, provider_calls: 0, provider_cost_usd: 0, provider_cost_is_estimate: false, error: null };
    await store.recordFreeRun({ leadId: lead.id, fingerprint, actorId: actor.id, status, result, expires_at: new Date(now + cacheTtlMs(status)).toISOString() });
    return { ok: true, result };
  }

  // 7. spend gate → claim → search
  const estimate = toSearch.length * LINKEDIN_SEARCH_EST_USD + (req.verify && actor.role === 'admin' ? LINKEDIN_VERIFY_EST_USD : 0);
  let snap: SpendSnapshot;
  try { snap = await store.spendSnapshot(actor.id); } catch { snap = { apify: null, spentLast24hUsd: null, userRunsLast24h: null }; }
  const gate = spendGate({ now, role: actor.role, apifySnapshot: snap.apify, spentLast24hUsd: snap.spentLast24hUsd, userRunsLast24h: snap.userRunsLast24h, estimateUsd: estimate });
  if ('reason' in gate) return { ok: false, error: gate.reason, detail: spendRefusalText(gate.reason, actor.role), manual_search: manualLinkedInSearchLinks({ personName: people[0]?.name, businessName: lead.business_name, town }) };

  if (store.guard) {
    const refused = await store.guard();
    if (refused) return { ok: false, error: 'usage_paused', detail: refused, manual_search: manualLinkedInSearchLinks({ personName: people[0]?.name, businessName: lead.business_name, town }) };
  }

  const claim = await store.claimRun({ leadId: lead.id, fingerprint, actorId: actor.id });
  if ('reason' in claim) {
    return claim.reason === 'in_progress'
      ? { ok: false, error: 'in_progress', detail: 'A LinkedIn lookup for this lead is already running.', manual_search: businessLinks }
      : { ok: false, error: 'store_error', detail: 'Could not start the lookup — try again.', manual_search: businessLinks };
  }

  let calls = 0;
  let cost = 0;
  let estimated = false;
  const errors: string[] = [];
  const companyHits: string[] = [];
  const bill = async (actorName: string, res: { costUsd: number | null }, est: number) => {
    calls++;
    const real = typeof res.costUsd === 'number' && Number.isFinite(res.costUsd);
    const c = real ? res.costUsd! : est;
    if (!real) estimated = true;
    cost += c;
    await store.logCost({ actorId: actor.id, leadId: lead.id, runId: claim.runId, actor: actorName, costUsd: c, isEstimate: !real });
  };

  for (const p of toSearch) {
    try {
      const input = buildSearchInput(buildSearchQuery({ personName: p.name, businessName: lead.business_name, town }), country);
      const res = await io.runActor(LINKEDIN_SEARCH_ACTOR, input);
      await bill(LINKEDIN_SEARCH_ACTOR, res, LINKEDIN_SEARCH_EST_USD);
      const parsed = parseSearchItems(res.items as never[]);
      for (const c of parsed.companyPages) if (companyMatches(c.name, lead.business_name, domainKey(lead.website))) companyHits.push(c.url);
      const candidates: ProfileCandidate[] = [...parsed.profiles];
      for (const u of site.people) if (!candidates.some((c) => c.url === u)) candidates.push(siteCandidate(u, null));
      const scored = candidates.map((c) => scoreProfile(c, ctxFor(p))).filter((s): s is ScoredProfile => !!s);
      linked.set(p.name, fromResolve(resolveProfiles(scored)));
    } catch (e) {
      errors.push(e instanceof Error ? e.message.slice(0, 200) : String(e).slice(0, 200));
      linked.set(p.name, { status: 'none', linkedin_url: null, confidence: null, confidence_reasons: [], cautions: [], candidates: [], note: 'The LinkedIn search failed — try again later or search by hand.' });
    }
  }

  // optional verify: admin asked, exactly one LIKELY across people → one profile scrape, rescore
  if (req.verify && actor.role === 'admin') {
    const likely = [...linked.entries()].filter(([, l]) => l.status === 'match' && l.confidence === 'likely');
    if (likely.length === 1) {
      const [name, l] = likely[0];
      const person = people.find((p) => p.name === name)!;
      try {
        const res = await io.runActor(LINKEDIN_VERIFY_ACTOR, buildVerifyInput(l.linkedin_url!));
        await bill(LINKEDIN_VERIFY_ACTOR, res, LINKEDIN_VERIFY_EST_USD);
        const v = (res.items as unknown[]).map(mapVerifiedProfile).find((x) => x && x.url === l.linkedin_url);
        if (v) {
          const s = scoreProfile(v, ctxFor(person));
          const others = l.candidates.filter((c) => c.url !== l.linkedin_url);
          linked.set(name, fromResolve(resolveProfiles(s ? [s, ...others] : others)));
        }
      } catch (e) { errors.push(`verify: ${e instanceof Error ? e.message.slice(0, 160) : String(e)}`); }
    }
  }

  const results: DecisionMakerResult[] = people.map((p) => personResult(p, linked.get(p.name) ?? notSearched(p, p.partial ? 'Only a first name is known — search LinkedIn by hand.' : 'Not searched (search limit per lookup).'), lead.business_name, town));
  const allFailed = errors.length >= toSearch.length && !results.some((r) => r.linkedin.status === 'match' || r.linkedin.status === 'review');
  const sum = summarise(results, true);
  const status: DiscoveryStatus = allFailed ? 'error' : sum.status;
  const uniqueCompany = [...new Set(companyHits)];
  const result: LinkedInDiscoveryResult = {
    ...base,
    company_linkedin_url: base.company_linkedin_url ?? (uniqueCompany.length === 1 ? uniqueCompany[0] : null),
    company_linkedin_confidence: base.company_linkedin_confidence ?? (uniqueCompany.length === 1 ? 'likely' : null),
    status, served_from: 'fresh', people: results, canonical_candidate: allFailed ? null : sum.canonical,
    provider: `apify:${LINKEDIN_SEARCH_ACTOR}`, provider_calls: calls, provider_cost_usd: Number(cost.toFixed(6)), provider_cost_is_estimate: estimated,
    error: errors.length ? errors.join(' ; ') : null,
  };
  await store.finishRun(claim.runId, {
    status, result, cost_usd: result.provider_cost_usd, cost_is_estimate: estimated, provider_calls: calls,
    expires_at: new Date(now + cacheTtlMs(status)).toISOString(), error: result.error ?? null,
  });
  return { ok: true, result };
}

/** A profile known only by its URL (linked from the business's site): the name comes from its slug. */
function siteCandidate(url: string, personName: string | null): ProfileCandidate {
  const fromSlug = nameFromSlug(canonicalLinkedInUrl(url)?.slug ?? '');
  return {
    url, name: personName ?? (fromSlug || null), headline: null, currentCompany: null, pastCompanies: [], location: null,
    websites: [], currentCompanyLinkedInUrl: null, text: '', origin: 'website_link',
  };
}

function fromResolve(r: ReturnType<typeof resolveProfiles>): PersonLinkedIn {
  if (r.outcome === 'match') {
    return { status: 'match', linkedin_url: r.best.url, confidence: r.best.confidence, confidence_reasons: r.best.reasons, cautions: r.best.cautions, candidates: r.alternatives, note: null };
  }
  if (r.outcome === 'review') return { status: 'review', linkedin_url: null, confidence: null, confidence_reasons: [], cautions: [], candidates: r.candidates, note: r.reason };
  return { status: 'none', linkedin_url: null, confidence: null, confidence_reasons: [], cautions: [], candidates: [], note: r.reason };
}

function heldResult(lead: DiscoveryLead, held: HeldLinkedIn[], town: string | null, country: ReturnType<typeof discoveryCountry>, now: number, links: { linkedin: string; google: string }): LinkedInDiscoveryResult {
  const people: DecisionMakerResult[] = held.map((h) => ({
    person_name: h.personName ?? '', person_partial: false, role: null, role_label: null,
    person_evidence: [{ source: 'manual', url: h.url, quote: 'Confirmed by a person in LeadFinderOS' }],
    linkedin: { status: 'match', linkedin_url: h.url, confidence: 'confirmed', confidence_reasons: ['Confirmed by a person'], cautions: [], candidates: [], note: null },
    manual_search: manualLinkedInSearchLinks({ personName: h.personName, businessName: lead.business_name, town }),
  }));
  const one = people.length === 1 ? people[0] : null;
  return {
    version: LINKEDIN_DISCOVERY_VERSION, lead_id: lead.id, status: 'held', served_from: 'held', people,
    canonical_candidate: one ? { person_name: one.person_name, role_label: null, linkedin_url: one.linkedin.linkedin_url!, confidence: 'confirmed' } : null,
    company_name: lead.business_name, company_linkedin_url: null, company_linkedin_confidence: null,
    location: { town, country }, sources_checked: ['held profile'], checked_at: new Date(now).toISOString(),
    provider: null, provider_calls: 0, provider_cost_usd: 0, provider_cost_is_estimate: false, manual_search: links, error: null,
  };
}
