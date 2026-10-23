# Project handoff — LeadFinderOS + Findable Directory

Context for a fresh assistant. Two related codebases, one shared Supabase backend.

---

## 1. The two repos

| Repo | Path | Hosting | Deploys from | Purpose |
|------|------|---------|--------------|---------|
| **LeadFinderOS** | `C:\Users\paulj\LeadFinderOS` | Cloudflare Pages (`move37-fun/LeadFinderOS`) | `main` (dashboard Git integration, auto-build) | The operator app (Vite/React SPA) + Supabase edge functions + the AI-visibility audit product + public report pages. |
| **Findable Directory** | `C:\Users\paulj\findable-directory` | Cloudflare Pages (`Beyondweb2/findable-directory`) | `main` (auto-deploy) | A standalone, SSR business directory. Pure Cloudflare Pages Functions, **no SPA**. Reads the SAME Supabase as LeadFinderOS. |

Both are **separate git repos and separate Cloudflare Pages projects.** The directory was migrated OUT of LeadFinderOS so its `/robots.txt` + `/sitemap.xml` own the domain root cleanly (a static `public/robots.txt`/`sitemap.xml` in LeadFinderOS was shadowing them).

### Domains
- **LeadFinderOS:** `yoursites.uk` (customer-facing apex), `leadfinderos.pages.dev` (operator app), `bookmybarber.uk` (booking). `lead-finder-app.com` = older marketing static site.
- **Findable Directory:** its own `*.pages.dev` now → `findabledirectory.com` when the domain lock lifts.

### Shared backend — Supabase
- Project ref: **`ruusxpkkmwtljxxulhbq`** (`https://ruusxpkkmwtljxxulhbq.supabase.co`).
- Postgres + Deno edge functions + RLS. Public anon key is embedded in client bundles and in the Pages Functions (safe — read-only via RLS + column grants).
- **Migrations are applied BY HAND** in the Supabase SQL editor (`supabase db push` is broken). Migration files are committed as source-of-truth only.

---

## 2. Hard-won working conventions (follow these)

