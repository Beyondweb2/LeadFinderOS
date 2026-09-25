/* ════════════════════════════════════════════════════════════════════════════════════════════════
   WEBSITE BUILD — the operator's saved workflow state for one paid client
   (outreach_leads.website_build, jsonb, operator-only — never rendered into a client document).

   ONE MODULE OWNS THE SHAPE ON BOTH SIDES. The browser reads a row through parseWebsiteBuild; the
   paid-client-hub edge function writes a row through normaliseWebsiteBuild. They are the same rule
   (an allowlist of keys, enumerated tokens, capped lengths), so a key the browser can show is a key
   the server will keep, and nothing else survives a save.

   VERSIONED (2026-09-25). A saved row carries `version: 2`. A row without it is the V1 shape
   (2026-09-22/23) and is read through the V1 → V2 rules in parseWebsiteBuild:
     · build_mode 'template' → route 'template_rebuild'; build_mode 'rebuild' → route
       'faithful_rebuild' (with its rebuild_style kept). That is the operator's OWN V1 choice under
       its V2 name, not an inference — an absent build_mode stays an absent route.
     · deploy_status 'preview' / 'production' → preview_status / production_status 'deployed'.
   The next save writes V2. No database migration: the column is jsonb and the default '{}' reads
   as an empty V2 state.

   ⛔ NOTHING HERE IS A PROMPT. Prompts and commands are generated at click time from this state plus
   a fresh read of the client's records (buildPack.ts, stagePrompts.ts). Storing text would freeze it.
   ⛔ PROGRESS IS DERIVED, NEVER STORED. websiteBuildStages() reads the state and says how far along
   the build is; there is no status column to fall out of step with the data (CLAUDE.md §6).
   ⛔ THE ROUTE IS NEVER INFERRED AFTER THE FACT. Only the operator's click sets `route`.

   ⚠️ Edge-reachable: relative imports with an explicit .ts only.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import { ALL_ROUTE_CHECK_IDS } from './buildRoutes.ts';

export const WEBSITE_BUILD_VERSION = 2;

export const BUILD_ROUTES = ['faithful_rebuild', 'template_rebuild', 'bespoke'] as const;
export type BuildRoute = (typeof BUILD_ROUTES)[number];
export const BUILD_ROUTE_LABELS: Record<BuildRoute, string> = {
  faithful_rebuild: 'Faithful rebuild',
  template_rebuild: 'Template rebuild',
  bespoke: 'Bespoke / new trade',
};

/** The fidelity of a faithful rebuild. (V1's "rebuild style" — same tokens, so V1 rows keep theirs.) */
export const REBUILD_STYLES = ['replica', 'modernised', 'new_design'] as const;
export type RebuildStyle = (typeof REBUILD_STYLES)[number];
export const REBUILD_STYLE_LABELS: Record<RebuildStyle, string> = {
  replica: 'Close visual replica',
  modernised: 'Modernised version using the existing brand',
  new_design: 'New design using the existing business content',
};

export const COPY_OWNERSHIPS = ['client_wrote', 'client_permission', 'previous_developer', 'unknown'] as const;
export type CopyOwnership = (typeof COPY_OWNERSHIPS)[number];
export const COPY_OWNERSHIP_LABELS: Record<CopyOwnership, string> = {
  client_wrote: 'The client wrote / supplied it',
  client_permission: 'The client has confirmed ownership / permission',
  previous_developer: 'A previous developer wrote it',
  unknown: 'Unknown',
};
/** Only these two let the old site's marketing wording be kept. Positive match: absent = rewrite. */
export function mayPreserveCopy(o: CopyOwnership | ''): boolean {
  return o === 'client_wrote' || o === 'client_permission';
}

/** A stored fact decision. `missing` is never stored — it is what "no value anywhere" derives to.
 *  `detected` is shown as NEEDS APPROVAL (the V1 token is kept so V1 rows read unchanged). */
