/* ══ WHOSE INBOX, AND WHICH COUNTRY (2026-10-22, Paul) ═══════════════════════════════════════════════
   The Inbox opens on the signed-in person's OWN leads. A "Viewing" choice shows someone else's, or the
   unassigned ones; a Country choice narrows any of them. Pure and import-light: the page, the sidebar
   badge and the tests all read these, so there is one rule for "whose is this" and "which country".
   ⛔ Absent is not a match: a lead with no owner is only ever under "Unassigned", never under "Me".
   ⛔ This is a VIEW. Who may READ a lead is still decided by the database (RLS / the sales_leads view). */
import { MARKETS, MARKET_NAME, type Market } from './outreachMarkets.ts';
import { labelMarketOf, prefixMarketOf } from './phoneCountry.ts';

export const VIEW_ME = 'me';
export const VIEW_UNASSIGNED = 'unassigned';
/** 'me', 'unassigned', or a team member's user id. */
export type InboxOwnerView = string;

export const COUNTRY_ALL = 'all';
export type InboxCountryFilter = 'all' | Market;
export const INBOX_COUNTRY_OPTIONS: ReadonlyArray<{ value: InboxCountryFilter; label: string }> = [
  { value: 'all', label: 'All countries' },
  ...MARKETS.map((m) => ({ value: m as InboxCountryFilter, label: m === 'UK' ? 'UK' : MARKET_NAME[m] })),
];

/** Does a lead with this owner belong to the chosen view? `me` is the signed-in user's id. */
export function ownerInView(view: InboxOwnerView, assignedTo: string | null | undefined, me: string | null | undefined): boolean {
  if (view === VIEW_UNASSIGNED) return !assignedTo;
  const wanted = view === VIEW_ME ? me : view;
  return !!wanted && assignedTo === wanted;
}

/** The market of a conversation. A number's OWN code wins over the label (phoneCountry.ts, 2026-10-22); with no code of ours the
 *  lead's country label decides. null = neither names one of the four markets (such a row shows under All only). */
export function inboxMarketOf(country: string | null | undefined, phoneDigits: string | null | undefined): Market | null {
  const byNumber = prefixMarketOf(phoneDigits);
  if (byNumber) return byNumber;
  const label = labelMarketOf(country);
  return label.kind === 'market' ? label.market : null;
}

export function countryInView(filter: InboxCountryFilter, country: string | null | undefined, phoneDigits: string | null | undefined): boolean {
  return filter === COUNTRY_ALL || inboxMarketOf(country, phoneDigits) === filter;
}

/** Another person's (or the unassigned) inbox is read-only unless the viewer is an admin. */
export function inboxIsReadOnly(view: InboxOwnerView, isAdmin: boolean): boolean {
  return view !== VIEW_ME && !isAdmin;
}
