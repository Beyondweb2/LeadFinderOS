/* ════════════════════════════════════════════════════════════════════════════════════════════════
   TEMPLATE MAPPING — Phase 3: recon + approved client data + a template → a build-ready config.

   computeMapping() is the one entry point. Pure, trade-agnostic: it reads only what a template
   DECLARES (fields, service catalogue, asset slots, location policy — websiteTemplates.ts) plus the
   fact ledger, the recon candidates and Paul's mapping decisions. Faithful / Bespoke builds map
   against CORE_BUILD_MODEL (no catalogue, core fields, core slots).

   ⛔ PRIORITY — a lower-confidence source never replaces a higher one:
        1 a VERIFIED client fact (onboarding / Paul)      4 a source value NEEDING APPROVAL
        2 a recon fact Paul approved                      5 missing
        3 a low-risk source fact auto-accepted from the site
      The fact ledger holds one value per key and the recon merge never overwrites a verified row,
      so the rank here is a LABEL of where the value came from — never a second resolution.
   ⛔ ONLY `ready` VALUES REACH THE CONFIG. Needs-approval and missing values are listed as omitted,
      never written. Optional proof that is absent is omitted; required data that is absent blocks.
   ⛔ SERVICES ARE NEVER FABRICATED. A catalogue service is proposed only when a verified service or
      a source candidate names it; the rest stay "not found" unless Paul ticks them himself.
   ⛔ A TOWN SERVED IS NOT A TOWN PAGE. Dedicated pages default OFF except the template's base page.
   ⛔ ONLY USE ASSETS ARE PUBLISHED. An assigned asset still marked REVIEW / IGNORE stays out of the config.
   ⛔ SEED VALUES BLOCK. The template's forbiddenSeedValues are scanned in the generated config.
   ⚠️ Browser + prompt module (not edge-reachable). Never a backtick inside a template literal (§3).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import type { ManifestAsset, PageFamily, ReconCandidate, WebsiteBuildState } from './websiteBuildState.ts';
import { PAGE_FAMILY_LABELS } from './websiteBuildState.ts';
import type { ForbiddenSeedValue, TemplateAssetSlot, TemplateField, TemplateService, WebsiteTemplate } from './websiteTemplates.ts';
import { CORE_BUILD_MODEL, seedValueIn } from './websiteTemplates.ts';
import type { FactRow } from './buildFacts.ts';
import { checkArchitecture, pathKey, toPath } from './buildArchitecture.ts';

export type MapStatus = 'ready' | 'needs_approval' | 'missing' | 'omitted';
export const MAP_STATUS_LABELS: Record<MapStatus, string> = { ready: 'Ready', needs_approval: 'Needs approval', missing: 'Missing', omitted: 'Left out' };

export interface MappedField {
  field: TemplateField;
  value: string;
  /** Plain-English origin: "verified client fact", "source website", "your choice"… */
  source: string;
  /** 1–5, see the header. */
  rank: 1 | 2 | 3 | 4 | 5;
  status: MapStatus;
  required: boolean;
  /** The ledger row it reads, when it reads one. */
  factKey: string;
}

const LIST_FACTS = new Set(['service_areas', 'services', 'accreditations', 'brands', 'review_profiles', 'directory_profiles', 'social_profiles', 'prices', 'guarantee', 'insurance', 'memberships', 'qualifications', 'payment_methods', 'analytics_ids', 'ads_ids']);
const split = (v: string) => v.split(/\s*[,;|]\s*/).map((x) => x.trim()).filter(Boolean);
const norm = (v: string) => v.toLowerCase().normalize('NFKD').replace(/[^a-z0-9]+/g, ' ').trim();

function sourceOf(r: FactRow): { source: string; rank: 1 | 2 | 3 } {
  const fromRecon = /source site \(recon\)/.test(r.source);
  if (r.basis === 'source_site') return { source: 'source website (low-risk, auto-accepted)', rank: 3 };
  if (r.basis === 'operator') return fromRecon ? { source: 'recon fact you approved', rank: 2 } : { source: 'approved by you', rank: 1 };
  if (r.basis === 'client') return { source: 'verified client fact (onboarding)', rank: 1 };
  return { source: 'verified client fact', rank: 1 };
}

