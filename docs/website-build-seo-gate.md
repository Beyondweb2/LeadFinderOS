# Website builder audit + the Site Quality Gate (2026-09-30)

Paul's brief: every website Findable builds must be as strong as reasonably possible for conventional
SEO, local SEO and AI visibility, with no weaker build path; current-site facts count as approved
evidence; one automated pre-deploy gate; nothing in Paid Clients / Discovery / Baseline touched.

## 1. The build modes found

| Mode | What it produces | Where it is served | Before this audit |
|---|---|---|---|
| **Template rebuild** (`template_rebuild`, MCL Local Trades Template) | a full client site cloned from `Beyondweb2/MCLocksmiths` | client's own Cloudflare Pages project | **the weakest path** — see §2 |
| **Faithful rebuild** (`faithful_rebuild`, replica / modernised / new design) | a full site rebuilt from the captured old site | same | prompt rules only, self-reported QA |
| **Bespoke / new trade** (`bespoke`) | a full site designed fresh (BS4 was one) | same | prompt rules only, self-reported QA |
| **Page generator** (fn `page-generator`, service+town pages and Q&A pages) | copy blocks Paul pastes into the client's OWN site (WordPress / Yoast fields) | the client's existing site | no schema, no canonical, no breadcrumbs, home + contact links only; Q&A ignored "must not say" |
| **Prospect Preview** (fn `prospect-preview`) | one demo homepage + evidence card for outreach | private bucket, signed URLs, `noindex, nofollow` | emitted `aggregateRating` schema (only when the rating was good) |
| **Mockup product** (fn `mockup`, `src/mockup/templates/`) | a demo site rendered in an admin iframe, sent as a PNG | never served publicly | no head / schema (irrelevant — never public); an unused placeholder-review path with a disclaimer |

The three BUILD ROUTES share one prompt pipeline (`buildPack.ts` master brief → `buildExecution.ts`
Build Execution prompt → the imported JSON result → `previewReadyProblems`). Their written SEO
standard was the same; the differences were in what the route starts FROM.

## 2. What the audit found

Run with the new gate (`scripts/site-quality-gate.mjs`) against real output, 2026-09-30:

| Site | Mode | Result |
|---|---|---|
| BS4 Electrical (`dist`, fresh build) | bespoke | PASS — warnings: 6 titles > 70 chars, 7 descriptions > 170, 8 photos 400–900 KB served |
| MC Locksmiths New (`dist`, fresh build) | bespoke (the live MCL) | PASS — long titles / descriptions |
| **MC Locksmiths old repo (the TEMPLATE SOURCE)** | template seed | **FAIL ×3**: `public/_headers` sends `X-Robots-Tag: noindex` on `/*` (every host — a template build would ship a site invisible to search); `aggregateRating` + `AggregateRating` schema on all 27 pages; service pages sharing 60–64% of their wording |
| mc-locksmiths.com (live, `--url`) | production | FAIL: `http://www.mc-locksmiths.com/` answers **522** (https www is fine); WARN: Cloudflare Email Address Obfuscation is ON on all 17 pages — crawlers see a `/cdn-cgi/` link, not the email |
| www.ablm.co.uk (live, Wix + our pages) | client's own site | FAIL: a published duplicate page `/copy-of-accountants-in-march` (same description as the real one), two H1s on the home page, `/faq` with no H1, schema `@id` on the apex while the site is on www, `http://ablm.co.uk/` redirects to the apex not www; WARN: `llms.txt` published, 513 KB Wix home page |

**SEO weaknesses (all routes):** every QA pass was Claude's own claim (`qa.linksPassed`,
`qa.schemaPassed` …) — nothing read the output. The Build Execution prompt's SEO section was three
lines: no title / description / H1 rules, no internal-link pattern, no subtype, no breadcrumbs rule.

**AI-visibility / entity weaknesses:** no check that the name / phone / email are identical and equal
to the approved values; no check that the business entity is one `@id`; generic `LocalBusiness`
allowed; Cloudflare email obfuscation invisible to everyone.

**Internal links:** "clear internal linking" with no pattern; orphans and click depth unchecked.

**Structured data:** the template seeds rating markup; Prospect Preview emitted it; the SEO QA prompt
still allowed "review or rating markup if reviews are verified and shown" (contradicting the build
standard); no breadcrumb / Service → provider rule in the execution prompt.

