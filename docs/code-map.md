# Where the AI-visibility code lives — the long form (original §9)

*Records moved out of CLAUDE.md on 2026-09-16. CLAUDE.md holds the rules; this holds the story. Sections keep their original numbers and text. Read this when you are about to touch the thing it describes.*

> Moved from CLAUDE.md §9 on 2026-09-16. Verbatim. Cross-references (§N) use the ORIGINAL CLAUDE.md numbering — `docs/INDEX.md` maps them.
> ⚠️ Corrected 2026-09-16: `supabase/functions/generate-playbook/` was deleted from the repo on 2026-09-09 (§0). It is still DEPLOYED (v40) with no source — Phase 3 `functions delete`.

## 9. Where the AI-visibility code lives

| Thing | Path |
|---|---|
| Evidence fold (pure, no LLM) | `src/lib/buildPlaybook.ts` |
| Host facts, hand-maintained | `src/lib/directoryFacts.ts` (**64** entries — see the count note below) |
| Per-trade citation fold | `supabase/functions/playbook-evidence/` |
| Operator checklist page | `src/pages/Playbook.tsx` + `src/hooks/usePlaybook.ts` |
| Printable document | `src/lib/playbookDoc.ts` + `src/lib/playbookDocStyle.ts` |
| Baseline operator view | `src/pages/Baseline.tsx` + `src/lib/baselineView.ts` |
| Back link, shared by both views | `src/components/BackLink.tsx` |
| Audit UI (large) | `src/pages/AiAudit.tsx` |

- 🔴 **Entry points to `/playbook/:id` — exactly THREE, and one of them is load-bearing on its
  own (re-checked 2026-09-10):** `LeadDetailDialog.tsx`'s `Playbook` pill, the AI Audit **row
  menu**'s *Delivery checklist* item, and the results screen's **More → Playbook**. Each passes
  `state={{ from, fromLabel }}` so `BackLink` can name where it returns to.
  ⚠️ **The dialog's is LEAD-keyed, so it cannot reach a business with an audit and no
  `outreach_leads` row** — ABLM, the only delivery client. The two AI Audit routes are AUDIT-keyed
  and are the only ones that can. **Do not remove both.** (A fourth, `PaidClients.tsx`, went with
  that page on 2026-08-12 — §6d.)
  ⚠️ **It used to be a `checklist` CHIP on every list row and is now a menu item** (2026-09-10).
  The route was deliberately preserved when the chip went: it rendered on 901 rows out of 901, so
  it distinguished nothing and was most of why the list read as cluttered. `AuditPills.tsx` carries
  a comment saying to put the chip back if the row menu ever loses the link.

- ✅ **THE LLM PLAYBOOK IS NOW UNREACHABLE FROM THE APP** (`1715a294`, 2026-07-30). The audit results
  screen has **ONE** button, `Playbook`, linking to `/playbook/:auditId`. Gone: both old buttons, the
  viewer (iframe + Internal/Client toggle + Regenerate + Download), `generatePlaybook` (the app's only
  caller of the edge function), the `DeliveryChecklist` card and component, the `playbooks` snapshot
  cache, the checklist tick state, and `RunRow.has_playbook`.
  **`src/lib/playbookHtml.ts` and `supabase/functions/generate-playbook/` are KEPT** — unreachable, not
  deleted, so the prompt stays readable as the record of what went wrong. Don't "tidy" them away.
  The button is gated on `auditId` **alone** — not on a completed run — because the ranking is
  trade-level, so the document is right even when that run failed at the Apify cap.
  🔴 **ONE GAP STILL OPEN:** **nothing is tickable.** The `DeliveryChecklist` ticked per run into
  localStorage. `/playbook/:id` displays `client_listings.done_at`/`verified_at` but **cannot set
  them** (read-only there), so there is nowhere to mark delivery work done.
