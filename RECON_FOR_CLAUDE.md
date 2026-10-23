# RECON_FOR_CLAUDE.md — an honest map of LeadFinder / findable-site

*Written 2026-08-20 from a read-only pass over both repos and the live database. Row counts and
examples are real, pulled that day. Where the code contradicts what the operator believes, it says
so. No hype.*

---

## 1. The big picture

**Two repos, one Supabase project.**

- **LeadFinderOS** — the operator's private app (an internal CRM + audit engine). React SPA, not
  customer-facing. This is where Paul works all day: finding businesses, auditing them, messaging
  them, tracking who paid. Lives at `https://leadfinderos.pages.dev`.
- **findable-site** — the public marketing site at **findable.live** (Astro). It sells the product,
  explains the method, and carries the two customer-facing flows: the **free AI check** form and the
  post-payment **onboarding questionnaire** (`/onboarding`). It is NOT git-auto-deployed — it ships
  by a manual `npm run deploy` (`astro build && wrangler pages deploy`).

**Stack.**
- Frontend: LeadFinderOS = React + Vite + Tailwind, deployed on Cloudflare Pages (auto-deploys on
  push to `main`). findable-site = Astro + React islands + Tailwind, Cloudflare Pages (manual deploy).
- Backend: **Supabase edge functions** (Deno/TypeScript), ~50 of them in `supabase/functions/`.
  Project ref `ruusxpkkmwtljxxulhbq`.
- Database: Supabase Postgres.
- Key external services: **Apify** (the `apify~google-search-scraper` actor — the single most
  load-bearing dependency; every AI-visibility check and SEO scan runs through it), **Google Places
  API** (finding businesses + phone/address enrichment), **OpenAI** `gpt-4o` / `gpt-4o-mini`
  (question generation, competitor-name cleaning, page generation, review-reply drafting),
  **Stripe** (payment), **Resend** (operator email), **WhatsApp** (Meta Cloud API, via templates)
  and **Instantly** (cold email — largely dormant).

**What the product does, in five sentences.** It measures whether ChatGPT and Gemini (and Google's
AI Overview) name a specific local UK business when someone asks those engines for that trade in that
town. When they don't — which is almost always — it sells the business a one-off fix: pages on their
own site written so the engines can learn what they do and where, their Google Business Profile
completed, and their details made consistent across the sources the engines read. Eight weeks later
it re-runs the identical questions and sends a before/after report; the guarantee is on doing that
work and re-measuring, never on the outcome. The operator side is a lead machine: scrape a town's
businesses, audit a market to see who's invisible, and drip WhatsApp outreach to the ones worth
selling to. There are **two paying customers so far** (RG Locksmiths £19.99, Ronnie's Shoe Repairs
£49.99) — nothing here is proven at scale.

**Who's the user?** Overwhelmingly **Paul, operating it.** LeadFinderOS has no client login. The only
things an end client ever touches are the free-check form and the onboarding questionnaire on
findable.live, plus the static HTML audit report they're sent a link to. Everything else — CRM,
audits, market view, page generation, outreach — is single-operator.

---

## 2. The core workflow, end to end

**Lead finding.** `supabase/functions/search-leads` calls Google Places (Text Search + Place
Details). It returns businesses (name, place_id, address, phone, website, rating) and caches the
result set in `search_cache`. The operator adds chosen results to the CRM via `useOutreach.addLead`,
which writes an `outreach_leads` row. Enrichment (phone, address, derived town, rating) is attached
at add-time from a Places cache. **Apify is not used for finding** — it's used for the audit.

**Audit / visibility testing.** `create-ai-audit` generates the questions (via OpenAI, with a
deterministic template fallback when OpenAI is down) and queues them; `process-ai-audit-queue` runs
each question through the Apify google-search-scraper, which returns ChatGPT / Gemini / AI-Overview /
Google-organic answers in one call. Per question × engine it records whether the business was
**named**, the **competitors** the answer listed, the **answer text**, and the **cited source URLs**.
See §4.

