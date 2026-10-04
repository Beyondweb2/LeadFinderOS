# AI Delivery Certification — Session C

- **Session / date (UK):** C (AI delivery), Sunday 4 October 2026, 06:00–06:40 UTC.
- **Stages owned:** J21 Discovery · J22 question generation, selection, approval · J23 baseline, results · J27 delivery lifecycle (AI side) · J28 re-measurement readiness.
- **Release audited:** `main` at `c0e85078` (the same release Sessions A and B audited). Worktree `C:/Users/paulj/LeadFinderOS-wt/cert-c`, branch `cert/c-delivery-ai`. No product code changed, nothing deployed, nothing merged.
- **Accounts:** Paul (admin, the data account) through a magic-link session, used only for the C1 fixture's paid-baseline actions and read-only hub reads, then signed out (scope=local). No salesperson account was needed.
- **Fixture:** `ZZ QA-C1 Baseline` — lead `1c000000-0000-4000-8000-0000000000c1`, onboarding `1c000000-0000-4000-8000-0000000000f1` (hand-made, see "Journey tested"), baseline audit `de52662c-635f-413f-87c0-c42af1241851` (`findable.live/r/pfqmdq`). Excluded before use, no phone, no lead email, onboarding email `paul@move37.fun`, no website. Only one fixture was needed (C2/C3 unused).
- **Spend:** **Apify $0.81** for the one controlled baseline (Apify's own counter $28.0531 → $28.8633 between 06:11 and 06:26 UTC; the only audit created in that window was C1's). Our ledger (`enrichment_usage` / `actor_cost_usd`) recorded **$0.6125** for the same work (60 searches $0.624 − corrections $0.0115) — see C-33. **OpenAI ≈ $0.30** (estimate: five Discovery question-writing calls plus gpt-4o competitor cleaning on three runs with retries; not recorded in the ledger, C-29). Discovery run: not pressed ($1.43 estimate avoided). Discovery crawl: 0 of 2. Hook audits: 0. Places: 0. Certification Apify total so far: Session A ≈ $0.08 + Session C $0.81 = **≈ $0.89 of the $3 cap**; account now at **$28.86 of $40 (72%)**, under the 80% stop line.
- **How things were read:** Management API SQL (read-only on real rows), the edge functions as the admin user, the live report and Welcome Pack as public pages, and code. **Nobody has looked at a screen** — the operator screens were assessed from their source and API responses.

---

## Executive verdict

# READY WITH FIXES

**The measuring machine is sound. The question-writing machine is not yet good enough to send to a client without Paul rewriting it.**

What works and can be trusted:
- The 20 × 3 × 2 method **executes correctly end to end** on today's code: I ran one controlled baseline on C1 and got **120 of 120 answers** (20 questions × 3 runs × 2 engines, 0 failed), every run asking exactly the frozen 20. Engines, runs, questions, citations and competitors are stored separately and never overwrite each other.
- **The freeze is real.** Once approved, every edit path I tried was refused (save, regenerate, Discovery, reopen-after-start), and the four-week re-measure replays the asked questions verbatim, enforced by database triggers and a one-replay-per-lead index.
- **The numbers on the client documents are right.** I recomputed MCLocksmiths' live report and Welcome Pack from the 120 stored answers: 39 of 120 (32.5% → "33%"), ChatGPT 38/60, Gemini 1/60, "15 sometimes / 5 never / 14 one-tool-only" — every figure reproduces exactly.
- **The client-facing wording is honest**: no guaranteed recommendations, no rankings, "named" kept separate from "cited", a clear "nobody can guarantee a particular AI tool will recommend you" box.

What stops a plain READY:
1. **The questions themselves.** The system writes SEO keyword strings ("mortice lock replacement in whitstable uk"), not things a customer asks an AI. Its recommended 20 for C1 had **no plain "locksmith in Canterbury" question at all**, spent 11 of 20 slots on a 5-services × 4-towns grid, covered 5 of 15 services, and showed **zero warnings**.
2. **It can measure a service the business does not offer.** Discovery wrote "car keys and auto locksmith in Canterbury UK" for a locksmith who explicitly does not do car keys; nothing flagged it, and approval seeded it into the client's improvement backlog. MCLocksmiths' real frozen baseline contains the same kind of question ("Who offers auto locksmith services in Canterbury?").
3. **Failure is invisible.** A baseline that gives up (for example when Apify hits its monthly cap) shows "Baseline running" for ever and never appears in "Needs attention"; a held four-week result is never sent later; one click on the re-measure date can silently cancel a client's re-measure.
4. **A real paying client's only re-measure is about to be spent on the wrong questions** (Ronnie, 13 October — the one P0, below).

If a real client pays today, Paul gets a trustworthy measurement **of whatever 20 questions he approves** — so the delivery is only as good as his editing of the draft. With the question fixes (C-02 to C-05) and the failure and re-measure fixes (C-09 to C-12), it becomes something he can approve with a light touch.

**Counts:** 1 P0 (an existing client, dated) · 14 P1 · 19 P2.

---

## QA truth set / business used

I needed a business with enough confirmed facts to catch invented services and wrong towns, without crawling or contacting anyone. I used **MCLocksmiths' client-confirmed facts**, read from our own database and records (never its website), on a fixture with a QA name, no contact details and no website.

