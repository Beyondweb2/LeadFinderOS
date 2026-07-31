# TASKS.md — live checklist for the wrong-town fix + active directory check

**Purpose: if a session runs out of room, this file says where to resume.** Update it after each item
with the commit hash and commit it. Do not batch items — ship and merge each one separately.

Started 2026-07-30, from `main` at `faf51457`.

---

## Order of work (and why it differs from the brief's numbering)

Item 4 is done FIRST because it is one line and because Item 3 spends real money — a cap tripping
mid-run leaves broken data, which is the exact failure Item 4 exists to prevent.

| # | Item | Status | Commit |
|---|---|---|---|
| 4 | Raise `DAILY_CAP_USD` 8 → 12 | ✅ **done, deployed** | `d9aa0559` |
| 1 | Fetch the real address (`getPlaceDetails`) | ✅ **done, deployed** | `ef86c9bf` |
| 2 | Use it — town precedence + override | ✅ **done, deployed** | `ef86c9bf` |
| — | Migration-tolerance fix (regression caught in test) | ✅ **done, deployed** | `3b93284d` |
| 3 | Active directory check (Apify search) | ☐ **NOT STARTED — THIS IS THE NEXT JOB** | |

> **Item 3 is next, and Paul is briefing it himself — do not start it from the spec below.**
> The checklist further down this file predates several things that have since changed (the Apify
> account cap, the client request form, the single playbook route). Wait for his brief, then
> reconcile it against that checklist rather than treating the old spec as current.

## Second brief, 2026-07-30 — lead enrichment incomplete, location data missing

Evidence: two leads added 30 Jul (Buddies Dog Grooming, Dogs of Southsea) had a valid `place_id`
and a phone fetched ~2.5s after creation, but `address`, `derived_town`, `town_fetched_at`,
`search_keyword` and `search_location` were all null — so an audit had no town at all and the
wizard's location box came up blank.

| # | Item | Status | Commit |
|---|---|---|---|
| 1 | Address + rating + review count on the existing Places call | ✅ **done, deployed, live-verified** | `80efe108` |
| 2 | Town fetch wired into lead creation, `town_fetch_note` diagnostic | ✅ **done, deployed, live-verified** | `80efe108` |
| 4 | Compare the two audit buttons (report only) | ✅ **reported** — see CLAUDE.md §8 table | — |
| 3 | Write `search_keyword`/`search_location` on add | ⏸️ **WAITING ON PAUL'S TEST — resume here** | |
| 5 | Share ONE input-resolution path across the audit buttons | ⏸️ **DEFERRED by Paul** until he verifies 1+2 | |

**Root cause of 1 and 2 was a stale comment**, not a failing fetch. See CLAUDE.md §4.

### 🔴 Item 3 is blocked on a test only Paul can run
He does not trust his memory of how he added the two leads, so rather than guess he is running:
  a) search → add a lead immediately → check `search_location`
  b) search → go to Outreach → come back → add → check `search_location`
My read of the code says (b) writes null and (a) works, because the keyword/location live in
`Index.tsx` page state while the RESULTS are restored from `sessionStorage`. **Do not fix this until
his result is in** — if (a) also writes null, the cause is elsewhere and the fix would be wrong.
Intended fix: persist the filters alongside the leads in `LeadSearchContext` and expose the last
search's keyword/location from the context, so they survive a remount exactly as the results do.

### Acceptance test Paul must pass before item 1+2 count as done
Add ONE new lead from a search → `address`, `rating`, `review_count`, `derived_town` and
`town_fetched_at` all populate. Then press the audit pill on that lead's Outreach row → the location
box is prefilled. A blank box was the original bug, so that is the test.
**Requires the SQL in `supabase/migrations/20260730_lead_creation_enrichment.sql` to be applied by
hand first.** Until then the code is inert but harmless — every path is migration-tolerant.
Rollback point if it fails: `ce59f40f` (the commit before this work).

### Third brief, 2026-07-30 — AI Audit page UI ✅ done, deployed, live-verified (`4fa0246c`)
| # | Item | Status |
|---|---|---|
| 1 | New-audit form → modal, deep link must still prefill | ✅ verified in a harness |
| 2 | LLM playbook off the audit rows, `checklist` pill kept | ✅ |
| — | Which pipeline made the Bing Places doc? | ✅ **the LLM one** — see CLAUDE.md §9 |