**Page generation.** `page-generator` edge function + `src/lib/pagePlan.ts`. Given a paid client's
questionnaire (services × areas) intersected with the questions their baseline audit actually asked,
it produces one service-plus-town page at a time via gpt-4o. Output is HTML returned to the browser —
**stored nowhere, published nowhere.** The operator copies it. See §3.

**Delivery.** Manual, two supported ways (per the product rules): either the client's site is
WordPress and Paul has access (pages published there), or the client lets the site move to our
hosting. There is **no automated publish pipeline** — `page-generator` hands back paste-ready HTML
and that's the end of the code's involvement.

**CRM / outreach.** `outreach_leads` is the CRM (1,702 rows). Messaging is **WhatsApp**, via Meta
Cloud API templates, driven by `process-whatsapp-queue` (paced, capped at 120/day, 07:00–21:30
London). The Inbox (`src/pages/Inbox.tsx`) is a two-way WhatsApp client. Cold **email via Instantly**
exists (`instantly-push`) but is essentially dormant. All send counts come from the
`whatsapp_messages` table, never from lead status.

**Payment.** Stripe, one-off (`mode: "payment"`, not subscription). `findable-checkout` creates the
session (refusing anyone the serve-gate can't serve); `stripe-webhook` marks the onboarding row paid,
backfills the contact email, and triggers the paid baseline audit. Founder price currently £49.99.

---

## 3. Page generation — deep detail

**Where it lives:** `supabase/functions/page-generator/index.ts` (the gpt-4o call + server-side
anti-stuffing) and `src/lib/pagePlan.ts` (the pure planning logic, tested in
`scripts/page-plan.test.ts`). The operator screen is `/page-generator`.

**Input:** a paid client's newest `onboarding_responses` row — specifically `services_list`,
`areas_list`, `confirmed_location` — intersected with the questions their **baseline audit** actually
asked (read from the latest `baseline_target_runs`). You do **not** specify each page. The system
decides the page set by overlap:

- A page exists only for a (service, town) pair that is **both wanted** (in services × areas) **and
  measured** (a verbatim baseline question targets it). `buildPagePlan` walks each baseline question,
  matches it to a wanted area (`townMatches`) and a listed service (`serviceMatches`), and groups
  hits into pages keyed `service|town`. RG's real inputs — 4 services × 7 areas — produce **10 pages**
  (not 28), because only the measured overlaps qualify.
- **Exclusions are itemised, never silent:** trade-level queries like "best locksmiths in Huntingdon
  UK" → "the homepage covers it"; measured services the client doesn't offer → excluded with reason;
  wanted areas that were never measured (RG: St Ives, Brampton, Godmanchester, Chatteris) → listed as
  no-page.

**Output:** per page, `slug`, `title`, `meta_description`, `h1`, `body_html` (clean HTML: h2, p,
ul/li, strong). Returned as JSON to the browser. **Not stored in any table, not published.** Hosting
format is a dropdown the operator picks. Generate-on-demand, one page per press.

**Is there hub-and-spoke / page-graph / internal-link logic?** **No.** There is no clustering, no
canonical-vs-supporting hierarchy, no inter-page link graph, no hub pages. Each page is generated
independently from its own (service, town, queries) tuple. The "page graph" is flat: N service×town
leaves, plus a nominal homepage that absorbs trade-level queries. This is the single biggest gap vs
the "500 connected canonical pages" ambition in §7.

**Quality rules enforced (these are real and code-side, not just prompt text):**
- `stuffingCheck` (in pagePlan.ts) grades every generated page: town mentioned ≤ `MAX_TOWN_MENTIONS`
  (4), keyword density ≤ `MAX_KEYWORD_DENSITY_PCT` (3.0%). One automatic rewrite on failure; still
  stuffed → returned flagged. RG's *old* agency doorway pages (5.7% density, byte-identical templates)
  grade `stuffed`, which is what this exists to catch.
- Prompt hard rules: 350–500 words, one clean HTML block, no outcome promises ("never say you'll
  rank / AI will recommend you / guaranteed"), invent nothing (no prices, hours, review counts, or
  certifications beyond the ones supplied), `must_not_say` from the questionnaire is a hard
  constraint (RG: never claim MLA membership).
- No schema/JSON-LD is generated for these pages (the audit *reports* carry JSON-LD; the client pages
  do not).

**One real example.** OpenAI is currently out of credit, so I did not spend to generate a live page.
The exact input the code would run for RG Locksmiths, pulled live:

```
services_list: ["Emergency lockouts","Lock changes","uPVC door and window locks","Burglary repairs"]
areas_list:    ["St neots","Peterborough","Cambridge","St ives","Brampton","Godmanchester","Chatteris"]
confirmed_location: "Huntingdon"
```
→ plan produces pages only where a baseline question also targets the pair, e.g. `page_key`
`emergency-lockouts|huntingdon`, slug `emergency-lockouts-huntingdon`, which gpt-4o then fills to a
350–500 word body under the rules above. The generated HTML is handed to the browser and pasted by
hand; nothing is stored.

---

## 4. Citation / visibility testing — deep detail

**Where it lives:** `create-ai-audit` (builds + queues questions), `process-ai-audit-queue` (runs
them, finalises, auto-cleans competitor names), and `supabase/functions/_shared/enrichment/ai-search.ts`
(the Apify call + the per-answer scoring). Competitor-name cleanup is a separate OpenAI pass in
`extract-competitors`.

**Prompt count — per-business generated, not fixed:**
- Operator wizard / outreach audits: capped at `WIZARD_MAX_QUESTIONS` = **5**.
- Market audits (a whole town, no single business): `MARKET_AUDIT_QUESTION_COUNT` = **8** per audit,
  and a town isn't called "measured" until `MARKET_AUDIT_MIN_AUDITS` = **2** completed audits (so ~16
  questions per measured market).
