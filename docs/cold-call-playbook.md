# Cold Call Playbook v1 (2026-09-23)

A read-only call guide for one lead, opened from **Inbox** (the "Cold Call Playbook" pill in the
selected conversation's header) and **Outreach** (the row's Call options menu, and the lead detail
dialog). One shared panel: `src/components/ColdCallPlaybook.tsx`.

## What it is built from — stored evidence only

| Piece | Source (reused, not restated) |
|---|---|
| Report link | `resolveLeadReportAudit` (`auditReportResolver.ts`), the Inbox rule → `findable.live/r/<short_code>` |
| AI evidence | `buildReportData` on that audit's latest run + queue rows — the hook gap first (`hook.gap`: question, engine, cleaned `namedInstead`, `answerExcerpt`), else the first not-named question in `questionBreakdown` |
| Competitors | whatever the report would print (junk filter + run-level suppression), minus a self-match (`excludeSelfRivals`) |
| Excerpt | quoted only if it passes `isJunkAnswer` AND `isMapCardAnswer` — the report's hook-card rule |
| Website findings | `resolveFindingsSource` (`siteFindings.ts`) — the SAME loop the `ai_site_findings_v2` {{6}} uses; `resolveSiteFindingsDetailed` is now written in terms of it (behaviour unchanged). Up to `MAX_SITE_FINDINGS`, strongest first, words from `candidateFindings`, proof from the stored signals/evidence |
| Follow-up | `whatsapp_messages` by lead id or WhatsApp phone; any real send (`isRealSend`) or inbound → FOLLOW-UP; report sent = a `REPORT_LINK_TEMPLATES` send |
| Offer | `FINDABLE_OFFER_SUMMARY` (£99 to start, then £99/month, 12-month minimum) + `FINDABLE_GUARANTEE` + Paul's build terms line (since 2026-09-23) |

The loader (`src/hooks/useColdCallPlaybook.ts`) is SELECTs only through the operator session, and
loads only while the panel is open. `scripts/cold-call-playbook.test.ts` fails the build if the
hook, panel or builder gains an invoke, rpc, write or raw fetch.

## Rules it keeps

- Opening leads with the AI result; names only real stored competitors; with none, "your business
  didn't come up in the answer it gave". No audit → the opening claims no result.
- A website finding "could be contributing" — never the cause.
- AI result older than `PLAYBOOK_AUDIT_STALE_DAYS` and crawls past `CRAWL_FRESH_MS` are flagged, never re-run.
- The guarantee objection promises the measurement and the refund, with no "can't promise" beside it.

## Open at ship time

- ✅ **Resolved 2026-09-23**: Paul confirmed £99/month with a 12-month minimum. The playbook now
  quotes `FINDABLE_OFFER_SUMMARY`; see `docs/business-and-offer.md` §0.
- Deep-crawl evidence (`evidence` on crawl rows) exists on ~1 of 241 stored crawls, so most leads
  show signal findings (thin pages etc.) or none.
- Stage 2 (not built): call outcome tracking, follow-up scheduling.

## Simplified for use mid-call (2026-09-27)

The A-H panel became: prospect/context (compact) -> AI OPPORTUNITY (engine, search, named/not, up to 3
competitors from THAT result) -> WHAT I'D TALK ABOUT (max 3 findings, or one plain line) -> [Call script |
Voice note] tabs -> QUESTIONS THEY MAY ASK (collapsed) -> AUDIT EVIDENCE (collapsed; every hook result
per question and engine, from the Inbox card's own scored rows, old early-stop checks labelled) -> Open /
Copy report link.
- `callScript` (coldCallPlaybook.ts) is ONE read assembled from opening / explain / transition / next
  step; those pieces are still built (tests and other callers use them) but no longer shown as blocks.
- A directory / social profile is never crawled as their site (`leadWebsiteKind.ts`, shared with the
  voice-note script): findings note + script say "just your <label> profile".
- "How much is it?" carries the full terms, so the default screen has no offer block. Objections renamed
  to Paul's words: "I already rank on Google", "Can you guarantee I'll appear?".
- The Voice note tab is the shared `VoiceNoteScriptBody`; it warns when its saved script came from an
  earlier audit than the AI opportunity above.
- Inbox AI visibility "View details" floats over the thread (capped at 40vh, closes on outside click)
  instead of pushing the conversation down.

## Shared with the Inbox AI visibility details (2026-09-27)

`selectFindings` now takes an optional `max` and returns a `status` (`findings` / `no_website` /
`profile` / `not_crawled` / `crawl_stale` / `unreadable` / `clean`). The Inbox details' "Website issues
found" / "Online presence issues found" block (`src/components/HookWebsiteIssues*.tsx`,
`src/hooks/useLeadWebsiteIssues.ts`) reads the same three sources through it, read-only and only while
the details are open, so the Inbox and the Call Script can never name different website issues. Only
`clean` may say "No strong website issues found in this check."; a never-crawled site says so.
The details themselves now show each question with each engine as NAMED (green) / NOT NAMED (red),
under the best missed search (question + engine + that answer's own ≤3 competitors + its answer).

## House-style pass (2026-09-30)

The call script now opens with the reason for ringing ("I'm ringing because I asked Google AI for a
plumber in Rugby and it named A, B and C, but not you"), no "Have you got a minute?" first; the trade is
singular with its article, the audit's "UK" and qualifiers are never said, Gemini is said as Google AI
(`spokenEngine`, via `HOOK_ENGINE_LABELS`), a finding is two lines. 18 objections, each five sentences
or fewer; "How much" still starts with `FINDABLE_OFFER_SUMMARY`. Record: `docs/sales-language.md`.
