/* WHAT TO FIX FIRST — the plain-English fix for each website finding the quick report can show (2026-10-23).

   ONE PLACE for these words, keyed by the finding's KIND (the stable key every crawl / content / evidence
   finding carries), never by its wording. The quick report prints at most FIX_LINES_MAX of them, in the
   order the issues were ranked, and only for findings the crawl actually made.

   ⛔ NOTHING INVENTED. A kind with no entry here prints no fix line. The record is exhaustive on purpose:
   every kind must be listed, with a line or an explicit null, so a new finding kind fails to compile
   until someone decides what (if anything) the report says about fixing it.
   ⛔ A FIX IS NOT A PROMISE. No line says the fix will get the business named, none quotes a number we
   do not measure (no "300 words"), none names a tool, price or guarantee. They say what to put right.
   ⛔ PENDING PAUL'S APPROVAL of the wording (docs/audit-report-v3-fix-lines.md) before this ships.

   Pure and edge-reachable: type-only imports, relative paths, no DOM. */

import type { ContentTrustKind } from './contentTrust.ts';
import type { CrawlFaultKind } from './crawlCheck.ts';
import type { EvidenceKind } from './siteEvidence.ts';

export interface FixLine { title: string; detail: string }

/** How many "what to fix first" lines the report shows. */
export const FIX_LINES_MAX = 3;

export type FixKind = ContentTrustKind | CrawlFaultKind | EvidenceKind;

/** A line, or null = deliberately says nothing (too technical, too minor, or never shown on this report). */
export const FIX_LINES: Record<FixKind, FixLine | null> = {
  // The crawl's own faults
  search_blocked: { title: 'Let AI tools read your site', detail: 'Stop blocking the crawlers AI uses to fetch your pages.' },
  client_rendered: { title: 'Make your homepage readable', detail: 'Put your key text in the page itself, not only in scripts that load afterwards.' },
  duplicates: { title: 'Give each page its own content', detail: 'Rewrite near-identical pages so each one says something different.' },
  thin_pages: { title: 'Give each page more to quote', detail: 'Add real, specific content to the short pages.' },
  missing_h1: { title: 'Add a clear heading to each page', detail: 'Say plainly what the page is about, and where.' },
  no_structured_data: null,
  // The deep-crawl evidence
  sitemap_wrong_domain: { title: 'Point your sitemap at your own site', detail: 'List only your own pages in the sitemap.' },
  canonical_off_domain: { title: 'Fix which address is the main version', detail: 'Make each page name your own site as the original.' },
  schema_wrong_domain: { title: 'Correct your business details in the page code', detail: 'Use your own web address in the business information the pages carry.' },
  noindex_important_page: { title: 'Let your main pages be listed', detail: 'Remove the instruction asking search tools to leave them out.' },
  // The content and trust checks
  robots_blocks_ai: { title: 'Let AI tools read your site', detail: 'Stop blocking the crawlers AI uses to fetch your pages.' },
  no_https: { title: 'Serve your site securely', detail: 'Move the site to https.' },
  placeholder_content: { title: 'Replace the placeholder text', detail: 'Finish or remove the unfinished text and blocks that are live.' },
  broken_links: { title: 'Fix the pages that don’t load', detail: 'Repair or remove links that lead to errors.' },
  schema_mismatch: { title: 'Correct your business details in the page code', detail: 'Make the business information match what the site actually says.' },
  conflicting_facts: { title: 'Make your facts agree', detail: 'Use one consistent figure, such as years trading, everywhere.' },
  no_proof: { title: 'Show proof from real customers', detail: 'Add reviews, testimonials or case studies, and say where they come from.' },
  accreditations_unnamed: { title: 'Name your accreditations', detail: 'Say which scheme or body each qualification comes from.' },
  vague_headings: { title: 'Say what you do and where, in your headings', detail: 'Make the main headings plain statements of the service and the area.' },
  area_coverage: { title: 'Give each area you cover its own page', detail: 'Add a page for each town or area you work in.' },
  areas_not_stated: { title: 'State the areas you cover', detail: 'List the towns you work in on the site.' },
  ai_images: { title: 'Use real photos', detail: 'Replace images that look AI-generated with photos of your own work.' },
  link_mismatch: { title: 'Make links go where they say', detail: 'Check each link points to the page its label describes.' },
  no_viewport: { title: 'Make your homepage work on phones', detail: 'Set the page up so it displays properly on a phone.' },
  logo_alt_mismatch: { title: 'Correct your logo descriptions', detail: 'Make each logo image’s description name the right company.' },
  image_alt: { title: 'Describe your images', detail: 'Add a short description (alt text) to each image.' },
  identical_dates: { title: 'Give each post its real date', detail: 'Stop every post carrying the same date.' },
  generic_copy: { title: 'Be more specific on your pages', detail: 'Add specifics about what you do, where, and for whom.' },
  mixed_audience: { title: 'Keep each page to one audience', detail: 'Give a different kind of customer their own page.' },
  missing_entity_facts: { title: 'Say who you are and when you started', detail: 'Add your founding year or company number.' },
  no_people: { title: 'Say who runs the business', detail: 'Add the names of the people behind it.' },
  no_accreditations: { title: 'Name your accreditations or memberships', detail: 'List any scheme or body you belong to.' },
  schema_incomplete: null,
  schema_unverified: null,
  dead_links: { title: 'Remove links that go nowhere', detail: 'Fix or delete links that lead nowhere.' },
  orphan_pages: null,
  no_sitemap: { title: 'Add a sitemap', detail: 'List your pages in an XML sitemap so tools can follow them.' },
  listing_no_link: { title: 'Link your Google listing to your site', detail: 'Add your website address to your Google Business Profile.' },
  unsourced_claims: { title: 'Show where your claims come from', detail: 'Name the source of any pass rate or star rating you quote.' },
};

