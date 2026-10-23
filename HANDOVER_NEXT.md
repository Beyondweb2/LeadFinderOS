# HANDOVER_NEXT.md — for the next CC session

*Untracked, never stage/commit this file. Written end of session 2026-08-22.*

---

## What just got done this session

- **WhatsApp template locale fix.** `questionnaire_followup` was `lang: "en_GB"` in both registries
  (`_shared/whatsapp-send.ts` WA_TEMPLATES + `process-whatsapp-queue` mirror TEMPLATES); Meta has it
  locked as plain English `en`, so en_GB was silently failing. Changed to `"en"` in both. Bodies and
  variable mappings untouched. `payment_recieved` left exactly as-is (`en`, `vars: ["name"]`, {{1}} =
  business name — matches Meta). Stale "English (UK)" comment corrected so it won't get reverted.
- **Deployed live** (not just merged): `send-whatsapp-message` **v47**, `process-whatsapp-queue`
  **v78**, `stripe-webhook` **v49** (already carried `payment_recieved`; proven — one delivered
  2026-08-17 to Ronnie).
- **"Next send" dashboard label fix.** `process-whatsapp-queue` status payload now returns
  `nextEligibleSendAt` (real next-eligible time, computed server-side in Europe/London: in-window+under-cap
  → pending pacing stamp or now; else next 07:00 London, cap-hit → tomorrow). `WhatsAppQueuePanel.tsx`
  renders it formatted `timeZone: 'Europe/London'` with a "UK" suffix, instead of the old stale
  browser-timezone stamp. Display only — no send gate changed.
- **Verification-only work** (no code change): confirmed both template triggers wired correctly —
  `payment_recieved` auto-fires from stripe-webhook on checkout.session.completed (idempotent via
  `alreadyPaid`, proven delivered); `questionnaire_followup` is a MANUAL lead-card button, never
  auto-fires, never sent yet.

**Git state (both clean + pushed + deployed):**
- LeadFinderOS: `main` == origin (`c0262f15`), 0 uncommitted. Auto-deploys on push — live.
- findable-site: `master` == origin (`a4be588`), 0 uncommitted. Manual deploy; last deploy is live
  (hero fade fix). Nothing pending to deploy.

---

## What's queued to build next (in order — one per session, recon first)

1. **Questionnaire section: per-row Send-nudge + delete controls.**
   - Add a per-row **"Send nudge"** button that fires the existing `questionnaire_followup` via
     `send-whatsapp-message` — REUSE the lead-card button's exact guards (`LeadQuestionnaireSection.tsx`:
     `showNudge = !!row && !rowPaid && !leadPaid`; server enforces `pitchEverSent` one-per-lead and
     `no_contact_name`). Don't reinvent the guards.
   - Add **delete controls**: per-row, delete-selected, delete-all with confirm — removing
     `onboarding_responses` rows. Lots of test junk to clear (there are only ~7 rows; most are test).
   - ⚠️ `onboarding_responses` is RLS-with-no-policy → SPA reads return `200 []`; it's read via the
     `submissions` edge fn. Deletes must go through an edge fn on the service role too, behind an
     operator check — a direct SPA delete will silently no-op.

2. **Suggested AI replies in the WhatsApp Inbox.** OpenAI, in Paul's voice, editable before send,
   must respect the 24h free-text window (the window gate lives in `send-whatsapp-message`'s free-text
   branch). ⚠️ OpenAI account credit — check it's topped up (was dry recently; question-gen falls back
   to templates but reply drafting needs real credit).

3. **Smart Next Actions rebuild.** AI reads messages and returns real actions ("reply to X", "send
   audit to Y", timed tasks) — no filler. Replaces the current heuristic card.

4. **STAGE 1 of the page-decision database (the big one — NOT started).** Full plan in
   `RECON_PAGEDB.md`. Two tables (`client_pages`, `client_page_questions`), RLS-with-policy in the same
   migration. Capture RG's existing pages as records (reuse `buildPagePlan` in `src/lib/pagePlan.ts`,
   don't regenerate), link each to its measuring baseline questions, print the graph. Additive only —
   no existing table/function changes. Spends nothing (capture + read, no generation).

---

## Standing rules the next session MUST follow

- **One problem per session.** Read-only recon BEFORE building; show findings, then build.
- **Re-derive every number from the live DB** — don't trust figures in docs (they go stale; the
  "1000 leads" figure was PostgREST's 1000-row truncation, real is ~1,700). Paginate reads.
- **Leads/owned rows go under the DATA-owning account** (`pauljsales455@outlook.com`,
  user_id `9d5a7629-…`), resolved FROM THE DATA — never ADMIN_EMAIL (`paul@move37.fun` owns nothing),
  never a hardcoded UUID.
- **RLS: never enable with no policy** — it returns `200 []` silently, indistinguishable from empty.
  Add the policy in the SAME migration and verify with `pg_policies`. If no owner column, route reads
  through an edge fn on the service role behind an operator check.
- **findable-site does NOT auto-deploy** — `npm run deploy` (astro build + wrangler) by hand.
  LeadFinderOS auto-deploys on push to `main`.
- **Always confirm committed AND pushed AND deployed live** — verify the live bundle/edge-fn version,
  not just the merge. Edge fns need `npx supabase functions deploy <name>` by hand; after changing a
  shared file, redeploy every consumer that uses the changed member.
- **WhatsApp template names match Meta EXACTLY**, including the `payment_recieved` misspelling.
- **SQL is run by Paul by hand** in the Supabase editor — hand him the SQL, wait for confirmation it
  ran before deploying code that reads/writes the new schema.
- **Pending:** `hook_followup` template is in Meta review (~half a day). Once approved it needs adding
  to BOTH registries + wiring into the follow-up queue. Don't add it before Meta approves (an
  unapproved template name fails `unknown_template`).
- **Known pre-existing issue to IGNORE:** the `re_engage` sync-test copy drift (CLAUDE.md §11) — the
  template sync test shows 1 expected failure on it. Not yours to fix unless asked.

---

## Key IDs / context

- **RG Locksmiths:** lead `800425fe-00cc-46bf-a281-df57de6f8d4e`, Huntingdon baseline audit
  `f64920ce-8bdc-44b3-b35a-a63a75ee4395` (`baseline_target_runs = 3`, 12 distinct questions, 3 runs,
  36 queue rows). Huntingdon pages went live 18 Aug. **First Gemini re-check ~25 Aug — DO NOT measure
  before then** (engines need time to re-read; measuring early wastes the before/after).
- **Two paying customers total:** RG (£19.99, paid 11 Aug) and Ronnie's Shoe Repairs (£49.99, paid
  17 Aug). Everything else is prospecting.
- **Session-minted operator token trick** (for scripts needing the operator's own JWT, e.g. cleaner /
  edge-fn calls the service key can't make): `admin/generate_link` magiclink → the clicked-link GET →
  read `access_token` from the Location `#` fragment. Verify it resolves to the right user before
  spending, revoke (`/auth/v1/logout`) and delete after, tell Paul. Never leave a token in scratch.
- **Docs in repo root, untracked:** `RECON_PAGEDB.md` (the page-DB build plan), `RECON_FOR_CLAUDE.md`
  (full product map for a fresh assistant). `CLAUDE.md` is the tracked source of truth — read it first.
