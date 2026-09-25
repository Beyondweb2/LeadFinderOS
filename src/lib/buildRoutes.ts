/* ════════════════════════════════════════════════════════════════════════════════════════════════
   WEBSITE BUILD ROUTES — the three ways a Findable site gets made, and what each stage asks for on
   each route. Guidance only: the seven stages stay the same; the checklist inside each one changes.

     FAITHFUL REBUILD   the client's authorised existing site, rebuilt in new code, looking and
                        behaving as it does now.
     TEMPLATE REBUILD   the client's facts, evidence and assets mapped into a Findable trade template.
                        The default whenever a template suits the trade.
     BESPOKE / NEW TRADE  a new architecture and design, when no template fits. A finished bespoke
                        build may later be promoted into a template.

   ⛔ THE ROUTE IS THE OPERATOR'S DECISION. Nothing here picks one; `templateSuitsTrade` only says
   whether the Template route should wear the "recommended" label.
   ⛔ A CHECK KEY IS STORED, SO IT IS NEVER RENAMED. website_build.checks keeps `route.stage.key`
   strings; renaming one silently un-ticks it for every client. Add new keys, retire old ones.

   ⚠️ Edge-reachable (websiteBuildState.ts imports the key list): relative imports with .ts only, and
   no RUNTIME import from websiteBuildState.ts (it imports this file — types only in this direction).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import type { BuildRoute, Stage } from './websiteBuildState.ts';

export interface RouteInfo { label: string; short: string; description: string }

export const ROUTE_INFO: Record<BuildRoute, RouteInfo> = {
  faithful_rebuild: {
    label: 'Faithful rebuild',
    short: 'Same site, new code',
    description: "Rebuild the client's authorised existing website in new code while preserving its visual appearance, content hierarchy and behaviour as closely as practical.",
  },
  template_rebuild: {
    label: 'Template rebuild',
    short: 'Their facts, our template',
    description: "Capture the client's existing business information, evidence and assets and map them into an existing Findable trade template.",
  },
  bespoke: {
    label: 'Bespoke / new trade',
    short: 'New architecture and design',
    description: 'Create a new architecture/design when no suitable Findable template exists or the project genuinely requires a bespoke build. The completed build may later become a reusable trade template.',
  },
};

export interface RouteCheck { key: string; label: string }

/* One list per route per stage. Keys are stored (see header) — never rename one. */
const G: Record<BuildRoute, Partial<Record<Stage, RouteCheck[]>>> = {
  faithful_rebuild: {
    intake: [
      { key: 'authorised', label: 'Client has authorised us to rebuild their existing site' },
      { key: 'ownership', label: 'Copy / design ownership recorded' },
    ],
    capture: [
      { key: 'url_inventory', label: 'Full URL inventory' },
      { key: 'screenshots', label: 'Screenshots of every page family (desktop + mobile)' },
      { key: 'page_families', label: 'Page families identified' },
      { key: 'section_order', label: 'Section order per page family' },
      { key: 'fonts', label: 'Fonts (families, weights, sizes)' },
      { key: 'colours', label: 'Colours (hex)' },
      { key: 'spacing', label: 'Spacing / layout / container widths' },
      { key: 'logos', label: 'Logos (SVG where possible)' },
      { key: 'assets', label: 'Owned photos / assets downloaded locally' },
      { key: 'responsive', label: 'Responsive behaviour at each width' },
      { key: 'navigation', label: 'Navigation + mobile menu' },
      { key: 'sticky', label: 'Sticky / floating elements' },
      { key: 'forms', label: 'Forms and where they send' },
      { key: 'interactions', label: 'Interactions (accordions, sliders, popups)' },
      { key: 'seo_meta', label: 'SEO metadata (titles, descriptions, canonicals)' },
      { key: 'schema', label: 'Schema / JSON-LD' },
      { key: 'redirects', label: 'Existing redirects observed' },
    ],
    architecture: [
      { key: 'ia_preserved', label: 'Existing information architecture preserved' },
      { key: 'changes_reasoned', label: 'Every page / URL change has a documented reason' },
      { key: 'nav_order', label: 'Navigation order matches the original' },
    ],
    preview: [
      { key: 'side_by_side', label: 'Source vs preview compared for every page family' },
      { key: 'all_widths', label: 'Compared at every target width' },
    ],
  },
  template_rebuild: {
    intake: [
      { key: 'template_fits', label: 'Template suits this trade' },
      { key: 'required_facts', label: "Template's required facts collected" },
    ],
    capture: [
      { key: 'business_facts', label: 'Verified business facts' },
      { key: 'services', label: 'Genuine services' },
      { key: 'locations', label: 'Genuine locations / service areas' },
      { key: 'prices', label: 'Prices (or confirmed none published)' },
      { key: 'credentials', label: 'Credentials / accreditations' },
      { key: 'evidence', label: 'Evidence (jobs, case studies, proof)' },
      { key: 'reviews', label: 'Review profiles' },
      { key: 'assets', label: 'Owned assets (logo, photos)' },
      { key: 'tracking', label: 'Tracking / analytics to carry over' },
      { key: 'legal', label: 'Legal requirements (privacy, cookies, regulated wording)' },
    ],
    architecture: [
      { key: 'mapped', label: 'Verified facts mapped into the template page families' },
      { key: 'unsupported_dropped', label: 'Template pages the client cannot support are dropped' },
      { key: 'old_urls', label: 'Old URLs handled (kept or redirected)' },
    ],
    preview: [
      { key: 'template_look', label: 'Preview matches the template design system' },
      { key: 'no_seed_values', label: 'No seed-client values visible' },
    ],
  },
  bespoke: {
    intake: [
      { key: 'no_template', label: 'Confirmed no suitable Findable template exists' },
      { key: 'references', label: 'Design references chosen (existing Findable sites / templates)' },
    ],
    capture: [
      { key: 'discovery', label: 'Complete business discovery done' },
      { key: 'customers', label: 'Who the customers are and what they search for' },
      { key: 'services', label: 'Full service list with what each involves' },
      { key: 'locations', label: 'Where they work, and where they want more work' },
      { key: 'proof', label: 'Proof / evidence available' },
      { key: 'assets', label: 'Owned assets (logo, photos)' },
      { key: 'existing_site', label: 'Existing site captured (if there is one)' },
    ],
    architecture: [
      { key: 'intent', label: 'Pages derived from customer / search intent' },
      { key: 'service_structure', label: 'Service structure decided' },
      { key: 'location_strategy', label: 'Location strategy decided (no cloned town pages)' },
      { key: 'proof_per_page', label: 'Proof / evidence each page needs is identified' },
      { key: 'design_refs', label: 'Design references applied' },
    ],
    preview: [
      { key: 'design_review', label: 'Design reviewed against the chosen references' },
    ],
  },
};