function mapOne(f: TemplateField, rows: Map<string, FactRow>, s: WebsiteBuildState): Omit<MappedField, 'required'> {
  if ('project' in f.source) {
    const v = s.canonical_domain;
    return { field: f, value: v, source: v ? 'project details' : '', rank: v ? 1 : 5, status: v ? 'ready' : 'missing', factKey: '' };
  }
  if ('choice' in f.source) {
    const v = s.mapping.fields[f.id] ?? '';
    const okV = (f.source.choice as readonly string[]).includes(v);
    return { field: f, value: okV ? v : '', source: okV ? 'your choice' : '', rank: okV ? 1 : 5, status: okV ? 'ready' : 'missing', factKey: '' };
  }
  const key = f.source.fact;
  const r = rows.get(key);
  if (!r || r.status === 'missing' || !r.value) return { field: f, value: '', source: '', rank: 5, status: 'missing', factKey: key };
  if (r.status === 'rejected' || r.status === 'not_applicable') return { field: f, value: '', source: r.status === 'rejected' ? 'you rejected it' : 'you marked it N/A', rank: 5, status: 'omitted', factKey: key };
  if (r.status === 'detected') return { field: f, value: r.value, source: /recon/.test(r.source) ? 'source website — needs approval' : (r.source || 'records') + ' — needs approval', rank: 4, status: 'needs_approval', factKey: key };
  const o = sourceOf(r);
  return { field: f, value: r.value, source: o.source, rank: o.rank, status: 'ready', factKey: key };
}

/** Every declared field, mapped. Conditional fields are resolved against the others' values. */
export function mapFields(fields: readonly TemplateField[], rows: FactRow[], s: WebsiteBuildState): MappedField[] {
  const byKey = new Map(rows.map((r) => [r.key, r]));
  const first = fields.map((f) => mapOne(f, byKey, s));
  const readyValue = (id: string) => { const m = first.find((x) => x.field.id === id); return m && m.status === 'ready' ? m.value : ''; };
  return first.map((m) => {
    const f = m.field;
    const required = f.requirement === 'required' || (f.requirement === 'conditional' && !!f.requiredWhen && (() => {
      const v = readyValue(f.requiredWhen!.field);
      return f.requiredWhen!.values ? f.requiredWhen!.values.includes(v) : !!v;
    })());
    return { ...m, required };
  });
}

/* ── SERVICES ─────────────────────────────────────────────────────────────────────────────────── */

export type MatchConfidence = 'high' | 'medium' | 'none';
export interface ServiceCandidate extends ReconCandidate { origin: 'verified' | 'source' }
export interface CandidateMatch { candidate: ServiceCandidate; serviceId: string; confidence: MatchConfidence; byOperator: boolean }
export type ServiceStatus = 'ready' | 'preselected' | 'needs_review' | 'not_found' | 'excluded';
export const SERVICE_STATUS_LABELS: Record<ServiceStatus, string> = {
  ready: 'Included', preselected: 'Pre-selected from the source site', needs_review: 'Needs review', not_found: 'Not found', excluded: 'Left out',
};
export interface MappedService {
  service: TemplateService;
  matches: CandidateMatch[];
  confidence: MatchConfidence;
  include: boolean;
  decided: boolean;
  status: ServiceStatus;
}

/** Score one candidate against one service: the longest synonym wins, a multi-word synonym or the
 *  service's own name found in the NAME is high, a single word or a URL-only hit is medium. */
export function scoreService(c: { name: string; source_url: string }, svc: TemplateService): { score: number; confidence: MatchConfidence } {
  const name = ' ' + norm(c.name) + ' ';
  const url = ' ' + norm(c.source_url.replace(/^https?:\/\/[^/]+/i, '')) + ' ';
  let best = { score: 0, confidence: 'none' as MatchConfidence };
  for (const syn of [svc.name, ...svc.synonyms]) {
    const p = ' ' + norm(syn) + ' ';
    if (p.trim().length < 3) continue;
    const words = p.trim().split(' ').length;
    const inName = name.includes(p), inUrl = url.includes(p);
    if (!inName && !inUrl) continue;
    const high = inName && (words >= 2 || norm(syn) === norm(c.name) || syn === svc.name);
    const score = p.length + (inName ? 10 : 0) + (high ? 20 : 0);
    if (score > best.score) best = { score, confidence: high ? 'high' : 'medium' };
  }
  return best;
}