export const FACT_STATUSES = ['verified', 'detected', 'rejected', 'not_applicable'] as const;
export type StoredFactStatus = (typeof FACT_STATUSES)[number];
export type FactStatus = StoredFactStatus | 'missing';
export const FACT_STATUS_LABELS: Record<FactStatus, string> = {
  verified: 'Verified',
  detected: 'Needs approval',
  missing: 'Missing',
  rejected: 'Rejected',
  not_applicable: 'N/A',
};

export interface BuildFact {
  key: string;
  label: string;
  value: string;
  status: StoredFactStatus;
  source: string;
  /** Where the value was seen — a URL or a short context ("onboarding call 24 Sep"). V2. */
  source_url: string;
  /** Operator notes on this fact. Never published. V2. */
  notes: string;
}

export const PAGE_FAMILIES = [
  'homepage', 'services_index', 'service', 'locations_index', 'location', 'commercial', 'pricing',
  'about', 'faq', 'gallery', 'contact', 'legal', 'other',
] as const;
export type PageFamily = (typeof PAGE_FAMILIES)[number];
export const PAGE_FAMILY_LABELS: Record<PageFamily, string> = {
  homepage: 'Homepage', services_index: 'Services index', service: 'Service detail',
  locations_index: 'Locations index', location: 'Location detail', commercial: 'Commercial',
  pricing: 'Pricing', about: 'About', faq: 'FAQ', gallery: 'Gallery', contact: 'Contact',
  legal: 'Legal', other: 'Other',
};

/** `undecided` is where a SEEDED row starts: a page nobody has decided on must not read as Keep. */
export const PAGE_ACTIONS = ['undecided', 'keep', 'create', 'consolidate', 'redirect', 'remove'] as const;
export type PageAction = (typeof PAGE_ACTIONS)[number];
export const PAGE_ACTION_LABELS: Record<PageAction, string> = {
  undecided: 'Decide…', keep: 'Keep', create: 'Create', consolidate: 'Consolidate', redirect: 'Redirect', remove: 'Remove',
};

export interface ArchPage {
  id: string;
  family: PageFamily;
  title: string;
  /** The page's path on the NEW site (for keep/create) — "/services/boiler-repair/". */
  path: string;
  action: PageAction;
  /** The old site's URL this row is about, when there is one. */
  old_url: string;
  /** Where a consolidated / redirected page's intent now lives. */
  target: string;
  notes: string;
}

export interface Redirect { from: string; to: string; reason: string }

export const CAPTURE_STATUSES = ['not_started', 'in_progress', 'captured'] as const;
export type CaptureStatus = (typeof CAPTURE_STATUSES)[number];
export const CAPTURE_STATUS_LABELS: Record<CaptureStatus, string> = {
  not_started: 'Not started', in_progress: 'In progress', captured: 'Captured',
};

/* ── V2 project status tokens ─────────────────────────────────────────────────────────────────── */

export const SITE_LIVE_STATES = ['unknown', 'yes', 'no'] as const;
export type SiteLiveState = (typeof SITE_LIVE_STATES)[number];
export const SITE_LIVE_LABELS: Record<SiteLiveState, string> = { unknown: 'Not checked', yes: 'Yes — still live', no: 'No — gone / offline' };

export const PREVIEW_STATUSES = ['not_deployed', 'deployed', 'needs_redeploy', 'failed'] as const;
export type PreviewStatus = (typeof PREVIEW_STATUSES)[number];
export const PREVIEW_STATUS_LABELS: Record<PreviewStatus, string> = {
  not_deployed: 'Not deployed', deployed: 'Deployed', needs_redeploy: 'Out of date — redeploy', failed: 'Deploy failed',
};

export const PRODUCTION_STATUSES = ['not_live', 'deployed', 'verified'] as const;
export type ProductionStatus = (typeof PRODUCTION_STATUSES)[number];
export const PRODUCTION_STATUS_LABELS: Record<ProductionStatus, string> = {
  not_live: 'Not live', deployed: 'Deployed', verified: 'Deployed and verified',
};