- Paid baselines: 3 runs of the client's questions, averaged.
Questions are OpenAI-generated for the specific trade+town, with a deterministic template fallback if
OpenAI fails — so audits keep running even while OpenAI is dry (as now).

**Engines:** all via the **Apify** `apify~google-search-scraper` actor, which returns ChatGPT,
Gemini, Google AI-Overview and Google-organic in a single scrape (not separate API calls). The queue
scores **chatgpt and gemini**; ai_overview is captured but not scored into the headline numbers.

**Recorded per question × engine** (the `result` JSON on each `ai_audit_queue` row):
- `named` (boolean) — the business name appears in the answer text OR in a cited source title. Uses a
  strict matcher (`nameMatches`) so "Lewis Brownlee" ≠ "Lewis Brownlee Chartered Accountants".
- `competitors` (string[]) — the firms the answer actually recommended.
- `answer_text` — the engine's full answer.
- `citations` — the source URLs the answer cited (title + url).
- The distinction the data supports: **named vs not**, and **who was named instead**. "Mentioned vs
  cited vs recommended" is not separately modelled — `named` conflates answer-text mention and
  source-title citation by design.

**History for before/after:** yes. Every audit run is an `ai_audit_runs` row; every question an
`ai_audit_queue` row. A paid baseline stores the day-0 questions verbatim in `baseline_target_runs`,
and the week-8 re-measure re-runs the identical questions, so the comparison is like-for-like. This is
the evidence the guarantee stands on.

**One real audit result row** (a live market-audit question, 2026-08-20):

