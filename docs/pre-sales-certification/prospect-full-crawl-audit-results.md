# Prospect full crawl + detailed audit results

- **Date:** Monday 5 October 2026. **Branch:** `improve/prospect-full-crawl-audit-results`, cut from `origin/main`
  `9fd5a144` (the live v3 commercial/legal release). Worktree `C:/Users/paulj/LeadFinderOS-wt/prospect-full-crawl-audit-results`.
- **Not merged, not deployed** (parallel feature session). No migration. Edge functions to deploy are listed in §8.
- Paul's brief: a salesperson must be able to inspect AI visibility and the prospect's website evidence before or during
  a call, in a large, single-scroll, phone-friendly view, from a crawl that reads as much of the real site as practical,
  with repeated issues grouped and nothing invented.

---

## 1. Old behaviour (traced)

| Surface | What it was |
|---|---|
| AI check card (`HookVisibilityView`) — Inbox, lead popup's AI check, the Outreach row's audit popup | "View details" opened an **absolute overlay capped at `max-h-[40vh]`** with its own scroll. In the Outreach audit popup that overlay sat inside a `max-w-xl max-h-[90vh] overflow-y-auto` dialog: two nested scrollers, answers clamped to 4 lines, no cited sources. |
| Call tab, "What we found" | Short version only: the X / 6 count, one opportunity, a `<details>` of the questions, website findings from the quick crawl. No way to see more. |
| Crawl check popup (`CrawlCheckDialog`) | `max-w-lg max-h-[85vh]` scroller: fault lines + site info. |
| Crawler | One engine, two profiles. Every pressed crawl (salespeople included, despite a comment saying operator-only) was the **exhaustive** background job: no page cap, only a 50,000-URL runaway ceiling; every press started a NEW job. Its per-crawl summary kept up to 40 example URLs per technical issue, 15 issue kinds. No AI-crawler robots rules (only real fetches as four AI search crawlers), no viewport, no malformed JSON-LD, no canonical-to-another-page, no link graph, no business-clarity checks against the lead. A failed homepage stored only `fetchFailed: true`. |
| Citations | Stored per cell (`ai_audit_queue.result[engine].citations`), dropped by `scoreHookRun`. |

Live numbers (read-only, 2026-10-05): 305 lead crawl rows — 3 full crawls (avg ~6.7 KB compressed `full_evidence`), 302 quick
12-page checks (`mode` standard or null). Three crawl jobs ever: 1,476 / 68 / 69 URLs.

## 2. Crawler architecture (what changed)

Same engine (`_shared/crawl-job.ts` + `crawl-worker`, `crawl_jobs` / `crawl_urls` / `lead_crawl_checks`) — no second crawler.

- **`src/lib/prospectCrawl.ts`** (pure, edge-safe) decides two things:
  - `crawlPageCapFor` — **a prospect crawl reads at most `PROSPECT_CRAWL_PAGE_CAP` pages (500).** A paying client's crawl
    (`isClientLead`) or one started from Paid Clients / Website Build stays exhaustive. ⛔ Exhaustive is the positive match:
    an unknown source on a non-client lead gets the cap.
  - `prospectCrawlReuse` — **a saved full crawl younger than `PROSPECT_CRAWL_REUSE_MS` (7 days) on the same site is reused**:
    the press answers `{ cached: true, job_id, crawled_at }` and nothing is fetched. Not reused: a failed crawl, a quick
    check, another website on the lead, or a stale one. `force: true` re-crawls for an admin any time, for a salesperson only
    once the saved crawl is `PROSPECT_CRAWL_MIN_GAP_MS` (1 day) old. A running job always wins (the press watches it).
- **crawl-check** (`mode: "full"`): after the existing sales lead check (works the lead, not a client, own website only —
  unchanged and still first), it reads the lead's client state, sets the cap, checks reuse **before any fetch**, and passes
  `pageCap` to `createCrawlJob`. A homepage nobody could read now stores `result.homeFetch` = `{ kind, status, detail }`
  (`classifyFetchError`: timeout · TLS/certificate · DNS · redirect loop · refused · blocked · HTTP error · empty).