export function routeChecks(route: BuildRoute | '', stage: Stage): RouteCheck[] {
  return route ? (G[route][stage] ?? []) : [];
}

export const checkId = (route: BuildRoute, stage: Stage, key: string) => route + '.' + stage + '.' + key;

/** Every storable check id — the save rule keeps only these. */
export const ALL_ROUTE_CHECK_IDS: readonly string[] = (Object.keys(G) as BuildRoute[]).flatMap((r) =>
  (Object.keys(G[r]) as Stage[]).flatMap((st) => (G[r][st] ?? []).map((c) => checkId(r, st, c.key))));

/** One line of stage guidance per route — what this stage is FOR on this route. */
export const ROUTE_STAGE_FOCUS: Record<BuildRoute, Partial<Record<Stage, string>>> = {
  faithful_rebuild: {
    capture: 'Capture everything needed to reproduce the site: every URL, how it looks at each width, and how it behaves.',
    architecture: 'Preserve the existing information architecture. Change a page or URL only with a documented reason.',
    preview: 'Compare source and preview side by side, page family by page family, at every target width.',
  },
  template_rebuild: {
    capture: 'Capture the business, not the design: verified facts, genuine services and locations, evidence and owned assets.',
    architecture: "Map the verified facts into the selected template's page families. Drop what the client cannot support.",
    preview: 'Check the preview looks like the template and carries none of the seed client.',
  },
  bespoke: {
    capture: 'Complete business discovery: what they do, for whom, where, and what proves it.',
    architecture: 'Design a new architecture from customer / search intent, with a service structure, a location strategy and proof per page.',
    preview: 'Review the design against the chosen references.',
  },
};

/** Should the Template route carry the "recommended" label for this trade? Words only; no choice. */
export function templateSuitsTrade(trade: string, supported: readonly string[]): boolean {
  const t = trade.toLowerCase().replace(/[^a-z ]+/g, ' ').trim();
  if (!t) return false;
  const stem = (w: string) => w.replace(/(ies)$/, 'y').replace(/(s|es)$/, '');
  const tradeWords = t.split(/\s+/).filter((w) => w.length > 3).map(stem);
  return supported.some((s) => s.toLowerCase().split(/[^a-z]+/).filter((w) => w.length > 3).map(stem)
    .some((w) => tradeWords.some((tw) => tw === w || tw.startsWith(w) || w.startsWith(tw))));
}
