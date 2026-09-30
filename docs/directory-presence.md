# Directory + public-profile presence engine (2026-09-30)

Where a business is already listed, whether those listings agree with each other, and which missing
sources are worth the work. **Discovery and audit only.** Nothing here creates, claims or edits a
listing anywhere. This is not a "submit to 100 directories" tool.

- Pure decisions: `src/lib/directoryPresence.ts` (identity, matching, consistency, the citation fold,
  recommendations, the recheck merge, the hub's summary shape) and `src/lib/presenceSources.ts` (what
  each host IS: profile-URL shape, kind, credential, never-recommend reasons). Keyed by HOST, never by
  trade (the `directoryFacts.ts` guardrail applies here too).
- Gathering + storage: edge fn `directory-presence` (admin only; `verify_jwt = false`, handler-side
  `requireAdmin`, or `CRON_SECRET` for a future scheduled recheck).
- Tables: `lead_directory_presence` (one row per lead × source, unique index) and
  `lead_directory_presence_runs` (one row per check). Migration
  `supabase/migrations/20260930120000_directory_presence.sql`, applied 2026-09-30 one statement at a
  time and read back: 31 + 16 columns, RLS on, **zero policies** (service-role only), every CHECK list
  equal to the module's constants.
- Tests: `scripts/directory-presence.test.ts`.

## 1. What already existed (recon)

| Capability | Where | State |
|---|---|---|
| Directory facts (what a host IS, who can action it, cost) | `src/lib/directoryFacts.ts` (64 hosts) | live, reused |
| Host matching without substring traps | `src/lib/directoryHosts.ts` (`hostMatches`, `hostnameOf`) | reused |
| Trade-level citation fold (host × trade × audits) | fn `playbook-evidence` | **broken**: folds the whole `ai_audit_queue` through PostgREST and answers 500 "canceling statement due to statement timeout" (measured 2026-09-30, 43 s). Not reused — replaced for this engine by `presence_trade_citation_hosts` |
| Organic "is the business on X" search | fn `check-directory-listings` → `lead_directory_checks` (2 rows ever, 2026-08-14) | **orphaned** since the Playbook UI was removed (commit `8f321486`); nothing calls it |
| Per-audit own citations | `src/lib/ownCitations.ts` | no importers; its `looksLikeOwnListing` was tried and rejected here (see §3) |
| Site crawl: socials, directory brand names, full-crawl `profiles` (with URLs) and `credentials` | `lead_crawl_checks.result.siteInfo`, `.full_evidence.business` | reused as evidence |
| Schema `sameAs` | nowhere — `siteEvidence.ts` deliberately never reads it | **new** here (`extractSiteSignals`) |
| Google's record (phone, website, address) | `phone_cache` (written by `google-place-details`) | reused, free |
| AI answer citations + competitor names | `ai_audit_queue.result[engine].citations / .competitors` | reused |
| Lead fields | `outreach_leads.facebook_url/_method`, `instagram_url/_method`, `place_id`, `google_maps_url` | reused |
| `client_listings` (done/verified per host) | table, 0 rows | not reused — no writer since the Playbook went |
| Bing data | none anywhere | Bing Places is a tested NEGATIVE (never cited) — never recommended |
| Web search | Apify `apify~google-search-scraper` (organic-only input, as `check-directory-listings`) | reused, the only spend |

## 2. Sources searched per check

Free, every run: the lead row · Google's cached record (`phone_cache`) · the stored crawl (socials,
full-crawl profiles and credentials) · the homepage and up to two same-site contact/about pages,
fetched now (links, schema `sameAs`, `tel:` links, schema telephone/postcode, visible text) · every
citation in this lead's own audits · the trade citation fold for THIS trade: the trade's audits picked in the edge with the same `norm()` rule the fold keys on (`tradeKeys`), aggregated in the database by `presence_trade_citation_hosts(_audit_ids)` (migration `20260930130000_…`, read-only, EXECUTE revoked from public/anon/authenticated, ~4.5 s for the largest trade).

Optional (`search: true`), the only spend: up to three organic searches — `"<name>" <town>`, the
site's phone in quotes, `"<domain>" -site:<domain>` (`presenceQueries`). Refused under the
emergency stop (`allStopRefusal`) and at `USAGE_CRITICAL_PCT` of the Apify cap, before anything is
written. Billed cost is stored on the run row. Each search waits up to `RUN_TIMEOUT_MS` (100 s — three of eight live searches timed out at 60 s) and a run we stop waiting for is ABORTED so it stops billing.

