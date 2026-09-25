/* ════════════════════════════════════════════════════════════════════════════════════════════════
   SOURCE SITE RECON — Claude Code crawls; LeadFinderOS orchestrates and stores (Phase 2).

     1. reconPrompt()       the route-aware prompt Paul gives Claude Code
     2. parseReconText()    Claude's reply (raw JSON, or a reply with a ```json block) → a validated,
                            capped ReconResult, plus a summary of everything kept, dropped or ignored
     3. applyRecon()        the result MERGED into website_build: the Source Site Manifest, the fact
                            ledger, and the review list. Routes, project details, page plans,
                            redirects, QA and preview data are never touched.

   ⛔ THE IMPORT IS UNTRUSTED DATA. JSON.parse only (no eval, no Function, no HTML ever rendered as
   markup); http(s) URLs only; control characters stripped; every string, list and the input itself
   capped; a structure that is not the recon shape is REFUSED with a reason, never half-read.
   Nothing imported is ever treated as an instruction — later prompts fence it as data
   (manifestSummary.ts).
   ⛔ NOTHING IS SILENTLY DISCARDED. Every dropped item (bad URL, over a cap, empty) and every
   unrecognised top-level key is named in the summary Paul sees before he presses Import.
   ⛔ FACT RULES (Paul, 2026-09-25):
     · visible on the site, high confidence, one value, nothing else disagrees → VERIFIED (source:
       "source site (recon)")
     · uncertain / inferred / flagged conflict / two pages disagree / disagrees with what
       LeadFinderOS already holds → NEEDS APPROVAL, with every value named; never settled here
     · a fact LeadFinderOS already has VERIFIED (onboarding or Paul) is NEVER overwritten; a
       disagreement becomes a review item beside it
     · a fact Paul rejected / marked N/A stays as he left it
   ⚠️ Browser-only (the page imports it). Never a backtick inside a template literal (§3).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import type {
  AssetType, BuildFact, InteractionKind, ManifestAsset, ManifestInteraction, ManifestPage, PageFamily, Redirect,
  ReconReviewItem, SourceManifest, StoredFactStatus, WebsiteBuildState,
} from './websiteBuildState.ts';
import { MAX_FACTS, MAX_MANIFEST_ASSETS, MAX_MANIFEST_INTERACTIONS, MAX_MANIFEST_PAGES, MAX_RECON_CANDIDATES, MAX_RECON_REVIEW, MAX_REDIRECTS, REBUILD_STYLE_LABELS } from './websiteBuildState.ts';
import type { ReconCandidate } from './websiteBuildState.ts';
import type { FactRow } from './buildFacts.ts';
import { isPublishable } from './buildFacts.ts';
import { CORE_BUILD_FACTS, templatePageTypes } from './websiteTemplates.ts';
import { isBespokeRoute, isFaithfulRoute, isTemplateRoute, MARK, verifiedFactLines, winPath, type BuildPackInput } from './buildPack.ts';
import { RECON_FACT_FIELDS, RECON_RULES_LINES, RECON_SCHEMA_LINES, RECON_VERSION } from './reconSchema.ts';

/* ══ 1. THE PROMPT ════════════════════════════════════════════════════════════════════════════ */

export const RECON_SOURCE = 'source site (recon)';

