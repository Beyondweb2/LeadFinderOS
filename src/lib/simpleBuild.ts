/* ════════════════════════════════════════════════════════════════════════════════════════════════
   WEBSITE BUILD — SIMPLE (2026-10-05). Complexity in the background, simple for Paul.

     CHOOSE BUILD TYPE → PREPARE WEBSITE → COPY ONE MASTER BUILD PROMPT → CLAUDE BUILDS THE PREVIEW
       → PAUL REVIEWS THE RESULT → CORRECTIONS → LAUNCH

   The machinery underneath is the Website Build V2 record (websiteBuildState.ts) and every safety rule
   it already carries — the fact ledger, Workstream 4's service truth, the Site Intent Map and its
   ownership rule, the claims rules, the site quality gate, the quality and build standards, the one
   launch rule (websiteLaunch.ts). This module only decides what Paul has to SEE:

     resolveBuildType()   the build type, DERIVED from the route the operator clicked (never inferred)
     applyBuildType()     Paul's click → the route fields it means (template / visual / close)
     prepareWebsite()     the automatic gather: project defaults, uncontested low-risk facts, the page
                          plan, the content intents, the enquiry form — never overwrites a decision
     simpleIssues()       ONLY what needs a human decision: blockers (stop the master prompt), decide
                          (Paul should look, nothing stops), launch (only before go-live)
     masterBuildPrompt()  ONE self-contained Claude Code prompt
     terminalSteps()      the exact numbered steps and commands beside it
     technicalCheck()     the automatic gate's verdict: passed, or only the failures
     simpleProgress()     Gather · Prepare · Build · Review · Launch, derived

   ⛔ TRUTH ORDER: client-confirmed facts > verified onboarding / sales information > the client's own
      public website > sales notes > Discovery / baseline. Discovery and AI suggestions never become a
      business fact: prepareWebsite() accepts ONLY uncontested contact-identity facts (name, trade, phone,
      email, website, hours, company number) and the onboarding home town; services, areas, credentials,
      guarantees, years, people and anything contested stay unpublished until Paul decides.
   ⛔ A preview is never blocked by ordinary uncertainty (no photos, no CMS access, no Google profile,
      no home-town page). It is blocked only by: no business identity, an unsettled Build / Optimise route,
      a close recreation without reproduction rights, a dangerous contradiction in the facts, no contact
      destination, no web address to build for, a template that cannot be filled.
   ⚠️ Plain string arrays joined with newlines — never a backtick inside a template literal (§3).
   ⚠️ Relative .ts imports only (the closure is shared with edge-reachable modules).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import type { ArchPage, BuildFact, QaKey, WebsiteBuildState } from './websiteBuildState.ts';
import {
  COPY_OWNERSHIP_LABELS, SIMPLE_REVIEW_ITEMS, mayPreserveCopy, outstandingPreviewQa, previewReadyProblems,
  reviewItemDone, stateHasExistingSite,
} from './websiteBuildState.ts';
import { CONTENT_INTENTS, CORE_INTENTS, QUALITY_STANDARD_LINES, STRENGTH_RECON_LINES, UPGRADE_QA_LINES, type ContentIntent, type QualityState } from './websiteQuality.ts';
import { BUILD_STANDARD_LINES } from './websiteBuildStandard.ts';
import { DO_NOT_INVENT_LINES } from './claimRules.ts';
import { WEBSITE_TEMPLATES, templateById, tradeFit, type WebsiteTemplate } from './websiteTemplates.ts';
import type { FactRow } from './buildFacts.ts';
import { isPublishable } from './buildFacts.ts';
import {
  claimMappingLines, codeConfig, contentRules, deployInputFor, FINDABLE_STANDARD, forbiddenFactLines, MARK, pageLines,
  suggestCloudflareProject, suggestRepoName, templateConfigSection, verifiedFactLines, winPath, type BuildPackInput,
} from './buildPack.ts';
import {
  assetPlanLines, assetsToDownload, BUILD_RESULT_RULES, BUILD_RESULT_SCHEMA_LINES, configVersion, enquiryFormLines, safeAssetName,
  sameDomainRebuild, seoVisibilityLines,
} from './buildExecution.ts';
import { computeMapping, type Mapping } from './templateMapping.ts';
import { siteGateLines, siteIntentMap, siteIntentMapLines, siteTruthFromBuild } from './siteGate.ts';
import { cloudflareBranches, dashboardSetupSteps, previewDeploySteps, stablePreviewUrl } from './cloudflareDeploy.ts';
import { readSiteForm, siteFormProblems, suggestSiteKey } from './siteForm.ts';
import { slugify, toPath } from './buildArchitecture.ts';
import { crawlSection, doNotBreak, baselineProtection } from './websiteBuildPrompt.ts';
import { templateCacheName } from './websiteTemplates.ts';
import { OPTIMISE_BUILD_REFUSAL } from './websiteRoute.ts';

/* ── 1. BUILD TYPES ───────────────────────────────────────────────────────────────────────────── */

export const BUILD_TYPES = ['template', 'visual_rebuild', 'close_recreation', 'optimise'] as const;
export type BuildType = (typeof BUILD_TYPES)[number];
/** What a record reads as. 'legacy_bespoke' = an earlier Bespoke build (BS4) — shown as it is, never converted. */
export type ResolvedBuildType = BuildType | 'legacy_bespoke' | '';

export interface BuildTypeInfo { letter: string; label: string; short: string; description: string; needsOldSite: boolean }
export const BUILD_TYPE_INFO: Record<BuildType | 'legacy_bespoke', BuildTypeInfo> = {
  template: { letter: 'A', label: 'New site — Findable template', short: 'Findable template',
    description: 'A new site on one of Findable\u2019s own layouts, filled with the client\u2019s confirmed facts, services, areas, branding and their own photos. It does not try to look like the old site.', needsOldSite: false },
  visual_rebuild: { letter: 'B', label: 'Visual rebuild / improvement', short: 'Visual rebuild',
    description: 'Uses the current public website as the reference for branding, logo, colours, their own imagery, services and useful content — and builds a clearly better Findable site. No CMS access needed.', needsOldSite: true },
  close_recreation: { letter: 'C', label: 'Close recreation of the current site', short: 'Close recreation',
    description: 'Rebuilds the current site\u2019s structure and visual character with clean new code. Only where the client has confirmed they may reproduce its design, words and images. Never a pixel copy of someone else\u2019s template.', needsOldSite: true },
  optimise: { letter: 'D', label: 'Improve their existing site', short: 'Optimise',
    description: 'They keep their own website and we improve it with new pages. That is Findable Optimise — not a new-site build.', needsOldSite: false },
  legacy_bespoke: { letter: '\u2013', label: 'Bespoke build (set up earlier)', short: 'Bespoke',
    description: 'This build was set up as a Bespoke build before the simple flow existed. It keeps working as it is; choose a type below only if you want to change it.', needsOldSite: false },
};

/** The build type, read from the route the operator clicked. Derived, never stored (CLAUDE.md §6). */
export function resolveBuildType(s: WebsiteBuildState): ResolvedBuildType {
  if (s.route === 'template_rebuild') return 'template';
  if (s.route === 'faithful_rebuild') return s.rebuild_style === 'replica' ? 'close_recreation' : s.rebuild_style ? 'visual_rebuild' : '';
  if (s.route === 'bespoke') return 'legacy_bespoke';
  return '';
}

/** The type to suggest (never selected for Paul): an existing site → visual rebuild, none → template. */
export const recommendedBuildType = (hasExistingSite: boolean): BuildType => (hasExistingSite ? 'visual_rebuild' : 'template');

/** May this client's current website be reproduced? The onboarding answer, or the recorded copy ownership. */
export type RecreationRights = 'confirmed' | 'refused' | 'unclear';
export function recreationRights(s: WebsiteBuildState, onboarding: Record<string, unknown> | null): RecreationRights {
  if (mayPreserveCopy(s.copy_ownership)) return 'confirmed';
  const answer = String(onboarding?.site_rights ?? '').trim();
  if (answer === 'yes') return 'confirmed';
  if (answer === 'no' || s.copy_ownership === 'previous_developer') return 'refused';
  return 'unclear';
}