export function serviceCandidates(rows: FactRow[], s: WebsiteBuildState): ServiceCandidate[] {
  const out = new Map<string, ServiceCandidate>();
  const r = rows.find((x) => x.key === 'services');
  if (r && r.status === 'verified') for (const v of split(r.value)) out.set(v.toLowerCase(), { name: v, source_url: '', context: 'verified client fact', origin: 'verified' });
  for (const c of s.recon.services) if (!out.has(c.name.toLowerCase())) out.set(c.name.toLowerCase(), { ...c, origin: 'source' });
  if (r && r.status === 'detected') for (const v of split(r.value)) if (!out.has(v.toLowerCase())) out.set(v.toLowerCase(), { name: v, source_url: r.source_url, context: 'needs approval in the fact ledger', origin: 'source' });
  return [...out.values()];
}

export function mapServices(catalogue: readonly TemplateService[], rows: FactRow[], s: WebsiteBuildState): { services: MappedService[]; unmapped: CandidateMatch[] } {
  const cands = serviceCandidates(rows, s);
  const matches: CandidateMatch[] = cands.map((c) => {
    const forced = s.mapping.candidate_map[c.name.toLowerCase()];
    if (forced) return { candidate: c, serviceId: forced === 'ignore' ? 'ignore' : (catalogue.some((x) => x.id === forced) ? forced : ''), confidence: forced === 'ignore' ? 'none' : 'high', byOperator: true };
    let best = { id: '', score: 0, confidence: 'none' as MatchConfidence };
    for (const svc of catalogue) { const sc = scoreService(c, svc); if (sc.score > best.score) best = { id: svc.id, score: sc.score, confidence: sc.confidence }; }
    return { candidate: c, serviceId: best.id, confidence: best.confidence, byOperator: false };
  });
  const services = catalogue.map((svc): MappedService => {
    const m = matches.filter((x) => x.serviceId === svc.id);
    const verified = m.some((x) => x.candidate.origin === 'verified' || x.byOperator);
    const confidence: MatchConfidence = m.some((x) => x.confidence === 'high') ? 'high' : m.length ? 'medium' : 'none';
    const decided = typeof s.mapping.services[svc.id] === 'boolean';
    const include = decided ? s.mapping.services[svc.id] : (verified || confidence === 'high');
    const status: ServiceStatus = decided ? (include ? 'ready' : 'excluded')
      : verified ? 'ready' : confidence === 'high' ? 'preselected' : confidence === 'medium' ? 'needs_review' : 'not_found';
    return { service: svc, matches: m, confidence, include, decided, status };
  });
  return { services, unmapped: matches.filter((x) => !x.serviceId) };
}

/* ── LOCATIONS ────────────────────────────────────────────────────────────────────────────────── */

export interface MappedTown {
  key: string; name: string; isBase: boolean; origin: 'verified' | 'source';
  serves: boolean; page: boolean; servesDecided: boolean; pageDecided: boolean;
  status: 'ready' | 'needs_review'; evidence: string;
}
export const townKey = (n: string) => norm(n);