export const CUSTOM_DOMAIN_STATUSES = ['not_started', 'dns_pending', 'active', 'not_applicable'] as const;
export type CustomDomainStatus = (typeof CUSTOM_DOMAIN_STATUSES)[number];
export const CUSTOM_DOMAIN_STATUS_LABELS: Record<CustomDomainStatus, string> = {
  not_started: 'Not connected', dns_pending: 'Connected — DNS pending', active: 'Active', not_applicable: 'N/A',
};

export const WWW_REDIRECT_STATUSES = ['not_checked', 'working', 'broken', 'not_applicable'] as const;
export type WwwRedirectStatus = (typeof WWW_REDIRECT_STATUSES)[number];
export const WWW_REDIRECT_STATUS_LABELS: Record<WwwRedirectStatus, string> = {
  not_checked: 'Not checked', working: 'Working (one hop)', broken: 'Broken', not_applicable: 'N/A',
};

/* ── the QA checklist — the Definition of Done. Ticked by Paul, stored as booleans. ──────────── */
export const QA_ITEMS = [
  { key: 'pages_present', label: 'All intended pages present', group: 'preview' },
  { key: 'architecture_correct', label: 'Page architecture matches the approved plan', group: 'preview' },
  { key: 'old_urls_handled', label: 'Every approved old URL is handled (kept or redirected)', group: 'preview' },
  { key: 'visual_qa', label: 'Visual QA complete (desktop)', group: 'preview' },
  { key: 'mobile_qa', label: 'Mobile QA complete', group: 'preview' },
  { key: 'forms_work', label: 'Forms work (tested without sending a fake lead to the client)', group: 'preview' },
  { key: 'phone_links', label: 'Phone links work', group: 'preview' },
  { key: 'whatsapp_links', label: 'WhatsApp links work', group: 'preview' },
  { key: 'assets_load', label: 'All assets load (nothing hotlinked from the old site)', group: 'preview' },
  { key: 'no_broken_links', label: 'No broken important links', group: 'preview' },
  { key: 'seo_geo_qa', label: 'SEO / GEO QA complete', group: 'preview' },
  { key: 'schema_valid', label: 'Schema valid and matches the visible page', group: 'preview' },
  { key: 'sitemap_robots', label: 'Sitemap and robots.txt correct (OAI-SearchBot allowed)', group: 'preview' },
  { key: 'canonicals_domain', label: 'Canonicals correct, the right domain everywhere', group: 'preview' },
  { key: 'no_placeholders', label: 'No placeholder content left', group: 'preview' },
  { key: 'no_unverified_claims', label: 'No unverified claim published', group: 'preview' },
  { key: 'no_template_leftovers', label: 'No template / previous-client content left', group: 'preview' },
  { key: 'redirects_tested', label: 'Redirects tested on production (one hop each)', group: 'live' },
  { key: 'production_deployed', label: 'Production deployed', group: 'live' },
  { key: 'production_checked', label: 'Production checked end to end', group: 'live' },
] as const;
export type QaKey = (typeof QA_ITEMS)[number]['key'];
const QA_KEYS = QA_ITEMS.map((q) => q.key) as readonly string[];

export interface CaptureState {
  status: CaptureStatus;
  url_count: number | null;
  asset_count: number | null;
  notes: string;
}

/* ── V2: the Source Site Manifest — ready to RECEIVE a capture; nothing here crawls. ──────────── */

export const ASSET_TYPES = ['logo', 'photo', 'icon', 'badge', 'brand_logo', 'favicon', 'document', 'video', 'other'] as const;
export type AssetType = (typeof ASSET_TYPES)[number];
export const ASSET_APPROVALS = ['pending', 'approved', 'rejected'] as const;
export type AssetApproval = (typeof ASSET_APPROVALS)[number];
export const INTERACTION_KINDS = ['form', 'menu', 'accordion', 'slider', 'sticky', 'booking', 'contact_flow', 'popup', 'other'] as const;
export type InteractionKind = (typeof INTERACTION_KINDS)[number];

