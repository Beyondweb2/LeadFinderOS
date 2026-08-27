/* ════════════════════════════════════════════════════════════════════════════════════════════
   TRADE CREDENTIAL SUGGESTIONS — a menu of what a trade COMMONLY holds, for the operator to tick.

   ⛔ THESE ARE NOT EVIDENCE ABOUT A CLIENT. They are the credentials that exist in a trade, offered
   so the operator does not have to remember the exact scheme names. Nothing here says this client
   holds anything, and nothing may ever be ticked automatically. Ticking is the operator asserting
   "I know this client genuinely holds this, and it is current" — which is the only basis on which a
   trust claim should reach a live page.

   ⚠️ WHY THIS IS SAFER THAN THE SCRAPED LIST IT REPLACES, and the reasoning is worth keeping:
   a scraped suggestion arrives looking like evidence ("it's on their site"), which invites a
   rubber-stamp tick — but a website only shows a claim was made ONCE, never that a registration is
   CURRENT. A generic trade suggestion cannot be mistaken for evidence, so it forces the operator to
   supply the knowledge rather than confirming a machine's guess. Paul's call, 2026-08-28: stop
   scraping credentials, suggest by trade instead.

   ⛔ A CURATED LIST THAT OFFERS, NEVER ASSERTS — the same law as directoryFacts (CLAUDE.md §6).
   Add scheme names here freely; the list can only ever change what the operator is OFFERED.
   ⚠️ Registration NUMBERS are deliberately absent. A number is client-specific and must be typed,
   so the labels end with the scheme, and the field stays free text for exactly that reason.
   ════════════════════════════════════════════════════════════════════════════════════════════ */

export interface CredentialSuggestion {
  /** The wording that lands on the page when ticked. Kept as a real phrase, not a bare scheme name,
   *  so a ticked suggestion reads as a sentence fragment rather than a label. */
  label: string;
  /** Trade keywords this belongs to. `null` = offered for every trade. */
  trades: string[] | null;
  /** Shown beside the label so the operator can tell two similar schemes apart. */
  note?: string;
}

/* Matched on the trade string with whole-word tests (see suggestCredentials), so "gas" does not
   fire on "Glazing" and "lock" does not fire on "Blocked drains". */
export const CREDENTIAL_SUGGESTIONS: readonly CredentialSuggestion[] = [
  // ── every trade ────────────────────────────────────────────────────────────────────────────
  { label: 'fully insured', trades: null, note: 'public liability — say the amount if you know it' },
  { label: 'DBS checked', trades: null, note: 'working in customers’ homes' },
  { label: 'Which? Trusted Trader', trades: null },
  { label: 'Checkatrade member', trades: null },
  { label: 'TrustMark registered', trades: null, note: 'government-endorsed quality scheme' },

  // ── plumbing / heating / gas ───────────────────────────────────────────────────────────────
  { label: 'Gas Safe registered', trades: ['plumber', 'plumbing', 'heating', 'gas', 'boiler'], note: 'legally required for gas work' },
  { label: 'CIPHE member', trades: ['plumber', 'plumbing', 'heating'], note: 'Chartered Institute of Plumbing & Heating Engineering' },
  { label: 'OFTEC registered', trades: ['plumber', 'plumbing', 'heating', 'oil'], note: 'oil-fired appliances' },
  { label: 'WaterSafe approved', trades: ['plumber', 'plumbing'] },

  // ── electrical ─────────────────────────────────────────────────────────────────────────────
  { label: 'NICEIC approved contractor', trades: ['electric', 'electrician', 'electrical'] },
  { label: 'NAPIT registered', trades: ['electric', 'electrician', 'electrical'] },
  { label: 'Part P registered', trades: ['electric', 'electrician', 'electrical'], note: 'domestic electrical work' },
  { label: 'ECA member', trades: ['electric', 'electrician', 'electrical'] },

  // ── locksmiths ─────────────────────────────────────────────────────────────────────────────
  { label: 'MLA approved (Master Locksmiths Association)', trades: ['locksmith', 'lock'], note: 'the only vetted UK locksmith body' },
  { label: 'police-vetted', trades: ['locksmith', 'lock'] },

  // ── driving instruction ────────────────────────────────────────────────────────────────────
  { label: 'DVSA approved driving instructor (ADI)', trades: ['driving', 'instructor', 'motoring'] },
  { label: 'grade A DVSA standards check', trades: ['driving', 'instructor', 'motoring'] },

  // ── building / roofing / joinery ───────────────────────────────────────────────────────────
  { label: 'FMB member (Federation of Master Builders)', trades: ['build', 'builder', 'building', 'construction', 'extension'] },
  { label: 'NFRC member', trades: ['roof', 'roofer', 'roofing'] },
  { label: 'CSCS carded', trades: ['build', 'builder', 'building', 'construction', 'roof', 'roofing'] },
  { label: 'FENSA registered', trades: ['window', 'glazing', 'glazier', 'conservatory'] },
  { label: 'CERTASS registered', trades: ['window', 'glazing', 'glazier'] },

  // ── other common trades ────────────────────────────────────────────────────────────────────
  { label: 'Gas Safe registered', trades: ['appliance'], note: 'gas appliances only' },
  { label: 'SafeContractor approved', trades: ['clean', 'cleaning', 'maintenance', 'facilities'] },
  { label: 'City & Guilds qualified', trades: null },
  { label: 'NPTC certified', trades: ['tree', 'garden', 'landscap', 'arborist'], note: 'chainsaw / tree work' },
  { label: 'Gas Safe registered (LPG)', trades: ['caravan', 'motorhome'] },
];

/** Whole-word-ish keyword test: matches "plumber" in "Plumbers" and "Emergency Plumbing", but never
 *  as a fragment of an unrelated word. Trade strings come from the CRM's own search_keyword, which
 *  is operator-typed and plural/mixed-case ("Driving instructors", "Locksmiths"). */
function tradeMentions(trade: string, keyword: string): boolean {
  const t = ` ${String(trade ?? '').toLowerCase().replace(/[^a-z]+/g, ' ').trim()} `;
  if (t.trim() === '') return false;
  const k = keyword.toLowerCase();
  /* Allow a trailing plural/derivation (plumber→plumbers, electric→electrical/electrician,
     landscap→landscaping) but require the keyword to START a word, so "lock" cannot match "blocked". */
  return new RegExp(`\\s${k}[a-z]{0,6}\\s`).test(t);
}

/**
 * Credentials worth OFFERING for a trade: the trade-specific ones first (most recognisable to a
 * customer), then the ones that apply to any trade. Deduped on label.
 *
 * ⛔ ORDER IS NOT PRIORITY AND CARRIES NO CLAIM. An unknown or blank trade returns ONLY the
 * every-trade entries rather than nothing: absence of a trade match must not leave the operator
 * with an empty list and no way to record "fully insured" (absence is never an answer, §6).
 */
export function suggestCredentials(trade: string | null | undefined): CredentialSuggestion[] {
  const t = String(trade ?? '').trim();
  const specific: CredentialSuggestion[] = [];
  const general: CredentialSuggestion[] = [];
  for (const c of CREDENTIAL_SUGGESTIONS) {
    if (c.trades === null) general.push(c);
    else if (t && c.trades.some((k) => tradeMentions(t, k))) specific.push(c);
  }
  const seen = new Set<string>();
  const out: CredentialSuggestion[] = [];
  for (const c of [...specific, ...general]) {
    const k = c.label.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(c);
  }
  return out;
}
