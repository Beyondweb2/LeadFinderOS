// WHAT THE WEBSITE CHECK MAY SAY TO A CLIENT, BY HOW OFTEN IT IS RIGHT (2026-11-15, docs/WEBSITE_CHECK_ACCURACY.md).
//
// Every finding kind is measured on the bench (scripts/website-check-bench: 27 real lead sites, each finding checked by
// hand against what a real browser shows). ⛔ A kind measured under ACCURACY_BAR is not shown to a client (report, hook
// report, LeadFinderOS report) until it is fixed and measured again; it stays on the team's own screens. A kind the bench
// has not measured is shown as before — the list names only what was measured and failed.
// Leaf module: no imports, reachable from edge functions.

/** The bar a check type must clear to be said to a client (Paul, 2026-11-15). */
export const ACCURACY_BAR = 0.9;

/** The family each finding kind belongs to, for the accuracy table. */
export const CHECK_FAMILY: Record<string, string> = {
  no_address: 'contact details', no_phone: 'contact details', no_contact_details: 'contact details', no_contact_route: 'contact details',
  no_contact_page: 'contact details', vs_address_not_on_key_pages: 'contact details',
  no_reviews: 'reviews and proof', ct_no_proof: 'reviews and proof', ct_unsourced_claims: 'reviews and proof',
  ct_missing_entity_facts: 'trust facts', ct_no_people: 'trust facts', ct_no_accreditations: 'trust facts',
  ct_accreditations_unnamed: 'trust facts', ct_conflicting_facts: 'trust facts', no_about_page: 'trust facts',
  ct_areas_not_stated: 'areas and town', ct_area_coverage: 'areas and town', town_missing: 'areas and town', location_unclear: 'areas and town',
  no_service_pages: 'services', service_page_gaps: 'services', services_on_one_page: 'services', internal_linking: 'services', one_page_site: 'services',
  vs_key_page_basics: 'headings, titles, descriptions', missing_h1: 'headings, titles, descriptions', missing_title: 'headings, titles, descriptions',
  missing_description: 'headings, titles, descriptions', multiple_h1: 'headings, titles, descriptions', long_titles: 'headings, titles, descriptions',
  duplicate_titles: 'headings, titles, descriptions', ct_vague_headings: 'headings, titles, descriptions',
  name_unclear: 'business name', vs_name_inconsistent: 'business name',
  no_business_schema: 'structured data', vs_business_schema: 'structured data', schema_malformed: 'structured data', ct_schema_mismatch: 'structured data',
  vs_faq_no_schema: 'structured data', no_breadcrumbs: 'structured data', schema_phone_mismatch: 'structured data', schema_wrong_domain: 'structured data',
  ct_schema_incomplete: 'structured data',
  noindex_home: 'indexing rules', noindex_pages: 'indexing rules', noindex_important_page: 'indexing rules', canonical_mismatch: 'indexing rules',
  canonical_off_site: 'indexing rules', canonical_off_domain: 'indexing rules', vs_duplicate_homepage: 'indexing rules',
  robots_blocks_all: 'AI crawlers and robots.txt', robots_blocks_ai_search: 'AI crawlers and robots.txt', robots_blocks_oai_searchbot: 'AI crawlers and robots.txt',
  robots_blocks_perplexitybot: 'AI crawlers and robots.txt', robots_disallowed_pages: 'AI crawlers and robots.txt', no_robots: 'AI crawlers and robots.txt',
  no_sitemap: 'sitemap', sitemap_off_site: 'sitemap', sitemap_wrong_domain: 'sitemap', sitemap_only_pages: 'sitemap',
  redirects_to_other_domain: 'redirects', internal_redirects: 'redirects',
  ct_dead_links: 'links', ct_link_mismatch: 'links', broken_pages: 'links', ct_logo_alt_mismatch: 'links',
  thin_key_pages: 'content', thin_pages: 'content', vs_town_swapped_pages: 'content', ct_placeholder_content: 'content', ct_generic_copy: 'content',
  ct_ai_images: 'content', no_questions_answered: 'content', client_rendered: 'content', home_no_text: 'content',
  slow_pages: 'speed and mobile', some_slow_pages: 'speed and mobile', heavy_pages: 'speed and mobile', no_viewport: 'speed and mobile',
  ct_image_alt: 'images', no_https: 'HTTPS',
};

/** ⛔ Measured under ACCURACY_BAR after the fixes of 2026-11-15: never said to a client until fixed and re-measured.
 *  Each is listed with its bench score in docs/WEBSITE_CHECK_ACCURACY.md. Filled in from the bench, not by guess. */
export const CLIENT_HIDDEN_KINDS: ReadonlySet<string> = new Set<string>([
  'ct_dead_links',          // 6 of 7 (86%): menu headings that open a submenu are still read as links to "#"
  'ct_no_accreditations',   // 8 of 9 (89%): a scheme named only in a logo, or cut short ("Check A T…"), is not seen
  'ct_logo_alt_mismatch',   // 0 of 2 before the fix, none produced since: not shown until it is measured right
]);

/** The findings a client may read: everything but the kinds measured under the bar. Order kept. Pure. */
export function clientReportIssues<T extends { id: string }>(issues: readonly T[]): T[] {
  return issues.filter((i) => !CLIENT_HIDDEN_KINDS.has(i.id));
}
