# Voice-note script (2026-09-26)

Branch `feat/voice-note-script`. A **Voice-note script** button (Inbox thread, both window states;
lead popup) writes a WhatsApp voice-note script for Paul to read out and record. **Nothing sends** —
the panel has Copy and Regenerate only.

## Pieces
- `src/lib/voiceNoteScript.ts` — pure: the pick, the website half, the prompt, the checks.
- fn `voice-note-script` (`verify_jwt = true`, operator JWT + lead ownership): `latest` (DB read) and
  `generate`.
- `supabase/functions/_shared/site-research.ts` — the warm drafter's research pass, **moved verbatim
  out of `warm-lead-reply`** so both use one path. `warm-lead-reply` keeps its own stage gate in front.
- `src/components/VoiceNoteScriptButton.tsx`; table `voice_note_scripts` (migration
  `20260926150000_voice_note_scripts.sql`, service role only).

## The evidence tuple
QUESTION + ENGINE + ANSWER + COMPETITORS come from ONE hook result. Newest ordinary audit (never a
baseline/measurement), scored by `scoreHookRun` with the report's ruler; each cell's own names go
through the report's run-level suppression and junk gate, then self-exclusion + de-dup.
Pick order: Google AI miss with 2–3 names (3 first, then hook rank) → ChatGPT miss with 2–3 → any
miss with 1 name (flagged "thin", operator told) → refuse (`no_miss` / `no_competitors`). A
six-result hook with no final score is refused (`hook_incomplete`); a pending run is refused. All
refusals happen **before** any site read or model call.

## The website half
`runSiteResearch` (saved research → full crawl → crawl check → a targeted fetch; never a crawl job;
the research is saved to `warm_lead_research`, so the warm drafter later reuses it) →
`selectReplyFindings` → primary + at most one more. Modes: `findings` / `clean` (the "nothing
obviously broken" line) / `unread` (say nothing specific) / `no_website`.

## Generation and checks
`gpt-4o`, temperature 0.6 (0.8 on Regenerate, which is shown the old script). Checks = facts, not
style: every competitor named (a legal suffix or a bracketed descriptor may be dropped), the right
engine and never the other, no causation phrasing, no price, no link, no banned phrase, no technical
claim no finding backs, the primary finding actually said. Dashes are replaced mechanically. Length:
60–175 words hard, 80–145 note, 90–130 target — **never a rewrite to hit a number**. One automatic
rewrite on a factual problem; the better attempt is kept; leftovers show as "Check this script".

## Cost
One gpt-4o call ≈ 1,500–2,000 prompt + ~250 output tokens ≈ $0.006–0.008 (≈0.5–0.6p); a rewrite
doubles it. First script for a lead with no fresh research adds one gpt-4o-mini research call
(< 0.1p). Logged to `api_usage_log` as `openai_voice_note_script` / `openai_warm_research`.

## State at build
- Live data has **no six-result hooks yet** (every recent run is v1, Gemini-led); v1 and ordinary
  audits are read on their own valid results.
- Nobody has seen the panel rendered.

## Paul's corrections (2026-09-26, second pass)
- **Profile pages:** `classifyLeadWebsite` — a directory/social profile (TradeHQ, Checkatrade,
  Facebook…) is `profile` mode, never researched, never "your website" (checked).
- **Services need evidence:** the missing-core-pages rule's generic examples are stripped; any common
  trade service named must be in the search, the trade or their own site's services (checked).
- **Lost work is hedged:** "that's work going straight to someone else" etc. rejected unless hedged.
- **Inbox:** one prominent button in the OPEN window only; lead popup keeps its button.

## Live (2026-09-26)
- Migration applied by hand, read back: 27 columns, RLS on, 0 policies, anon/authenticated no access.
- `voice-note-script` deployed (only it; `warm-lead-reply` still runs its pre-refactor code, which is
  behaviourally identical — redeploy it with the merge).
- Three real gpt-4o scripts generated (RP Electrics, JG Electrics, Firebeard Electrical) through an
  admin magic-link session for the data account, revoked straight after (204). Recorded cost
  $0.0089 (2 calls) / $0.0049 + $0.0004 research / $0.0046. No sends, no status changes.
- The first live run found a checker bug: quoting the crawler "ChatGPT-User" read as claiming
  ChatGPT was asked. Fixed (crawler names are ignored for the engine check) with a regression.

## Tone and evidence pass (2026-09-27, generator v2)
- Search paraphrased, never quoted or read out (`readsSearchVerbatim`); the business name in the script
  is rejected (talk to them); polished endings rejected; mate once or twice; target 100-125 words,
  over 140 shortened.
- Concrete findings first; an interpretive one only when nothing concrete exists, sent as OBSERVATION
  ONLY; "weak evidence" / "no evidence" wording rejected.
- Regenerated RP Electrics, JG Electrics, Firebeard Electrical with the real model: all pass the
  checks, 119 / 124 / 126 words, recorded cost $0.0058 (1 call) / $0.0124 (2 calls) / $0.0060 (1 call).
- Known: all three ended on nearly the same approved line.
