# RECON_PAGEDB.md — proposal for the page-decision database

*Read-only recon, 2026-08-22. Nothing built. Field names, table names and RG's numbers are real,
pulled live. Honest about effort.*

---

## The idea in one line

Turn the page generator from a stateless copy-paste tool into a **stored graph of page records** — one
row per page, linked to the client, to the questionnaire that wanted it, and to the baseline audit
questions that measure it — so pages can be planned, approved, published and re-measured monthly as
records rather than regenerated from scratch each time. The blueprint is right: the database is the
product; the generator is just one writer into it.

---

## What already exists (reuse, don't duplicate)

| Piece | Where | What it gives the page DB |
|---|---|---|
| **The WANT side** | `onboarding_responses.services_list`, `areas_list`, `confirmed_location` (jsonb/text) | which service×town pages a client wants |
| **The MEASURE side** | `ai_audits` where `baseline_target_runs` is not null (the paid baseline), keyed to a client by `lead_id` | the audit whose questions measure the pages |
| **The measurements** | `ai_audit_queue` rows: `audit_id`, `run_id`, `question`, `result` (per-engine `named`/`competitors`/`citations`) | per-question, per-run citation data, over time |
| **The overlap logic** | `src/lib/pagePlan.ts` — `buildPagePlan(input)` returns `PlannedPage[]` with `{ service, town, queries[], slug }`, plus `excluded[]` and `unmeasuredAreas[]` | ALREADY decides which pages should exist and which questions each targets. Do not re-implement — persist its output. |
| **The writer** | `page-generator` edge fn (gpt-4o, anti-stuffing via `stuffingCheck`) | fills a page's content; today it returns to the browser and **stores nothing** |

The connective insight: `buildPagePlan`'s `PlannedPage` already maps almost 1:1 to a page record.
Its `queries[]` are the verbatim baseline questions that measure the page — and because a baseline
**re-runs the identical question strings** every cycle (that is what `baseline_target_runs` is for),
the **question text is a stable join key** into `ai_audit_queue` across all past and future runs. That
is the whole measurement link, for free.

**Do NOT use `client_listings`** — it exists but has 0 rows and belongs to the abandoned
delivery-checklist idea. New tables.

---

## Proposed schema — three tables

### 1. `client_pages` — one row per page (the core store)

```
id                  uuid    pk default gen_random_uuid()
lead_id             uuid    -> outreach_leads(id)      -- the client
user_id             uuid    -- owner, for RLS. ⛔ resolve from the DATA (the lead's user_id),
                            --    NEVER ADMIN_EMAIL and never a hardcoded UUID (the free-check lesson:
                            --    a wrong owner = invisible under RLS).
page_type           text    -- 'service' | 'qa'   (check constraint)
primary_question    text    -- the ONE question/intent this page answers. For a Q&A page this is the
                            --    literal question; for a service page it is the service+town intent.
service             text    -- the service (null for a pure Q&A page)
town                text    -- target town
slug                text    -- from pagePlan.slugFor(), stable
title               text    -- \
meta_description    text    --  } generated content; null until generated. For the RG capture slice
h1                  text    --  } these hold what is ALREADY live (paste or leave null at first).
body_html           text    -- /
parent_page_id      uuid    -> client_pages(id) null   -- the hub (hub-and-spoke hierarchy)
status              text    -- 'draft' | 'approved' | 'live' | 'archived'  default 'draft'
source_onboarding_id uuid   -> onboarding_responses(id) null  -- which questionnaire produced the plan
baseline_audit_id   uuid    -> ai_audits(id) null      -- the audit whose questions measure this page
published_url        text   null                       -- where it actually lives on the client's site
stuffing_verdict    jsonb   null                       -- the anti-stuffing grade at generation time
created_at          timestamptz default now()
updated_at          timestamptz default now()
```
Hub-and-spoke lives in `parent_page_id` (a spoke points at its hub; a hub has null parent). That
covers the hierarchy without a join table.

### 2. `client_page_questions` — the measurement link (the important one)

```
id                uuid  pk
page_id           uuid  -> client_pages(id) on delete cascade
baseline_audit_id uuid  -> ai_audits(id)          -- which audit these questions live under
question_text     text  -- VERBATIM baseline question, the stable join key into ai_audit_queue
role              text  -- 'targets' (the page's own query). Room for 'generic'/'related' later.
unique(page_id, question_text)
```
To measure a page's citation trend for the monthly report:
`client_page_questions` → `ai_audit_queue` on `(baseline_audit_id = audit_id AND question_text =
question)`, then read `result` per `run_id`/`created_at`. That yields named-rate over time per page,
per engine — the report's raw input — with zero new measurement infrastructure.