export function mapLocations(t: WebsiteTemplate | null, rows: FactRow[], s: WebsiteBuildState): MappedTown[] {
  const base = rows.find((r) => r.key === 'primary_town');
  const areas = rows.find((r) => r.key === 'service_areas');
  const list = new Map<string, Omit<MappedTown, 'serves' | 'page' | 'servesDecided' | 'pageDecided' | 'status'>>();
  const add = (name: string, origin: 'verified' | 'source', isBase: boolean, evidence: string) => {
    const k = townKey(name);
    if (!k) return;
    const prev = list.get(k);
    if (prev) { list.set(k, { ...prev, isBase: prev.isBase || isBase, origin: prev.origin === 'verified' || origin === 'verified' ? 'verified' : 'source' }); return; }
    list.set(k, { key: k, name: name.trim(), isBase, origin, evidence });
  };
  if (base && base.value && base.status !== 'rejected' && base.status !== 'not_applicable') add(base.value, base.status === 'verified' ? 'verified' : 'source', true, base.status === 'verified' ? 'base location (verified)' : 'base location — needs approval');
  if (areas && areas.value && areas.status !== 'rejected' && areas.status !== 'not_applicable') for (const a of split(areas.value)) add(a, areas.status === 'verified' ? 'verified' : 'source', false, areas.status === 'verified' ? 'verified service area' : 'service area — needs approval');
  for (const c of s.recon.towns) add(c.name, 'source', false, 'source site: ' + (c.context || 'mentioned'));
  const primaryPage = !!t?.locations.primaryLocationPage;
  return [...list.values()].map((x) => {
    const d = s.mapping.locations[x.key] ?? {};
    const servesDecided = typeof d.serves === 'boolean';
    const pageDecided = typeof d.page === 'boolean';
    const serves = servesDecided ? !!d.serves : x.origin === 'verified';
    /* ⛔ Default OFF — only the template's own base-location page starts on. */
    const page = serves && (pageDecided ? !!d.page : (x.isBase && primaryPage));
    return { ...x, serves, page, servesDecided, pageDecided, status: (servesDecided || x.origin === 'verified' ? 'ready' : 'needs_review') as MappedTown['status'] };
  }).sort((a, b) => Number(b.isBase) - Number(a.isBase) || Number(b.serves) - Number(a.serves) || a.name.localeCompare(b.name));
}

/* ── ASSETS ───────────────────────────────────────────────────────────────────────────────────── */

export interface SlotState { slot: TemplateAssetSlot; assigned: ManifestAsset[]; suggestions: ManifestAsset[]; publishable: ManifestAsset[] }

function slotScore(a: ManifestAsset, slot: TemplateAssetSlot): number {
  const text = ' ' + norm([a.purpose, a.suggested_filename, a.source_url.replace(/^https?:\/\/[^/]+/i, '')].join(' ')) + ' ';
  let n = slot.suggest.types.includes(a.type) ? 2 : 0;
  for (const w of slot.suggest.words) if (text.includes(' ' + norm(w))) n += 3;
  return slot.suggest.types.includes(a.type) || n >= 3 ? n : 0;
}

export function mapAssets(slots: readonly TemplateAssetSlot[], s: WebsiteBuildState): SlotState[] {
  const assets = s.manifest.assets.filter((a) => a.approval !== 'rejected');
  const byUrl = new Map(s.manifest.assets.map((a) => [a.source_url, a]));
  return slots.map((slot) => {
    const assigned = (s.mapping.assets[slot.id] ?? []).map((u) => byUrl.get(u)).filter((a): a is ManifestAsset => !!a);
    const taken = new Set(assigned.map((a) => a.source_url));
    const suggestions = assets.map((a) => ({ a, n: slotScore(a, slot) })).filter((x) => x.n > 0 && !taken.has(x.a.source_url))
      .sort((x, y) => y.n - x.n).slice(0, slot.multiple ? 12 : 3).map((x) => x.a);
    return { slot, assigned, suggestions, publishable: assigned.filter((a) => a.approval === 'approved') };
  });
}

/** Fill EMPTY slots with their best USE suggestion (gallery-type slots: every USE suggestion not
 *  already used elsewhere). Runs only when Paul presses the button; never assigns REVIEW / IGNORE. */
export function autoAssign(slots: readonly TemplateAssetSlot[], s: WebsiteBuildState): WebsiteBuildState['mapping']['assets'] {
  const next = { ...s.mapping.assets };
  const used = new Set(Object.values(next).flat());
  for (const st of mapAssets(slots, s)) {
    if ((next[st.slot.id] ?? []).length) continue;
    const pick = st.suggestions.filter((a) => a.approval === 'approved' && !used.has(a.source_url));
    const chosen = st.slot.multiple ? pick : pick.slice(0, 1);
    if (chosen.length) { next[st.slot.id] = chosen.map((a) => a.source_url); chosen.forEach((a) => used.add(a.source_url)); }
  }
  return next;
}

