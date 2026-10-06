# Sales team today — release record (2026-10-06)

**Status: DEPLOYED.** Production `main` = `7dfd4e9a` (merge of `integration/sales-team-today`, `01d3f3ff` on top of
`915477ae` / `4e533cbf`). Live on `https://app.leadfinderos.com` and `https://leadfinderos-next.pages.dev` (same
entry chunk `index-CrFYvw03.js` on both, checked by following every chunk from the entry).

## Source branches

| Branch | Commit | How |
|---|---|---|
| `improve/operator-design-consistency-admin-nav` | `d5230f42` | merged `--no-ff` (no conflicts) |
| `improve/lead-workspace-sales-flow` | `2950bb2a` | merged `--no-ff`; 2 conflicts, below |
| `improve/sales-script-commercial-alignment` | `a6078748` (`a39e60a4` + one) | **NOT merged.** Only the call-script idea was ported by hand into a new `src/lib/callScript.ts`, rewritten on the LIVE v3 offer. None of: v4 agreement, v4 migration `20261012090000`, checkout/payment gating, Stripe, Optimise six-payment stop, findable-site, fingerprints. |

**Conflicts:** `LeadDetailDialog.tsx` — the status pill: the workspace branch's working `PipelineStatusSelect` won;
the design branch's tone styling kept on Call / WhatsApp and applied to the new Log button. `whatsNew.ts` — both
entries kept.

## Ready-to-Sell gate → account restrictions only

Paul: the practical onboarding checklist must not block selling today.

- Migration `20261012120000_selling_gate_account_only.sql` (applied 2026-10-06, read back): `salesperson_onboarding_missing`
  returns only `not_sales` (no sales role — a disabled account loses it), `login` (no active team member), `suspended`,
  `ended`. 18+, right to work, bank, VAT, individual/company, start date, team guide = Paul's Team-page record only.
- Every server gate reads that one function and is otherwise unchanged: `guard_action` (`not_onboarded`),
  `trg_lead_activity_ready_to_sell`, `trg_outreach_leads_assign_ready`, quick-close (`_shared/sales-ready.ts`),
  admin-users reassign, the attribution `creator_ready` snapshot (so a sale by an unrestricted rep is no longer held
  as `creator_not_authorised`).
- Client: `CHECKLIST_KEYS` (admin record) / `SELLING_GATE_KEYS`; `onboardingSummary.readyToSell` = no account
  restriction; the banner shows only for a restricted account ("Your sales access is not active … Speak to Paul"),
  red, and is **not in the lead popup**; every "Complete your onboarding before …" message is gone.
- Guard: `scripts/selling-gate-account-only.test.ts` fails if a checklist column or key comes back into the gate.
- **Live proof (rolled-back DO blocks, nothing persisted):** before, Test and test1 were missing 7 and 6 checklist
  items; after, `[]`. `guard_action` for Test: `lead_search`, `claim`, `sales_check`, `whatsapp_queue`, `lead_add` all
  `ok: true`. Same rep suspended → `ok: false, reason: suspended`; disabled login → `login`; past end date → `ended`.
- ⚠️ Live SQL suites still asserting the OLD gate (annotated at the top of each, not rewritten):
  `supabase/tests/ready-to-sell-paperwork.sql`, `salesperson-onboarding-rls.sql`, `e2e-sales-certification.sql`,
  `v3-signup-attribution.sql`. Their checklist-blocks assertions are wrong by design now.

## The Call screen (SCAN → SAY → ASK → LOG → CLOSE)

Order in the lead popup's Call tab: header (name, phone, status pill, next action, Log) → **AI RESULT** → **call script**
→ sticky **Log this call | Quick Close**.

- **AI RESULT** = `LeadHookPanel variant="call"` → `HookVisibilityView variant="call"`: ChatGPT x/3 and Google AI x/3
  chips coloured, the overall % named coloured, best missed search, **named instead** (that answer's own names), View
  full audit / Open report / Copy link, run / re-run, earlier checks folded. The ONLY AI result on the screen — the old
  folded "AI check — run, re-run…" copy and the playbook's own evidence card (`CallEvidence`, `AiOpportunity`,
  `TalkAbout`, `AuditEvidence`, `AiCheckCount`) are gone. The Outreach audit popup keeps the full panel.
- **Script** (`src/lib/callScript.ts`, `ColdCallPlaybook.tsx`): Say → Ask first → Then ask → What we do (one sentence
  + two stat cards) → Offer → Objections. Tabs: Call script | Voice note only.

### Opener (exact structure)

1. `Hi mate, I was looking for <a trade> in <town>, so I asked <Google AI|ChatGPT> and it mentioned A, B and C, but not you.`
   (one name said naturally; none → `…and you didn't come up in the answer it gave.`; both engines → "they";
   named → `…and it did mention you, which is good.`; no audit → `Hi mate, I look at how local businesses come up…`)