export interface ManifestPage { url: string; type: PageFamily; title: string; h1: string; purpose: string; screenshots: string[] }
export interface ManifestAsset { source_url: string; type: AssetType; purpose: string; location: string; approval: AssetApproval }
export interface ManifestInteraction { kind: InteractionKind; where: string; notes: string }
export interface SourceManifest {
  pages: ManifestPage[];
  assets: ManifestAsset[];
  design: { fonts: string; colours: string; layout_notes: string; component_notes: string };
  interactions: ManifestInteraction[];
  seo: { metadata: string; canonical: string; schema: string; sitemap: string; robots: string; tracking: string };
}

/* ── V2: visual comparison (faithful rebuild) — state only; no image comparison is run. ───────── */

export const DEFAULT_COMPARE_WIDTHS = [1440, 1024, 768, 390] as const;
export const COMPARE_STATUSES = ['not_checked', 'differences', 'approved'] as const;
export type CompareStatus = (typeof COMPARE_STATUSES)[number];
export const COMPARE_STATUS_LABELS: Record<CompareStatus, string> = {
  not_checked: 'Not checked', differences: 'Differences found', approved: 'Approved',
};
export interface CompareResult { family: PageFamily; status: CompareStatus; notes: string }
export interface VisualComparison {
  /** Blank = the existing site URL. */
  source_url: string;
  /** Blank = the Cloudflare preview URL. */
  preview_url: string;
  widths: number[];
  results: CompareResult[];
}

/* ── V2: bespoke → template, later. Records intent only; nothing is extracted. ────────────────── */
export interface TemplatePromotion { candidate: boolean; proposed_name: string; proposed_trade: string; notes: string }

export interface WebsiteBuildState {
  version: typeof WEBSITE_BUILD_VERSION;
  route: BuildRoute | '';
  template_id: string;
  rebuild_style: RebuildStyle | '';
  copy_ownership: CopyOwnership | '';
  /* source website */
  source_site_url: string;
  source_still_live: SiteLiveState;
  source_platform: string;
  last_captured_at: string;
  /* code */
  repo_name: string;
  github_owner: string;
  repo_url: string;
  local_repo_path: string;
  dev_command: string;
  build_command: string;
  build_output_dir: string;
  /* preview */
  cloudflare_project: string;
  dev_url: string;
  preview_url: string;
  preview_status: PreviewStatus;
  preview_noindex_confirmed: boolean;
  /* production */
  production_url: string;
  production_status: ProductionStatus;
  custom_domain_status: CustomDomainStatus;
  www_redirect_status: WwwRedirectStatus;
  canonical_domain: string;
  latest_commit: string;
  /* bespoke design references (existing Findable sites / templates) */
  design_references: string;
  notes: string;
  capture: CaptureState;
  manifest: SourceManifest;
  visual: VisualComparison;
  promotion: TemplatePromotion;
  facts: BuildFact[];
  pages: ArchPage[];
  redirects: Redirect[];
  qa: Partial<Record<QaKey, boolean>>;
  /** Route-specific stage checklist ticks, keyed route.stage.key (buildRoutes.ts). */
  checks: Record<string, true>;
}

/* The plain string fields and their caps. One list, read by both the parser and the normaliser. */
const STRING_FIELDS = {
  template_id: 80, repo_name: 100, github_owner: 100, repo_url: 500, local_repo_path: 500,
  cloudflare_project: 100, dev_url: 500, preview_url: 500, production_url: 500,
  canonical_domain: 253, latest_commit: 80, notes: 8000,
  source_site_url: 500, source_platform: 100, last_captured_at: 40,
  dev_command: 200, build_command: 200, build_output_dir: 200, design_references: 2000,
} as const;
type StringField = keyof typeof STRING_FIELDS;

/* Collection caps — generous for a trade site (MCL's rebuild had 289 legacy URLs), but bounded so
   one paste cannot bloat the row. */
export const MAX_FACTS = 120;
export const MAX_PAGES = 200;
export const MAX_REDIRECTS = 600;
export const MAX_MANIFEST_PAGES = 300;
export const MAX_MANIFEST_ASSETS = 300;
export const MAX_MANIFEST_INTERACTIONS = 100;

