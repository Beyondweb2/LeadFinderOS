/* ══ THE WORDS ON A STANDARD / THOROUGH CONTROL (2026-10-23, src/lib/townSearchArea.ts) ═══════════════════════════
   ⛔ THE PRICE IS DERIVED, NEVER TYPED (CLAUDE.md §4): Thorough's ceiling per town (THOROUGH_MAX_USD_PER_TOWN) at the
      display rate. "up to", because how many second pages a town needs is only known after the search.
   ⛔ SALES NEVER SEES A COST (docs/abuse-cost-protection.md): `showMoney` is the admin flag; without it the words
      say how many Google searches a town can take, never a sum of money. Pure. */
import { USD_TO_GBP_DISPLAY } from './marketView.ts';
import { THOROUGH_MAX_CALLS_PER_TOWN, THOROUGH_MAX_USD_PER_TOWN, type SearchDepth } from './townSearchArea.ts';

/** "45p" under a pound, "£1.34" from a pound up. */
export function gbpWords(usd: number): string {
  const pence = Math.round(usd * USD_TO_GBP_DISPLAY * 100);
  return pence < 100 ? `${pence}p` : `£${(pence / 100).toFixed(2)}`;
}

/** The suffix a Find leads button carries on Thorough for `towns` towns ('' on Standard). */
export function depthButtonSuffix(depth: SearchDepth, towns: number, showMoney: boolean): string {
  if (depth !== 'thorough' || towns < 1) return '';
  return showMoney ? ` · up to ${gbpWords(THOROUGH_MAX_USD_PER_TOWN * towns)}` : ' · Thorough';
}

/** The one-line note under the setting. */
export function depthNote(depth: SearchDepth, showMoney: boolean): string {
  if (depth === 'standard') return 'Standard: one search of the town, as before.';
  return 'Thorough: the town split into small squares, each searched, up to ' + THOROUGH_MAX_CALLS_PER_TOWN
    + ' Google searches a town' + (showMoney ? ' (up to ' + gbpWords(THOROUGH_MAX_USD_PER_TOWN) + ' a town).' : '.');
}