2. `I had a look into why they were being named and you weren't, and I found a few potential reasons.`
3. Up to three real website reasons, plain English (each the same claim as its stored `siteFindings` finding).
4. `More people are using AI to find local businesses now, and this is what we specialise in. I'm happy to explain what
   I'd change to give you a better chance of showing up in those answers.`

Never: "from Findable", "I messaged you", a day/date, "quicker to explain on the phone". A previous contact is a
note for the rep beside the script.

**Website evidence:** findings only from the stored crawl; a clean crawl → Paul's line "I couldn't see one huge
technical problem with the site. The bigger issue is…"; no / stale / unreadable crawl → nothing about the site; no
website → said once, never "AI can't name you without one"; a directory profile is never called their website.

### Questions

- First, always: `Do you manage the website yourself, or does an agency do it?` with buttons **I manage it** /
  **Agency / someone else**. Agency reveals `Are you still tied into a contract with them?` and `If you don't mind me
  asking, roughly what are you paying them?` with a £/month box; the cheaper angle appears only above £100/month AND
  above our own monthly. Never knock the agency.
- Then (pick what fits): which jobs, which towns/areas, who decides on the website and marketing.
  "Where does most of your work come from" removed.

### Offer, guarantee, objections

- Optimise | Build switch, **one plan open**, preselected: own website → Optimise; none / profile → Build (only Build).
  Wording = `callClose.routeOffer` (live v3: both routes carry on at £29.99/month after the minimum term).
