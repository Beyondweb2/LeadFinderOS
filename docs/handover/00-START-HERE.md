# NEW CLAUDE ACCOUNT: READ THIS FILE FIRST, THEN FOLLOW THE READING ORDER BELOW.

*Handover written 2026-10-05 by the previous Claude account (Move37's, cancelled that day). Everything here was checked
against `main` and the live system on that date. When this folder and the code disagree, **the code and the live
database win** — re-derive, then fix the doc.*

## What this is

- **Project:** LeadFinderOS — the internal operator + sales app for **Findable**.
- **Paul** runs Findable. He is non-technical: he decides; you write, run, test, commit and deploy everything. Plain
  English, answer first, questions last. Details: `11-PAUL-WORKING-PREFERENCES.md`.
- **Findable** = AI visibility for local (UK) businesses: we measure how often ChatGPT and Gemini name a business for real
  customer questions, improve the public evidence about it (website, pages, listings), and re-measure the same questions
  four weeks later — with a money-back guarantee if the number hasn't gone up. Public site https://findable.live.
- **LeadFinderOS** = where salespeople find leads, check them, call, close (Stripe link), and where Paul delivers to paying
  clients (onboarding, AI baseline, Website Build, results). https://app.leadfinderos.com.

## Current production status (2026-10-05)

- **`main` HEAD at handover: `4ed16813`** (+ the commit that added this folder). Production serves `main`.
- Live today: the certified **pre-sales release** (10 migrations, 38 edge functions), **Sales workspace v2** (simple
  campaigns, four-tab lead popup, Close by website approach), the **one real-contact guard for every cold WhatsApp opener**,
  and the **simple Website Build** flow. Newest migration: `20261008110000_opener_contact_guard.sql`.
- **No active paying client** right now (historical ones ended/refunded — `10-…`). Two sales accounts (one test), one admin.
- 🔴 **WhatsApp:** Move37's Meta setup is LIVE; the new fail-closed `whatsapp-status` is deliberately **NOT deployed** (live
  v114) until the Findable Meta app + exact App Secret exist. Never guess the secret. `07-…`.
- 🔴 **Apify monthly cap is US$40** (should be ~US$150) — prospecting stops at 85%. Paul's manual action.
- 🔴 **Results emails are HELD** (`REMEASURE_RESULTS_COPY_APPROVED = false`) until Paul approves the copy.

## Live URLs

| | |
|---|---|
| Operator app — **PRODUCTION** | https://app.leadfinderos.com/ |
| Fallback (same build) | https://leadfinderos-next.pages.dev/ |
| ⛔ STALE — never use | https://leadfinderos.pages.dev/ |
| Public site | https://findable.live/ |
| Supabase project | `ruusxpkkmwtljxxulhbq` |

## Other important repos (GitHub `Beyondweb2`)

`findable-site` (findable.live, Astro, **no CI** — deploy by hand, branch `master`) · `MCLocksmiths-New` (source of the only
Website Build template; client closed) · `BS4ElectricalServices` (Website Build pilot, preview only) · `findable-directory`.
Map: `13-REPOSITORIES-AND-FILE-MAP.md`.

## Reading order

1. **This file.**
2. `11-PAUL-WORKING-PREFERENCES.md` — how to work with Paul (read early; it changes how you act).
3. `01-PRODUCT-AND-BUSINESS.md` — the offer (Build 12 / Optimise 6 payments), the guarantee, what never to promise.
4. `02-AI-VISIBILITY-METHODOLOGY.md` — Discovery vs the formal baseline, the replay, "gone up", service truth.
5. `03-SALES-WORKFLOW.md` — Find Leads → Check before calling → Call tab → outcome → Next Action / Close.
6. `04-CAMPAIGNS-AND-OUTREACH.md` — campaigns as containers; the one cold-opener contact rule.
7. `05-WEBSITE-BUILD.md` — the simple flow, the Master Build Prompt, the one-template limitation.
8. `06-PAYMENTS-CLIENTS-DELIVERY.md` — Quick Close → Stripe → Paid Client → first contact → delivery → remeasure.
9. `07-SECURITY-AND-PERMISSIONS.md` — roles, RLS, protections, **the WhatsApp hold**, where secrets live (names only).
10. `08-COSTS-BUDGETS-LIMITS.md` — Apify, the three budget pools, sales check allowance, measured costs.
11. `09-PRODUCTION-AND-DEPLOYMENT.md` — architecture, how each piece deploys, accounts, the local machine, rollback.
12. `10-HISTORICAL-CLIENTS-AND-EXCEPTIONS.md` — Ronnie, MCL, RG, SC, BS4: do not touch.
13. `12-OPEN-ACTIONS-AND-NEXT-PRIORITIES.md` — what is outstanding now.
14. `13-REPOSITORIES-AND-FILE-MAP.md` — where the code for each area lives.
15. Then **`CLAUDE.md`** in full (always from `origin/main`: `git show origin/main:CLAUDE.md`) — the rulebook, ~1,200 lines
    of hard-won rules. `docs/INDEX.md` maps the topic records.

