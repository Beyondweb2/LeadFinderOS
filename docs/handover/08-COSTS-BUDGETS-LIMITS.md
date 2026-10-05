# 08 — Costs, budgets and limits

*Values read from code at `main` `4ed16813` and from the live database on 2026-10-05. All money here is **US dollars**
(provider costs), not the £ client prices. Rules: never write a cap or a price as a bare number in code comments or
prose that will go stale — name the constant.*

## Who pays the providers

Every paid API is on **Paul's own accounts** now — Apify since 17 Sep 2026, Google since 18 Sep, OpenAI since 21 Sep
(`PROVIDER_MIGRATIONS`, `src/lib/apiCostAccounting.ts`; record `docs/api-cost-ownership.md`). Usage before those dates
was Move37's and is history only, never a Findable total. A new paid provider needs its date added there.

## Apify — the single point of failure

Every AI question (ChatGPT and Gemini answers are scraped via Apify actors) and every SEO scan goes through Apify, which
has a **monthly spending cap set in the Apify account**. At 100% everything stops together, paying clients included.

| | Value (live, 2026-10-05 06:03 UTC) |
|---|---|
| Monthly cap in the Apify account | **US$40** |
| Used this cycle | US$29.04 (≈73%) |
| Cycle | 17 Sep – 16 Oct 2026 |

🔴 **OUTSTANDING MANUAL ACTION — raise the Apify monthly cap to about US$150** (Paul's decision 2026-10-05, made when the
sales allowance was set to 30/day). It is still US$40. At US$40, prospecting stops at 85% (≈US$34), so only a few dollars
of prospecting remain this cycle. This is done in the Apify dashboard by Paul; Claude cannot and must not change it.

- Usage is captured from Apify's API every 15 minutes into `apify_account_usage` (service-role only; admin view via fn
  `apify-usage-status` and the AI Audit / API Usage screens). Always compute % = used ÷ cap, never trust a stored
  `usage_pct`.

## Budget pools — three separate daily pools (`src/lib/auditBudget.ts`)

Audit spend is split by purpose so that a busy day of prospecting can never block a client's guarantee measurement.
⛔ Never go back to one shared cap.