/** THE WEBSITE CHECK'S OWN NAMES (2026-10-23). The report's issues come, on a live report, from the lead's ONE
 *  website check (websiteCheck.ts), whose findings carry siteAudit ids (and `ct_<kind>` for a content check) — not
 *  the kinds above. Each alias points a site-audit id at a line Paul already approved; it never adds wording, and
 *  an id with no honest equivalent is simply absent (so it prints no fix). Training-bot blocks
 *  (`robots_blocks_<token>`) are deliberately NOT aliased: only a block of everything or of the search crawlers
 *  is a reason AI cannot read the site. */
export const FIX_ALIASES: Readonly<Record<string, FixKind>> = {
  robots_blocks_all: 'search_blocked',
  search_crawler_refused: 'search_blocked',
  sitemap_off_site: 'sitemap_wrong_domain',
  noindex_home: 'noindex_important_page',
  noindex_pages: 'noindex_important_page',
  canonical_off_site: 'canonical_off_domain',
  broken_pages: 'broken_links',
  thin_key_pages: 'thin_pages',
  near_duplicate_pages: 'duplicates',
  no_reviews: 'no_proof',
  town_missing: 'areas_not_stated',
  schema_phone_mismatch: 'schema_mismatch',
};

/** A finding's key → the FixKind it maps to: a content check's `ct_` prefix dropped, then the alias, else itself. */
function fixKindOf(raw: string): string {
  const k = raw.startsWith('ct_') ? raw.slice(3) : raw;
  return Object.prototype.hasOwnProperty.call(FIX_ALIASES, k) ? FIX_ALIASES[k] : k;
}

/** The fix lines for these finding kinds: in the order given (the issues' own ranking), one per distinct
 *  line, none for a null or unknown kind, at most FIX_LINES_MAX. */
export function fixLinesFor(kinds: ReadonlyArray<string | null | undefined>, max: number = FIX_LINES_MAX): FixLine[] {
  const out: FixLine[] = [];
  const seen = new Set<string>();
  for (const raw of kinds) {
    if (!raw) continue;
    const k = fixKindOf(raw);
    if (!Object.prototype.hasOwnProperty.call(FIX_LINES, k)) continue;
    const line = FIX_LINES[k as FixKind];
    if (!line || seen.has(line.title)) continue;
    seen.add(line.title);
    out.push(line);
    if (out.length >= max) break;
  }
  return out;
}