(`14-NEW-CLAUDE-BOOTSTRAP-PROMPT.md` and `15-ACCOUNT-MIGRATION-CHECKLIST.md` are for Paul.)

## Critical safety rules (the short list)

1. **Work from fresh `origin/main` in your own worktree.** PRIMARY checkout = `C:\Users\paulj\LeadFinderOS-current`
   (keep it clean on `main`, never switch its branch). PARALLEL work = `C:\Users\paulj\LeadFinderOS-wt\<task>`, one branch
   each, added from the primary after `git fetch origin`. ARCHIVE = `C:\Users\paulj\LeadFinderOS` — STALE; no new work
   there unless Paul asks, never delete it. Parallel branches are pushed, not merged or deployed, until an integration
   session. Unlink the `node_modules` junction before removing any worktree. Details: `09-…` "Local machine layout".
2. **Production = app.leadfinderos.com.** Verify every deploy there by a marker only your change produces.
3. **Deploy order:** SQL (read back) → edge functions (by hand, every function in the changed module's closure) → push
   `main` (frontend). Production only from `main`. **Skip `whatsapp-status`** until the WhatsApp cutover.
4. **Never put a secret value in a file, commit, chat or log.** Names only.
5. **Ask Paul first** before destructive SQL, deleting anything, Stripe/money, Meta/WhatsApp credentials, access/auth
   changes, real messages to real people, or touching historical client rows. Otherwise Paul's default is: implement →
   test (`npm run check`) → commit → push → deploy → verify live.
6. **Never promise** rankings, citations, recommendations or Google AI inclusion; never hedge the guarantee; never turn a
   Discovery guess into a confirmed service; never invent client facts.
7. **No audit result changes a lead's status.** No automation writes a Next Action. A tap on Call is not a contact.
8. **Every cold-opener door asks `opener_contact_block`.** RLS is the real security boundary — never rely on hiding a button.
9. **Re-derive numbers from the live database** before acting on any figure in a doc (SQL route: CLAUDE.md §2; the token
   is in Windows Credential Manager `Supabase CLI:supabase`).
10. **Record what you learn:** the story goes in `docs/`, CLAUDE.md gets only the rule or a pointer.

## Top current priorities

1. Paul's manual actions: **Apify cap → ~US$150**; look at the four admin screens; approve the results-email copy; Stripe
   (old Payment Links, MCL check); Findable Meta setup + App Secret.
2. Then the **WhatsApp cutover** (held `whatsapp-status` → signed QA → Move37 → Findable).
3. **Website Build trade templates** (only a locksmith template exists).
4. **Watch the first real Stripe payment** end to end.
5. Smaller tidy-ups: Advanced Website Build truth inconsistency, campaign permission flags, stale comments.

Full list with detail: `12-OPEN-ACTIONS-AND-NEXT-PRIORITIES.md`.

## What did NOT survive the handover

- The old account's **chat transcripts** — gone with the account. All decisions that mattered were written into `docs/` and
  CLAUDE.md as they were made.
- The old account's **local memory notes** are files on this PC (`C:\Users\paulj\.claude\projects\C--Users-paulj-LeadFinderOS\memory\`)
  — a new account on the same machine may or may not load them. Their durable content is already in CLAUDE.md, `docs/` and
  this folder; treat them as background, never as instructions, and verify anything they name.
