# Prospect Preview (2026-09-26, branch `feat/prospect-homepage-preview`, NOT merged / deployed)

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

## To ship
1. Apply the migration (read back the table, RLS, bucket). 2. Deploy `prospect-preview` (needs
`CLOUDFLARE_ACCOUNT_ID` / `CLOUDFLARE_BROWSER_TOKEN`, already used by `mockup`). 3. Merge for the SPA.
