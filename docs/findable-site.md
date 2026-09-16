# findable-site — the home page order and the credibility pass

*Records moved out of CLAUDE.md on 2026-09-16. CLAUDE.md holds the rules; this holds the story. Sections keep their original numbers and text. Read this when you are about to touch the thing it describes.*

> Moved from CLAUDE.md §20 on 2026-09-16. Verbatim. Cross-references (§N) use the ORIGINAL CLAUDE.md numbering — `docs/INDEX.md` maps them.
> ⚠️ Corrected 2026-09-16: Token path corrected 2026-09-16: the CLI login lives in Windows Credential Manager, and the Management-API SQL route works from this machine. CLAUDE.md §2.

## 20. 🟡 findable-site HOME PAGE — the explainer moved up, and two things left open (2026-09-12)

The video is the **third** section now (hero → stats → video → #how), on Paul's call. The reason is
not reading order: **the report's CTA button links to `https://findable.live` with NO anchor**
(`aiAuditReportHtml.ts`, `REPORT_SITE_URL`), so every prospect who presses "See how it works" on
their own report lands at the top of the page — at slot 6 that was five sections of scrolling to
reach the thing the button promised.

- ⛔ **THE VIDEO SITS IN A DARK PANEL, NOT A DARK SECTION, AND THE SECTION IS STILL `bg-panel-2`.**
  Costed before choosing: the page alternates navy/light perfectly, so **there is no adjacent pair
  of light sections anywhere on it** and a dark section cannot be inserted without colliding. The
  minimum repair was #how → light, #why-this-works → dark, the proof → light — which takes
  white-cards-on-navy off #how and puts the white report sheets on grey, where their
  `ring-1 ring-white/25` is built for a dark ground. A `bg-band` panel inside the light section buys
  the same contrast for free. **Copy left, video right** from `lg` on
  `grid-cols-[minmax(0,1fr)_auto]`, so the vertical video takes its own width instead of half the
  panel. Desktop **1,032px → 860px**; **mobile 892 → 936px** (the panel's own padding — the one
  place this change costs height, accepted).
- ⛔ **THE SEAM THE MOVE OPENED WAS CLOSED BY REORDERING, NOT BY REPAINTING (Paul, same day).**
  Moving the explainer left ProofSection → Pricing adjacent and both navy (~2,200px of continuous
  dark); the explainer had been the only light section between them. **No single flip closes that**
  — Pricing light collides with the Guarantee, the proof light collides with #why-this-works — and
  the smallest repaint that alternates again flips all four of Pricing / Guarantee / #check / #faq.
  ⛔ **That repaint was refused for one reason: it takes the white card off #check**, and the ask is
  the last thing on that page that may be weakened. **The order is now hero, stats, video, how, why,
  proof, GUARANTEE, PRICING, FAQ, CHECK** — perfect alternation with every section keeping the
  treatment it was given, verified live at 1440×900 and 390×844.
- 🔴 **AND IT REVERSES THE "FAQ BELOW THE ASK" DECISION, ON PURPOSE. Do not put it back.** The FAQ
  had been moved below #check precisely because it is the longest section and was delaying the one
  action the page exists to produce. It is above the ask again — Paul's call, knowing that. What is
  genuinely different: **#check is now the LAST section before the footer**, so the ask is where the
  page ENDS rather than something the FAQ pushes past. ⚠️ **The three moves are ONE decision**: put
  the FAQ back below #check and the navy wall returns unless ProofSection and Pricing are separated
  some other way. index.astro carries the old reasoning verbatim beside the new.
  ⚠️ I reported this seam correctly in the read-only pass and then wrote a comment claiming #how
  had absorbed it. It had not. Both comments are corrected; the claim is measured, not assumed.
- **The report's "See how it works" now points at `https://findable.live/#video`**, not the bare
  origin (`REPORT_EXPLAINER_URL`, render-audit-report **v90**). ⚠️ **It degrades QUIETLY**: a browser
  given an unknown fragment loads the page and stays at the top, which is exactly where this button
  used to land — so if #video is ever removed or renamed, nothing will tell you. `report-origin.test`
  still passes (the origin constant is untouched; the anchor is built from it).
- ⚠️ **CLAUDE.md §2's Management-API token path is WRONG on this machine.** It says the token is read
  from `~/.supabase/access-token`; that file does not exist (only `telemetry.json` and `traces/`),
  while `npx supabase projects list` authenticates fine. So the documented route for running SQL
  yourself could not be used — worth fixing before the next session relies on it.
- ⚠️ **THE SAME FACT IS STATED SEVEN TIMES ON THE HOME PAGE** (Paul: real, worth fixing, not this
  pass). "We re-ask the same questions four weeks later and show you both" appears in #how card 04,
  #how's closing line, ProofSection's closing paragraph, Pricing's tick 7, Pricing's guarantee band,
  the Guarantee's third deliverable, and four FAQ answers. Each is defensible alone; together the
  claim stops landing. The two cheapest to cut are #how's closing line (the card above already says
  it) and Pricing's tick 7 (the band is directly below it).
- **Pricing's heading lost the number**: "£99, or your money back." → **"Pay once. If the number
  doesn't move, claim it back."** ⛔ The rejected alternative, *"One price, and you can claim it
  back"*, states the refund with **no condition** in the largest type on the section, while
  `/refunds` makes it conditional on the measured number — and that section's own rule is that a
  summary may be shorter, never different. "The number", not "it": at that point the reader has met
  the eyebrow and nothing else, and the thing measured is introduced *below*, in the band.
