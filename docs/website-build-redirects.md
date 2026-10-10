# Website Build — old pages / ranking protection (2026-10-10)

Branch `feat/website-build-redirects`. Ported from V2 (`leadfinderos-v2` `cf83459`, `packages/core/src/websiteBuild/oldUrls.ts`) into
V1's patterns. Code: `src/lib/oldPages.ts` (every rule), `scripts/site-quality-gate.mjs` (the fetch), `src/lib/simpleBuild.ts`
(Prepare, Needs you, the prompt), `src/lib/websiteLaunch.ts` (launch + live rule + save refusal), `SimpleWebsiteBuild.tsx` (the panel).
Tests: `scripts/website-build-redirects.test.ts`.

## The rule

When a client with an existing website gets a new one (Template, Visual rebuild, Close recreation, Bespoke), every IMPORTANT old address
must still answer on the new site, or redirect ONCE and PERMANENTLY (301 / 308) to the right new page. A client with no old site is
exempt only by an explicit record ("They have no old website" + how Paul knows, ≥10 characters).

## Where it is stored (no migration)

`outreach_leads.website_build` (the existing JSON column):

- `old_pages` — `site_url`, `recorded_at`, `read_from` (`full_crawl` / `quick_crawl` / `homepage_only`), `none_at` / `none_reason`
  (the exemption), and `urls[]`: `path`, `source` (`crawl` / `sitemap` / `person`), `important`, `reasons[]`, `target`, `home_reason`.
- `build_execution.old_urls` — the PREVIEW gate run's fetch of each address (raw facts: hops, final status, final path, soft 404,
  noindex, problem) and the address it ran on.
- `production_gate.old_urls` — the same from the LIVE gate run.

The parser lives in `websiteBuildState.ts` (shared with `paid-client-hub`), so the server keeps the new keys.

## The flow

1. **Prepare website** reads the stored full crawl through `paid-client-hub` `old_site_pages` (stored rows only — URL, how it was
   found, inbound links from the crawl's link graph; nothing fetched, nothing spent), else the quick crawl's pages, else just the home
   page. `inventoryFromCrawl` keeps same-host pages only (no assets, admin, feeds, tags, carts; not a page that was 404 / 410 on the
   old site). `mergeOldUrls` never drops a found address and never overwrites a decision; a different old host starts again.
2. **Important:** everything found starts important. Always important (cannot be unmarked): the home page, a service page (path says
   "service" or names a confirmed service), contact, and a sitemap page with inbound links — or a sitemap page whose links are not known
   (the crawl only records how a page was FIRST found, so "in the sitemap" is incomplete; unsure = important).
3. **Mapping:** `autoMapOldUrls` — same path = kept; contact / about / privacy / areas to their page; a service to the service page that
   shares its words, else the services hub. Never the home page for anything but the home page. What it cannot place is a **blocker**
   under Needs you ("N important old pages have no new page") and the Master Build Prompt waits. Paul picks the page from a dropdown;
   the home page needs a written reason (≥10 characters).
4. **The prompt** (section 4b) lists the addresses to keep and each 301 for `public/_redirects` ("/old /new/ 301" — a line with no
   status is a 302 on Cloudflare), straight to the final address with its trailing slash. The expect file (`qa/findable-expect.json`)
   carries `oldUrls`. The correction prompt and the launch prompt re-issue the CURRENT list into the expect file, so a page re-mapped
   after the first build is checked against its new target.
5. **The gate script** (`--url`, preview and live) requests every listed address itself with `redirect: manual`, follows hops one by
   one (never off the site, at most five), and fails: 404 / 410, a soft 404 (a "not found" title / H1, or the same page a made-up address
   gets — an SPA fallback), the wrong target, a home-page dump, a 302 / 303 / 307, more than one hop, a noindex target (preview: the
   page's own meta only, because every preview page carries the preview noindex header; live: the header too). The raw facts go in the
   report as `oldUrls`. `--dist` checks the same list statically against `public/_redirects`.
6. **LeadFinderOS judges the results itself** (`judgeOldUrlResult`, the same rule as the gate's `judgeOldUrl` — the test runs both
   over one table). The report's own "passed" is never read; a result that does not say "not a soft 404" / "not noindex" is a fail; a
   result for an older mapping, a check on another address, or an important address the report left out does not count.
7. **Launch** (`productionReadiness`, enforced by the server in `websiteBuildSaveRefusal`): every important old page protected on the
   preview, or "no old site" recorded. **Production checked** (`productionGateProblems`, now with a REQUIRED `oldPages` argument): the
   same on the live domain (www ignored).
8. **Simple screen:** one line, "Old pages protected: X of Y", the missing ones in plain words, the unmapped ones with a dropdown, the
   full list folded, "add an address" by hand. The same line sits above the technical check in Review. No Advanced-mode work was added.

The server also refuses a save that removes a FOUND address, un-marks a must-keep page, or records "no old site" while old pages are
listed (`oldPagesSaveRefusal`).

## What V1 can and cannot enforce — honest

- **V1 judges a pasted report.** Nothing proves the fetch happened. A hand-typed report with invented raw facts (200, right path, one
  301) still reads as fetched. What the design now stops: a report that only SAYS passed, a 302 / chain / wrong target / home dump /
  noindex / soft 404 called fine, a check on another address or for an older mapping, and any important address left out.
- **Harder to fake inside V1:** possible, not built. `paid-client-hub` (admin-only, service role) could fetch the recorded preview URL
  (`https://*.pages.dev` on the recorded project) and the canonical domain itself, with the same `checkOldUrls` logic, and store the
  result in a key the save rule copies from the stored row instead of the browser. That is the first place V1 would fetch a client site
  server-side — a design change, so it is offered as a decision, not done.
- **The launch rules can be bypassed by a direct write.** Verified live 2026-10-10: `outreach_leads` has a RESTRICTIVE admin policy plus
  PERMISSIVE "own row" policies and no trigger on `website_build`. The one admin account owns every lead (5,655), so a signed-in admin
  session can PATCH `website_build` straight through PostgREST and skip `websiteBuildSaveRefusal`. The fix is a small trigger that
  refuses a change to the production fields of `website_build` unless the writer is the service role (paid-client-hub). Not done here
  (a live-table trigger is a database change Paul should approve).
- **The old-page list is computed in the browser** from the server's crawl rows; the server only refuses removals. A malicious browser
  could record a short list on the first save.
- **Not built:** query-string addresses (`/?p=123` — `_redirects` cannot match queries; the path is kept), a domain MOVE (the old
  domain's own redirects), and addresses the crawl never found (Paul adds them by hand; no Search Console import in V1).

## Legacy records

BS4 (the one real build) has no `old_pages` yet: its next Prepare records them. Its preview status does not change (the rule sits in
the launch and the technical check, not in `previewReadyProblems`). Nothing was migrated or rewritten.