export function reconPrompt(i: BuildPackInput): { text: string; blockedBy: string[] } {
  const s = i.state;
  const site = i.existingSiteUrl;
  const folder = s.local_repo_path ? winPath(s.local_repo_path) : MARK.path;
  const name = i.businessName || 'this business';
  const L: string[] = [
    '# SOURCE SITE RECON — ' + name,
    '',
    'Build route: ' + (s.route === 'faithful_rebuild' ? 'FAITHFUL REBUILD' : s.route === 'template_rebuild' ? 'TEMPLATE REBUILD' : s.route === 'bespoke' ? 'BESPOKE / NEW TRADE' : 'NOT CHOSEN — ask Paul first'),
    'Work in: ' + folder + ' (create a capture folder there for screenshots and notes).',
    site ? 'Site: ' + site : 'Site: NONE — the client has no current website.',
    '',
    '## RULES',
    '- Recon only. Do not build, do not redesign, do not change anything on the live site.',
    '- ⛔ Never submit a form, request a callback, start a booking or send a message — every enquiry reaches the real business.',
    '- Crawl politely: one request at a time, a short pause between pages, stay on the client\'s own domain.',
    '- Do not download assets yet: RECORD each one (URL, purpose, suggested filename). The future build must never hotlink.',
    '- Read the real HTML (and the sitemap / robots.txt); screenshots support it, they do not replace it.',
    '',
    'WHAT LEADFINDEROS ALREADY HAS VERIFIED (compare; where the site disagrees, record a conflict — do not "correct" either side):',
    ...verifiedFactLines(i.facts),
  ];

  if (isFaithfulRoute(s) && site) {
    L.push('', '## PURPOSE — FAITHFUL REBUILD',
      'The client has authorised a rebuild of THIS site in new code, looking and behaving as it does now' + (s.rebuild_style ? ' (' + REBUILD_STYLE_LABELS[s.rebuild_style] + ')' : '') + '.',
      'Crawl the ENTIRE site before anything is built. Capture enough evidence to rebuild it extremely closely.',
      'Do NOT redesign during recon — describe what IS there, not what should be.',
      '', '## CAPTURE',
      'URL INVENTORY — every public URL (sitemap, robots.txt, navigation, footer, internal links), with the status',
      '  code where practical, its page family, title, H1 and purpose.',
      'STRUCTURE — the navigation (desktop and mobile), the footer, and for every page family the SECTION ORDER,',
      '  headings, visible copy (summarised), CTAs, forms, interactions and sticky / floating controls.',
      'DESIGN — fonts and weights; colours (hex); gradients; container widths; gutters; spacing rhythm; border',
      '  radius; shadows; cards; buttons (all states); icons; breakpoints; mobile behaviour.',
      'ASSETS — logo, favicon, hero images, gallery images, owner / team images, certification logos, manufacturer',
      '  logos, background images. For each: original URL, purpose, whether it looks client-owned or third-party,',
      '  and a suggested local filename.',
      'SEO / TECHNICAL — titles, meta descriptions, canonicals, robots, sitemap, schema, internal linking, redirect',
      '  requirements, analytics / tracking, third-party embeds.',
      'CONTENT FACTS — business name, contact details, services, prices, locations, credentials, reviews,',
      '  guarantees and every other claim, each with the page it is on.',
      'SCREENSHOTS — full-page at 1440, 1024, 768 and 390 px wide for the homepage and one representative page of',
      '  EVERY page family, saved as capture/screenshots/<width>/<page>.png (Playwright:',
      '  npm install --save-dev playwright; npx playwright install chromium). List them on each page\'s "screenshots".');
  } else if (isTemplateRoute(s) && site) {
    L.push('', '## PURPOSE — TEMPLATE REBUILD',
      'The client\'s information will be mapped into an approved Findable template' + (i.template ? ' (' + i.template.name + ')' : '') + '.',
      'THE SOURCE SITE\'S DESIGN IS NOT AUTOMATICALLY THE TARGET DESIGN. Record brand fonts / colours and the logo, but',
      'spend the effort on the BUSINESS, not on visual replication.',
      ...(i.template ? ['Template page types: ' + templatePageTypes(i.template).join(', ') + ' — note in "warnings" anything this business needs that they do not cover.'] : []),
      '', '## CAPTURE — in priority order',
      'BUSINESS — identity (exact name), services (every genuine one), locations / service areas, prices, owner,',
      '  contact details, opening hours, credentials, insurance, memberships, reviews and review profiles,',
      '  project / job evidence, FAQs and the customer questions the site answers, guarantees, legal facts',
      '  (company number, registered address, regulated wording).',
      'ASSETS — the real images and logos (URL, purpose, ownership, suggested filename). Skip stock imagery or mark it third_party.',
      'TRACKING — analytics, tag manager, pixels, embeds that must be carried over.',
      'STILL CAPTURE — the full URL inventory with titles, H1s and metadata, the schema, and which old URLs will need',
      '  a redirect. Important brand / design information only (logo, fonts, colours).');
  } else if (isBespokeRoute(s) && site) {
    L.push('', '## PURPOSE — BESPOKE / NEW TRADE (existing site)',
      'A new architecture and design will be created. Capture every business fact, piece of evidence and asset, the',
      'existing architecture, and any design elements worth keeping.',
      '', '## CAPTURE',
      'BUSINESS — everything the site states: services and what each involves, locations, prices, credentials,',
      '  reviews, guarantees, owner, contact details, hours.',
      'EVIDENCE — case studies, job photos, testimonials, accreditations: what proof exists for each service.',
      'CUSTOMERS — who the site is for and the questions it answers; the conversion flow (how an enquiry happens).',
      'ARCHITECTURE — the full URL inventory with page families, titles, H1s and purposes.',
      'ASSETS — logo, genuine photos and marks (URL, purpose, ownership, suggested filename).',
      'DESIGN — fonts, colours and any element worth reusing (reference only).',
      'Use "unknowns" for everything a new design needs that the site does not say: likely customer questions it',
      'fails to answer, missing proof, missing service detail.');
  } else if (isBespokeRoute(s)) {
    L.push('', '## PURPOSE — BESPOKE / NEW TRADE (no website)',
      'There is no site to crawl. Do not browse the web for this business and do not invent anything.',
      'Using ONLY the verified facts above, produce the recon JSON with:',
      '- "facts": only what is verified above (confidence high, evidence visible, sourceContext "LeadFinderOS").',
      '- "pages": [] and "assets": [].',
      '- "unknowns": a STRUCTURED MISSING INFORMATION list — one item per thing the design needs and nobody has',
      '  told us: service architecture (each service and what it involves), location strategy (where they work',
      '  and want more work), proof strategy (credentials, reviews, photos, case studies), conversion flow (how',
      '  customers should enquire), content priorities, and the customer questions the site must answer.',
      '  Each "note" is one plain question Paul can ask the client.');
  } else {
    L.push('', '(No existing website is recorded for this client. Add its URL in the Capture step, or choose Bespoke / new trade.)');
  }

  L.push('', '## FINISH WITH ONE MACHINE-READABLE RESULT', '', ...RECON_SCHEMA_LINES, '', ...RECON_RULES_LINES,
    '', 'Also save the same JSON to capture/recon.json. Before the JSON, write at most ten lines of plain-English summary.',
    'THEN STOP. Paul imports the result into LeadFinderOS and reviews it before anything is built.');
  const blockedBy = [
    ...(!s.route ? ['Build route'] : []),
    ...(!site && !isBespokeRoute(s) ? ['Existing website URL'] : []),
  ];
  return { text: L.join('\n'), blockedBy };
}

/* ══ 2. THE IMPORT — parse and validate ═══════════════════════════════════════════════════════ */

/** Longest paste accepted. A 600-page recon with full detail is roughly 0.6 MB. */
export const MAX_RECON_INPUT_CHARS = 2_000_000;
export const MAX_RECON_FACTS = 400;
const MAX_UNKNOWNS = 100;
const MAX_WARNINGS = 100;

export interface ReconFact {
  field: string; label: string; value: string; sourceUrl: string; sourceContext: string;
  confidence: 'high' | 'medium' | 'low'; evidence: 'visible' | 'inferred'; conflicts: Array<{ value: string; sourceUrl: string }>;
}
export interface ReconResult {
  sourceUrl: string; capturedAt: string; platform: string; siteStatus: 'live' | 'offline' | 'partial' | '';
  pages: ManifestPage[]; facts: ReconFact[]; assets: ManifestAsset[]; interactions: ManifestInteraction[];
  design: SourceManifest['design']; seo: SourceManifest['seo']; redirectCandidates: Redirect[];
  unknowns: Array<{ field: string; note: string }>; warnings: string[];
  /** Phase 3: analytics / tag-manager / ads IDs seen on the site — they become facts NEEDING approval. */
  trackingIds: { analytics: string[]; ads: string[] };
}
export interface ReconSummary {
  pages: number; facts: number; assets: number; unknowns: number; warnings: number; interactions: number; redirectCandidates: number;
  families: Array<{ family: PageFamily; count: number }>;
  /** Items not imported, each with its reason. Shown to Paul before he imports. */
  dropped: string[];
  /** Top-level keys the importer does not store — named, never silently lost. */
  ignoredKeys: string[];
  notes: string[];
}
export type ReconParse = { ok: true; result: ReconResult; summary: ReconSummary } | { ok: false; error: string };