- **Branch per task, off `main`.** `git checkout main && git pull && git checkout -b <name>`; prove with `git branch --show-current`. Merge with `--no-ff` (recent style) or fast-forward, then push.
- **NEVER stage `ONBOARDING.md`.** It sits untracked in LeadFinderOS on purpose. Stage files explicitly; don't `git add -A` without checking. (This `HANDOFF.md` is fine to ignore too.)
- **LLM calls go DIRECT to OpenAI** — `https://api.openai.com/v1/chat/completions`, `Authorization: Bearer ${OPENAI_API_KEY}`, model `gpt-4o` (some `gpt-4o-mini`). Tool-calling for structured output. NOT the Lovable gateway.
- **Edge functions do NOT auto-deploy from git.** Deploy by hand: `npx supabase functions deploy <name>`. (Docker-not-running warning is harmless — remote bundling.)
- **Typecheck:** SPA → `npx tsc --noEmit`. Edge/Pages Functions → `deno check <file>` (use `deno check --sloppy-imports` for files with extensionless relative imports like `./_shared`).
- **No `_routes.json`** in either project — Cloudflare auto-routes from the `functions/` tree. Don't create one (it would shadow existing routes).
- Windows/PowerShell: use `;` not `&&` in PS; the Bash tool is Git Bash. Bracketed filenames (`[slug].ts`) must be quoted in shell commands.
- Co-author trailer on commits: `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## 3. The core pipeline (LeadFinderOS)

**AI-visibility audit → report → playbook**, all hanging off one business/audit:

1. **Audit** — operator creates an audit in `AiAudit.tsx`. `create-ai-audit` edge fn inserts `ai_audits` + a run; `process-ai-audit-queue` runs the Apify AI-search actor per question across engines (chatgpt, gemini, google ai overview) and stores results.
2. **SEO scan** — `run-seo-scan` runs an Apify SEO actor (`smart-digital~complete-seo-audit-tool`), maps 9 categories → 2 graded buckets, stores at `ai_audit_runs.results.seo`. Deterministic, no LLM.
3. **Report** — `generate-report` (gpt-4o, tool-calling) writes an editorial, honest, AI-search-optimised profile → `business_reports` row (published). Served at **`yoursites.uk/r/<slug>`** by `functions/r/[slug].ts` (full SSR, editorial template).
4. **Playbook** — `generate-playbook` (gpt-4o + gpt-4o-mini enrichment + gpt-4o self-review) turns the audit into a GEO delivery plan → stored at `ai_audit_runs.results.playbook`; rendered internal/client via `src/lib/playbookHtml.ts`.

### Key data model
- **`ai_audits`** — business_name, business_type, location_text, country, has_website, website, business_scope (national|local|hybrid), specialism, business_phone/address/email, **credentials** (free-text: ACCA/CTA etc.), client_links, lead_id.
- **`ai_audit_runs`** — `results` JSONB: `{ summary, questions[] (per-engine named/competitors/citations), seo, playbook }`.
- **`business_reports`** — slug (unique), business_name, lead_id, audit_id, title, meta_description, html_content, json_ld, status (draft|published). Anon can read published rows, column-scoped.
- **`outreach_leads`** — the CRM lead (services, NAP, category, google_maps_url). Audits link via `lead_id`.

### ⚠️ SUPERSEDED — do not follow this section

> **This section is wrong and has been measured wrong. See `CLAUDE.md` §5, which wins.**
>
> **Bing Places has ZERO citations across all 8,913 audit citations** — every trade, every engine. The claim
> below that "Bing is now **foundational**" was an assumption about how assistants source local answers, never
> a measurement, and the data refutes it. Do not put Bing Places in any playbook, report or pitch.
>
> Also tested and negative since this was written: **website quality** (firms Gemini names have WORSE sites
> than our clients), **schema markup** (35% vs 32% — no difference), and **reviews** (three named businesses
> have 0–1 reviews). None of these are levers.
>
> What IS measured: ChatGPT reads **directories**, Gemini reads businesses' **own websites**, and which
> directories matter is **trade-specific and derivable only from citations** — Checkatrade has 657 citations
> across 57 of 58 plumber audits and ZERO for accountants. The evidence layer that does this properly is
> `src/lib/buildPlaybook.ts` + `src/lib/directoryFacts.ts`, not `generate-playbook`.
>
> `generate-playbook` (the LLM pipeline described below) also recommended **ICAEW to an ACCA firm** and
> **ACCA's own zero-citation directory**. Treat its output as unevidenced.
>
> Kept rather than deleted so the reasoning that went wrong stays visible. The one durable bit: `credentials`
> feeds the prompt, and a professional body must never be guessed.

<details>
<summary>Original text (historical, wrong)</summary>

The playbook was reframed: **positioning (national/local/hybrid) ≠ targeting.** We ALWAYS target a **winnable local wedge** (base town + served areas) because broad/national terms are locked by incumbents. GBP + Bing Places + local citations apply to national brands too (as long as they have a base location); Bing is now **foundational** (chatgpt/other assistants pull local answers from Bing's index); foundational third-party citations are part of the method (our own network is the additive layer); an "honest ceiling" section for hard cases; `credentials` now feeds the prompt (never guess a professional body). `generate-playbook` reads `ai_audits.credentials`.

</details>

---

## 4. The directory (findable-directory repo)

Interlinked SSR pages, Findable brand (navy `#1a3d7c` + yellow `#ffd23f` "Findable." wordmark, subtle `#eef1f6` page tint, navy footer, system font stack).