## 3. Matching and confidence

Signals: `linked_from_site` · `operator_recorded` (a URL typed on the lead, `*_method = 'manual'`) ·
`place_id` · `phone` · `domain` · `postcode` · `name` · `town` · `profile_page`. Conflicts: a
different phone / postcode / website on the listing.

| Confidence | Rule |
|---|---|
| CONFIRMED | the lead's own Google place · or a profile page the business's site links to (or an operator recorded) · or name + phone/domain/postcode · or phone + domain |
| LIKELY | a profile page showing the phone or the domain but not the name · or a DISTINCTIVE name + the town with no conflict |
| UNVERIFIED | a distinctive name only, or a distinctive name with a conflict |
| no match | anything else — **a generic name alone is always no match** |

- **A name is never enough.** "Distinctive" = `nameIsTextJudgeable` (the report's own ruler): "AK
  Electrical" in Whitehaven and "BS Electrical" survive nothing once trade and town are removed, so
  their name can never raise a match.
- **Search and category pages are never listings** (`isProfileUrl`: known profile shapes per host —
  `/biz/`, `/trades/`, `/profile/`, `/review/<domain>` … — else a non-trivial, non-search path).
- **URL slugs count only when the WHOLE name is in them** (`slugCarriesName`). Measured: with
  `looksLikeOwnListing`'s two-token rule a Timpson store page at `/shoe-repairs` read as "Ronnie's
  Shoe Repairs".
- **Shared public numbers identify nobody** (`SHARED_PUBLIC_NUMBERS`): SC Plumbing's own site carries
  0800 111 999, the gas emergency line.

## 4. Consistency checks

Only on a CONFIRMED listing, only for fields where both sides are known, and never a source against
itself (the lead row was scraped from Google, so Google's record is compared with the website's values
only). Fields: phone ("possibly an old number"), website (with "the old domain" when the stored domain
now redirects to the served one), address/postcode, name (Google's structured name only — page titles
are too noisy), **duplicate** (two distinct profile ids on one source; `profileKey` treats
`/Page` and `/Page/reviews/`, Facebook's `/<id>/` and `/p/<Name-id>/`, utm tags and Maps short links as
the same profile — all measured false duplicates; a Facebook group post is never a profile), and
**unconfirmed** (a possible listing a human must check before anyone creates a second one). A
site-linked social handle that names something else (RG Locksmiths →
`facebook.com/RGCarpentryAndBuilding`) is a NOTE in the reason, not an issue — as is a LIKELY listing
carrying their phone or website but not their name (RG's details on a Houzz profile for "RG Carpentry
and Building": "possibly listed under another or older name"). `fields_compared` records
what was actually compared, so "no issues" is never read as "all fields agree".

## 5. Prioritising what is worth adding

Nothing is "worth adding" without POSITIVE evidence. Candidates: the Google Business Profile (the
one core source), hosts cited in the client's own answers, hosts in the trade fold, and registers
for credentials the client's OWN site claims (names from `fullCrawl.ts`'s `CREDENTIALS`, one ruler).

- **high** — the GBP is missing · a credential claimed on the site with no register profile found ·
  client evidence is strong: ≥2 other businesses' profiles on it cited in their answers, or cited on
  ≥ `CLIENT_STRONG_SHARE` (15%) of their questions (and ≥2).
- **medium** — some client evidence plus trade evidence, or trade evidence alone at ≥
  `TRADE_STRONG_SHARE` (20%) of the trade's audits and ≥ `EVIDENCE_MIN_AUDITS`.
- **low** — one client citation, or trade evidence at ≥ `TRADE_SOME_SHARE` (5%) and ≥ `THIN_MIN_AUDITS`.
- Caps: pay-per-lead marketplaces never high; a trade body / manufacturer scheme the site does not
  claim never high ("worth it only if they qualify"). Cost, actor and client-only are stated.
- Town portals (`townOnly`) only for their own town.
- The trade fold counts as a SHARE: the first live run (absolute `THIN_MIN_AUDITS = 2`) listed 19
  sources for RG, including 192.com at 7 of 478 locksmith audits. With shares: 9.

## 6. Competitor evidence

Per source, from the client's own answers: which questions cited it, which engines, how many
**other businesses' profiles** on it were cited (distinct profile ids), and which rivals the citing
answers named. Rival names pass `isProvableJunkName`, `classifyKnownEntity` (directories out), not the
town, not a source label, and **two words or more** (live lists carried "Huntingdon", "Ramsey",
"Services", "Give"; a one-word brand is lost, deliberately). Phrased as evidence — "3 other
businesses' profiles on it were cited; theirs was not. Answers that cited it named: …" — never as
cause. The test sweeps every reason for ranking promises.

## 7. Junk / spam protections

`NEVER_RECOMMEND_HOSTS` (mass-submission networks and scraped aggregators: hotfrog, brownbook, cybo,
misterwhat, ratingsnearme, topratedlocksmiths, company-data aggregators …) · `directoryFacts` kinds
that are not listings (own-site, editorial, community, aggregator, register, `notAListing`) · Bing
Places (tested negative) · statutory registers · every unclassified host. A confirmed listing on a junk
host is still RECORDED (an old phone there is a real consistency fact) but never prioritised. An
unclassified host that looks directory-like (cited on ≥20% of the questions, ≥2 distinct profile pages,
not named like a business in the trade or like a rival) goes to `review` — a human look, never a task,
at most 8.

## 8. Data model and API

`lead_directory_presence` — `source_key` (host, or `google-business-profile`), `source_label`,
`source_kind`, `status` (`existing` · `needs_attention` · `worth_adding` · `not_relevant` · `added` ·
`verified`), `status_source` (`check` / `operator`), `previous_status`, `match_confidence`,
`listing_url`, `match_signals`, `found_details`, `inconsistencies`, `fields_compared`, `priority`,
`reason`, `evidence`, `discovered_via`, `first_seen_at`, `last_checked_at`, `last_seen_at`,
`status_changed_at`, `verified_at`, `check_count`, `last_run_id`, `operator_note`,
`operator_updated_by/_at`. `lead_directory_presence_runs` — status, searched, sources used, queries,
Apify run ids, cost, counts, review list, notes, error.

Rechecks (`mergePresence`): upsert on (lead, source) — never a second row. `first_seen_at` kept,
`last_checked_at` moves on every row, `last_seen_at` only when the listing is actually seen.
**Absence never downgrades** a listing. The operator's `not_relevant` stands whatever a check finds;
`added` becomes `verified` when a check finds the listing; a `verified` listing a check finds a problem
with becomes `needs_attention`. One run per lead at a time (`IN_FLIGHT_MS`).

**Rule changes re-judge old rows** (`PRESENCE_ENGINE_VERSION`, stamped on every finding as
`evidence.engine_version`; bump it with any change that could withdraw an earlier finding). "Absence
never downgrades" guards against search variance, not against a fixed rule: a check-owned row written
under an older version is re-judged when this check re-ran every kind of discovery that found it (a
search-found row is never withdrawn by a check that did not search). If the current rules no longer find
it, it becomes `not_relevant` (status_source `check`, reason "Withdrawn: …", previous status kept) —
never deleted. Operator rows are never touched. Version 2 (2026-09-30) withdrew the first live run's
false rows.

`POST /functions/v1/directory-presence`:
- `{action:"summary", lead_id}` → `{ok, summary}` — free.
- `{action:"run", lead_id, search?:boolean}` → `{ok, run_id, partial, notes, summary}`.
- `{action:"set_status", lead_id, source_key, status:"added"|"verified"|"not_relevant"|"reset", listing_url?, note?}` → `{ok, summary}`.

`PresenceSummary`: `checked`, `last_checked_at`, `searched`, `counts {already_on, needs_attention,
worth_adding, in_progress, not_relevant}`, and the lists `already_on` (existing + verified, by
confidence), `needs_attention` and `worth_adding` (by priority), `in_progress` (operator-added, not yet
seen), `not_relevant`, `review`. Each item: label, kind, status, confidence, listing_url, priority,
reason, issues, evidence, first/last checked/last seen, set_by_operator, recognised (a source we hold a
record for, as against a host seen only in a search — scraped aggregators; ALREADY ON lists recognised
first).

## 9. Paid Client hub integration — NOT done, deliberately

Another session owns the Paid Client hub / Discovery / Baseline UI; none of its files were touched.
To integrate once that branch has merged:
1. A client-side caller: `edgeInvoke('directory-presence', {action:'summary', lead_id})` on open (free),
   and a "Check listings" button for `{action:'run', search:true}` that prices itself on its face
   (up to three searches) — opening the view must never spend.
2. A panel in `src/pages/ClientHub.tsx` with three groups from the summary — ALREADY ON / NEEDS
   ATTENTION / WORTH ADDING — each count in its header, confidence and issues per row, the reason
   verbatim, recognised sources above search-only hosts, and per-row buttons for `set_status` (Mark added · Not relevant · Reset). Show "Never
   checked" when `summary.checked` is false and "Not searched yet" when `searched` is false.
3. Add the new screen to `OPERATOR_SCREENS` (it contains competitor names — operator copy, never sent
   to a client). No change to `paid-client-hub` is needed; the function is self-contained.

## 10. Live results (2026-09-30, free evidence, read-only harness)

| Business | Case | Result |
|---|---|---|
| Brodley Locksmiths (Clacton) | multiple known profiles | 5 ALREADY ON, all confirmed by site links (Yell, Checkatrade, MyBuilder, Facebook) + GBP |
| RG Locksmiths (Huntingdon, paying) | competitor/trade evidence | Checkatrade, Yell, TrustATrader high (cited on 14/12/3 of 15 questions; 11 rival Yell profiles); MLA medium (not claimed on site); Facebook confirmed but the handle is RGCarpentryAndBuilding → note |
| MCLocksmiths (Canterbury, paying) | trade-specific | Checkatrade likely (name + town, cited on 52 of 85 questions); Facebook/Yell/Trustpilot high (13, 8, 5 rival profiles cited) |
| AK Electrical (Whitehaven) | common name | Name can never match; site links confirm Facebook/Instagram; NAPIT high (the site claims NAPIT) |
| BS Electrical (Stockton) | common name | Only site-linked/Google listings; nothing matched by name |
| Giles Plumbing (Redditch) | full crawl | Checkatrade confirmed from the full-crawl profiles; Gas Safe, CIPHE, Worcester Bosch high — all claimed on the site |
| SC Plumbing (Tamworth) | inconsistent-contact risk | gas emergency line on the site → excluded from matching |
| Farid Driving School (Walsall) | no website | GBP only; three low/medium trade-evidenced sources |

No inconsistency was flagged on any of the eight from free evidence. Every Google record agreed with
its website where both were known. Inconsistencies mostly come from searched listings, which only the
deployed function can run (no Apify token outside the edge).

## 11. Limitations / follow-ups

- The Google Business Profile check uses the cached record; businesses with no `place_id` get a
  check-first "no profile on record".
- A search reads one page of organic results per query; a listing on page 2 is not seen (absence is
  never an answer, so nothing is downgraded by it).
- `playbook-evidence` itself still times out; its only remaining caller is the orphaned `check-directory-listings`. Fixing or retiring both is a deep-clean decision.
- `check-directory-listings` + `lead_directory_checks` and `client_listings` are superseded by this and
  unused; retiring them is a deep-clean decision for Paul.
- `_shared/safe-fetch.ts` holds the same SSRF guard + capped reader as `_shared/site-research.ts`
  (two copies). It exists so this function does not import site-research, whose closure is the whole
  report/hook stack (hookScore, auditReport, salesStyle…) — that had made directory-presence one of the
  functions to redeploy whenever those change. Switching site-research onto the leaf means redeploying
  warm-lead-reply and voice-note-script (other sessions' functions) — owed, not done. The function's
  closure is now 20 files: `directoryPresence`, `presenceSources`, `directoryFacts`, `directoryHosts`,
  `buildPlaybook`, `nameMatch`, `fullCrawl` (+ `crawlCheck`, `crawlUrl`), `competitorCleaning`,
  `knownEntities`, `protectionLimits`, `roleRules`, and `_shared/` `access`, `operator-auth`,
  `protection`, `safe-fetch`, `enrichment/apify`, `ai-search`, `apify-usage`.
- The Social Profiles work (`src/lib/socialProfiles.ts`, fn `social-profiles`, merged by another session
  the same day) finds Facebook/Instagram with confidence grading. This engine reads the lead's
  `facebook_url`/`instagram_url` and treats `*_method = 'manual'` as operator-recorded; a later pass
  could read social-profiles' confidence too.
- Host lists overlap three ways (`siteInfo.ts` SOCIAL/DIRECTORIES, `fullCrawl.ts` THIRD_PARTY,
  `presenceSources.ts`): consolidating onto `presenceSources` is owed, not done here (those feed live
  crawl output another session reads).