/* ── CONFIG, GUARD, READINESS ─────────────────────────────────────────────────────────────────── */

export interface ClientConfig {
  business: Record<string, unknown>; services: Array<{ id: string; name: string; evidence: string[] }>;
  locations: Record<string, unknown>; proof: Record<string, unknown>; pricing: Record<string, unknown>;
  assets: Record<string, Array<{ source: string; file: string }>>; tracking: Record<string, unknown>;
}

function setPath(o: Record<string, unknown>, path: string, v: unknown) {
  const [head, ...rest] = path.split('.');
  if (!rest.length) { o[head] = v; return; }
  const child = (o[head] && typeof o[head] === 'object' ? o[head] : (o[head] = {})) as Record<string, unknown>;
  setPath(child, rest.join('.'), v);
}

export function buildClientConfig(fields: MappedField[], services: MappedService[], towns: MappedTown[], slots: SlotState[]): { config: ClientConfig; omitted: string[] } {
  const root: Record<string, unknown> = { business: {}, services: [], locations: {}, proof: {}, pricing: {}, assets: {}, tracking: {} };
  const omitted: string[] = [];
  for (const m of fields) {
    if (m.status !== 'ready') { if (m.value || m.required || m.status === 'omitted') omitted.push(m.field.label + ' — ' + MAP_STATUS_LABELS[m.status].toLowerCase()); continue; }
    setPath(root, m.field.configPath, LIST_FACTS.has(m.factKey) ? split(m.value) : m.value);
  }
  root.services = services.filter((x) => x.include).map((x) => ({ id: x.service.id, name: x.service.name, evidence: x.matches.map((m) => m.candidate.name) }));
  const loc = root.locations as Record<string, unknown>;
  loc.served = towns.filter((t) => t.serves).map((t) => t.name);
  loc.pages = towns.filter((t) => t.serves && t.page).map((t) => t.name);
  for (const t of towns) if (!t.serves && t.status === 'needs_review') omitted.push('Area "' + t.name + '" — not confirmed as served');
  const assets = root.assets as ClientConfig['assets'];
  for (const st of slots) {
    if (st.publishable.length) assets[st.slot.id] = st.publishable.map((a) => ({ source: a.source_url, file: a.location || a.suggested_filename || '' }));
    const held = st.assigned.length - st.publishable.length;
    if (held > 0) omitted.push(st.slot.label + ' — ' + held + ' assigned asset(s) not marked USE');
  }
  return { config: root as unknown as ClientConfig, omitted };
}

export interface SeedHit { value: ForbiddenSeedValue; blocking: boolean }
export interface SeedGuard { hits: SeedHit[]; skipped: string }
const IDENTITY_KINDS = new Set(['business_name', 'owner', 'phone', 'email', 'domain', 'address', 'image']);

/**
 * Scan any text (the generated config now; the built site later) for the template's seed values.
 * Identity values (name, owner, phone, email, domain, address, image ids) always BLOCK. Towns,
 * credentials, profiles and brands block unless the client has the same value VERIFIED by the
 * client or Paul (never merely auto-accepted from a site). Trade words and claims warn.
 * The seed client's own build (its name is the template's seed name) skips the guard, and says so.
 */
export function scanSeedValues(text: string, t: WebsiteTemplate | null, rows: FactRow[], businessName: string): SeedGuard {
  if (!t || !t.forbiddenSeedValues.length) return { hits: [], skipped: '' };
  const seedNames = t.forbiddenSeedValues.filter((v) => v.kind === 'business_name').map((v) => norm(v.value).replace(/ /g, ''));
  const me = norm(businessName).replace(/ /g, '');
  if (me && seedNames.some((n) => n && (me.startsWith(n) || n.startsWith(me)))) return { hits: [], skipped: 'This client is the template’s seed client (' + businessName + ') — its own values are expected.' };
  const confirmed = rows.filter((r) => r.status === 'verified' && r.basis !== 'source_site').map((r) => r.value).join(' | ');
  const hits: SeedHit[] = [];
  for (const v of t.forbiddenSeedValues) {
    if (!seedValueIn(text, v.value)) continue;
    const blocking = IDENTITY_KINDS.has(v.kind) ? true : v.kind === 'trade_word' || v.kind === 'claim' ? false : !seedValueIn(confirmed, v.value);
    hits.push({ value: v, blocking });
  }
  return { hits, skipped: '' };
}