**`derived_town` is confirmed working live:** lead `c477e56c` reads `derived_town = "Barnsley"` with a
full address, and the modal prefilled its town from it. Item 1+2 of the second brief are proven.
⚠️ It also proves the coarseness caveat: "…of **Dodworth**" derived **Barnsley** (Dodworth's
`postal_town`). Still undecided — see CLAUDE.md §8.

### Still open on the AI Audit page (not defects, decisions)
- [ ] Item 5 from the second brief — share ONE input-resolution path across the three audit entry
      points. Still **deferred** by Paul until he has used the modal.
- [ ] `resetWizard` does not reset `businessScope` or `questionCount`; they carry over from the last
      audit. Pre-existing, and more visible now the form opens and closes as a modal.

### Fourth brief, 2026-07-30 — restyle the evidence playbook to the LLM layout ✅ (`a1cc31cc`)
Done, deployed, live-verified. Reached via **Print** on `/playbook/:id`. Details in CLAUDE.md §9.
Acceptance test on Macca-Gas (`18159c6f`) passed against the rendered document:
Checkatrade **#1, 662 citations / 58 of 59 audits, flagged CLIENT MUST DO THIS**; Bing Places absent;
"review" appears **0 times**; SEO section shows real grades (B / on-page B 74 / content A+ 98) with
no AI claims; every protected atom fits one page.

**Deliberately NOT done — Paul wants the two documents side by side first:** the LLM playbook is
still fully reachable (results view → Generate/View playbook, plus its delivery-checklist card).
Removing it is a separate call.

| Still open on the playbook | Note |
|---|---|
| Compare the two documents, then decide whether to delete the LLM one | Paul's next step |
| Sub-steps for the other ~31 task-capable hosts | Deliberate gap; they print "no written steps yet" |
| `postal_town` coarseness (Dodworth → Barnsley) | Undecided, CLAUDE.md §8 |
| Repeating print headers | Paul: cosmetics wait until he has read it |

### Fifth brief, 2026-07-30 — "audit questions failing" regression ✅ (`89181dbe`)
**Not a regression in our code.** Apify's monthly account cap was exhausted ($90.02 of $90.00); the
questions failed with `HTTP 402` then `403`, and the UI mislabelled it "term too broad". Full detail
in CLAUDE.md §4 and §8. Paul raised the cap to $100.

| # | Item | Status |
|---|---|---|
| 1 | Real stored error shown in plain English + raw string, "term too broad" deleted | ✅ deployed, live-verified |
| 2 | Apify spend line on `/ai-audit`, amber 75% / red 90% | ✅ deployed, live-verified |
| 3 | Fail fast on 402/403 instead of burning 3 attempts | ⏸️ **Paul deferred** — live-queue change, wait until he has finished testing |

**Unverified and worth one look:** the failed-question card itself was never seen rendering the new
message — the harness returned no queue rows for that run. The mapper is verified against both real
stored strings; the three lines of JSX that display it are not. Open a failed audit's **Detailed
results** to confirm.

**Also never confirmed:** that a question completes again now the cap is raised. Nothing has been
attempted since 14:25. `create-ai-audit`'s internal path (service key + `x-internal-job`) returned
401 from this environment — the CLI's legacy service_role key is evidently not what the function
holds in its env, so a run could not be triggered from outside the browser.

### Sixth brief, 2026-07-30 — one Playbook button, LLM playbook unreachable ✅ (`1715a294`)
Paul printed `/playbook/:id` and approved the document, so the results screen now has ONE `Playbook`
button linking to `/playbook/:auditId`. Every UI route to the LLM playbook is gone; the LLM files are
kept but unreachable. Detail in CLAUDE.md §9.

Verified in a harness against the real failed Macca-Gas run: one `Playbook` link, correct href, route
reached, no Generate/View buttons, no checklist card. Also closed the previous brief's open item — the
failed-question card renders the real 403 with the reset date and the raw string.

| Open, reported not built | Note |
|---|---|
| No client-facing playbook | `buildClientDoc()` is dead code; only the operator copy is reachable |
| Nothing tickable | `client_listings` is read-only on `/playbook/:id` |
| Cannot re-enrich an existing lead | Retry buttons are gated on in-session `phoneFetchStatus`; bulk skips leads that have a phone |
| Queue burns 3 attempts on a 402/403 | Still deferred by Paul |

### Seventh brief, 2026-07-30 — client request form ✅ built, ⏳ NOT YET LIVE (`56134630`)
The first client-facing document. Two files: `clientRequestDoc.ts` (renderer, imports only
`playbookDocStyle`, structurally cannot see the ranking) and `clientRequestSelect.ts` (the only side
that does). `buildClientDoc` deleted. Two labelled buttons on `/playbook/:id`. Detail in CLAUDE.md §9.