| Pool | What it pays for (`audit_purpose`) | Daily cap (rolling 24 h) `POOL_DAILY_CAP_USD` | Stops at Apify % `APIFY_RESERVE_PCT` |
|---|---|---|---|
| **guarantee** | `baseline`, `remeasure` | **$10** | **100%** (runs to Apify's own cap) |
| **client** (other client work) | `measurement`, `discovery`, `weekly_check` | **$8** | **95%** |
| **prospecting** | everything else — hook audits, sales pre-call checks, free checks, missing purpose | **$12** | **85%** |

- Refusal order: Apify reserve → pool cap → (for sales checks) the rep's allowance.
- Ledger: `enrichment_usage.budget_pool` (old rows with no pool count as prospecting). Per-run hard ceiling `CAP_USD = 1.0`
  in `process-ai-audit-queue`.
- If the Apify reading is missing, the pools do not refuse on that ground; an unreadable POOL refuses (fail closed) for
  sales checks.

## Sales pre-call checks ("Check before calling")

| Rule | Value | Where |
|---|---|---|
| Fresh checks per salesperson | **30 per rolling 24 h** (admin-configurable on API Usage & Security; malformed = 30, never unlimited; 0 allowed) | `protection_settings.limits.actions.sales_check.per_day` (live row = `{"paid":true,"per_day":30}`), default in `DEFAULT_PROTECTION_LIMITS` |
| Leads per batch | **20** — more is refused (`too_many`), never sliced | `SALES_CHECK_BATCH_MAX` |
| Reuse window | a finished check younger than **14 days** is reused | `SALES_CHECK_AUDIT_REUSE_DAYS` |
| "Check again" | only buys a new check if the result is at least **2 days** old | `SALES_CHECK_REFRESH_MIN_DAYS` |
| Crawl reuse | **30 days** (and current version, real read) — the crawl is free | `CRAWL_FRESH_MS`, `crawlUsable` |
| Cached / reused results | **free, no guard row, do not count** against the allowance | `planItem` |
| Per-lead hook limit | 3 hook audits per lead per day | `SALES_HOOKS_PER_LEAD_PER_DAY` (`create-ai-audit`) |

One check = the standard hook audit: **3 questions × ChatGPT + Google AI × 1 run**, `audit_purpose = 'audit'` →
prospecting pool. Never a baseline. Fn `sales-prospect-check` only (never the admin `bulk-jobs`, which keys on the whole
book).

## What things cost (measured, not price-list guesses)

| Item | Cost | Constant / source |
|---|---|---|
| One fresh prospect check (3 questions, 2 engines) | **≈US$0.033** (average of 579 real hook runs; the one live QA check on 5 Oct cost ≈US$0.033 all-in) | `OUTREACH_AUDIT_EST_USD = 0.0331` |
| Google town lookup | ≈US$0.005, at most once per lead per 30 days | geocoding |
| Ledger rate per AI question | US$0.0104 | `AI_SEARCH_USD_PER_QUESTION` |
| Forecast rate per question (deliberately higher) | US$0.014 | `AUDIT_EST_USD_PER_QUESTION` |
| SEO scan | ~US$0.02–0.08 (ledger US$0.04) | `SEO_SCAN_USD_PER_SCAN` |
| Google Text Search Enterprise / Place Details Enterprise | US$0.035 / US$0.020 | CLAUDE.md §4 |
| gpt-4o-mini | US$0.15 / US$0.60 per 1M tokens in/out | CLAUDE.md §4 |

**Rule of thumb for a rep:** 30 checks a day ≈ US$0.99/day ≈ US$22/month (22 working days). Five reps at full use ≈
US$109/month — close to the prospecting line at a US$150 cap (85% ≈ US$127). The binding limit is the Apify **monthly**
cap, not the daily pool.

**Client work:** a formal baseline is 20 × 3 × 2 = 120 answers; Discovery is ~40+ questions × 3 runs × 2 engines. Both
are client/guarantee pools and protected from prospecting.

## The abuse / cost guard (`public.guard_action`, `_shared/protection.ts`)

Every paid or data-heavy action a PERSON starts asks one server guard: suspension → global mode → burst windows → person
and team spend. Thresholds live ONLY in the `protection_settings` row (seeded from `DEFAULT_PROTECTION_LIMITS`).

- Modes: `running`, `prospecting_paused` (client measurement keeps running), `all_stop` (everything paid stops).
- Default spend thresholds (USD): person hour warn 6 / hard 15, person day warn 15 / hard 35, team hour warn 12, team day
  warn 50 / cap 100, Apify warn 90%.
- Per-action burst limits include `lead_search` 10/min 60/h, `place_details` 40/min 500/h, `hook_audit` 10 per 10 min and
  80/day, `copy_numbers` 10/h (Sales), `export_csv` not allowed for Sales, `sales_check` 30/day.
- The ledger is `api_usage_log`; a row with `api_type = 'guard'` is an estimate, never a charge — exclude it from every
  spend total. Sales never sees a cost; refusals say `USAGE_PAUSED_DETAIL`.
- Record: `docs/abuse-cost-protection.md`.

## Other limits worth knowing

- **WhatsApp:** daily send cap `DAILY_CAP`; the queue sends only 07:00–21:30 London for UK numbers (10:00–19:00 IST for
  +91) — name the constants, never the numbers. Replies follow Meta's 24-hour window.
- **Discovery dials:** 1–80 questions × 1–3 runs (`DISCOVERY_MIN/MAX_QUESTIONS`, runs), out of range is refused, not
  clamped. The full measure stays 20 (`FULL_MEASURE_QUESTIONS`); raising it is a spend decision.
- **Database:** the Supabase instance is a Micro with ~10 API connections shared by everyone — never poll faster than a
  query takes (`docs/site-wide-speed.md`).
