# Audit report v3 — "What to fix first" lines, for Paul's approval (2026-10-23)

Source of truth: `src/lib/siteFixLines.ts`. The quick report prints at most **three**, in the order its website
issues were ranked, one per distinct line, and **only for a finding the crawl actually made** and the report showed.
A finding with no line here prints no fix. No line carries a number, a price, a promise or a claim about how AI decides
(`scripts/audit-report-v3-layout.test.ts` and `client-copy-claims.test.ts` fence this).

Status: **PENDING APPROVAL. Do not deploy until Paul has approved or edited these.**

| Finding (kind) | Title | Detail |
|---|---|---|
| AI crawler blocked (`search_blocked`, `robots_blocks_ai`) | Let AI tools read your site | Stop blocking the crawlers AI uses to fetch your pages. |
| Homepage needs scripts to read (`client_rendered`) | Make your homepage readable | Put your key text in the page itself, not only in scripts that load afterwards. |
| Near-identical pages (`duplicates`) | Give each page its own content | Rewrite near-identical pages so each one says something different. |
| Thin pages (`thin_pages`) | Give each page more to quote | Add real, specific content to the short pages. |
| No H1 (`missing_h1`) | Add a clear heading to each page | Say plainly what the page is about, and where. |
| Sitemap names another site (`sitemap_wrong_domain`) | Point your sitemap at your own site | List only your own pages in the sitemap. |
| Canonical names another site (`canonical_off_domain`) | Fix which address is the main version | Make each page name your own site as the original. |
| Business details point elsewhere (`schema_wrong_domain`, `schema_mismatch`) | Correct your business details in the page code | Use your own web address in the business information the pages carry. / Make the business information match what the site actually says. |
| Main page marked not to be listed (`noindex_important_page`) | Let your main pages be listed | Remove the instruction asking search tools to leave them out. |
| No https (`no_https`) | Serve your site securely | Move the site to https. |
| Placeholder text live (`placeholder_content`) | Replace the placeholder text | Finish or remove the unfinished text and blocks that are live. |
| Broken links (`broken_links`) | Fix the pages that don’t load | Repair or remove links that lead to errors. |
| Conflicting facts (`conflicting_facts`) | Make your facts agree | Use one consistent figure, such as years trading, everywhere. |
| No proof (`no_proof`) | Show proof from real customers | Add reviews, testimonials or case studies, and say where they come from. |
| Accreditations unnamed (`accreditations_unnamed`) | Name your accreditations | Say which scheme or body each qualification comes from. |
| Vague headings (`vague_headings`) | Say what you do and where, in your headings | Make the main headings plain statements of the service and the area. |
| Area coverage (`area_coverage`) | Give each area you cover its own page | Add a page for each town or area you work in. |
| Areas not stated (`areas_not_stated`) | State the areas you cover | List the towns you work in on the site. |
| AI-looking images (`ai_images`) | Use real photos | Replace images that look AI-generated with photos of your own work. |
| Link mismatch (`link_mismatch`) | Make links go where they say | Check each link points to the page its label describes. |
| No mobile viewport (`no_viewport`) | Make your homepage work on phones | Set the page up so it displays properly on a phone. |
| Logo captions wrong (`logo_alt_mismatch`) | Correct your logo descriptions | Make each logo image’s description name the right company. |
| Images lack alt text (`image_alt`) | Describe your images | Add a short description (alt text) to each image. |
| Same date on posts (`identical_dates`) | Give each post its real date | Stop every post carrying the same date. |
| Generic copy (`generic_copy`) | Be more specific on your pages | Add specifics about what you do, where, and for whom. |
| Mixed audience (`mixed_audience`) | Keep each page to one audience | Give a different kind of customer their own page. |
| No founding year / company no. (`missing_entity_facts`) | Say who you are and when you started | Add your founding year or company number. |
| No people named (`no_people`) | Say who runs the business | Add the names of the people behind it. |
| No accreditations (`no_accreditations`) | Name your accreditations or memberships | List any scheme or body you belong to. |
| Dead links (`dead_links`) | Remove links that go nowhere | Fix or delete links that lead nowhere. |
| No sitemap (`no_sitemap`) | Add a sitemap | List your pages in an XML sitemap so tools can follow them. |
| Google listing doesn't link to site (`listing_no_link`) | Link your Google listing to your site | Add your website address to your Google Business Profile. |
| Unsourced pass rate / star rating (`unsourced_claims`) | Show where your claims come from | Name the source of any pass rate or star rating you quote. |

**Deliberately silent (no fix line):** `no_structured_data` (never shown on this report), `schema_incomplete`,
`schema_unverified`, `orphan_pages` (too technical or minor to lead with).

## Rules this taught
- Fix lines are keyed by finding KIND, never by wording, in one file; the record is exhaustive (a new kind will not
  compile until someone decides what the report says about fixing it).
- A fix line is not a promise: no figure, price, guarantee or claim about how AI decides.

## The website check's own names (added at deploy, 2026-10-23)
A live report's issues come from the lead's ONE website check, whose findings use the site-audit ids (and `ct_<kind>`
for a content check). `FIX_ALIASES` in `siteFixLines.ts` points those ids at the lines above; it adds no wording:
`robots_blocks_all`, `search_crawler_refused` → let AI tools read your site · `sitemap_off_site` → sitemap · `noindex_home`,
`noindex_pages` → main pages listed · `canonical_off_site` → main version · `broken_pages` → pages that don’t load ·
`thin_key_pages` → more to quote · `near_duplicate_pages` → own content · `no_reviews` → proof · `town_missing` → areas ·
`schema_phone_mismatch` → business details. Training-bot blocks (`robots_blocks_<token>`), generic schema, `no_service_pages`,
`one_page_site` and the rest print no fix.