- ✅ **THE CLIENT REQUEST FORM — the only client-facing document** (`56134630`, 2026-07-30). Reached
  by **`Print client request`** on `/playbook/:id`, beside **`Print operator copy`**. Labelled by who
  each is FOR, with "Operator copy contains their competitors — never send it" under them.
  - **THE LEAK BOUNDARY IS STRUCTURAL, and must stay that way.** `clientRequestDoc.ts` (the renderer)
    imports **only** `playbookDocStyle` — never `buildPlaybook`, `directoryFacts` or the selector — so
    it is never handed the ranking and cannot print it. `clientRequestSelect.ts` is the only side that
    sees the `Playbook`. If the sheet ever needs more, widen `ClientRequestInput` deliberately; do
    **not** pass the Playbook through.
  - **Which asks: 4 filters.** `blocked` only → not `thin` → **has a hand-written `clientParagraph`**
    → top **`CLIENT_ASK_LIMIT` (3)** by **breadth**. For plumbers: Checkatrade 59/62, MyBuilder 32/62,
    TrustATrader 17/62. **MyJobQuote is excluded despite 11/62** because nobody wrote client wording
    for it *and* its notes record the pay-per-lead model as "INFERRED" — never ask a client to spend
    money on an inferred model, and never write generic filler to fill the gap.
  - **No completed run → the measurement line is OMITTED**, replaced by an honest substitute. It does
    not refuse to render: the address ask is valid regardless, and refusing would block the one field
    holding up all the work.
  - ⚠️ **`buildClientDoc` was DELETED** — written, never rendered, and it leaked the measurement
    METHOD verbatim plus every blocked host uncapped. Its a/an helper, `{trade}`/`{town}` fill and
    "Being straight with you" wording were lifted first.
  - ⚠️ **MyBuilder's hand-written client paragraph still opens "MyBuilder is the third most common
    source we see for plumber work."** That ordinal implies a #2 the document never names. It leaks no
    host, so it passes the rule, but it is worth a one-word edit. Paul's call, not changed.
- ⚠️ **ENRICHMENT CANNOT BE RE-TRIGGERED ON AN EXISTING LEAD FROM THE UI.** `retryPhoneFetch` exists,
  force-refreshes Google and (since 2026-07-30) writes address/rating/reviews/town — but the only
  buttons that call it (`OutreachTable.tsx:2018` and `:2165`) render **only when
  `phoneFetchStatus[lead.id] === 'failed'`**, which is in-memory session state. And bulk "recover
  phones" **skips any lead that already has a phone** (`useOutreach.ts:1250`). So a lead like
  Macca-Gas — phone present, address null, `place_id` present — is reachable by neither.
- 🔴 **A BUSINESS WITH NO WEBSITE IS A DIFFERENT PRODUCT, NOT A WEAKER PROSPECT.** Gemini cannot
  name a business it has nothing of to read (§5, MK Plumbing 0/10), so the AI-visibility pitch is the
  wrong opening — but for DELIVERY they are the best case (`serveGate` serves `no_website` outright:
  we build the site on our hosting, nothing to migrate). Measured 2026-08-05: **228 of 969 leads
  (23%)** have no website, 49 of them directory-only; total waste to date **36p** of Facebook SEO
  scans + **93p** auditing them.
  - **`isAggregatorUrl`** (`_shared/aggregators.ts` + its SPA mirror `src/lib/aggregators.ts`) is the
    one classifier. `has_website` was a bare `!!lead.website`, so a Facebook-only listing triggered a
    **$0.12 Apify SEO scan against facebook.com**. Fixed in `bulk-jobs` and **both**
    `_shared/whatsapp-inbound` call sites 2026-08-05.
  - The audit batch holds them back **by default, stated with the saving**, overridable. The market
    view lists them **separately**, never hidden.
  - ⚠️ **`outreach_leads.list_type` IS NOT A WEBSITE SIGNAL.** It defaults to `'no_website'` for every
    lead ever added — both `addLead` call sites pass that literal. It is a leftover from the
    website-generation product. The real signal is `website` (raw URL) + `isAggregatorUrl`.
  - ⚠️ **`search_cache.websiteStatus` has TWO confidence tiers and they are different claims:** a
    directory/social URL is **0.95**, a blank Places website field is **0.60** ("may have one"). The
    0.60 tier has never been validated against reality.
  - A **free subdomain is still their own website.** `PLATFORM_PATTERNS` in `search-leads` treated
    `wixsite.com` / `myshopify.com` / `squarespace.com` / `wordpress.com` as NO_WEBSITE — right for
    the old product, wrong for this one. Removed 2026-08-05. `webflow.io`, `godaddysites.com`,
    `weebly.com`, `carrd.co` are arguably the same mistake and are **still there** — Paul's call,
    because removing them changes what lead search returns.