| Fact | Truth (source) |
|---|---|
| Trade / home town | Locksmith, Canterbury (MCL onboarding `confirmed_location`, lead) |
| Services the client confirmed (15) | Emergency lockouts · Non-destructive entry · Lock changes and upgrades · Mortice lock replacement · Snapped key extraction · High-security anti-snap cylinder upgrades · Keyed-alike systems · Burglary repair and make safe · Security surveys · uPVC door and window lock repairs · Garage door locks · Key cutting · Safe opening · Key safe installation · Commercial locksmith services (MCL onboarding `services_list`) |
| Services explicitly **not** offered | Car keys / auto locksmith (referral only), bollards, glass replacement, walk-in key cutting, roller doors, door replacement, fascias (Morgan's corrections call, 23 Sep 2026). Note: "Key cutting" is on his confirmed list but "walk-in key cutting" is on his not-offered list — even the truth set is ambiguous on that one. |
| Service areas | **None confirmed by the client** (MCL `areas_list` is empty). His own published coverage line names Whitstable, Herne Bay, Faversham and "East Kent"; I gave C1 exactly those three as approved areas, so the area logic could be tested. Dover, Ramsgate, Broadstairs, Ashford and Sittingbourne are **unconfirmed** (not "not served"). |
| Name | Fixture name `ZZ QA-C1 Baseline` — judgeable, never in any AI answer, so C1 scores 0 named by construction. Naming accuracy was validated on MCL's real stored answers instead. |

Real outputs read **read-only** (nothing written, nothing re-run): MCLocksmiths' frozen baseline `50880751` (the only baseline on the current 20 × 3 method), its live report and Welcome Pack; BS4 Electrical's Discovery pool, Discovery audit `ef764f55` and draft 20; Ronnie's legacy baseline `1a0603aa`; three recent sales (hook) reports read with `preview=1`.

---

## Journey tested

1. Fixture created: exclusion row first, then the lead (`not_contacted`, holder Test, owner the data account).
2. **Onboarding row made by hand** (README §4.2 allows it) with `plan_tier = new_site`, Canterbury, the 15 services, no areas. I did not go through Quick Close: its Build path cannot complete normally (Session A/B finding B-01), and C does not own that stage.
3. `qa-simulate-payment.ts --lead …c1 --times 1` → HTTP 200. Lead `payment_received`, £99, `contract_total_payments 12`, one ledger row (`test_excluded`, 0%), one History row, one notification, one agreement acceptance, **0 WhatsApp**. Onboarding `paid`, baseline `needs_questions`. Payment started nothing else (correct).
4. As admin, `paid-baseline get`: context = 15 services, all sourced "onboarding", no detected services, no areas, no Hook audit.
5. **Discovery generate, round 1** (home town only) → 18 questions.
6. **Save client context** with areas Whitstable, Herne Bay, Faversham → **Discovery generate, round 2** → 34 questions.
7. **Discovery run NOT pressed** (estimate shown: $1.43). Kept the certification inside its Apify cap; the selection then runs on "balance only", which the system allows and labels "20 not measured yet".
8. **Generate recommended baseline** → 20-question draft (all Discovery, no Hook).
9. Approval guards: 19 questions → refused; a near-duplicate → refused; a **branded question → saved and approved with no warning**; then save / regenerate / Discovery after approval → all refused; reopen with a 1-letter reason → refused; reopen with a written reason → reopened, history kept; re-approved the **recommended 20 exactly as the system wrote them** (no rewording to improve scores).
10. **Run** → baseline audit created, pointer claimed; a second Run press → `already_started`, no second audit. While running: Save context → no-op (location stayed Canterbury), reopen → refused, Discovery run → no-op.
11. Baseline measured to completion: run 1 started 06:14:40, run 2 06:17:52, run 3 06:21:22 (the 3-minute stagger), frozen at **06:25:37** — 11 minutes from Run to frozen. All three runs `complete`, 20/20 questions done each, 0 failed, 0 dropped. Competitor cleaning hit OpenAI's 30k tokens/minute gpt-4o limit and **gave up on runs 1 and 3** after 4 attempts (29 and 5 of 53 items cleaned); run 2 cleaned fully.
12. Read back: the 120 cells, the hub's figure, the report (`preview=1`), the Welcome Pack, the re-measure date, the backlog, the rebuild context.
13. Cleanup (bottom of this file).

---

## P0 — Launch blockers

### C-01 · P0 (existing client, dated) · Ronnie's one and only re-measure will be spent on three wrong-category locksmith questions on 13 October

- **What happens:** `fireDueRemeasures` replays the baseline audit's **run 1** asked set (`_shared/audit-baseline.ts:681-692`). Ronnie's baseline `1a0603aa` is a legacy 5-run audit whose **run 1 asked "top rated Locksmiths in Halifax UK", "best Locksmiths in Halifax UK" and "which Locksmiths in Halifax UK do people recommend"** — the wrong category, later replaced in runs 2–5 by shoe-repair and watch-battery questions. His lead is `payment_received`, not archived, not terminated, `remeasure_due_date = 2026-10-13`, baseline frozen 18 Aug — every condition of the replay picker is met (`audit-baseline.ts:640-652`, checked live).
- **Why it is destructive:** the database allows **one remeasure per lead, ever** (`uq_ai_audits_one_remeasure_per_lead`, live) and the pointer is immutable once claimed (`trg_outreach_leads_remeasure_pointer_immutable`, live). On 13 Oct the cron will measure three locksmith questions × 3 runs (~$0.13), claim the slot, and compare them against an 18-question before side. Nothing goes to Ronnie automatically (his results are held — no contract on the row), but his genuine four-week before-and-after can then never be produced by the system.
- **Known before?** Partly. `docs/baseline-workflow.md` records "his replay will ask run 1's 3 questions against an 18-question before side. Paul's decision." It does not say that run 1 is the **wrong-category** set.
- **Not fixed** (the protocol forbids touching a paid client's measurement or dates). **Paul must decide before 13 October.** Options for the fix session: hold Ronnie's date, or make the replay read an explicitly chosen question set for legacy multi-set baselines.
- **New clients are not affected:** a baseline approved through today's flow has one 20-question set repeated in all three runs (proved on C1 below).

**No other P0.** No real message, payment, crawl of a real site or duplicate spend happened. No path was found that lets a frozen question set drift for a new client.

---

## P1 — Fix before rollout

| ID | Stage | Finding (one sentence) | Evidence | Failure scenario | Suggested fix (not applied) |
|---|---|---|---|---|---|
| **C-02** | J22 | **Candidate and recommended questions are SEO keyword strings, not customer questions.** | C1's 34-question pool and recommended 20: "mortice lock replacement in whitstable uk", "keyed-alike systems locksmith in canterbury uk", "high-security anti-snap cylinder upgrades Locksmiths in Canterbury UK". BS4's stored pool/draft: "fuse board upgrades Electricians in Nailsea UK". Hook questions: "roof repair in Doncaster UK", "plumber in Halifax UK who actually turns up". The prompt asks for "the exact search phrases… short, terse, plain lowercase" and "ALWAYS write the place EXACTLY as '<town> UK'" (`create-ai-audit/index.ts:1957-1964, 2015`); fallback templates `${nk} ${t}${where}` / `best ${t}${where}` (`:319-320`); Discovery appends `${trade} in ${t} UK` (`_shared/baseline-discovery.ts:110`). Contrast MCL's hand-curated frozen set: "Who can help if I'm locked out of my house in Canterbury?" | People ask ChatGPT and Gemini full questions. A baseline of keyword strings measures search-engine behaviour, reads as robotic in the client's report ("Question by question…" lists every string), and undersells the product. | Ask the generator for questions a customer would type into ChatGPT ("Who can…", "Can you recommend…", "I'm locked out in…"), keep the town in natural form (append "UK" only where the town name is ambiguous), and stop the template refill from producing "X Electricians in Y UK". |
| **C-03** | J22 | **The recommended 20 is not balanced in practice: it misses the core query, repeats a services × towns grid, and its explanations are wrong.** | C1 draft (table below): **no "locksmith in Canterbury" / "recommend a locksmith" question**; 4 × Non-destructive entry, 4 × Emergency lockouts, 3 × Mortice, 3 × Lock changes, 3 × "burglary repair services in <town>"; **5 of 15 services**; 11 of 20 are the same few services repeated across towns. The classifier labels any question whose service it cannot match as "broad" (`baselineMix.ts:120-122`): 9 of 18 (round 1) and 16 of 34 (round 2) "broad" questions were really service questions, so "burglary repair services in faversham uk" is explained to Paul as **"Broad / core business: core locksmiths query in Faversham"** (`baselineRecommendation.ts:116-121`), and the plain "locksmith in <area>" question is never added because the town already "has a broad question" (`baseline-discovery.ts:104-111`). Coverage warnings: **none** (`warnings: []`). | Paul trusts the green screen and freezes a measuring stick that leaves out the question customers ask most and over-weights niche jargon; the client's before-and-after is judged on it for ever. | Make the core "<trade> in <home town>" and "recommend a <trade> in <home town>" questions mandatory slots; match services by meaning (burglary repair = "Burglary repair and make safe", key duplication = "Key cutting"); cap any one service at 2 and any one service across towns at 2; warn when fewer than half the services are covered; never call a question "core" unless it is the plain trade question. |
| **C-04** | J21–J22 | **Discovery can propose a service the business does not offer, and nothing in selection, approval or the backlog stops it.** | C1 round 2: **"car keys and auto locksmith in Canterbury UK"** — not on the 15 confirmed services, explicitly not offered (truth set). Labelled `broad`, service `null`, kept eligible (`baselineMix.ts:120-122`); the only guard is the prompt sentence "NEVER invent a service" (`create-ai-audit:1958`). On approval it was **seeded into the client's Opportunity Backlog as a "useful" future opportunity** (`client_opportunities`, C1). MCL's real frozen baseline contains "Who offers auto locksmith services in Canterbury?". `must_not_say` is never read by Discovery or the generator. | A refund is judged partly on a service the client does not sell; the backlog then nudges future monthly work (a new page each month) towards it — a page about car keys for a locksmith who refers car keys elsewhere. | Refuse (or flag red, blocking approval without a typed reason) any question whose service does not match a confirmed service; feed `must_not_say` and an explicit "services you do NOT offer" answer into the generator and the filter; never seed the backlog with an unmatched-service question. |
| **C-05** | J22 | **Approval has no content checks: a branded question, an unconfirmed service or a rep-edited Hook question all freeze without a warning.** | Live on C1: a draft containing "is ZZ QA-C1 Baseline a good locksmith in Canterbury" was **saved with `warnings: []` and approved** (HTTP 200). Approval checks only count, context, near-duplicates and Hook removal (`paid-baseline/index.ts:458-493`). Sales-edited Hook questions are locked in after only a length/blank check (`hookQuestionEdit.ts:17-31`, `baselineRecommendation.ts:155-160`). | A branded question is answered "yes, X is a locksmith in Canterbury" almost every time — an easy question that flatters the starting score, or a rep's mistyped Hook question becomes part of the guarantee. | Add three blocking checks at approve: contains the business name; service not in the confirmed list; no approved town (already shown, not blocking). Allow override only with a typed reason stored on `baseline_meta`, like the Hook rule. |
| **C-06** | J10 / J23 | **The sales (hook) report puts the £99 guarantee sentence directly under a 3-question score and says "we ask the same questions again".** | Live reports read with `preview=1`: "17 % of AI answers named The Doncaster Roofing Company · 1 of 6 answers · 3 questions" … "If that number has not gone up, email us within 14 days of your results and we'll refund your £99." Footer: "After we make changes we ask the same questions again to show your before and after." (`aiAuditReportHtml.ts:2418, 2431`). The guarantee is judged on the 20-question baseline, not this number. The report does say "This is a quick check of 3 questions, not your full AI visibility measurement." | A prospect who later disputes a refund points at the 17% on the report they were sold with — "that number" on the page is the hook score. | On the hook report, say "Your guarantee is judged on a full 20-question measurement we run after you join — if that number has not gone up…", keeping `REMEASURE_CLAIM_SENTENCE` byte-locked after it; drop "the same questions" from the hook footer. |
| **C-07** | J21 | **The client questionnaire promises one page per service per town.** | findable-site `OnboardingFlow.tsx:3393` (and origin/master `:3661`), mirrored in `manualOnboarding.ts` `q2.sub`: "Each service becomes its own page on your site, written the way people search — **one per town you want work from**." The Welcome Pack says "Location pages only where there is real local information to give. No cloned town pages." | The client is promised exactly the mass-location-page approach the method rejects; later they ask where their 60 town pages are. | Reword: "Each main service gets its own clear page. The towns you list tell us where to measure you and where real local pages make sense." Change both repos (the sync check covers the mirror). |
| **C-08** | J21 | **Services and areas have several sources of truth, so a client's removal does not stick and Section A cannot delete anything.** | `mergeClientContext` concatenates onboarding + build facts + `lead.services_included` + the newest Discovery audit's `specialism`, and areas from onboarding + build facts + `lead.service_areas` (`src/lib/clientContext.ts:135-145`), contradicting "lists are never merged" (`clientFacts.ts:96-105`). Discovery audits store the merged list as `specialism` (`create-ai-audit:1387`) and it is re-merged on the next read. Save context writes the merged lists back as if the client said them (`paid-baseline/index.ts:299-309`). Generate / Discovery generate read only the stored context, so unsaved Section A edits are ignored (`ClientHub.tsx:207-210`). | Sales typed "Weston" on the lead; the client unticked it. Discovery still writes Weston questions; the recommendation freezes some; the refund is judged on a town the client removed. | One rule: the highest-ranked list wins whole (the clientFacts rule) for Discovery and the baseline; Discovery's `specialism` never feeds back in; Generate saves a dirty Section A first. |
| **C-09** | J28 | **One click on the re-measure date can cancel a client's re-measure silently.** | `LeadDeliveryCockpit.tsx:189` uses `<Calendar mode="single" onSelect={setRemeasureDue}>` without `required`; react-day-picker 8.10.1 passes `undefined` when the selected day is clicked again, and `:126-128` writes `remeasure_due_date: null`. No DB guard (only the pointer triggers exist). The date is filled only once, at the freeze (`audit-baseline.ts:488-492`); `fireDueRemeasures` needs a date; the overdue alert needs a date (`adminMetrics.ts:937`). The same panel labels it "Re-measure due (8 wks)". | Paul opens a client, re-clicks the date to check it: the date clears, no replay ever fires, no alert ever shows, the guarantee window is missed. | `required` on the Calendar; refuse a null write for a lead with a frozen baseline; fix the "(8 wks)" label. |
| **C-10** | J28 | **A held four-week result is never sent later, and there is no "send now" path.** | `REMEASURE_RESULTS_COPY_APPROVED = false` (`remeasureResults.ts:38`). `maybeSendRemeasureResults` has one caller, the moment a replay run finishes (`process-ai-audit-queue/index.ts:1345, 1464-1471`); every hold is final; nothing else writes `remeasure_results_sent_at`, and without it the client's `/results` link answers "unavailable" (`render-remeasure-results/index.ts:53`). | Every client whose re-measure completes before the copy is approved never gets an automatic result, even after approval; Paul must write each by hand and the client link never opens. | A sweep for completed, unsent, now-sendable replays, plus an operator "Send results" button using the same claim. Approve the copy before the first new client's day 28. |
| **C-11** | J23 / J27 | **A baseline that fails part-way is invisible: it shows "Baseline running" for ever, partial and capped runs count as baseline runs, and nothing can retry one part.** | `advanceBaseline` gives up after target + `MAX_EXTRA_ATTEMPTS` and records it only inside the run's JSON (`audit-baseline.ts` ~304-312); nothing writes `baseline_status = 'failed'`; `deliveryStage.ts:146` keeps "Baseline running" with `action:false`, which `matchesFilter('attention')` excludes (`:170`). A run is `complete` unless every question failed (`_shared/run-finalise.ts:44-49`), and a `capped` run is usable (`audit-baseline.ts:245`). No per-question retry exists. Live history: 344 runs failed between 22 Aug and 17 Sep, **317 of them on 3 Sep**, every sampled one "Apify start … HTTP 402" (or 403) — Apify refusing at its cap. | Apify reaches 100% (README §9 says it is at 70% today) mid-baseline: the runs fail, the chain gives up, Paid Clients keeps saying "Baseline running", the re-measure clock never starts, and nobody is told. | Write a `failed` state with the reason; put it in Needs attention; require 20 × 2 answered cells per counted run (or say "19 of 20 answered" everywhere); add "re-run failed questions" for the missing cells only. |
| **C-12** | J28 | **The before/after verdict compares totals over all questions and all runs, pools the two engines, and never checks they are balanced.** | `compareMeasurements` takes `view.namedCells / view.answeredCells` over every question on each side (`measurementCompare.ts:219-223, 383-396`); the before side reads every run of the baseline audit (`remeasure-results.ts:104-110`), not the frozen three; failed cells are dropped; no per-engine check. | Gemini drops out on part of the replay: the after side leans to ChatGPT (which names businesses ~3× more often), crosses the 5-point band, the client reads "Your number has gone up" and loses a refund they were owed. Normal case (three complete runs, same 20, both engines) is correct. | Compare matched questions answered on both sides only; refuse a verdict (hold) when either engine has fewer than N answers on either side; read the frozen three runs only. |
| **C-13** | J24–J25 data | **What the salesperson promised never reaches the build or the Optimise work, and Optimise has no brief.** | `sales_handoff.client_wants / promised / why_bought` are read only by the setup card and readiness (`salesHandoff.ts:56-63`); `rebuild_context`, `buildFacts.ts`, `websiteBuildPrompt.ts` and the page generator never load them. `standout` is no longer asked, so differentiators reach the build only via accreditations/crawl. For Optimise, "Optimise their site and mark it live" opens a section that offers only rebuild routes; baseline gaps, do-not-break URLs and crawl findings are assembled only inside the rebuild prompt (`websiteBuildPrompt.ts:41-160`). Directory work is promised in the pack but the hub's stage 3 is placeholder text (`ClientHub.tsx:645`). | A rep promises "a page for emergency callouts in Bath"; nothing on the build side shows it. An Optimise operator has no single page of priorities. | Put the handoff's "promised" and "client wants" into the build prompt and the Welcome Pack check; give Optimise a one-page brief from the same evidence the rebuild prompt uses. |
| **C-14** | Cost | **The Apify monthly cap cannot carry the planned client volume.** | Cap $40 (`apify_account_usage`), $28.05 used on 4 Oct with 12 days left. Per new client: Discovery run ≈ $1.4–2.0 (34–49 questions × 3 × `DISCOVERY_USD_PER_QUESTION_RUN` $0.014), baseline ≈ $0.6–0.85 (C1: $0.81 on Apify's own counter), re-measure the same again. Prospecting hook audits alone run ~30 a day. The same baseline's competitor cleaning hit OpenAI's 30k tokens/min gpt-4o limit on run 1 (`competitor_cleaning.errors`, C1). | At 2 clients a day the cap is exhausted within days; at 100% every audit, baseline and re-measure stops together (CLAUDE.md §4) and C-11 then hides it. | Paul to set the cap from a per-client budget (≈ $3–4 in month one) plus prospecting; raise the OpenAI rate tier or stagger cleaning. |
| **C-15** | J19 / J23 | **"Add paid client" on an existing lead overwrites a real client's money record and unfreezes its baseline status.** | `paid-client-hub/index.ts:815-857` (`create_manual`): the match list does not exclude already-paid leads (`:279-286`); on a match it overwrites `amount_paid`, `payment_date`, `status:'in_delivery'`, `category = services[0]`, `website_route` (default `optimise_existing`), `gbp_consent:'discuss'`, and writes **`baseline_status:'needs_questions'`** onto the existing paid onboarding row. The form defaults the amount to '49.99' (`PaidClients.tsx:29`). | Paul adds a client he thinks is missing and picks the suggested match: their £99 becomes £49.99, a Build client flips to Optimise, and the frozen set can be re-generated in the hub. (The day-28 replay itself stays safe — it reads the pointer audit, not `baseline_questions`.) | Exclude paid leads from matching, or refuse `create_manual` on a lead with `amount_paid > 0`; never write `baseline_status` on an existing row; drop the 49.99 default. |

## P2 — Improvements

| ID | Finding | Evidence |
|---|---|---|
| C-16 | Competitor names are not de-duplicated across variants, and the client can appear as its own competitor. | MCL: 121 distinct strings; "lockfit canterbury" / "lockfit canterbury locksmiths", "keytek" / "keytek locksmiths"; **"mc locksmiths" listed 7 times as a rival** (self check is a substring match on "MCLocksmiths centre", `extract-competitors/index.ts:128`). Feeds the rebuild prompt's "Competitors that actually appeared" list (`websiteBuildPrompt.ts:101-106`). |
| C-17 | Competitor cleaning is fragile under load — one baseline on its own trips the OpenAI rate limit. | C1: `openai_http_429 … gpt-4o … Limit 30000` on runs 1 and 3; both **gave up after 4 attempts** (29 and 5 of 53 items cleaned), run 3 left 6 cells with no competitors and 4 with no `self_named`; runs were held `pending` between retries (`RETRY_CLEAN_SPACING_MS` 4 min), so the freeze waited. Names were still shown (`namesWithheld false`). MCL run 2 has 9 + 9 cells with `self_named` null from the same cause. With two clients a day plus prospecting this will be the normal state. |
| C-18 | Citations are stored raw (tracking parameters, `www`/non-`www` duplicates) and cleaned only at read time; `.org` is still graded "authority". | MCL ChatGPT: `mc-locksmiths.com/?utm_source=chatgpt.com` and `www.mc-locksmiths.com/?utm_source=…` in one answer. `sourceType.ts:63` (Gemini's most-cited MCL source is `lockrite.org`, a locksmith firm). Internal surfaces only. |
| C-19 | After a reopen, a question can sit in both the frozen guarantee set and the "never in the guarantee" backlog. | C1: "emergency lockout service in whitstable uk" is in `baseline_questions` and in `client_opportunities` (seeded by the first approval, never removed — seeding is additive only, `paid-baseline:509-535`). |
| C-20 | The stage machine lets Discovery and the baseline start before setup is complete, and asks for a Discovery run the flow does not require. | C1 ran a full baseline while its setup said "WAITING FOR INFORMATION · Sales handoff — 6 answers missing" (hub `get`). `deliveryStage.ts:146-153` derive Discovery/baseline before setup; "Run Discovery" is the next step whenever a pool exists, although Generate works without a run. "Remeasure done — send results" shows as soon as the replay starts (`:136`). |
| C-21 | Monthly update ignores name judgeability and calls a one-answer difference "more"/"fewer". | `monthlyUpdate.ts:79-88, 101`; `weeklyCheck.ts:95-116` has no `nameIsJudgeable`. Otherwise honest: stored evidence only, "separate from the re-measurement your guarantee is judged on", operator-written work items, sent rows locked. |
| C-22 | Small selection items. | "24 hour locksmith" is not classed as urgent (`baselineMix.ts` EMERGENCY regex has `24/7`, not "24 hour"); near-duplicate synonyms cover electrician/plumber/locksmith words only (`baselineMix.ts:35-62`); a question already named in every answer on both engines is excluded as "no room to improve" (`baselineRecommendation.ts:126`) — Paul's standing rule, but it removes questions that can only fall, which slightly favours "improved". |
| C-23 | Opportunity "check" has no start claim. | `paid-baseline/index.ts:239-262` (a double press could start two paid checks; Discovery run has a proper claim at `:367-385`). |
| C-24 | Run-pooling differs by surface. | Report and Welcome Pack pool every run of the baseline audit; the hub uses the first three complete runs (`paid-client-hub/index.ts:35-55`). Identical for every baseline today; diverges only when a retry run exists. |
| C-25 | The pointer triggers and the one-replay index live only in the database. | `claim_*_pointer`, `guard_*_immutable`, `uq_ai_audits_one_remeasure_per_lead` are live but in no migration (only `SQL_FOR_PAUL_baseline_pointer.sql`). A rebuild from migrations loses the one-replay guarantee. |
| C-26 | Server lets legacy baseline rows be regenerated. | `baseline_status` null → `needs_questions` (`paidBaselineState.ts:34-40`); `paid-baseline` never checks `lead.baseline_audit_id` before generate/save/approve. The hub hides the button for RG/Ronnie; the server does not refuse. Replay stays safe (pointer). |
| C-27 | Hook report precision and naming. | "17 %" printed for 1 of 6 answers; hook report says "Google AI", the baseline says "Gemini" for the same engine. |
| C-28 | The draft results email claims cause. | "The pages and listings we built are what the engines are now reading." (`remeasureResults.ts:246-286`, gone-up branch) — not something the data shows. Fix before Paul approves the copy. |
| C-29 | Spend tracking misses OpenAI. | `enrichment_usage` recorded the Apify rows for C1 but nothing for the five Discovery question-writing calls or the gpt-4o cleaning ($0.089 on run 1 alone, stored only in the run JSON). |
| C-30 | Stale docs that will mislead the next session. | CLAUDE.md §8 says `run_number` has no unique index — `uq_ai_audit_runs_audit_run_number` exists live; CLAUDE.md §1 "Named = the model's verdict" — the answer TEXT is now first (`namedSignal.ts:18-28`); "RG is due 2026-10-06 — approve before then" — RG is refunded and the replay picker excludes refunded leads, so it will not fire. |
| C-31 | A done row with an empty engine answer would count as "answered, not named". | `ai-search.ts:342-381` emits a block with empty text; `auditReport.ts:959-965`, `baselineView.ts:174-177` count it. **0 such cells in 60 days (12,950 checked)**, so theoretical today. |
| C-32 | The model's own "named" verdict is unreliable, and some internal surfaces still trust it first. | Measured live: for `ZZ QA-C1 Baseline` (exists nowhere) gpt-4o set `self_named = true` on **4 of 120** answers; on MCL it disagreed with the answer text on 9 of 120 (text right each time I checked). Client documents and the refund comparison use the answer text for judgeable names (`namedSignal.ts`, `remeasure-results.ts:108-114`) — safe. Still model-first (`cellNamed` with no context): the frozen snapshot (`audit-baseline.ts:108` → C1 `named_rate 0.0333`), each run's `mention_rate` (C1 run 1 = 5%), the page generator's per-question "already named" signal (`page-generator/index.ts:463-465`), the hook state machine and "Gemini named all three" (`hookAudit.ts:197, 237-241`), market view, the AI Audit page (`pooledRuns.ts:112`). For a name that is only trade + town (13% of leads) the model IS the ruler, with an error rate about the size of the 5-point noise band. |
| C-33 | Our spend ledger under-records Apify by about a quarter. | C1's baseline: Apify's own counter +$0.810; `enrichment_usage` / `actor_cost_usd` $0.6125 (−24%). The per-question ledger rate (`AI_SEARCH_USD_PER_QUESTION` $0.0104) predates the $0.0139 observed billed rate already used for the Discovery estimate. Dashboards and budget guards built on the ledger understate real spend (CLAUDE.md §4: "a rate copied from a price list is a guess until a billed row agrees"). |
| C-34 | A paying client's baseline report still carries the sales call-to-action. | C1 and MCL baseline reports (also appended to the Welcome Pack): "Want to be one of the names? Request a call · Ask me anything". Harmless but odd for a client who has paid; "Here is what happens next" would fit. |

---

## AI Audit quality (the sales-facing hook audit)

Read: the two hook audits on A1 (Session A), and three recent real hook reports (`preview=1`, no open recorded, no crawl fired — each lead had a fresh crawl).

- **What it is:** 3 questions × 1 run × 2 engines = 6 answers, with a headline percentage, a verdict line, one quoted Google AI answer with the businesses it named, a question grid, and (when crawled) a website line.
- **Correct and supported:** the counts match the stored answers; the rival names are real local businesses; "This is a quick check of 3 questions, not your full AI visibility measurement" is printed; the website line ("No technical faults found… the work here isn't fixing faults") is plain and accurate.
- **Specific and understandable:** yes, for a cold prospect — one screen, plain words, real competitor names.
- **Weaknesses:**
  - The three questions are keyword strings (C-02), and they are later **locked into the paid 20**.
  - A percentage on 6 answers (17%, 33%) overstates precision (C-27).
  - The guarantee sentence sits under the hook score (C-06).
  - It names the engine "Google AI"; the paid baseline calls it "Gemini" (C-27).
  - No generic AI claims presented as fact; no invented services; no overstated visibility.
- **Would Paul show it to a prospect?** Yes — it is a good door-opener. It is not, and does not claim to be, the client's measurement.

**Separation between the sales audit and the paid baseline: sound.** `audit_purpose` is the marker (`audit` / `discovery` / `baseline` / `remeasure`); the baseline pointer is claimed by a trigger on `audit_purpose = 'baseline'` only; the Welcome Pack and hub read only the pointer and refuse a Discovery or hook audit; a Discovery audit is never the baseline (proved by C1: its Discovery pool lives on `onboarding_responses.baseline_discovery`, the baseline is a separate audit with its own 3 runs). The one bridge is deliberate: the hook's 3 questions are locked into the 20 (Paul, 30 Sep). For C1 (no hook audit) the screen said so and built 20 from Discovery.

---

## Discovery question audit

"Discovery" means two different things in this product, and the brief's description (facts about the business) matches the **client-facts questions**, not the code's "Discovery" (the candidate question pool, audited in the next section). Both are covered.

### Client-facts questions (questionnaire, Quick Close handoff, Section A)

"What downstream decision does this answer change?" is the test in the last column.

| QUESTION (exact wording where it is client-facing) | VERDICT | DOWNSTREAM PURPOSE / WHY |
|---|---|---|
| "Your name" | KEEP | Greeting, pack, agreement. |
| "Your email — Where your report goes." | AUTO-FILL | Already known from Quick Close / Stripe payer; ask only if blank. |
| "Your mobile — So we can reach you on WhatsApp…" | AUTO-FILL | Pre-filled from the lead; confirm, don't ask. |
| "Your website (if you have one)" | MERGE | Stored on onboarding **and** the lead; the baseline and Discovery read `lead.website` only (`paid-baseline:149`). One field. |
| "Your business name — As it appears on Google" | MERGE | Pack uses the onboarding name, the baseline and the "named" judgement use `lead.business_name` (`audit-baseline.ts:1043`). A difference silently changes what "named" means. One canonical name, confirmed once. |
| "What you do — One word is plenty" | AUTO-FILL | Known from the lead's category; it decides the generator's trade, the off-trade guard and the named judgement. Confirm only. |
| "Your town" | KEEP | Decides the home town of every baseline question. The single most important answer. |
| "Are we using an existing domain?" | AUTO-FILL | Known from Quick Close for Build closes; ask only when blank. |
| "Does an agency or web company look after your website?" | AUTO-FILL | Known from Quick Close `website_manager`; never for a no-website lead. |
| "Will you be able to get us access to edit it?" / "Can you give us access…" | KEEP | Decides route and money. |
| "Who should we ask? (optional)" | KEEP | Operations only; nothing automated reads it — fine. |
| Permission tick "Yes — complete my Google Business Profile and publish…" | KEEP | Needed for GBP and publishing. |
| "Services you offer — Tap the ones you do. Add anything missing below." | KEEP + REWORD | Drives every question and page. Add **"Untick anything you don't do — we will never measure or write about it."** Store one list (today `services` text and `services_list` both count, `questionnaireComplete.ts`). |
| *(missing)* "Anything you **don't** offer or never want to be found for?" | ADD | Would have stopped "car keys" (C-04). Feed it, with `must_not_say`, to the generator and the filter. |
| *(missing)* "What do customers call you for most?" | ADD | Lets the baseline weight the 2–3 money services instead of spreading 20 questions across 15 services in list order. |
| "Towns you want work from — Optional — We judge the refund on the same questions…" | REWORD | Called optional but required for READY (`handoffReadiness.ts:205-212`); ask "Which towns do you regularly take jobs in? Leave blank if it's just <town>." and accept blank as home-town-only. |
| Section heading "Each service becomes its own page… one per town you want work from." | REWORD | Promises cloned town pages (C-07). |
| Google profile exists / access | KEEP | GBP work and the cover's ask. |
| Google profile verified | REMOVE | Display only. |
| Accreditations | KEEP | Build facts — every one checked before it goes live. |
| Must not say | KEEP | Read by the page generator and build pack; also feed it to Discovery (C-04). |
| Photos | REMOVE (or wire up) | Stored and displayed; the build pack never reads it. |
| Competitor to track | REMOVE (or wire up) | Nothing tracks it; the baseline already finds the real rivals. |
| Postal address | KEEP | Agreement, pages, schema. |
| Platform / willing to migrate | KEEP | Serve gate, checkout. |
| Quick Close: "Are you authorised to make this decision…?" | KEEP | Agreement validity. |
| Quick Close: "Do you own or control the domain name?" / "Who currently manages… the website?" | AUTO-FILL for no-website leads | Session A/B finding; asked of businesses with no site. |
| Quick Close route + three Build consents | KEEP | Money; consents save bug is B-01. |
| Handoff "What are we doing?" | AUTO-FILL | Equals the route. |
| Handoff "Current website situation" | AUTO-FILL | Equals the website manager answer. |
| Handoff "What does the client want?" | KEEP | **Feed it to the build/Optimise brief** (C-13). |
| Handoff "Anything specifically promised?" | KEEP | **Feed it to the build brief and check it against the pack** (C-13). |
| Handoff "Why did they buy / their main concern?" | MERGE | Overlaps "What does the client want?". |
| Handoff "Decision maker" / "Their role" | AUTO-FILL / MERGE | Contact name is already known. |
| Handoff "Anything Paul needs to know?" | KEEP | Free text Paul reads. |
| Section A (Prepare baseline → client context): location, category, services, areas, website | MERGE | A third editor of the same facts that cannot delete a merged value (C-08). |

**Answers collected but never used downstream:** photos, competitor to track, GBP verified, `standout` (no longer asked, still displayed), handoff "client wants / promised / why bought" (displayed only). **Downstream fields taken from elsewhere although the questionnaire knows them:** business name and website (baseline reads the lead), services and areas (merged from sales + Discovery, C-08).

### Is the client-facts questionnaire good enough?
Mostly. Wording is plain, short and answerable by a busy owner; nothing is SEO jargon. It asks a few things already known (AUTO-FILL rows) and misses the two answers that would most improve the baseline: **what you don't do** and **what you're called for most**.

---

## Baseline candidate-question audit (the code's "Discovery" pool)

C1 round 2 pool, 34 questions, generated from Canterbury + 3 approved areas and the 15 confirmed services:

| Group | Count | Verdict |
|---|---|---|
| Emergency lockout × each of 4 towns, + "fast emergency lockout assistance", "best emergency locksmith" (Canterbury) | 6 | Real, high-value intent. One per town is defensible; three Canterbury variants are near-duplicates (one slipped the duplicate check). |
| Non-destructive entry × 4 towns | 4 | **Trade jargon** — customers say "locked out, don't want the door damaged". One at most. |
| Lock changes and upgrades × 4 towns (+ "lock change services in faversham") | 4 | Core service; the per-town copies are grid filler. |
| Mortice lock replacement × 4 towns | 4 | Real service; per-town copies are grid filler. |
| Burglary repair × 4 towns | 4 | Real service (matches "Burglary repair and make safe"), mislabelled "broad". One at most. |
| Keyed-alike, home security, high-security locks, snapped key, mortice "expert", key duplication, lock upgrade, 24 hour, affordable, mobile, reliable-for-lockouts (Canterbury) | 11 | The useful long tail — natural intents, but all keyword strings. |
| **"car keys and auto locksmith in Canterbury UK"** | 1 | **Out of scope — not offered** (C-04). |
| Plain "locksmith(s) in <town>" / "recommend a locksmith in <town>" | **0** | The most important questions are missing (C-03). |

Not covered by any candidate: uPVC door/window lock repair, garage door locks, safe opening, key safe installation, security surveys, commercial locksmith, anti-snap upgrades (as such) — 7 of 15 confirmed services never appear. No town outside the approved four was invented. No branded question was generated. Casing is inconsistent ("in canterbury uk" / "in Herne Bay UK"). With no areas (round 1) the pool was 18 Canterbury-only questions — **no towns are ever inferred without evidence**, which is correct.

BS4's stored pool (49, read-only) shows the same shape: 7 services × 7 towns ("rewiring services in Bath UK", "…Keynsham UK", "…Portishead UK"…), six plain "electricians in <area> UK" added by the broad-question rule, and template artefacts ("fuse board upgrades Electricians in Nailsea UK"). BS4's onboarding services list itself holds crawl-style duplicates ("EICR Bristol", "Landlord EICR Bristol", "House Rewire Bristol"); `canonicalServices` folds them for the generator, but the stored client list is what the pack prints.

---

## Final 20-question audit

### C1 — the system's recommended 20, approved unchanged

| # | QUESTION | INTENT | SERVICE | LOCATION | KEEP / REPLACE | WHY |
|---|---|---|---|---|---|---|
| 1 | burglary repair services in faversham uk | problem | Burglary repair & make safe | Faversham | REPLACE | One of three copies of the same service; explained as "core locksmiths query" (wrong). |
| 2 | burglary repair services in Herne Bay UK | problem | Burglary repair & make safe | Herne Bay | REPLACE | Same intent, another town. |
| 3 | burglary repair service in canterbury uk | problem | Burglary repair & make safe | Canterbury | KEEP (reword) | Keep the home-town one: "Who can make my house secure after a break-in in Canterbury?" |
| 4 | 24 hour locksmith in canterbury uk | urgent | general | Canterbury | KEEP (reword) | Real, high-value. "Is there a 24-hour locksmith in Canterbury?" |
| 5 | keyed-alike systems locksmith in canterbury uk | service | Keyed-alike | Canterbury | REPLACE | Jargon, low demand; a missing core service is worth more. |
| 6 | non-destructive entry locksmith in canterbury uk | service | Non-destructive entry | Canterbury | REPLACE | Jargon; merge into a lockout question. |
| 7 | lock changes and upgrades in canterbury uk | service | Lock changes | Canterbury | KEEP (reword) | Core service. |
| 8 | mortice lock replacement in canterbury uk | service | Mortice | Canterbury | KEEP | Real service, plain enough. |
| 9 | non-destructive entry locksmith in whitstable uk | service + area | Non-destructive entry | Whitstable | REPLACE | Jargon × town. |
| 10 | lock changes and upgrades in Herne Bay UK | service + area | Lock changes | Herne Bay | KEEP | One area version of a core service. |
| 11 | mortice lock replacement in faversham uk | service + area | Mortice | Faversham | REPLACE | Grid filler (3rd mortice). |
| 12 | non-destructive entry locksmith in Herne Bay UK | service + area | Non-destructive entry | Herne Bay | REPLACE | Jargon × town. |
| 13 | lock changes and upgrades in whitstable uk | service + area | Lock changes | Whitstable | REPLACE | Duplicate intent of #10. |
| 14 | mortice lock replacement in whitstable uk | service + area | Mortice | Whitstable | REPLACE | Grid filler. |
| 15 | non-destructive entry locksmith in faversham uk | service + area | Non-destructive entry | Faversham | REPLACE | Jargon × town (4th copy). |
| 16 | emergency lockout services in canterbury uk | urgent | Emergency lockouts | Canterbury | KEEP (reword) | "I'm locked out of my house in Canterbury — who can help?" |
| 17 | best emergency locksmith in canterbury uk | recommendation | Emergency lockouts | Canterbury | KEEP | Recommendation intent; overlaps #16 but different wording intent. |
| 18 | emergency lockout service in faversham uk | urgent + area | Emergency lockouts | Faversham | KEEP | Main service in an approved area. |
| 19 | fast emergency lockout assistance in canterbury uk | urgent | Emergency lockouts | Canterbury | REPLACE | Third Canterbury lockout variant — a near-duplicate the check missed. |
| 20 | emergency lockout service in whitstable uk | urgent + area | Emergency lockouts | Whitstable | KEEP | Main service in an approved area. |

**Tally: KEEP 9 (5 of them reworded), REPLACE 11.** Missing and should be in: "Can you recommend a good locksmith in Canterbury?", "locksmiths in Herne Bay" (broad, per area), uPVC door lock repair, anti-snap lock upgrade, safe opening, key safe installation, commercial locksmith, snapped key extraction, garage door locks.

### MCLocksmiths' real frozen 20 (read-only, for comparison)
Hand-curated on 22 Sep: **natural customer questions** with good intent variety ("Who can help after a break-in in Canterbury?", "Who can upgrade my locks to anti-snap or TS007 locks in Canterbury?"). Two problems: **9 towns with no client-confirmed service areas** (Dover, Ramsgate, Broadstairs, Ashford, Sittingbourne… — ChatGPT itself described MC Locksmiths as covering Dover, so some may be genuine, but nothing on the record confirms them), and **"Who offers auto locksmith services in Canterbury?" — a service the client does not offer**. This is the better style; the generator should write like this.

### Are the final 20 good enough?
**No, not as the system writes them.** The method around them is right (exactly 20, near-duplicate check, frozen, balanced across towns). The content is not: Paul must currently rewrite roughly half of each draft. C-02, C-03, C-04, C-05 fix it.

---

## Operator workflow for reviewing the 20 (from source and API)

- **Obvious what needs approval?** Yes: "4. Official baseline — review", "N / 20 questions", source counts, a Frozen badge once approved (`OfficialBaseline.tsx:53-60`).
- **Can Paul see why each question exists?** Each row shows source (Hook / Discovery / added by hand), "service · town · intent", a reason and the engine lines (`:69-90`). The reason is sometimes wrong (C-03), and an unmatched service shows only as "general".
- **Duplicates?** Near-duplicates are blocked at approval with the pair named (proved). Cross-town copies are allowed by design.
- **Replace a weak question?** Edit, remove, add, paste are there; there is no "swap for the next best candidate" (P2).
- **Approval state clear?** Yes; a stuck `approved` row says why (context incomplete) in a sentence.
- **Accidentally run unapproved questions?** No — Run starts only from `approved` (`audit-baseline.ts:835-838`), proved by the refusal shapes on C1.
- **Does editing alter frozen historical sets?** No for new clients (C-01 is the legacy exception, C-15 the manual-create hole).

---

## Question freeze / remeasurement integrity

Proved on C1 (live, HTTP results):

| Attempt | Result |
|---|---|
| Approve 19 questions | 400 `baseline_question_count` |
| Approve with a near-duplicate | 409 `baseline_near_duplicates` (pair named) |
| Save / Generate / Discovery generate after approval | 409 `baseline_questions_locked` × 3 |
| Reopen with a 1-letter reason | 400 `correction_reason_required` |
| Reopen with a written reason (approved, not started) | 200, `baseline_meta.corrections` keeps the old 20 and the reason |
| Run pressed twice | first creates the audit; second `already_started`, no second audit |
| Reopen while running | 409 `baseline_not_reopenable` |
| Save context while running | 200 `skipped: already_started`, **nothing written** (location stayed Canterbury) |
| Discovery run while running | 200 `skipped: already_started`, nothing started |

From code and the live database:
- **Runs 2 and 3 replay run 1's queue rows**, not a fresh generation (`audit-baseline.ts:349-354`); a repeat that cannot read its questions refuses (`create-ai-audit:1242-1253`). On C1: each of the 3 runs asked **20 distinct questions, all 20 in the frozen set** (SQL read-back), with 3 distinct `run_number`s.
- **The day-28 replay reads the pointer audit's run-1 asked set, never `baseline_questions`** (`audit-baseline.ts:681-692`) and `judgeRemeasure` requires the identical set (`baselineReplay.ts:216-235`). So Discovery regeneration, onboarding edits, "Fix in onboarding", a client-record refresh and even C-15's reset cannot change what is replayed.
- **Pointers are database-enforced** (live triggers `claim_baseline_pointer`, `claim_remeasure_pointer`, `guard_*_pointer_immutable`; unique index `uq_ai_audits_one_remeasure_per_lead`) — but not in migrations (C-25).
- **Re-measure date:** set once, at the freeze, to freeze + `remeasureWeeksFor` (4) × 7, only when null (`audit-baseline.ts:478-492`). Existing pinned dates are never overwritten by code (RG 6 Oct, Ronnie 13 Oct, MCL 20 Oct untouched). The only writer that can change or clear a date is the cockpit picker (C-09). Due = stored date ≤ today (UTC); refunded, archived, terminated, unpaid and already-replayed leads are excluded (live check: RG refunded → will not fire; MCL terminated 3 Oct → will not fire; Ronnie → **will fire**, C-01). On C1: frozen 4 Oct → `remeasure_due_date` **2026-11-01** (= +28 days ✓), shown in the Welcome Pack as "Four weeks after your starting point, due 1 Nov 2026… The first check, not the finish line." Archiving C1 excludes it from the replay picker.
- **The re-measure clock starts at the freeze, not at payment.** With Discovery and approval in between, a client who pays on day 0 and is frozen on day 10 gets results around day 38 — while the monthly subscription starts at sign-up + 6 weeks (`delayed-subscription.ts:141-143`). Worth Paul knowing; not a defect in the freeze.

**Does remeasurement correctly reuse frozen questions?** **Yes for every new client.** No path regenerates or eases them. The one exception is Ronnie's legacy multi-set baseline (C-01).

---

## Baseline execution

One controlled baseline on C1 (live), checked against MCL's stored baseline:

| Check | C1 (today's code) | MCL (22 Sep, read-only) |
|---|---|---|
| Job creation | One audit `de52662c`, `audit_purpose = baseline`, `baseline_target_runs = 3`, pointer claimed by trigger; second Run press → `already_started` | One audit, 3 runs |
| Runs | 3 × `complete`, created 06:14:40 / 06:17:52 / 06:21:22 | 3 × `complete` |
| Questions per run | 20 distinct, all in the frozen set | 20 distinct |
| ChatGPT answers | 60 of 60 | 60 of 60 |
| Gemini answers | 60 of 60 | 60 of 60 |
| Answer opportunities | **120 of 120** | **120 of 120** |
| Failed / dropped | 0 / 0 | 0 / 0 |
| "Complete" means all present? | Here yes; in general **no** — a run is `complete` unless *every* question failed, and a capped run counts (C-11) | — |
| Frozen snapshot | `baseline.summary`: 20 questions, 120 answered, runs_counted 3 (but **named 4** — model ruler, C-32) | — |
| Re-measure date | 2026-11-01 (freeze + 28) | 2026-10-20 (set; client since ended, replay excluded) |
| Progress tracking | Hub polls every 15 s while running; run list showed `pending → complete` | — |
| Duplicate execution | None possible (claim); proved | — |
| Wall clock | 11 min Run → frozen (cleaning retries included) | runs started 03:10, 03:13, 03:16 |

Also stored per cell: an unscored `ai_overview` block on 38 of 60 rows and a `_google_serp` capture — context only, never in the count (`baselineSummary.ts:8`).

---

## Run / engine integrity

- One `ai_audit_queue` row per question per run holds **both engines** in `result.chatgpt` / `result.gemini`, written by one Apify run in one update — they cannot overwrite each other; a missing engine is **absent**, never a zero (`ai-search.ts:367-381`).
- `run_number` is unique per audit (`uq_ai_audit_runs_audit_run_number`, live; 0 duplicates in the table).
- Failed cells are **excluded from the denominator, not counted as "not named"** (`audit-baseline.ts:105`, `auditReport.ts:959`). Theoretical gap: an empty-text block would count (C-31, 0 cases in 60 days).
- Engine differences are visible everywhere the client looks: MCL "ChatGPT 63% 38 of 60 · Gemini 2% 1 of 60 · Visibility is much stronger in ChatGPT than in Gemini."
- Variation between runs is preserved and real: on MCL, 34 of 40 question × engine cells gave the same result in all 3 runs, 6 varied (ChatGPT 2/3 on 3 questions, 1/3 on 2; Gemini 1/3 on 1). Three runs are doing their job.

## Citations

- Stored per answer, per engine, per run as `{title, url}` (max 20). URLs are preserved raw (C-18); the report unwraps Google redirect links, strips `www`, and an unparseable URL becomes empty and never matches (`auditReport.ts:743-761`).
- **Named and cited are kept apart** in the comparison (`measurementCompare.ts:139-163`) and in client copy ("named" only). Two blurs remain: the legacy stored `named` flag counts a source *title* match (`ai-search.ts:355-356`) — no longer the ruler for judgeable names; and a directory page titled with the business name counts as "cited" (`auditReport.ts:778`).
- Can Paul see what AI relied on? Yes, in the operator report and the rebuild prompt ("cited while answering…", with an investigate-first instruction). On MCL: ChatGPT cited the client's own site on 15 of 20 questions plus Checkatrade (9) and rivals' sites; Gemini cited rivals' own websites (lockrite.org 13, keytek 11, lockfit 11) and the client's site on none — exactly the "ChatGPT reads directories, Gemini reads businesses' own websites" finding. That is commercially useful evidence.

## Competitors

- Extracted per answer by gpt-4o into `result.<engine>.competitors` plus `self_named`; known directories and junk dropped, max 8, de-duplicated case-insensitively (`extract-competitors/index.ts:115-143`); nationals kept on purpose; other-town rivals kept on purpose.
- On MCL the names are genuine Canterbury locksmiths (AW Locks 44 mentions, Lockfit, Castle Locksmiths Kent, Hames and Sons, Keytek). Weaknesses: variants not merged, the client listed as its own rival 7 times (C-16), cleaning partial under rate limits (C-17). Client-facing baseline documents do not list rival names (the hook report shows one answer's names) — so these flaws reach Paul and the build prompt, not the client.
- **Commercially useful?** Yes, for Paul: it tells him who is winning and on which engine.

## Scoring validation (calculations)

**MCLocksmiths' live report and Welcome Pack (`findable.live/r/mqy2uf`, `/w/mqy2uf`), recomputed from the 120 stored answers with the production ruler (`cellNamed` + business, trade, town):**

| Figure on the page | Recomputed | Calculation | Match |
|---|---|---|---|
| Overall 33%, 39 of 120 | 38 + 1 = 39 named of 120 answered | 39 ÷ 120 = 0.325 → `Math.round(32.5)` = **33%** | ✅ |
| ChatGPT 63%, 38 of 60 | 38 | 38 ÷ 60 = 0.633 → 63% | ✅ |
| Gemini 2%, 1 of 60 | 1 | 1 ÷ 60 = 0.0167 → 2% | ✅ |
| "15 questions named sometimes, 5 never" | 15 / 5 / 0 always | per question, across its 6 answers | ✅ |
| "on 14 of the 15… only one of the two AI tools named you" | 14 | | ✅ |
| "roughly 1 in every 3 times… AI mentions you" | 39/120 ≈ 1 in 3.1 | | ✅ |

Denominator = answered cells (all 120 answered on MCL; 0 failed). Three rulers exist and differ: the answer text (production) 39; the model's verdict 34 (ChatGPT 32, Gemini 2); the old string flag 31. I read the disagreements: the text ruler was right each time I checked (e.g. "Checkatrade currently lists … and MC Locksmiths as serving Ramsgate" — text says named, model said not; a Gemini answer about Acme Locks — model said named, the text never mentions MC). The per-run `mention_rate` column (0.225 / 0.25 / 0.30 → mean 25.8%) still uses the old string flag; nothing client-facing reads it.

**C1:** 0 of 120 on the report, the Welcome Pack and the hub (`named 0 / answered 120 / expected 120`) — correct: the business does not exist. Recomputed with the production ruler: ChatGPT 0/60, Gemini 0/60 → 0 ÷ 120 = **0%**. But the model's own verdict (`self_named`) said **named on 4 of 120** (2 ChatGPT, 2 Gemini) — false positives, two of them on answers whose citations were MC Locksmiths' own pages — and that verdict is what the frozen snapshot (`ai_audits.baseline.summary.named_rate = 0.0333`) and run 1's stored `mention_rate` (0.05) recorded. Client surfaces are protected because the name is text-judgeable; see C-32 for where the model ruler still decides.

No vanity aggregate on client documents: the headline is named ÷ answered with both engines shown beside it. "Winnable / possible" stays internal (`aiAuditReportHtml.ts:118-120`). The hub shows named / answered / expected with the same ruler.

## Plain-English output

- **Welcome Pack baseline page (MCL, live):** "39 of 120 — Answers that named you — 33% — Of all answers — 20 Questions, asked 3× each… That's 33%: roughly 1 in every 3 times a customer asks, AI mentions you. ChatGPT named you in 38 of 60 answers · Gemini named you in 1 of 60 answers." **Clear, accurate, not overstated.** "Why ask everything 3 times?" is excellent. The one risk: a blended 33% hides that ChatGPT names him nearly two times in three and Gemini almost never — the per-engine line underneath carries it.
- **No guaranteed recommendations, rankings or citations:** "What nobody can do is guarantee that a particular AI tool will recommend you or quote your website on a particular day." ✅
- **Jargon:** low. "Named" is explained; "cited" does not appear in client copy.
- **Report:** the question grid of keyword strings (C-02) and the "SEO grade A" block (Session B, B-25) are the weakest parts.

## Delivery state machine

```
payment → setup (WAITING / READY TO SUBMIT / READY FOR DELIVERY) → Discovery → questions → baseline
        → Build / Optimise → launched → remeasure → results
```
Derived on every read (`deliveryStage.ts`), never stored — good. Observed and read:
- **Stage skipping:** C1 went through Discovery, approval and a full baseline while setup said "WAITING FOR INFORMATION" — the server checks only `status='paid'` and context (C-20). Probably fine operationally (Discovery does not need GBP access), but the stage label then hides missing setup items.
- **Stuck states:** a given-up baseline (C-11); "Remeasure not scheduled" when the date fill failed or was cleared — a passive line, not an action (C-09).
- **Stale labels:** "Re-measure due (8 wks)" in the cockpit; "Remeasure done — send results" while the replay is still running (C-20).
- **Duplicate jobs:** none possible for the baseline (one claim, `approved → starting`, proved with a double press) or the Discovery run (compare-and-set claim). Opportunity check has no claim (C-23).
- **Refresh:** the hub polls every 15 s only while `starting`/`running`; it is a read.

## Error / retry handling

| Situation | What happens | Safe? |
|---|---|---|
| Provider timeout on a question | 3 attempts per row, 12-min run age with an abort, then the row fails | ✅ bounded |
| One engine missing from a result | Absent, excluded from the denominator; the row is `done` and never retried for that engine | ⚠️ no top-up (C-11) |
| A whole run fails | A new run is created (up to target + 2), then the chain gives up | ⚠️ give-up invisible (C-11) |
| Daily cap / Apify cap mid-run | Rows `daily_cap`, run `capped`, **counted** as a baseline run | ⚠️ (C-11) |
| Duplicate start (webhook, backstop, operator) | One conditional claim; loser gets `start_in_progress` | ✅ proved |
| Competitor cleaning 429 | Run held, retried every 4 min up to a cap, then released with an honest receipt | ✅ but slow (C-17) |
| Queue worker restart | Rows and runs are in the database; the 30-s tick resumes; stalled-baseline sweep re-drives (limit 5, oldest first — 2 stuck legacy audits occupy the head today: Solene, My EV box) | ✅ / ⚠️ starvation if 5 get stuck |
| Double-counting | Not possible: cells are keyed by run and question; the freeze is one conditional write | ✅ |
| Can Paul retry one part? | **No** — only a whole new run | ⚠️ |
| Does Paul know what failed? | Only by reading run JSON | ⚠️ |

## Welcome Pack integration

Read live for MCL (`/w/mqy2uf`) and for C1 (`render-welcome-pack?slug=pfqmdq`; the renderer writes nothing).
- **Source:** only `outreach_leads.baseline_audit_id`, with the stored purpose asserted; a Discovery, hook or market audit is refused (`welcomePackData.ts:73-108`); it renders only after `baseline_completed_at`. C1's pack appeared the moment the baseline froze.
- **Values come from the correct baseline:** C1 pack "0 of 120… 0%… 20 Questions, asked 3x each… ChatGPT named you in 0 of 60 answers · Gemini named you in 0 of 60… 20 questions where you were not named at all"; MCL pack "39 of 120… 33%" (validated above). Re-measure "due 1 Nov 2026" (C1) / "due 20 Oct 2026" (MCL) — from the stored date. C1 (Build) "plus hosting and maintenance of your website"; payments "Six weeks after your first payment, £99 a month begins… 12 payments in total".
- **Methodology explanation:** excellent and accurate (Session B agrees): 20 × 3 × 2 = 120, why three runs, frozen questions, "the first check, not the finish line", the honest "nobody can guarantee" box.
- **Citations / competitors:** not shown to the client (named counts only). Fine for a client document; the evidence sits in the appended report and the rebuild prompt.
- **Blanks / stale fields:** none on C1. "Services we measure you on" lists the 15 onboarding services, but the frozen 20 cover **5** of them — the label overclaims. "Taken from what you told us when you signed up and from your own website" is printed for C1, which has no website. "What you get: Real customer questions" sits above a report of keyword strings (C-02). "Want to be one of the names? Request a call" — a sales call-to-action — is printed in the appended report of a client who has already paid (C-34). Ownership wording for Optimise and the SEO grade are Session B's findings (B-08, B-25), not repeated.

## Build data readiness

Build gets, through `rebuild_context` (read-only) and `websiteBuildPrompt.ts`: business identity, category, town, services, areas, accreditations, `must_not_say`, address, the **frozen 20 and their audit id with "do not touch the baseline"**, "What the baseline found" (gaps), the rivals that appeared (with "never name a competitor on the site"), the client's own URLs that engines cited (do-not-break), the stored crawl. Missing: what the rep promised and what the client wants (C-13), differentiators (`standout` no longer asked), photos status. The frozen list is read from `onboarding.baseline_questions`, not the audit (fine for new clients; legacy RG/Ronnie print "not available"). On C1 the context was complete (`rebuild_context` read-only: lead, paid onboarding with the 15 services and 3 areas, the baseline audit and its completed report with per-question rivals and cited URLs, the Discovery audit slot empty, no crawl, no pages). The handoff was empty (C1 had none) and would not have been included anyway (C-13).

## Optimise data readiness

The operator has: the crawl panel, the Opportunity Backlog (seeded from Discovery at approval), the page generator, the cockpit checklist. There is **no single Optimise brief**: weaknesses, page priorities, AI-visibility gaps and client constraints are assembled only inside the rebuild prompt (C-13). Directory work is promised in the pack with no workspace behind it. The data exists; it is not in one place.

## Remeasurement

See "Question freeze / remeasurement integrity". Summary: same frozen questions ✅, same engines ✅, same 3 runs ✅, same method ✅ (`skip_seo`, `town_confirmed`, the baseline audit's stored type and town), one replay per lead ✅, pinned dates preserved ✅, 4 weeks for every new client ✅ (`remeasureWeeksFor` always 4). Weak points: the verdict's denominator and engine balance (C-12), the date picker (C-09), held results lost (C-10), Ronnie (C-01).

## Results output

Not exercised live (no replay may fire in the certification; C1 is archived, which excludes it). From code (`remeasureResults.ts:246-286`, `remeasureResultsHtml.ts`): subject "Your four-week results — {name}"; "measured four weeks ago… asked the same {N} questions again, on the same engines"; not-gone-up branch "That means the guarantee applies." + the byte-locked claim sentence + the payment-two sentence; per-question table of matched questions; no rankings, no "guaranteed", no "eight weeks" literal (it can appear only via `weeksWord` if a date is moved to 8 whole weeks). Problems: a causal claim in the gone-up branch (C-28), the footer "Both measurements asked the same questions" while the cards include unmatched questions (C-12), the send path (C-10). **Still held:** `REMEASURE_RESULTS_COPY_APPROVED = false` on main. RG is refunded (the replay will not fire); Ronnie's would be held (no contract) — C-01.

## Monthly update

`client_monthly_updates` + `monthlyUpdate.ts` + `MonthlyUpdatePanel.tsx`. Admin-only (security-definer functions); a sent row is never edited. The only generated text is the measurement paragraph, built from stored weekly-check results, comparing like-for-like checks only, never saying "improved" or "audit", and ending "These checks are separate from the re-measurement your guarantee is judged on." Work done, adjustments and next steps are the operator's own words; stored pages and opportunities are offered as suggestions with an Add button — **it cannot claim a page was created that was not**, unless Paul types it. Weak points: judgeability and a one-answer "more/fewer" (C-21); checks bucketed by the Monday they start (a week starting 29 Sep counts in September); `payment_date` sliced in UTC. Not exercised live (no weekly checks run for an excluded fixture, by design).

## Data consistency

| Fact | Canonical source used by the measurement | Drift risk |
|---|---|---|
| Business name | `outreach_leads.business_name` (baseline, named judgement) | Pack prints the onboarding name first (`welcome-pack-render.ts:166,200`) |
| Trade | `lead.category` → audit `business_type` | Manual create sets it to the first service (C-15) |
| Home town | onboarding `confirmed_location` → audit `location_text` | Weekly checks judge against `lead.derived_town ?? search_location` |
| Services | merged list (C-08) → audit `specialism` | Pack prints onboarding list as "Services we measure you on" — not what the 20 cover |
| Areas | merged list (C-08) | Pack omits sales-recorded areas |
| Website | `lead.website` (baseline `has_website`, own-site citations) | Rebuild do-not-break list uses the onboarding website first |
| Frozen questions | the pointer audit's run-1 queue rows (replay) | Hub and build prompt read `onboarding.baseline_questions` (same set for new clients) |
| Re-measure date | `outreach_leads.remeasure_due_date` | Cockpit picker can clear it (C-09) |

Once the baseline exists, its audit row freezes name, type, town and website for the replay, so later drift cannot corrupt the before-and-after — it can only make documents disagree with each other.

## Cost / efficiency

- **No duplicate spend found on the baseline path** (one claim; double press proved; runs 2–3 replay, no regeneration; the Discovery run has a claim and refuses a second run of the same pool).
- **Real waste paths:** none on today's data. Watch: the opportunity check without a claim (C-23); competitor-cleaning retries under 429 (bounded by a cap); the sales reply-audit firing again right after a manual hook audit (Session A, A-12).
- **Unit costs measured:** a full 20 × 3 baseline = **$0.81** on Apify's counter (60 searches ≈ $0.0135 each, matching the $0.0139 "observed billed" rate behind `DISCOVERY_USD_PER_QUESTION_RUN`) while our ledger says $0.61 (C-33); Discovery run for C1's 34-question pool estimated $1.43; Discovery generate ≈ cents (OpenAI); competitor cleaning ≈ $0.05–0.10 per run (gpt-4o).
- **Capacity:** C-14.

## Human review points

| Area | Today | Should be |
|---|---|---|
| Measuring, storing, scoring, freezing, replaying | Automated | ✅ keep automated — proved sound |
| Discovery question writing | Automated | Automated, but with the C-02/C-03/C-04 guards |
| **Selecting and approving the 20** | Paul must approve (good), but the draft needs heavy editing and shows no warnings | **Paul must review** — with blocking checks for brand / unconfirmed service / missing core query (C-05) |
| Hook questions locked into the 20 | Automated lock, removal needs a reason | Keep, but run the same content checks on them |
| Client services / areas | Merged automatically from several sources | Client-confirmed list wins; Paul confirms (C-08) |
| Re-measure date | Automatic, editable by one click | Automatic; edit only deliberately (C-09) |
| Four-week results | Automatic send, held behind a flag, no manual send | Automatic after copy approval, plus a manual send (C-10) |
| Monthly update | Measurement automatic, work items manual, Paul marks sent | ✅ right balance |
| Backlog seeding | Automatic at approval | Filter out unmatched services (C-04) |
| Failure handling | Silent | Automatic detection, human decision (C-11) |

## Overall client value

Stepping away from the code: if I were a small local business paying £99 and a monthly, would this baseline teach me something useful?

- **Yes, the measurement would.** MCLocksmiths' pack tells a locksmith something he could not have known: ChatGPT names him in nearly two answers out of three, Gemini almost never, and on 14 of 15 questions only one tool knows him. The citations behind it (Checkatrade and his own site for ChatGPT; rivals' own websites for Gemini) point straight at the work. That is specific, credible and actionable, and it is explained in plain English with honest limits.
- **The questions would undercut it.** A client reading "non-destructive entry locksmith in faversham uk" four times over, with no "locksmith in Canterbury", and a question about car keys he does not do, would conclude the tool does not understand his business. That is the bespoke-versus-generic line, and today it falls on Paul's editing.

## Suggested launch decision

**Launch with fixes, in this order:**
1. **Before 13 October:** Paul decides Ronnie's re-measure (C-01).
2. **Before the first new client's approval:** C-04 + C-05 (no out-of-scope service, no brand, blocking checks) and C-03's mandatory core questions. Until then, Paul rewrites each draft by hand to the MCL style and removes anything not on the confirmed list.
3. **Before the first new client's day 28:** C-09 (date picker), C-10 (send path + copy approval), C-12 (verdict on matched, engine-balanced cells).
4. **Before volume:** C-11 (visible failures), C-14 (Apify cap), C-02 (customer-style questions), C-08 (one source of truth), C-13 (handoff into build / Optimise brief), C-06/C-07 (client copy).

---

## Twelve-question matrix (README §12), per owned stage

| Stage | 1 Find | 2 Next obvious | 3 Enough info | 4 Unneeded info | 5 Asks known | 6 Harmful mistake | 7 Wording | 8 State updates | 9 Admin gets it | 10 Permissions | 11 Desktop+mobile | 12 Recovery |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| J21 Discovery | ✅ | ⚠️ C-20 | ⚠️ C-08 | — | ⚠️ AUTO-FILL rows | ⚠️ C-04 | ⚠️ C-02 | ✅ | ✅ | ✅ admin-only (`requireAdmin`) | ⏸ not rendered | ✅ regenerate keeps old job in history |
| J22 Questions / approval | ✅ | ✅ | ⚠️ C-03 reasons | — | — | ❌ C-05 | ⚠️ C-02 | ✅ | ✅ `baseline_meta` | ✅ | ⏸ | ✅ reopen with reason |
| J23 Baseline / results | ✅ | ✅ | ✅ | — | — | ⚠️ C-15 | ✅ | ✅ 15-s poll | ✅ hub figure | ✅ | ⏸ | ❌ C-11 |
| J27 Lifecycle (AI side) | ✅ | ⚠️ C-20 | ✅ | — | — | ⚠️ C-09 | ⚠️ "(8 wks)" | ✅ derived | ⚠️ C-11 | ✅ | ⏸ | ⚠️ C-11 |
| J28 Re-measure readiness | ✅ | ✅ | ✅ | — | — | ❌ C-01, C-09 | ✅ | ✅ | ⚠️ C-10 | ✅ | ⏸ | ❌ C-10 |

## Not tested, and why

- **Discovery run** (measuring the pool): not pressed, to stay inside the $3 Apify cap ($1.43 estimate). Its classifier was read on BS4's stored Discovery audit and in code. Consequence: C1's recommendation used "balance only".
- **Hook-question locking live:** C1 had no hook audit (hook audits were allocated to Session A). Verified in code and in the approve refusal shape.
- **Discovery crawl / Optimise with a website:** C1 had no website, deliberately, so no crawl ran (0 of the 2 allowed). Crawl effects were read in code.
- **A day-28 replay and the results email:** must not fire in the certification; read in code.
- **Weekly checks and a monthly update for C1:** excluded fixtures are skipped by design; read in code.
- **Quick Close for C1:** onboarding made by hand (see Journey); Quick Close is A/B's stage and its Build path has the known B-01 bug.
- **Screens:** none rendered or seen; operator UI assessed from source and API responses. Mobile not checked.
- **Failure injection** (provider timeout, Apify cap, worker restart): not induced (would cost or disrupt); assessed from code and historical rows.

## Cleanup check output (README §4.4)

- **C1 archived** through `lead_set_archived` as the data account (History `archived_set` 06:30:25); phone and email cleared (the payment webhook had filled the lead email with the payer address `paul@move37.fun`); exclusion row kept; History kept (`payment_received`, `baseline_approved` ×2, `baseline_run`, `archived_set`).
- **No jobs remain:** C1 has 0 open queue rows, 0 open runs, 1 audit (the baseline, complete), no Discovery job. Archiving excludes it from the four-week replay, weekly checks and Paid Clients.
- **Nothing queued by this session:** the two queued leads (Roof Rhino Ltd, PRECISION ROOFERS LTD) are Paul's pre-existing real leads, untouched.
- **Nothing sent:** 0 WhatsApp rows for C1 (`payment_confirmation_unreachable` — no phone). Emails from the simulated payment went to Paul's own addresses only (`payment_email_sent` to paul@findable.live; the agreement PDF is untraced, B-18).
- **Admin session revoked:** `POST /auth/v1/logout?scope=local` → 204; the same token then got 403 from `/auth/v1/user` and 401 from `paid-baseline`. Token files deleted from the scratchpad.
- **Spend within caps:** Apify $0.81 (this session), certification ≈ $0.89 of $3; account 72% of its monthly cap.
- **Permanent QA rows that cannot be removed safely (left on purpose, all excluded/archived):** C1's baseline audit `de52662c` with its 3 runs and 60 queue rows; the `payment_ledger` row (`test_excluded`, 0%); one `client_paid` notification; one agreement acceptance; 15 `client_opportunities` rows (incl. the "car keys" one); onboarding `…f1` (`paid`, baseline `complete`, `baseline_meta.corrections` with the QA reason); C1's `remeasure_due_date` 2026-11-01 (inert while archived — **if C1 is ever un-archived, clear that date first**).
- **One unintended write to a real client's row (reported, not reversed):** my first fetch of MCLocksmiths' public report used the plain link without `preview=1`, so `bump_audit_open` raised its audit's `open_count` by one, to 16 (06:02 UTC). No crawl fired (its crawl was fresh), no notification or History row was written. Every later report read used `preview=1`. Paul may want to subtract one; I did not touch it.

README §4.4 check, run after cleanup (40 `ZZ QA%` rows returned; every one `is_archived = true`, `no_contact = true`, `excluded = true`). The C1 row:

```
business_name      | id                                   | is_archived | no_contact | excluded
ZZ QA-C1 Baseline  | 1c000000-0000-4000-8000-0000000000c1 | true        | true       | true
```