export interface Readiness {
  ready: number; needsApproval: number; missingRequired: number; optionalMissing: number;
  blockers: string[]; notes: string[]; ok: boolean;
}

export interface Mapping {
  isTemplate: boolean;
  fields: MappedField[];
  services: MappedService[];
  unmapped: CandidateMatch[];
  towns: MappedTown[];
  slots: SlotState[];
  config: ClientConfig;
  omitted: string[];
  guard: SeedGuard;
  readiness: Readiness;
}

/** The whole mapping for one build. `template` null (or a non-template route) → the core model. */
export function computeMapping(s: WebsiteBuildState, template: WebsiteTemplate | null, rows: FactRow[], businessName: string): Mapping {
  const t = s.route === 'template_rebuild' ? template : null;
  const model = t ?? CORE_BUILD_MODEL;
  const fields = mapFields(model.fields, rows, s);
  const { services, unmapped } = t ? mapServices(t.serviceCatalogue, rows, s) : { services: [], unmapped: [] };
  const towns = t ? mapLocations(t, rows, s) : [];
  const slots = mapAssets(model.assetSlots, s);
  const { config, omitted } = buildClientConfig(fields, services, towns, slots);
  const guard = scanSeedValues(JSON.stringify(config), t, rows, businessName);

  const blockers: string[] = [];
  const notes: string[] = [];
  let ready = 0, needsApproval = 0, missingRequired = 0, optionalMissing = 0;
  for (const m of fields) {
    if (m.status === 'ready') ready++;
    else if (m.status === 'needs_approval') { needsApproval++; if (m.required) blockers.push(m.field.label + ' needs approval (required)'); else notes.push(m.field.label + ' is left out until approved'); }
    else if (m.required) { missingRequired++; blockers.push(m.field.label + ' is missing (required)'); }
    else if (m.status === 'missing') optionalMissing++;
  }
  if (t) {
    const included = services.filter((x) => x.include).length;
    ready += included;
    needsApproval += services.filter((x) => x.status === 'needs_review').length + towns.filter((x) => x.status === 'needs_review').length + unmapped.filter((x) => !x.byOperator).length;
    if (included < t.minServices) { missingRequired++; blockers.push('At least ' + t.minServices + ' service must be included'); }
    if (!towns.some((x) => x.isBase && x.serves)) notes.push('No base location confirmed as served');
  }
  for (const st of slots) {
    if (st.publishable.length) ready++;
    else if (st.slot.requirement === 'required') { missingRequired++; blockers.push(st.slot.label + ' asset is missing (required) — assign a USE asset'); }
    else optionalMissing++;
  }
  for (const h of guard.hits) (h.blocking ? blockers : notes).push('Seed-client value "' + h.value.value + '" (' + h.value.kind.replace('_', ' ') + ') appears in the config' + (h.blocking ? '' : ' — check it is really this client’s'));
  return { isTemplate: !!t, fields, services, unmapped, towns, slots, config, omitted, guard,
    readiness: { ready, needsApproval, missingRequired, optionalMissing, blockers, notes, ok: blockers.length === 0 } };
}

/* ── OLD URL → NEW PAGE PLAN ──────────────────────────────────────────────────────────────────── */

export type UrlDecision = 'kept' | 'redirected' | 'retired' | 'unresolved';
export const URL_DECISION_LABELS: Record<UrlDecision, string> = { kept: 'Kept', redirected: 'Redirected', retired: 'Retired', unresolved: 'Unresolved' };
export interface UrlRow { url: string; path: string; family: PageFamily; decision: UrlDecision; target: string; flags: string[] }

/** Every old URL (the recon manifest + old URLs in the page plan) against the plan and the redirect
 *  map. Read-only: it never writes a redirect. */