- ⚠️ **`search-leads` has ONE pre-existing `TS2345`** (~line 1379, the supabase-js client generic on
  `performSearchWithExpansion`). Proven pre-existing by `git stash` 2026-08-05 — `deno check` exits 1
  on that file either way. Don't fix it, and don't read the exit code as your own breakage.
- ✅ **AUDIT-ONLY BUSINESSES WORK.** ABLM (`d2008327`) has `lead_id = NULL` and its address lives on
  `ai_audits.business_address`. Paul viewed and printed its playbook. `usePlaybook`'s audit-first
  resolution is what makes this work — do not reorder it.

- 🔴 **TWO DIFFERENT DOCUMENTS ARE BOTH CALLED "PLAYBOOK". This has now caused a near-miss.**
  | | What it is | Where |
  |---|---|---|
  | **`checklist` pill** → `/playbook/:id` | **Evidence-derived.** Citations decide the directories. The document a client receives | `buildPlaybook.ts`, `playbookDoc.ts` |
  | **"playbook"** (LLM) | `generate-playbook` LLM output at `results.playbook`. **This is the broken one** | `supabase/functions/generate-playbook/` |

  Paul pasted an ABLM playbook recommending **Bing Places as a High-priority quick win** with **no Yell**, and
  assumed it came from the evidence pipeline — he was one step from deleting the good one and keeping the
  broken one. **It was the LLM pipeline.** Two independent fingerprints, both checked:
  1. `quickWins` is a field in the LLM function's own output schema (`generate-playbook/index.ts:75`). The
     phrase appears **nowhere** in the evidence path.
  2. The LLM prompt *instructs* it: "Bing Places — foundational" (`:254`), "Bing Places is foundational, not
     optional… a first-tier task" (`:285`). The evidence path mentions Bing **only** in comments explaining
     its removal, and `yell.com` **is** in `directoryFacts` (`:140`, `urlVerified: true`) with the fold sorted
     by citation count — so 6 Yell citations would have surfaced it.
  ⚠️ Searching `-i bing` in the evidence path returns 3 hits that are all literally **plum·BING·**. §4's trap,
  live again. Print the surrounding characters.
- ✅ **AI Audit page decluttered 2026-07-30** (`4fa0246c`). The new-audit form (source picker + business details
  + question review) is now a **modal**; the page is the list plus a "New audit" button. The row's **`Playbook`
  button and grey `playbook` asset pill are GONE** — both were the LLM document. `checklist` KEPT (see above).
  The LLM document is still reachable from an audit's **results** view. `formOpen` is deliberately **not**
  persisted, or a modal would spring open on every page load.
  ⚠️ **`/ai-audit?leadId=…` MUST open that modal.** `setFormOpen(true)` sits in the same branch as `pickLead`
  in the deep-link effect. Break that and the Outreach audit pill lands on a page with no form.

