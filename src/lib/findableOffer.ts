// THE FINDABLE OFFER — the one place the price and the guarantee wording live.
//
// Imported by BOTH the SPA and edge functions (findable-checkout, stripe-webhook),
// so this file must stay dependency-free and edge functions must import it with a
// RELATIVE path and an explicit .ts extension (like reportSlug.ts) — never the @/
// alias, which Deno's bundler rejects outright (see CLAUDE.md §4).
//
// ⚠️ CROSS-REPO SEAM: findable-site is a separate repo and cannot import this.
// Its copy lives in findable-site/src/lib/site.ts (GUARANTEE) and the price is
// displayed in its OnboardingFlow.tsx. Changing either value here means a matching
// pass there — the two repos CAN drift, and this comment is the only guard.

/** The one-off price of the eight-week sprint, in GBP. £49.99 until 2026-08-04. */
export const FINDABLE_SETUP_PRICE_GBP = 99;

/** The guarantee, WORK-based: we promise the audit, the work and the re-measurement,
 *  never the outcome. Same wording the website carries. Anywhere this sentence is
 *  shown to a client must render it from this constant, not a local copy — three
 *  hardcoded copies drifted apart once already. */
export const FINDABLE_GUARANTEE =
  "We guarantee the audit, the work, and the re-measurement at week eight with " +
  "before-and-after evidence, or a full refund. We do not promise you will be named.";
