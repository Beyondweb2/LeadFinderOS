# AI handles replies (2026-10-11)

> **What a draft SAYS is the reply playbook since 2026-10-20: `docs/reply-playbook.md`** (`src/lib/replyPlaybook.ts`).
> This file is the machinery (rows, switch, claim → send → complete, cost cap).

Branch `feat/ai-assisted-replies`. WhatsApp only, **approve-to-send only** — there was no auto-send until Level 2
(2026-10-21, last section): per-reply-type switches, all OFF when shipped.

## What it does

- **Switch** "AI handles replies" — Inbox top bar, beside "When a prospect replies" (that is where reply automation
  already lives; there is no Settings page). Admin only. Stored as `whatsapp_outreach_state.ai_handles_replies`
  (default **false**) + `ai_handles_replies_since` (set each time it is turned on; replies from before are never drafted).
- **Worker** fn `ai-reply-drafts` `action: 'tick'`, cron `ai-reply-drafts-run` (every minute; `invoke_ai_reply_drafts()` posts
  only while the switch is on or a draft is mid-send). It takes the newest inbound per conversation (settled 30 s, since the
  switch went on, unanswered, no row yet — SQL `ai_reply_draft_candidates`) and writes ONE `ai_reply_drafts` row per inbound.
- **Rules** `src/lib/aiReplyDraft.ts` `aiReplyDecision`:
  off / no lead / client / archived / not a reply to our outreach → `skipped` · Do Not Contact (any suppression, fails closed),
  stop, not interested, wrong person, already sorted, legal, complaint, money, angry, price, call, booking, a photo/voice note
  → `needs_you` (no draft) · auto-responder / bare "ok" → `skipped` · window closed → `needs_template` · else `draft`.
  Hand-over reuses `replyTriage.triageByRules` (one set of phrases) plus an anger list.