export function urlDecisions(s: WebsiteBuildState): { rows: UrlRow[]; counts: Record<UrlDecision, number>; issues: string[] } {
  const redirects = new Map(s.redirects.map((r) => [pathKey(r.from), r]));
  const planByOld = new Map(s.pages.filter((p) => p.old_url).map((p) => [pathKey(p.old_url), p]));
  const livePaths = new Map(s.pages.filter((p) => (p.action === 'keep' || p.action === 'create') && p.path).map((p) => [pathKey(p.path), p]));
  const sources = new Map<string, { url: string; family: PageFamily }>();
  for (const p of s.manifest.pages) sources.set(pathKey(p.url), { url: p.url, family: p.type });
  for (const p of s.pages) if (p.old_url && !sources.has(pathKey(p.old_url))) sources.set(pathKey(p.old_url), { url: p.old_url, family: p.family });
  const rows: UrlRow[] = [];
  for (const [key, src] of sources) {
    const flags: string[] = [];
    const red = redirects.get(key);
    const plan = planByOld.get(key);
    let decision: UrlDecision = 'unresolved', target = '';
    if (red) { decision = 'redirected'; target = red.to; }
    else if (plan && (plan.action === 'keep' || plan.action === 'create')) { decision = 'kept'; target = plan.path || toPath(src.url); }
    else if (plan && (plan.action === 'redirect' || plan.action === 'consolidate')) {
      if (plan.target) { decision = 'redirected'; target = plan.target; flags.push('planned in the page plan — not in the redirect map yet'); }
      else flags.push('redirect / consolidate with no destination');
    } else if (plan && plan.action === 'remove') { decision = 'retired'; flags.push('no redirect — this URL will return "not found"'); }
    else if (livePaths.has(key)) { decision = 'kept'; target = toPath(src.url); }
    else flags.push(plan ? 'still undecided in the page plan' : 'no decision');
    if (decision === 'redirected' && target) {
      const tk = pathKey(target);
      if (tk === '/' && src.family !== 'homepage') flags.push('redirects to the homepage');
      const tPage = livePaths.get(tk);
      if (!tPage && !/^https?:\/\//i.test(target)) flags.push('destination is not a kept / created page in the plan');
      if (tPage && src.family !== 'other' && tPage.family !== src.family && ['legal', 'contact', 'faq'].includes(tPage.family) && !['legal', 'contact', 'faq'].includes(src.family))
        flags.push('goes to an unrelated page (' + PAGE_FAMILY_LABELS[src.family] + ' → ' + PAGE_FAMILY_LABELS[tPage.family] + ')');
      if (redirects.has(tk)) flags.push('destination is itself redirected (chain)');
    }
    rows.push({ url: src.url, path: toPath(src.url), family: src.family, decision, target, flags });
  }
  /* Many old pages into one ordinary page is suspicious (an index or the homepage is expected to take several). */
  const into = new Map<string, number>();
  for (const r of rows) if (r.decision === 'redirected') into.set(pathKey(r.target), (into.get(pathKey(r.target)) ?? 0) + 1);
  for (const r of rows) {
    const n = into.get(pathKey(r.target)) ?? 0;
    const tPage = livePaths.get(pathKey(r.target));
    if (r.decision === 'redirected' && n >= 3 && !(tPage && ['homepage', 'services_index', 'locations_index'].includes(tPage.family)) && pathKey(r.target) !== '/')
      r.flags.push(n + ' old URLs go to this same page — check each belongs there');
  }
  const order: Record<UrlDecision, number> = { unresolved: 0, retired: 1, redirected: 2, kept: 3 };
  rows.sort((a, b) => order[a.decision] - order[b.decision] || b.flags.length - a.flags.length || a.path.localeCompare(b.path));
  const counts = { kept: 0, redirected: 0, retired: 0, unresolved: 0 } as Record<UrlDecision, number>;
  for (const r of rows) counts[r.decision]++;
  const issues = checkArchitecture(s.pages, s.redirects).filter((i) => i.level === 'error' && /loop|chain|itself|twice|AND redirected/i.test(i.message)).map((i) => i.message);
  return { rows, counts, issues };
}