/**
 * Paul's click on a build type → the route fields it means. Optimise changes nothing (it is not a
 * new-site route; the screen sends Paul to the Optimise workflow). A template click with exactly one
 * template available selects it in the same click. A close recreation records the client's own "yes"
 * from onboarding as the copy ownership it is.
 */
export function applyBuildType(s: WebsiteBuildState, type: BuildType, onboarding: Record<string, unknown> | null): WebsiteBuildState {
  if (type === 'optimise') return s;
  if (type === 'template') {
    const only = WEBSITE_TEMPLATES.length === 1 ? WEBSITE_TEMPLATES[0].id : '';
    return { ...s, route: 'template_rebuild', template_id: templateById(s.template_id) ? s.template_id : only };
  }
  if (type === 'visual_rebuild') return { ...s, route: 'faithful_rebuild', rebuild_style: 'new_design', copy_ownership: s.copy_ownership || 'unknown' };
  const yes = String(onboarding?.site_rights ?? '').trim() === 'yes';
  return { ...s, route: 'faithful_rebuild', rebuild_style: 'replica', copy_ownership: mayPreserveCopy(s.copy_ownership) ? s.copy_ownership : yes ? 'client_permission' : (s.copy_ownership || 'unknown') };
}

/* ── 2. PREPARE WEBSITE — the automatic gather ────────────────────────────────────────────────── */

/** The project defaults the first real Build (BS4, 2026-09-25) used — Paul's machine and accounts. */
export const DEFAULT_GITHUB_OWNER = 'Beyondweb2';
export const DEFAULT_CLIENTS_FOLDER = 'C:\\Users\\paulj';
export const DEFAULT_CLOUDFLARE_ACCOUNT = 'beyondwebcraft';

/** Contact-identity facts Prepare may accept when NOTHING contests them. Never a service, an area, a
 *  credential, a guarantee, a year, a person or a price. */
export const AUTO_ACCEPT_KEYS = ['business_name', 'trade', 'phone', 'email', 'website', 'opening_hours', 'company_number'] as const;
/** The home town is accepted only from the onboarding answer (a crawled or Places town never is). */
const HOME_TOWN_KEY = 'primary_town';
const CONFLICT_NOTE = /disagree|current website shows|since you approved/i;
const ONBOARDING_SOURCE = /onboarding/i;
/* The exact source labels buildFacts / clientFacts write: the client’s own site, read by the stored crawl, and
   the paid lead row (Google Places + Sales). A Discovery scan, a baseline context or an earlier audit never matches. */
const CRAWL_SOURCE = /^client.s current website \(stored crawl\)$/i;
const RECORD_SOURCE = /^paid client record$/i;

/* Sources BELOW the client's own records in the truth order: a disagreement from one of them never
   contests a client-stated or client-record value \u2014 the higher source simply wins (it is already the
   winner resolveFact chose). */
const WEAK_SOURCE = /^(Discovery scan|paid baseline context|website crawl \/ earlier audit)$/i;
/** Where a row's disagreement comes from: none \u00b7 weak (only sources below the winner's rank) \u00b7 strong
 *  (the client's own records, or their live website, disagree \u2014 a human decides). */
