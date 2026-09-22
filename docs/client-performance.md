# Client Performance — Google Search Console (Phase 1, 2026-09-22)

The Paid Client "Performance" section: Google Search impressions, clicks, CTR and average position
for a client's pages, synced nightly from Search Console into Supabase and displayed from there.

**Phase 1 is Search Console only.** No GA4, no custom date range, no OAuth UI, no client-facing
login, no analytics pixel of our own, no combined score. Those were excluded by Paul's brief, and
the schema carries no placeholder columns for them — a column nothing writes is a column nobody can
tell is broken.

---

## The shape

```
Google Search Console API
  → performance-sync   (pg_cron, nightly 05:00 UTC, x-cron-secret)
  → search_console_page_daily / search_console_query_daily   (daily snapshots, upserted)
  → client-performance (operator JWT, SQL groups + sums, TS computes every rate)
  → /paid-clients/:leadId/performance
```

Its own route, not a ninth card inside ClientHub. The hub makes **one** `paid-client-hub` call for
all nine stages; a 90-day analytics read embedded there would be paid for on every visit to every
other stage. The Performance page is lazy, so it is its own chunk (`ClientPerformance-*.js`) — check
*that* chunk when verifying a deploy, not `index-*.js`.

## Files

| Thing | Path |
|---|---|
| The rules — URL identity, windows, rollups, states | `src/lib/searchPerformance.ts` |
| Google client (service account, RS256, readonly) | `supabase/functions/_shared/google-search-console.ts` |
| Nightly sync + bounded backfill | `supabase/functions/performance-sync/index.ts` |
| Read API | `supabase/functions/client-performance/index.ts` |
| Hook | `src/hooks/useClientPerformance.ts` |
| Screen | `src/pages/ClientPerformance.tsx` |
| Schema | `supabase/migrations/20260922000000_client_performance.sql` |
| Tests | `scripts/search-performance.test.ts`, `scripts/client-performance-api.test.ts` |

Tables: `client_search_connections`, `client_tracked_pages`, `search_console_page_daily`,
`search_console_query_daily`, plus `outreach_leads.canonical_domain`. Aggregates:
`search_console_page_totals`, `search_console_query_totals`, `search_console_coverage`.

---

## The rules, and why each one exists

**One normaliser, two runtimes.** `normaliseUrl()` decides what "the same page" means, and both the
sync (on write) and the read API (on join) import the same function from `src/lib/`. If the two
sides ever normalise differently the join matches nothing and **every page on the screen reads
"untracked"** — which is indistinguishable from "Google returned unfamiliar URLs". That is why the
module has no imports of its own (Deno and Vite both take it as-is) and why the contract test
asserts there is exactly one of it. Rule: https, host per the client's `canonical_domain` (so a
www-canonical client is not rewritten to an apex that does not serve), no query, no fragment, no
trailing slash except the root.

**SQL sums; TypeScript computes every rate.** The three aggregate functions return `clicks`,
`impressions` and `sum(position * impressions)` — three additive integers — and nothing else. CTR
and average position are derived in exactly one place, `finaliseTotals()`. The moment SQL returns a
ctr or a position, the rule exists twice and one copy drifts.

- **CTR is `sum(clicks)/sum(impressions)`, never the mean of daily CTRs.** A day of 1 impression /
  1 click averaged against a day of 1000 / 10 gives 50.5%; the true figure is 1.1%. Wrong by 46×
  and it looks entirely plausible.
- **Position is impression-weighted.** One impression at position 3 must not outweigh a thousand at
  position 12.
- **No impressions means `null`, not 0.** A 0 CTR reads as "we ranked and nobody clicked"; a 0
  position sorts best.

**Position improves when the number goes DOWN.** The sign flip lives in `changePosition()` and
nowhere else; every arrow and colour reads `improved`, never the sign of `delta`. No percentage is
offered for position — "62% better position" means nothing.

**Never manufacture a percentage.** Growth from a zero baseline has no percentage: the screen shows
the absolute delta and "—". A missing previous period is `null` all the way to the UI.

**Unknown URLs are surfaced, never dropped.** Search Console returns pages we do not track. The
snapshot tables key on a URL *string*, not a foreign key, so nothing has to be invented or
discarded; the join happens at read time and an unknown page renders as "untracked". Dropping them
would hide real traffic **and** hide a broken normaliser, because a join matching nothing and a
client with no traffic look identical once the rows are gone.

