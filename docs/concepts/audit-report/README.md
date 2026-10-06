# Quick AI Visibility Check — three redesign concepts (CONCEPT ONLY)

**Not the live report.** Nothing here is imported by the app, the edge functions or the build. The live
report (`src/lib/aiAuditReportHtml.ts`, `renderQuickCheckTop`) is untouched. Disposable once Paul picks.

- `index.html` — standalone gallery, open it directly in a browser. Tabs switch Concept 1/2/3; a toggle
  switches the featured answer between "not named" (Q1, Google AI) and "named" (Q2, ChatGPT).
  URL params: `?c=1|2|3`, `&named=1`, `&bar=0` (hides the gallery bar, used for print).
- `screenshots/` — `concept-N-desktop.png` (1280px), `concept-N-mobile.png` (390px, 2×),
  plus `concept-1-desktop-named.png` and `concept-2-mobile-named.png`.

**Fixture data.** The Doncaster Roofing Company, 3 questions × ChatGPT + Google AI, 1 of 6 named (17%).
All six answer texts are written for this demo. They are not recorded AI answers.

## The three directions
1. **Editorial** — premium printed-report feel: serif headline numbers, numbered sections, black question
   card, the full answer in large serif text with numbered marker highlights, a red/green result strip,
   "What this means", then a ruled table.
2. **Conversation** — "here is what AI said": dark header, a thread card ("We asked" bubble → engine
   answer bubble with name chips), a big Not found / Found card, Why this matters, score tiles, question rows.
3. **Evidence** — scorecard + dossier: 17% / ChatGPT / Google AI / a 3×2 answer grid up top, then one
   evidence panel per question showing BOTH engines' full answers, competitor chips and the result.

## Round 2 — 2A / 2B / 2C (Conversation direction, reworked, 2026-10-06)
Paul preferred Concept 2 but found it pale, long and slow to the score. All three follow one order:
header → your score → questions + AI answers → why this matters (one short strip) → the LIVE CTA/footer.
They use the live report's 760px sheet width, black/white/yellow with solid red/green result states, and
the result is a badge in the answer card's header (no separate "not found" panel).
- **2A Bold score + stacked evidence** — black score band (17% + ChatGPT/Google AI), the featured
  question expanded with its answer, the other engine as one line under it, Q2/Q3 as compact cards
  (badge + names), yellow "why this matters" strip.
- **2B Scoreboard + featured missed search** — three-cell scoreboard with coloured top bars, black verdict
  line, yellow question box, answer card with a black "named instead / your business" side panel, a
  solid red/green 3-row table, one-line why-this-matters. The shortest.
- **2C Question cards** — compact black score band, then one card per question with both engines'
  answers (badge + highlighted text), black stat strip.

**The footer is the real one.** `extract-live-footer.ts` runs the unchanged live renderer
(`buildReportData` → `renderReportHtml`) on the Doncaster fixture with the prospect-path flags
(`showOffer`, `offerUrl`, `requestCallUrl`), cuts out `<section class="cta">…</footer>` and the live
stylesheet, and writes `live-footer.js`. The gallery mounts it in a shadow root so its CSS applies
unchanged. If the file is missing the page shows "EXISTING LIVE REPORT FOOTER CONTINUES UNCHANGED HERE".
Regenerate with `npx tsx docs/concepts/audit-report/extract-live-footer.ts` (worktree needs node_modules).

**Answer length.** Answers are labelled "Google AI answer" / "ChatGPT answer", never "full answer", and
the renderer caps any text at 600 characters with an ellipsis (`ANSWER_CAP`), matching what is stored.
The fixture answers are all under 600, so none is cut.

