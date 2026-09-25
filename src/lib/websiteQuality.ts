/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE FINDABLE WEBSITE QUALITY STANDARD (Paul, 2026-09-25) — the second half of "Preview Ready".

   A Findable website is NOT finished because it builds, redirects work, schema exists and the
   technical SEO is cleaner. It must ALSO be a site we are comfortable putting side by side with the
   OLD one in front of the owner. For an existing-site rebuild the new site must be obviously at
   least as strong visually and commercially, and substantially stronger technically.

   Three durable structures, stored in website_build.quality (and the build result's upgrade review):

     1. EXISTING-SITE STRENGTHS — what the old site already does well (real logo, photography, job
        evidence, credentials, reviews, customer groups, service breadth, urgent work, quoting,
        FAQs, areas, a working enquiry form…). SEPARATE from its technical problems.
     2. THE NO-DOWNGRADE RULE — every strength gets a decision:
          good feature → PRESERVE / MODERNISE / IMPROVE (and where it now lives)
          removed      → only with a stated reason (it was bad, thin, or replaced by something better)
     3. CONTENT COMPLETENESS — each important intent (services hub, areas, FAQs, quotes, about, our
        work, contact, customer types, urgent work…) is assessed: needed → ONE primary page;
        not needed → said so. Never assumed from "homepage + service pages".
   Plus the OLD-vs-NEW UPGRADE REVIEW: matching screenshots (1440×900 and 390 wide at least) and the
   one question "would the owner reasonably feel this is an upgrade, with no SEO explanation?".
   A clear NO means the preview is not visually complete. No numerical visual score, ever.

   ⛔ Absent is never "fine": an undecided strength, an unassessed intent or a missing upgrade verdict
      is a gate problem, not a pass (CLAUDE.md §4, "an absent value falling through as a real one").
   ⚠️ Leaf module (no imports) — websiteBuildState.ts, buildExecution.ts, recon.ts and the edge
      function all reach it. Never a backtick inside a template literal (§3).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/* ── 1. existing-site strengths ───────────────────────────────────────────────────────────────── */

export const STRENGTH_CATEGORIES = [
  'logo', 'colours', 'photography', 'projects', 'gallery', 'accreditations', 'qualifications', 'reviews',
  'customer_groups', 'service_breadth', 'urgent_services', 'pricing', 'quoting', 'faqs', 'service_areas',
  'contact_form', 'conversion_routes', 'trust_sections', 'customer_questions', 'visual_sections', 'brand_cues', 'other',
] as const;
export type StrengthCategory = (typeof STRENGTH_CATEGORIES)[number];
export const STRENGTH_CATEGORY_LABELS: Record<StrengthCategory, string> = {
  logo: 'Real logo', colours: 'Established colours', photography: 'Genuine photography', projects: 'Projects / job evidence',
  gallery: 'Gallery', accreditations: 'Accreditations', qualifications: 'Qualifications', reviews: 'Reviews / testimonials',
  customer_groups: 'Customer groups', service_breadth: 'Service breadth', urgent_services: 'Urgent-service content',
  pricing: 'Pricing', quoting: 'Quoting', faqs: 'FAQs', service_areas: 'Service areas', contact_form: 'Working enquiry form',
  conversion_routes: 'Conversion routes (phone / WhatsApp / email)', trust_sections: 'Trust sections',
  customer_questions: 'Strong customer questions', visual_sections: 'Visually effective sections', brand_cues: 'Distinctive brand cues',
  other: 'Other',
};

export const STRENGTH_DISPOSITIONS = ['preserve', 'modernise', 'improve', 'remove'] as const;
export type StrengthDisposition = (typeof STRENGTH_DISPOSITIONS)[number];
export const STRENGTH_DISPOSITION_LABELS: Record<StrengthDisposition, string> = {
  preserve: 'Preserve', modernise: 'Modernise', improve: 'Improve', remove: 'Remove (say why)',
};

export interface ExistingStrength {
  id: string;
  category: StrengthCategory;
  /** What it is, concretely ("20 genuine job photos", "Google reviews widget: 138 reviews, 5 stars"). */
  label: string;
  /** Where on the old site, what it shows. */
  evidence: string;
  source_url: string;
  disposition: StrengthDisposition | '';
  /** Where it lives on the NEW site (a path, or "section on /"). Required unless removed. */
  where: string;
  /** Why it was removed (required for remove), or any note. */
  reason: string;
}

/* ── 2. content completeness ──────────────────────────────────────────────────────────────────── */

export const CONTENT_INTENTS = [
  'services_hub', 'service_pages', 'areas_hub', 'location_pages', 'faq_hub', 'quotes_pricing', 'about',
  'our_work', 'contact', 'customer_types', 'urgent_services',
] as const;
export type ContentIntent = (typeof CONTENT_INTENTS)[number];
export const CONTENT_INTENT_LABELS: Record<ContentIntent, string> = {
  services_hub: 'Services hub', service_pages: 'Individual service pages', areas_hub: 'Areas hub',
  location_pages: 'Selected genuine location pages', faq_hub: 'FAQ hub', quotes_pricing: 'Quotes / pricing',
  about: 'About', our_work: 'Our work / recent work', contact: 'Contact (and enquiry)',
  customer_types: 'Customer-type content (homeowners, landlords, commercial…)', urgent_services: 'Urgent / high-intent problems',
};
/** Intents almost every trade site needs: "not needed" must say why. */
export const CORE_INTENTS: readonly ContentIntent[] = ['services_hub', 'about', 'contact'];

export const INTENT_NEEDS = ['needed', 'not_needed'] as const;
export type IntentNeed = (typeof INTENT_NEEDS)[number];
export interface IntentDecision {
  need: IntentNeed | '';
  /** The ONE primary page for the intent ("/faqs/"), or "section on /" for an intent served by a section. */
  page: string;
  note: string;
}

export interface QualityState {
  strengths: ExistingStrength[];
  /** Paul (or the recon) has looked for strengths and this list is the whole inventory — even empty. */
  strengths_reviewed: boolean;
  intents: Partial<Record<ContentIntent, IntentDecision>>;
}
export const EMPTY_QUALITY: QualityState = { strengths: [], strengths_reviewed: false, intents: {} };

/* ── 3. the old-vs-new upgrade review (reported with the build result) ─────────────────────────── */

export const UPGRADE_VERDICTS = ['upgrade', 'not_upgrade'] as const;
export type UpgradeVerdict = (typeof UPGRADE_VERDICTS)[number];
export const UPGRADE_VERDICT_LABELS: Record<UpgradeVerdict, string> = { upgrade: 'Clearly an upgrade', not_upgrade: 'Not yet an upgrade' };
/** The two comparisons every existing-site rebuild must have: desktop 1440×900 and mobile 390. */
export const REQUIRED_UPGRADE_WIDTHS = [1440, 390] as const;
export interface UpgradeReview {
  verdict: UpgradeVerdict | '';
  /** Widths compared, old vs new, at matching viewports. */
  widths: number[];
  /** Where the OLD site still looks stronger. Anything here blocks Preview Ready. */
  still_stronger: string[];
  notes: string;
}
export const EMPTY_UPGRADE: UpgradeReview = { verdict: '', widths: [], still_stronger: [], notes: '' };

/* ── readers (the one allowlist both sides use) ───────────────────────────────────────────────── */

export const MAX_STRENGTHS = 80;
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v)) ? v as Record<string, unknown> : {};
const str = (v: unknown, cap: number) => (typeof v === 'string' ? v : v == null ? '' : String(v)).trim().slice(0, cap);
const arr = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
function oneOf<T extends string>(list: readonly T[], v: unknown): T | '' {
  const s = str(v, 40);
  return (list as readonly string[]).includes(s) ? s as T : '';
}