**The fold is what makes re-syncing free.** `foldDailyRows()` collapses Google's rows onto exactly
the unique key before they are written. Two URLs can normalise to one page (`/car-keys/` and
`/car-keys/?utm_source=gbp`), and upserting both in one statement is a hard Postgres error — *"ON
CONFLICT DO UPDATE command cannot affect row a second time"* — losing the whole day's write, not
just the duplicate. It lives in the shared library so it is unit-tested rather than trapped inside a
Deno handler nothing can run locally.

**Coverage is `max(date)`, never `last_synced_at`.** A sync that ran five minutes ago and returned
nothing must not imply there is data for today.

**There is no "data starts at verification" rule, anywhere.** Google can collect for a property
before it is verified. The `no_data` state says only what is stored. The contract test greps all
four source files for the word to keep it that way.

**Five states, each reached positively.** `not_connected` / `property_missing` / `no_data` /
`error` / `populated`, with no catch-all `else`. An **unknown** connection status resolves to
`not_connected`, never `populated` — an empty dashboard rendered as a real measurement is the
absent-value trap (§4) in its most expensive form. The `error` state prints the real
`last_sync_error`, which is the only thing distinguishing "the service account is not on that
property" from "the property string is wrong".

**A page rebuilt inside the compared span has its change suppressed.** Its "change" would measure
its own creation, and that number is worse than none because it looks like a result. A **null**
build date is *unknown*, not "today", and does not suppress — otherwise the feature would be
permanently useless on every client whose dates were never recorded.

**AI visibility and Google performance are never combined by any arithmetic.** Different things on
different scales; a blended figure would be indefensible in a refund conversation. The contract test
asserts no performance surface reads the AI measurement tables at all.

## Credentials

A Google **service account**, added as a user on the client's Search Console property. No OAuth, no
consent screen, no callback route, no refresh token. The key is one edge secret,
`GOOGLE_SERVICE_ACCOUNT_JSON`; it is never stored in a table, returned to a browser, logged, or
named in an error — a malformed key produces a message about what is *missing*. Access tokens are
one hour long and are never persisted. Scope is `webmasters.readonly` and nothing else.

## Sync

Nightly at 05:00 UTC, re-fetching a **rolling window of today-6 … today-2**. Google publishes recent
days late and revises them, so the window reaches three days past the display boundary
(`SETTLED_LAG_DAYS = 2`) and a revision arrives as an upsert rather than being frozen wrong. A
failed night is self-healing — the next run covers the same days.

Bounded by construction: a daily run does at most `MAX_CLIENTS_PER_RUN` clients × 2 API calls; a
backfill does **one** chunk of at most `BACKFILL_CHUNK_DAYS` and returns `chunks_total` /
`next_chunk` so the loop lives outside the edge wall clock. `mode: "properties"` is a setup probe
that lists what the service account can actually see — run it before debugging an empty dashboard.

## MCLocksmiths

Lead `6d0585ac-b4a3-463b-8150-c59c3dd0f0e5`, `mc-locksmiths.com`, property
`https://mc-locksmiths.com/` (URL-prefix form, trailing slash included — **not** the `sc-domain:`
form; they are different properties and the wrong one returns 403, not an empty set).

31 tracked pages, read from the live sitemap on 2026-09-22 and normalised by the shared function:
1 home, 22 service (including `/car-keys` and the `/services` hub), 2 location, 1 commercial,
5 other. Labels are each page's own `<title>`, cut at its first separator. `/cookies`, `/privacy`
and `/terms` are deliberately untracked.

⚠️ **`built_or_rebuilt_on` is NULL and `existed_before_findable` is false on every row, and that is
not a claim that the pages are new.** The sitemap carries no `lastmod`, nothing in the repo records
per-page build dates, and the lead's `website` already held this domain before payment — so neither
fact is establishable from evidence, and this feature does not infer facts about the project from
the shape of a URL. Until someone states them, comparisons run normally and no before/after-rebuild
framing is offered.

## Owed next

- Phase 2: connect UI (pick a property from the service account's list), page auto-discovery from
  the URLs Google actually returns, a "Sync now" button, rebuild-date capture wired to the Website
  Build stage, sync health on the Paid Clients list.
- Phase 3: GA4, in its own migration with its own property column.