const KNOWN_KEYS = new Set(['reconVersion', 'sourceUrl', 'capturedAt', 'platform', 'siteStatus', 'pages', 'pageFamilies', 'facts', 'assets', 'design', 'interactions', 'seo', 'tracking', 'redirectCandidates', 'unknowns', 'warnings']);

/** Clean imported text: a string (or number) only, control characters out, trimmed, capped. */
function clean(v: unknown, cap: number): string {
  if (typeof v !== 'string' && typeof v !== 'number') return '';
  return String(v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').replace(/\s+/g, ' ').trim().slice(0, cap);
}
/** A value that may be a string or a list of strings → one capped line. */
function textOf(v: unknown, cap: number): string {
  if (Array.isArray(v)) return clean(v.map((x) => (typeof x === 'string' || typeof x === 'number' ? String(x) : '')).filter(Boolean).join(', '), cap);
  return clean(v, cap);
}
/** http(s) only. Anything else (javascript:, data:, relative, garbage) is not a URL here. */
export function safeUrl(v: unknown): string {
  const s = clean(v, 500);
  if (!/^https?:\/\//i.test(s)) return '';
  try { const u = new URL(s); return u.protocol === 'http:' || u.protocol === 'https:' ? u.toString() : ''; } catch { return ''; }
}
const isObj = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v);

const PAGE_TYPE_ALIASES: Record<string, PageFamily> = {
  home: 'homepage', homepage: 'homepage', index: 'homepage',
  services_index: 'services_index', service_index: 'services_index', services: 'services_index',
  service: 'service', service_detail: 'service',
  locations_index: 'locations_index', location_index: 'locations_index', locations: 'locations_index', areas: 'locations_index',
  location: 'location', area: 'location', town: 'location',
  commercial: 'commercial', pricing: 'pricing', prices: 'pricing', price: 'pricing',
  about: 'about', team: 'about', faq: 'faq', faqs: 'faq',
  gallery: 'gallery', portfolio: 'gallery', projects: 'gallery', work: 'gallery',
  contact: 'contact', legal: 'legal', privacy: 'legal', terms: 'legal', cookies: 'legal',
};
const pageType = (v: unknown): PageFamily => PAGE_TYPE_ALIASES[clean(v, 40).toLowerCase().replace(/[\s-]+/g, '_')] ?? 'other';

const ASSET_TYPE_MAP: Record<string, AssetType> = {
  logo: 'logo', favicon: 'favicon', icon: 'icon', hero: 'photo', gallery: 'photo', team: 'photo', owner: 'photo',
  background: 'photo', image: 'photo', photo: 'photo', certification: 'badge', badge: 'badge', accreditation: 'badge',
  manufacturer: 'brand_logo', brand: 'brand_logo', brand_logo: 'brand_logo', document: 'document', pdf: 'document', video: 'video',
};
const INTERACTION_MAP: Record<string, InteractionKind> = {
  form: 'form', menu: 'menu', nav: 'menu', navigation: 'menu', accordion: 'accordion', slider: 'slider', carousel: 'slider',
  sticky: 'sticky', floating: 'sticky', booking: 'booking', contact_flow: 'contact_flow', contact: 'contact_flow', popup: 'popup', modal: 'popup',
};

/** Pull the JSON out of what Paul pasted: raw JSON, or the last ```json block that parses, or the
 *  outermost {...}. Returns the parsed value or the reason it could not be read. */
function extractJson(text: string): { value: unknown } | { error: string } {
  const t = text.trim();
  const tries: string[] = [];
  if (t.startsWith('{')) tries.push(t);
  const fences = [...t.matchAll(/```(?:json|JSON)?\s*\n([\s\S]*?)```/g)].map((m) => m[1].trim()).filter((b) => b.startsWith('{'));
  tries.push(...fences.reverse());
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) tries.push(t.slice(a, b + 1));
  if (!tries.length) return { error: 'No JSON found. Paste Claude’s whole reply, or just the JSON object that starts with { and ends with }.' };
  let lastErr = '';
  for (const c of tries) {
    try { return { value: JSON.parse(c) }; } catch (e) { lastErr = (e as Error).message; }
  }
  return { error: 'The JSON could not be read (' + lastErr.slice(0, 160) + '). Ask Claude to re-output the recon result as one valid JSON block — no comments, no trailing commas.' };
}