### 3. `client_page_links` — lateral edges (siblings / related). **Defer to stage 2.**

```
id           uuid pk
from_page_id uuid -> client_pages(id) on delete cascade
to_page_id   uuid -> client_pages(id) on delete cascade
link_type    text -- 'sibling' | 'related'   (hub/spoke already in parent_page_id)
unique(from_page_id, to_page_id, link_type)
```
Not needed to prove the concept — `parent_page_id` gives the graph its spine. Build this only when
siblings/cross-links are actually rendered.

---

## The smallest first slice — capture RG, generate nothing

RG Locksmiths is the ideal test: real paid baseline, Huntingdon pages already live. Live data:
- lead `800425fe-…`, baseline audit `f64920ce-…` (`baseline_target_runs = 3`, Huntingdon).
- **12 distinct baseline questions, 3 runs, 36 `ai_audit_queue` rows** — e.g. "emergency lockouts
  locksmiths in Huntingdon UK", "lock changes locksmiths in St neots UK", "best locksmiths in
  Huntingdon UK".
- `buildPagePlan` over RG's `services_list` (4) × `areas_list`/`confirmed_location` (Huntingdon + 7)
  intersected with those 12 questions → **~10 pages** (measured earlier).

Slice = **capture what exists into the new tables, read it back as a graph. No generation.**
1. Run `buildPagePlan` for RG (existing function, existing inputs).
2. Insert one `client_pages` row per `PlannedPage` — `status = 'live'` (the Huntingdon ones are
   already published), `body_html` left null for now, `baseline_audit_id = f64920ce`,
   `source_onboarding_id` = RG's newest paid onboarding row, `user_id` = the lead's `user_id`.
3. Set `parent_page_id`: make the "best locksmiths in Huntingdon" / homepage-intent the hub, the
   service+town pages its spokes (or a synthetic Huntingdon hub row).
4. Insert `client_page_questions` from each page's `queries[]` (verbatim), `baseline_audit_id` set.
5. One read query joining `client_pages` → `client_page_questions` → `ai_audit_queue`, printing per
   page: its hub, the questions that measure it, and the latest `named` true/false per engine.

**Deliverable you can see:** RG's page graph, each page showing its current Gemini/ChatGPT named-rate,
pulled from data that already exists. That alone proves the store + the measurement link + the graph
spine, and it spends nothing (no OpenAI, no Apify).

---

## Staged build plan

**Stage 1 — the store + RG capture (small, ~a day).**
- One migration (hand-run in the SQL editor, per repo rule) creating `client_pages` and
  `client_page_questions`, both RLS-enabled with an owner policy on `user_id`.
- A capture routine (edge action or one-off script) that reuses `buildPagePlan` and writes RG's ~10
  pages + their question links, as above.
- One read query/view proving the graph + live citation state.
- **Ships:** RG's existing pages, as records, with their measurement wired. Testable immediately.
- **Risks:** owner resolution (from data, not ADMIN_EMAIL); the `question_text` join must be exact —
  it is, because baselines re-run identical strings. RLS-with-no-policy returns `200 []` not an error,
  so add the policy in the same migration and verify with `pg_policies`.

**Stage 2 — write path + approval (medium).**
- Point `page-generator` at `client_pages`: generate → write a `draft` row (title/meta/h1/body_html +
  `stuffing_verdict`) instead of returning to the browser and storing nothing.
- Status machine: draft → approved → live → archived, with a "clinical/human approval gate" — an
  operator screen listing a client's pages, each showing status, content, anti-stuffing grade, and its
  live citation state, with an Approve action.
- Add `client_page_links` if siblings/related links are being rendered by then.
- **Ships:** the actual product shift — pages persist, are reviewed, approved before publish.

**Stage 3 — the graph + measurement rollup + scale (larger, weeks).**
- Q&A page type at volume (conversational questions as first-class pages), hub pages, sibling links.
- A per-page citation time-series (named-rate per engine per month) — the monthly report's data model
  — rolled up from `ai_audit_queue` via the question link.
- Batch generation + publish tracking (`published_url`), so "N of 500 live" is a real number.
- **Ships:** the monthly-service engine the blueprint describes.

---

## Honest notes

- Stage 1 is genuinely small because the hard parts already exist: the overlap logic (`buildPagePlan`)
  and the measurement data (`ai_audit_queue`, re-run on stable question strings). The new work is
  three tables and a persistence pass.
- The generator storing nothing today is confirmed — it returns JSON to the browser. Stage 2 is where
  "database is the product" actually changes behaviour; Stage 1 only captures.
- Everything here is additive: no existing table or function changes in Stage 1, so it cannot break
  the live audit/outreach flows.
- OpenAI being out of credit does not block any of this — capture and measurement need no generation.
