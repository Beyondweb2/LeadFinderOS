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