Verified against the real Macca-Gas data in a harness: three asks (Checkatrade 59/62, MyBuilder 32/62,
TrustATrader 17/62), address shown MISSING with its why, **zero of 20 non-ask plumber hosts present**
while the operator doc from the same fold contains them, 2.5 A4 pages, and the `naming=null` variant
omits the measurement line without inventing a figure.

🔴 **DEPLOY PENDING.** `origin/main` has it; Cloudflare was still serving commit `1715a294`
(`AiAudit-C55Dvb4S.js`) after 15 minutes of polling. **Check the Pages dashboard** — if the build
failed it needs a retry. The check: open `/playbook/<audit id>` and look for two buttons.

| Open, reported not built | Note |
|---|---|
| Nothing tickable | `client_listings` is read-only on `/playbook/:id` |
| Cannot re-enrich an existing lead | The form is currently the only route to Macca-Gas's address |

### Eighth brief, 2026-07-30 — client form wording + the free ask (`62c4eb29`)
✅ MyBuilder's "third most common source" → "another source we see often" (the ordinal implied an
unnamed #2). ✅ Google Business Profile added back as a FIXED free ask, placed first.

⚠️ **The GBP ask is justified by GOOGLE'S published guidance, NOT our data**, and the document says
so in as many words. Measured before writing it: `google.com` is cited **twice, across 2 of 62
plumber audits, out of 10,672 citations**. `ClientAsk.evidenceNote` exists to carry that kind of
externally-sourced justification, and its type comment requires the source to be named — so a future
ask cannot borrow the phrasing of a measurement it does not have. It does not count against
`CLIENT_ASK_LIMIT`, which caps the citation-derived directory asks.

✅ **DEPLOYED AND LIVE-VERIFIED** — `Playbook-DGQTBTyP.js`, GBP ask + new MyBuilder wording +
the Google attribution all present. (It stalled ~8 minutes first, like `56134630`. See CLAUDE.md §4.)
**Paul confirmed the GBP wording stays as written** — he wants it explicit in the document that this
is Google's claim and not our measurement.

⏸️ **PARKED BY PAUL: client request as a tracked LINK rather than a PDF.** The decision is already
made, so do not re-open the comparison — **Option A, the SNAPSHOT approach**: the SPA already renders
the HTML, so store that string against an **opaque token** and have a public edge function serve it
and bump a counter. Deliberately NOT the rebuild-in-Deno option: porting `usePlaybook`'s data path is
the expensive half and buys nothing, because a request form already sent should not change under the
client. Needs: a table + an atomic bump function (SQL for Paul, mirroring `bump_audit_open()`), one
edge function, and a "Copy client link" button.
⚠️ **The token must be OPAQUE, never the business name** — `render-audit-report` had a real hole
where the bare slugified name resolved, fixed by requiring an 8-hex code suffix. Paul has noted it.
Limits inherited from the existing report, all stated to him: no viewer/IP/user-agent, no per-open
log, cannot distinguish Paul's own views from the client's, and email scanners register false opens.

### 🔴 PENDING SIGN-OFF: the guarantee wording (do NOT change unilaterally)
Paul is moving from guaranteeing the OUTCOME to guaranteeing the WORK, but **not until it is signed
off and updated in Stripe** — the document and Stripe must not disagree.

**The wording is hardcoded in THREE places and nothing reads Stripe at runtime:**
| Where | Text |
|---|---|
| `clientRequestDoc.ts:250` | "Our promise is to get **you** named in more AI answers within 8 weeks, or a full refund." |
| `playbookDoc.ts:421` | Same, phrased "get **this business** named…" |
| `findable-checkout/index.ts:204` | The Stripe line-item description, sent at checkout creation |

They agree today only because the two documents were copied from the Stripe string BY HAND.

☐ **DO THIS AS PART OF THE REWORD, not before it:** extract one shared constant that all three
import, so they cannot drift. `findable-checkout` is an edge function and the documents are SPA
modules, but edge functions already import from `src/lib` (`create-ai-audit` imports `seedGuard.ts`,
`process-ai-audit-queue` imports `auditReport.ts`), so a `src/lib/guarantee.ts` works for all three.
⚠️ Changing the Stripe string only affects NEW checkouts — anyone who has already paid bought the
old wording, so the old text may still need to be honoured for existing customers.