export function parseReconText(input: string): ReconParse {
  if (typeof input !== 'string' || !input.trim()) return { ok: false, error: 'Nothing pasted.' };
  if (input.length > MAX_RECON_INPUT_CHARS) return { ok: false, error: 'That is ' + Math.round(input.length / 1000).toLocaleString() + ' KB — the limit is ' + Math.round(MAX_RECON_INPUT_CHARS / 1000).toLocaleString() + ' KB. Ask Claude for the recon JSON only, without the page copy.' };
  const ex = extractJson(input);
  if ('error' in ex) return { ok: false, error: ex.error };
  const o = ex.value;
  if (!isObj(o)) return { ok: false, error: 'The JSON is not an object. A recon result is one { … } object.' };
  const notes: string[] = [];
  if (o.reconVersion !== RECON_VERSION) {
    if (o.reconVersion != null) return { ok: false, error: 'reconVersion ' + clean(o.reconVersion, 10) + ' is not supported (this LeadFinderOS reads version ' + RECON_VERSION + ').' };
    if (!Array.isArray(o.pages) && !Array.isArray(o.facts)) return { ok: false, error: 'This does not look like a recon result: no "reconVersion", "pages" or "facts".' };
    notes.push('No "reconVersion" — read as version ' + RECON_VERSION + '.');
  }
  for (const k of ['pages', 'facts', 'assets', 'interactions', 'redirectCandidates', 'unknowns', 'warnings', 'pageFamilies'] as const) {
    if (o[k] != null && !Array.isArray(o[k])) return { ok: false, error: '"' + k + '" must be a list ([ … ]), not ' + typeof o[k] + '.' };
  }
  for (const k of ['design', 'seo', 'tracking'] as const) {
    if (o[k] != null && !isObj(o[k])) return { ok: false, error: '"' + k + '" must be an object ({ … }).' };
  }
  const dropped: string[] = [];
  const drop = (n: number, what: string) => { if (n > 0) dropped.push(n + ' ' + what); };
  const list = (k: string) => (Array.isArray(o[k]) ? (o[k] as unknown[]) : []);

  /* pages */
  let badPage = 0;
  const seenPage = new Set<string>();
  const pagesAll: ManifestPage[] = [];
  for (const x of list('pages')) {
    if (!isObj(x)) { badPage++; continue; }
    const url = safeUrl(x.url);
    if (!url) { badPage++; continue; }
    const key = urlKey(url);
    if (seenPage.has(key)) continue;
    seenPage.add(key);
    const code = Math.floor(Number(x.statusCode ?? x.status_code));
    pagesAll.push({
      url, type: pageType(x.pageType ?? x.type), title: clean(x.title, 200), h1: clean(x.h1, 200), purpose: clean(x.purpose, 300),
      screenshots: (Array.isArray(x.screenshots) ? x.screenshots : []).map((v) => clean(v, 300)).filter(Boolean).slice(0, 8),
      status_code: code >= 100 && code <= 599 ? code : null,
      sections: (Array.isArray(x.sections) ? x.sections : []).map((v) => (isObj(v) ? textOf(v.name ?? v.title ?? v.type, 120) : clean(v, 120))).filter(Boolean).slice(0, 20),
    });
  }
  drop(badPage, 'page(s) without a valid http(s) URL');
  const pages = pagesAll.slice(0, MAX_MANIFEST_PAGES);
  drop(pagesAll.length - pages.length, 'page(s) over the ' + MAX_MANIFEST_PAGES + '-page limit (the count above is the full number found)');

  /* facts */
  let badFact = 0;
  const factsAll: ReconFact[] = [];
  for (const x of list('facts')) {
    if (!isObj(x)) { badFact++; continue; }
    const field = clean(x.field, 60).toLowerCase().replace(/[\s-]+/g, '_');
    const value = clean(x.value, 1000);
    if (!field || !value) { badFact++; continue; }
    const conf = clean(x.confidence, 10).toLowerCase();
    const ev = clean(x.evidence, 10).toLowerCase();
    factsAll.push({
      field, label: clean(x.label, 120), value,
      sourceUrl: safeUrl(x.sourceUrl), sourceContext: clean(x.sourceContext, 300) || (x.sourceUrl && !safeUrl(x.sourceUrl) ? clean(x.sourceUrl, 300) : ''),
      confidence: conf === 'high' || conf === 'medium' ? conf : 'low',
      evidence: ev === 'visible' ? 'visible' : 'inferred',
      conflicts: (Array.isArray(x.conflicts) ? x.conflicts : []).filter(isObj).map((c) => ({ value: clean(c.value, 1000), sourceUrl: safeUrl(c.sourceUrl) })).filter((c) => c.value).slice(0, 10),
    });
  }
  drop(badFact, 'fact(s) with no field or no value');
  const facts = factsAll.slice(0, MAX_RECON_FACTS);
  drop(factsAll.length - facts.length, 'fact(s) over the ' + MAX_RECON_FACTS + '-fact limit');

  /* assets */
  let badAsset = 0;
  const seenAsset = new Set<string>();
  const assetsAll: ManifestAsset[] = [];
  for (const x of list('assets')) {
    if (!isObj(x)) { badAsset++; continue; }
    const src = safeUrl(x.sourceUrl ?? x.source_url);
    if (!src) { badAsset++; continue; }
    if (seenAsset.has(src)) continue;
    seenAsset.add(src);
    const rawType = clean(x.type, 30).toLowerCase();
    const own = clean(x.ownership, 20).toLowerCase();
    const purpose = [clean(x.purpose, 160), ASSET_TYPE_MAP[rawType] && ASSET_TYPE_MAP[rawType] !== rawType ? rawType : ''].filter(Boolean).join(' · ');
    assetsAll.push({
      source_url: src, type: ASSET_TYPE_MAP[rawType] ?? 'other', purpose: clean(purpose, 200), location: '', approval: 'pending',
      page_url: safeUrl(x.pageUrl ?? x.page_url), suggested_filename: clean(x.suggestedFilename ?? x.suggested_filename, 120).replace(/[^\w.-]+/g, '-'),
      ownership: own === 'client_owned' || own === 'third_party' ? own : 'unknown',
    });
  }
  drop(badAsset, 'asset(s) without a valid http(s) source URL');
  const assets = assetsAll.slice(0, MAX_MANIFEST_ASSETS);
  drop(assetsAll.length - assets.length, 'asset(s) over the ' + MAX_MANIFEST_ASSETS + '-asset limit');

  /* interactions */
  const ixAll: ManifestInteraction[] = list('interactions').filter(isObj).map((x) => ({
    kind: INTERACTION_MAP[clean(x.kind, 30).toLowerCase()] ?? 'other',
    where: safeUrl(x.pageUrl) || clean(x.pageUrl ?? x.where, 300),
    notes: clean(x.description ?? x.notes, 500),
  })).filter((x) => x.where || x.notes);
  drop(list('interactions').length - ixAll.length, 'interaction(s) with nothing in them');
  const interactions = ixAll.slice(0, MAX_MANIFEST_INTERACTIONS);
  drop(ixAll.length - interactions.length, 'interaction(s) over the ' + MAX_MANIFEST_INTERACTIONS + ' limit');

  /* design / seo / tracking → the manifest's text fields, labelled, nothing guessed */
  const d = isObj(o.design) ? o.design : {};
  const lab = (pairs: Array<[string, unknown]>, cap: number) => pairs.map(([k, v]) => [k, textOf(v, 600)] as const).filter(([, v]) => v).map(([k, v]) => k + ': ' + v).join(' · ').slice(0, cap);
  const design = {
    fonts: lab([['families', d.fonts], ['weights', d.fontWeights]], 1000),
    colours: lab([['colours', d.colours], ['gradients', d.gradients]], 1000),
    layout_notes: lab([['containers', d.containerWidths], ['gutters', d.gutters], ['spacing', d.spacing], ['breakpoints', d.breakpoints], ['mobile', d.mobile], ['notes', d.notes]], 4000),
    component_notes: lab([['cards', d.cards], ['buttons', d.buttons], ['radius', d.borderRadius], ['shadows', d.shadows], ['icons', d.icons]], 4000),
  };
  const se = isObj(o.seo) ? o.seo : {};
  const tr = isObj(o.tracking) ? o.tracking : {};
  const seo = {
    metadata: lab([['titles', se.titles], ['descriptions', se.metaDescriptions], ['internal linking', se.internalLinking], ['notes', se.notes]], 2000),
    canonical: textOf(se.canonical, 500), schema: textOf(se.schema, 2000), sitemap: textOf(se.sitemap, 500), robots: textOf(se.robots, 1000),
    tracking: lab([['analytics', tr.analytics], ['tag manager', tr.tagManager], ['pixels', tr.pixels], ['embeds', tr.embeds], ['notes', tr.notes]], 1000),
  };

  /* redirect candidates */
  const rcAll: Redirect[] = list('redirectCandidates').filter(isObj).map((x) => ({ from: clean(x.from, 500), to: clean(x.to, 500), reason: clean(x.reason, 300) })).filter((r) => r.from);
  drop(list('redirectCandidates').length - rcAll.length, 'redirect candidate(s) with no "from"');
  const redirectCandidates = rcAll.slice(0, MAX_REDIRECTS);

  /* unknowns / warnings */
  const unkAll = list('unknowns').map((x) => (isObj(x) ? { field: clean(x.field, 60).toLowerCase().replace(/[\s-]+/g, '_'), note: clean(x.note ?? x.question, 500) } : { field: '', note: clean(x, 500) })).filter((u) => u.field || u.note);
  const unknowns = unkAll.slice(0, MAX_UNKNOWNS);
  drop(unkAll.length - unknowns.length, 'unknown(s) over the ' + MAX_UNKNOWNS + ' limit');
  const warnAll = list('warnings').map((x) => clean(x, 500)).filter(Boolean);
  const warnings = warnAll.slice(0, MAX_WARNINGS);
  drop(warnAll.length - warnings.length, 'warning(s) over the ' + MAX_WARNINGS + ' limit');

  const ignoredKeys = Object.keys(o).filter((k) => !KNOWN_KEYS.has(k));
  if (list('pageFamilies').length) notes.push('"pageFamilies" is used as a cross-check only — families are counted from the pages themselves.');
  const claimed = list('pageFamilies').filter(isObj).reduce((n, f) => n + (Number(f.count) || 0), 0);
  if (claimed && claimed !== pagesAll.length) notes.push('Claude’s family counts add up to ' + claimed + ' pages; ' + pagesAll.length + ' pages were listed.');
  const siteStatus = clean(o.siteStatus, 10).toLowerCase();
  const result: ReconResult = {
    sourceUrl: safeUrl(o.sourceUrl), capturedAt: clean(o.capturedAt, 40), platform: clean(o.platform, 100),
    siteStatus: siteStatus === 'live' || siteStatus === 'offline' || siteStatus === 'partial' ? siteStatus : '',
    pages, facts, assets, interactions, design, seo, redirectCandidates, unknowns, warnings,
    trackingIds: {
      analytics: [...new Set([...(Array.isArray(tr.analytics) ? tr.analytics : [tr.analytics]), tr.tagManager].map((v) => clean(v, 60)).filter((v) => /^(G-|UA-|GTM-|AW-)?[A-Z0-9-]{4,}$/i.test(v)))].slice(0, 10),
      ads: [...new Set((Array.isArray(tr.adsIds) ? tr.adsIds : [tr.adsIds]).map((v) => clean(v, 60)).filter((v) => /^[A-Z0-9-]{4,}$/i.test(v)))].slice(0, 10),
    },
  };
  const famCount = new Map<PageFamily, number>();
  for (const p of pages) famCount.set(p.type, (famCount.get(p.type) ?? 0) + 1);
  return { ok: true, result, summary: {
    pages: pagesAll.length, facts: facts.length, assets: assetsAll.length, unknowns: unknowns.length, warnings: warnings.length,
    interactions: interactions.length, redirectCandidates: redirectCandidates.length,
    families: [...famCount.entries()].map(([family, count]) => ({ family, count })), dropped, ignoredKeys, notes,
  } };
}