const EMPTY_MANIFEST: SourceManifest = {
  pages: [], assets: [], interactions: [],
  design: { fonts: '', colours: '', layout_notes: '', component_notes: '' },
  seo: { metadata: '', canonical: '', schema: '', sitemap: '', robots: '', tracking: '' },
};

export const EMPTY_WEBSITE_BUILD: WebsiteBuildState = {
  version: WEBSITE_BUILD_VERSION,
  route: '', template_id: '', rebuild_style: '', copy_ownership: '',
  source_site_url: '', source_still_live: 'unknown', source_platform: '', last_captured_at: '',
  repo_name: '', github_owner: '', repo_url: '', local_repo_path: '', dev_command: '', build_command: '', build_output_dir: '',
  cloudflare_project: '', dev_url: '', preview_url: '', preview_status: 'not_deployed', preview_noindex_confirmed: false,
  production_url: '', production_status: 'not_live', custom_domain_status: 'not_started', www_redirect_status: 'not_checked',
  canonical_domain: '', latest_commit: '', design_references: '', notes: '',
  capture: { status: 'not_started', url_count: null, asset_count: null, notes: '' },
  manifest: EMPTY_MANIFEST,
  visual: { source_url: '', preview_url: '', widths: [...DEFAULT_COMPARE_WIDTHS], results: [] },
  promotion: { candidate: false, proposed_name: '', proposed_trade: '', notes: '' },
  facts: [], pages: [], redirects: [], qa: {}, checks: {},
};

const obj = (v: unknown): Record<string, unknown> =>
  (v && typeof v === 'object' && !Array.isArray(v)) ? v as Record<string, unknown> : {};
const str = (v: unknown, cap: number) => (typeof v === 'string' ? v : v == null ? '' : String(v)).trim().slice(0, cap);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
/** ⛔ A token outside its list is dropped to the fallback, never stored as itself. */
function oneOf<T extends string>(list: readonly T[], v: unknown, fallback: T | ''): T | '' {
  const s = str(v, 80);
  return (list as readonly string[]).includes(s) ? s as T : fallback;
}
/** A token with a non-empty default. */
const tok = <T extends string>(list: readonly T[], v: unknown, fallback: T): T => (oneOf(list, v, fallback) || fallback) as T;
function count(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n >= 0 && n < 1_000_000 ? n : null;
}

function readFact(raw: unknown): BuildFact | null {
  const o = obj(raw);
  const key = str(o.key, 80);
  if (!key) return null;
  return {
    key,
    label: str(o.label, 120) || key,
    value: str(o.value, 2000),
    status: tok(FACT_STATUSES, o.status, 'detected'),
    source: str(o.source, 120),
    source_url: str(o.source_url, 500),
    notes: str(o.notes, 1000),
  };
}

function readPage(raw: unknown, i: number): ArchPage | null {
  const o = obj(raw);
  const page: ArchPage = {
    id: str(o.id, 40) || `p${i + 1}`,
    family: tok(PAGE_FAMILIES, o.family, 'other'),
    title: str(o.title, 200),
    path: str(o.path, 500),
    action: tok(PAGE_ACTIONS, o.action, 'undecided'),
    old_url: str(o.old_url, 500),
    target: str(o.target, 500),
    notes: str(o.notes, 1000),
  };
  /* A row with nothing in it is not a page. */
  return (page.title || page.path || page.old_url) ? page : null;
}

function readRedirect(raw: unknown): Redirect | null {
  const o = obj(raw);
  const r = { from: str(o.from, 500), to: str(o.to, 500), reason: str(o.reason, 300) };
  return r.from ? r : null;
}

