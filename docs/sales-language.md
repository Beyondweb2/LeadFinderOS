# Sales language audit (2026-09-30)

Branch `feat/sales-language-audit`. Paul's brief: every script, suggestion and prompt that writes
sales words should sound like a REAL PERSON who did REAL RESEARCH — plain English, short, direct,
specific, no AI slop. Paid Clients / Discovery / Baseline were out of scope and are untouched.

The quality standard (Paul's words, used as a standard, never pasted in):
"Hi mate, I asked Google AI for a plumber in [town] and it named [competitor 1], [competitor 2] and
[competitor 3]. I had a look at why this was happening and found a few issues with your website. We
specialise in AI visibility and I'm happy to explain what I'd do to make your business more likely to
be the one AI recommends."

## 1. Every source found

| Source | Kind | Channel | State before | Changed? |
|---|---|---|---|---|
| `src/lib/coldCallPlaybook.ts` (`buildColdCallPlaybook`) | deterministic | cold call script, follow-up call, objections | weak: "Have you got a minute? I'll explain why I'm ringing", "I was looking for **plumbers** in Rugby … asked AI who it would recommend", long "short list of names rather than ten links" line, essay-length "How much" answer, missing objections | ✅ rewritten |
| `src/lib/voiceNoteScript.ts` (prompt + checks) → fn `voice-note-script` | gpt-4o | voice note | good shape (v3) but no shared style rules; real v2 outputs said "a reliable electrician for commercial work" | ✅ prompt + checks + short version |
| `src/lib/warmReply.ts` (prompt + checks + `fallbackReply`) → fn `warm-lead-reply` | gpt-4o-mini + fallback | WhatsApp reply suggestion | prompt good; fallback said "i checked your site to see why and one of the main issues is" and "a electrician" was possible | ✅ prompt + check + fallback |
| `src/lib/warmLeadResearch.ts` (`RESEARCH_SYSTEM_PROMPT`, rule findings) → both fns above | gpt-4o-mini + rules | the finding words scripts quote; "useful questions" | "harder to pin down as one clear entity" (jargon); no style rule for questions | ✅ two sentences + two prompt lines |
| `src/lib/siteFindings.ts` | deterministic | WhatsApp `{{6}}` of `ai_site_findings_v2`, Call Script findings | already plain and hedged | tested only |
| `src/lib/prospectPreview/copy.ts` (`suggestedMessage`, card copy) | deterministic | WhatsApp message sent with the mockup | already house style ("i had a look at why … coming up instead of you") | tested only |
| `src/lib/quickClose.ts` (`quickCloseScript`, `quickCloseMessage`) | deterministic | Quick Close call + link | fine; uses canonical offer | not changed |
| `src/lib/questionnaireFollowup.ts`, `templateBodies.ts` | Meta-registered bodies | WhatsApp templates | see §5 — some weak, **cannot change without Meta re-approval** | reported only |
| fn `admin-ai-opener` + `AiOpenerModal` | gpt-4o-mini | "AI Generator" in the old WhatsApp dialog | **wrong product**: writes messages posing as a customer to web designers; reachable only through the dead barber-era launch path | reported only (delete candidate) |
| `create-ai-audit` question generation, `hookScore.ts` `genericHookQuestions`, `hookAudit.ts` `planHookQuestions` | gpt-4o-mini + templates | the customer-style searches the hook asks | the planner REWARDS "reliable / trusted / reputable" (+2), so hooks pick "Can you recommend a reliable electrician…" | reported only — see §6 |
| fn `review-reply` | gpt-4o-mini | Google review replies (client work, not sales) | out of scope | not changed |
| LinkedIn / email | — | — | **no generator exists** (contact methods are only logged) | none built |

## 2. Shared style rules — `src/lib/salesStyle.ts`

A leaf module (no imports; edge-reachable).
- `SALES_STYLE_RULES` — one short prompt block, included verbatim by the voice-note and warm-reply
  prompts. Plain search wording ("i asked Google AI for a plumber in Rugby", no adjective on the
  search), plain-English findings, use only the facts given and write around what is missing, the
  banned phrases, no fake rapport, variation from the evidence not synonyms, and Paul's line as the
  standard. "Where this message's own SHAPE or rules differ from the example, the SHAPE and rules win"
  — so the voice note still ends on the website-control question and still never claims causation.
- `salesStyleProblems(text, ignore)` — the floor every generator is checked against: filler on the
  search (`reliable/trusted/reputable/trustworthy/highly rated/top rated/dependable` after "asked /
  looking for / searched"), the stock phrases, fake rapport, exclamation marks. Competitor names (and
  the business's own) are removed first — "Premier Plumbing" is a firm, not filler.
- `searchFillerCount` — for ranking a search question only; a stored question is never rewritten.
- The research prompt got two plain-English lines instead of the whole block (it returns data).

## 3. What changed, channel by channel

**Cold call** (`callScript`, `opening`, objections). Old → new, same lead (Rugby plumber):
- Old (main at bd645d17, same fixture): "Hi, is that Rugby Plumbing? It's Sam from Findable. / I was looking
  for plumbers in Rugby UK earlier and asked Google AI who it would recommend. It came back with
  Dunchurch Plumbing, Hillmorton Heating and R&K Plumbers, but you didn't come up. / Have you got a
  minute? I'll explain why I'm ringing. / When someone asks AI for plumbers in Rugby UK, it gives them a
  short list of names rather than ten links, so that can mean customers going to someone else. / I had
  a look at your site too. The main thing I noticed is a few of the service pages are really light on
  detail. They mention the service, but … It could be contributing, it's not the only thing AI looks
  at. / That's basically what I do. I help local businesses make the information on their site clearer
  for AI and search systems, then I measure the same questions again afterwards to see whether
  visibility improves. / Can I send you the report on WhatsApp? …" (and "asked Gemini" for a Gemini
  result; the audit's "UK" said out loud.)
- New: "Hi, is that Rugby Plumbing? It's Sam from Findable. / I'm ringing because I asked Google AI
  for a plumber in Rugby and it named Dunchurch Plumbing, Hillmorton Heating and R&K Plumbers, but not
  you. / I had a look at your website and one thing stood out: a few of the service pages are really
  light on detail. / They mention the service, but there may not be much useful information there for
  AI to work with when somebody asks a more specific question. / We specialise in AI visibility, and
  I'm happy to explain what I'd do to make you more likely to be the one AI recommends. Is now OK for a
  couple of minutes, or shall I ring you back?"
- The reason for ringing is the opener; no "Have you got a minute?" before it. Gemini is said as
  "Google AI". The trade is singular with its article ("a plumber", "an accountant"); "UK" and the
  audit query's qualifiers are never said. A finding is two lines (what I saw / why it matters).
- Objections: 18, every answer ≤ 5 sentences. New: What exactly do you do · I don't really
  understand AI visibility · We already have an SEO company · My agency controls the website / domain
  (the canonical `SALES_DOMAIN_LINE`) · I don't want a new website · We're busy enough · How do you
  know this works (the measurement + refund, no hedge) · Why is it monthly (findable.live's own "every
  month we build more pages … watch the technical side") · Why twelve months · Why six months. "How much" is the
  canonical `FINDABLE_OFFER_SUMMARY` sentence (so a call can never quote a different price from the
  checkout, `findable-offer-terms.test.ts`) plus two short lines: the site is theirs at the end on Build,
  nothing is charged after the last payment.

**Voice note** (generator v4). The shared rules in the prompt; one beat per line (breathing points);
"a reliable electrician" style searches are now a checked problem (sent back once); the duplicate
banned list folded into the shared one. **Short version**: `shortVoiceNote` builds a ~20-second,
three-line note from the SAVED row (engine, that search's competitors, the website-control question
for this site kind) — derived, never stored, costs nothing, cannot disagree with the full script; the
panel shows it under the script with its own Copy. Real v2 output (2026-09-27): "i was trying to find
a reliable electrician for commercial work in Woking and asked Google AI" → v4 rule: "i asked Google
AI for an electrician in Woking" (the test replays that exact line).

**WhatsApp reply suggestions** (warm drafter). The shared rules in the prompt, plus "say the search
plainly"; `salesStyleProblems` added to `checkReply` (only when the older `SALESY` list did not
already name the phrase). Fallback: "i asked ai for a plumber in Scunthorpe and it brought up other
businesses, not you." / "i had a look at your site as well and one thing that stood out is …".

## 4. How the rules stop invented personalisation

- Competitors: only the cleaned names of ONE stored result (`selectEvidence` / `selectVoiceNoteEvidence`
  — run-level suppression, junk filter, self-exclusion); the call names the first three, the short note
  the same three the saved script used. No names → "your business didn't come up in the answer it
  gave" / no short note — never "other firms". Tested for all five trades.
- Findings: only `siteFindings.ts` / research findings with their own hedged words; a profile page is
  never "your website"; no site → the no-website line. Nothing when the crawl found nothing strong.
- Missing trade → "businesses like yours in <town>"; missing town → the trade alone; no placeholder,
  `undefined` or `{{…}}` can reach the words (tested).
- Money: every figure is a `findableOffer.ts` constant; no discount, no guarantee beyond
  `FINDABLE_GUARANTEE`'s terms.

## 5. Weak copy that needs Paul (Meta-registered, cannot be edited in code)

Reply rates, first message per phone, 60 days (whatsapp_messages, 2026-09-30): `initial_contact`
898/1,689 (53%), `initial_opener_v2` 34/106 (32%). Second-stage (after a reply): `audit_followup_call`
96/258 (37%) — the current winner, and Paul's house style — `audit_reply` 165/514 (32%),
`audit_followup` 15/68, `audit_reply_warm` 7/48, `audit_followup_fault` 4/36, `hook_followup` 0/9.
Weak by the house rules (re-register at Meta to fix):
- `audit_followup`: "45% of people now use AI to find local businesses" — an unsupported statistic.
- `ai_site_findings_v2`: "That's likely why the other businesses are getting picked ahead of you" —
  causation; "you're likely missing customers" — lost work as fact.
- `hook_followup`: "The businesses AI is naming instead of you are picking up work you could be
  getting" — lost work as fact.
- `video_template`, `competitor_hook`: polished, emoji-led, "found something you'll probably want to see".
- `explain_offer_v2`: "I've audited 941 UK businesses…" — a snapshot figure in a fixed body.

## 6. Not done, on purpose

- **The hook's search wording.** `planHookQuestions` ranks with `hookBreadthScore`, which gives +2 for
  "reliable / trusted / reputable", and the generic top-up says "Can you recommend a reliable …". The
  fix is small (stop rewarding those words; plain top-ups), but it only takes effect with a
  `create-ai-audit` redeploy, and that function was deployed at 04:55 UTC today from code that is not
  on `main` (another session's work). Redeploying it from `main` could undo their fix. The scripts no
  longer repeat the adjective either way (they say trade + town). Do it once that session has merged.
- No LinkedIn or email generator was built: none existed, and the brief said not to redesign the
  Sales UI. Easy to add from the same evidence (the call script's pieces) if Paul wants it.
- `admin-ai-opener` (the "AI Generator") left in place; it belongs to the deleted product and should go
  in the deep clean.