- **Draft**: what was searched + who AI named instead (completed audit only, `loadAuditContext`; not repeated once the hook
  has gone) → 1–3 real site issues (`coldCallPlaybook.selectFindings`, the call script's own rule, from the stored crawl) →
  "are you with an agency for the website at the moment or do you look after it yourself?" (a call question once they have
  said who runs the site). `SALES_STYLE_RULES` verbatim; checked by `checkAiReply` (+ `salesStyleProblems`); one rewrite;
  a rule-built fallback when the model is unavailable or over budget. Nothing absent is invented.
- **Tone source**: template reply rates from `whatsapp_messages`, 90 days to 2026-10-11 (inbound within 3 days, before our
  next send): `initial_contact` 1011/1974, **`audit_followup_call` 95/258 = 37% (best after-reply template)**, free text
  100/232, `audit_reply` 199/614, `competitor_hook` 11/73, `audit_result_hook` 16/124. Auto-responders are not excluded, so
  these are rough. `audit_followup_call`'s tone is the prompt's example (`BEST_TEMPLATE_TONE_EXAMPLE`), never pasted in.
- **Cost**: gpt-4o-mini, `max_tokens` 400, prompt cut to 12k chars, `AI_REPLY_DRAFT_MAX_USD` = $0.005 checked BEFORE each call
  (worst case). Each call → `api_usage_log` `openai_ai_reply_draft`; the row keeps `cost_usd` / tokens / calls. Paid mode not
  `running` → hand over instead of spending. Regenerate asks `guardAction('ai_draft')`, max 5 per draft.

## Inbox

- `my_ai_reply_drafts()` (SECURITY DEFINER, same scope as `my_whatsapp_unread`) → `useAiReplyDrafts` (30 s poll, WhatsApp tab only).
- List chip: **Needs approving** / **Needs you** / **Needs a template** replaces the state chip ("Waiting" stays for the rest; a
  failed send still shows). Filter **Needs approving**. SMS tab: none of it (`ai-replies` in `SMS_ONLY_DIFFERENCES`).
- `AiDraftPanel` above the reply box. The draft is pre-filled once per version, never over a person's typing.
- **Approve & send** = `claim` (pending → sending, one conditional write; the loser is refused) → the Inbox's own `send`
  (send-whatsapp-message, unchanged) → `complete` (checks the message row: outbound, same phone, after the claim; records
  `final_text`, `approved_by`, `approved_at`, `sent_message_id`; a refusal hands the draft back). An abandoned claim is settled
  by the tick from the message log after 5 min — sent if a message exists, else back to pending. Never a second send.
- **Discard** / **Dismiss** record `discarded_by/at`, send nothing.

## Draft reply always shows (same release)

Cause of the Safety First Electrical screenshot: `WarmReplyAssistant` returned only the "WARM REPLY · HOOK NOT SENT" line
whenever `warmStage` was not `warm` (the 2026-09-25 gate), and `warm-lead-reply` refused research/draft with `not_warm_yet`.
Both gates are removed. "Draft reply" and "Refresh research" always render (window open); the stage is a quiet label. Draft
reply with **no** research does not read the site — it drafts from the conversation (+ audit if any) and shows "No audit yet,
so no site issues included." (or the no-research / no-AI-result variant). Refresh research starts research when none exists.
The model is still told whether the hook has gone (`hookTemplate` null before it). Closed window: unchanged (template note).

## Failed crawl fix

`src/lib/crawlWriteRule.ts` `leadCrawlWriteDecision`: a failed crawl (quick: `signals.fetchFailed`; full: completeness
`failed`) over a good stored row → keep the row and write `lead_crawl_checks.last_failed_attempt` (cleared by the next good
crawl). Used by `crawl-check` and `_shared/crawl-job.ts` (→ redeploy crawl-check, crawl-worker).

Tests: `scripts/ai-reply-drafts.test.ts`, `scripts/warm-stage.test.ts` (no-hook case). Migration `20261022090000_ai_handles_replies.sql`.

## Names and real site issues in drafts (2026-10-12)

**Cause of the Safety First Electrical draft** ("it named a few other businesses … found some things we could fix"): it came
from the Inbox's **Draft reply** (fn `warm-lead-reply`), not the switch worker (`ai_reply_drafts` held 0 rows; the switch is off).
Its audit (`59e6d496`, 3 questions) HAD recorded names on every engine, e.g. Gemini: GF Electrical Contractors Ltd, NIC
Electrical Solutions Ltd, Glasby Electrical Ltd. The warm prompt never passed names to the model: its AI VISIBILITY line said
"the competitors were in Paul's hook; do not list them again" for every lead, but here the hook had NOT been sent (only
`initial_contact`). There was no saved research, so the model was told "do not mention anything specific", wrote a vague
"found some things" instead, and nothing checked for that. The stored crawl had called the site strong.

**Fix** — one leaf, `src/lib/draftEvidence.ts`, read by both drafters:
- names: `draftNames` (≤3, `hookAudit.distinctNames`), loaded once in `_shared/site-research.ts` `loadAuditContext` from
  `resolveAuditReplyVars` (the hook search's own cell) with the engine it came from (`AuditContext.engine`).
- engine words: `draftEngineWords` — `HOOK_SPOKEN_ENGINE_LABELS` lower-cased: Gemini → "google ai", ChatGPT → "chatgpt", else "ai".
- site: the stored crawl through `coldCallPlaybook.selectFindings` (≤2). Only status `findings` hands issues over; clean,
  strong, failed, stale → `GENERIC_SITE_LINE` (no fault). No website → `NO_SITE_LINE`.
- checks: `vagueSiteClaim`, names missing before the hook, `wrongEngineWords`, `offersRoutes` (both routes) in BOTH checkers.
- warm path: names are given only before the hook (after it, still not repeated); the crawl's issues stand in when there is no
  research or it failed. `checkReply` no longer reads a rival's name ("…Solutions Ltd") as sales-speak.
- `ai-reply-drafts` `action: 'dry_run'` (admin): the draft the worker would write for one lead; writes no draft row, sends nothing.

Tests: `scripts/ai-draft-names-issues.test.ts` (names present / unreadable, issues found / none, crawl failed, strong site, for both).

## 2026-10-13 — "Gemini", one engine per conversation, the tidy (Paul)

- **Wording.** `HOOK_SPOKEN_ENGINE_LABELS.gemini` is now "Gemini" (was "Google AI"), so call scripts, the cold-call
  playbook, voice-note scripts and both reply drafters say "Gemini" / "gemini". `spokenEngine` also turns an old stored
  "Google AI" label into "Gemini". "Google AI Overview" keeps its name. Approved Meta template bodies, already-sent
  messages and stored keys (`gemini`) are untouched. Both drafters flag a draft that says "google ai"
  (`saysGoogleAiForGemini`).
- **One engine per conversation** (`draftEvidence.conversationEngine`, read by both drafters): the tool our SENT messages
  already named wins (a template with no stored text falls back to `TEMPLATE_SINGLE_ENGINE_CLAIM`, so `audit_followup` =
  chatgpt); sent messages naming none → the engine the rival names came from; sent messages naming different tools, or no
  engine known → "ai". With "ai", a draft saying it asked one particular tool is flagged too. `ai-reply-drafts` now reads
  `template_snapshot` so a template's rendered words count; `warm-lead-reply` passes `templateName` on each thread row.
- **Tidy.** `carryOn` lower-cases a line to carry on a sentence but never an acronym or "I" ("AI tools", not "aI tools") —
  used by both fallbacks and the call script. The offer after real issues is `OFFER_LINE_AFTER_ISSUES` ("that's the sort
  of thing we fix, either on the site you've already got or by building you a new one…"); after the general line it is
  `OFFER_LINE_BOTH` ("we can help with that…", pointing at "that's what we help with"); `offerLine` chooses.

Tests: `scripts/ai-draft-names-issues.test.ts` section 3.

## 2026-10-20 — Needs you, the offer fact sheet, code picks the move (Paul)

Branch `feat/inbox-needs-you-fact-sheet`. Source: `Documents/Findable/inbox-analysis-2026-10-19.md` (15 missing rules).
The switch "AI handles replies" is still OFF and is not touched. NOTHING auto-sends.

- **Offer Fact Sheet** `src/lib/offerFactSheet.ts` (`FACT_SHEET_VERSION`, agreement `v5`): the only offer facts a draft may say,
  each citing its v5 clause; pinned to the live agreement text by `scripts/offer-fact-sheet.test.ts`. Guarantee line word for
  word: "We improve AI visibility or you get your money back." One engine wording (`ENGINE_WORDING`). Case studies (ABLM, MCL,
  BS4, a review) are DRAFTS, never used until `caseStudyUsable` (approved + permission + evidence + quote). Gaps / conflicts with
  Paul's brief: `FACT_SHEET_CONFLICTS`.
- **The move** `src/lib/replyMove.ts` `pickMove`: code reads the reply + thread + stored audit / crawl and returns the move, the
  points (facts only), the ONE question, a Needs you reason, stop, autoDraft and the Auto-reply / Only confirmed label. The model
  (`aiReplyDraft.ts`) only phrases the points in Paul's register (9 of his hand-typed messages as examples), max 3 lines, one
  question. Voice note first, call after. No link ever; a price only after a price question or a clear yes. Capitals by code
  (`tidyCaps`: sentences, lines, I / I'm / I'll, ChatGPT / Gemini; links, emails, numbers untouched). Templates never pass through it.
- **Checker** `checkAiReply` WARNS (never blocks): competitor not in the audit, wrong town, a site issue the crawl did not record,
  an owner name the site does not state, £ / term / guarantee wording not on the sheet, ranking / first page, > 1 question, a link,
  denying AI help, "named others instead" above a third.
- **Needs you** = an `ai_reply_drafts` row `kind 'needs_you'` + `reason` / `reason_label` (no new table). Written for every NEW
  reply by the tick, rules only (no model, no spend), whatever the switch says — migration `20261109090000_reply_flags_always.sql`
  (`reply_flags_since`, candidates no longer gated by the switch, the cron posts only when there is a new reply). Chip with the
  reason on the row, sorts to the top, `needs_you` filter, a card + count on the bell (`NEEDS_YOU_CARD_LINK`). Clears on send
  (`my_ai_reply_drafts` hides answered rows) or Dismiss.
- **Draft reply** (WhatsApp tools row) = fn `ai-reply-drafts` `action: 'draft'`: always a draft, except a stop (then "Mark opted out",
  `action: 'mark_opted_out'`). A Needs you row may carry a draft and can be approved (`rowSendable`); a stop never.
  The SMS tab keeps the older `WarmReplyAssistant` (ai-replies difference).
- **Safeguards**: a stop / angry reply → `recordOptOut` + waiting pitches `skipped_suppressed` + a queued drip lead unqueued
  (`applyStop`). Auto-replies and bare "yes it is" → `undoReplied` puts a NEW Replied back to Contacted only when nothing they
  ever sent was a real reply. Loop guards (pickMove): never twice without a prospect message, three AI sends with no win (our voice
  note / a booked call) → Needs you, no reply to repeated auto-replies. Claim refuses a stop and a suppressed number.
- **One-third rule** `src/lib/namedShareRule.ts`: `NAMED_INSTEAD_TEMPLATES` go only when named ≤ a third of valid answers —
  enforced in `_shared/audit-reply.ts` `resolveAuditReplyVars` (Inbox single + bulk dry run, queue pitch + drip, report offer).
  Template text unchanged. Not covered: `hook_followup`'s own lane (it needs a prior `audit_reply`, which is now gated).
- **Dry run** `action: 'dry_run'` (admin JWT, or the internal job header): `{ fixtures: [...], model }` runs the deployed drafter
  on ZZ fixtures (`scripts/fixtures/ai-reply-eval.json`, 25 anonymised real + 32 odd), saves nothing, logs nothing.

Tests: `scripts/reply-move.test.ts` (57/57 hand-over decisions), `offer-fact-sheet.test.ts`, `named-share-rule.test.ts`,
`ai-reply-drafts.test.ts`, `ai-draft-names-issues.test.ts`, `bulk-send-precheck.test.ts`, `hook-send-integrity.test.ts`.

### Model test (2026-10-20, deployed dry run, 57 ZZ fixtures, nothing saved or sent)

| | gpt-4o-mini (first run) | gpt-4o-mini (after the wording fixes, live) | gpt-4.1 (first run) |
|---|---|---|---|
| Hand-over decisions right (code decides, same for every model) | 56/57 | 56/57 | 56/57 |
| Drafts written (stops get none) | 51 | 51 | 51 |
| Unsupported claims (read by hand + checker) | 1 ("it can take time to build visibility") | 0 | 1 ("that explains it") |
| Checker warnings | 3 (2 false: "English", "£99.") | 0 | 3 (same false ones) |
| Wording slips | 3 (bot answer in 2nd person, "you can carry on looking after it", "that's their automatic reply") | 1 (repeats itself on a bare "ok") | 0 |
| Tone, 1 to 5 | 3.8 | 4.0 | 4.4 |
| Cost for 57 conversations | $0.013 | $0.012 | $0.16 |

The one hand-over "miss" is deliberate: "Only got website up properly last week" goes to Needs you (unsure), not a guessed draft.
Decision: keep gpt-4o-mini. gpt-4.1 reads a little warmer but is ~13× the cost and was not needed to pass.
Re-run: `action: 'dry_run'` with `fixtures` (8 per call) and `model` (`DRY_RUN_MODELS`).

## 2026-10-20 — the first-reply pitch (Paul)

Branch `feat/drafter-first-reply-pitch`. Cause (KSM Driving Tuition): its opener was `initial_contact_short` with no stored
text, `wasOpener` knew only `initial_contact` / `initial_opener_v2`, so "Yes it is" read as a yes to a voice-note offer and the
draft said "I'll send a short voice note now". Every `initial_*` template is now the opener.

- **`first_reply_pitch`** (`replyMove.ts` `firstReplyPitch`, code-built word for word via `plan.fixedText`; the model is not
  asked): "I asked <engine> for <a trade in town> and it mentioned <rivals>." → "AI is recommending your competitors instead. I
  looked into why this might be happening and found … on your website: <up to 3 serious issue titles>." (or the no-website
  line) → "Anyone asking AI that question gets pointed to them instead of you." → "Would you rather those customers came to you?".
  Clean / running / failed check: line 1 ends "not you", no "looked into why". Named in more than a third (or no counts): the
  neutral `auditLine`, no closer, ending on the next step's question.
- **Next steps**: after the closer → `pitch_next` "Are you with an agency, or do you manage the website yourself? Either way I can
  send a quick voice note on what I found." (no website: "Do you have a website I've missed?"). "I do it myself" → "Nice one. Ok
  if I send a quick voice note on what I found?"; any other answer → thanks + the same question. Never "now" / "shortly".
- **Confidence line** `offerFactSheet.ts` `CONFIDENCE_LINE` (the sheet's `GUARANTEE_LINE` verbatim): price, guarantee / "does it
  work", "what's the catch", "who is this", unsure, and the voice note script. Never in the first pitch. Guarantee reply ends
  `GUARANTEE_REFUND`.
- **Bot answer** follows the "AI handles replies" switch (`aiSwitchOn`, fails toward ON): OFF "I read and send every one
  myself"; ON "some replies on here may be automated". The checker warns on the first with the switch on.
- **Checker** adds: timing promises, "I was looking for", past results with no approved case study, "100%" / "if I fail".
- **Recorded on every draft** (`why`): `move`, `closer`, `confidence`, `siteIssues` (titles + pages), `aiAutoReplies`. Sent
  drafts link to `whatsapp_messages` by `sent_message_id`. No migration.
- **Website check order** (`websiteCheck.ts` `SAY_FIRST`): within a severity the town / areas issue comes before headings.
  Placeholder posts were already counted once (`placeholderPagesOnce`); KSM's live row reads placeholder → Norwich → headings.
  There is no "generic page titles" check in the crawl today.

Preview: deployed dry run, gpt-4o-mini, 67 fixtures (57 + KSM + no website / zero issues / running / failed / above a third /
the follow-up steps), 0 warnings, $0.012; the changed ones re-run after Paul's edits, 0 warnings. Tests: `reply-move.test.ts`
§6–8, `website-check.test.ts` §6, `ai-reply-drafts.test.ts`, `crawl-in-audit-callscreen.test.ts`.

## 2026-10-20 (later) — missed search first, the full score, auto-reply bursts (Paul)

Three faults seen live on 2026-10-19:
- **Ven Language Services** answered the opener with an auto-responder burst ("Buenas noches" / "Thanks for contacting Ven
  Language Services" / "Are you interested in Spanish lessons?...", 72 seconds) and got "Cheers for your reply… voice note or call?".
- **Nola's Driving School** (ChatGPT 1/1, Gemini 0/1, Google AI 0/1 = 33%) got "named you in 1 of 2 answers, so there's a gap in
  the rest" with no names: the drafter read the run summary (ChatGPT + Gemini only), so 1 of 2 looked above a third.

Rules now (`src/lib/replyMove.ts`):
- **Auto-reply reading** `autoReplyFlags(thread)`: a message is an auto-reply on its own wording (`isAutoReply`: the shared
  triage, the away/"thanks for your message" wording, a WhatsApp Business greeting "Thanks for contacting …" / "Welcome to …"
  with no question at the end, or auto-reply wording in Spanish / French / Portuguese / Italian / German), OR as part of a
  BURST holding one: prospect messages with nothing of ours between, each within `AUTO_BURST_MS` (2 min). No timestamps = no
  burst (fixtures). A burst with no auto-reply wording (a person typing fast) is never one. An auto-responder's "interested"
  is never a clear yes.
- **The first auto-reply to the opener** (nothing real from them before it, no loop guard) → move `auto_reply`, label
  Auto-reply (not a real reply, never counted as Replied), draft = the code-built first-reply pitch (`fixedText`).
  `aiReplyDecision` drafts an `auto_reply` only when it carries `fixedText`. A repeat, or an auto-reply after a real reply,
  keeps the old rule: nothing drafted. `undoReplied` reads the whole thread, so every message of a burst counts as automated.
- **The count is the score the audit SHOWS**: `resolveAuditReplyVars` scores with `scoringMethodFor(audit.created_at)` and
  returns `scoreNamed` / `scoreTotal` (= `hookScore.scored`: Google AI counted where Google showed an AI answer). The drafter's
  one-third rule reads it; only an audit with no complete quick-check score falls back to the run summary. The template SEND
  gate (`NAMED_INSTEAD_TEMPLATES`) reads the SAME count: `namedShareOf` (`namedShareRule.ts`), one source for both (Nola 1 of 3 → allowed;
  `named-share-rule.test.ts` §2b). Pre-2026-10-19 audits keep their two-engine score.
- **Lead with the best missed search** (`askedPhrase`, `spokenSearch`): the hook pick's engine + question, and that answer's
  names: `I asked Gemini "Who is the best driving instructor for beginners in Halstead?" and it mentioned A, B and C.` A
  search phrase follows "for"; ", UK" is dropped. Only when the pick's engine is the conversation's engine (never two tools);
  else trade + town. The checker ignores a "?" inside the quoted search.
- **Soft version** (named in MORE than a third): the same missed search and its names, no "instead", no closer. ⛔ No draft
  says "named you in X of Y answers" or "a gap in the rest"; the checker warns on both.

Preview (local, live data, read-only, nothing sent): Alisons "Yes it is." (1/2, Google AI showed no answer) → soft; Nola
"Yes" (1/3) → full pitch led by Gemini's missed question; Ven burst → Auto-reply + full pitch; a Spanish auto-reply → Auto-reply
+ pitch. 0 checker warnings. Tests: `reply-move.test.ts` §9 (Nola), §10 (Ven), `ai-reply-drafts.test.ts` §3.
- **Site line** (`websiteCheck.ts` PLAIN_LINE): a refused crawler reads "Our check could not read your site, which AI tools may also
  struggle with" (hedged: we saw our check refused, never an AI tool). Every serious title is a whole sentence (name / town /
  service pages / thin / deep / unlinked pages rewritten); three or more join with ", and" (`reply-move.test.ts` §9b).

## 2026-10-20 — first-reply pitch, wording A (Paul)

Shape (`replyMove.ts` `firstReplyPitch`, code-built word for word; nothing sends):
```
Hi <first name>,                                   ← only a person the crawl states as owner / founder (contentTrust ownerOf)
I asked <engine> "<question>" and it mentioned <A>, <B> and <C>.
AI is recommending your competitors instead. I looked into why this might be happening and found … on your website: <issues>.
I specialise in helping local businesses get recommended by AI, so those customers come to you instead.
Are you with an agency, or do you manage the website yourself? Either way I can send a quick voice note on what I found.
```
- **The worst result leads** (`src/lib/worstMiss.ts`): of the ChatGPT / Gemini answers that did NOT name the business, the one
  naming the most others; its own engine, question and cleaned names (`HookReportSummary.tested`, self excluded). Tie: the
  report's hook gap, then Gemini, then the earlier question. Google's AI Overview is never "the engine I asked". A conversation
  that already named a different tool says "AI" (never two tools, never one that named them).
- **Greeting**: first name only, from `check.summary.owner` (the crawl's stated owner / founder); never from the business name; no
  name → no greeting. (The crawl reads owner / founder wording; it has no separate "contact person" reading.)
- Dropped: "Anyone asking AI that question gets pointed to them…" and "Would you rather those customers came to you?". The agency
  question is the only question (no website: "Do you have a website I've missed?"). A reply to an OLD pitch still gets its old
  next step. **Soft version** (named in more than a third): the same shape without "AI is recommending your competitors instead".
- Checker: still warns on more than one question (a quoted search's "?" is not counted); the pitch's length cap is 800.

## 2026-10-21 — "Hi mate,", no AI brands, the new confidence line (Paul)

- No name found → the pitch opens "Hi mate," (`PITCH_NO_NAME_GREETING`); a name they gave or the site's stated owner still wins.
- ⛔ No AI brand in any prospect-facing draft: "I asked AI "<question>" and it mentioned A, B and C."; no website: "I couldn't find
  a website for you, so AI has nothing of yours to read."; the playbook lines say "ai tools". The worst-engine pick and the
  evidence are unchanged; the "why" carries `missed` (engine + question) and the panel shows it. The checker warns on any brand
  (`AI_BRAND`) unless they asked which tool (`RE.whichTool` → `which_tool`, `plan.brandsAllowed`).
- The confidence line is now "I specialise in getting local businesses to show up in those results, so the customers go to you
  instead." (the 2026-10-20 records above keep the words used then).
- Record: `docs/reply-playbook.md` §3, §5c. Marker `x-ai-reply-drafts: 2026-10-21a-hi-mate-no-brands`.

## Draft outcomes (2026-10-21)

**Why:** `final_text` was on 3 of 33 drafts. Most drafts (29) go out through the Inbox's ORDINARY Send with the draft
pre-filled, not Approve & send, and the tick closes them later as `resolved` — no code path saw the text that was sent.

**One writer: the trigger `trg_ai_reply_draft_outcome`** (BEFORE UPDATE on `ai_reply_drafts`, migration
`20261115090000_ai_draft_outcomes.sql`). Whichever path changes a draft, it writes one `ai_reply_draft_outcomes` row per
draft VERSION: `sent_unchanged` · `sent_edited` (final text + `words_changed`) · `regenerated` (an open draft's text was
rewritten) · `discarded` · `superseded` · `not_used` (answered by a template / media). `resolved` looks up the first real
outbound after the inbound (the tick's own rule) and also fills the draft's `final_text` / `sent_message_id`. An Approve &
send queued for send hours (complete → discard with `error = 'queued_for_send_hours'`) is recorded as sent, `queued = true`.
Intent = `why.intent` (playbook), else `why.move`, else `reason`. Words changed = word-level edit distance
(`word_edit_distance`; 0 ⇔ same words in the same order, spacing ignored). ⛔ The trigger swallows its own errors — it can
never block the worker or the Inbox. Nothing in fn `ai-reply-drafts` changed (no redeploy).

**Backfill** (in the migration): every draft that existed got its outcome from the same recorder; each old regeneration is
one `regenerated` row with no text (`backfilled = true`).

**Readout:** "Draft outcomes" beside the AI handles replies switch (admin only, hidden with it), read on open from
`ai_draft_outcome_summary(p_days)` (SECURITY DEFINER, admin only, last 90 days). Fold: `src/lib/draftOutcomes.ts`.
The log table is service-role only (RLS on, no policies). "Draft reply" through fn `ai-reply-drafts`
(`action: 'draft'`) IS counted (it writes an `ai_reply_drafts` row). The older warm-reply assistant (`WarmReplyAssistant`,
fn `warm-lead-reply`) writes into the composer and stores nothing, so it is not counted.

Tests: `scripts/draft-outcomes.test.ts`; live, always rolled back: `supabase/tests/ai-draft-outcomes.sql`.

## Level 2 — the AI sends its own reply, one reply type at a time (2026-10-21, Paul)

Branch `feat/level2-auto-send`, migration `20261116090000_ai_auto_send.sql`. **Shipped with every switch OFF**: nothing sends by
itself until an admin switches a reply type on (Paul switches on "First reply pitch" himself).

**The rule** is ONE pure function, `src/lib/aiAutoSend.ts` `autoSendVerdict`, read twice: by the tick when it writes a draft
(fn `ai-reply-drafts`, `maybeQueueAutoSend`) and by the drain just before the message goes (fn `inbox-scheduled-send`,
`autoRecheck`). Every check must pass (positive; anything unreadable = no):
- the master switch "AI handles replies" AND that type's own switch (`whatsapp_outreach_state.ai_auto_send_intents`);
- the type is on `AUTO_SEND_CHOICES` (29 types; never a price / guarantee / proof / pay-on-results / timing-promise / link line,
  a Needs you intent or a soft no — `NEVER_AUTO_KEYS`, and the test refuses any choice whose playbook entry is factual / priced);
- a plain draft: no checker warning, not the rule-built fallback, no Needs you, no stop, not labelled Auto-reply;
- their words carry no price / guarantee / proof wording (`PRICE_OR_PROOF`) and nothing hostile (`HOSTILE_WORDS`);
- the whole thread never had a stop, anger, complaint, legal, payment, commercial ask, wrong person, privacy or a soft no
  (`threadHardReason`: pickMove re-read at every prospect message);
- a UK mobile (`mobileMarketOf === 'UK'`), not a client (`isClientLead`), not archived, not suppressed;
- nobody typed in / sent into / queued for the conversation in the last 10 minutes (`ai_auto_send_person_active_at`: the
  Inbox reply box's `inbox_mark_typing` marks, person-sent messages, person-queued rows);
- under the daily cap (`ai_auto_send_daily_cap`, default 30; draft time counts queued today, send time counts sent today, London day);
- the account it is sent as (`ai_auto_send_by` = the admin who last saved the switches) is an admin now.
The existing loop guards (never twice without a prospect message, three AI sends with no win, repeated auto-replies) come
from `pickMove` as before; an auto-sent draft counts toward the three (it is `status 'sent'` with `approved_at`).

**The send** is an ordinary `inbox_scheduled_sends` row (`ai_draft_id`, `ai_intent`, `queued_by` = the admin) with
`send_at` = now (or the next opening of the lead's send hours) + 3–8 minutes, never past WhatsApp's 24 hours less 15 minutes.
The drain runs its own checks (suppression, stopped lead, a newer message, the 24 hours, the hours) and sends through
`send-whatsapp-message`'s claimed-row door like any queued Inbox reply. For an automatic row a hold becomes a CANCEL
(`ai_replied_since` / `ai_window_expired`) — the draft goes back to waiting for approval. `autoRecheck` also drops it when the
draft closed or changed, someone answered, or any verdict check now fails.

**Settled by trigger** `trg_ai_auto_send_row`: sent → the draft is `sent` (`auto_sent_at`, `final_text`, `sent_message_id`) and the
message gets `whatsapp_messages.sent_by_ai = true` ("Sent by AI" in the thread); cancelled / failed → `auto_send_id` cleared, the
draft stays pending, `why.autoSend.stopped` says why. The outcome log records `auto_sent` (the outcome trigger).

**Kill switches**: master off → `trg_ai_auto_send_switch` cancels every waiting automatic row (`ai_switched_off`); a type switched
off → its rows (`ai_type_off`). Approve / Discard / Regenerate / Draft reply / "Don't send automatically" / typing stop it
(`stopAutoSend`; a row already `sending` wins and the person is told). A new message from them cancels it in the tick.

**Screens**: the switches + daily limit and "sent by AI today / per type" are inside the existing Draft outcomes popover
(`AiDraftOutcomes`, admin only; `ai_auto_send_summary`). The draft panel says when it will go. Automatic rows are left out of
`my_inbox_scheduled_sends` (no Edit / Release on them).

Tests: `scripts/ai-auto-send.test.ts` — §2 is the hard gate (stop / angry / complaint / no / client / price / guarantee / proof
threads never auto-send with every switch on, through the real pickMove + aiReplyDecision, plus a positive control).
Found while building: the shared anger rule does not read "F off" as angry; Level 2 blocks it with `HOSTILE_WORDS`, the drafter's
own rule is unchanged.

## Draft after the audit (2026-10-21, Paul)

**Bug:** the tick wrote the first-reply pitch the minute a reply arrived, often before the audit the reply had just started (and
the website check) had finished, so the pitch had no competitors and no site issues ("It's Paul from Findable…").

**Rule** (`src/lib/draftEvidenceWait.ts`, one place): a PITCH (`pitchNeedsEvidence`: `first_reply_pitch`, or the first auto-reply's
pitch) is written only when the audit AND the website check are final — audit: a complete / capped run, or every run of the newest
hook audit failed / cancelled; website: a stored check (issues / clean / could not read), no website, a profile, or a failed last
attempt. No audit yet counts as running (the reply may have just started one).
- **Tick**: not final → the inbound's row WAITS: `kind 'skipped'`, `status 'pending'`, `reason 'waiting_for_audit'` (existing columns,
  no migration; 'skipped' draws no chip or panel). Every minute the tick re-checks waiting rows (cheap read) and, when both are final,
  claims the row (`pending → generating`, conditional) and runs the same per-reply path (`processInbound`) — draft, Level 2 check
  and all. After `EVIDENCE_WAIT_MS` (30 min) from the reply: Needs you, "Audit did not finish", no draft (Draft reply then works with
  whatever there is).
- **Draft reply / Regenerate**: a pitch inside the wait answers `audit_running` ("The audit and website check are still running…"),
  before anything is touched or spent. The Inbox now shows a Regenerate refusal (it used to be silent).
- **Open drafts written without evidence** (`draftLackedEvidence`: `why.evidence.ready === false`; older rows: no search / counts,
  an unchecked website note, or the no-audit opening in the text) are rewritten by the tick once both are final — code-built, no model
  call, only if the row is unchanged and has no automatic send waiting. A rewrite that is no longer a pitch marks `why.evidenceStale`.
- Every draft records `why.evidence` (`ready`, `audit`, `crawl`).
- ⛔ Stop / angry / no / media / every Needs you flag are decided BEFORE the wait and never wait.

Report of sent pitches that went out without evidence (read-only, 21 Oct): `C:\Users\paulj\Documents\Findable\drafts-without-evidence-2026-10-21.md`
— 2 leads (Start & Go Driving School, Pass With Paul - Crewe), both sent 21 Oct before 09:10 UTC, neither has replied; both now have
a finished audit and website check. Tests: `scripts/draft-evidence-wait.test.ts` (incl. a reply before the audit finishes).
Marker `x-ai-reply-drafts: 2026-10-21e-draft-after-audit`.

## One mode — Manual / Draft for approval / Auto (2026-10-21, Paul)

Branch `feat/inbox-mode-auto-send`, migration `20261117090000_inbox_reply_mode.sql`. ONE control in Inbox → Settings replaces
"When a prospect replies" (Do nothing / Audit only / Audit and reply) AND the "AI handles replies" switch. Stored as
`whatsapp_outreach_state.ai_reply_mode`; rules `src/lib/inboxReplyMode.ts`; screen `InboxReplyModeControl` (+ `AutoSendSwitches` under Auto).
- **Manual**: nothing automatic on a reply — no audit, no draft. Needs you flags still run (rules only).
- **Draft for approval** (the live row migrated here: AI on + Audit only): the reply audit runs, every reply gets a draft that waits.
- **Auto**: as Draft for approval, and a reply type an admin switched on may send itself (Level 2's rule, all switches OFF).
- ⛔ **"Audit and reply" is RETIRED**: the database CHECK allows `first_reply_mode = 'audit_only'` only, so no path (the queue's
  first-reply drain, create-ai-audit's parked pitch, the completion step) can arm the old template reply. Any parked
  `whatsapp_auto_replies` row in `awaiting_audit` / `pending` was cancelled (none existed). process-whatsapp-queue and
  `firstReplyMode.ts` were NOT changed or redeployed — the database is the gate.
- **Old columns kept in step** by `trg_inbox_reply_mode_sync` (BEFORE): `ai_handles_replies` / `auto_reply_enabled` = mode ≠ manual,
  `first_reply_mode` = audit_only, and leaving Manual stamps `ai_handles_replies_since` (no backlog drafted). An old writer of
  `ai_handles_replies` alone moves the mode to draft / manual — never auto. fn `ai-reply-drafts` `set_mode` (admin); `set_enabled` kept.
- **Leaving Auto** cancels every waiting automatic reply (`trg_ai_auto_send_switch`, now on `ai_reply_mode` too; reason `ai_mode_not_auto`).
- **Level 2 additions** (`aiAutoSend.ts`): `evidence_incomplete` — the draft's `why.evidence.complete` (audit `done` AND site
  `issues` / `clean` / `no_website` / `profile`; a failed audit, an unreadable site or a failed crawl is not complete);
  `not_simple_first_reply` — the first-reply pitch goes only when every message since ours is a plain confirmation or the
  "how can I help" family (`SIMPLE_FIRST_REPLY`; a name, "hello?", "what's this about", "interested" wait). Both re-read at send time.
  `masterOn` = the mode is Auto (`_shared/ai-auto-send.ts`).
- **Bot answer**: "I read and send every one myself" only in Manual / Draft for approval (`botMaySaySendsEveryOne`); Auto or an
  unreadable mode = "some replies may be automated".
- The per-type switches moved out of the Draft outcomes popover; the popover keeps the auto-sent counts ("sent by AI today").
- Not changed: the Run AI audit toast still names the old setting words (`auditPitchRule.ts` is reached by process-whatsapp-queue;
  a text-only change was not worth redeploying the queue).
Tests: `scripts/inbox-reply-mode.test.ts`, `scripts/ai-auto-send.test.ts`. Markers `x-ai-reply-drafts: 2026-10-21f-inbox-reply-mode`,
`x-iss-build: 2026-10-21c-inbox-reply-mode`.

## The pitch is owed until a pitch was SENT; queued sends fixed (2026-10-22, Robina's Motoring School)

- **What happened.** Robina's opener (`initial_contact_short`, 21 Oct 07:42) is stored `failed` in `whatsapp_messages`, but its receipt row (`whatsapp_sends.delivery_status`) says `read`, and she replied "Yes, how can I help?". Meta's `failed` webhook landed first and whatsapp-status's per-message ratchet never lets a later `read` replace `failed`. The Inbox therefore shows the opener as failed.
- **Why the wrong draft.** The drafter dropped every non-sent row, so her reply had nothing of ours before it: not a first reply, so `pickMove` chose `playbook / go_on` ("I had a look and saw that you weren't coming up when I asked ai..."). It was never because a refused draft counted as a pitch.
- **Fix.** `src/lib/draftThread.ts` builds the drafter's thread: a `failed` row whose receipt says delivered / read reached them; nothing else unsent ever counts (draft, refused, failed, pending, null). The pitch stays owed until an outbound pitch actually went. Test: `scripts/draft-thread.test.ts`. Marker `x-ai-reply-drafts: 2026-10-22a-pitch-owed-sent-only`.
- **"Not sent: The send was refused."** That row was not the pitch: it was an `audit_followup_call` template Paul queued at 03:38 for 06:00. Every queued WhatsApp send (2 so far, both 22 Oct 06:00) failed the same way: the drain called send-whatsapp-message with `Authorization: Bearer <service key>`, which the platform gateway refuses before the function runs (`{"message":"Invalid API key"}`), and `senderOutcome` read only reason / detail / error. Fixed: the drain calls by its cron door only (x-cron-secret + x-internal-job), and `senderOutcome` falls back to the code, the platform's message and the HTTP status — never a bare "refused".
- **Not fixed here (held):** the opener still reads `failed` on screen; the ratchet lives in whatsapp-status, which must not be deployed until the Meta App cutover.

## Two controls, the draft bubble, one pill (2026-10-22, Paul)

Branch `feat/inbox-approval-cleanup`, migration `20261124120000_reply_audit_switch.sql`. Tests: `scripts/inbox-attention.test.ts`.
- **Two settings** (Inbox → Settings, admin): "Audit after first reply" On / Off (`whatsapp_outreach_state.reply_audit_enabled`,
  fn `ai-reply-drafts` `set_reply_audit`) and "AI replies" Manual / Draft for approval / Auto (`ai_reply_mode`, unchanged).
  `trg_inbox_reply_mode_sync` now copies `auto_reply_enabled` FROM `reply_audit_enabled` (it used to be `mode <> 'manual'`), so
  every deployed audit-arming path keeps reading `auto_reply_enabled` and none was redeployed (process-whatsapp-queue untouched).
  An old writer of `auto_reply_enabled` alone moves the new switch. AI on + audit off shows one hint
  (`REPLY_AUDIT_OFF_PITCH_HINT`); the draft-after-audit rule (`draftEvidenceWait.ts`) is unchanged, so a pitch still waits for
  audit evidence and, with none coming, becomes Needs you "Audit did not finish" after 30 minutes.
- **The draft is a bubble in the thread** (`AiDraftBubble`), after the queued sends: Approve & send · Reject · Regenerate, plus
  "Edit in reply box" and "Why this reply?". The draft is no longer pre-filled in the reply box. Approve & send sends the
  bubble's words, or the box's after "Edit in reply box" (claim → the Inbox send → complete, unchanged). Reject = discard
  (the outcome trigger logs `discarded`). The bar above the reply box remains only for a row with no sendable draft (Needs you
  with no draft, a stop → Mark opted out, Needs a template).
- **One attention pill** (`src/lib/inboxAttention.ts`): Needs approval → Needs you → Send failed → Auditing → Waiting → Queued
  (sends at …), the same pill in the list row and the thread header; the hover carries the Needs you reason, how long a reply
  waited and "Only confirmed" / "Auto-reply" (their last message only confirmed who they are, e.g. "yes it is", or was an
  automatic reply — neither counts as Replied). The list row shows name + time, preview, the pill, the status as text
  (`OneStatusText`) and the one score line (`docs/audit-score-one-ruler.md`); the status menu, the next action and the
  engagement pills are in the thread header only. The "Needs approving" filter is now labelled "Needs approval".