/* ══ 3. THE MERGE ═════════════════════════════════════════════════════════════════════════════ */

export const urlKey = (u: string) => u.toLowerCase().replace(/#.*$/, '').replace(/\/+$/, '');

/** Recon field → fact key. The ledger's keys, so a recon value lands on the row it belongs to. */
const FIELD_KEYS: Record<string, string> = {
  business_name: 'business_name', name: 'business_name', company_name: 'business_name',
  trade: 'trade', category: 'trade',
  phone: 'phone', telephone: 'phone', mobile: 'phone', whatsapp: 'whatsapp_number', whatsapp_number: 'whatsapp_number',
  email: 'email', address: 'address', primary_town: 'primary_town', town: 'primary_town', base_town: 'primary_town', home_town: 'primary_town',
  service_areas: 'service_areas', areas: 'service_areas', locations: 'service_areas', location: 'service_areas',
  services: 'services', service: 'services', owner_name: 'owner_name', owner: 'owner_name',
  opening_hours: 'opening_hours', hours: 'opening_hours', response_time: 'response_time',
  years_experience: 'years_experience', experience: 'years_experience',
  accreditations: 'accreditations', credentials: 'accreditations', certifications: 'accreditations',
  memberships: 'memberships', membership: 'memberships', qualifications: 'qualifications', qualification: 'qualifications',
  dbs: 'dbs', dbs_checked: 'dbs', awards: 'awards', award: 'awards', review_rating: 'review_rating', rating: 'review_rating', review_count: 'review_rating',
  payment_methods: 'payment_methods', payments: 'payment_methods', vat_status: 'vat_status', vat: 'vat_status',
  legal_status: 'legal_status', legal_entity: 'legal_status', licences: 'licences', licenses: 'licences', licence: 'licences',
  compliance: 'compliance', availability: 'availability', '24_7': 'availability', website: 'website', domain: 'website',
  analytics: 'analytics_ids', analytics_ids: 'analytics_ids', ads: 'ads_ids', ads_ids: 'ads_ids',
  insurance: 'insurance', prices: 'prices', price: 'prices', guarantee: 'guarantee', guarantees: 'guarantee', warranty: 'guarantee',
  brands: 'brands', manufacturers: 'brands', review_profiles: 'review_profiles', reviews: 'reviews_on_site', testimonials: 'reviews_on_site',
  directory_profiles: 'directory_profiles', social_profiles: 'social_profiles', social: 'social_profiles',
  company_number: 'company_number', standout: 'standout', legal: 'legal_facts',
};
/** Keys that hold a LIST — several values are items, not a contradiction. */
const LIST_KEYS = new Set(['service_areas', 'services', 'accreditations', 'brands', 'review_profiles', 'directory_profiles', 'social_profiles', 'prices', 'guarantee', 'insurance', 'legal_facts', 'reviews_on_site',
  'memberships', 'qualifications', 'awards', 'payment_methods', 'licences', 'compliance', 'analytics_ids', 'ads_ids']);

/* ── Phase 3: RISK-BASED APPROVAL (Paul, 2026-09-25) ─────────────────────────────────────────────
   LOW-RISK source facts — identity and links — may be auto-accepted when the site states them
   verbatim, consistently, with nothing disagreeing (basis: the source website).
   EVERYTHING ELSE is a commercial / proof / legal / coverage claim and ALWAYS needs Paul's approval,
   however clearly the site states it: prices, hours, 24/7, guarantees, insurance, qualifications,
   DBS, memberships, accreditations, awards, ratings, years trading, payment methods, VAT, legal
   status, the public address, service areas, licences, compliance, tracking / ads IDs, anything
   unrecognised. ⛔ Positive allowlist: a key nobody listed is high-risk, never low.
   And any value carrying a strong claim word ("approved", "certified", "best", "24/7"…) needs
   approval whatever its key. */
export const LOW_RISK_FACT_KEYS: ReadonlySet<string> = new Set(['business_name', 'trade', 'phone', 'email', 'website', 'social_profiles', 'directory_profiles', 'review_profiles', 'primary_town']);
export const STRONG_CLAIM = /\b(approved|certified|accredited|registered|licensed|vetted|checked|insured|guaranteed?|best|leading|no\.?\s?1|number one|award[- ]?winning|trusted|official|24\/7|24 hours|24hr|fully qualified)\b/i;
export function isHighRiskFact(key: string, values: string[]): boolean {
  return !LOW_RISK_FACT_KEYS.has(key) || values.some((v) => STRONG_CLAIM.test(v));
}
const LABELS: Record<string, string> = {
  ...Object.fromEntries(CORE_BUILD_FACTS.map((f) => [f.key, f.label])), company_number: 'Company number', legal_facts: 'Legal facts', reviews_on_site: 'Reviews shown on the current site',
  memberships: 'Memberships', qualifications: 'Qualifications', dbs: 'DBS check', awards: 'Awards', review_rating: 'Review rating / count', payment_methods: 'Payment methods',
  vat_status: 'VAT status', legal_status: 'Legal entity / status', licences: 'Licences', compliance: 'Compliance claims', availability: 'Availability (e.g. 24/7)',
  website: 'Current website', analytics_ids: 'Analytics IDs', ads_ids: 'Google Ads IDs',
};

const norm = (v: string) => v.toLowerCase().replace(/\s+/g, ' ').replace(/[.,;:]+$/, '').trim();
const normPhone = (v: string) => v.replace(/[^\d+]/g, '').replace(/^\+44/, '0').replace(/^0044/, '0');
const same = (key: string, a: string, b: string) => (key === 'phone' || key === 'whatsapp_number' ? normPhone(a) === normPhone(b) : norm(a) === norm(b));
const splitList = (v: string) => v.split(/\s*[,;|]\s*/).map((x) => x.trim()).filter(Boolean);
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 60);

