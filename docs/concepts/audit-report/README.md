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
