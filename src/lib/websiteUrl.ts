/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE WEBSITE A CUSTOMER TYPES — normalised and judged at the point of entry.

   ⛔ VALIDATED WHERE THEY CAN STILL FIX IT, NOT HOURS LATER IN A LOG. Same rule as the phone field:
   findable-onboarding refuses a number WhatsApp cannot dial at SEND time, which is a refusal aimed
   at somebody who has already paid and cannot see it. A URL is worse, because a bad one is not
   refused at all — it is simply scanned, fails, and the report quietly has no website section.

   🔴 BLANK IS UNKNOWN, NEVER FALSE, AND THAT IS THE WHOLE POINT OF THE THREE-WAY RETURN.
   `has_website` is a tri-state for a reason (§22): a site on the audit or the lead → true; no site
   but a `place_id`, so Google was asked and found none → false; no `place_id`, so nobody ever
   looked → null, and the report says NOTHING about their website rather than offering to build one.
   Somebody not typing a URL into an optional box is not evidence of anything, so `blank` must never
   collapse into "no website" — it has to leave the existing evidence exactly as it was.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export type WebsiteVerdict =
  /** Nothing typed. Records nothing, changes nothing, and must never read as "they have no site". */
  | { kind: 'blank' }
  /** A usable URL, normalised to something fetchable. */
  | { kind: 'ok'; url: string }
  /** Typed, but not a web address. Told to them at entry, in these words. */
  | { kind: 'invalid'; reason: string };

/* Hosts that are somebody else's platform rather than the business's own site. NOT rejected — a
   Facebook page is a real answer to "where are you online" and refusing it would push the customer
   into typing nothing, which is the one outcome that destroys information. The SEO scan already
   declines to scan them (isAggregatorUrl, §9) and the report already treats them as no own website.
   Kept here only so the entry hint can say so plainly. */
const AGGREGATOR_HINT = /(^|\.)(facebook|instagram|linkedin|twitter|x|tiktok|youtube|yell|checkatrade|trustatrader|mybuilder|bark|thomsonlocal|freeindex|gumtree|nextdoor)\.[a-z.]+$/i;

/** Obvious non-answers people type into an optional box. Treated as blank, not as an error: they
 *  mean "I have not got one", and scolding somebody for saying so is how a form loses a payment. */
const NON_ANSWERS = new Set([
  'n/a', 'na', 'none', 'no', 'nope', 'nil', '-', '--', 'no website', 'nowebsite', 'dont have one',
  "don't have one", 'i dont have one', "i don't have one", 'not yet', 'tbc', 'n / a',
]);

/**
 * Judge and normalise what was typed into the website box.
 *
 * ⚠️ IT ADDS `https://` RATHER THAN REFUSING A BARE HOST. People type "whitesparks.co.uk", and a
 * form that rejects that is wrong about who is mistaken. The scheme is ours to supply.
 */
export function readWebsite(raw: string | null | undefined): WebsiteVerdict {
  const t = String(raw ?? '').trim();
  if (!t) return { kind: 'blank' };
  if (NON_ANSWERS.has(t.toLowerCase().replace(/\s+/g, ' '))) return { kind: 'blank' };

  /* An email address is the commonest wrong answer in a box beside an email field. Caught by name
     so the message can say what is wrong instead of "invalid". */
  if (/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(t)) {
    return { kind: 'invalid', reason: "That looks like an email address, not a website." };
  }
  if (/\s/.test(t)) return { kind: 'invalid', reason: "A web address cannot contain a space." };

  const withScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(t) ? t : `https://${t}`;
  let u: URL;
  try { u = new URL(withScheme); } catch { return { kind: 'invalid', reason: "That doesn't look like a web address." }; }

  if (u.protocol !== 'http:' && u.protocol !== 'https:') {
    return { kind: 'invalid', reason: "That doesn't look like a web address." };
  }
  const host = u.hostname.toLowerCase();
  /* A dot and a plausible tail. Deliberately not a TLD list: a list goes stale and would refuse a
     real business on a new one, and the cost of accepting a typo here is a scan that finds nothing
     — the cost of refusing a real site is the customer giving up on the field. */
  if (!host.includes('.') || host.startsWith('.') || host.endsWith('.')) {
    return { kind: 'invalid', reason: "That doesn't look like a web address." };
  }
  if (!/\.[a-z]{2,}$/i.test(host)) {
    return { kind: 'invalid', reason: "That doesn't look like a web address." };
  }
  if (host === 'localhost' || /^\d+\.\d+\.\d+\.\d+$/.test(host)) {
    return { kind: 'invalid', reason: "That doesn't look like a web address." };
  }

  /* Normalised so "WhiteSparks.co.uk/", "https://whitesparks.co.uk" and "www.whitesparks.co.uk" do
     not read as three different sites when compared against what Google gave us. The PATH is kept:
     a business really can live at /shop, and silently truncating it would point the scan elsewhere. */
  u.hostname = host;
  u.hash = '';
  const out = u.toString().replace(/\/$/, '');
  return { kind: 'ok', url: out };
}

/** True when the URL is somebody else's platform rather than their own site. Display hint only. */
export const looksLikeAggregator = (url: string): boolean => {
  try { return AGGREGATOR_HINT.test(new URL(url).hostname); } catch { return false; }
};

/**
 * Do two website values point at the same place? Used to decide whether a typed answer DISAGREES
 * with Google's, exactly as the phone write-back compares digits rather than punctuation — so
 * "whitesparks.co.uk" and "https://www.whitesparks.co.uk/" do not trigger a pointless overwrite
 * and a spurious note.
 */
export function sameWebsite(a: string | null | undefined, b: string | null | undefined): boolean {
  const key = (v: string | null | undefined) => {
    const r = readWebsite(v);
    if (r.kind !== 'ok') return '';
    try {
      const u = new URL(r.url);
      const host = u.hostname.replace(/^www\./, '');
      const path = u.pathname.replace(/\/$/, '');
      return `${host}${path}${u.search}`.toLowerCase();
    } catch { return ''; }
  };
  const ka = key(a);
  const kb = key(b);
  return !!ka && ka === kb;
}