| | Desktop height | Mobile height | Print (A4) | Report body before footer | Block taller than a page? |
|---|---|---|---|---|---|
| 2A | 1,863px | 2,708px | 2 pages | ~1,180px ≈ 1.15 pages | no |
| 2B | 1,655px | 2,440px | 2 pages | ~970px — fits page 1; footer on page 2 | no |
| 2C | 1,936px | 2,975px | 2 pages | ~1,340px ≈ 1.3 pages | no |
Original Concept 2 for comparison: 1,810px desktop / 2,752px mobile, score near the bottom.
No horizontal overflow at 1280px or 390px. Every card is set not to split, and none is taller than a
page, so none can split. Screenshots: `concept-2a/2b/2c-desktop.png`, `-mobile.png`,
`concept-2a-desktop-named.png`, `concept-2b-mobile-named.png`.

## Round 3 — Concept 4 · Hook Audit Hybrid (2026-10-06)
For the 3-question × 2-engine hook audit (6 answers). Order: header → your score → featured missed
search → all questions we asked → website issues we found → why this matters → LIVE CTA/footer.
- **Score:** black band, huge 17% (overall keeps the live `verdictBand` colours), "1 of 6 answers named
  you", the live verdict line ("You're being named, but not consistently.") over a yellow rule, and two
  engine cards. Engine colours: 0/3 red, 1/3 amber, 2/3 and 3/3 green (`engTone`).
- **Featured missed search:** black "What we asked" bar, the Google AI answer with competitors
  highlighted (client green if named), NOT NAMED badge in the card header, and a side summary:
  Result · Named instead 1–4 · Your business.
- **All questions:** 3-row table, black header, red/green chips, featured row tinted.
- **Website issues:** up to 4 issues, each with a High/Medium/Low marker, title, one line, and "On N of
  3 pages". Titles reuse the live crawl-check wording (`crawlCheck.ts`) where one exists; structured
  data is left out (tested negative as a lever, CLAUDE.md §5). Gallery switch "Website: none" swaps in
  a "No website found" panel using the first sentence of the live `noWebsiteSection` (no prices).
- **Why this matters:** one yellow strip — 5 of 6, 4 competitors, one sentence. No sources.

| | Desktop | Mobile (390px) | Print (A4) | Body before footer |
|---|---|---|---|---|
| Concept 4, website issues | 2,002px | 3,249px | **2 pages** | ~1,320px ≈ 1.3 pages |
| Concept 4, no website | 1,781px | — | **2 pages** | ~1,100px ≈ 1.1 pages |
No horizontal overflow. Cards, the table, each issue row and the footer are set not to split, and no
block is taller than a page. Earlier versions printed: Concept 1 = 3 pages, Concept 2 = 2,
Concept 3 = 4 (all three WITHOUT the footer or a website section); 2A/2B/2C = 2 each with the footer.
Screenshots: `concept-4-desktop.png`, `concept-4-mobile.png`, `concept-4-desktop-no-website.png`,
`concept-4-mobile-named.png`. The website issues are fixture data, like the answers.

## QA (2026-10-06, headless Chrome)
- No horizontal overflow at 1280px or 390px in any concept (scrollWidth = clientWidth).
- Print to A4: Concept 1 = 3 pages, Concept 2 = 2, Concept 3 = 4. Cards are set not to split.
- Engine marks: ChatGPT reuses the OpenAI mark already in the live report; Google AI is a simple
  four-colour spark (not Google's trademark "G"), labelled "Google AI" — never "Gemini".

## Things to settle before building the winner (these conflict with earlier rulings)
- **Engine logos and chat bubbles** were removed from the live evidence card on 2026-09-22 (Paul: a
  replica reads as a mock-up). Concept 2 brings that style back, with Findable framing.
- **Model prose** was taken off the quick report on 2026-09-26 (Paul). All three concepts show it again.
- **"Full answer" is up to 600 characters** — `hookAudit.ts` stores `answer_excerpt` cut at 600. A real
  "full answer" means storing more, or labelling it an excerpt.
- **Gemini map-card answers** are junk text (`isMapCardAnswer`); the design needs a no-quote fallback.
- Concept 3 shows all six answers, which needs the per-cell answer text, not just the hook gap's one.
