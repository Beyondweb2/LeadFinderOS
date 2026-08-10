import { canonicalTrade } from './trades';

/* ══ WHICH CAMPAIGN DOES A LEAD BELONG IN? ════════════════════════════════════════════════════
   ⛔ THE BUG THIS EXISTS FOR: MarketPanel passed campaignId `null` on both its add paths, so every
   lead added from Coverage or the market view landed with NO campaign — and one of those paths is
   the measure flow, which adds silently, so it had been happening on every market measure without
   anything on screen saying so. A lead with no campaign does not appear when you filter by one.

   ⛔ THE TRADE COMES FROM campaigns.trade_slug, NEVER FROM THE CAMPAIGN NAME. Only 4 of 12 names
   resolve through canonicalTrade — "Mechanic" and "Detailing+Valeting" are real trades that match
   nothing — so a name rule would fall back for exactly the campaigns it most needed to get right,
   and a rename would silently move leads.

   ⛔ IT NEVER CREATES A CAMPAIGN. Thirty campaigns nobody made is worse than one fallback that says
   what it did.
   ═════════════════════════════════════════════════════════════════════════════════════════════ */

export interface CampaignLike {
  id: string;
  name: string;
  trade_slug?: string | null;
}

/** Why a campaign was chosen. The caller must be able to SAY which, not just use it. */
export type CampaignPickReason =
  | 'trade'      // matched the lead's trade to a campaign's trade_slug
  | 'fallback'   // no match; used the campaign the operator had selected
  | 'none';      // no match and nothing selected — the lead would get no campaign

export interface CampaignPick {
  campaignId: string | null;
  campaignName: string | null;
  reason: CampaignPickReason;
  /** The canonical trade slug we resolved from the lead, if any. For the message. */
  tradeSlug: string | null;
}

/**
 * Resolve the campaign for a lead of `trade`.
 *
 * ⚠️ THE ABSENT CASES ARE EXPLICIT, not an `else`. An unrecognisable trade, a trade with no
 * campaign, and a campaign with no trade_slug are three different things and all of them mean
 * "fall back and say so" — never "close enough". `trade_slug` NULL means nobody has said yet, so
 * such a campaign can never be matched INTO, only selected by hand.
 *
 * ⚠️ FIRST MATCH WINS, and campaigns are compared on the slug only. If two campaigns claim the
 * same trade that is a data question for the operator, not something to guess at here — and the
 * picker is where it gets resolved.
 */
export function pickCampaignForTrade(
  trade: string | null | undefined,
  campaigns: readonly CampaignLike[],
  selectedCampaignId: string | null,
): CampaignPick {
  const selected = campaigns.find((c) => c.id === selectedCampaignId) ?? null;
  const fallback = (): CampaignPick => ({
    campaignId: selected?.id ?? null,
    campaignName: selected?.name ?? null,
    reason: selected ? 'fallback' : 'none',
    tradeSlug: canonicalTrade((trade ?? '').trim())?.slug ?? null,
  });

  const t = canonicalTrade((trade ?? '').trim());
  if (!t) return fallback();

  const match = campaigns.find((c) => (c.trade_slug ?? '').trim() === t.slug);
  if (!match) return fallback();

  return { campaignId: match.id, campaignName: match.name, reason: 'trade', tradeSlug: t.slug };
}

/**
 * One sentence naming the campaign and why — used by BOTH the single-add toast and the measure
 * flow's batch summary, so the silent path stops being silent and cannot word it differently.
 */
export function describeCampaignPick(p: CampaignPick, count = 1): string {
  const n = count === 1 ? 'Added to' : `${count} added to`;
  if (p.reason === 'trade') return `${n} ${p.campaignName} (matched the trade).`;
  if (p.reason === 'fallback') {
    return `${n} ${p.campaignName} — no campaign is set for ${p.tradeSlug ?? 'that trade'}, so the selected one was used.`;
  }
  return count === 1
    ? 'Added with NO campaign — nothing is set for that trade and no campaign is selected.'
    : `${count} added with NO campaign — nothing is set for that trade and no campaign is selected.`;
}
