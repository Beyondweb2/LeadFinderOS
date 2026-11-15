// WHAT A PAGE PLAINLY SHOWS — one copy of each reading rule the website checks share (2026-11-15, docs/WEBSITE_CHECK_ACCURACY.md).
//
// Each rule here was wrong on the accuracy bench in more than one place at once (the crawl's page reader, fullCrawl.processPage,
// and the content checks, contentTrust.pageObservations, each had their own copy). One copy, imported by both.
// Leaf module: no imports, reachable from edge functions.

/** Text a visitor never sees: an HTML comment ("<!-- <a href="">Read More</a> -->" was called a dead link, mcdrive.co.uk). */
export function withoutComments(html: string): string {
  return String(html || '').replace(/<!--[\s\S]*?-->/g, ' ');
}

/** Words that mean the page shows customer proof: a testimonial, a review, a rating source. A miss here makes the check say
 *  "no reviews" of a site that has them (bench: 8 of 21 such claims false), so it errs towards finding proof. */
export const PROOF_RE = /\b(?:testimonials?|what (?:our|my|people|others|customers|clients|pupils|students) (?:customers |clients |pupils |students )?(?:say|said|think)|customer (?:reviews?|feedback)|google reviews?|reviews? from|recent reviews|our reviews|success stories|(?:would|wouldn[’']t hesitate to|thoroughly|definitely|strongly|highly|totally|really) recommend(?:ed)?|recommended (?:him|her|them|us)|5[- ]stars?|five[- ]stars?|trustpilot|check ?a ?trade|trust ?a ?trader|rated people|mybuilder|yell reviews)\b|★/i;

/** A page that is itself the reviews page, by its title or main heading ("Reviews | TMDS" at /general-4). */
export const PROOF_PAGE_RE = /^\s*(?:(?:our |customer |client |pupil )?(?:reviews?|testimonials?|feedback)|success stories|what (?:our )?(?:customers|clients|people) say)\b/i;

/** A street line: "26 Dalley Road", "9 Ethel Bailey Close", "Unit 4, Station Industrial Estate". With a postcode or without. */
export const STREET_RE = /\b(?:\d{1,4}[A-Za-z]?|Unit \d{1,4}[A-Za-z]?),?\s+(?:[A-Z][A-Za-z'’-]+\s+){1,3}(?:Road|Rd|Street|St|Lane|Ln|Avenue|Ave|Close|Drive|Dr|Way|Crescent|Cres|Place|Pl|Court|Ct|Gardens|Gdns|Grove|Terrace|Park|Square|Sq|Hill|Row|Mews|Walk|Rise|View|Estate|Parade|Green|Industrial Estate|Business Park)\b/i;

/** Link labels that are page furniture, not links to content: cookie banners, log-in boxes, menus. A "#" on one of these is a
 *  button, never a dead link (bench: Decline / Configure / Forgot Password? were called dead links). */
export const UI_LABEL_RE = /^(?:accept(?: all)?|decline|reject(?: all)?|configure|customi[sz]e|preferences|manage (?:cookies|preferences)|cookie (?:settings|policy)|settings|ok|got it|close|dismiss|forgot (?:your )?password\??|log ?in|sign ?in|sign ?up|register|my account|account|menu|search|toggle|open|skip|top|back to top|more|less|more less|show (?:more|less)|share|print)$|\b(?:cookies?|consent|privacy settings)\b/i;

/** True when the character at `index` sits inside a <nav> or <header> element: a "#" there opens a menu. */
export function insideNav(html: string, index: number): boolean {
  const before = html.slice(Math.max(0, index - 20_000), index).toLowerCase();
  for (const tag of ['nav', 'header']) {
    const open = before.lastIndexOf(`<${tag}`);
    if (open >= 0 && before.lastIndexOf(`</${tag}>`) < open) return true;
  }
  return false;
}

/** True when a link sits in a cookie / consent box (its buttons are "#" links: "Save Settings", "Configure"). Read from the
 *  markup just before it: a class or id naming cookies or consent. */
export function insideConsentBox(html: string, index: number): boolean {
  return /\b(?:class|id)=["'][^"']*(?:cookie|consent|gdpr|cmplz|privacy-settings|cc-window|onetrust)[^"']*["']/i.test(html.slice(Math.max(0, index - 3000), index));
}

/** A business's start, said in a sole trader's own words ("before setting up McDrive in 2020"): a named thing set up, founded
 *  or started in a year. The personal-sentence filter rightly drops "I have driven since 2005"; this names the business. */
export const NAMED_START_RE = /\b(?:set(?:ting)? up|found(?:ed|ing)|start(?:ed|ing)|launch(?:ed|ing)|establish(?:ed|ing))\s+((?:[A-Z][\w&'’.-]*\s?){1,4})\s+in\s+((?:19|20)\d{2})\b/g;

/** "I'm Matt McKay", "I’m Gary, Gas Safe engineer": a person introducing themselves by name (curly apostrophe included). */
export const SELF_INTRO_RE = /\b(?:I[’']m|I am|my name is|meet)\s+[A-Z][a-z]+(?:\s+[A-Z][a-z]+)?\b/;

/** Pages that are rightly kept out of search: a cart, a checkout, an account, a booking widget, a member profile. A noindex on
 *  one of these is good practice, never an issue (bench: the cart page and booking calendars were called a problem). */
export const UTILITY_PATH_RE = /\/(?:(?:cart|basket|checkout)(?:-page)?|my-?account|account|login|log-?in|register|sign-?in|sign-?up|profile|members?|booking-calendar|book-online|bookings?|thank-?you|search|wp-admin|feed)(?:\/|$|\?)/i;

/** A word in a page's address that names a SERVICE (not a trade): "/fencing-grantham", "/pat-testing-sevenoaks-kent",
 *  "/driving-course/48-hours-course-manual". A page so named is a page about a service, whatever the crawl's family guess
 *  (bench: "no separate service pages" said of three sites that have them). "electrician" / "roofer" name a trade: not counted. */
export const SERVICE_SLUG_RE = /^(?:testing|tests?|fencing|fences?|gates?|rewir\w*|wiring|lighting|lights|ev|chargers?|charging|solar|batter(?:y|ies)|eicr|pat|inspections?|alarms?|cctv|boilers?|heating|radiators?|bathrooms?|kitchens?|drain\w*|leaks?|gutter\w*|guttering|chimneys?|fascias?|facias?|soffits?|cladding|flat|tiling|tiles?|locks?|doors?|windows?|glazing|extensions?|lofts?|conversions?|renovations?|plaster\w*|decorat\w*|painting|carpentry|joinery|landscap\w*|paving|driveways?|cleaning|pest|removals?|repairs?|installations?|installs?|replacements?|servicing|maintenance|surveys?|assessments?|damp|proofing|timber|rot|courses?|lessons?|tuition|intensive|refresher|automatic|manual|design|seo|ppc|ads|branding|hosting|apps?|dashboards?|automation|portals?|bookkeeping|accounts|payroll|vat|tax)$/i;

/** The inner HTML of each <hN> on the page, closed or not: a builder that writes "<h2><h1>FAQs<h1><br>" still shows an H1 in
 *  every browser (bench: ladiesfirstdrivingschool.co.uk /faqs called "no H1"). Ends at its own close, the next heading or the
 *  enclosing block's close. */
export function headingHtml(html: string, level: 1 | 2 | 3, max: number): string[] {
  const re = new RegExp(`<h${level}\\b[^>]*>([\\s\\S]*?)(?=<\\/h${level}>|<h[1-6]\\b|<\\/h[1-6]>|<\\/(?:div|section|header|article|p)>)`, 'gi');
  const out: string[] = [];
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null && out.length < max) { if (m[1].trim()) out.push(m[1]); }
  return out;
}

/** A heading that asks a question a customer would ask, not a form label ("How many sockets would you like?"). */
export function isCustomerQuestion(h: string): boolean {
  const t = String(h || '').trim();
  if (!/\?\s*$/.test(t) || t.length < 8 || t.length > 160) return false;
  /* Nor a section title punctuated as one ("WHAT OUR CUSTOMERS SAY?"). */
  return !/\b(?:what (?:our|my|people|others) (?:customers |clients )?(?:say|think)|would you like|do you (?:want|need) to (?:add|include)|how many [a-z]+ (?:do you|would you)|select|choose|enter your|your (?:name|email|phone|postcode))\b/i.test(t);
}

/** The headings and text of an FAQ: an "FAQ / Frequently asked questions" heading, or at least `min` customer questions. */
export function looksLikeFaq(headings: readonly string[], min = 3): boolean {
  if (headings.some((h) => /\b(?:faqs?|frequently asked|common questions|questions (?:and|&) answers|q ?& ?a|quick answers)\b/i.test(h))) return true;
  return headings.filter(isCustomerQuestion).length >= min;
}
