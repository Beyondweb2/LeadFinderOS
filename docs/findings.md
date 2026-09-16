# Established findings — the measurements (original §5)

*Records moved out of CLAUDE.md on 2026-09-16. CLAUDE.md holds the rules; this holds the story. Sections keep their original numbers and text. Read this when you are about to touch the thing it describes.*

> Moved from CLAUDE.md §5 on 2026-09-16. Verbatim. Cross-references (§N) use the ORIGINAL CLAUDE.md numbering — `docs/INDEX.md` maps them.

## 5. Established findings — what actually works

Facts with numbers. These are measured, and several contradict the older docs.

- **ChatGPT reads directories. Gemini reads businesses' own websites.** Two different levers.
- Across **76 audits**: ChatGPT names the client **~17%** of the time, Gemini **~2.5%**.
- **Being cited is not being named.** ABLM is on Yell's Wisbech page and was named **0 times in 80
  measurements**.
- **Directories are trade-specific, and only citations can tell you which:**
  - Checkatrade — **662 citations across 58 of 59 plumber audits**, and **ZERO** for accountants.
    (Was "657 across 57 of 58"; re-measured live 2026-07-30 — the data grows, so re-read it rather
    than quoting this line. The whole fold: **109 audits, 10,615 citations, 1,275 hosts**; trade
    totals plumber **59**, locksmiths 25, accountant **12**, electrician 12.)
  - Yell works for **both**.
  - Hospitality is **Tripadvisor and Wanderlog**.
- **A business with no website cannot be named by Gemini at all** — it has nothing of theirs to read.
  MK Plumbing: 0/10 on Gemini, 3/3 on ChatGPT via directories.

**TESTED AND NEGATIVE — never present these as levers:**
| Lever | Result |
|---|---|
| Website quality | Firms Gemini names have **WORSE** sites than our clients |
| Schema markup | **35% vs 32%** — no difference |
| Reviews | Three named businesses have **0–1 reviews** |
| Bing Places | **Zero citations across all 10,615** (re-measured 2026-07-30; `bingplaces.com` and `bing.com` appear in NONE of the 1,275 hosts) |

- **The only supported lever:** presence in the sources AI reads **for that trade**, plus **a website where
  there isn't one**.
- ✅ **THE FIRST BEFORE-AND-AFTER WAS MEASURED 2026-08-18, AND IT MOVED: ABLM 0 → 3 of 18.**
  Runs 12–15 (21 Jul, before Paul hand-built town pages on their Wix site) asked 9 questions ×2
  engines four times: **0 named in every answer**. Runs 23+24 (18 Aug, the identical 9 questions
  verbatim) named ABLM **3 of 18** — and all three are **GEMINI**, on the town questions
  (Whittlesey ×1, Chatteris ×2). ChatGPT: still 0 of 9. **This is §5's model confirmed in a
  before/after for the first time: pages on their own site moved the engine that reads their own
  site, and not the one that reads directories.** One measurement of one client — evidence, not
  proof; the wording rules (never promise the outcome) stand unchanged.
  ✅ **INDEPENDENTLY REPRODUCED 2026-09-08 by the before/after fold** (§17), from the raw queue rows:
  21 Jul (6 runs, 9 questions) **0 of 52** vs 18 Aug (4 runs) **3 of 18**, +16.7 points, "improved",
  the three named questions being Whittlesey once and Chatteris twice — matching this note exactly.
  ⚠️ **And each of those three reads `within_noise` on its OWN row while the overall reads improved.**
  That is the intended shape: **the claim lives in the overall figure, never in a single question.**
  ⚠️ Re-run mechanics for next time: `create-ai-audit { audit_id }` re-runs the LATEST run's
  questions verbatim; `{ audit_id, questions }` honours a pasted set verbatim; neither passes the
  question filters. **The operator path hard-caps at WIZARD_MAX_QUESTIONS (5)** — a longer set
  must be split across runs (23+24 was 5+4) or go through the internal baseline branch, which is
  unreachable from outside since the key rotation. `question_count` cannot raise the cap.
- 🔬 **RG LOCKSMITHS IS THE MIRROR-IMAGE EXPERIMENT — de-stuffing test, baseline locked 2026-08-18.**
  Paying customer, locksmith, Huntingdon. **He was NEVER invisible** (the premise that started this
  was wrong): his paid baseline (audit `f64920ce`, 11 Aug, 3 runs, 12 questions ×2 engines) is
  **8/24 named per run ≈ 33%, stable** — but the split is the EXACT INVERSE of ABLM:
  | | Baseline (11 Aug 2026) |
  |---|---|
  | **ChatGPT** (directories) | 20 of 36 — 6–7/12 per run, his home-town directory strength |
  | **GEMINI** (own site) | **3 of 36 — 1/12 every run, and ALWAYS the same one question, "best locksmiths in Huntingdon UK"** (a generic "best" query, arguably directory-fed) |
  - ⛔ **THE LINE TO BEAT IS 3/36 GEMINI, AND SUCCESS NEEDS A NEW DISTINCT QUESTION.** Gemini names
    him on ZERO service+town queries (lock changes Cambridge, emergency lockouts St Neots, upvc
    Huntingdon, …) — exactly what his town pages target. A post-rewrite Gemini rise that is still
    only "best locksmiths Huntingdon" does NOT count; a service+town query naming him does.
  - **The experiment:** RG's site (WordPress/Elementor, 20i-hosted) ALREADY has ~30 town pages
    (5 per town: locksmith / locksmith-services / lock-repairs / lock-replacements /
    emergency-locksmith), published 2025-10 — so they PREDATE the baseline. They are **keyword-
    stuffed doorway duplicates**: Huntingdon and Cambridge pages are byte-identical 333-word
    templates with the town swapped, "locksmith(s)" at 5.7% density, and there was a **Camborne
    (Cornwall) page** proving template-spinning. Paul is REWRITING them in place (keep Elementor
    layout, ABLM-natural honest copy), leaving 5 pages/town for now — de-stuffing is the cheap
    change tested first; **consolidating each town's 5 pages into 1 is the NEXT experiment if
    Gemini doesn't move.** Contrast with ABLM, whose natural pages moved Gemini 0→3.
  - ⏱️ **RE-MEASURE ON PAUL'S WORD, ~2–3 weeks out (early Sep 2026), IDENTICAL 12-question set**
    (run 1's questions, split 5+5+2 across runs — operator cap is 5). He purges his site cache and
    diarises it. This is the first controlled single-variable test the product has: same pages,
    same layout, only the copy quality changes.

---