**Target intents:** the builder had 11 generic content intents; nothing mapped a service, a location
page or a frozen baseline question to the ONE page that should own it, and nothing checked the page
states it, is linked, indexable, or competes with another.

**Template profile staleness:** `websiteTemplates.ts` still listed the retired `/api/public/lead`
server function (and its Resend secrets), three deleted content files, a deleted `car-keys` page and
a deleted `CallbackWizard`; it did not mention `public/_headers`.

## 3. What changed

- **`scripts/site-quality-gate.mjs`** (plain Node, no dependencies, copied into client repos from
  LeadFinderOS `origin/main` by a node + git one-liner, `SITE_GATE_FETCH` — the GitHub CLI is not installed here) — `--dist` (the build output) or `--url` (a deployed copy,
  `--preview` for pages.dev). JSON report `siteGateVersion: 1`. Exit 0 / 1 / 2.
- **`src/lib/siteGate.ts`** — `siteIntentMap()` (the gate's `--expect` file, printed as X6b),
  `readSiteGateReport()`, `siteGateProblems()`, `GATE_QA_OVERRIDES`.
- **Build Execution prompt** (`buildExecution.ts`): X1 inherited-hazards line for template builds; X6
  rewritten (titles / descriptions / one H1, the internal-link pattern, the entity `@id`
  `https://<domain>/#business`, trade subtype, breadcrumbs, Service → provider, no rating schema);
  **X6b Site Intent Map**; **X9b the gate** (fetch, `npm run gate`, fix the site never the gate,
  preview `--url --preview` run, both reports in `quality.siteGate` / `quality.siteGatePreview`).
- **Import** (`applyBuildResult` → `siteGateResult`): a `preview_ready` / `needs_attention` result
  with no gate report is an ERROR; a failed gate check is an error naming it AND turns the matching
  `qa.*` false (links / orphans → `linksPassed`, schema → `schemaPassed`, mobile →
  `responsivePassed`); a report for another domain, the wrong mode or version does not count; an
  unknown check level reads as FAIL; `passed: true` with a failing check reads as failed. Stored in
  the EXISTING `errors` / `warnings` / `qa` keys — **the saved shape did not change, so
  `paid-client-hub` needed no redeploy**.
- **Retry / review / SEO QA / Final Production QA prompts** run the gate (production `--url` checks
  http → https, www / apex in one hop, no noindex header, the crawler user agents, email obfuscation).
- **Template profile v1.1**: retired server function removed, file lists corrected, the two inherited
  hazards named. The template still points at the superseded repo — see §6.
- **Prospect Preview**: no `aggregateRating` in its JSON-LD (visible rating chips stay).
- **Page generator**: Q&A pages now receive the client's `must_not_say` (both modes passed `""`).

## 4. Current-site claims (Paul, 2026-09-30 — `recon.ts` `SOURCE_SITE_FACT_KEYS`)

A fact the client's own public site states is **approved source-site evidence by default** (basis
`source_site`, never "independently verified"): services, service areas, hours, payment methods,
credentials / accreditations / qualifications / licences / insurance / DBS / memberships / awards /
compliance, guarantees, years trading, company history, FAQs, customer groups, contact details,
address, legal / VAT / company number, availability, reviews and the rating.
Still Paul's: a **conflict** (pages disagree, Claude flagged it, LeadFinderOS holds a different value),
**ambiguity** (not verbatim / not high confidence), the **cross-field** case (24/7 against stated
hours — `availabilityConflict`), a **superlative** ("best", "leading", "No. 1", "cheapest" …), a
**price** (a binding offer that goes stale), tracking / ads IDs, and any unrecognised key. `insured`,
`vetted`, `trusted` and bare `24/7` are no longer treated as superlatives.
Consequence handled: the template seed guard now counts a source-site value as confirmed unless its
source URL is the seed client's own site (so "DBS checked" on a new locksmith's site is not a leftover).
The crawl's keyword-matched `*_on_site` rows keep "needs approval" but say the Recon accepts them.

## 5. What the gate checks