export const strengthId = (category: string, label: string) =>
  (category + ':' + label).toLowerCase().replace(/[^a-z0-9:]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

export function readStrength(v: unknown): ExistingStrength | null {
  const o = obj(v);
  const category = oneOf(STRENGTH_CATEGORIES, o.category) || 'other';
  const label = str(o.label, 200);
  if (!label) return null;
  return {
    id: str(o.id, 80) || strengthId(category, label), category, label,
    evidence: str(o.evidence, 600), source_url: str(o.source_url ?? o.sourceUrl, 500),
    disposition: oneOf(STRENGTH_DISPOSITIONS, o.disposition), where: str(o.where, 300), reason: str(o.reason, 600),
  };
}

export function readQuality(v: unknown): QualityState {
  const o = obj(v);
  const seen = new Set<string>();
  const strengths = arr(o.strengths).map(readStrength)
    .filter((x): x is ExistingStrength => !!x && !seen.has(x.id) && !!seen.add(x.id)).slice(0, MAX_STRENGTHS);
  const intents: QualityState['intents'] = {};
  const io = obj(o.intents);
  for (const k of CONTENT_INTENTS) {
    const d = obj(io[k]);
    const need = oneOf(INTENT_NEEDS, d.need);
    const page = str(d.page, 300), note = str(d.note, 600);
    if (need || page || note) intents[k] = { need, page, note };
  }
  return { strengths, strengths_reviewed: o.strengths_reviewed === true, intents };
}

export function readUpgradeReview(v: unknown): UpgradeReview {
  const o = obj(v);
  const widths = [...new Set(arr(o.widths).map((n) => Math.floor(Number(n))).filter((n) => Number.isFinite(n) && n >= 240 && n <= 3840))].slice(0, 8);
  return {
    verdict: oneOf(UPGRADE_VERDICTS, o.verdict),
    widths,
    still_stronger: arr(o.still_stronger ?? o.stillStronger).map((x) => str(x, 400)).filter(Boolean).slice(0, 40),
    notes: str(o.notes, 2000),
  };
}

/** Merge a fresh inventory (recon) over the stored one: the operator's decisions survive; strengths
 *  the new recon no longer lists are KEPT (a re-crawl never silently forgets a strength). */
export function mergeStrengths(stored: ExistingStrength[], incoming: ExistingStrength[]): ExistingStrength[] {
  const out = new Map(stored.map((x) => [x.id, x]));
  for (const n of incoming) {
    const cur = out.get(n.id);
    out.set(n.id, cur ? { ...n, disposition: cur.disposition, where: cur.where, reason: cur.reason } : n);
  }
  return [...out.values()].slice(0, MAX_STRENGTHS);
}

/* ── the rules ────────────────────────────────────────────────────────────────────────────────── */

/** The no-downgrade rule, per strength. */
export function strengthProblems(q: QualityState, hasExistingSite: boolean): string[] {
  const out: string[] = [];
  if (hasExistingSite && !q.strengths_reviewed) out.push('Existing-site strengths not inventoried (Quality standard → mark the inventory reviewed)');
  const undecided = q.strengths.filter((x) => !x.disposition);
  if (undecided.length) out.push(undecided.length + ' existing-site strength(s) without a decision: ' + undecided.slice(0, 4).map((x) => x.label).join('; '));
  const noWhere = q.strengths.filter((x) => x.disposition && x.disposition !== 'remove' && !x.where);
  if (noWhere.length) out.push(noWhere.length + ' kept strength(s) with no place on the new site: ' + noWhere.slice(0, 4).map((x) => x.label).join('; '));
  const noReason = q.strengths.filter((x) => x.disposition === 'remove' && !x.reason);
  if (noReason.length) out.push(noReason.length + ' strength(s) removed without a reason (no-downgrade rule): ' + noReason.slice(0, 4).map((x) => x.label).join('; '));
  return out;
}

const pathOf = (p: string) => { const m = /^\/[^\s#?]*/.exec(p.trim()); return m ? m[0].replace(/\/?$/, '/') : ''; };

/** Content completeness. `paths` = the pages that exist (the build's, else the page plan's). */
export function intentProblems(q: QualityState, paths: readonly string[]): string[] {
  const out: string[] = [];
  const have = new Set(paths.map((p) => pathOf(p)).filter(Boolean));
  const unassessed = CONTENT_INTENTS.filter((k) => !q.intents[k]?.need);
  if (unassessed.length) out.push('Content completeness not assessed for: ' + unassessed.map((k) => CONTENT_INTENT_LABELS[k]).join(', '));
  for (const k of CONTENT_INTENTS) {
    const d = q.intents[k];
    if (!d?.need) continue;
    if (d.need === 'not_needed' && CORE_INTENTS.includes(k) && !d.note) out.push(CONTENT_INTENT_LABELS[k] + ' marked not needed without a reason');
    if (d.need !== 'needed') continue;
    if (!d.page) { out.push(CONTENT_INTENT_LABELS[k] + ' is needed but has no primary page'); continue; }
    const p = pathOf(d.page);
    if (p && have.size && !have.has(p)) out.push(CONTENT_INTENT_LABELS[k] + ' → ' + p + ' is not in the build');
  }
  return out;
}

/** The old-vs-new comparison. Existing-site rebuilds only; a new business still gets completeness. */
export function upgradeProblems(u: UpgradeReview, hasExistingSite: boolean): string[] {
  if (!hasExistingSite) return [];
  const out: string[] = [];
  if (!u.verdict) out.push('Old vs new comparison not reported (1440×900 and 390 wide, side by side)');
  else if (u.verdict === 'not_upgrade') out.push('Preview is not visually complete: the new site is not yet clearly an upgrade on the old one');
  const missing = REQUIRED_UPGRADE_WIDTHS.filter((w) => !u.widths.some((x) => (w >= 1024 ? x >= 1280 : x <= 414)));
  if (u.verdict && missing.length) out.push('Old vs new not compared at ' + missing.join(' and ') + ' px');
  if (u.still_stronger.length) out.push('The old site still looks stronger at: ' + u.still_stronger.slice(0, 5).join('; '));
  return out;
}

export function qualityGateProblems(i: { quality: QualityState; upgrade: UpgradeReview; hasExistingSite: boolean; paths: readonly string[] }): string[] {
  return [...strengthProblems(i.quality, i.hasExistingSite), ...intentProblems(i.quality, i.paths), ...upgradeProblems(i.upgrade, i.hasExistingSite)];
}

/** A first proposal from the page plan's families — Paul confirms or changes each. Never overwrites a
 *  decision already made. */
export function proposeIntents(q: QualityState, pages: ReadonlyArray<{ family: string; path: string; action: string }>): QualityState['intents'] {
  const live = pages.filter((p) => p.action === 'keep' || p.action === 'create');
  const first = (fam: string) => live.find((p) => p.family === fam)?.path ?? '';
  const FAMILY: Partial<Record<ContentIntent, string>> = {
    services_hub: 'services_index', areas_hub: 'locations_index', location_pages: 'location', faq_hub: 'faq',
    quotes_pricing: 'pricing', about: 'about', our_work: 'gallery', contact: 'contact', customer_types: 'commercial',
  };
  const out: QualityState['intents'] = { ...q.intents };
  for (const k of CONTENT_INTENTS) {
    if (out[k]?.need) continue;
    const fam = FAMILY[k];
    const page = k === 'service_pages' ? (live.some((p) => p.family === 'service') ? first('services_index') || first('service') : '') : fam ? first(fam) : '';
    if (page) out[k] = { need: 'needed', page, note: out[k]?.note ?? '' };
  }
  return out;
}

/* ── the words: one standard, printed into the recon, the master prompt and the build prompt ──── */

/** Recon: the strength inventory, from the RENDERED page. */
export const STRENGTH_RECON_LINES: string[] = [
  'EXISTING-SITE STRENGTHS — SEPARATE from its problems. What does the old site already do WELL that a',
  '  client would miss if it vanished? Real logo, established colours, genuine photography, job / project',
  '  evidence, galleries, accreditations, qualifications, reviews / testimonials, customer groups, service',
  '  breadth, urgent-service content, pricing, quoting, FAQs, service areas, a working enquiry form, other',
  '  conversion routes, trust sections, strong customer questions, visually effective sections, brand cues.',
  '  ⛔ Read the RENDERED page in a real browser, scrolled to the bottom, not only the HTML: review carousels,',
  '  galleries and badges are often drawn by JavaScript and are invisible in the source (BS4 pilot: a Google',
  '  reviews widget, "138 Google Reviews", was missed by an HTML-only recon). Count what is there',
  '  ("20 job photos", "6 credential badges"). One "strengths" item each, with where it is.',
];

/** The standard itself — the master prompt and the build prompt both print it. */
export const QUALITY_STANDARD_LINES: string[] = [
  'TWO TESTS, BOTH REQUIRED: (1) technical / SEO / AI quality and (2) PERCEIVED WEBSITE QUALITY. A site that',
  'builds, redirects and validates but looks emptier than the old one is NOT finished.',
  'Existing-site rebuild: the new site must be obviously at least as strong visually and commercially as the',
  'old site, and substantially stronger technically. The owner must never reasonably think "my old site',
  'looked bigger", "it had more proof", "this looks empty" or "you removed the good parts".',
  'NO-DOWNGRADE: a GOOD existing feature is preserved, modernised or improved; a BAD one (thin doorway pages,',
  'duplicated boilerplate) is removed, consolidated or replaced. 20 genuine job photos are never rebuilt as',
  'two; a strong accreditation section is never hidden; a working enquiry form is never replaced by a weaker',
  'route; useful FAQs keep their intent.',
  'SOURCE-SITE FACTS: a factual claim the client\'s own public site states directly and consistently (services,',
  'areas, qualifications, accreditations, years trading, guarantees, contact details, customer groups, payment',
  'methods, hours, descriptions) may be used, labelled "source: existing client website" — never "independently',
  'verified". Only contradictions, ambiguity, inference or another entity\'s claim need Paul.',
  'BRAND: default is MODERNISE THE EXISTING BRAND — the genuine logo (never redrawn without approval), the',
  'genuine palette, the genuine photography. Never an accidental rebrand.',
  'VISUAL: established, substantial, premium, trustworthy, active, trade-specific, conversion-focused. Prefer',
  'REAL PHOTO · REAL PROJECT · REAL CREDENTIAL · REAL SERVICE · REAL AREA · REAL QUESTION · REAL PROOF. Avoid',
  'sparse layouts, excessive empty space, generic AI copy, random card grids, decorative fake dashboards, tiny',
  'hidden evidence, and stock imagery where genuine photos exist.',
  'PHOTOGRAPHY: use good genuine photos through the site (hero, services, about, recent work, customer-type',
  'sections, content breaks) — not dumped in one gallery, not overcrowded. Where job photos exist, a',
  'substantial Recent Work section (a featured job + supporting shots + a link to Our Work). No invented projects.',
  'TRUST: genuine qualifications and accreditations get real visual weight (no badge wall, no fake badges, no',
  'fake schema). Customer groups (homeowners / landlords / letting agents / commercial) shown only where supported.',
  'URGENT WORK: genuinely offered urgent problems get proper visibility. Urgent does NOT mean 24/7.',
  'COMPLETENESS: assess each intent — services hub, service pages, areas hub, FAQ hub, quotes / pricing, about,',
  'our work, contact, customer types, selected genuine location pages. Every important intent has ONE primary page.',
  'SERVICE PAGE: business → service → problem / trigger → who it is for → what is included → process →',
  'location → evidence → customer questions → next step. No arbitrary word counts, no thin pages.',
  'FAQ: question → direct answer → supporting detail → link to the primary page. One strong FAQ hub plus',
  'contextual service FAQs — never hundreds of FAQ pages.',
  'AREAS: a genuine /areas/ hub where useful; never service × town doorway pages; a standalone location page',
  'only with genuinely distinct information (not a swapped town name).',
  'PRICING: real prices published accurately; without them, a quotes / pricing resource on genuine buying',
  'questions (what affects the price, how quoting works, what helps a quote). Never an invented figure.',
  'CONTACT: never harder to contact than before — phone, WhatsApp, email, enquiry / quote where supported. A',
  'form must genuinely submit before production; a form with no handler is a pre-go-live blocker, never faked.',
  'TRADE TEMPLATES: the Findable core system (design quality, technical baseline, responsive behaviour, core',
  'components) + a TRADE VARIANT (imagery, icons, terminology, customer questions, service structure,',
  'high-intent problems, relevant proof). Never simply recolour another client\'s site.',
  'AI VISIBILITY: make it easy to determine the exact business, trade, services, base, real areas, customers,',
  'contact, credentials, differentiators and genuine evidence: QUESTION → DIRECT ANSWER → DETAIL → EVIDENCE.',
  'Never hidden AI copy, keyword stuffing, fake citations, mass AI pages, schema stuffing, a default llms.txt,',
  'or a promise of recommendation.',
  'Do not optimise for MORE content. Optimise for crawlable, clear, specific, consistent, useful, verifiable,',
  'sourceable, visually strong, conversion-ready, measurable.',
];

/** The build prompt's visual / commercial QA section and what the result must report. */
export const UPGRADE_QA_LINES: string[] = [
  '- VISUAL / COMMERCIAL: real branding; genuine imagery; the important proof visible; no obviously sparse section; a clear conversion path.',
  '- OLD vs NEW (existing-site rebuilds): capture the OLD site and the NEW preview at MATCHING viewports — desktop 1440×900 and mobile 390 wide (plus 1024 / 768 / 375 where useful) —',
  '  and compare hero, visual richness, professionalism, credibility, real work, qualifications, service clarity, breadth, contact / conversion, mobile experience and brand continuity.',
  '  Ask: "If the owner saw both sites side by side with no SEO explanation, would the new one reasonably feel like an upgrade?"',
  '  If clearly NO, it is NOT preview_ready: report quality.oldVsNew.verdict "not_upgrade" and list, in stillStronger, where the old site still wins. No numerical score.',
  '- Every existing-site strength in the list above must be present on the new site where its decision says (or removed only for its stated reason).',
];