export function contestOf(r: FactRow): 'none' | 'weak' | 'strong' {
  const note = r.note || '';
  if (!CONFLICT_NOTE.test(note)) return 'none';
  if (/current website shows|since you approved/i.test(note)) return 'strong';
  const clause = note.split(/Sources disagree:/i)[1] ?? '';
  const names = [...clause.matchAll(/(?:^|;)\s*([^";]+?)\s+(?:says|lists)\s+"/g)].map((m) => m[1].trim());
  if (!names.length) return 'strong';
  return names.every((n) => WEAK_SOURCE.test(n)) ? 'weak' : 'strong';
}
export const isContested = (r: FactRow) => contestOf(r) === 'strong';

/* A strong contest the truth order still settles: the CLIENT'S OWN onboarding answer (submitted by them,
   not typed by an operator) on their name, trade or home town. A phone, email or address clash is never
   settled automatically \u2014 the wrong one would send customers to the wrong place (it is a blocker). */
const CLIENT_WINS_KEYS = ['business_name', 'trade', HOME_TOWN_KEY];

/** The facts Prepare accepts: not yet decided, from the client's own records or site, and not contested
 *  by a source of the same or higher standing. */
export function autoAcceptFacts(rows: readonly FactRow[]): BuildFact[] {
  const out: BuildFact[] = [];
  for (const r of rows) {
    if (r.decided || r.status !== 'detected' || !r.value.trim()) continue;
    const fromOnboarding = ONBOARDING_SOURCE.test(r.source), fromCrawl = CRAWL_SOURCE.test(r.source), fromRecord = RECORD_SOURCE.test(r.source);
    const byOperator = /entered by operator/i.test(r.source);
    const contest = contestOf(r);
    if (contest === 'strong' && !(fromOnboarding && !byOperator && CLIENT_WINS_KEYS.includes(r.key))) continue;
    const keyOk = (AUTO_ACCEPT_KEYS as readonly string[]).includes(r.key)
      ? (fromOnboarding || fromCrawl || (fromRecord && (r.key === 'business_name' || r.key === 'phone' || r.key === 'website' || r.key === 'trade')))
      : r.key === HOME_TOWN_KEY && fromOnboarding && !byOperator;
    if (!keyOk) continue;
    const why = contest === 'none' ? 'uncontested' : 'the client\u2019s own answer outranks ' + (contest === 'weak' ? 'a lower source' : 'the other record');
    out.push({ key: r.key, label: r.label, value: r.value, status: 'verified', source: (r.source || 'records') + ' \u2014 accepted by Prepare Website (' + why + ')', source_url: r.source_url, notes: [r.notes, r.note].filter(Boolean).join(' ').slice(0, 1000), basis: fromOnboarding ? 'client' : 'source_site' });
  }
  return out;
}

/**
 * The current website as the simple flow trusts it: what Paul recorded as the source, else the "Current
 * website" fact ONLY when it is verified or Prepare would accept it (the client, their record, their own
 * crawled site). A URL that only a Discovery scan or a baseline context offered is never the client's site
 * (it once was, on the Website Build page's own derivation: a Discovery guess became the rebuild source).
 */
export function trustedOldSite(i: BuildPackInput): string {
  if (i.state.source_site_url) return i.state.source_site_url;
  const r = i.facts.find((f) => f.key === 'website');
  return r && (isPublishable(r) || autoAcceptFacts([r]).length) ? r.value : '';
}
/** The pack with the trusted current website in place of the page's broader one. Idempotent. */
export const trustedPack = (i: BuildPackInput): BuildPackInput => (i.existingSiteUrl === trustedOldSite(i) ? i : { ...i, existingSiteUrl: trustedOldSite(i) });

const PLATFORM_HOST = /(^|\.)(wixsite\.com|wix\.com|squarespace\.com|wordpress\.com|weebly\.com|godaddysites\.com|business\.site|site123\.me|webnode\.[a-z.]+|jimdosite\.com|facebook\.com|google\.com|yell\.com|checkatrade\.com|pages\.dev|netlify\.app|vercel\.app|github\.io)$/i;
/** The web address a rebuild keeps: the current site's own host (www dropped). '' for a platform sub-site. */
export function domainFromSite(url: string): string {
  try {
    const h = new URL(/^https?:\/\//i.test(url) ? url : 'https://' + url).hostname.toLowerCase().replace(/^www\./, '');
    return h && h.includes('.') && !PLATFORM_HOST.test(h) ? h : '';
  } catch { return ''; }
}

export interface ClientServices { services: string[]; notOffered: string[]; source: string; clientConfirmed: boolean; contradictions: string[] }
const lc = (x: string) => x.toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const overlaps = (a: string, b: string) => { const x = lc(a), y = lc(b); return !!x && !!y && (x === y || (x.length > 3 && y.length > 3 && (x.includes(y) || y.includes(x)))); };

/** Workstream 4's service truth for this build, plus any service listed BOTH as offered and as not offered. */
export function clientServices(i: BuildPackInput): ClientServices {
  const fact = (k: string) => i.facts.find((f) => f.key === k && isPublishable(f))?.value ?? '';
  const areas = fact('service_areas').split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);
  const truth = siteTruthFromBuild(i, areas, fact('primary_town')).truth;
  const contradictions = truth.services.filter((svc) => truth.notOffered.some((n) => overlaps(svc, n)));
  return {
    services: truth.services.filter((svc) => !contradictions.includes(svc)),
    notOffered: truth.notOffered, source: truth.source ?? '', clientConfirmed: truth.clientConfirmed, contradictions,
  };
}

/** Service pages: one per confirmed service with its own intent; one service alone is the home page's. */
export const MAX_AUTO_SERVICE_PAGES = 12;
const page = (family: ArchPage['family'], title: string, path: string, notes = ''): ArchPage =>
  ({ id: 'auto-' + (slugify(path) || 'home'), family, title, path, action: 'create', old_url: '', target: '', notes, meta: '' });

/**
 * The automatic page plan for a non-template build (a template builds its own pages from its config).
 * ONE PRIMARY PAGE PER IMPORTANT INTENT: home, a services hub and one page per confirmed service (two
 * or more), about, contact, privacy, an areas hub only for three or more genuine areas. NO town pages —
 * a town page needs genuinely local content, which only Paul can supply (Advanced → page plan).
 */
export function autoPagePlan(services: readonly string[], areas: readonly string[]): ArchPage[] {
  const seen = new Set<string>();
  const unique = services.filter((x) => { const k = lc(x); if (!k || seen.has(k)) return false; seen.add(k); return true; });
  const pages: ArchPage[] = [page('homepage', 'Home', '/')];
  if (unique.length >= 2) {
    pages.push(page('services_index', 'Services', '/services/'));
    for (const name of unique.slice(0, MAX_AUTO_SERVICE_PAGES)) pages.push(page('service', name, '/services/' + slugify(name) + '/', 'Confirmed service (automatic plan).'));
  }
  if (areas.length >= 3) pages.push(page('locations_index', 'Areas we cover', '/areas/', 'The genuine service areas, led by a map. No page per town.'));
  pages.push(page('about', 'About', '/about/'), page('contact', 'Contact', '/contact/'), page('legal', 'Privacy policy', '/privacy/'));
  return pages;
}

const AUTO_NOTE = 'Automatic plan (Prepare Website)';
/** Every content intent assessed, from the page plan (or a template's core pages). Never overwrites a decision. */
export function autoIntents(q: QualityState, pages: ReadonlyArray<{ family: string; path: string }>, servicePages: number): QualityState['intents'] {
  const at = (fam: string) => pages.find((p) => p.family === fam)?.path ?? '';
  const needed = (p: string) => ({ need: 'needed' as const, page: p, note: '' });
  const not = (why: string) => ({ need: 'not_needed' as const, page: '', note: AUTO_NOTE + ': ' + why });
  const plan: Record<ContentIntent, { need: 'needed' | 'not_needed'; page: string; note: string }> = {
    services_hub: at('services_index') ? needed(at('services_index')) : needed('section on /'),
    service_pages: servicePages ? needed(at('services_index') || at('service')) : not('one service or none confirmed \u2014 the home page owns it'),
    areas_hub: at('locations_index') ? needed(at('locations_index')) : not('fewer than three genuine areas \u2014 they go in the service-area wording'),
    location_pages: not('no genuinely local town page planned \u2014 towns go in the service-area wording'),
    faq_hub: not('customer questions are answered on the page that owns them'),
    quotes_pricing: not('no verified prices \u2014 the builder never invents one'),
    about: at('about') ? needed(at('about')) : needed('section on /'),
    our_work: not('the builder adds a recent-work section only from genuine job photos'),
    contact: at('contact') ? needed(at('contact')) : needed('section on /'),
    customer_types: not('shown only where the facts support it'),
    urgent_services: not('only where the client genuinely offers urgent work'),
  };
  const out: QualityState['intents'] = { ...q.intents };
  for (const k of CONTENT_INTENTS) if (!out[k]?.need) out[k] = plan[k];
  /* A core intent marked not needed must say why (intentProblems) — the plan above never does that. */
  for (const k of CORE_INTENTS) if (out[k]?.need === 'not_needed' && !out[k]?.note) out[k] = { ...out[k]!, note: AUTO_NOTE };
  return out;
}

export interface PrepareContext {
  pack: BuildPackInput;
  onboarding: Record<string, unknown> | null;
  /** False for an engagement that has ended (the form is never switched on then). */
  active: boolean;
}

/** Everything Prepare would change, applied — pure. `changes` says what it did, in Paul's words. */
export function prepareWebsite(ctx: PrepareContext): { state: WebsiteBuildState; changes: string[] } {
  const i = trustedPack(ctx.pack);
  let s = i.state;
  const changes: string[] = [];
  const set = <K extends keyof WebsiteBuildState>(k: K, v: WebsiteBuildState[K], why: string) => { if (!s[k] && v) { s = { ...s, [k]: v }; changes.push(why); } };
  const type = resolveBuildType(s);

  /* Facts: uncontested contact identity only (see the header). */
  const accepted = autoAcceptFacts(i.facts);
  if (accepted.length) {
    s = { ...s, facts: [...s.facts.filter((f) => !accepted.some((a) => a.key === f.key)), ...accepted] };
    changes.push('Accepted ' + accepted.length + ' uncontested contact detail(s): ' + accepted.map((a) => a.label).join(', '));
  }
  const rows = i.facts.map((r) => { const a = accepted.find((x) => x.key === r.key); return a ? { ...r, status: 'verified' as const, decided: true } : r; });
  const fact = (k: string) => rows.find((r) => r.key === k && isPublishable(r))?.value ?? '';

  /* Project defaults — the BS4 setup, named once above. */
  const repo = s.repo_name || suggestRepoName(i.businessName || fact('business_name'));
  set('repo_name', repo, 'Repository name ' + repo);
  set('github_owner', DEFAULT_GITHUB_OWNER, 'GitHub account ' + DEFAULT_GITHUB_OWNER);
  set('local_repo_path', repo ? DEFAULT_CLIENTS_FOLDER + '\\' + repo : '', 'Local folder ' + DEFAULT_CLIENTS_FOLDER + '\\' + repo);
  set('cloudflare_project', suggestCloudflareProject(repo), 'Cloudflare project ' + suggestCloudflareProject(repo));
  set('cloudflare_mode', 'git_connected', 'Cloudflare: Git-connected (the normal Findable setup)');
  set('cloudflare_account', DEFAULT_CLOUDFLARE_ACCOUNT, 'Cloudflare account ' + DEFAULT_CLOUDFLARE_ACCOUNT);
  set('canonical_domain', domainFromSite(i.existingSiteUrl || fact('website')), 'Web address ' + domainFromSite(i.existingSiteUrl || fact('website')));
  if (type === 'visual_rebuild' || type === 'close_recreation') set('source_site_url', i.existingSiteUrl, 'Current website ' + i.existingSiteUrl);

  /* Template: the one template if blank; mobile unless a VERIFIED address says customers may visit. */
  if (type === 'template') {
    if (!templateById(s.template_id) && WEBSITE_TEMPLATES.length === 1) { s = { ...s, template_id: WEBSITE_TEMPLATES[0].id }; changes.push('Template ' + WEBSITE_TEMPLATES[0].name); }
    if (!s.mapping.fields.mobile_or_premises && !fact('address')) {
      s = { ...s, mapping: { ...s.mapping, fields: { ...s.mapping.fields, mobile_or_premises: 'mobile' } } };
      changes.push('No public address on the site (no verified address)');
    }
  }

  /* The page plan (non-template) and the content intents — only where nothing is decided yet. */
  const truth = clientServices({ ...i, state: s, facts: rows });
  const areas = fact('service_areas').split(/[,;\n]/).map((x) => x.trim()).filter(Boolean);
  if (type !== 'template' && type !== '' && type !== 'optimise' && !s.pages.length) {
    const plan = autoPagePlan(truth.services, areas);
    s = { ...s, pages: plan };
    changes.push('Page plan: ' + plan.length + ' pages (' + plan.filter((p) => p.family === 'service').length + ' service pages)');
  }
  const t = type === 'template' ? templateById(s.template_id) : null;
  const pagesForIntents = t ? t.defaultPageFamilies.filter((f) => ['homepage', 'services_index', 'about', 'contact'].includes(f.family)) : s.pages.filter((p) => p.action === 'keep' || p.action === 'create');
  const servicePages = t ? truth.services.length : s.pages.filter((p) => p.family === 'service' && (p.action === 'keep' || p.action === 'create')).length;
  const intents = autoIntents(s.quality, pagesForIntents, servicePages);
  if (CONTENT_INTENTS.some((k) => !s.quality.intents[k]?.need)) { s = { ...s, quality: { ...s.quality, intents } }; changes.push('Content plan assessed'); }

  /* The enquiry form: the verified email, switched on only when the save would be accepted (the server
     runs the same siteFormProblems and refuses the whole save otherwise). */
  if (!s.form.enabled) {
    const email = fact('email');
    const draft = readSiteForm({ ...s.form, site_key: s.form.site_key || suggestSiteKey(s.cloudflare_project), recipient: s.form.recipient || email.toLowerCase() });
    const route = i.serviceRoute ?? null;
    if (email && ctx.active && !siteFormProblems({ form: draft, canonicalDomain: s.canonical_domain, cloudflareProject: s.cloudflare_project, verifiedEmails: [email], clientRoute: route, ended: !ctx.active }).length) {
      s = { ...s, form: { ...draft, enabled: true, enabled_at: new Date().toISOString() } };
      changes.push('Enquiry form on \u2192 ' + draft.recipient);
    }
  }
  return { state: s, changes };
}

/** Has Prepare run (or been done by hand)? Derived from the record, never a stored flag. */
export function isPrepared(s: WebsiteBuildState): boolean {
  const type = resolveBuildType(s);
  return !!(s.repo_name && s.local_repo_path && s.cloudflare_project && s.cloudflare_mode && s.github_owner
    && CONTENT_INTENTS.every((k) => !!s.quality.intents[k]?.need)
    && (type === 'template' || s.pages.length > 0));
}

/* ── 3. PROBLEMS, NOT CHECKLISTS ──────────────────────────────────────────────────────────────── */

export type IssueLevel = 'blocker' | 'decide' | 'launch';
export type IssueFix =
  | { kind: 'fact'; key: string; label: string; options: string[]; input: boolean }
  | { kind: 'switch_type'; to: BuildType; label: string }
  | { kind: 'confirm_rights' }
  | { kind: 'domain' }
  | { kind: 'premises' }
  | { kind: 'link'; href: string; label: string };
export interface BuildIssue { id: string; level: IssueLevel; title: string; detail: string; fixes: IssueFix[] }

export interface SimpleInput {
  pack: BuildPackInput;
  onboarding: Record<string, unknown> | null;
  leadId: string;
  /** The old site's URLs from the stored crawl (crawlOldUrls). */
  oldUrls: ReadonlyArray<{ url: string; kind?: string }>;
  /** The domain-authority verdict for the onboarding row (null = not known). */
  domain: { applies: boolean; ready: boolean; reasons: string[] } | null;
  ended: boolean;
}

const quoted = (note: string) => [...note.matchAll(/"([^"]{1,200})"/g)].map((m) => m[1].trim()).filter(Boolean);
const options = (r: FactRow | undefined) => [...new Set([r?.value ?? '', ...quoted(r?.note ?? '')].map((x) => x.trim()).filter(Boolean))];

export function simpleIssues(x: SimpleInput): BuildIssue[] {
  const i = trustedPack(x.pack), s = i.state;
  const type = resolveBuildType(s);
  const out: BuildIssue[] = [];
  const row = (k: string) => i.facts.find((f) => f.key === k);
  /* What WILL be published once Prepare has run: verified, or a value Prepare accepts by the truth order. */
  const pub = (k: string) => { const r = row(k); return !!r && (isPublishable(r) || autoAcceptFacts([r]).length > 0); };
  const hub = '/paid-clients/' + x.leadId;

  /* Build or Optimise — the money decides, from the client's own records. */
  if (i.serviceRoute === 'optimise') {
    out.push({ id: 'optimise-client', level: 'blocker', title: 'Findable Optimise client — no new site', detail: OPTIMISE_BUILD_REFUSAL, fixes: [{ kind: 'link', href: '/page-generator?mode=service&client=' + encodeURIComponent(x.leadId), label: 'Open the page generator' }] });
    return out;
  }
  if (i.serviceRoute === null || i.serviceRoute === undefined) {
    out.push({ id: 'route', level: 'blocker', title: 'Build or Optimise is not settled', detail: (i.routeSource ? i.routeSource + '. ' : '') + 'Record the client\u2019s plan on the client page before a site is built.', fixes: [{ kind: 'link', href: hub, label: 'Open the client page' }] });
  }
  if (!type) return out;

  /* Identity. */
  const name = row('business_name');
  if (!pub('business_name')) out.push({ id: 'business_name', level: 'blocker', title: 'No confirmed business name', detail: name?.value ? 'On record: "' + name.value + '"' + (name.note ? ' \u2014 ' + name.note : '') : 'Nothing on record.', fixes: [{ kind: 'fact', key: 'business_name', label: 'Business name', options: options(name), input: true }] });
  if (!pub('phone') && !pub('email')) out.push({ id: 'contact', level: 'blocker', title: 'No confirmed phone or email', detail: 'A site needs at least one way for customers to reach them.', fixes: [{ kind: 'fact', key: 'phone', label: 'Phone number', options: options(row('phone')), input: true }, { kind: 'fact', key: 'email', label: 'Email', options: options(row('email')), input: true }] });

  /* Contradictions in the facts that would be published. */
  for (const k of ['business_name', 'phone', 'email', 'address', 'primary_town']) {
    const r = row(k);
    if (!r || r.decided || r.status !== 'detected' || !isContested(r) || autoAcceptFacts([r]).length) continue;
    if (k === 'business_name' && out.some((o) => o.id === 'business_name')) continue;
    out.push({ id: 'conflict-' + k, level: 'blocker', title: r.label + ': the records disagree', detail: r.note, fixes: [{ kind: 'fact', key: k, label: r.label, options: options(r), input: true }] });
  }
  const svc = clientServices(i);
  if (svc.contradictions.length) out.push({ id: 'service-contradiction', level: 'blocker', title: 'Service listed as offered AND not offered', detail: svc.contradictions.join(', ') + ' \u2014 the client\u2019s answers contradict each other. Fix their onboarding answer.', fixes: [{ kind: 'link', href: hub, label: 'Fix in onboarding' }] });

  /* The build type's own needs. */
  if (type === 'optimise') return out;
  const oldSite = i.existingSiteUrl;
  if ((type === 'visual_rebuild' || type === 'close_recreation') && !oldSite) {
    out.push({ id: 'no-old-site', level: 'blocker', title: 'No current website on record to rebuild from', detail: 'A rebuild needs the live site to work from.', fixes: [{ kind: 'switch_type', to: 'template', label: 'Use a Findable template instead' }, { kind: 'fact', key: 'website', label: 'Current website', options: options(row('website')), input: true }] });
  }
  if (type === 'close_recreation') {
    const rights = recreationRights(s, x.onboarding);
    if (rights !== 'confirmed') out.push({ id: 'rights', level: 'blocker',
      title: rights === 'refused' ? 'The client does not own the current site\u2019s design' : 'Reproduction rights are not confirmed',
      detail: rights === 'refused' ? 'Their answer says an agency or developer owns it. A close recreation would copy work that is not theirs \u2014 build a visual rebuild instead.' : 'A close recreation copies the current design, words and images. Only do it if the client confirms they own them or may reuse them. Otherwise a visual rebuild is the safe choice.',
      fixes: [{ kind: 'switch_type', to: 'visual_rebuild', label: 'Switch to Visual rebuild (recommended)' }, ...(rights === 'unclear' ? [{ kind: 'confirm_rights' } as IssueFix] : [])] });
  }
  if (!s.canonical_domain) out.push({ id: 'domain-unknown', level: 'blocker', title: 'Which web address will the site live on?', detail: 'Needed for canonicals, the sitemap and the business schema. It can be a new domain the client is registering.', fixes: [{ kind: 'domain' }] });

  /* A template that cannot be filled: its own readiness, in Paul's words. */
  if (type === 'template') {
    const t = i.template;
    if (!t) out.push({ id: 'template', level: 'blocker', title: 'Choose a template', detail: 'Pick one of the Findable layouts below.', fixes: [] });
    else {
      const m = computeMapping(s, t, i.facts, i.businessName);
      if (tradeFit(i.facts.find((f) => f.key === 'trade')?.value ?? '', t) === 'weak') out.push({ id: 'template-fit', level: 'decide', title: t.name + ' was built for ' + t.primaryTrade + 's', detail: 'Its service pages are for that trade. If this client\u2019s services do not fit, a visual rebuild or a new template is better.', fixes: [] });
      if (s.mapping.fields.mobile_or_premises === undefined && pub('address')) out.push({ id: 'premises', level: 'blocker', title: 'Do customers visit their address?', detail: 'Yes = the address is shown on the site; No = a mobile business, no public address.', fixes: [{ kind: 'premises' }] });
      for (const b of m.readiness.blockers) {
        if (/mobile or premises/i.test(b) && out.some((o) => o.id === 'premises')) continue;
        if (/^(Business name|Phone|Email)\b/.test(b) && out.some((o) => o.id === 'business_name' || o.id === 'contact' || o.id.startsWith('conflict-'))) continue;
        if (/^Domain\b/.test(b) && out.some((o) => o.id === 'domain-unknown')) continue;
        if (/^At least \d+ service must be included/.test(b)) {
          out.push({ id: 'template-services', level: 'blocker', title: t.name + ' has no pages for this client’s services', detail: 'It only builds ' + t.primaryTrade + ' service pages. ' + (oldSite ? 'Use a Visual rebuild of their current site instead.' : 'Choose a bespoke build in Advanced (a fresh design from their facts) until a template for their trade exists.'), fixes: oldSite ? [{ kind: 'switch_type', to: 'visual_rebuild', label: 'Use a Visual rebuild instead' }] : [] });
          continue;
        }
        const key = /^Phone/.test(b) ? 'phone' : /^Email/.test(b) ? 'email' : /^Base location/.test(b) ? 'primary_town' : /^Business name/.test(b) ? 'business_name' : '';
        out.push({ id: 'map-' + slugify(b).slice(0, 40), level: 'blocker', title: b, detail: 'The template needs it to build.', fixes: key ? [{ kind: 'fact', key, label: row(key)?.label ?? key, options: options(row(key)), input: true }] : [] });
      }
    }
  }

  /* Things Paul should look at — nothing stops the preview. */
  if (!pub('primary_town') && !out.some((o) => o.id === 'conflict-primary_town' || o.id.startsWith('map-base'))) {
    const r = row('primary_town');
    out.push({ id: 'home-town', level: 'decide', title: 'Home town not confirmed', detail: r?.value ? 'On record: "' + r.value + '" (' + (r.source || 'records') + '). Until you confirm it the site names no home town.' : 'Nothing on record \u2014 the site names no home town until you add it.', fixes: [{ kind: 'fact', key: 'primary_town', label: 'Home town', options: options(r), input: true }] });
  }
  if (!svc.services.length) out.push({ id: 'no-services', level: 'decide', title: 'No services confirmed by the client', detail: 'The site gets no service pages \u2014 only what the confirmed facts say. Ask the client for their list (onboarding).', fixes: [{ kind: 'link', href: hub, label: 'Open the client page' }] });
  else if (!svc.clientConfirmed) out.push({ id: 'services-sales', level: 'decide', title: 'Services come from sales notes, not the client', detail: svc.services.join(', ') + '. Fine for the preview; confirm them with the client before launch.', fixes: [{ kind: 'link', href: hub, label: 'Open the client page' }] });
  for (const k of ['accreditations', 'credentials_on_site', 'guarantees_on_site', 'experience_on_site']) {
    const r = row(k);
    if (!r || r.status !== 'detected' || !r.value) continue;
    out.push({ id: 'claim-' + k, level: 'decide', title: 'Not confirmed: ' + r.label.replace(/ \(.*\)$/, ''), detail: '"' + r.value.slice(0, 160) + '" \u2014 the site leaves it out unless you confirm it is true and current.', fixes: [{ kind: 'fact', key: k, label: r.label, options: [r.value], input: false }] });
  }

  /* Only before go-live. */
  if (x.domain && x.domain.applies && !x.domain.ready) out.push({ id: 'domain-handoff', level: 'launch', title: 'Preview can be built now. Domain handoff required before launch.', detail: x.domain.reasons.join('; ') + '. Resolved by: the client giving access, their authorised agency / provider changing the DNS, or using a new / different domain. We never take over a domain without the owner\u2019s authority.', fixes: [{ kind: 'link', href: hub, label: 'Domain answers on the client page' }] });
  if (!pub('email')) out.push({ id: 'form-email', level: 'launch', title: 'The enquiry form has nowhere to send', detail: 'Confirm the business email and the form switches itself on.', fixes: [{ kind: 'fact', key: 'email', label: 'Email', options: options(row('email')), input: true }] });
  return out;
}

export const blockers = (issues: readonly BuildIssue[]) => issues.filter((x) => x.level === 'blocker');

/* ── 4. THE MASTER BUILD PROMPT ───────────────────────────────────────────────────────────────── */

export const MASTER_PROMPT_VERSION = 'master-build-1';
const H = (x: string) => ['', '## ' + x, ''];

function typeLines(type: ResolvedBuildType, i: BuildPackInput): string[] {
  const t = i.template, s = i.state;
  if (type === 'template' && t) return [
    'NEW SITE \u2014 FINDABLE TEMPLATE: ' + t.name + ' (v' + t.version + '). Start from the template; fill it ONLY with this client\u2019s data (section 6).',
    'It does NOT imitate the client\u2019s old website. Inherit the template\u2019s design system exactly (tokens, type scale, components, spacing, mobile patterns); colours change only to the client\u2019s VERIFIED brand colours or their own logo\u2019s colours.',
    ...(t.sourceKind === 'live_client_repo' ? ['\u26d4 The template is a LIVE CLIENT\u2019S SITE (' + t.sourceClient + '): copy its STRUCTURE (layouts, components, design tokens, schema and check scripts), never its content \u2014 no fact, review, price, photo, logo, script key, legacy URL or record of theirs may reach this build.'] : []),
  ];
  if (type === 'close_recreation') return [
    'CLOSE RECREATION OF THE CURRENT SITE. The client has confirmed they own, or may reuse, its design, words and images (' + (s.copy_ownership ? COPY_OWNERSHIP_LABELS[s.copy_ownership] : 'their onboarding answer') + ').',
    'Recreate its STRUCTURE and VISUAL CHARACTER \u2014 section order, layout, typography, colours, spacing, card and button styles, sticky / floating elements, mobile behaviour \u2014 and its business-owned content and assets, with the code rebuilt cleanly (static Astro). Never copy a third party\u2019s proprietary template code or theme files; recreate the look, do not lift the implementation.',
    'Improve only what is broken or weak for search and AI visibility (structure, headings, internal links, schema, speed, mobile). Accurate existing wording may be kept.',
  ];
  if (type === 'visual_rebuild') return [
    'VISUAL REBUILD / IMPROVEMENT. The current public website is the REFERENCE for the brand (logo, colours, the business\u2019s own imagery), the business information, the services and the useful content. Build a clearly IMPROVED Findable site \u2014 recognisably the same business, visibly better.',
    'No CMS access is needed and none is asked for: everything comes from the public site and section 1.',
    'Copy: keep the FACTS; write the marketing wording freshly (do not reproduce the old site\u2019s marketing passages verbatim).' + (mayPreserveCopy(s.copy_ownership) ? ' The client owns the old wording, so an accurate passage may be kept where it is genuinely good.' : ''),
  ];
  return [
    'BESPOKE BUILD (set up before the simple flow). A fresh design from the confirmed facts and the plan in section 6.',
    ...(s.design_references ? ['Design references Paul chose (look, never content): ' + s.design_references] : []),
    ...(i.existingSiteUrl ? ['The current site is a CONTENT and BRAND reference, not a design to reproduce.'] : []),
  ];
}

function oldSiteLines(i: BuildPackInput, oldUrls: ReadonlyArray<{ url: string }>): string[] {
  const site = i.existingSiteUrl;
  const paths = [...new Set(oldUrls.map((u) => toPath(u.url)).filter(Boolean))].slice(0, 300);
  return [
    'Current website: ' + site + ' \u2014 OPEN IT AND READ IT YOURSELF in a real browser (Playwright), scrolled to the bottom, desktop 1440\u00d7900 and mobile 390 wide. Never rebuild from this text alone.',
    'Gather, without asking Paul: the navigation, every page and what it is for, the service content and headings, the branding (logo, colours, fonts), the public images, the contact details, every claim it makes, the service areas, and the structure worth keeping. Save what you read under capture/ (screenshots, notes) \u2014 never submit its forms.',
    'Facts it states: use the ones section 1 also confirms. A fact ONLY the old site states (and section 1 does not contradict) may be used if it is a plain description (what they do, where, how to contact them); a TRUST CLAIM (credentials, memberships, insurance, years, 24/7, response times, reviews, awards, guarantees, prices) is NOT published unless section 1 verifies it \u2014 list each one in warnings as "FACT CHECK: <claim> \u2014 <page>" so Paul can confirm it.',
    ...STRENGTH_RECON_LINES,
    '  Report the inventory in quality.strengths with your no-downgrade decision for each (preserve / modernise / improve, and WHERE on the new site; remove only with a reason).',
    ...(paths.length ? ['', 'Old web addresses LeadFinderOS has on record (' + paths.length + '). Each one that will not exist at the same path gets ONE 301 in public/_redirects to the page that now owns its intent; report counts in "redirects" and anything with no sensible home in redirects.unresolved:', '    ' + paths.join('  ')] : ['', 'LeadFinderOS has no list of the old site\u2019s addresses: build one from its sitemap / navigation and redirect each that moves (one hop, to the page that owns its intent).']),
    ...(i.evidence.crawlFindings.length ? ['', ...crawlSection(i.evidence)] : []),
    '', ...doNotBreak(i.evidence),
  ];
}

function assetLines(i: BuildPackInput, m: Mapping): string[] {
  const plan = assetsToDownload(i, m);
  return [
    'USE (when they appear on the client\u2019s own site, or the client supplied them): the business\u2019s own logo; their own photos \u2014 team, vans, premises, finished jobs and projects; graphics the business made. Download each into the repo (originals to capture/assets/original/, web copies to public/images/ \u2014 WebP/AVIF, longest edge \u2264 2400px; SVG as-is). Never hotlink.',
    '\u26a0 DO NOT ASSUME OWNERSHIP of: stock photography, manufacturer / product imagery, directory or platform badges (Checkatrade, TrustATrader, Which?, Google, Facebook), other companies\u2019 logos, or agency-made proprietary artwork. Leave them out and list each in warnings as "ASSET CHECK: <url> \u2014 <why>" for Paul.',
    'Accreditation and membership badges (Gas Safe, NICEIC, NAPIT, TrustMark, Checkatrade\u2026): ONLY when section 1 verifies that membership, and only in the form that scheme allows. Never a fake, redrawn or generic badge.',
    'No photo for a role: design the section without one. Never a stock or AI image passed off as their work, team, van or job; never a before / after you were not given.',
    'Map (areas): an OpenStreetMap-based render with "\u00a9 OpenStreetMap contributors" visible, or one the client supplied \u2014 never a Google Maps screenshot.',
    ...(plan.list.length ? ['', 'Assets already approved in LeadFinderOS (use these first):', ...assetPlanLines(plan, safeAssetName)] : []),
  ];
}

function setupLines(i: BuildPackInput): string[] {
  const s = i.state, t = i.template && s.route === 'template_rebuild' ? i.template : null;
  const path = winPath(s.local_repo_path || MARK.path);
  const owner = s.github_owner || MARK.owner, repo = s.repo_name || MARK.repo;
  const remote = 'https://github.com/' + owner + '/' + repo + '.git';
  const parent = path.replace(/\\[^\\]+$/, '');
  return [
    '- Work ONLY in ' + path + ' (Paul opened you there). It may be empty, or already hold THIS client\u2019s project from an earlier run (then continue it). If it holds anything else, STOP and tell Paul.',
    '- The client\u2019s own repository: ' + remote + ' (private). Before the first push run "git remote -v": origin must be exactly that. If the repository does not exist on GitHub yet, STOP and tell Paul in one line: "Create an EMPTY private repository ' + repo + ' under ' + owner + ' at https://github.com/new (no README), then tell me done."',
    ...(t ? [
      '- Start from the template: clone ' + t.sourceRepoUrl + ' to ' + parent + '\\_templates\\' + templateCacheName(t) + ' (or "git fetch origin" there), "git checkout --detach ' + t.sourcePinnedCommit + '" (the pinned commit \u2014 never the moving branch), and copy it into ' + path + ' WITHOUT its .git folder. The template repository is READ-ONLY: never commit, push or branch there.',
      '- \u26d4 Inherited hazards \u2014 fix each in the client copy: ' + t.inheritedHazards.join(' \u00b7 '),
      '- The seed-client values that must not survive anywhere (source and built output): ' + t.leftoverNeedles.join(' \u00b7 '),
    ] : ['- A fresh static Astro project (the Findable stack): npm create astro@latest (minimal template), then Tailwind and the sitemap integration. Every business fact lives in ONE config module (src/lib/siteConfig.ts) that pages and components read; nothing client-specific hard-coded in a component.']),
    '- Safe git only: logical commits, push main after each finished page family. \u26d4 Never force push, reset, rebase, amend or git clean. Never commit secrets.',
  ];
}

export interface MasterPrompt { text: string; blockedBy: string[]; configVersion: string }

/** THE one prompt Paul copies. Refused (no text) while a blocker stands — the screen shows the blockers instead. */
export function masterBuildPrompt(x: SimpleInput): MasterPrompt {
  const i = trustedPack(x.pack), s = i.state;
  const type = resolveBuildType(s);
  const issues = simpleIssues(x);
  const stop = blockers(issues).map((b) => b.title);
  const m = computeMapping(s, i.template, i.facts, i.businessName);
  const ver = configVersion(m);
  if (!type || type === 'optimise') stop.unshift(type === 'optimise' ? 'Optimise is not a new-site build' : 'Choose what we are building');
  else if (!isPrepared(s)) stop.unshift('Press Prepare website first');
  if (stop.length) return { blockedBy: stop, configVersion: ver, text: 'NOT READY \u2014 no Master Build Prompt has been generated.\n\nSort these in LeadFinderOS first:\n' + stop.map((b) => '- ' + b).join('\n') };

  const t = type === 'template' ? i.template : null;
  const cfg = codeConfig(s, i.template);
  const domain = s.canonical_domain;
  const preview = stablePreviewUrl(s);
  const hasOld = !!i.existingSiteUrl && type !== 'template';
  const svc = clientServices(i);
  const map = siteIntentMap(i, m);
  const inPlace = sameDomainRebuild(i.existingSiteUrl, domain);
  const L: string[] = [
    '# MASTER BUILD \u2014 ' + (i.businessName || 'this client'),
    '',
    'LeadFinderOS ' + MASTER_PROMPT_VERSION + ' \u00b7 build type: ' + BUILD_TYPE_INFO[type].label + ' \u00b7 config ' + ver + ' \u00b7 generated ' + (i.generatedAt ?? new Date().toISOString()),
    '',
    'You are building the new website for ' + (i.businessName || 'this business') + ' for Findable, end to end: set up \u2192 build \u2192 push \u2192 deploy a PREVIEW \u2192 QA \u2192 the site gate \u2192 one result. Read the whole brief first.',
    'Paul, who runs this, is not technical: never ask him to edit code, config or files. Work autonomously; stop only for a fact you genuinely cannot find (ask ONE plain question, carry on with everything else) or an operator action this brief names.',
    'The site will be MEASURED: AI engines are re-asked the client\u2019s baseline questions after launch. Make the business easy to find, crawl, understand, verify and cite \u2014 honestly.',
    '',
    '\u26d4 VERIFIED FACTS MAY BE USED. UNVERIFIED FACTS MUST NOT BE PUBLISHED. \u26d4 PREVIEW ONLY: never production, never a custom domain, never DNS.',
    ...H('1. THE CLIENT \u2014 confirmed facts (the ONLY business facts the site may state)'),
    ...verifiedFactLines(i.facts),
    '- Web address the site is built for: https://' + domain,
    ...(i.existingSiteUrl ? ['- Current website: ' + i.existingSiteUrl] : ['- The client has no current website.']),
    '- Services the client confirmed' + (svc.clientConfirmed ? '' : ' (from sales notes \u2014 Paul confirms before launch)') + ': ' + (svc.services.join(', ') || '(none confirmed \u2014 describe only what the facts above say)'),
    ...(svc.notOffered.length ? ['- \u26d4 The client does NOT offer: ' + svc.notOffered.join(', ') + '. Never describe them as offering it, anywhere.'] : []),
    ...H('2. NOT TO BE PUBLISHED'),
    ...forbiddenFactLines(i.facts),
    ...(t ? ['', ...claimMappingLines(t, i.facts)] : []),
    ...(i.mustNotSay ? ['', '\u26d4 THE CLIENT HAS SAID WE MUST NOT SAY: ' + i.mustNotSay] : []),
    ...H('3. WHAT YOU ARE BUILDING'),
    ...typeLines(type, i),
    ...(hasOld || (type === 'template' && i.existingSiteUrl) ? [...H('4. THE CURRENT WEBSITE'), ...(type === 'template'
      ? ['Current website: ' + i.existingSiteUrl + ' \u2014 read it for facts, the logo and the business\u2019s own photos only (section 5). The new site does not imitate it.']
      : oldSiteLines(i, x.oldUrls))] : []),
    ...H('5. ASSETS'),
    ...assetLines(i, m),
    ...H('6. SITE PLAN \u2014 one primary page per important intent'),
    ...(t ? templateConfigSection(i, m) : pageLines(s)),
    '',
    '- Before adding ANY page ask: does an existing page already own this intent? If yes, improve that page instead. No duplicate service pages, no near-duplicates, no cloned town pages, no doorway pages, no hundreds of FAQs.',
    '- A service page exists only for a genuine confirmed service with its own customer intent. It makes clear BUSINESS \u2192 SERVICE \u2192 LOCATION \u2192 EVIDENCE: what the service is, who needs it, what is included, where it is offered, why the business is credible.',
    '- No page per town. The home page owns "<trade> in <home town>". A town gets its own page only with genuinely local information Paul supplied (never the same page with a different town name).',
    '',
    ...siteIntentMapLines(map, i),
    ...H('7. CONTENT'),
    ...contentRules(i),
    '',
    'Every important answer: CUSTOMER QUESTION \u2192 DIRECT ANSWER \u2192 SUPPORTING DETAIL \u2192 EVIDENCE, early on the page, in plain HTML that search engines and AI systems can extract. No generic AI filler, no huge word counts, no thin FAQ pages, no hidden AI-only text, no llms.txt, no fake citations, no schema stuffing.',
    '',
    ...QUALITY_STANDARD_LINES,
    ...H('8. AI VISIBILITY AND TECHNICAL \u2014 the Findable website standard'),
    ...FINDABLE_STANDARD,
    '',
    ...seoVisibilityLines(domain),
    '- Astro static build for Cloudflare Pages; astro.config "site" = https://' + domain + '; directory URLs with trailing slashes; a real 404 page; sensible performance (sized, compressed images; no blocking scripts).',
    '- OAI-SearchBot check: after the preview deploy, fetch ' + preview + '/ with the user agent "OAI-SearchBot" (and "ChatGPT-User") \u2014 it must get the real page (200, the content, not a challenge). The site gate below checks it too.',
    '',
    ...baselineProtection(i.evidence),
    ...H('9. DESIGN'),
    ...(type === 'template' ? ['- The template\u2019s design system, as section 3 says. Mobile-first; clear hierarchy; bold, obvious call / enquiry buttons.']
      : ['- Keep the useful existing brand identity: the genuine logo (never redrawn), the genuine palette, the business\u2019s own photography. Never an accidental rebrand.',
         '- Improve hierarchy and readability; mobile-first; accessible contrast; a clear call / WhatsApp (only a verified number) / enquiry route on every page.']),
    ...(s.notes ? ['- Paul\u2019s notes: ' + s.notes] : []),
    ...(s.primary_cta ? ['- Main call to action (Paul\u2019s words, every page): ' + s.primary_cta] : []),
    ...H('10. FUNCTIONAL'),
    '- Contact details from section 1 only, identical everywhere; tel: links in a dialable form; mailto: for the email.',
    ...enquiryFormLines(s),
    '- Legal: a privacy policy page (what the enquiry form collects, who receives it, how to ask for deletion). A cookie notice only if a non-essential cookie or tag is actually used. No analytics or ads tags on the preview.',
    '- Map / location: the address only if section 1 verifies it and customers visit; otherwise the service areas in words (and the licensed map, section 5).',
    ...H('11. QUALITY GATE \u2014 never'),
    'No invented services \u00b7 no invented towns \u00b7 no invented credentials \u00b7 no fake reviews \u00b7 no fake awards \u00b7 no unsupported claims \u00b7 no cloned town pages \u00b7 no duplicate intent pages.',
    ...DO_NOT_INVENT_LINES,
    '',
    ...BUILD_STANDARD_LINES.map((l) => '- ' + l),
    ...H('12. SET UP, BUILD AND DEPLOY THE PREVIEW'),
    ...setupLines(i),
    '- Build: "' + cfg.buildCommand + '" (output ' + cfg.outputDir + '/) must pass at every commit.',
    ...(t ? [] : ['- Search the source and ' + cfg.outputDir + '/ for ' + (inPlace ? 'files hotlinked from the old site, links to old-only paths, placeholder text or another business\u2019s details' : 'the old domain in canonicals / links / schema, placeholder text and any other business\u2019s details') + '. Any hit blocks the preview: list it in seedHits, qa.seedContaminationPassed false.']),
    ...previewDeploySteps(deployInputFor(s, i.template)),
    '- Confirm noindex on the preview: curl -sI ' + preview + '/ must show an X-Robots-Tag noindex header.',
    '- \u26d4 Never the production branch (' + cloudflareBranches(s).production + '), never a custom domain, never DNS, never ask for or store a credential.',
    ...H('13. OPEN BOTH SITES AND COMPARE'),
    ...(hasOld ? [
      'Open the CURRENT LIVE SITE (' + i.existingSiteUrl + ') and the NEW PREVIEW (' + preview + ') side by side, at 1440\u00d7900 and 390 wide (Playwright screenshots under qa/compare/, matching viewports). Compare, page family by page family:',
      '  branding \u00b7 layout \u00b7 missing content \u00b7 business facts \u00b7 service coverage \u00b7 imagery \u00b7 navigation \u00b7 contact information.',
      'Fix every place the new site is missing something genuine or is weaker, redeploy the preview, and compare again.',
      ...UPGRADE_QA_LINES,
    ] : ['No old site: open the NEW PREVIEW (' + preview + ') at 1440\u00d7900, 768 and 390 wide and look at every page. Nothing sparse, nothing unfinished, real contact routes prominent.']),
    ...H('14. QA AND THE FINDABLE SITE GATE \u2014 the automatic check LeadFinderOS trusts'),
    '- Responsive: 1440, 1024, 768, 390 and 375\u00d7667 \u2014 no horizontal scroll; navigation, hero, cards, buttons, footer, images and the form (fill, never submit to the client) all correct.',
    ...siteGateLines(cfg.outputDir, domain, preview),
    ...H('15. REPORT'),
    'First, for Paul in plain English (short): what you built (pages per family), what you left out and why, every FACT CHECK and ASSET CHECK, anything he must do. Then ONE json block, last:',
    ...BUILD_RESULT_SCHEMA_LINES,
    '',
    ...BUILD_RESULT_RULES,
  ];
  return { text: L.join('\n'), blockedBy: [], configVersion: ver };
}

/* ── 5. THE TERMINAL STEPS BESIDE IT ──────────────────────────────────────────────────────────── */

export interface TerminalStep { title: string; detail: string; command?: string; link?: { href: string; label: string } }

/** Opens Claude Code in the client's folder (PowerShell, one line). */
export const openClaudeCommand = (s: WebsiteBuildState) => {
  const p = winPath(s.local_repo_path || MARK.path);
  return 'New-Item -ItemType Directory -Force -Path "' + p + '" | Out-Null; Set-Location "' + p + '"; claude';
};

export function terminalSteps(x: SimpleInput): TerminalStep[] {
  const s = x.pack.state;
  const owner = s.github_owner || MARK.owner, repo = s.repo_name || MARK.repo;
  const started = !!s.build_execution.result_imported_at;
  return [
    ...(!s.repo_url && !started ? [{ title: 'Create the empty GitHub repository (first time only)', detail: 'Open github.com/new. Owner: ' + owner + ' \u00b7 Repository name: ' + repo + ' \u00b7 choose Private \u00b7 leave README, .gitignore and licence unticked \u00b7 press Create repository.', link: { href: 'https://github.com/new', label: 'Open github.com/new' } }] : []),
    { title: 'Open PowerShell and start Claude Code in the client\u2019s folder', detail: 'Press the Windows key, type PowerShell, press Enter. Paste this line and press Enter. If Claude asks whether to trust the folder, choose Yes.', command: openClaudeCommand(s) },
    { title: 'Paste the Master Build Prompt', detail: 'Press COPY MASTER BUILD PROMPT, click into Claude, press Ctrl+V, then Enter.' },
    { title: 'Let Claude build and deploy the preview', detail: 'It works on its own. If it asks something, answer in plain words. If it says the Cloudflare project is not connected yet, do the one-time Cloudflare steps below, then type: done' },
    { title: 'Bring the result back here', detail: 'Claude ends with a block of JSON. Select all of Claude\u2019s last message, copy it, and paste it into "Paste Claude\u2019s result" below.' },
    { title: 'Open the OLD SITE and the PREVIEW side by side', detail: 'Use the two buttons in Review. Windows key + \u2190 snaps one window to the left half, Windows key + \u2192 the other to the right.' },
    { title: 'Review, ask for changes, then launch \u2014 all on this page', detail: 'Tick what is right, write what is wrong, copy the correction prompt into the same Claude window.' },
  ];
}

/** The one-time Cloudflare dashboard steps for a Git-connected project. */
export function cloudflareOneTimeSteps(i: BuildPackInput): string[] {
  return i.state.cloudflare_mode === 'git_connected' ? dashboardSetupSteps(deployInputFor(i.state, i.template)) : [];
}

/* ── 6. AFTER THE BUILD — the automatic technical gate, the review, the corrections ────────────── */

export type TechnicalState = 'not_run' | 'passed' | 'failed';
export interface TechnicalCheck { state: TechnicalState; failures: string[]; warnings: string[]; assetChecks: string[]; factChecks: string[] }

const ASSET_CHECK = /^ASSET CHECK:\s*/i, FACT_CHECK = /^FACT CHECK:\s*/i;
export function technicalCheck(s: WebsiteBuildState, hasExistingSite: boolean = stateHasExistingSite(s)): TechnicalCheck {
  const b = s.build_execution;
  const assetChecks = b.warnings.filter((w) => ASSET_CHECK.test(w)).map((w) => w.replace(ASSET_CHECK, ''));
  const factChecks = b.warnings.filter((w) => FACT_CHECK.test(w)).map((w) => w.replace(FACT_CHECK, ''));
  const warnings = b.warnings.filter((w) => !ASSET_CHECK.test(w) && !FACT_CHECK.test(w));
  if (!b.result_imported_at) return { state: 'not_run', failures: [], warnings: [], assetChecks: [], factChecks: [] };
  const failures = [...new Set([
    ...(b.result_status === 'failed' ? ['The build did not finish'] : b.result_status === 'built' ? ['Built but the preview was not deployed'] : b.result_status === 'needs_attention' ? ['Claude reported checks that did not pass'] : []),
    ...b.errors,
    ...(b.result_status === 'preview_ready' ? previewReadyProblems(s, hasExistingSite).filter((p) => !/^\d+ error\(s\) reported$/.test(p)) : []),
    ...(b.redirects.unresolved.length ? [b.redirects.unresolved.length + ' old web address(es) have no new home: ' + b.redirects.unresolved.slice(0, 5).join(', ')] : []),
    ...b.redirects.issues.map((x) => 'Redirect: ' + x),
  ])];
  return { state: failures.length ? 'failed' : 'passed', failures, warnings, assetChecks, factChecks };
}

/** The correction prompt's input: Paul's words, plus the technical failures to fix, in one list. */
export function correctionsWithFailures(s: WebsiteBuildState, check: TechnicalCheck): WebsiteBuildState {
  if (check.state !== 'failed') return s;
  const lines = check.failures.map((f) => '- Fix the technical check: ' + f);
  return { ...s, corrections: [s.corrections.trim(), ...lines].filter(Boolean).join('\n') };
}

/** Tick / untick one review item: every QA key it owns follows. */
export function setReviewItem(s: WebsiteBuildState, key: string, on: boolean, hasExistingSite: boolean): WebsiteBuildState {
  const item = SIMPLE_REVIEW_ITEMS.find((x) => x.key === key);
  if (!item) return s;
  const qa = { ...s.qa };
  for (const k of item.qa) { if (on && (hasExistingSite || !['old_new_upgrade', 'strengths_kept'].includes(k))) (qa as Record<string, boolean>)[k] = true; else delete (qa as Record<string, boolean>)[k as QaKey]; }
  return { ...s, qa };
}

/* ── 7. PROGRESS — Gather · Prepare · Build · Review · Launch, derived ─────────────────────────── */

export const SIMPLE_STEPS = ['gather', 'prepare', 'build', 'review', 'launch'] as const;
export type SimpleStep = (typeof SIMPLE_STEPS)[number];
export const SIMPLE_STEP_LABELS: Record<SimpleStep, string> = { gather: 'Gather', prepare: 'Prepare', build: 'Build', review: 'Review', launch: 'Launch' };

export interface SimpleProgress { done: Record<SimpleStep, boolean>; current: SimpleStep | 'live'; status: string }
export function simpleProgress(x: SimpleInput, launch: readonly string[]): SimpleProgress {
  const s = x.pack.state;
  const type = resolveBuildType(s);
  const hasOld = !!trustedOldSite(x.pack) || stateHasExistingSite(s);
  const stops = blockers(simpleIssues(x)).length;
  const b = s.build_execution;
  const tech = technicalCheck(s, hasOld);
  const reviewed = SIMPLE_REVIEW_ITEMS.every((it) => reviewItemDone(s, it, hasOld)) && outstandingPreviewQa(s, hasOld).length === 0;
  const live = !!s.production_url && s.qa.production_checked === true;
  const done: Record<SimpleStep, boolean> = {
    gather: !!type && type !== 'optimise' && isPrepared(s),
    prepare: !!type && type !== 'optimise' && isPrepared(s) && stops === 0,
    build: !!b.result_imported_at && b.result_status !== 'failed',
    review: tech.state === 'passed' && reviewed,
    launch: live,
  };
  const current: SimpleProgress['current'] = live ? 'live' : SIMPLE_STEPS.find((k) => !done[k]) ?? 'launch';
  const status = !type ? 'Choose what we are building'
    : type === 'optimise' ? 'Optimise client \u2014 no new site'
    : live ? 'Live'
    : current === 'gather' ? 'Ready to prepare'
    : current === 'prepare' ? stops + ' thing' + (stops === 1 ? '' : 's') + ' need' + (stops === 1 ? 's' : '') + ' you'
    : current === 'build' ? (b.started_at ? 'Building \u2014 waiting for Claude\u2019s result' : 'Ready to build')
    : current === 'review' ? (tech.state === 'failed' ? tech.failures.length + ' technical thing' + (tech.failures.length === 1 ? '' : 's') + ' to fix' : 'Ready for review')
    : launch.length ? 'Approved \u2014 ' + launch.length + ' thing' + (launch.length === 1 ? '' : 's') + ' before launch' : 'Ready to launch';
  return { done, current, status };
}

/** The launch rule's problems in Paul's words: the review ticks are one line, not a list of QA keys. */
export function launchLines(problems: readonly string[]): string[] {
  const out = problems.map((p) => (/preview QA tick/.test(p) ? 'Finish the review checklist'
    : /^Preview not ready: /.test(p) ? 'Technical check: ' + p.replace(/^Preview not ready: /, '')
    : /^No build result imported$/.test(p) ? 'Build the preview with Claude and paste its result'
    : p.replace(/ — fix and re-run the build (Retry prompt)$/, ' — copy the correction prompt and paste the new result')));
  return [...new Set(out)];
}

