# The Welcome Pack and Section 5 Website Build (2026-09-22)

The record behind the rules now in CLAUDE.md. What was wrong, what was built, and the decisions that
should not be re-litigated.

---

## 1. Why the Welcome Pack "didn't work" — three separate things

**(a) It was never wired to the Paid Client page.** Stage 2 of `ClientHub.tsx` was literally
`<Button variant="outline" disabled>Preview / send integration</Button>`. The working button existed
only on the Outreach lead modal (`LeadDetailDialog`) and the Inbox thread header. From Paid Clients
there was no way at all to produce a pack.

**(b) When it did run it could pick the wrong audit.** `WelcomePackButton.resolveAudit()` took *the
newest non-market audit for the lead that has a completed run*. It knew nothing about
`baseline_audit_id` or `audit_purpose`. MCLocksmiths had four audits on 2026-09-22:

| audit | purpose | completed |
|---|---|---|
| `50880751…` | `baseline` | 22 Sep 03:24 |
| `50986aa3…` | `discovery` | 21 Sep 16:54 |
| `dff25511…` | `discovery` | 21 Sep 07:05 |
| `e1b3acb4…` | (none) | never |

The baseline was newest **by ordering only**. One more Discovery run and the client's welcome pack
would have reported Discovery numbers under a heading saying "your baseline", with nothing on screen
saying so. That is the bug `welcomePackData.ts` exists to close.

**(c) No public URL, no readiness state.** It was browser-only print-to-PDF — nothing served,
nothing shareable, and no signal anywhere about whether a pack existed.

The document module itself (`welcomePackHtml.ts`) was sound and already forced `hidePitch`.

---

## 2. What was built

### Readiness — `src/lib/welcomePackData.ts`

Resolves from `outreach_leads.baseline_audit_id` **and nothing else**, then ASSERTS
`audit_purpose === 'baseline'` on the row it was handed rather than trusting the claim trigger that
set the pointer. Three states, each enumerated positively:

- `waiting` — no baseline pointer, or the baseline has not completed.
- `ready` — pointer set, row is that audit, purpose is baseline (or legacy NULL), completed.
- `error` — the row is a recorded non-baseline purpose, or is not the audit the lead points at.

`missing[]` names what is absent. `canShare` is separate from `state`: a completed baseline with no
`short_code` is **ready to download but not shareable**, and says exactly that.

⚠️ **LEGACY.** RG, Ronnie's and SC paid before `audit_purpose` existed; their baseline rows carry
NULL. A NULL purpose on the row the lead's own pointer names is accepted — the lead pointing at it
*is* the claim. A purpose that is RECORDED and is something else is refused outright.

### One renderer, two deliveries — `supabase/functions/_shared/welcome-pack-render.ts`

The public page at `findable.live/w/<code>` and the operator's Download button both call
`renderWelcomePack()`. There is no second builder, so the PDF a client is emailed and the page they
open cannot drift.

Resolution: slug → audit (short code or UUID) → the lead → **does that lead claim this audit as its
baseline?** A Discovery scan has its own short code and resolves to an audit row at step one, then
dies at the claim check. Verified live: `mqy2uf` (the baseline) returns 200 / 82 KB; `vwagdd` and
`jr7mt8` (the two Discovery scans) and a junk code all return the identical 515-byte refusal.

⛔ **One refusal page for every miss.** A distinguishable refusal would tell an outsider which codes
exist.

### Why `/w/<code>` reuses the report's short code