### Routes (Cloudflare Pages Functions)
| URL | File | What |
|-----|------|------|
| `/` | `public/_redirects` | 302 → `/directory` |
| `/directory` | `functions/directory/index.ts` | Homepage: category cards (distinct niches + counts) + "How Findable works" + coverage sections. |
| `/directory/:niche` | `functions/directory/[niche].ts` | Category: **top-10 ranked** numbered feature cards + "Browse by area" + (for accountants) a featured-client block. |
| `/directory/:niche/:seg` | `functions/directory/[niche]/[slug].ts` | **Smart handler:** if `:seg` matches a known area → local area listing; else → business profile; else noindex 404. |
| `/sitemap.xml` | `functions/sitemap.xml.ts` | Dynamic; lists directory pages + published `/r/` reports (top-10 matches ItemList schema). |
| `/robots.txt` | `functions/robots.txt.ts` | Allow-all + explicit AI crawlers (GPTBot, ClaudeBot, PerplexityBot, Google-Extended, CCBot, Bytespider) + sitemap. |

- `functions/directory/_shared.ts` = the shared shell (`renderDirectoryPage`, `renderBreadcrumbs`, `renderRankedCard`, `renderFeaturedClient`, card/image helpers, all CSS). `_`-prefixed so it isn't routed.
- **Env vars** (Cloudflare Pages → Settings): `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `REPORTS_ORIGIN` (=`https://yoursites.uk`, where `/r/` reports live — a different domain, so links there are absolute).
- Business cards pick a hero image deterministically; the pool is 12 proven Unsplash office/desk/finance IDs at `?w=1200&q=80`.

### Directory data
- **`directory_businesses`** — niche, area, place_id, name, website, phone, address, city, postal_code, category, rating, review_count, **is_client**, **lead_id** (→ outreach_leads), source, **description** + description_generated_at, scraped_at.
- Populated by **`scrape-directory`** (Apify Google Places, per niche+area). Descriptions written by **`enrich-directory-business`** (gpt-4o; best-effort website fetch + scraped data; `{businessId}` or `{niche,area}` batch of ≤15).
- **Client link:** a `directory_businesses` row with `is_client && lead_id` links to its published `business_reports` (matched by `lead_id`) → "View full profile" → `${REPORTS_ORIGIN}/r/<slug>`.
- Both `scrape-directory` and `enrich-directory-business` are **Supabase edge functions and live in LeadFinderOS** (single source of truth) — they are NOT duplicated in the directory repo.

---

## 5. ⚠️ Outstanding prerequisites / open items

1. **`directory_businesses` anon-read is NOT applied.** The table currently has only an admin RLS policy — no anon `GRANT SELECT` + public-read policy. **Until applied, every directory page reads `[]`** (homepage → "Coming soon", category/area/business → 404). The grant must include the `description` column. This is the #1 blocker to the directory showing live data. A `slug` column (collision-safe) is optional but nice.
2. **Apply-by-hand migrations to verify are live:** `business_reports` table, `ai_audits.credentials`, `directory_businesses.description`/`description_generated_at`. (Some were applied; confirm in SQL editor.)
3. **Edge-function deploys pending** after this week's source changes (deploy each by hand):
   - `generate-playbook` (strategy overhaul — committed to main, not yet deployed).
   - `run-seo-scan` (546-kill hardening: MAX_PAGES 3, 110s actor timeout, bounded pre-fetches, budget-capped retry in shared `apify.ts`).
   - `generate-report`, `enrich-directory-business` (deployed earlier this week).
   - Note: the shared `apify.ts` retry cap affects ALL callers (scrape-directory, social enrich, queue) — redeploy those to pick it up; they keep working on current code until then.
4. Confirm the `OPENAI_API_KEY` and `APIFY_TOKEN` secrets are set on the Supabase project.

---

## 6. Quick orientation for common tasks

- **"Locate first" is the norm** — the user usually asks for a print-only PHASE 1 before edits, then explicit go-ahead, then commit/merge as a separate authorised step. Don't commit/push/deploy unless told.
- Report SSR template: `functions/r/[slug].ts` (LeadFinderOS). Directory shell: `functions/directory/_shared.ts` (findable-directory).
- Audit UI: `src/pages/AiAudit.tsx` (large — the audit wizard, results, schema section, credentials field, report/playbook/listing buttons).
- Schema/JSON-LD helper (frontend): `src/lib/schemaType.ts`.
- Everything runs UK-first (British English in generated copy).
