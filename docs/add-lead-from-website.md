# Add a lead you found — Fill from website (2026-11-14, `v1/add-lead-from-website`)

Ported in **behaviour** (not code) from V2's add-by-website.

- **Where:** `src/components/AddLeadDialog.tsx` (Outreach → Add a lead you found). Rules: `src/lib/leadFromWebsite.ts`. Server: edge function `lead-from-website` (both roles; team role + `guardAction("enrich")`; saves nothing). Tests: `scripts/lead-from-website.test.ts`.
- **Name order:** schema.org JSON-LD business (legalName, then a name that is not a service heading) → footer legal name (`© 2026 X Ltd`, `X Ltd, Company No…`) → `og:site_name` → page title (last resort, never a service heading).
- **Trade:** the business as a whole — the homepage is always read whatever path was pasted. Order: specific schema type → name minus its place (`London Domestic Maintenance Ltd` → `domestic maintenance`) → the model's trade only if its words are on the site.
- **Only stated facts:** gpt-4o-mini (temp 0, JSON) reads homepage + up to 3 same-site contact/about/services pages; every value is checked against that text (`keepStatedFacts`). Markup reads (tel:, mailto:, JSON-LD) win over the model. The form fills blanks only.
- **Blocked sites:** 401/403/429 or a Cloudflare/SiteGround/captcha page → the form says so (`BLOCKED_LINE`), the model is not called, and after Add lead the form runs the lead's quick `crawl-check`, which stores the refusal on the lead's one website check ("The website refused our check…" — never "AI is blocked").
- **Form:** up front = Website (+ Fill from website), Business name, Trade, Town, Phone or Google Maps link, Where found. Everything else (Country, Contact, Email, Address, extra Maps link, Services, Areas, Campaign, Note) is under More details. A `+353`/`+61`/… number from the site sets the country unless the person chose one.

## Ireland in AI audits (checked 2026-11-14)

- Works: engines are asked with country `ie` (`_shared/enrichment/ai-search.ts` country map); questions read "Westport, Ireland", never UK (`seedGuard.ts`, `scripts/ireland.test.ts`); Irish leads are never measured against `uk_towns`.
- Fixed here: the forced-local prompt banned the word "ireland" while also requiring "Westport, Ireland" — now dropped for an Irish audit only (`create-ai-audit`, `FORCED_LOCAL_BANNED`).
- ✅ Decided by Paul (2026-11-14): **Ireland is NOT prospect-only** — an Irish report keeps the £ offer and the sign-up button (UK agreement). Do not add Ireland to `PROSPECT_ONLY_COUNTRIES` (`src/lib/prospectOnly.ts`) without asking him.
- ⏸ Skipped by Paul (2026-11-14): no wrong-town distance guard for Ireland for now (it would need an Irish town table with coordinates, like Australia's). Not a bug; do not build it unasked.
- The live Fill check (londondomesticmaintenance.com → "London Domestic Maintenance Ltd") is Paul's to do signed in; the same rules on the real homepage gave that name (2026-11-14).
