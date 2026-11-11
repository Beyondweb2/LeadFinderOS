# CLAUDE.md — short index. Rules live in `docs/rules/`.

Loaded into every session, so it holds only what every session needs. **Before touching an area, read its rules file (table at the end) — those rules are binding, not background.** Records/history go in `docs/` (`docs/INDEX.md`; `docs/records-lookup.md` = "touching X → read Y"). Exact previous text: `docs/archive/claude-md-2026-11-10.md`; older wording `docs/archive/claude-md-full-2026-10-22.md` (indexed by `docs/rules-ledger.md`). `scripts/claude-md-size.test.ts` keeps this file under budget and checks no rule was lost in the move. New Claude account → `docs/handover/00-START-HERE.md`; live open actions → `docs/handover/12-OPEN-ACTIONS-AND-NEXT-PRIORITIES.md`.

## What it is, where things are

- **Findable** — AI visibility for local UK businesses. Operator app (V1, production) **`https://app.leadfinderos.com`** (`OPERATOR_APP_URL` in `src/config/operatorApp.ts`, the only copy). `leadfinderos-next.pages.dev` = same build, never used in a link. ⛔ Never verify against `leadfinderos.pages.dev` (stale). Public site `https://findable.live` = separate repo `findable-site` (Astro, `npm run deploy`, no CI). Supabase ref `ruusxpkkmwtljxxulhbq`.
- **Layout:** `src/` React SPA (Vite; `src/lib` = rule/leaf modules, `src/pages`, `src/components`); `supabase/functions/` edge functions (`_shared/` = shared code); `supabase/migrations/`; `scripts/*.test.ts` = test suites (other `scripts/` files are DB tools — never run one casually); `docs/` = records. Code map: `docs/code-map.md`.
- **Checkouts:** primary `C:/Users/paulj/LeadFinderOS-current` stays clean on `main` — never switch its branch. Parallel work: `git fetch origin`, then `git -C C:/Users/paulj/LeadFinderOS-current worktree add -b <branch> C:/Users/paulj/LeadFinderOS-wt/<task> origin/main`, then `npm ci` in it (a junction to the primary's `node_modules` only if that one is current with `package-lock.json`; never force-remove a worktree with a junction). Never touch another session's branch or worktree. `C:/Users/paulj/LeadFinderOS` is a stale archive: no work, never delete.
- Windows host: PowerShell + Git Bash; repo LF, tree CRLF. No Deno locally — the deploy is the only real check for an edge function.

## Working with Paul

- Non-technical; he never runs terminal commands. Plain English, lead with the answer, short reports ending **"What matters" / "What to ignore" / "Decision needed from you (or none)"**. Report faithfully: failures with output, skipped = say so.
- New piece of work: plan first, then build all of it. Deploy live by default (tests → commit → push `main` → deploy → verify live) unless told not to or unsafe. A parallel branch is pushed, NOT merged or deployed, until an integration session or Paul does it.
- **Hard stop and ask** before anything irreversible or outward-facing not already authorised: destructive SQL, deletions, money/Stripe, Meta/WhatsApp credentials, access changes, real messages to real people, historical client rows.
- You may run read-only SELECTs and additive/idempotent DDL yourself (how: `docs/rules/setup-and-paul.md`); anything destructive — show him first.
- Live tests use `ZZ QA` fixture leads only (`docs/qa-fixtures.md`); payment success = `scripts/qa-simulate-payment.ts`, never a real card. Nobody has *seen* a page unless Paul screenshots it — say so.

## ⛔ Safety rules — every session

- **Never send real messages to prospects or clients** (WhatsApp, SMS, email). Every sender asks `qaSendHold` (`_shared/qa-guard.ts`); QA client email goes only to paul@move37.fun. `test_send` costs a real message; use `dry_run`.
- **Never print, echo or commit secrets** (tokens, keys, `.env`, Credential Manager values). Name secrets, never show them.
- 🔴 **`whatsapp-status` is HELD — never deploy it**, including in a closure redeploy, until the Findable switch (`docs/whatsapp-status-cutover-plan.md`, top box). Live is v129; its secret is saved only in the same step as moving the webhook.
- **V1 WhatsApp runs on Move37's Meta app and number.** Never change the number, token, app secret, Meta templates or webhook from code — those are Paul's.
- Cold WhatsApp: UK mobiles by default; every cold send asks the one guard (`whatsappColdGuard.ts`); never switch a country on from code or loosen it. An opt-out blocks every marketing send (`recordOptOut()`). Every AI-written reply needs human approval (Auto is retired).
- **Tenancy/permissions:** `user_id` stays on every table; anon+authenticated hold full DML grants, so **RLS is the only barrier** — never weaken a policy. Role comes from `user_roles` only (`my_role()`), never from the request body or metadata. A new edge function calls `requireAdmin` or resolves role + `leadAccess`/`canWorkLead`; a new page is admin-only by default. A salesperson never reads `outreach_leads` directly. Protected calls go through `invokeEdge`. Details: `docs/rules/sales-and-access.md`.
- **Production:** deploys come from `main` only. One session at a time applies migrations or touches V2 staging data; migrations one at a time, never `supabase db push`. ⛔ Never add a `generated … stored` column or other table rewrite to a large live table. The app's Sign out is GLOBAL — end a test session with `/auth/v1/logout?scope=local`. Never kill processes by name.
- Money: the browser never decides money; only `establishLeadPayment` writes paid state; Mark as paid only records. Stripe changes are Paul's. Never invent prices, terms, penalties or exit rights — constants own the words (`src/lib/findableOffer.ts`, `paymentPlans.ts`; `docs/rules/business.md`).
- Reports grade each search by ROOM AI leaves (Lots / Some / Little room, "AI doesn't name firms yet") ONLY with its evidence beside it ("6 answers named 11 different firms"), the written rule (`src/lib/reportOpportunity.ts`) and the "not guarantees" line. Goal = being NAMED, never a ranking, recommendation or citation promise; no winnability SCORE (`docs/architecture-rules.md`).
- We never publish content written in a business's name. Operator copy contains competitors — never send it to a client.

## Checks

- While working: `npm run check:quick` (typecheck vs the 9-error baseline list `scripts/typecheck-baseline.txt` — don't fix those — plus edge static checks) and `npm run test:changed`.
- Before commit/push/deploy: quick check + changed tests + `npm run build`.
- **Full gate `npm run check`** (all steps in parallel, ~2 min) only for migrations/database, messaging sending, auth, tenancy/RLS, payments/pricing, secrets — once, after the last edit. `npm test <word>` runs matching suites; `npm test -- --slowest` lists slow ones; `TEST_CONCURRENCY=<n>` when other sessions are busy. Details: `docs/gate-speed.md`.
- `npm run typecheck` does not cover `supabase/functions` — the edge checks do (`check-import-graph --reached-by <file>` prints the redeploy list). `src/lib` files reachable from an edge function use relative imports with explicit `.ts`.
- A red suite is a real finding unless the runner's ENVIRONMENT banner says the findable-site copy is behind.

## Git and deploy

- `git fetch origin`; prove `origin/main == HEAD` before branching. Commit with `-F <file>`, only this task's files, never `git add -A`; never stage `HANDOFF.md`, `ONBOARDING.md`, `HANDOVER_NEXT.md`, `RECON_*.md`, `INVENTORY_DEEP_CLEAN.md`, `SQL_FOR_PAUL_*.sql`, `scripts/_*`. Trailer `Co-Authored-By: Claude <model this session runs> <noreply@anthropic.com>`. Merge `--no-ff`; prove origin unmoved right before pushing.
- ⛔ Edit files with the Edit tool or a UTF-8 Node script — never a PowerShell `Get-Content`/`Set-Content` round-trip. Backslash text goes through Write/Edit, not a Bash heredoc. Never a backtick inside a template literal.
- `main` auto-deploys the SPA (Cloudflare Pages `leadfinderos-next`). Edge functions deploy by hand (`npx supabase functions deploy <name>`): backend before frontend, SQL first and confirmed by read-back; redeploy every function that reaches changed `_shared/`/`src/lib` code and name them; `git fetch` first so you don't replace another session's deploy. A new edge function gets its `config.toml` `verify_jwt` entry in the same commit.
- Every deploy that changes what someone sees adds a What's New entry (`src/lib/whatsNew.ts`). After every deploy verify the LIVE bundle by a marker only your change produces (method: `docs/rules/engineering.md`, "The deploy check").

## Read before touching

| Area | Rules file |
|---|---|
| Any code, the gate, merging, deploys, edge functions, SQL, PostgREST/RLS traps | `docs/rules/engineering.md` |
| Prices, plans, agreements, checkout, guarantee, commission, measurement, money, client-facing offer copy | `docs/rules/business.md` |
| Auth, roles, RLS, lead reads/writes, Sales, Next Action, abuse/cost guards, campaigns, crawls/website checks | `docs/rules/sales-and-access.md` |
| WhatsApp, SMS, templates, queue, markets, Inbox, AI replies | `docs/rules/messaging.md` |
| Reports, Website Build, site score, client facts, UI state, Outreach loading, cron, open problems | `docs/rules/reports-build-state.md` |
| Checkouts, running SQL, QA leads, what Paul has authorised | `docs/rules/setup-and-paul.md` |

**When you finish a piece of work:** write the record into the matching `docs/` file; a new rule goes in the right `docs/rules/` file, and here only if every session needs it.
