/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE SITE INTENT MAP + THE SITE QUALITY GATE REPORT (2026-09-30)

   Every build route ends in a static site. `scripts/site-quality-gate.mjs` reads that REAL output
   (robots, sitemap, canonicals, noindex, links, orphans, titles, H1s, schema, identity, cloned pages,
   intent ownership). This module is the LeadFinderOS side of it:

     siteIntentMap()        the approved decisions as the gate's --expect file: identity, services,
                            location pages, and every intent with the ONE page that owns it —
                            services, location pages, the assessed content intents, and the frozen
                            baseline questions grouped onto the page that should answer them
     readSiteGateReport()   the gate's JSON as it comes back in the build result (quality.siteGate)
     siteGateProblems()     why a report cannot count: not run, failed, a different domain, stale

   ⛔ The baseline questions are QA labels, never page copy. The map says which page must genuinely
      support a question; the gate FAILS a title or H1 that repeats one verbatim.
   ⛔ The gate's word beats Claude's: a failed gate is an error on import, whatever qa.* said.
   ⛔ Absent = not run = not Preview Ready (the build-standard pattern).
   ⚠️ Browser module (not edge-reachable). Never a backtick inside a template literal (§3).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import type { BuildPackInput } from './buildPack.ts';
/* Read the route directly (not buildPack's helper) so buildPack can import this module without a cycle. */
const isTemplateRoute = (s: { route: string }) => s.route === 'template_rebuild';
import type { Mapping } from './templateMapping.ts';
import { isPublishable } from './buildFacts.ts';
import { CONTENT_INTENTS, CONTENT_INTENT_LABELS } from './websiteQuality.ts';
import { findNamed, mentions, ownershipFor, type OwnedPage } from './intentOwnership.ts';

export const SITE_GATE_VERSION = 1;
/** Where the gate lives, for the client repository to fetch (LeadFinderOS main is the one copy). */
export const SITE_GATE_REPO_PATH = 'scripts/site-quality-gate.mjs';
/** LeadFinderOS's checkout on the build machine: only its ORIGIN/MAIN is read (a fetch updates the remote
 *  ref and never touches that checkout's working tree, which other sessions may be using). */
export const LEADFINDEROS_CHECKOUT = 'C:/Users/paulj/LeadFinderOS';
/** One command that works the same in PowerShell and bash (no redirection — PowerShell 5.1's ">" writes
 *  UTF-16, which Node cannot run; no "&&"). The GitHub CLI is not installed on this machine. */
export const SITE_GATE_FETCH = 'node -e "const fs=require(\'fs\'),cp=require(\'child_process\');cp.execSync(\'git -C ' + LEADFINDEROS_CHECKOUT + ' fetch -q origin main\');fs.mkdirSync(\'scripts\',{recursive:true});fs.writeFileSync(\'scripts/findable-site-gate.mjs\',cp.execSync(\'git -C ' + LEADFINDEROS_CHECKOUT + ' show origin/main:' + SITE_GATE_REPO_PATH + '\'))"';
export const SITE_GATE_EXPECT_FILE = 'qa/findable-expect.json';
export const SITE_GATE_REPORT_FILE = 'qa/site-gate.json';

export interface SiteIntent {
  /** What the intent is, in words — a QA label, never page copy. */
  intent: string;
  /** The page that owns it. '' = the builder fills in the path it built (template service pages). */
  page: string;
  service?: string;
  town?: string;
  /** services / locations / content / baseline — where the intent came from. */
  source: 'service' | 'location' | 'content' | 'baseline';
  /** The frozen baseline question, verbatim, when source = baseline (checked NOT to be a title / H1). */
  question?: string;
}
export interface SiteIntentMap {
  siteIntentMapVersion: 1;
  domain: string;
  businessName: string;
  phone: string;
  whatsapp: string;
  email: string;
  forbidHosts: string[];
  /** The VERIFIED prices only (Paul approves every price). The gate fails any other £ figure. */
  prices: string[];
  services: Array<{ name: string; page: string }>;
  locations: Array<{ name: string; page: string }>;
  intents: SiteIntent[];
  /** Baseline questions no planned page can own — Paul decides (a new page, or the home page). */
  unowned: string[];
}