/** Read a manifest (a stored one, or a pasted capture/manifest.json) into the capped shape. */
export function parseManifest(raw: unknown): SourceManifest {
  const o = obj(raw);
  const d = obj(o.design), s = obj(o.seo);
  return {
    pages: arr(o.pages).map((x) => {
      const p = obj(x);
      return { url: str(p.url, 500), type: tok(PAGE_FAMILIES, p.type, 'other'), title: str(p.title, 200), h1: str(p.h1, 200),
        purpose: str(p.purpose, 300), screenshots: arr(p.screenshots).map((v) => str(v, 300)).filter(Boolean).slice(0, 8) };
    }).filter((p) => p.url).slice(0, MAX_MANIFEST_PAGES),
    assets: arr(o.assets).map((x) => {
      const a = obj(x);
      return { source_url: str(a.source_url, 500), type: tok(ASSET_TYPES, a.type, 'other'), purpose: str(a.purpose, 200),
        location: str(a.location, 300), approval: tok(ASSET_APPROVALS, a.approval, 'pending') };
    }).filter((a) => a.source_url || a.location).slice(0, MAX_MANIFEST_ASSETS),
    interactions: arr(o.interactions).map((x) => {
      const it = obj(x);
      return { kind: tok(INTERACTION_KINDS, it.kind, 'other'), where: str(it.where, 300), notes: str(it.notes, 500) };
    }).filter((it) => it.where || it.notes).slice(0, MAX_MANIFEST_INTERACTIONS),
    design: { fonts: str(d.fonts, 1000), colours: str(d.colours, 1000), layout_notes: str(d.layout_notes, 3000), component_notes: str(d.component_notes, 3000) },
    seo: { metadata: str(s.metadata, 2000), canonical: str(s.canonical, 500), schema: str(s.schema, 2000), sitemap: str(s.sitemap, 500), robots: str(s.robots, 1000), tracking: str(s.tracking, 1000) },
  };
}

function readWidths(v: unknown): number[] {
  if (!Array.isArray(v)) return [...DEFAULT_COMPARE_WIDTHS];
  const out = [...new Set(v.map((n) => Math.floor(Number(n))).filter((n) => Number.isFinite(n) && n >= 240 && n <= 3840))].slice(0, 8);
  return out.length ? out : [...DEFAULT_COMPARE_WIDTHS];
}

/** V1 → V2: the operator's own V1 choice under its V2 name. Absent stays absent. */
function routeFromV1(o: Record<string, unknown>): BuildRoute | '' {
  const m = str(o.build_mode, 20);
  if (m === 'template') return 'template_rebuild';
  if (m === 'rebuild') return 'faithful_rebuild';
  return '';
}

/**
 * Read (browser) or normalise (server) a website_build value into the complete, allowlisted V2
 * state. The one rule both sides use. Unknown keys vanish; unknown tokens fall to their safe
 * default; a V1 row (no `version`) is read through the V1 → V2 rules in the header.
 */