```
question: "emergency lockout services in Newcastle-under-Lyme UK"
status:   done
chatgpt.named:       false
chatgpt.competitors: ["Unshrinkable Locksmith","Six Towns Locksmith","LA Locksmiths - Stoke on Trent","Timpson Locksmiths and Safe Engineers"]
chatgpt.citations:   [{"url":"https://www.lalocksmiths.co.uk/locksmith-newcastle-under-lyme/","title":"Locksmith Newcastle-under-Lyme | 24/7 Local Locksmiths | LA Locksmiths"}, ...]
chatgpt.answer_text: "If you're locked out in Newcastle-under-Lyme, Staffordshire right now, these are the most relevant emergency options I found: Unshrinkable Locksmith — 13 Wulstan Dr, ST5 0RE. Listed as 24 hours…"
gemini.named:        false
gemini.competitors:  ["Six Towns Locksmith","Unshrinkable Locksmith","LA Locksmiths - Stoke on Trent","Timpson Locksmiths and Safe Engineers"]
```
That is the product's core datum: the business was not named; here is exactly who was, and the URLs
the engine trusted.

---

## 5. The database

**Actively used (live row counts, 2026-08-20):**

| table | holds | rows |
|---|---|---|
| `outreach_leads` | the CRM: every business (name, phone, trade, town, status, payment) | **1,702** |
| `ai_audits` | one audit (a business, or a market) — 94 are market audits, 5 are paid baselines | **482** |
| `ai_audit_runs` | one run of an audit (a baseline has several) | **533** |
| `ai_audit_queue` | one question × audit; the `result` JSON per engine lives here | **2,703** |
| `whatsapp_messages` | every WhatsApp in/out — the source of truth for all send/reply counts | **1,736** |
| `enrichment_usage` | per-call cost ledger (Apify/Places/OpenAI) for the spend caps | **5,304** |
| `business_reports` | rendered static audit reports (html_content + json_ld) | **215** |
| `search_history` | one row per lead search — the index market-view uses to find a pool | **184** |
| `search_cache` | the actual scraped business lists, keyed by a hash of trade+town+radius | **50** |
| `campaigns` | outreach campaigns (a name, a trade_slug, a default template) | **12** |
| `onboarding_responses` | questionnaire submissions (free-check + paid) | **7** |

**Abandoned / legacy / empty:**
- `client_listings` — **0 rows.** The delivery-checklist concept was built but never populated.
- The older **website-generation product line** (barber/salon/plumber site generators,
  `generate-barber-site`, the claim-flow functions `claim-share` / `create-claim-link`) is legacy —
  still deployed, not part of the Findable flow. Two of those functions have **no source in the
  repo** at all.
- `sms_sends` — SMS was scaffolded, never used (0 sends).
- `list_type` on leads always reads `'no_website'` — a leftover default, NOT a real website signal.

**Rough scale:** ~1,700 leads, ~480 audits, ~2,700 audited questions, ~1,700 WhatsApp messages. This
is one operator's few months of prospecting, not a multi-tenant dataset.

---

## 6. What's actually live vs half-built

**Working in production right now:**
- Lead search (Places), CRM, enrichment, the market view / Coverage grid.
- The audit engine end to end: question generation (with template fallback), Apify scraping, per-engine
  scoring, competitor extraction, static report rendering (`render-audit-report`, 215 reports made).
- WhatsApp outreach queue + two-way Inbox.
- Stripe checkout + webhook + paid baseline trigger (proven twice — RG and Ronnie).
- findable.live: marketing page, free-check form, onboarding questionnaire.
- The **free-check funnel** (a public submission becomes a deduped, enriched CRM lead owned by the
  right account): shipped 2026-08-20 — but **no real member of the public has used it yet**; the paid
  enrichment path is proven only by a zero-spend probe, not a live submission.

**Built but not wired / conditional:**
- **Page generator** works but publishes nothing and stores nothing — it's a copy-paste tool, and it
  needs OpenAI credit (currently dry, so it returns a `no_credits` banner).
- **Review-reply drafting** (`/review-replies`) is live but stateless — paste a review, get a draft;
  it posts nothing to Google.
- **Auto-audit on free-check submission** (funnel phase 2) is deliberately NOT built — the operator
  wants to watch a real submission create a lead first.
- **Instantly cold email** is dormant.

