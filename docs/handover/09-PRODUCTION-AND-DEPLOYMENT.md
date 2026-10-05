# 09 — Production and deployment

*Verified 2026-10-05. The deploy rules themselves are in CLAUDE.md §3 and §4 — this file is the map.*

## Live URLs

| What | URL | Status |
|---|---|---|
| **Operator app (production)** | **https://app.leadfinderos.com/** | ✅ PRODUCTION — the source of truth. Custom domain on the Cloudflare Pages project `leadfinderos-next`. Written once in code: `OPERATOR_APP_URL`, `src/config/operatorApp.ts`. |
| Operator app fallback | https://leadfinderos-next.pages.dev/ | Same project, same build. Temporary legacy/fallback (still in Supabase Auth redirect URLs). Do not redirect it until Paul says. |
| ⛔ Stale | https://leadfinderos.pages.dev/ | **STALE / NOT PRODUCTION.** A legacy project, not connected to `main`, frozen on an old bundle (same title, same sign-in page). Never verify against it — it has misled sessions into "diagnosing" deploys that were fine. `yoursites.uk` is this same legacy project. |
| Public site | **https://findable.live/** | Production (repo `findable-site`, Astro, Cloudflare Pages project `findable-site`). `www.findable.live` 301s to it (Worker `findable-www-redirect`). |
| Client reports | `findable.live/r/<code>` (short), `findable.live/report/<auditId>`, legacy name+8-hex slug | all resolve forever (`render-audit-report`) |
| Welcome Pack | `findable.live/w/<code>` | live |
| Onboarding / refunds / terms | `findable.live/onboarding`, `/refunds/`, `/terms` | `/refunds` is the customer-facing guarantee authority |
| Supabase | project ref `ruusxpkkmwtljxxulhbq`; edge at `https://ruusxpkkmwtljxxulhbq.supabase.co/functions/v1/<name>` | production database + functions |

## Current production state (2026-10-05)

- **`main` HEAD at handover: `4ed16813`** ("Merge feature/website-build-simple: deployment record") — plus the handover docs
  commit that adds this folder. Production is serving `main`.
- Today's releases, all live and verified by marker: certified pre-sales release (`c5c4a1b5`: 10 migrations, 38 functions),
  Sales workspace v2 (`af8a930f` + migration `20261008100000`), opener contact guard (`9f8451c6` + migration
  `20261008110000`), simple Website Build (`592656f8`, no SQL).
- Newest migration applied: `20261008110000_opener_contact_guard.sql` (read back live: `opener_contact_block`,
  `campaigns.archived_at`, `campaign_new` all exist; `sales_check` limit = 30/day).
- Edge functions: 68 in source (all listed in `supabase/config.toml`), 90 deployed (22 deployed with no source — 2 belong to
  the findable-directory repo; the rest are deep-clean leftovers). `whatsapp-status` held at v114.
- Cron jobs (13, live only in the database `cron.job`, a rebuild from migrations loses them): `ai-audit-queue-run` (30 s),
  `bulk-jobs-sweep`, `crawl-worker-run`, `notify-onboarding-submit-run`, `whatsapp-auto-replies-run`, `whatsapp-queue-run`
  (1 min each), `conversation-triage-run` (2 min), `security-sweep-run` (5 min), `notify-follow-ups-due` (hourly),
  `weekly-visibility-run` (hourly :15), `daily-cron-run` (02:00), `performance-sync-run` (05:00), `business-summary-weekly`
  (Mon 06:30).
- Gate: `npm run check` was 312/312 suites green on 2026-10-05 (one `manual-onboarding` failure appears only when the
  local findable-site copy is stale — see below).
- ⚠️ Four admin screens (Paid Client, Website Build, Welcome Pack, API Usage & Security) were deployed and marker-verified
  but **nobody has looked at them signed in** — Paul should open each once.

## Architecture

```
Browser (operator app, React + Vite + Tailwind + shadcn)  ── Cloudflare Pages `leadfinderos-next` (auto-deploys main)
      │  supabase-js (anon key + user session)                     app.leadfinderos.com
      ▼
Supabase (Postgres + RLS + Auth + Storage + pg_cron + Vault)  ── project ruusxpkkmwtljxxulhbq (Micro instance)
      │
Edge functions (Deno, supabase/functions/*)  ── deployed BY HAND
      │  call out to: Apify (AI answers, SEO scans) · OpenAI · Google Places/Geocoding · Companies House
      │               Stripe · Meta WhatsApp Cloud API (Move37 app today) · Resend (email) · Cloudflare Browser
      ▼
findable.live (Astro, Cloudflare Pages `findable-site`) — onboarding, checkout start, reports, welcome packs
Client websites (Astro repos under GitHub Beyondweb2, Cloudflare Pages on the beyondwebcraft account)
```

