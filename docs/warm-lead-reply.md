# Warm lead research + reply drafter (2026-09-25)

Branch `feat/warm-lead-reply`. **Built and tested; not merged, not deployed, SQL not run** — Paul
reviews first.

## What it is

Once a cold prospect replies on WhatsApp, the Inbox reply box shows **Research & draft reply**. It:

1. reads what LeadFinder already holds (lead, newest hook/free-check audit, the lead's crawl-check
   row, the conversation, previous research, remembered sales facts);
2. reads the prospect's website **once** — only if nothing fresh is saved;
3. saves the result (`warm_lead_research`, one row per lead);
4. drafts a short reply in Paul's voice that **answers their latest message first**;
5. puts the draft **in the composer**. Paul edits and presses Send himself. **Nothing is ever
   auto-sent** — the function has no send path.

## Data model — `warm_lead_research` (migration `20260925120000_warm_lead_research.sql`)

One row per lead (`lead_id` unique, cascade on lead delete). RLS on, **no policies**, grants revoked
from anon/authenticated — service role only; the Inbox reads it through the function.

| Column | Holds |
|---|---|
| `research` jsonb | the `WarmLeadResearch` record (`src/lib/warmLeadResearch.ts`): summary, services, location signals, strongest/technical/content/local-visibility findings, ownership + provider clues, useful questions, operator warnings, sources, `technicallyClean`, `contentHash`, timings |
| `research_status` | `complete` / `partial` (model or some pages failed) / `failed` (homepage unreadable) / `no_website` |
| `generated_at`, `revalidated_at`, `source_crawl_at`, `content_hash`, `research_ms` | freshness + cost record |
| `sales_facts` jsonb | conversation facts, each `{ value, quote, messageId, at, source }` |
| `last_draft` jsonb | the last draft's metadata (question type, findings used, timings, checks) — never the text |

## Crawl / reuse rules (`planResearch`)

Cheapest first; only the `research` action ever touches the site.

- **Fresh** (younger than `WARM_RESEARCH_FRESH_MS` = the crawl-check month, same website) → reuse, fetch nothing.
- **Stale** → ONE homepage fetch; same `contentHash` → keep it (`revalidated_at`), else re-research.
- **Website changed / failed before / older version / none** → targeted pass.
- **Refresh research** (`refresh: true`) → targeted pass, whatever the age.
- **No website** → no fetch; the record says so and the reply may offer the new-site route.
- Targeted pass = homepage + up to `WARM_RESEARCH_MAX_PAGES − 1` of its own menu pages (contact,
  about, service pages first), 8 s per page, 25 s overall, 1 MB per page, public http(s) only.
- ⛔ **No full crawl, ever, from here.** The exhaustive crawl is the operator's Crawl site button. The
  fresh `lead_crawl_checks` row is REUSED (through `siteFindings.candidateFindings`, the hedged
  wording — never `buildFaultLines`, which is report copy with absolute AI claims), never written.

## Findings — nothing invented

- **Rules** (code, from page text): local-vs-nationwide positioning, conflicting opening hours, 3+
  phone numbers, no core-service pages for known trades (`CORE_SERVICE_TRADES`), "designed/hosted by"
  credits (→ ownership clue), homepage title without trade or town, noindex, off-site canonical,
  JS-only homepage, old copyright (trivia), no structured data (trivia).
- **Crawl row** and **audit** (named X of Y, rival names) findings are restated from measured rows.
- **Model** findings (gpt-4o-mini reading the same pages) must quote the page verbatim; `verifyQuote`
  checks each quote against the fetched text and **drops** any finding without one — the operator is
  told which. The model's strength is capped below what code measured; it cannot author an AI
  visibility finding.