**Broken / flaky / caveats:**
- **OpenAI is out of credit** right now: question generation falls back to templates (fine), but
  competitor-name cleaning, page generation and review replies degrade until topped up.
- **Apify is a single point of failure with a monthly cap** — when it's exhausted, every audit and
  SEO scan stops at once. It has hit the cap before.
- The audit's `named` matcher is deliberately strict and will under-count borderline namings.
- Several past "measured but no pool" dead-ends existed because a search wrote the pool cache but not
  the history index; that was fixed 2026-08-20 (see below).

**Recently-asked fixes — did they ship?**
- **Palette/hero redesign on findable.live** (black/white/yellow, fade transitions, 4-across How-it-
  works, scroll animations, trust strip, hero payoff): shipped and live.
- **Free-check funnel MVP**: shipped and live (edge fns + site), unused by real public yet.
- **Coverage "no pool" dead-end** and **market-view Find-leads action**: shipped and live.
- **Orphaned-pool recovery + "no trade, no lead" guard + backfill of 14 August leads**: shipped and
  live 2026-08-20. The 7 orphaned pools are findable again; new leads can't be saved with a null
  trade; the 14 leads were given their trade from their campaign name and are auditable. **138
  June–July leads with no trade AND no town were deliberately left alone** — a separate cleanup.

---

## 7. Honest gaps for the bigger job

Target: *"generate 500 connected canonical pages for one client, each with one clear question + a
standalone answer + hub links + named sources, with a clinical/human approval gate before publish,
then measure citations across ChatGPT/Gemini/Google AI over time."*

**What the current system already covers:**
- **Per-page generation** with real quality guards (word count, single-topic, anti-stuffing, no
  invented facts, no outcome promises, client must-not-say). The prose engine is the strong part.
- **Deriving pages from measured demand** — the plan only makes a page where a real AI question
  targets it, which is a genuinely good instinct for "canonical answer to a real question."
- **Citation measurement over time already exists and is real**: identical questions re-run,
  per-engine named/competitors/citations stored in `ai_audit_queue`, before/after via
  `baseline_target_runs`. Across ChatGPT, Gemini and AI-Overview.
- **Named sources per answer** are captured (the `citations` array).

**What's genuinely missing:**
1. **Scale.** Everything is one-page-per-press, generate-on-demand, in the browser. There is no batch
   pipeline, no job runner for 500 pages, no persistence of generated output. 500 pages would be 500
   manual presses and 500 manual pastes today.
2. **The connection graph.** There is **no hub-and-spoke, no internal linking, no canonical-vs-
   supporting hierarchy, no clustering.** Pages are independent leaves. "500 *connected* pages" is the
   part the code does not model at all.
3. **One-question-per-page as a first-class object.** The generator writes a service+town page that
   may absorb several queries; it does not treat "one clear question + one standalone answer" as the
   unit. Close in spirit, not in structure.
4. **A publish pipeline with an approval gate.** There is none. Output is copy-paste; there is no
   draft store, no review/approve state machine, no publish step, no per-page status. The
   "clinical/human approval gate before publish" would be built from scratch. (`client_listings`
   exists and is empty — a possible home, but nothing uses it.)
5. **Storing generated pages at all.** Nothing persists a generated page, so you cannot diff, re-edit,
   re-approve, or track which of the 500 shipped. This is the prerequisite for everything in 1–4.
6. **Sources chosen deliberately.** The generator invents nothing and cites nothing itself; "named
   sources" in the answer sense is an audit-side artefact, not something the page generator plans or
   attaches per page.

**Blunt summary:** you have a strong *measurement* engine (citations across engines, over time, with
real before/after) and a decent *single-page* writer with honest quality guards. You do **not** have
a *content-graph builder* or a *publish/approval system*. The 500-connected-pages job is mostly new
build on top of the page generator — the plan/overlap logic and the anti-stuffing guard are reusable;
the batching, the link graph, the page store, and the approval-and-publish gate are not there yet.
```
