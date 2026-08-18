/* MARKET_AUDIT_MIN_AUDITS lives in its own zero-dependency leaf module so every reader imports the
   SAME number and cannot drift.

   ⛔ THE DRIFT IT PREVENTS, PROVEN 2026-08-19. Coverage's "Measured" rung counted a town measured at
   ONE completed market audit, while the market panel needs TWO (marketView.ts) before it will call a
   shape — so a town with a single completed audit read "Measured" on the Coverage row and "needs
   measuring" in the panel. Clicking View on a Measured town then offered to measure it, which reads
   as "View re-runs the audit". Both sides now import this one constant.

   ⚠️ marketView.ts re-exports it, so every existing `import { MARKET_AUDIT_MIN_AUDITS } from
   './marketView'` is unchanged. coverageState.ts imports it here directly (a leaf, not the heavy
   marketView chain). Two market audits is 16 non-overlapping questions and ~300 citations for ~16p —
   the minimum at which the audit-share guard carries information (1 of 2 = 50% vs 2 of 2 = 100%),
   not a round number. */
export const MARKET_AUDIT_MIN_AUDITS = 2;
