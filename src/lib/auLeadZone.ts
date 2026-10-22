/* ══ AN AUSTRALIAN LEAD'S TIME ZONE, FROM ITS STATE — ONE RULE (2026-10-22, feat/australia-whatsapp) ══════════════════
   Australia is a WhatsApp market whose send hours are read in each LEAD's own zone (src/lib/outreachMarkets.ts
   PER_LEAD_ZONE_MARKETS). Australia spans five zones and three of its states keep daylight saving while the others do
   not, so one country zone would send to Perth at 06:00 or to Sydney at 19:00.

   ⛔ THE STATE COMES FROM THE LEAD, IN THIS ORDER, AND THE FIRST ONE THAT NAMES A STATE WINS:
        1. its address (Google's own: "12 Smith St, Richmond VIC 3121, Australia" — the state word, else the postcode);
        2. its Coverage town (`coverage_town`, always "Name STATE" — src/lib/australiaTowns.ts);
        3. the search it was found by (`search_location`, "Ballarat VIC, Australia");
        4. its derived town, when written with a state.
      A bare town name is NEVER turned into a state (findAuTown would guess "Ballarat" → VIC; this file does not):
      no state anywhere = "needs state", and the lead is held — never sent in a guessed zone.
   ⛔ PROPER IANA ZONES (daylight saving is the zone's, never a fixed offset):
        NSW, ACT → Australia/Sydney · VIC → Australia/Melbourne · TAS → Australia/Hobart (same clock as Melbourne)
        QLD → Australia/Brisbane (no DST) · SA → Australia/Adelaide · NT → Australia/Darwin (no DST) · WA → Australia/Perth
      (Broken Hill NSW keeps Adelaide time; it is read as NSW, so its window runs 08:30–16:30 on its own clock.)
   Pure. Edge-reachable: relative imports with .ts only. */
import { auStateOfAddress, parseAuTown, type AustraliaStateCode } from './australiaTowns.ts';

export const AU_STATE_TIME_ZONES: Readonly<Record<AustraliaStateCode, string>> = {
  NSW: 'Australia/Sydney', ACT: 'Australia/Sydney', VIC: 'Australia/Melbourne', TAS: 'Australia/Hobart',
  QLD: 'Australia/Brisbane', SA: 'Australia/Adelaide', NT: 'Australia/Darwin', WA: 'Australia/Perth',
};

/** The words a held lead shows (queue panel, Outreach, Inbox). */
export const NEEDS_STATE = 'needs_state';
export const NEEDS_STATE_LABEL = 'Needs state';
export { NEEDS_STATE_REFUSAL as NEEDS_STATE_DETAIL } from './inboxSendWindow.ts';

export interface AuZoneLead {
  address?: string | null;
  coverage_town?: string | null;
  search_location?: string | null;
  derived_town?: string | null;
}

export type AuZone =
  | { state: AustraliaStateCode; tz: string; from: 'address' | 'coverage_town' | 'search_location' | 'derived_town' }
  | { state: null; tz: null; from: null };

/** The lead's state and zone, or nulls ("needs state"). */
export function auLeadZone(lead: AuZoneLead | null | undefined): AuZone {
  if (!lead) return { state: null, tz: null, from: null };
  const fromAddress = auStateOfAddress(lead.address ?? null);
  if (fromAddress) return { state: fromAddress, tz: AU_STATE_TIME_ZONES[fromAddress], from: 'address' };
  for (const k of ['coverage_town', 'search_location', 'derived_town'] as const) {
    const s = parseAuTown(lead[k] ?? null).state;
    if (s) return { state: s, tz: AU_STATE_TIME_ZONES[s], from: k };
  }
  return { state: null, tz: null, from: null };
}

/** Just the zone (null = needs state). */
export const auLeadTz = (lead: AuZoneLead | null | undefined): string | null => auLeadZone(lead).tz;

/** The lead columns this rule reads — every query that feeds it selects these (outreach_leads; sales_leads has all but
 *  coverage_town, which is then simply absent). */
export const AU_ZONE_COLUMNS = 'address, coverage_town, search_location, derived_town';
export const AU_ZONE_COLUMNS_SALES = 'address, search_location, derived_town';