export function parseWebsiteBuild(raw: unknown): WebsiteBuildState {
  const o = obj(raw);
  const isV1 = o.version !== WEBSITE_BUILD_VERSION;
  const v1Deploy = isV1 ? str(o.deploy_status, 20) : '';
  const out: WebsiteBuildState = {
    ...EMPTY_WEBSITE_BUILD,
    route: oneOf(BUILD_ROUTES, o.route, '') || (isV1 ? routeFromV1(o) : ''),
    rebuild_style: oneOf(REBUILD_STYLES, o.rebuild_style, ''),
    copy_ownership: oneOf(COPY_OWNERSHIPS, o.copy_ownership, ''),
    source_still_live: tok(SITE_LIVE_STATES, o.source_still_live, 'unknown'),
    preview_status: tok(PREVIEW_STATUSES, o.preview_status, v1Deploy === 'preview' || v1Deploy === 'production' ? 'deployed' : 'not_deployed'),
    preview_noindex_confirmed: o.preview_noindex_confirmed === true,
    production_status: tok(PRODUCTION_STATUSES, o.production_status, v1Deploy === 'production' ? 'deployed' : 'not_live'),
    custom_domain_status: tok(CUSTOM_DOMAIN_STATUSES, o.custom_domain_status, 'not_started'),
    www_redirect_status: tok(WWW_REDIRECT_STATUSES, o.www_redirect_status, 'not_checked'),
  };
  for (const k of Object.keys(STRING_FIELDS) as StringField[]) out[k] = str(o[k], STRING_FIELDS[k]);
  const c = obj(o.capture);
  out.capture = {
    status: tok(CAPTURE_STATUSES, c.status, 'not_started'),
    url_count: count(c.url_count),
    asset_count: count(c.asset_count),
    notes: str(c.notes, 4000),
  };
  out.manifest = parseManifest(o.manifest);
  const vis = obj(o.visual);
  const seenFam = new Set<string>();
  out.visual = {
    source_url: str(vis.source_url, 500),
    preview_url: str(vis.preview_url, 500),
    widths: readWidths(vis.widths),
    results: arr(vis.results).map((x) => {
      const r = obj(x);
      return { family: tok(PAGE_FAMILIES, r.family, 'other'), status: tok(COMPARE_STATUSES, r.status, 'not_checked'), notes: str(r.notes, 1000) };
    }).filter((r) => !seenFam.has(r.family) && !!seenFam.add(r.family)),
  };
  const pr = obj(o.promotion);
  out.promotion = { candidate: pr.candidate === true, proposed_name: str(pr.proposed_name, 120), proposed_trade: str(pr.proposed_trade, 120), notes: str(pr.notes, 2000) };
  const seen = new Set<string>();
  out.facts = arr(o.facts).map(readFact)
    .filter((f): f is BuildFact => !!f && !seen.has(f.key) && !!seen.add(f.key)).slice(0, MAX_FACTS);
  out.pages = arr(o.pages).map(readPage)
    .filter((p): p is ArchPage => !!p).slice(0, MAX_PAGES);
  out.redirects = arr(o.redirects).map(readRedirect)
    .filter((r): r is Redirect => !!r).slice(0, MAX_REDIRECTS);
  const qa = obj(o.qa);
  out.qa = {};
  for (const k of QA_KEYS) if (qa[k] === true) (out.qa as Record<string, boolean>)[k] = true;
  const ch = obj(o.checks);
  out.checks = {};
  for (const k of ALL_ROUTE_CHECK_IDS) if (ch[k] === true) out.checks[k] = true;
  return out;
}

const isEmptyValue = (v: unknown): boolean => {
  if (v === '' || v === null || v === false) return true;
  if (Array.isArray(v)) return v.length === 0;
  if (typeof v === 'object') return Object.values(v as object).every(isEmptyValue);
  return false;
};

/** The server's write rule: the parsed state, with empty values left out so the row stays small.
 *  `version` is always written — it is what tells the next read this row is V2. */
export function normaliseWebsiteBuild(raw: unknown): Record<string, unknown> {
  const s = parseWebsiteBuild(raw);
  const out: Record<string, unknown> = { version: WEBSITE_BUILD_VERSION };
  for (const [k, v] of Object.entries(s)) {
    if (k === 'version' || isEmptyValue(v)) continue;
    out[k] = v;
  }
  return out;
}

/* ── derived progress ─────────────────────────────────────────────────────────────────────────── */

export const STAGES = ['intake', 'capture', 'architecture', 'build_pack', 'preview', 'qa', 'live'] as const;
export type Stage = (typeof STAGES)[number];
export const STAGE_LABELS: Record<Stage, string> = {
  intake: 'Intake', capture: 'Capture', architecture: 'Architecture', build_pack: 'Build pack',
  preview: 'Preview', qa: 'QA', live: 'Live',
};

export interface StageStatus { stage: Stage; done: boolean; applicable: boolean; detail: string }

/** Is the route decision complete enough to generate anything from? */
export function modeComplete(s: WebsiteBuildState): boolean {
  if (s.route === 'template_rebuild') return !!s.template_id;
  if (s.route === 'faithful_rebuild') return !!s.rebuild_style && !!s.copy_ownership;
  if (s.route === 'bespoke') return true;
  return false;
}

/** Capture applies to a faithful rebuild always, to a bespoke build always (it is discovery there),
 *  and to a template rebuild only when there is an old site to take facts and assets from. */
export function captureApplies(s: WebsiteBuildState, hasExistingSite: boolean): boolean {
  if (s.route === 'faithful_rebuild' || s.route === 'bespoke') return true;
  return s.route === 'template_rebuild' && hasExistingSite;
}