function keyOf(f: ReconFact): { key: string; label: string } {
  if (f.field !== 'other' && FIELD_KEYS[f.field]) { const key = FIELD_KEYS[f.field]; return { key, label: LABELS[key] ?? key }; }
  const label = f.label || f.field.replace(/_/g, ' ');
  const mapped = FIELD_KEYS[slug(label)];
  if (mapped) return { key: mapped, label: LABELS[mapped] ?? mapped };
  return { key: ('custom_' + slug(label)).slice(0, 80), label: label.slice(0, 120) };
}

interface Group { key: string; label: string; values: string[]; allClean: boolean; flagged: boolean; sourceUrl: string; contexts: string[] }

function groupFacts(facts: ReconFact[]): Group[] {
  const by = new Map<string, Group>();
  for (const f of facts) {
    const { key, label } = keyOf(f);
    const g = by.get(key) ?? { key, label, values: [], allClean: true, flagged: false, sourceUrl: '', contexts: [] };
    const add = (v: string) => { for (const x of LIST_KEYS.has(key) ? splitList(v) : [v]) if (!g.values.some((y) => same(key, x, y))) g.values.push(x); };
    add(f.value);
    for (const c of f.conflicts) add(c.value);
    if (f.conflicts.length) g.flagged = true;
    if (f.confidence !== 'high' || f.evidence !== 'visible') g.allClean = false;
    if (!g.sourceUrl && f.sourceUrl) g.sourceUrl = f.sourceUrl;
    const ctx = [f.sourceContext, f.sourceUrl && f.sourceUrl !== g.sourceUrl ? f.sourceUrl : ''].filter(Boolean).join(' — ');
    if (ctx && !g.contexts.includes(ctx)) g.contexts.push(ctx);
    by.set(key, g);
  }
  return [...by.values()];
}

