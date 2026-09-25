# Prospect Preview (2026-09-26; merged to main 2026-09-25 as `fc3366bc`)

An OUTREACH tool, not a Website Build: for a prospect whose AI audit went badly, generate ONE
replacement homepage + an evidence card + screenshots, stored privately for the operator to send by
hand. Operator click only; never automatic; never sends.

## Shape
- `src/lib/prospectPreview/` — pure, edge-reachable. `facts.ts` (lead → audit → crawl siteInfo →
  page text; source-site rule; conflicts flagged, not resolved; URL-only towns rejected),
  `brand.ts` (logo/colours/photos from their homepage HTML), `findings.ts` (headline = the report's
  `gutPunch`; findings = warm-research `rankStrongest`; eligibility), `copy.ts` (card words, the
  suggested message, `copyProblems` claim check), `templates/` (registry + the demonstration
  `findable-local-trade@1.0.0`), `contamination.ts`, `freshness.ts`, `generate.ts` (the one pure
  pipeline), `shots.ts` (viewport policy for both drivers).
- fn `prospect-preview` (`status` | `generate {regenerate}`), `_shared/prospect-preview-shot.ts`
  (Cloudflare Browser Rendering with `html`). Table `prospect_previews` + private bucket
  `prospect-previews` — migration `20260926090000_prospect_previews.sql`, **not applied**.
- UI: `src/components/ProspectPreviewPanel.tsx`, mounted on the AI Audit results row.
- Local: `npx tsx scripts/prospect-preview-local.ts --out <dir>` renders the fixtures with headless
  Chrome over DevTools (same generator + shot policy). Tests: `scripts/prospect-preview.test.ts`.

## Rules it taught
- The card never asserts causation ("may be contributing"); the homepage never names a competitor
  or carries audit/sales copy; no price in the message.
- Contamination: identity needles (another firm's name/phone/email/domain) are allowed only when
  they ARE this prospect's identity — not because they turned up in a service name. Every
  phone/email/host in the output must be one the config holds.
- Stale = inputs moved; the stored preview is shown marked stale; only Regenerate rebuilds.
- Research reuse is READ-ONLY on `warm_lead_research` (warm-lead-reply owns it). No OpenAI spend.

## Pre-ship validation (2026-09-26)
- **Phone rule (Paul):** agree → used. Differ → a conflict: the outreach preview's CTA uses the number
  LeadFinder is messaging (newest `whatsapp_messages.phone`, else the lead's), labelled
  `outreach_contact`; the website's number stays as `business.websitePhone`; operator note
  "Phone mismatch: LeadFinder/contact number is X; current website shows Y."; `requiresResolution`
  records it for a paid build. The card is never about the mismatch.
- **No hotlinking:** `assets.ts` — only the template's `imageBudget` (logo + ≤8 photos) is fetched,
  sniffed (magic bytes + header, size bounds, script-free SVG logos only), stored under
  `<lead>/<fingerprint>/src/`, and the page references `https://prospect-preview.invalid/<path>`,
  swapped for signed URLs at render/view time. A failed image is omitted and flagged. Provenance in
  `facts.images`. No resizing (no image library in the edge runtime) — size bounds instead.
- **Screenshot cap:** `withShotCap` puts the cap IN the document (sheds gallery → FAQs → about →
  areas → trust, then clips); `shotWithinCap` reads the PNG header and refuses oversize/overweight.
- **Shared gather:** `gather.ts` is the one path from stored rows to inputs, used by the edge fn and
  the local real-lead run.
- **Real leads taught** (E.E.S Electrical, R.Coulson Plumbing & Heating, JOLT Electrical): WordPress
  core palette / theme defaults read as "brand" on three unrelated sites (now excluded; their own
  theme stylesheet and an SVG logo's fills are read instead); stock (AdobeStock) and WP site-icon
  clip-art taken as photos; hover/rollover twins; menu pages as services ("Finance", "Thankyou",
  "Complaint Procedure", "Contact Lee"); a finance disclaimer, a menu run and a customer REVIEW
  picked as their own words; a 404 site not recognised (now a strength-5 finding, fetched twice;
  403 is never "down"); a message claiming "the site is accessible" about a site we could not read;
  named 1 of 2 (one engine missed them) now qualifies and the card names that engine.

## Consolidation pass (2026-09-25, before ship)
- **Partial engine gap is PER ENGINE** (`engineGap`, findings.ts): a preview qualifies when at least
  one scored engine named them in at most `POOR_VISIBILITY_MAX_SHARE` of its answers. Named on one
  engine and missed on another = `partial` = qualifies, with an operator note stating the split.
  Named on most answers on EVERY engine = no preview. The old rule used the OVERALL share, which
  refused ChatGPT 3/3 + Gemini 1/3 (4 of 6). Without per-engine rows the overall share still decides.
- **The card always names the engine** — "Gemini didn’t name E.E.S Electrical Services.",
  "Gemini recommended", and no "AI is consistently naming…" line. Never "AI" as a whole.
- **Card-only recommendation** (`recommendation.ts`, stored in `prospect_previews.recommendation`):
  CARD + HOMEPAGE or CARD ONLY with a one-line why and the weaknesses. Deterministic: no services →
  card only; site down/unreadable + thin business content → card only; two or more of (thin
  services, no logo AND no colour, no photos, no proof, fewer than `MIN_SUBSTANTIAL_SECTIONS` real
  sections on the rendered page) → card only. No numerical score. Guidance only: the homepage and
  screenshots stay viewable and downloadable. Real leads 2026-09-25: R.Coulson → card + homepage;
  JOLT → card only; E.E.S → card only (no reliable service content on their site today).
- Generator version 2 (card wording changed), so any v1 row reads stale.

## To ship
1. Apply the migration (read back the table, RLS, bucket). 2. Deploy `prospect-preview` (needs
`CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_BROWSER_TOKEN`, already used by `mockup`). 3. Merge for the SPA.