Paul, 2026-09-22. Both documents belong to the same paid client, so one unguessable code addresses
both and no second code column exists to drift. `findable-site/functions/w/[code].ts` is a
line-for-line sibling of `functions/r/[code].ts`, minus the user-agent forwarding (that exists only
to feed the report's open tracking; the pack records nothing).

### Client safety is structural, not remembered

Every table is read through a named column allowlist (`LEAD_CLIENT_COLUMNS`,
`ONBOARDING_CLIENT_COLUMNS`). `website_build`, `notes`, `delivery_notes`, `project_overview`,
`project_status`, `delivery_ref`, `delivery_checklist` and `user_id` are **never fetched**, so no
variable holds one for a later edit to print. `report.internal` is forced false.

⚠️ The word "winnability" DOES appear in the served document — in a CSS comment inside the report's
own stylesheet, which the pack lifts verbatim and which every client report at `/r/<code>` has always
carried. Verified 2026-09-22: 9 occurrences, all inside `<style>`, **zero rendered `qb-win`
elements**. The test therefore checks the rendered chip, not the word.

### No review link, deliberately

There is no per-business review-link column anywhere in the schema (`outreach_leads` has
`google_maps_url`, `rating`, `review_count` — no review URL). Both deliveries therefore render the
"how to find your own link" copy. `google_maps_url` is not a review URL and guessing one would send
a client's customers to the wrong listing. The legacy Outreach/Inbox button still asks for one.

---

## 3. Section 5 — Website Build

The old stage's two useful things were **kept, not moved**: the planned-pages list and the page
generator link now sit inside the section the website work belongs to.

`outreach_leads.website_build jsonb not null default '{}'` (migration
`20260922100000_outreach_leads_website_build.sql`, applied and read back 2026-09-22: NOT NULL,
default `'{}'`, all 4,792 rows valid). Not `delivery_checklist` — that column is a map of booleans
read by the delivery cockpit, and mixing a shape into it would make one column mean two things.

Saved through an **allowlist** (`normaliseWebsiteBuild`): six known string keys plus an enumerated
status, lengths capped. A jsonb column that stored whatever the browser posted would be a hole.

### The rebuild prompt is generated at click time and never stored

Onboarding answers arrive late, a baseline finishes overnight, Paul edits the repo path. A prompt
saved to the database is a prompt that is wrong by the time it is used and nothing on screen would
say so. The button calls `rebuild_context` (read-only) and assembles the text in the browser.

⚠️ `websiteBuildPrompt.ts` is built from **arrays of plain strings, joined** — not one enormous
template literal. A backtick inside a template literal has broken this repo's build three times and
this text contains shell commands.

---

## 4. Conflict resolution — `src/lib/clientFacts.ts`

One ranked resolver behind both the pack and the prompt:

> onboarding > client_record > baseline > discovery > crawl

⛔ **Rank breaks the tie; it does not hide the loser.** A lower-ranked source with a *different*
value is recorded in `conflicts` even though it lost, and surfaces under CLIENT CONFIRMATION
REQUIRED naming both values and both sources. Nothing is averaged, concatenated or chosen.

⛔ **Lists are never merged.** Merging is concatenation with extra steps: a client who cut "boarding
up" out of their services during onboarding would get it back from an older lead row, and the pack
would then promise work they took off the list. The highest-ranked non-empty list wins whole; a
lower-ranked list carrying entries the winner lacks is a conflict to ask about.

URLs compare on host+path with scheme, `www.` and a trailing slash normalised away, so
`http://x.co.uk` vs `https://www.x.co.uk/` is not a "conflict".

`REQUIRED_FOR_REBUILD` = website, primary location, category, services, **areas**. Areas is on the
list deliberately: service areas are the single most-invented fact on a trade website.

---

## 5. Do-not-break URLs — the wording is the point

`visibilitySignals()` returns citations of the **client's own host** in the baseline evidence. No
website on file → empty list, never "every citation" (which would hand the rebuild a do-not-break
list made of directories and rivals).

⛔ The prompt says these URLs were **cited while answering**, states in terms that this is not proof
the page caused anything, and tells Claude to investigate before redirecting or removing one. The
floor — homepage, every service page, every location page, contact — applies whether or not there is
citation evidence. (It originally applied only on the branch that had citations; fixed before merge.)

---

## 6. Tests

Five new suites, all green:

| suite | covers |
|---|---|
| `welcome-pack-readiness.test.ts` | waiting / ready / error, Discovery never qualifies, legacy NULL purpose, the URL |
| `welcome-pack-public-safety.test.ts` | the column allowlists, no writes, `internal:false`, one refusal, one builder |
| `welcome-pack-content.test.ts` | the summary folds, the document prints the facts and figures, no operator vocabulary, no promise |
| `website-rebuild-prompt.test.ts` | every autofill, the frozen questions, conflicts flagged, `[LOCAL REPO PATH REQUIRED]`, preview instructions, the full workflow |
| `paid-client-hub-no-writes.test.ts` | opening / packing / prompting write nothing, Discovery untouched, Section 5 keeps its old features, existing report routes intact |

`paid-client-hub-resilience.test.ts` needed two repairs: its live-column map, and its "get path
performs no update" check — which sliced the source *from `get` to `create_manual`* and so began
failing on the new `save_website_build` action's legitimate one-column update. It now brace-matches
the action block, which is the property it was always trying to test.

**160 suites, 152 pass.** The eight failures are all pre-existing on `origin/main` (verified by
stashing): `coverage-lead-counts`, `explain-offer`, `new-site-tier`, `onboarding-audit-fields`,
`remeasure-results`, `report-attribution`, `verdict`, `site-origin` (needs Deno). The known-stale
list in CLAUDE.md §0 is out of date — it names four; there are eight.

---

## 7. Still owed

- 🔴 **`findable.live/w/<code>` is NOT live.** `findable-site/functions/w/[code].ts` is written but
  the repo was not deployed: `npm run deploy` ships the working tree, and that tree carries two
  unrelated uncommitted edits (`Footer.astro`, `research.astro`) that would have gone live with it.
  Until someone deploys it, Copy Welcome Pack Link produces a dead address; Download works.
- 🔴 **`leadfinderos.pages.dev` has not rebuilt.** The live operator SPA references no `ClientHub`,
  `PaidClients` or `PaidBaselineSetup` chunk at all, so it predates the Paid Clients feature
  entirely — it was already weeks stale before this change. `main` is pushed and builds clean
  locally; the Cloudflare Pages auto-deploy is not running.
  ⚠️ **CORRECTED 2026-09-23: this finding was wrong.** `leadfinderos.pages.dev` is a LEGACY project
  that is not connected to `main`; production is `leadfinderos-next.pages.dev`, which was serving
  current `main` (`3972fd42`) when checked. The auto-deploy works — the check hit the wrong host.
  See CLAUDE.md §0 and §7.
- `audit_purpose = 'discovery'` is a live value that is not in `auditKind.ts`'s constant list.
- The Welcome Pack still cannot be SENT from the hub — it is download and link only.