export interface ReconMergeReport { added: number; verified: number; needsApproval: number; conflicts: number; keptVerified: number; unchanged: number; factsDropped: number }

/**
 * Merge a parsed recon into the saved state. Pure. `rows` is the fact ledger as the screen shows it
 * now (mergeFacts over candidates + stored decisions), so "already verified" means exactly what
 * Paul sees as verified.
 */
export function applyRecon(state: WebsiteBuildState, r: ReconResult, rows: FactRow[], now: string): { state: WebsiteBuildState; report: ReconMergeReport } {
  const report: ReconMergeReport = { added: 0, verified: 0, needsApproval: 0, conflicts: 0, keptVerified: 0, unchanged: 0, factsDropped: 0 };
  const stored = new Map(state.facts.map((f) => [f.key, f]));
  const byRow = new Map(rows.map((x) => [x.key, x]));
  const review: ReconReviewItem[] = [];
  const day = now.slice(0, 10);
  const put = (f: BuildFact) => {
    if (!stored.has(f.key) && stored.size >= MAX_FACTS) { report.factsDropped++; return; }
    stored.set(f.key, f);
  };

  const trackingFacts: ReconFact[] = [
    ...(r.trackingIds?.analytics ?? []).map((v) => ({ field: 'analytics_ids', label: '', value: v, sourceUrl: r.sourceUrl, sourceContext: 'tracking scripts', confidence: 'high' as const, evidence: 'visible' as const, conflicts: [] })),
    ...(r.trackingIds?.ads ?? []).map((v) => ({ field: 'ads_ids', label: '', value: v, sourceUrl: r.sourceUrl, sourceContext: 'ads tags', confidence: 'high' as const, evidence: 'visible' as const, conflicts: [] })),
  ];
  for (const g of groupFacts([...r.facts, ...trackingFacts])) {
    const list = LIST_KEYS.has(g.key);
    const value = list ? g.values.join(', ') : g.values[0];
    const multi = !list && g.values.length > 1;
    const context = g.contexts.join(' | ').slice(0, 900);
    const row = byRow.get(g.key);
    const existingValue = row && row.status !== 'missing' ? row.value : '';
    const agrees = existingValue ? (list ? g.values.every((v) => splitList(existingValue).some((e) => same(g.key, v, e))) : g.values.every((v) => same(g.key, v, existingValue))) : false;
    const shows = 'The source site shows: ' + g.values.map((v) => '"' + v + '"').join(' / ') + (g.sourceUrl ? ' (' + g.sourceUrl + ')' : '') + '.';

    /* ⛔ Verified already (onboarding, or Paul): never overwritten. A disagreement is surfaced. */
    if (row && isPublishable(row)) {
      if (agrees) { report.unchanged++; continue; }
      report.keptVerified++;
      review.push({ kind: 'warning', key: g.key, label: g.label, detail: shows + ' LeadFinderOS has "' + row.value + '" VERIFIED — kept. Edit the fact if the site is right.', resolved: false });
      continue;
    }
    /* Paul's own rejection / N/A stands. */
    if (row && row.decided && (row.status === 'rejected' || row.status === 'not_applicable')) {
      report.unchanged++;
      if (!agrees) review.push({ kind: 'warning', key: g.key, label: g.label, detail: shows + ' You marked this ' + (row.status === 'rejected' ? 'rejected' : 'N/A') + ' — left as you decided.', resolved: false });
      continue;
    }
    const cleanGroup = g.allClean && !g.flagged && !multi;
    const disagrees = !!existingValue && !agrees;
    const isService = g.key === 'services';
    const highRisk = isHighRiskFact(g.key, g.values);
    const status: StoredFactStatus = cleanGroup && !disagrees && !highRisk && !isService ? 'verified' : 'detected';
    const why = [
      isService ? 'Source-derived service candidates — the site names them; confirm what is still offered (Template Mapping).' : '',
      !isService && highRisk ? 'Commercial / proof claim — always needs your approval, even when the site states it.' : '',
      multi ? 'Pages disagree: ' + g.values.map((v) => '"' + v + '"').join(' / ') + '.' : '',
      g.flagged && !multi ? 'Claude flagged a conflict: ' + g.values.map((v) => '"' + v + '"').join(' / ') + '.' : '',
      !g.allClean ? 'Not stated verbatim (inferred or not high confidence).' : '',
      disagrees ? 'LeadFinderOS has "' + existingValue + '" from ' + (row?.source || 'its records') + (multi || g.flagged ? '.' : '; ' + shows) : '',
    ].filter(Boolean).join(' ');
    const prevNotes = stored.get(g.key)?.notes ?? row?.notes ?? '';
    const reconNote = ['Recon ' + day + (context ? ': ' + context : ''), why].filter(Boolean).join(' — ');
    put({
      key: g.key, label: row?.label || g.label,
      /* A disagreement keeps the value LeadFinderOS showed, so nothing is replaced unseen; the
         site's value is named in the note and the review item. */
      value: disagrees ? existingValue : value,
      status,
      source: disagrees ? (row?.source || RECON_SOURCE) : RECON_SOURCE,
      source_url: g.sourceUrl || row?.source_url || '',
      notes: [prevNotes.includes(reconNote) ? '' : prevNotes, reconNote].filter(Boolean).join('\n').slice(0, 1000),
      basis: status === 'verified' ? 'source_site' : '',
    });
    if (!row || row.status === 'missing') report.added++;
    if (status === 'verified') report.verified++; else report.needsApproval++;
    if (multi || g.flagged || disagrees) {
      report.conflicts++;
      review.push({ kind: 'conflict', key: g.key, label: row?.label || g.label, detail: why, resolved: false });
    }
  }

  for (const u of r.unknowns) {
    const key = u.field ? (FIELD_KEYS[u.field] ?? '') : '';
    review.push({ kind: 'unknown', key, label: key ? (LABELS[key] ?? key) : (u.field.replace(/_/g, ' ') || 'Unknown'), detail: u.note || 'Not found on the site.', resolved: false });
  }
  for (const w of r.warnings) review.push({ kind: 'warning', key: '', label: 'Recon warning', detail: w, resolved: false });

  /* Carry Paul's dismissals across a re-import: the same item stays resolved. Items from an older
     recon that this one no longer raises are dropped with it. */
  const sig = (x: ReconReviewItem) => x.kind + '|' + x.key + '|' + x.detail;
  const wasResolved = new Set(state.recon.review.filter((x) => x.resolved).map(sig));
  const seenSig = new Set<string>();
  const nextReview = review.filter((x) => !seenSig.has(sig(x)) && !!seenSig.add(sig(x)))
    .map((x) => ({ ...x, resolved: wasResolved.has(sig(x)) })).slice(0, MAX_RECON_REVIEW);

  const manifest = mergeManifest(state.manifest, r);
  const capturedDay = /^\d{4}-\d{2}-\d{2}/.test(r.capturedAt) ? r.capturedAt.slice(0, 10) : day;
  const next: WebsiteBuildState = {
    ...state,
    facts: [...stored.values()],
    manifest,
    source_platform: state.source_platform || r.platform,
    source_still_live: state.source_still_live !== 'unknown' ? state.source_still_live : r.siteStatus === 'live' || r.siteStatus === 'partial' ? 'yes' : r.siteStatus === 'offline' ? 'no' : 'unknown',
    last_captured_at: capturedDay,
    capture: {
      ...state.capture,
      url_count: state.capture.url_count ?? (manifest.pages.length || null),
      asset_count: state.capture.asset_count ?? (manifest.assets.length || null),
    },
    recon: {
      ...state.recon,
      imported_at: now, source_url: r.sourceUrl || state.recon.source_url, captured_at: r.capturedAt,
      pages_total: r.pages.length, assets_total: r.assets.length, review: nextReview,
      services: candidatesFrom(r, 'services', 'service', state.recon.services),
      towns: candidatesFrom(r, 'service_areas', 'location', state.recon.towns),
    },
  };
  return { state: next, report };
}