Automated (each a PASS / WARN / FAIL / SKIP): robots.txt allows OAI-SearchBot, ChatGPT-User,
Claude-User, PerplexityBot, Googlebot, Bingbot and names a production sitemap (training bots WARN);
no meta noindex, no `_headers` noindex on a host-less or production pattern (preview: the header MUST
be there); sitemap = every indexable page, nothing redirected / unbuilt / noindexed, all on the
domain; one self-referencing https canonical; no pages.dev / localhost / old / non-canonical host in
page markup, JSON-LD, robots, sitemaps or redirects; every internal link resolves (redirect hops and
`/cdn-cgi/` named); no orphans, ≤ 3 clicks; one unique title, description and H1 per page, headings
in order; near-duplicate pages (5-word shingles, names blanked, ≥ 60% FAIL, ≥ 40% WARN), thin pages;
placeholders and `[CLIENT CONFIRM]` blanks; llms.txt WARN; JSON-LD parses, one business entity (a
LocalBusiness subtype, `@id` on the domain), no rating / review markup, breadcrumbs resolve,
schema name / phone = approved; identity: tel: / mailto: / name consistent with the Site Intent Map;
intents: each owning page exists, is indexable, linked, states its service / place in title / H1 /
opening paragraphs, has a direct-answer paragraph, has no competitor leading with the same intent,
and **no title / H1 repeats a baseline question verbatim**; viewport, lang, page weight, blocking
scripts, unsized / alt-less images, used images > 400 KB; live: transport, crawler UAs vs WAF.

Never automated — printed as NEEDS A HUMAN every run: whether claims are true today; whether copy
answers plainly or is filler; whether location pages are genuinely local; the right subtype; old-vs-new
upgrade; photo quality; Cloudflare rules that fire only for some IPs.

## 6. Still needs Paul

- ✅ RESOLVED §8.1 — **The template source repo.** The template clones the superseded `MCLocksmiths` build; the live,
  cleaner site is `MCLocksmiths-New` (different file layout: `src/data/*`). Re-seeding the template
  from New is a profile rewrite and a product decision — not done. Until then, X1 + the gate catch the
  inherited noindex / rating schema / cloned services.
- PARTLY RESOLVED §8.4 (email fixed; 522 is a zone task, §9) — **mc-locksmiths.com**: `http://www.` answers 522 (Cloudflare can't serve plain-http www — likely a
  missing redirect rule / DNS record for www on http), and Email Address Obfuscation hides the email
  from crawlers. Both are Cloudflare settings on a zone we may not control — never changed from here.
- RECORDED §9 — **ABLM (Wix)**: unpublish or redirect `/copy-of-accountants-in-march`; one H1 on the home page; an
  H1 on `/faq`; make the schema `@id` and the http redirect use www; decide whether `llms.txt` stays.
- ✅ RESOLVED §8.2 — **Page generator Q&A mode** uses the (baseline) question verbatim as the title, H1 and slug. The
  brief says never hardcode baseline questions into pages; changing Q&A mode's heading rule is a
  methodology choice for Paul, so it is reported, not changed. The service+town mode has no schema /
  canonical / breadcrumbs because Yoast / the host provides them on the client's site — the gate's
  `--url` mode checks the live result.
- BS4 / MCL warnings (long titles and descriptions, 400–900 KB photos) are fixes in those repos.

## 7. Tests

`scripts/site-quality-gate.test.ts` (fixture sites: every check driven to fail and pass),
`website-build-execution.test.ts` (prompt X6 / X6b / X9b, the map is valid JSON, every frozen
question owned or listed, gate absent / failed / lying / other domain / preview missing, qa override,
retry, save round trip), `website-build-mapping.test.ts` (the new source-site rule, the 24/7 conflict,
the seed guard's own-site vs seed-site evidence), `prospect-preview.test.ts` (no rating schema —
proven to fail on the old code), `website-build-v1/v2/standard` updated for the profile and rule.

## 8. Paul's decisions, 2026-09-30 (second pass) — what was done

1. **Template source → `MCLocksmiths-New`, pinned** (`websiteTemplates.ts` v2.0). New is the clean-room
   Findable build (its `DESIGN-PROVENANCE.md`: nothing from the disputed old site); the old repo also
   derived from that site — a second reason to stop using it. Pinned to `a2db9748` (after the email fix
   below) so a live MCL change never silently changes a new client's build. New fields:
   `sourceKind` (`live_client_repo` now, `findable_template` the target), `sourcePinnedCommit`,
   `inheritedHazards` (printed in X1: every `src/data` module, the DPOM script key, Morgan's reviews,
   325 legacy URLs, photos / maps / brand, records, legal pages marked unbuilt, the three components
   that hard-code MCL), `canonicalPlan` (extract `Beyondweb2/findable-local-trades-template` with a
   fictitious sample business, then switch). Catalogue services carry the template's page `path`, so
   the Site Intent Map names template owners instead of "". Seed values gain `Cornelius`, `dpom.co.uk`
   and the DPOM key. The cache folder is per source (`mcl-local-trades--mclocksmiths-new`); setup
   checks out the pin (`checkout --detach`), never `pull`. The service catalogue ids are unchanged
   (they are stored in `mapping.services`).