- Guarantee once (callClose's sentence) + the discreet "never promise a ranking" line.
- Objections: buttons, one answer open at a time — Why £99?, How much is it?, I already have an agency, My agency
  controls the website / domain, I need to think about it, Is this a scam?, Can I cancel?, Can you guarantee I'll show
  up?, Why twelve months?, Why six months?, Just send me something, I'm busy right now.

### Removed

LinkedIn script, Email script, gatekeeper ("Someone else answers"), voicemail ("Voicemail (under 20 seconds)"),
"If they'd rather see it first", "The longer version is in…", research source links/labels (the Yext source stays in
`salesExplainer.ts` code only), "How we build for AI", "How do you know what's winnable", the voice-note coaching
block, "After they pay", the onboarding banner in the popup, the second AI summary.

## AI score colours (`src/lib/scoreTone.ts`, one rule, proportional)

all named → green · half or more → green-ish (lime) · some but under half → amber · none → red · no data / running /
failed / incomplete → neutral. Overall % uses the same rule (0% red, 100% green). Applied to the Call summary, the
Inbox strip, the Outreach rows ("ChatGPT 1/3 · Google AI 0/3") and the full audit window. Colour only — no
poor/good label. Gemini is shown as **Google AI** on these screens; the engine key stays `gemini`.

## Log this call / status / next action

From `improve/lead-workspace-sales-flow`, unchanged: Log opens one window — Interested, Not interested, Didn't answer,
Call back, Send onboarding, Wrong number, Left voicemail (+ More). Interested = the ⭐ (`lead_mark_interested`), never the
old status; then "what next?" (Send onboarding / Call back / Set follow-up / Nothing yet). Call back → when. Didn't
answer / voicemail → optional retry date. Not interested → lost reason, no next step. Wrong number → suppressed, no next
step. Send onboarding → Close tab (Quick Close). Status pill and next action shown compactly at the top.

## Admin nav

From the design branch: Review Replies, Page Gen and Page Plan leave the side menu; they live in Paid Clients (switch at
the top + "Pages & reviews" per client); old URLs redirect via `LegacyToolRedirect`. No backend removed; sales gain no
access (`scripts/paid-client-tools.test.ts`).

## Tests

`npm run check`: typecheck 9 = baseline (list identical), edge syntax OK (496 files), edge names OK (69 entrypoints),
import graph 0 faults, build OK, **338/338 suites**. New: `call-script.test.ts` (127 checks: every case in the brief —
plumber + 3 rivals + issues, 0/3, 3/3, one rival, none, no website, clean site, agency, self, high agency cost, Build,
Optimise, banned phrases, removed UI, score colours rendered from real scored rows), `selling-gate-account-only.test.ts`.
Updated to the new rules: call-log-from-script, call-workspace, cold-call-playbook, domain-authority,
final-sales-release-fixes, lead-workspace-sales-flow, outreach-compact-audit-rows, outreach-workspace, pre-sales-final,
sales-ready-gate, sales-shared-workflow, sales-style, sales-workspace-v2, salesperson-onboarding,
salesperson-paperwork-external, tps-check, workspace-declutter.

## Visual QA

Real merged components rendered from fixture data in a throwaway Vite harness (Supabase and auth mocked — every write
refused, nothing sent; deleted before commit), headless Edge at 1100 px and 390 px, dark theme. Seen: the 0/3 summary
(red chips, red 0%), 3/3 (green, 100%), mixed (2/3 lime, 1/3 amber), the opener, real reasons, clean-site line, no-website
Build-only, first question, agency branch with a £450 price angle, Build switch, one objection open, the Log window, the
Outreach rows. **No horizontal overflow at 390 px in any case; no console errors.** The next-action step after a saved
outcome was not rendered (the harness refuses the write); it is covered by `lead-workspace-sales-flow.test.ts`. Live
authed pages were not opened (no sign-in was created).

## Functions deployed

**None.** No file under `supabase/functions` changed. Five edited `src/lib` files sit inside edge closures
(`protectionLimits`, `readinessWords`, `salesCrm`, `salespersonOnboarding`, `salesCheck` — 48 functions); the edge
functions use them only for unchanged validators and the fallback refusal sentence for a restricted account, which the
app replaces by error code. Owed at the next function deploy (wording only): those 48, e.g. via
`node scripts/check-import-graph.mjs --reached-by src/lib/protectionLimits.ts`. `_shared/sales-ready.ts` still says
"You are not Ready to Sell yet" in its refusal detail (shown only to a restricted account, and re-worded by the app).

**whatsapp-status:** v114 before (updated 2026-09-30), not deployed, not in any closure touched.

## Live verification

- Both hosts serve entry `index-CrFYvw03.js`; following all chunks: present — "Agency / someone else", "Do you manage
  the website yourself, or does an agency do it?", "Your sales access is not active", the new stat line,
  `hook-named-instead`, the What's New id; absent — "Voicemail (under 20 seconds)", "If they'd rather see it first",
  "Where does most of your work come from", "The longer version is in".
- Database gate: see the live proof above. Nothing was sent to any prospect; no card charged; no sign-up link made.

## Follow-up, same day: one-click "Check before calling" + 50 checks a day (2026-10-06, `improve/one-click-checks-50`)

The sales-team-today release was already merged and live, so this went on its own branch off `origin/main`.

- **Confirmation popup removed.** `SalesCheckDialog.tsx` is deleted. Select leads → **Check before calling (N)** →
  the batch starts on that click (`Outreach.tsx` `startSalesCheck` → `useSalesChecks.start`). No second button,
  no modal; the one-line check bar and each row carry the progress. The "Check again even if checked recently" option
  is gone (the hook always sends `refresh: false`); the server still accepts `refresh`, nothing on screen sends it.
  Retry on a failed row starts straight away too.
- **Daily fresh-check allowance 30 → 50.** Source of truth is the live `protection_settings` row
  (`limits.actions.sales_check.per_day`): `public.guard_action` refuses past it and `sales-prospect-check` counts
  "Checks left today" against it. Changed by migration `20261012130000_sales_check_allowance_50.sql` (one jsonb key,
  idempotent) and the code fallback `DEFAULT_PROTECTION_LIMITS.actions.sales_check` (`src/lib/protectionLimits.ts`),
  held equal by `abuse-cost-protection.test.ts` and `sales-prospect-check.test.ts`. `guard_action` itself has no
  number in it — nothing else to change in the database.
- **Unchanged:** batch maximum 20 (`SALES_CHECK_BATCH_MAX`, refused above it, never sliced); a reused result
  (< 14 days) costs nothing and never counts; ownership / archived / client / trade / town / pitch / auto-message
  refusals; nothing is sent and no lead row is written; the per-person spend caps (50 × `OUTREACH_AUDIT_EST_USD` is
  far below `user_day_hard_usd`).
- **At 0 left:** the bar reads "Checks left today: 0/50 · Daily check limit reached"; the button stays enabled because
  a press can still reuse recent results; a new check on that lead is skipped "Daily check limit reached — try again
  tomorrow or ask Paul." (`REASON_TEXT.allowance_used`).
- **Onboarding:** the selling gate was already account-restrictions-only (migration `20261012120000`, above); an
  active salesperson with an incomplete checklist can check; suspended / ended / disabled (no sales role) cannot.
- ⚠️ **Apify still caps the team, not the allowance.** At deploy time Apify was US$29.05 of a US$40 monthly cap
  (cycle ends 16 Oct); prospecting stops at 85%, so only about US$5 (≈150 fresh checks for the WHOLE team) remains this
  cycle. Past that the check is skipped "budget used". Raising the Apify cap is Paul's, in the Apify dashboard.
- **Tests:** `sales-prospect-check.test.ts` (50 end to end: 50/50 on a fresh day, first check → 49, 20 + 20 + 10, 21
  in a batch refused, 51st refused, cached reused at 0 with no paid call and no guard row, no lead status changed,
  nothing sent, suspended / disabled refused, gate = account restrictions); `outreach-compact-audit-rows.test.ts`
  (no dialog, the press calls `checks.start` directly, no "check again", bar 50/50, 43/50, 0/50 + the limit line,
  button not disabled at 0); `pre-sales-final`, `abuse-cost-protection` re-pinned. Gate: 338/338 suites.
- **Visual QA:** the real Outreach page in a throwaway harness (Supabase / auth faked, no network, deleted before
  commit), in-app browser, desktop 1280 px and 390 px: two leads ticked → press → the start request left 22 ms later,
  no dialog in the page, bar "Checking 2: 2 checking · Checks left today: 41/50", both rows "Checking…"; 0/50 state;
  no horizontal overflow at 390 px.