/** SOURCE-DERIVED candidates: the site's list facts for `factField` (one per item) plus its pages
 *  of `pageType` (a service page's title / H1; a location page's town from its URL). Merged with the
 *  previous import's, de-duplicated by name. Candidates only — never a claim. */
function candidatesFrom(r: ReconResult, factField: 'services' | 'service_areas', pageType: 'service' | 'location', previous: ReconCandidate[]): ReconCandidate[] {
  const out = new Map<string, ReconCandidate>(previous.map((c) => [c.name.toLowerCase(), c]));
  const add = (name: string, source_url: string, context: string) => {
    const n = name.replace(/\s+/g, ' ').trim().slice(0, 120);
    if (n.length < 2 || out.has(n.toLowerCase())) return;
    out.set(n.toLowerCase(), { name: n, source_url, context: context.slice(0, 300) });
  };
  for (const f of r.facts) {
    if ((FIELD_KEYS[f.field] ?? '') !== factField && !(factField === 'service_areas' && FIELD_KEYS[f.field] === 'primary_town')) continue;
    for (const v of splitList(f.value)) add(v, f.sourceUrl, f.sourceContext || 'stated on the site');
  }
  for (const p of r.pages) {
    if (p.type !== pageType) continue;
    if (pageType === 'service') add(p.h1 || p.title, p.url, 'service page');
    else {
      const slug = (p.url.replace(/[?#].*$/, '').replace(/\/+$/, '').split('/').pop() ?? '').replace(/[-_]+/g, ' ').trim();
      if (slug) add(slug.replace(/\b\w/g, (c) => c.toUpperCase()), p.url, 'location page' + (p.title ? ': ' + p.title.slice(0, 80) : ''));
    }
  }
  return [...out.values()].slice(0, MAX_RECON_CANDIDATES);
}

/** Manifest merge: pages by URL, assets by source URL (Paul's USE / REVIEW / IGNORE kept),
 *  interactions and redirect candidates de-duplicated, design / SEO text replaced only where the
 *  recon has something to say. Nothing the recon leaves blank erases what is there. */
export function mergeManifest(m: SourceManifest, r: ReconResult): SourceManifest {
  const pages = new Map(m.pages.map((p) => [urlKey(p.url), p]));
  for (const p of r.pages) {
    const old = pages.get(urlKey(p.url));
    pages.set(urlKey(p.url), old ? {
      ...old, type: p.type !== 'other' ? p.type : old.type, title: p.title || old.title, h1: p.h1 || old.h1, purpose: p.purpose || old.purpose,
      screenshots: p.screenshots.length ? p.screenshots : old.screenshots, status_code: p.status_code ?? old.status_code, sections: p.sections.length ? p.sections : old.sections,
    } : p);
  }
  const assets = new Map(m.assets.map((a) => [a.source_url, a]));
  for (const a of r.assets) {
    const old = assets.get(a.source_url);
    assets.set(a.source_url, old ? { ...a, approval: old.approval, location: old.location || a.location, purpose: a.purpose || old.purpose } : a);
  }
  const ixSig = (x: ManifestInteraction) => x.kind + '|' + x.where + '|' + x.notes;
  const ix = new Map(m.interactions.map((x) => [ixSig(x), x]));
  for (const x of r.interactions) ix.set(ixSig(x), x);
  const rc = new Map(m.redirect_candidates.map((x) => [x.from.toLowerCase(), x]));
  for (const x of r.redirectCandidates) rc.set(x.from.toLowerCase(), x);
  const pick = <T extends Record<string, string>>(a: T, b: T): T => Object.fromEntries(Object.keys(a).map((k) => [k, b[k] || a[k]])) as T;
  return {
    pages: [...pages.values()].slice(0, MAX_MANIFEST_PAGES),
    assets: [...assets.values()].slice(0, MAX_MANIFEST_ASSETS),
    interactions: [...ix.values()].slice(0, MAX_MANIFEST_INTERACTIONS),
    redirect_candidates: [...rc.values()].slice(0, MAX_REDIRECTS),
    design: pick(m.design, r.design),
    seo: pick(m.seo, r.seo),
  };
}

export { RECON_FACT_FIELDS };