export interface StageInputs {
  state: WebsiteBuildState;
  hasExistingSite: boolean;
  /** Facts still waiting for Paul's decision (status `detected`). */
  factsAwaiting: number;
  /** Architecture problems that block (redirect loops / chains). */
  architectureErrors: number;
  /** Required setup values still blank (repo name, local path…). */
  setupMissing: string[];
}

export function websiteBuildStages(i: StageInputs): StageStatus[] {
  const s = i.state;
  const qaPreview = QA_ITEMS.filter((q) => q.group === 'preview');
  const qaDone = qaPreview.filter((q) => s.qa[q.key]).length;
  const capApplies = captureApplies(s, i.hasExistingSite);
  const intakeDone = modeComplete(s) && i.factsAwaiting === 0;
  const archDone = s.pages.length > 0 && i.architectureErrors === 0;
  return [
    { stage: 'intake', applicable: true, done: intakeDone,
      detail: !modeComplete(s) ? 'Choose the build route' : i.factsAwaiting ? `${i.factsAwaiting} fact(s) need a decision` : 'Route chosen, facts reviewed' },
    { stage: 'capture', applicable: capApplies, done: !capApplies || s.capture.status === 'captured',
      detail: !capApplies ? 'Not needed for this build' : CAPTURE_STATUS_LABELS[s.capture.status] },
    { stage: 'architecture', applicable: true, done: archDone,
      detail: `${s.pages.length} page(s) · ${s.redirects.length} redirect(s)${i.architectureErrors ? ` · ${i.architectureErrors} problem(s)` : ''}` },
    { stage: 'build_pack', applicable: true, done: intakeDone && archDone && i.setupMissing.length === 0,
      detail: i.setupMissing.length ? `Needs: ${i.setupMissing.join(', ')}` : (intakeDone && archDone ? 'Ready' : 'Finish intake and architecture first') },
    { stage: 'preview', applicable: true, done: !!s.preview_url, detail: s.preview_url ? `${s.preview_url} · ${PREVIEW_STATUS_LABELS[s.preview_status].toLowerCase()}` : 'No preview URL yet' },
    { stage: 'qa', applicable: true, done: qaDone === qaPreview.length, detail: `${qaDone} of ${qaPreview.length} checks` },
    { stage: 'live', applicable: true, done: !!s.production_url && s.qa.production_checked === true,
      detail: s.production_url ? (s.qa.production_checked ? `${s.production_url} · verified` : `${s.production_url} · not verified`) : 'Not live' },
  ];
}

/** The page families a visual comparison covers: the families of the pages being built. */
export function compareFamilies(s: WebsiteBuildState): PageFamily[] {
  const fams = s.pages.filter((p) => p.action === 'keep' || p.action === 'create').map((p) => p.family);
  const fromManifest = s.manifest.pages.map((p) => p.type);
  const all = fams.length ? fams : fromManifest;
  return PAGE_FAMILIES.filter((f) => all.includes(f));
}

/** The Visual Comparison prompt's reply ("service: approved" / "homepage: differences — nav wraps")
 *  → results, merged over the existing ones. Lines that name no known family are ignored. */
export function parseCompareReply(text: string, existing: CompareResult[]): CompareResult[] {
  const byFam = new Map(existing.map((r) => [r.family, r]));
  for (const raw of text.split(/\r?\n/)) {
    const m = /^\s*[-*]?\s*([a-z_]+)\s*:\s*(approved|differences)\b\s*[—–-]?\s*(.*)$/i.exec(raw);
    if (!m) continue;
    const fam = m[1].toLowerCase();
    if (!(PAGE_FAMILIES as readonly string[]).includes(fam)) continue;
    byFam.set(fam as PageFamily, { family: fam as PageFamily, status: m[2].toLowerCase() as CompareStatus, notes: m[3].trim().slice(0, 1000) });
  }
  return PAGE_FAMILIES.filter((f) => byFam.has(f)).map((f) => byFam.get(f)!);
}
