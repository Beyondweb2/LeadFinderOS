# Website Build V1 — the command centre (2026-09-23)

Paid Clients → a client → **5. Website Build → Open Website Build** opens
`/paid-clients/:leadId/website-build` (`src/pages/WebsiteBuild.tsx`). It replaces the single
"Copy Claude rebuild prompt" button that `docs/welcome-pack-and-website-build.md` records.

It is a **workflow and prompt/command generator, not a site builder.** It turns Findable's stored
records plus Paul's decisions into a Build Pack of exact PowerShell commands and Claude Code prompts.

## The seven stages (derived, never stored)

Intake → Capture → Architecture → Build pack → Preview → QA → Live. `websiteBuildStages()` in
`src/lib/websiteBuildState.ts` computes each one's done/detail from the saved state. There is no
status column (the 2026-09-22 `status` token is read and dropped).

## Data — no migration

Everything lives in the existing `outreach_leads.website_build` jsonb (operator-only, never in a
client document). `src/lib/websiteBuildState.ts` is the ONE shape rule: the browser reads with
`parseWebsiteBuild`, `paid-client-hub` `save_website_build` writes through `normaliseWebsiteBuild`
(allowlisted keys, enumerated tokens, capped lengths and counts: 120 facts, 200 pages, 600 redirects).
Keys: `build_mode`, `template_id`, `rebuild_style`, `copy_ownership`, `repo_name`, `github_owner`,
`repo_url`, `local_repo_path`, `cloudflare_project`, `dev_url`, `preview_url`, `production_url`,
`canonical_domain`, `latest_commit`, `deploy_status`, `notes`, `capture{status,url_count,asset_count,notes}`,
`facts[]`, `pages[]`, `redirects[]`, `qa{}`. The page autosaves (debounced 900 ms, flushed when the
page is left or hidden).

The page makes ONE read (`rebuild_context` — stored rows only: lead, onboarding, baseline report,
Discovery, stored crawl, client_pages) and ONE write (`save_website_build`). No audit, crawl, model,
WhatsApp or email is reachable from it (`scripts/website-build-v1.test.ts` SAFETY pins this).

## Build mode

- **Template** — `src/lib/websiteTemplates.ts`. One profile: **MCL Local Trades Template**, read from
  `C:/Users/paulj/MCLocksmiths` (private repo `Beyondweb2/MCLocksmiths`) on 2026-09-23: Astro 7 +
  Tailwind 4 + sitemap, `npm run dev` → `http://localhost:4321`, build → `dist`, Pages Function
  `functions/api/public/lead.ts` (Resend secrets). It lists reusable components, page families, the
  files that carry MCL content, the asset folders, 19 MCL claims each tied to the fact that must be
  verified, and a leftover-needle list (Morgan, Canterbury, 07395…). **Hand-kept: if the MCL repo
  changes shape, change the profile.**
- **Rebuild** — replica / modernised / new design, plus copy ownership. Only "client wrote" or
  "client confirmed permission" lets old wording be kept (`mayPreserveCopy`, positive match);
  previous developer / unknown → facts kept, marketing rewritten.

## Client Build Facts (`src/lib/buildFacts.ts`)

Candidates come from `resolveClientFacts` + the stored crawl's `siteInfo`. **Only a client-stated
(onboarding), uncontested fact starts verified**; lead row, baseline, Discovery and crawl start
"needs approval"; a conflict makes the row "needs approval" with both values. Paul approves / edits /
rejects / marks N/A / adds; decisions are stored and win. A template (or `CORE_BUILD_FACTS` for a
rebuild) adds a MISSING row for every fact nobody has. Prompts carry
"VERIFIED FACTS MAY BE USED / UNVERIFIED FACTS MUST NOT BE PUBLISHED" and only `isPublishable` rows
(verified with a value) reach section D.

## Architecture (`src/lib/buildArchitecture.ts`)

Rows: action keep/create/consolidate/redirect/remove (+ `undecided`, where every SEEDED row starts),
family, new path, old URL, target, notes. Seeds: template pages for verified services only (no
location detail pages, pricing only with verified prices, gallery only with verified photos); URLs AI
engines cited in the baseline; the stored crawl's checked pages; the capture's pasted page list.
Redirect map: `/old -> /new/ | reason` lines. Errors block (undecided, no path, chain, loop, self,
duplicate source, redirecting a live page); warnings show (homepage flood, no trailing slash, not in
the plan, removed with no redirect, >12 location pages).

## The Build Pack (`src/lib/buildPack.ts`)

1 Setup · 2 Capture · 3 Master (sections A–Q) · 4 Local dev · 5 Cloudflare preview · 6 Visual QA ·
7 SEO/GEO QA · 8 Production · 9 Final QA. Missing values print `[.. REQUIRED]` markers and are listed
as blockers; **production is not generated at all** until the Cloudflare project, preview URL and
domain are recorded. `FORBIDDEN_COMMAND_PATTERNS` + the test keep every generated command free of
force-push/reset/rebase/amend/clean/delete.

Paul's machine, as found 2026-09-23: **no `gh` CLI** (GitHub repo creation is a browser step, then
`git remote add` + `git push -u`); **wrangler is logged in to Paul's Cloudflare account** (preview =
`wrangler pages project create` once, then `wrangler pages deploy dist --branch preview` →
`https://preview.<project>.pages.dev`); `cloudflared` installed (optional dev tunnel). The template is
cached in `<parent>\_templates\mcl-local-trades` and copied with `robocopy /XD .git …` so a client
repo never carries MCL's history.

## Production verification (2026-09-23)

Exercised on **SC Plumbing & Gas Ltd** (refunded — no real build) in Paul's session on
leadfinderos-next: template mode, MCL mapping, fact approval, seeding, keep/redirect decisions,
redirect generation, rebuild/replica/unknown capture prompt, preview URL, production unlock, a QA
tick, close/reopen — all persisted (read back from the DB). The test state was then reset to `{}`.

Found and fixed on that run: the onboarding GBP answer ("yes_all") was offered as a publishable fact;
the stored crawl missed three of the four old URLs AI engines cited (now a seed button); Keep left
the path blank; removal with no redirect was silent; an edit made <1 s before leaving by an in-app
link could be lost; radios/checkboxes/row inputs had no accessible names.

## Deferred

- Only one template. The registry is ready for more; each needs its own hand-read profile.
- Paul pastes capture counts/pages/redirects/facts back by hand; no automatic import of the
  `capture/` folder.
- No automatic GitHub repo creation (no `gh`), no automatic Cloudflare deploy from LeadFinderOS.
- The MCL template is copied from `main` of a private repo; a new machine needs GitHub access to it.