- ✅ **THE PRINTED EVIDENCE DOC NOW MATCHES THE LLM DOC'S LAYOUT** (`a1cc31cc`, 2026-07-30). Section
  order: header → THE PLAN (grouped) → SEO Improvement (add-on) → QUICK WINS → WHERE AI READS → who
  keeps getting named → EFFORT → Timeline & Our promise. Reached by the **Print** button on
  `/playbook/:id`, which existed long before anyone pressed it.
  - **The styling was already shared** — `playbookDocStyle.ts` was extracted VERBATIM from
    `playbookHtml.ts`, and `.prio` / `.lead` / `.pillar` / `.act-steps` / `.qw` were already defined
    and merely unused. Restyling was populating existing classes, not writing CSS. Check before
    assuming a visual difference means the stylesheets differ.
  - **Priority is derived from BREADTH and prints the fact beside it**: "HIGH · 58 of 59 plumber
    audits". HIGH ≥60% of the trade's audits, MEDIUM ≥`EVIDENCE_MIN_AUDITS`, LOW = thin. Paul's rule:
    a badge must be a summary of a visible fact, never a judgement he cannot audit.
  - **`DirectoryFact.steps` — hand-written sub-steps, and NO GENERIC FALLBACK.** A host without steps
    prints an explicit "no written steps yet" line. Generic filler is what made the LLM document
    useless. 7 written (Checkatrade, Yell, MyBuilder, 192.com, Cylex, Thomson Local, Yelp); only 5 of
    them are cited for plumbers, so a trade shows fewer.
  - **The doc says out loud that the ranking is TRADE-LEVEL**, from all audits of the trade, and that
    this business's own citations do not feed it. Two businesses in one trade get the same list.
  - **The SEO section is built from the real stored scan** (`ai_audit_runs.results.seo`) and carries
    **no AI claim at all** — it states the counter-evidence instead. `usePlaybook` now fetches it via
    the report's own `isRenderableSeo` + `aggregateSeoFindings`. The real shape is **2** categories
    (`onPage`, `contentTechnical`), not 9; Macca-Gas's three "N images without alt text" findings fold
    to one "15 images" line.
  - ⚠️ **`.plan` is ~4.5 A4 pages and the shared CSS marks it `break-inside:avoid`.** A browser cannot
    honour that and may push the whole section to a fresh sheet, leaving page 1 half empty. Overridden
    in `playbookDoc.ts`'s own `EXTRA_CSS` (containers flow, atoms protected) — **not** in the shared
    file, so the LLM document is untouched. ~7 pages for 17 tasks, against the LLM doc's 4.
  - **The promise wording is `FINDABLE_GUARANTEE` in `src/lib/findableOffer.ts`** (since
    2026-08-04, WORK-based: audit + work + re-measurement or refund, never the outcome).
    `findable-checkout`'s Stripe line-item description, `playbookDoc` and `clientRequestDoc` all
    render that constant — no local copies. The LLM's
    "We guarantee that…" and "Expect initial visibility improvements within a few weeks" are both
    model output (`guaranteeNote`/`timelineNote`), so they vary per generation and cannot be fixed in
    that pipeline — only replaced by template text in this one.
- Thresholds: `EVIDENCE_MIN_AUDITS 5`, `THIN_MIN_AUDITS 2`, `TRADE_MIN_AUDITS 5`.
- **The ranking is per-TRADE, from every audit of that trade.** `playbook-evidence` folds ALL audits;
  `buildPlaybook` filters to the trade and sorts by citations. `ownCitations` (this audit's own) is a
  separate display-only signal and feeds **nothing**. So a thin trade gets thin evidence, guarded by
  the three thresholds above — not rescued by the business's own audit.
- **`usePlaybook` resolves an id as an AUDIT id first, then a lead.** ABLM has an audit and no
  `outreach_leads` row; lead-first would 404 the only delivery client.
- **`directoryFacts` holds 64 entries, not 66.** Counted 2026-07-30: `host: '` appears 64 times; a naive grep
  for `host:` returns 66 because it also hits the `DirectoryFact` interface and `factFor`. "66" was repeated
  across several sessions and briefs and was never true. Task-capable (`kind: 'directory' | 'trade-body'`, plus
  the one entry with no `kind`, which defaults to directory): **38**.
- **60 of the 64 signup URLs are unverified — only 4 are checked:** Yell, MyBuilder, 192.com (clicked by Paul)
  and Checkatrade (verified by fetch). Earlier notes said "63 of 66" and "only 3 checked"; both were wrong.
  ⚠️ The doc comment at the top of `src/pages/Playbook.tsx` still says "63 of 66" — a comment only, nothing
  depends on it, but correct it when you are next in that file.
- **2 hosts are `townOnly`:** `loughborough.org.uk` (Loughborough) and `cnxlocal.com` (Chiang Mai). In any other
  town they become a prompt to find the local equivalent, never a task.
- **`playbookDoc.ts` must never touch the `generate-playbook` LLM path.** That pipeline recommended ICAEW to an
  ACCA firm, ACCA's own zero-citation directory, and Bing Places. Styling is shared; the data path is not.
- Live operator app: **`https://leadfinderos-next.pages.dev`**. Supabase ref **`ruusxpkkmwtljxxulhbq`**.
  ⚠️ **`leadfinderos.pages.dev` is a STALE Cloudflare project that still answers 200 with an old
  bundle** — a deploy check against it reports "not live" forever. This line named it until
  2026-09-21; CLAUDE.md §7 carried the corrected host and the warning from 2026-09-20.

---

