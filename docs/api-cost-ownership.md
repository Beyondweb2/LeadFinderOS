# API cost ownership — who paid, and the per-provider cutoffs (2026-09-30)

Paul: "Any API usage paid for by Move37 before the migration is NOT a Findable business expense and must
not be included in Findable's cost or contribution calculations." Each provider moved from Move37's
credentials to Paul's own on its own day. Builds on `docs/sales-workflow-nav.md` §Release B.

## The switch instants and the evidence

The instant is when the Supabase secret the code reads was replaced — Management API
`GET /v1/projects/<ref>/secrets` returns `updated_at` and a SHA-256 digest per secret (never the value).
Earlier sessions' secret listings (in the Claude transcripts, 2026-07-09 → 2026-09-30) show each of the
three held **one** digest from June/July until that instant, and one other since — exactly one change
each, so there is no other candidate date.

| Provider | Switched (UTC) | Old value set | Corroboration |
|---|---|---|---|
| Apify (`APIFY_TOKEN`) | **2026-09-17 11:21:43** | 2026-06-30 | `apify_account_usage` (read every 15 min from Apify's own API): 11:13 reading = old account (cycle 4 Sep–3 Oct, $50.50 used, $175 cap, 32 runs / 64 GB); 11:28 reading = a different account ($0.00 used, $5 cap, 5 runs / 16 GB, cycle from 12 Sep); from 13:29 the same account on a paid plan (cycle 17 Sep–16 Oct, $19 cap). Paul, that session: "I'll enter my own Apify account's token". All seven actors are public Store actors, none tied to Move37's account. |
| Google Maps (`GOOGLE_MAPS_API_KEY`) | **2026-09-18 06:26:02** | 2026-07-01 | No session was open that day (Paul changed it in the dashboard). Every Google caller reads this one key (`google-place-details`, `search-leads`, `niche-sample`, `place-town.ts`, `place-resolve.ts`). Paul, 2026-09-30: Google Places "is currently on a free trial" — consistent with a new billing account. |
| OpenAI (`OPENAI_API_KEY`) | **2026-09-21 05:56:45** | 2026-06-30 | Paul, 06:10 UTC: "The OpenAI API key has now been replaced"; credits were added to it minutes later (the 429 `no credits` outage ended then). |

Weakest link: for Google and OpenAI the key change is proven, but that the NEW key is on Paul's own
account rests on Paul's statement (no account identifier is readable from here). For Apify the account
change itself is proven by Apify's own figures.

## The rule (one place: `src/lib/apiCostAccounting.ts`)

- `PROVIDER_MIGRATIONS` holds the three instants + evidence; `MIGRATION_BOUNDS` is the sorted list.
- SQL `admin_api_cost_seg` / `admin_api_cost_detail_seg` (migration `20261001210000`, additive, service
  role only) are given the bounds and return `seg` = how many bounds are ≤ the row's `created_at`. The
  SQL does not know the dates or the providers; `fundingOf(api_type, seg)` decides.
- The provider is `costProviderOf` — so a Google call routed through the Apify runner
  (`apify_place_details`, `apify_place_search`) follows GOOGLE's date, and `apify_site_details` (OpenAI)
  follows OpenAI's.
- Four buckets (`costOwnerOf`): **Findable usage** (after the switch, not a test account) · **Findable
  testing** (after the switch, a test account — a real Findable cost, still out of sales performance) ·
  **Move37-funded (historical)** (before the switch, whatever the project — the project is kept as a
  sub-split: Findable work / barber legacy / not identifiable) · **Unallocated** (a provider with no known
  switch, or a retired unattributable tool on Findable's account).
- `isFindableCost` = Findable usage + testing. **The loader's `costRows` keeps only those rows**, so the
  period total, today / yesterday / week / month, the Money overview contribution, per-person costs,
  by-feature / by-provider, the attention "spending with nothing collected" check and the weekly AI
  summary all read Findable-paid usage. The old `admin_api_cost` / `admin_api_cost_detail` stay in the DB,
  unread by the dashboard.
- Google's free allowance is per billing account → computed on Findable-paid rows only (Move37's calls
  never used Findable's free calls).
- Apify account check: recorded = Apify-billed rows on the new account only (previously every
  `apify*` row from cycle start, which counted 11 hours of the OLD account and Google/OpenAI calls).
- Untouched: `api_usage_log` rows (nothing rewritten), the spend guard (`guard_action`, `protection.ts`
  — reads the raw log), `apify-usage-status`, `/admin/api-usage` (raw log, now says so in one line),
  provider credentials and limits.

## Figures on 2026-09-30 (live replay of the dashboard maths)

All recorded usage ever: **$391.93** = Findable $77.94 + testing $2.97 + Move37-funded $311.01 +
unallocated $0.00. Move37-funded by project: Findable work $295.75 · barber legacy $1.08 · not
identifiable $14.19. By provider — Apify: Move37 $134.13, Findable $22.68 · Google: Move37 $119.77,
Findable $48.55, testing $2.97 · OpenAI: Move37 $57.11, Findable $6.71.

Dashboard, last 30 days: **$214.83 before → $80.92 after** (Move37's $133.91 left out). Google September
after the free allowance: **≈$45.66 before → ≈$14.90 after** (1,745 Place Details Enterprise calls on
Paul's account vs 3,283 across both). Apify cycle: account $27.81 vs recorded on it $22.68 → $5.13
unallocated (provider-reported, not in our log).

Confirmed charges: still none — no billing data is connected. All figures are estimates except Apify's
account figure, which is provider-reported usage (not an invoice).