### Still to do after the test passes
- [ ] `npx supabase gen types typescript --project-ref ruusxpkkmwtljxxulhbq > src/integrations/supabase/types.ts`
      — Paul approved. Lets the `as unknown as` casts in `AiAudit.tsx` and the `as never` in
      `useOutreach.ts` go back to plain casts.
- [ ] Decide the `postal_town` question: "Dogs of Southsea" derives **Portsmouth**. See CLAUDE.md §8.

## 🔴 BLOCKING: the SQL must be applied before Items 1+2 do anything

Until Paul runs this, the town fix is **inert** — audits keep using the searched town, exactly as
before, and nothing is broken (both call sites fall back when the columns are missing). It starts
working the moment the columns exist.

```sql
alter table public.outreach_leads
  add column if not exists derived_town     text,
  add column if not exists town_fetched_at  timestamptz;

alter table public.ai_audits
  add column if not exists location_source  text,
  add column if not exists location_note    text;

comment on column public.outreach_leads.derived_town is
  'Town from Google Place Details addressComponents (postal_town > locality > admin_area_2). The town the business is IN, as opposed to search_location which is the town I SEARCHED.';
comment on column public.outreach_leads.town_fetched_at is
  'When Place Details was last fetched for this lead. 30-day cache key.';
comment on column public.ai_audits.location_source is
  'confirmed | derived | search | none — which town this audit used and why. "search" means UNVERIFIED.';
```

After applying it, regenerate types so the two `as unknown as` casts can go back to plain casts:
`npx supabase gen types typescript --project-ref ruusxpkkmwtljxxulhbq > src/integrations/supabase/types.ts`

---

## Item 4 — `DAILY_CAP_USD` 8 → 12
- [ ] `process-ai-audit-queue/index.ts` constant + comment arithmetic
- [ ] `deno check --sloppy-imports`, exit code captured directly
- [ ] redeploy `process-ai-audit-queue`, prove exit 0

## Item 1 — fetch the real address
- [ ] Restore `getPlaceDetails()` from `a8fd7003^:supabase/functions/search-leads/index.ts`,
      trimmed to `formattedAddress`, `addressComponents`, `location`. Keyed on `place_id`.
- [ ] Town extraction reused as-is from `generate-barber-site:307-310`
      (UK `postal_town` → `locality` → `administrative_area_level_2`)
- [ ] Called inside `create-ai-audit` immediately before question generation, ONE try/catch
- [ ] 30-day cache on `town_fetched_at`; failure flags and proceeds, never blocks
- [ ] Cost logged via `runEnrichSource` + `recordCostCorrection`
- [ ] **SQL handed to Paul** (never run by me)

## Item 2 — use it
- [ ] Precedence `confirmed_location || derived_town || search_location`
- [ ] **OVERRIDE** an incoming `location_text` (bulk-jobs:229 and whatsapp-inbound:226/376 pass one in)
- [ ] `_shared/audit-baseline.ts:412` — the guarantee path
- [ ] `AiAudit.tsx:753` — the wizard
- [ ] Record which town was used and why on the audit
- [ ] Do NOT touch: findable-onboarding:127/:237, stripe-webhook:458, OnboardingLinkCard.tsx:49,
      Inbox.tsx:397 — customer-facing, different purpose

## Item 3 — active directory check
- [ ] `apify/google-search-scraper` via `_shared/enrichment/ai-search.ts`, no new vendor
- [ ] `site:<directory> "<business name>" <town>`; confirm a PROFILE url, not search/category
- [ ] Candidate directories from the trade-level derivation, never hardcoded
- [ ] ON DEMAND only — never at discovery, never in the WhatsApp queue
- [ ] Triggered from the lead and from `/playbook/:id`
- [ ] Stored with a timestamp so it is not re-run needlessly
- [ ] Capped + logged with the correction mechanism
- [ ] Shown on `/playbook/:id` distinct from the citation signal: "we searched and found it" vs
      "we saw their listing cited"

---

## Standing constraints (from CLAUDE.md and the brief)
- Never filter the WhatsApp queue on directory presence — already-listed ≠ no lever (ABLM is on
  Yell's Wisbech page and was named 0 times in 80 measurements).
- Never change existing audits' `location_text`. New audits only.
- Never change the radius search — the wide search is deliberate.
- `deno check --sloppy-imports` on every changed edge file, exit code captured DIRECTLY.
  Pre-existing failures, already proven: `generate-barber-site` (3 generics errors) and
  `search-leads:1275` (one `SupabaseClient` generics error).
- `npm run typecheck` baseline is **15**.
- Redeploy every function importing a changed shared module, and prove each.
