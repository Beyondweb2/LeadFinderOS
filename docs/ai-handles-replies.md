# AI handles replies (2026-10-11)

Branch `feat/ai-assisted-replies`. WhatsApp only, **approve-to-send only** — there is no auto-send.

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
  gate (`NAMED_INSTEAD_TEMPLATES`) still reads method 1 — unchanged here.
- **Lead with the best missed search** (`askedPhrase`, `spokenSearch`): the hook pick's engine + question, and that answer's
  names: `I asked Gemini "Who is the best driving instructor for beginners in Halstead?" and it mentioned A, B and C.` A
  search phrase follows "for"; ", UK" is dropped. Only when the pick's engine is the conversation's engine (never two tools);
  else trade + town. The checker ignores a "?" inside the quoted search.
- **Soft version** (named in MORE than a third): the same missed search and its names, no "instead", no closer. ⛔ No draft
  says "named you in X of Y answers" or "a gap in the rest"; the checker warns on both.

Preview (local, live data, read-only, nothing sent): Alisons "Yes it is." (1/2, Google AI showed no answer) → soft; Nola
"Yes" (1/3) → full pitch led by Gemini's missed question; Ven burst → Auto-reply + full pitch; a Spanish auto-reply → Auto-reply
+ pitch. 0 checker warnings. Tests: `reply-move.test.ts` §9 (Nola), §10 (Ven), `ai-reply-drafts.test.ts` §3.