## Deployment model

| Piece | How it ships | Verify by |
|---|---|---|
| **Operator app** | push `main` → Cloudflare Pages auto-deploys (~1–2 min, sometimes 15+) | `node scripts/verify-live.mjs` / fetch live HTML → entry chunk → the chunk your code is in → a marker only your change has. Never against `leadfinderos.pages.dev`. |
| **Edge functions** | **by hand**: `npx supabase functions deploy <name> --project-ref ruusxpkkmwtljxxulhbq` from a worktree of `main` (bundles via the API, no Docker). They keep running old code until redeployed. | Management API `GET /v1/projects/<ref>/functions/<slug>/body` and grep for a new identifier; or an OPTIONS build header (`send-whatsapp-message` → `x-swm-build`, bump `BUILD_ID`). |
| **SQL / migrations** | applied **one at a time** via the Management API (`POST /v1/projects/<ref>/database/query`), never `supabase db push` (history is desynced) | read the schema back (columns, functions, policies, grants) — never trust the 201 |
| **findable-site** | 🔴 **no CI.** From a clean worktree of `origin/master`: build, then `wrangler pages deploy dist --project-name=findable-site --branch=master` (without `--branch=master` it lands as a preview) | live chunk marker on findable.live |
| **Client sites** | push the repo's Git-connected branch (e.g. BS4 `preview`) | the preview URL |

**Rules (CLAUDE.md §3):**

- Production deploys originate from **`main` only** — never a feature branch, never bundling another unfinished branch.
- **SQL first** (read back) → **edge functions** → **then push `main`** (the frontend) when both changed. Backend before
  frontend.
- After changing a shared module (`supabase/functions/_shared/*` or an edge-reachable `src/lib/*`), redeploy EVERY function
  that reaches it: `node scripts/check-import-graph.mjs --reached-by <file>` prints the list. Name them in the report.
  ⛔ Skip `whatsapp-status` until the WhatsApp cutover.
- Immediately before deploying a function, `git fetch` — if `origin/main` has a newer commit in its closure, deploy from a
  tree containing both (another session may have just deployed it).
- A new edge function gets its `supabase/config.toml` `verify_jwt` entry in the same commit.
- Price changes: when a price RISES deploy display before charge; when it FALLS, charge before display.
- Every user-visible deploy adds a What's New entry (`src/lib/whatsNew.ts`).
- Never chain an edge deploy after a push in one command — a refused push once still deployed off-main.
- After every production deploy, **verify the live app at https://app.leadfinderos.com** (and the fallback).

**Paul's default (2026-10-05):** implementation work normally ends with **commit → push → deploy live → verify
production**, unless it is a planning/non-live session or deploying is unsafe (`11-PAUL-WORKING-PREFERENCES.md`).

## Accounts and where access lives (names, never values)

| Platform | Account / project | Notes |
|---|---|---|
| GitHub | org/user **`Beyondweb2`** — repos `LeadFinderOS`, `findable-site`, `MCLocksmiths-New`, `MCLocksmiths`, `BS4ElectricalServices`, (`findable-directory`) | git commits on this PC are authored as Paul `beyondwebcraft@outlook.com` |
| Cloudflare | **"Paul@move37.fun's Account"** (`findable-site`, `findable-directory`) · **beyondwebcraft** account (client sites: `mclocksmiths-new`, `bs4-electrical-services`…) · `leadfinderos-next` / legacy `leadfinderos`: **not visible to the wrangler login on this PC** — confirm in the dashboard which account owns them | wrangler on this PC switches between logins; check `wrangler whoami` before any deploy. Never overwrite the other account's login — use a scratch `USERPROFILE`/`HOME` for the non-default one. |
| Supabase | project `ruusxpkkmwtljxxulhbq`; CLI token in Windows Credential Manager `Supabase CLI:supabase` | operator login `paul@move37.fun` (owns no data); the DATA account is `pauljsales455@outlook.com` |
| Stripe | Findable account (Claude has no Stripe access) | price ids in `FINDABLE_*_PRICE_ID` secrets |
| Meta / WhatsApp | **Move37** app live; Findable app pending | see `07-SECURITY-AND-PERMISSIONS.md` |
| Email | `paul@findable.live` is canonical; findable.live MX = Cloudflare Email Routing **forwarding to paul@move37.fun** | client-facing copy never names move37 |
| Apify / OpenAI / Google | Paul's own accounts since 17 / 21 / 18 Sep 2026 | |