- **The job**: `home.page_cap` on `crawl_jobs` (jsonb — no migration). Each tick computes room = cap − (pages read + failed);
  sitemaps are always read in full (they are how the crawl knows the site's size); when the cap is reached and no sitemap is
  left, every still-queued page becomes `skipped / coverage_cap` (a recorded row, never dropped).
- **Per-page evidence** (additive keys on `crawl_urls.evidence`, absent on older rows = "not checked", never false):
  `d.viewport`, `d.jsonLdInvalid`, `d.h3`, and `l` — up to `PAGE_LINKS_MAX` (300) same-site link paths per page.
- **Finalize**: `full_evidence.coverage` (`pageCap`, `capped`, `pagesCrawled`, `urlsDiscovered`, `notCrawled`,
  `sitemapUrls`) and **`full_evidence.audit`** — the grouped site audit (§4), built with the lead's `business_name` and
  `derived_town` (read only). Page links are loaded only up to `LINK_GRAPH_MAX_PAGES` (5,000) read pages (memory).
- **Robots per crawler**: `robotsRulesFor(body, token)` in `crawlUrl.ts` — the standard reading (the most specific group
  naming the crawler, else `*`; several groups for one agent merge).
- No model, no audit and no SEO call anywhere; nothing touches the `sales_check` allowance, the audit budget pools or
  `guard_action` (the 30-fresh-checks/day budget is untouched).

## 3. Coverage rules

| Basis | When | What the view says |
|---|---|---|
| `full` | every page found was read | "Full crawl: every page found was read (N pages)." |
| `capped` | the prospect cap was reached | "Capped crawl: read 500 of 2,390 addresses found — 1,890 not read. Not the whole site." Every "not found" finding is marked "Only true of the pages read"; click-depth and orphan checks are not judged (said under Not checked). |
| `full_legacy` | a full crawl from before this branch | its stored counts, examples-only lists marked incomplete, "re-crawl for the detailed audit" |
| `quick` | a 12-page automatic check | "Quick check — a sample of up to 12 pages, not a full crawl." with a Run-the-full-crawl button |

Every screen's one-line summary (`summariseLeadCrawl`, read by Paid Clients / Website Build) now says
"Prospect crawl (capped at 500 pages — not the whole site) · partial (capped)" for a capped row.
⚠️ CLAUDE.md §6's "every manual crawl is EXHAUSTIVE" is now true for client work only — corrected there.

## 4. The site audit and issue grouping (`src/lib/siteAudit.ts`)

`buildSiteAudit` → `{ version, basis, servedUrl, coverage, findings[], notChecked[] }`. Each finding: `id`, `category`,
`severity` (HIGH / MEDIUM / LOW / GOOD = verified — never a number), `title`, `saw` (the fact, with its number), `meaning`
(hedged: "may", "can make it harder" — never how an AI decides), `count` (pages affected), `urls` (**all**, up to
`AUDIT_URL_LIST_MAX` = 500, `urlsComplete` false when cut), optional verbatim `evidence` (robots lines, quotes, both phone
numbers) and `absence`.

**One finding per issue, never one per page**: "Missing meta description · 81 pages affected · 5 examples · Show all 81".

Checks (what a crawl now looks at):
- **AI & search crawler access** — robots.txt `User-agent: *` Disallow `/` (HIGH, said once); per crawler: OAI-SearchBot
  (HIGH), Googlebot (HIGH), Bingbot (HIGH), PerplexityBot (MEDIUM) blocking the homepage, or MEDIUM when only important
  pages (service / area / about / contact) are blocked; the real fetch refused as an AI search crawler (HIGH); homepage
  built by JavaScript (MEDIUM); GOOD "ChatGPT's search crawler can read the homepage". ⛔ GPTBot (training) is never a
  finding; llms.txt is never mentioned.
- **Discovery & crawlability** — HTTPS; the address on file redirecting to another domain; robots.txt / sitemap present
  (sitemap missing = MEDIUM); sitemap entries on another domain; pages robots.txt disallows; noindex homepage (HIGH) /
  pages; canonical to another domain (HIGH) / to another page (a template pointing everything at the homepage);
  broken (4xx/5xx) and unreachable pages; internal redirects; sitemap pages nothing links to; pages more than
  `AUDIT_DEEP_CLICKS` (3) clicks from the homepage (link graph — full, uncapped crawls only).
- **Business clarity** — the lead's own name in the homepage title / H1 / markup (or only in the text, or not at all); the
  lead's town on the homepage (and which other pages say it); phone shown; contact page; about page; address / postcode;
  who runs it.
- **Services & content** — one-page site; service pages; thin service / area / home pages (MEDIUM) vs other thin pages
  (LOW); near-identical template pages (the engine's own similarity check); shared titles; missing / multiple H1;
  question-style headings or an FAQ (GOOD) or none (LOW).
- **Local & trust evidence** — reviews / testimonials shown (a JavaScript widget is said to be invisible to us),
  credentials quoted, projects / gallery, years of experience, links to its profiles elsewhere.
- **Technical basics** — missing title, missing description, long titles, no mobile viewport. Page speed: "not measured".
- **Structured data** — invalid JSON-LD (MEDIUM), business markup present (GOOD) / absent (LOW, "not a ranking fix" — schema
  tested NEGATIVE as a lever, CLAUDE.md §5), no breadcrumbs (LOW, 10+ pages), markup phone ≠ the phone shown (MEDIUM).

`auditFromStoredCrawl(row)` returns the stored audit as stored (reopen = no recompute), else the most an older row honestly
supports (`full_legacy` from its technical list, `quick` from its signals), else null for a failed crawl.

## 5. Storage

- Everything lives on the lead's ONE `lead_crawl_checks` row: `full_evidence.coverage` + `full_evidence.audit` (affected-URL
  lists up to 500 per finding). Per-page evidence stays in `crawl_urls` (already capped text: 5,000 chars, 8,000 JSON-LD,
  300 link paths). No raw HTML is kept beyond what the engine already stored (the homepage's lean HTML on the job).
- ⚠️ `full_evidence` is read only by the detail view, Paid Clients / Website Build and the site-research functions — never by
  the Outreach / Inbox lists (`result` stays the small part).
- `HookResult.citations` (`hookScore.ts`): each cell's own cited sources (http(s) only, deduped, ≤12). Display only — the
  score is byte-identical with or without them (tested).

## 6. The detailed UI

`ProspectAuditDialog` (data: `readLeadRow` for both roles, `lead_crawl_checks` under RLS — sales already had
`sales_select_crawl_checks` — and `crawl-check status` by lead) renders `ProspectAuditFrame` + `ProspectAuditView`
(presentational, `src/components/ProspectAuditView.tsx`).

- **The window**: full screen on a phone (`h-[100dvh]`), `sm:max-w-5xl` × 92vh on a desktop. **ONE scroll** — the body.
  Header: name, website, jump links (For this call · AI visibility · Website evidence).
- **For this call** (three cards): Are they showing up in AI? (n / 6, per engine) · What is wrong with the website?
  (counts by severity + the top three) · Strongest point to raise (`callPoint`: the AI fact — the best missed search and who
  was named instead, or "Strong AI visibility — named in all 6" — plus the strongest HIGH/MEDIUM website finding, never a
  structured-data one, each with its evidence). Under it: "these may make it harder … never that they are the reason".
- **AI visibility**: ChatGPT and Google AI side by side (stacked on a phone): each question with NAMED / NOT NAMED / Failed /
  Pending, named instead, "Sources cited" chips, "Read the answer". "Being cited is not the same as being named."
- **Website evidence**: coverage card (Fresh crawl / Saved result + date, the coverage line, sitemap count, Re-crawl when
  allowed), severity filter chips, findings grouped by category, "Show all N" (100 at a time), "Not checked".
- **No website**: "No website was found for this business, so there is no site for search engines or AI systems to crawl
  and verify." + the commercial line — only when Google's listing (place id) confirms it; a blank hand-added lead says "No
  website is recorded on this lead". A directory URL on file is said to be a listing, not their site. Never a crawl error,
  never a guessed domain.
- **Failed crawl**: "The website could not be crawled" + the classified reason + "Nothing below is a finding about the site".
- **Entry points**: Call tab "Full audit & website evidence" (`CallEvidence`), the AI check card's "View full audit"
  (`HookVisibilityCard` → everywhere it is mounted: Inbox, the lead popup's AI check, the Outreach row's audit popup), and
  the Crawl check popup's "Full audit". The Crawl check popup also says when a press reused a saved crawl.
- The Call tab itself is unchanged apart from the button — it does not become a technical audit.

## 7. Tests

`scripts/prospect-full-crawl-audit.test.ts` (the REAL engine against an in-memory database and fake sites) — normal small
site · multi-page sitemap · sitemap index · robots block (all / OAI-SearchBot / important pages / GPTBot never) · no sitemap ·
no website (confirmed / on file / directory) · redirect (internal + other domain) · 81 duplicates grouped (and rendered once
with "Show all 81") · malformed schema · noindex · canonical mismatch (incl. trailing slash = same) · OAI-SearchBot block
(robots + real fetch) · large-site cap (260 pages, cap 40: exactly 40 read, 221 recorded `coverage_cap`, "Not the whole
site", summary partial) · cache reuse (window, failed, quick, other site, rep force < 1 day, admin force, before any fetch) ·
failed crawl (8 error kinds, reason shown, no findings) · mobile UI (one scroll, no wide fixed widths, wrapping) · reopen from
stored evidence (stored audit returned as is; saved vs fresh; legacy full; quick) · AI scores unchanged (2 / 6 = 33%,
identical with or without citations) · mixed ChatGPT / Google AI rendered with citations · no lead write anywhere (the fake
database saw writes only to `crawl_jobs`, `crawl_urls`, `lead_crawl_checks`) · ownership (sales check before the new code;
another lead's job still refused; the view reads one lead through RLS) · wording (no llms.txt, no score, no promise; every
finding passes `salesStyleProblems`).

`scripts/outreach-list-columns.test.ts`: `website_build` pinned for `prospectCrawl.ts` (it is the request-source value, not
the column).

**Gate**: `npm run check` — typecheck 9 = baseline; edge syntax / names / import graph clean; build OK; full suite result in §10.

## 8. Migrations / functions

- **Migrations: none.** `page_cap` rides `crawl_jobs.home` (jsonb); `coverage` / `audit` ride `lead_crawl_checks.full_evidence`.
- **Edge functions to deploy** (`node scripts/check-import-graph.mjs --reached-by …`):
  - **`crawl-check`** and **`crawl-worker`** — the feature (cap, reuse, failure reason, audit). Deploy both together; the
    SPA after them (the SPA tolerates old rows — it shows `quick` / `full_legacy` until a new crawl lands).
  - **`paid-client-hub`** (the capped label in `leadCrawlSummary`, `crawlUrl` / `fullCrawl` closure) and
    **`directory-presence`** (closure only — no behaviour change) on the same release.
  - `hookScore.ts` is reached by 24 functions; the change is a display-only extra field, so none of them needs a redeploy for
    this feature. `whatsapp-status` is not in any of these closures.

## 9. Overlap with the compact-Outreach branch

- **Not touched**: `OutreachTable.tsx`, `OutreachMobileCard.tsx`, `HookAuditDialog.tsx`, the row markup, any row button.
  The Outreach audit popup gets the new window through `HookVisibilityCard` ("View full audit") — no row change.
- **Possible textual conflicts**: `HookVisibilityView.tsx` (new optional `onOpenFull` prop; the old overlay stays as the
  fallback when no opener is given), `HookVisibilityCard.tsx`, `ColdCallPlaybook.tsx` (`CallEvidence` header),
  `CrawlCheckButton.tsx` (dialog header), `src/lib/whatsNew.ts` (a new entry at the top — both branches will add one; keep
  both, newest first).

## 10. Visual QA and gate result

Throwaway Vite harness (deleted before commit) mounting the real `ProspectAuditFrame` + `ProspectAuditView` in the real
`Dialog` with fixtures built by the real `processPage` / `buildSiteAudit` / `scoreHookRun`: good website, poor website (27
findings), 65 findings on a capped 2,390-address site with long URLs, grouped repeats, no website, failed crawl (timeout),
mixed ChatGPT / Google AI with citations. Measured in the browser pane at **390×844** and **1366×900**: in every case
exactly ONE vertical scroller (the window body), no page or window horizontal overflow, no element past the window edge;
desktop shows the three call cards and the two engines side by side; phone stacks them. Screenshots were looked at by this
session (desktop poor / mixed, phone 65-finding capped). Fixed during QA: the crawler name in robots evidence was lower-cased;
a redundant tick icon wrapped on its own line on a phone. **Nobody else has seen it, and no authed page with real data was
rendered.**

Found in passing, not fixed: `crawlUrl.ts` `CONTENT_ID` tests `/^d{1,10}$/` (missing backslash), so a WordPress
`?page_id=12` / `?p=123` page is always skipped as a query trap.
