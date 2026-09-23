/* ════════════════════════════════════════════════════════════════════════════════════════════════
   WEBSITE BUILD — the operator's saved workflow state for one paid client
   (outreach_leads.website_build, jsonb, operator-only — never rendered into a client document).

   ONE MODULE OWNS THE SHAPE ON BOTH SIDES. The browser reads a row through parseWebsiteBuild; the
   paid-client-hub edge function writes a row through normaliseWebsiteBuild. They are the same rule
   (an allowlist of keys, enumerated tokens, capped lengths), so a key the browser can show is a key
   the server will keep, and nothing else survives a save.

   ⛔ NOTHING HERE IS A PROMPT. Prompts and commands are generated at click time from this state plus
   a fresh read of the client's records (buildPack.ts). Storing generated text would freeze it.
   ⛔ PROGRESS IS DERIVED, NEVER STORED. websiteBuildStages() reads the state and says how far along
   the build is; there is no status column to fall out of step with the data (CLAUDE.md §6).

   ⚠️ Edge-reachable: relative imports with an explicit .ts only.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export const BUILD_MODES = ['template', 'rebuild'] as const;
export type BuildMode = (typeof BUILD_MODES)[number];
export const BUILD_MODE_LABELS: Record<BuildMode, string> = {
  template: 'Fresh build from a Findable template',
  rebuild: "Rebuild / copy the client's existing website",
};

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

/** A stored fact decision. `missing` is never stored — it is what "no value anywhere" derives to. */
export const FACT_STATUSES = ['verified', 'detected', 'rejected', 'not_applicable'] as const;
export type StoredFactStatus = (typeof FACT_STATUSES)[number];
export type FactStatus = StoredFactStatus | 'missing';
export const FACT_STATUS_LABELS: Record<FactStatus, string> = {
  verified: 'Verified',
  detected: 'Needs approval',
  missing: 'Missing',
  rejected: 'Rejected',
  not_applicable: 'Not applicable',
};

export interface BuildFact {
  key: string;
  label: string;
  value: string;
  status: StoredFactStatus;
  source: string;
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

export const DEPLOY_STATUSES = ['not_deployed', 'preview', 'production'] as const;
export type DeployStatus = (typeof DEPLOY_STATUSES)[number];
export const DEPLOY_STATUS_LABELS: Record<DeployStatus, string> = {
  not_deployed: 'Not deployed', preview: 'Preview deployed', production: 'Production deployed',
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

export interface WebsiteBuildState {
  build_mode: BuildMode | '';
  template_id: string;
  rebuild_style: RebuildStyle | '';
  copy_ownership: CopyOwnership | '';
  repo_name: string;
  github_owner: string;
  repo_url: string;
  local_repo_path: string;
  cloudflare_project: string;
  dev_url: string;
  preview_url: string;
  production_url: string;
  canonical_domain: string;
  latest_commit: string;
  deploy_status: DeployStatus;
  notes: string;
  capture: CaptureState;
  facts: BuildFact[];
  pages: ArchPage[];
  redirects: Redirect[];
  qa: Partial<Record<QaKey, boolean>>;
}

/* The plain string fields and their caps. One list, read by both the parser and the normaliser. */
const STRING_FIELDS = {
  template_id: 80, repo_name: 100, github_owner: 100, repo_url: 500, local_repo_path: 500,
  cloudflare_project: 100, dev_url: 500, preview_url: 500, production_url: 500,
  canonical_domain: 253, latest_commit: 80, notes: 8000,
} as const;
type StringField = keyof typeof STRING_FIELDS;

/* Collection caps — generous for a trade site (MCL's rebuild had 289 legacy URLs), but bounded so
   one paste cannot bloat the row. */
export const MAX_FACTS = 120;
export const MAX_PAGES = 200;
export const MAX_REDIRECTS = 600;

export const EMPTY_WEBSITE_BUILD: WebsiteBuildState = {
  build_mode: '', template_id: '', rebuild_style: '', copy_ownership: '',
  repo_name: '', github_owner: '', repo_url: '', local_repo_path: '', cloudflare_project: '',
  dev_url: '', preview_url: '', production_url: '', canonical_domain: '', latest_commit: '',
  deploy_status: 'not_deployed', notes: '',
  capture: { status: 'not_started', url_count: null, asset_count: null, notes: '' },
  facts: [], pages: [], redirects: [], qa: {},
};

const obj = (v: unknown): Record<string, unknown> =>
  (v && typeof v === 'object' && !Array.isArray(v)) ? v as Record<string, unknown> : {};
const str = (v: unknown, cap: number) => (typeof v === 'string' ? v : v == null ? '' : String(v)).trim().slice(0, cap);
/** ⛔ A token outside its list is dropped to the fallback, never stored as itself. */
function oneOf<T extends string>(list: readonly T[], v: unknown, fallback: T | ''): T | '' {
  const s = str(v, 80);
  return (list as readonly string[]).includes(s) ? s as T : fallback;
}
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
    status: (oneOf(FACT_STATUSES, o.status, 'detected') || 'detected') as StoredFactStatus,
    source: str(o.source, 120),
  };
}