## Local machine layout (Windows, `C:\Users\paulj`)

**The workspace convention (since 2026-10-05):**

| | Path | Use |
|---|---|---|
| **PRIMARY** | `C:\Users\paulj\LeadFinderOS-current` | the active checkout (its own clone of `Beyondweb2/LeadFinderOS`). Keep it clean on `main`; open new Code sessions here. |
| **PARALLEL WORKTREES** | `C:\Users\paulj\LeadFinderOS-wt\<task>` | one worktree + one named branch per task, always from the latest `origin/main`. |
| **ARCHIVE** | `C:\Users\paulj\LeadFinderOS` | the old primary — stale. No new work there unless Paul explicitly asks to inspect it. Never delete it. |

- Start every task: `git -C C:\Users\paulj\LeadFinderOS-current fetch origin`, then
  `git -C C:\Users\paulj\LeadFinderOS-current worktree add -b <branch> C:\Users\paulj\LeadFinderOS-wt\<task> origin/main`,
  then junction `node_modules` in (below). Never switch the primary's branch; never touch another session's branch or
  worktree.
- **Parallel sessions push their branch and stop.** No merge to `main` and no deploy from a parallel branch — an
  integration session (or Paul) merges and deploys them one at a time, re-checking each against the newest `main`.
- `LeadFinderOS` (ARCHIVE) — hundreds of commits behind, on an old `main` with uncommitted edits that are already on main or
  superseded. Do not work in it, do not switch its branch, do not reset or delete it: its untracked `SQL_FOR_PAUL_*.sql`
  files are the only copies, and ~95 older worktrees hang off its `.git` and junction to its `node_modules`. It is NOT
  needed for new work: since 2026-10-05 `LeadFinderOS-current` has its own `node_modules` (`npm ci`). Read the real rules with
  `git show origin/main:CLAUDE.md`.
- `LeadFinderOS-wt\<task>` — junction `node_modules` in
  (`New-Item -ItemType Junction -Path <wt>\node_modules -Target C:\Users\paulj\LeadFinderOS-current\node_modules`);
  `LeadFinderOS-wt\findable-site-current` is already a junction to the clean findable-site clone (below). Older folders in
  `LeadFinderOS-wt\` belong to the ARCHIVE's `.git` — leave them; new ones belong to `LeadFinderOS-current`'s.
  ⛔ **Before `git worktree remove`, unlink the `node_modules` junction first**
  (`[System.IO.Directory]::Delete($nm, $false)` in PowerShell) — git follows junctions and once wiped the shared
  `node_modules`.
- **`findable-site-current`** — a clean clone of findable-site `origin/master` (2026-10-05). The cross-repo tests read it by
  default (`scripts/findable-site-dir.mjs`: `FINDABLE_SITE_DIR` → `..\findable-site-current` → `..\findable-site`). Refresh
  it after a findable-site merge: `git -C C:\Users\paulj\findable-site-current pull --ff-only`. Never edit or deploy from it.
  `findable-site` (old primary, stale + dirty) and `findable-site-wt\main-mirror` (was 3 commits behind) are left as they
  are for older worktrees; deploy findable-site from its own clean worktree as before.
- Client repos: `MCLocksmiths-New`, `MCLocksmiths`, `BS4ElectricalServices` (+ `-wt` folders), `ablm-site`.
- Unrelated personal projects also live here (e.g. `life-os`) — not part of Findable.
- Windows host: PowerShell primary, Git Bash available; repo LF / working tree CRLF. Never edit source with PowerShell
  `Get-Content`/`Set-Content` (mojibake) — use the Edit tool or a UTF-8 Node script. Deno is not installed (the deploy is
  the only type gate for edge code).

## Rollback principles

- **Operator app:** `git revert -m 1 <merge>` on `main` and push (auto-deploys), or roll back in the Cloudflare dashboard
  (project `leadfinderos-next`) to the previous deployment.
- **Edge functions:** redeploy the affected functions from a worktree of the previous good commit (record version numbers
  before deploying — `GET /v1/projects/<ref>/functions`).
- **findable-site:** roll back to the previous Cloudflare deployment, or redeploy the previous commit with `--branch=master`.
- **Migrations:** written additive / idempotent so they rarely need reversing; a destructive reversal is shown to Paul first.
  Record the before-state (live definitions) before replacing a function.
- The 2026-10-05 release's exact rollback reference: `docs/pre-sales-certification/production-deployment.md` §12.