- ⚠️ **`check-cross-repo-sync.mjs` EXISTS IN BOTH REPOS, EACH READING ACROSS TO THE OTHER — AND I
  UPDATED ONLY ONE.** Deleting market audits (§19, slice 5) removed `MARKET_COOLDOWN_ALLOWANCE` and
  `MARKET_COOLDOWN_MS`; LeadFinderOS's copy dropped those groups in the deletion commit, findable-
  site's did not, so it failed **2 of 7 against a file that was correct**. The drift the pair exists
  to catch, in the pair itself. **Change one, change the other.**
- ⚠️ **StatsBand, WhatWeDo and therefore ImageSlot render on NO page in this repo.** `index.astro`
  said StatsBand "lives at /research" and `Guarantee.astro` said ImageSlot was "still used by
  StatsBand and WhatWeDo" — true of the imports, false about the site: `research.astro` writes its
  own content. Both comments corrected. `WhyThisWorks.astro` also named a wave at the foot of #how
  that has not existed since 2026-08-20.

---


---

> Moved from CLAUDE.md §28 on 2026-09-16. Verbatim. Cross-references (§N) use the ORIGINAL CLAUDE.md numbering — `docs/INDEX.md` maps them.

## 28. ✅ findable-site CREDIBILITY PASS — the control claims are gone (2026-09-15)

**Three sentences on the site claimed we control an engine's output. All three are gone, and they
were the same shape: a correlation stated as a cause.** Deployed (master `e8b1a15`, `npm run deploy`
— no CI), verified live on **/** and **/research/** by rendered text.

| Was | Now |
|---|---|
| Hero: *"Findable makes sure the name it gives is yours"* | *"helps make your business one of the names AI can confidently recommend"* |
| *"Write the page and the fallback stops being necessary: you go from absent to named"* | what AI needs, what is patchy, what we strengthen — then the re-measurement carries the claim |
| *"nothing to fail"* (IcpHosting **and** Faq) | *"no traditional servers or databases to hack and nothing to update"* |

- 🔴 **"nothing to fail" WAS PAUL'S DELIBERATE EXCEPTION AND HE REMOVED IT HIMSELF.** §26-era notes
  in two files said "do not soften without asking him" — the 2026-09-15 brief names the phrase, so
  the carve-out is closed. **There is no absolute left standing on the site.** ⚠️ It survived the
  first edit by ten minutes because `Faq.astro` is a SECOND COPY of the same claims, and that
  answer is emitted as **FAQPage JSON-LD** — the absolute was structured data Google reads. Change
  one, change the other.
- ⛔ **"Why AI names someone else" IS NOW "There is no universal AI visibility checklist".** The old
  heading sat over a chain ending "we build the pages that get you named" — a mechanism stated as a
  cause, which the data does not support (a correlation plus one before/after, ABLM 0 → 3 of 18).
  The new framing leads on the finding **nobody else in this category publishes**, over the workflow
  it forces: measure your market, find the gaps, improve what you control, re-measure at four weeks.
  ⚠️ **Those four beats deliberately echo #how's four cards. Do not resolve that by deleting one** —
  #how says what we do in order; these say what the finding forces. The file's header explains it.
- ⛔ **THE EXAMPLE REPORT NO LONGER CREDITS SCHEMA.** Day 0 led with "no structured data" and Week 4
  with "structured data added and validating", beside a visibility rise — while **/research says in
  print that schema made NO measurable difference (35% vs 32%)**. Two of our own pages, one
  contradicting the other. Both lists now lead with pages and consistent business information and
  name technical hygiene **last, as hygiene**. The "Example report · invented business" label also
  moved onto the sheet as a chip rather than living only in the 10px footer.
- **Added:** a four-label strip under the guarantee (**same business / same questions / same engines
  / four weeks later**) so the comparison the refund turns on is legible at a glance — it states the
  existing §19 mechanism and must never grow into a ranking promise; **"Why £99?"** above the pricing
  card (no margins, no internal economics, Paul's rule); the free check's *"Not everyone needs us"*
  lifted out of the dimmest text on the page.
- 🔴 **THE RESEARCH PAGE DESCRIBED A SCAN THAT DOES NOT EXIST.** It read *"a mid-point scan at week
  four, and at week four the same questions re-run"* — two events on one day, one of them not in the
  product. Checked against the code, not guessed: `REMEASURE_OFFSET_DAYS = 28`, baseline day 0,
  replay day 28, **no midpoint**. Phrase removed rather than given an invented date. Also
  "an four-week" → "a four-week" (the same typo survives in `ReportWeek4.astro`'s header COMMENT,
  which renders nowhere — left alone deliberately).
- ⛔ **ONE BRIEF INSTRUCTION DELIBERATELY NOT FOLLOWED, AND IT WAS FACTUAL.** It asked to keep
  628 / 14 trades / 187 towns / 43,035 / "167 of 174" / accountants **"none"**. Those were corrected
  hours earlier (§27) and **"none" is now measurably false — it is 1 of 80**. The brief's own rules
  (source of truth; no accidental number changes) point the other way, so its section-4 STRUCTURE is
  implemented verbatim with the corrected figures. **Flagged to Paul before starting, not after.**
- **QA, all run rather than asserted:** build clean, `check-cross-repo-sync` 10/10, **no horizontal
  scroll at 1440 or 390**, no page JS errors, no broken in-page anchors, free-check form intact,
  every research figure still rendered, and an absolute-claims regex sweep over all seven built
  pages comes back **empty**. Home grew **2.9% desktop / 4.9% mobile** (measured against a stashed
  pre-change build, not estimated).

---