2. **Q&A headings** (`qaHeadings`, page-generator, both modes): the question is the target intent;
   title / H1 / slug come from the genuine service + place + business ("who does rewiring in Bristol"
   → H1 "House Rewiring in Bristol", title "House Rewiring Bristol | BS4 Electrical"). No approved
   service named → the question's topic (asking words dropped, flagged for a look); a generic trade
   question → the trade. Meta fallbacks no longer quote the question. The response carries
   `headings.basis` / `note`.
3. **Prices stay Paul's.** Already held by the recon rule; now also a build-prompt rule (never from
   the old site's copy, tables, cards, schema or meta) and a gate check (`prices`): any £ figure not in
   the Site Intent Map's verified `prices` FAILS (`£5m` insurance cover is not a price; no list = SKIP).
4. **MCL live fixes.** Email: both `mailto` blocks (footer, /contact) wrapped in
   `<!--email_off-->` — MCLocksmiths-New `a2db974`, pushed = deployed, verified live (no
   `/cdn-cgi/l/email-protection`, plain `mailto:` present; live gate: that warning gone, everything
   else PASS). **`http://www.` 522 NOT fixed — no access**: the `mc-locksmiths.com` zone is in neither
   Cloudflare account this machine's login sees (wrangler scopes: `zone (read)` on Move37 / Paul's
   account only). See the client tasks below.
5. **One ownership rule** (`intentOwnership.ts`): the Site Intent Map (`siteIntentMap` now calls
   `ownershipFor`), page-generator Q&A (`intent_owned` refusal before any spend; owners = the Website
   Build plan + the page queue) and `plan_build` (a queued page the Website Build plan already owns is
   HELD with the owner named; a page next to an existing one says so in its rationale). For a client
   whose own site (WordPress / Wix) is not in a Website Build plan, the owners known are the queue only —
   the live site is checked with the gate's `--url`.

## 9. Client improvement tasks (no access from here — recorded, not done)

**MC Locksmiths — whoever holds the `mc-locksmiths.com` Cloudflare zone** (not our account):
- `http://www.mc-locksmiths.com/` answers **522** (`https://www.` and `http://` apex correctly 301 to
  `https://mc-locksmiths.com/`). Fix either way: SSL/TLS → Edge Certificates → **Always Use HTTPS: On**;
  or make the www redirect rule match `http.host eq "www.mc-locksmiths.com"` for BOTH schemes
  (target `https://mc-locksmiths.com${path}`, 301, keep query). Then check:
  `curl -sI http://www.mc-locksmiths.com/` → one 301 to `https://mc-locksmiths.com/`.
- Optional: Scrape Shield → Email Address Obfuscation **Off** (the site no longer needs it off — the
  address is wrapped — but any future email added without the wrapper would be hidden again).

**ABLM (Wix — the client's own editor, no access from here):**
1. Delete or unpublish `/copy-of-accountants-in-march` (a duplicate of `/accountants-in-march`, listed in
   `pages-sitemap.xml`); if it was ever shared, 301 it to `/accountants-in-march` (Wix → SEO → URL
   redirects).
2. Home page: make "UK accountants for owner-managed businesses" the ONE H1; change the mission
   paragraph's text style from Heading 1 to a paragraph style.
3. `/faq`: give the page one H1 (e.g. "Frequently asked questions").
4. Schema: the home page and /services custom-code JSON-LD uses `https://ablm.co.uk/#business`; the
   site lives on `https://www.ablm.co.uk` — replace the pasted code with the current kit
   (`C:\Users\paulj\ablm-site`, which already uses `https://www.ablm.co.uk/#business` and `url`).
5. The town pages (`/accountants-in-march`, `-peterborough`, `-wisbech`, …) carry **no structured data
   live** although the kit has it — paste each page's JSON-LD block into that page's custom code.
6. `http://ablm.co.uk/` redirects to the apex, not www — Wix → Domains: set `www.ablm.co.uk` primary
   and redirect the apex (one hop to `https://www.ablm.co.uk/`).
7. Decide whether the published `llms.txt` stays (not a Findable default).
After: `node scripts/site-quality-gate.mjs --url https://www.ablm.co.uk --domain www.ablm.co.uk`.