function readPage(raw: unknown, i: number): ArchPage | null {
  const o = obj(raw);
  const page: ArchPage = {
    id: str(o.id, 40) || `p${i + 1}`,
    family: (oneOf(PAGE_FAMILIES, o.family, 'other') || 'other') as PageFamily,
    title: str(o.title, 200),
    path: str(o.path, 500),
    action: (oneOf(PAGE_ACTIONS, o.action, 'undecided') || 'undecided') as PageAction,
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

/**
 * Read (browser) or normalise (server) a website_build value into the complete, allowlisted state.
 * The one rule both sides use. Unknown keys vanish; unknown tokens fall to their safe default; the
 * legacy 2026-09-22 shape (a `status` token) reads cleanly and its status is simply not carried —
 * progress is derived now.
 */
export function parseWebsiteBuild(raw: unknown): WebsiteBuildState {
  const o = obj(raw);
  const out: WebsiteBuildState = {
    ...EMPTY_WEBSITE_BUILD,
    build_mode: oneOf(BUILD_MODES, o.build_mode, ''),
    rebuild_style: oneOf(REBUILD_STYLES, o.rebuild_style, ''),
    copy_ownership: oneOf(COPY_OWNERSHIPS, o.copy_ownership, ''),
    deploy_status: (oneOf(DEPLOY_STATUSES, o.deploy_status, 'not_deployed') || 'not_deployed') as DeployStatus,
  };
  for (const k of Object.keys(STRING_FIELDS) as StringField[]) out[k] = str(o[k], STRING_FIELDS[k]);
  const c = obj(o.capture);
  out.capture = {
    status: (oneOf(CAPTURE_STATUSES, c.status, 'not_started') || 'not_started') as CaptureStatus,
    url_count: count(c.url_count),
    asset_count: count(c.asset_count),
    notes: str(c.notes, 4000),
  };
  const seen = new Set<string>();
  out.facts = (Array.isArray(o.facts) ? o.facts : []).map(readFact)
    .filter((f): f is BuildFact => !!f && !seen.has(f.key) && !!seen.add(f.key)).slice(0, MAX_FACTS);
  out.pages = (Array.isArray(o.pages) ? o.pages : []).map(readPage)
    .filter((p): p is ArchPage => !!p).slice(0, MAX_PAGES);
  out.redirects = (Array.isArray(o.redirects) ? o.redirects : []).map(readRedirect)
    .filter((r): r is Redirect => !!r).slice(0, MAX_REDIRECTS);
  const qa = obj(o.qa);
  out.qa = {};
  for (const k of QA_KEYS) if (qa[k] === true) (out.qa as Record<string, boolean>)[k] = true;
  return out;
}

/** The server's write rule: the parsed state, with empty values left out so the row stays small. */
export function normaliseWebsiteBuild(raw: unknown): Record<string, unknown> {
  const s = parseWebsiteBuild(raw);
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(s)) {
    if (v === '' || v === null) continue;
    if (Array.isArray(v) && v.length === 0) continue;
    if (k === 'qa' && Object.keys(v as object).length === 0) continue;
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

/** Is the build-mode decision complete enough to generate anything from? */
export function modeComplete(s: WebsiteBuildState): boolean {
  if (s.build_mode === 'template') return !!s.template_id;
  if (s.build_mode === 'rebuild') return !!s.rebuild_style && !!s.copy_ownership;
  return false;
}

/** Capture applies to a rebuild always, and to a template build only when there is an old site. */
export function captureApplies(s: WebsiteBuildState, hasExistingSite: boolean): boolean {
  if (s.build_mode === 'rebuild') return true;
  return s.build_mode === 'template' && hasExistingSite;
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
      detail: !modeComplete(s) ? 'Choose how the site is being built' : i.factsAwaiting ? `${i.factsAwaiting} fact(s) need a decision` : 'Mode chosen, facts reviewed' },
    { stage: 'capture', applicable: capApplies, done: !capApplies || s.capture.status === 'captured',
      detail: !capApplies ? 'Not needed for this build' : CAPTURE_STATUS_LABELS[s.capture.status] },
    { stage: 'architecture', applicable: true, done: archDone,
      detail: `${s.pages.length} page(s) · ${s.redirects.length} redirect(s)${i.architectureErrors ? ` · ${i.architectureErrors} problem(s)` : ''}` },
    { stage: 'build_pack', applicable: true, done: intakeDone && archDone && i.setupMissing.length === 0,
      detail: i.setupMissing.length ? `Needs: ${i.setupMissing.join(', ')}` : (intakeDone && archDone ? 'Ready' : 'Finish intake and architecture first') },
    { stage: 'preview', applicable: true, done: !!s.preview_url, detail: s.preview_url || 'No preview URL yet' },
    { stage: 'qa', applicable: true, done: qaDone === qaPreview.length, detail: `${qaDone} of ${qaPreview.length} checks` },
    { stage: 'live', applicable: true, done: !!s.production_url && s.qa.production_checked === true,
      detail: s.production_url ? (s.qa.production_checked ? `${s.production_url} · verified` : `${s.production_url} · not verified`) : 'Not live' },
  ];
}