- Strongest = verified, strength ≥ `MIN_SALES_STRENGTH`, one per kind, at most `MAX_STRONGEST_FINDINGS`.
- **Ryli Heat, read live 2026-09-25**: the rules alone find exactly the brief's four — "nationwide
  across England" vs "Scunthorpe-based", `9AM - 9PM` / `9AM - 9AM` / `Open 24 hours`, a menu of grants
  and insulation with no plumbing/boiler/emergency page, "Website Designed and Hosted by Keyhole IT
  Solutions ltd". Technically clean otherwise, and recorded as such.

## Reply generation (`src/lib/warmReply.ts`)

- The prompt opens with **their latest message** ("answer this first"), then the thread (last 20),
  what they've told us, the research, the audit, and per-reply instructions.
- Offer words are `FINDABLE_OFFER_SUMMARY` + `FINDABLE_GUARANTEE` verbatim; `warmReply.ts` writes no
  price literal (a test enforces it). Two models are stated (optimise their site / we build + host a
  new one); taking over an existing site is ruled out.
- **Ownership question** only when the research has an ownership clue AND `owns_website` is unknown.
- **Report link** only when they asked for it / what we found / what we'd change — otherwise the URL
  is not even in the prompt.
- `checkReply` then refuses (one automatic retry, then shown to Paul as "Check this draft"): guaranteed
  rankings/leads, any price but the offer's, "cancel any time", founder/CEO, no price in the first
  paragraph of a price answer, an uninvited report link, re-asking ownership, absolute claims about how
  AI decides, a site problem when the site was not researched. Warnings: long, lists, no next step, no
  findable.live on a price/how-it-works answer, ownership clue not used.
- Model unavailable → a rule-built fallback for price / how-it-works / tell-me-more only.

## WhatsApp window

`src/lib/serviceWindow.ts` (24 h from the newest inbound; the Inbox's `windowFor` now reads it). The
draft action checks the window from the operator's own inbound rows — the same rows
`send-whatsapp-message` reads — **before any model call**; closed → `window_closed`, no draft, no
spend, "approved template required". The sender's own check is unchanged and still the one that
refuses a send.

## Sales facts

Kept keys: `owns_website`, `has_existing_provider`, `interested_in_rebuild`, `requested_price`,
`prefers_call`, `not_interested` (yes/no). Proposed by keyword rules and by the model; **kept only
when the quote is found in one of THEIR inbound messages** (never ours, never under 8 characters —
a bare "Yes" is not a fact); a newer message replaces an older one. Stored on the research row only —
never on the lead, onboarding, or anything client-facing.

## UI

Compact row above the composer (only with a linked lead and an inbound message):
`Research & draft reply` → (fresh research) `Draft reply` + `Refresh research` → after a draft
`Regenerate` (same research, no site read) + `Refresh research` + `Why this reply?` (question
detected, findings used, research date/status, AI check, ownership, remembered facts, checks,
timings — "nothing has been sent"). Progress: Researching site… → Analysing… → Draft ready. A draft
replaces the box only after a confirm if Paul typed something of his own.

⚠️ **Found in the UI harness:** the outgoing composer's unmount flush wrote its OLD text over the
inserted draft in the saved-drafts map (the box looked right; switching thread and back showed the
old text). The warm path re-saves in a post-remount effect. The existing **Quick reply** insert has
the same trait and was left alone (out of scope).

Checked in a throwaway harness (real component + real composer, mocked function; deleted) at 375,
390 and 1280 px: no horizontal overflow; the closed window shows only the template note and makes no
call. Nobody has seen it on the real authed Inbox yet.

## Cost / speed

Per research pass: ≤ 6 page fetches (free) + one gpt-4o-mini call (~15k tokens in, ≈ $0.003). Per
draft: one call (~5k in, ≈ $0.001), two if the checker forces a retry. Both logged to `api_usage_log`
(`openai_warm_research`, `openai_warm_reply`). No Apify, no Google.

## To ship (Paul's call)

1. Run the migration SQL; read `warm_lead_research` back (columns, RLS on, no policies).
2. `npx supabase functions deploy warm-lead-reply` — the only function reaching the new code.
3. Merge → the SPA auto-deploys. Order: SQL → function → SPA (the button calls the function).