const fact = (i: BuildPackInput, key: string) => { const r = i.facts.find((f) => f.key === key); return r && isPublishable(r) ? r.value.trim() : ''; };
const hostOf = (u: string) => { try { return new URL(/^https?:\/\//i.test(u) ? u : 'https://' + u).hostname.toLowerCase(); } catch { return ''; } };
/** The approved decisions as the gate's --expect file. Pure. Ownership is intentOwnership.ts — the
 *  same rule the page generator and the page-plan queue use. */
export function siteIntentMap(i: BuildPackInput, m: Mapping): SiteIntentMap {
  const s = i.state;
  const domain = (s.canonical_domain || '').toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  const live = s.pages.filter((p) => p.action === 'keep' || p.action === 'create');
  const catalogue = i.template?.serviceCatalogue ?? [];
  /* A template service's page: the plan's page for it, else the path the template builds for it. */
  const services: Array<{ name: string; page: string }> = isTemplateRoute(s)
    ? m.config.services.map((x) => ({ name: x.name, page: live.find((p) => p.family === 'service' && mentions(p.title, x.name))?.path ?? catalogue.find((c) => c.id === x.id)?.path ?? '' }))
    : live.filter((p) => p.family === 'service').map((p) => ({ name: p.title, page: p.path }));
  const townPages = isTemplateRoute(s) ? ((m.config.locations.pages as string[] | undefined) ?? []) : [];
  const locations: Array<{ name: string; page: string }> = isTemplateRoute(s)
    ? townPages.map((n) => ({ name: n, page: live.find((p) => p.family === 'location' && mentions(p.title, n))?.path ?? '' }))
    : live.filter((p) => p.family === 'location').map((p) => ({ name: p.title, page: p.path }));
  const home = live.find((p) => p.family === 'homepage')?.path || '/';
  const primary = fact(i, 'primary_town') || String((m.config.locations as Record<string, unknown>).primary ?? '');
  const served = [...(((m.config.locations as Record<string, unknown>).served as string[] | undefined) ?? []), ...fact(i, 'service_areas').split(/\s*[,;|]\s*/).filter(Boolean), ...locations.map((x) => bareTown(x.name, primary))];

  const intents: SiteIntent[] = [
    ...services.map((x) => ({ intent: x.name, page: x.page, service: x.name, source: 'service' as const })),
    ...locations.map((x) => ({ intent: x.name, page: x.page, town: bareTown(x.name, primary), source: 'location' as const })),
    ...CONTENT_INTENTS.filter((k) => s.quality.intents[k]?.need === 'needed' && s.quality.intents[k]?.page && !['service_pages', 'location_pages'].includes(k))
      .map((k) => ({ intent: CONTENT_INTENT_LABELS[k], page: s.quality.intents[k]!.page, source: 'content' as const })),
  ];

  /* The frozen baseline questions, each on the ONE page that already owns it (ownershipFor). A
     question no planned page owns — a new service-in-town page, an unapproved service or place — is
     Paul's decision, never a page the builder adds on its own. */
  const owned: OwnedPage[] = [
    ...services.map((x) => ({ page: x.page, label: x.name, kind: 'service' as const, service: x.name, source: 'page plan' })),
    ...locations.map((x) => ({ page: x.page, label: x.name, kind: 'location' as const, town: bareTown(x.name, primary), source: 'page plan' })),
    { page: home, label: 'Home page', kind: 'home' as const, source: 'page plan' },
  ];
  const ctx = { services: services.map((x) => x.name), towns: served, homeTown: primary };
  const unowned: string[] = [];
  for (const q of i.evidence.frozenQuestions ?? []) {
    const service = findNamed(q, ctx.services);
    const town = findNamed(q, [...served, ...(primary ? [primary] : [])]);
    const o = ownershipFor({ service: service || undefined, town: town || undefined, question: q, generic: !service }, owned, ctx);
    if (o.decision === 'improve_existing' && o.owner) intents.push({ intent: 'Baseline: ' + q, page: o.owner.page, ...(o.owner.kind === 'service' ? { service: o.owner.service } : {}), ...(o.owner.kind === 'location' ? { town: o.owner.town } : {}), source: 'baseline', question: q });
    else unowned.push(q);
  }

  const old = hostOf(i.existingSiteUrl);
  const forbidHosts = [
    ...(old && old.replace(/^www\./, '') !== domain.replace(/^www\./, '') ? [old.replace(/^www\./, '')] : []),
    ...(isTemplateRoute(s) && i.template ? i.template.forbiddenSeedValues.filter((v) => v.kind === 'domain').map((v) => /\./.test(v.value) ? v.value : v.value + '.com') : []),
  ];
  return {
    siteIntentMapVersion: 1, domain,
    businessName: fact(i, 'business_name') || i.businessName,
    phone: fact(i, 'phone'), whatsapp: fact(i, 'whatsapp_number'), email: fact(i, 'email'),
    forbidHosts: [...new Set(forbidHosts)], prices: fact(i, 'prices') ? fact(i, 'prices').split(/\s*[,;|]\s*/).filter(Boolean) : [], services, locations, intents, unowned,
  };
}
/** "Electrician in Bath" / "Bath" → "Bath": a location page's title names the trade too. */
function bareTown(title: string, primary: string): string {
  const m = title.match(/\bin\s+(.+)$/i);
  const t = (m ? m[1] : title).replace(/\s*[|–—-].*$/, '').trim();
  return t || primary;
}

/** The map as prompt lines (X6b). The JSON is what Claude saves as the gate's --expect file. */
export function siteIntentMapLines(map: SiteIntentMap, i: BuildPackInput): string[] {
  const empty = map.intents.filter((x) => !x.page).length;
  return [
    'Which page OWNS each intent — one primary page per intent, so pages support each other instead of competing. LeadFinderOS derived it from the approved page plan, services, location pages, content intents' + (i.evidence.frozenQuestions?.length ? ' and the ' + i.evidence.frozenQuestions.length + ' frozen baseline questions' : '') + '.',
    '- Each owning page states its service and / or place plainly in its title, H1 and opening answer, is in the sitemap, is linked from the home page or its hub (and from the related service / location pages where that genuinely helps the visitor), and carries the business entity in its structured data.',
    '- No other page leads (title / H1) with the same intent. A related page LINKS to the owner instead of repeating it.',
    '- ⛔ A baseline question is a QA label, NOT copy: never use one as a title, H1, slug or FAQ heading, and never add a page just to echo one. The page must genuinely answer what the customer is asking, in the business\'s own facts. The gate fails a title or H1 that repeats a question verbatim.',
    ...(empty ? ['- ' + empty + ' intent(s) below have page "" — fill each with the path you BUILT for it (the template names service / location paths); never leave one empty and never change a filled one.'] : []),
    ...(map.unowned.length ? ['- These baseline questions have NO owning page in the approved plan. Do NOT create pages for them — list each in warnings for Paul (he decides: a new page, or support on an existing one):', ...map.unowned.map((q) => '    · ' + q)] : []),
    '',
    'Save this as ' + SITE_GATE_EXPECT_FILE + ' (fill empty pages only):',
    '```json',
    JSON.stringify(map, null, 2),
    '```',
  ];
}

/** The X9b lines: fetch the gate, run it on the production build and on the preview, fix, report. */
export function siteGateLines(outputDir: string, domain: string, previewUrl: string): string[] {
  return [
    '- Fetch the gate into this repository (one copy, LeadFinderOS main): ' + SITE_GATE_FETCH,
    '  If that fails (no LeadFinderOS checkout at ' + LEADFINDEROS_CHECKOUT + ', or git cannot reach GitHub), STOP and report the operator action — never write your own checker instead.',
    '- Commit it with a package.json script: "gate": "node scripts/findable-site-gate.mjs --dist ' + outputDir + ' --expect ' + SITE_GATE_EXPECT_FILE + ' --json ' + SITE_GATE_REPORT_FILE + '" (domain ' + domain + ' comes from the expect file).',
    '- After the production build: npm run gate. Every FAIL is fixed in the SITE and the gate re-run until it passes. ⛔ Never edit, skip or weaken the gate or the expect file\'s filled values to make it pass.',
    '- Read every WARN and fix the genuine ones (a long title, an unsized image, a thin page); leave a justified one and say why in warnings.',
    '- After the preview deploy: node scripts/findable-site-gate.mjs --url ' + (previewUrl || 'https://<preview>.pages.dev') + ' --preview --expect ' + SITE_GATE_EXPECT_FILE + ' --json qa/site-gate-preview.json — it confirms the noindex header and that the search crawlers\' user agents get the real page.',
    '- Put the whole of ' + SITE_GATE_REPORT_FILE + ' in the result as quality.siteGate, and qa/site-gate-preview.json as quality.siteGatePreview. LeadFinderOS re-checks both.',
  ];
}

/* ── the report as it comes back ──────────────────────────────────────────────────────────────── */

export type GateLevel = 'pass' | 'warn' | 'fail' | 'skip';
export interface SiteGateCheck { id: string; label: string; level: GateLevel; details: string[] }
export interface SiteGateReport {
  reported: boolean;
  version: number | null;
  domain: string; mode: string; preview: boolean; pages: number;
  passed: boolean | null;
  checks: SiteGateCheck[];
}
export const EMPTY_SITE_GATE: SiteGateReport = { reported: false, version: null, domain: '', mode: '', preview: false, pages: 0, passed: null, checks: [] };

const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);
const str = (v: unknown, n: number) => (typeof v === 'string' ? v : v == null ? '' : String(v)).replace(/\s+/g, ' ').trim().slice(0, n);
const LEVELS: readonly GateLevel[] = ['pass', 'warn', 'fail', 'skip'];

/** Read quality.siteGate. An unknown level reads as FAIL — never as a pass. */
export function readSiteGateReport(v: unknown): SiteGateReport {
  if (!isObj(v)) return EMPTY_SITE_GATE;
  const checks: SiteGateCheck[] = (Array.isArray(v.checks) ? v.checks : []).filter(isObj).slice(0, 60).map((c) => {
    const lvl = str(c.level, 10).toLowerCase() as GateLevel;
    return { id: str(c.id, 40), label: str(c.label, 200), level: LEVELS.includes(lvl) ? lvl : 'fail', details: (Array.isArray(c.details) ? c.details : []).map((d) => str(d, 300)).filter(Boolean).slice(0, 12) };
  });
  const failed = checks.some((c) => c.level === 'fail');
  return {
    reported: true,
    version: typeof v.siteGateVersion === 'number' ? v.siteGateVersion : null,
    domain: str(v.domain, 200).toLowerCase(), mode: str(v.mode, 10), preview: v.preview === true,
    pages: typeof v.pages === 'number' && v.pages >= 0 ? Math.floor(v.pages) : 0,
    /* The report's own "passed" is believed only when its checks agree. */
    passed: v.passed === true && !failed && checks.length > 0 ? true : v.passed === false || failed ? false : null,
    checks,
  };
}

/** Why a gate report cannot make the build Preview Ready. Empty = it can. */
export function siteGateProblems(r: SiteGateReport, canonicalDomain: string, opts: { preview?: boolean } = {}): string[] {
  const what = opts.preview ? 'Preview site gate' : 'Site quality gate';
  if (!r.reported) return [what + ' not run (X9b) — run scripts/findable-site-gate.mjs and include its JSON'];
  const out: string[] = [];
  if (r.version !== SITE_GATE_VERSION) out.push(what + ' report version ' + (r.version ?? 'missing') + ' is not ' + SITE_GATE_VERSION + ' — fetch the current gate');
  const dom = (canonicalDomain || '').toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (dom && r.domain && r.domain !== dom) out.push(what + ' ran for ' + r.domain + ', not the canonical domain ' + dom);
  if (!opts.preview && r.mode !== 'dist') out.push(what + ' did not read the build output (mode ' + (r.mode || 'missing') + ')');
  if (opts.preview && (r.mode !== 'url' || !r.preview)) out.push(what + ' was not a --url --preview run');
  const fails = r.checks.filter((c) => c.level === 'fail');
  if (r.passed !== true || fails.length) out.push(what + ' FAILED' + (fails.length ? ': ' + fails.map((c) => c.label + (c.details[0] ? ' (' + c.details[0] + ')' : '')).join('; ') : ''));
  return out;
}

/** The gate's failures, mapped onto the build's own QA booleans so a self-reported pass cannot stand. */
export const GATE_QA_OVERRIDES: Record<string, 'linksPassed' | 'schemaPassed' | 'responsivePassed'> = {
  links: 'linksPassed', orphans: 'linksPassed', schema: 'schemaPassed', mobile: 'responsivePassed',
};
