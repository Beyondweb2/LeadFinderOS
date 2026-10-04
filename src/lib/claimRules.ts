/* ════════════════════════════════════════════════════════════════════════════════════════════════
   CLAIM RULES — the trust claims a generated page may make ONLY when a VERIFIED fact backs them
   (fix workstream 6, 2026-10-04; certification D-05 / D-20 / M-037).

   Session D proved the site gate checked consistency (name, phone, prices, placeholders) but never
   CLAIMS: a build saying "fully insured, 10 years' experience, 24/7, 30-minute response" passed 17/17.
   This module is the one list of those claim classes and the one decision:

     CLAIM_RULES          24/7 · insurance · years / since · response time · credentials, memberships and
                          named bodies · reviews and ratings · awards · job / customer counts · guarantees ·
                          price superlatives · "leading" / "No.1"
     claimSupport()       which rules the verified facts back (a verified fact must itself make the claim,
                          un-negated — "Within opening hours only (not 24/7)" backs NOTHING)
     scanClaims()         every claim hit in a text, each SUPPORTED or UNSUPPORTED, negations skipped
     claimExpect()        the rules + the verified values, as the site gate's --expect "claims" block
     DO_NOT_INVENT_LINES  the builder's instruction, word for word (build prompt + page generator)

   ⛔ ONE ALGORITHM IN TWO PLACES, ON PURPOSE: scripts/site-quality-gate.mjs is copied standalone into
      client repositories and cannot import this file, so it carries the same scan over the rules the
      expect file hands it. scripts/website-build-claims.test.ts runs BOTH over one corpus and fails on
      any disagreement — change one, change the other.
   ⛔ This does NOT prove every sentence true. It catches the claim classes that have bitten (and the
      ones a careless builder reaches for). Paul's final read of every page stays required.
   ⚠️ Edge-reachable (page-generator): no imports, pure. Never a backtick inside a template literal (§3).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export const CLAIM_RULES_VERSION = 1;

export interface ClaimRule {
  id: string;
  /** What the claim is, in Paul's words. */
  label: string;
  /** The fact-ledger keys whose VERIFIED value may back this claim. */
  factKeys: readonly string[];
  /** Case-insensitive regex source for the claim. */
  pattern: string;
  /** Case-insensitive regex source for NAMED things inside the class (a body, a standard): a named hit
   *  is supported only when that name itself appears in a verified fact — "Gas Safe registered" never
   *  backs "NICEIC approved". */
  named?: string;
  /** Every number in the hit must appear in a verified fact ("since 2019" ✓, "10 years" ✗). */
  numbersMatch?: boolean;
}

export const CLAIM_RULES: readonly ClaimRule[] = [
  { id: 'availability_247', label: '24/7, 24-hour or out-of-hours availability', factKeys: ['availability', 'opening_hours'],
    pattern: '\\b24\\s*/\\s*7\\b|\\b24[\\s-]*(?:hours?|hrs?)\\b|round[\\s-]the[\\s-]clock|\\bday (?:or|and) night\\b|\\b365 days\\b|\\bout[\\s-]of[\\s-]hours\\b|\\bany time,? day or night\\b' },
  { id: 'insurance', label: 'Insurance (insured, public liability, indemnity)', factKeys: ['insurance'],
    pattern: '\\b(?:fully\\s+)?insured\\b|\\bpublic liability\\b|\\bemployers[\'’]?\\s+liability\\b|\\bprofessional indemnity\\b' },
  { id: 'experience', label: 'Years of experience / trading since', factKeys: ['years_experience'], numbersMatch: true,
    /* The year / the number is ALWAYS inside the match ("Trading since 2019", never "Trading since"),
       so numbersMatch can check it against the verified fact. */
    pattern: '\\b\\d{1,3}\\+?\\s*(?:years?|yrs?)[\'’]?\\s+(?:of\\s+)?(?:experience|in (?:the )?(?:trade|business|industry))\\b|\\b(?:trading\\s+)?(?:since|established(?: in)?|founded in|est\\.?)\\s+(?:19|20)\\d{2}\\b|\\btrading for (?:over |more than )?\\d+\\+?\\s*(?:years?|yrs?)\\b|\\b(?:years|decades) of experience\\b|\\bover (?:a|\\d+) (?:years?|decades?)\\b' },
  { id: 'response_time', label: 'Response or arrival time', factKeys: ['response_time'], numbersMatch: true,
    pattern: '\\bwithin\\s+(?:\\d+|an?|one|two|three|half an)\\s*(?:minutes?|mins?|hours?|hrs?)\\b|\\b\\d+[\\s-]*(?:minute|min|hour)s?\\s+(?:response|arrival|call[\\s-]?out)\\b|\\bsame[\\s-]day\\b|\\b(?:fast|rapid|quick) response\\b' },
  /* A NAMED body or standard is backed by ANY verified fact naming it (TS007 in "what makes them
     different" backs TS007); a generic word ("approved", "qualified") only by a verified credential. */
  { id: 'credentials', label: 'Credentials, registrations, checks and memberships', factKeys: ['accreditations', 'memberships', 'dbs'],
    pattern: '\\b(?:accredited|certified|qualified|licensed|vetted|registered with)\\b|\\b(?:insurance|police|council|manufacturer|trading standards)[\\s-]approved\\b|\\bapproved (?:installers?|locksmiths?|contractors?|electricians?|plumbers?|engineers?|traders?|suppliers?|members?)\\b|\\b(?:dbs|police|background)[\\s-]checked\\b|\\bgas safe\\b|\\bniceic\\b|\\bnapit\\b|\\boftec\\b|\\bhetas\\b|\\btrustmark\\b|\\bcheckatrade\\b|\\bwhich\\?\\s*trusted\\b|\\bmybuilder\\b|\\brated people\\b|\\bfederation of master builders\\b|\\bfmb\\b|\\bmla\\b|\\bmaster locksmiths\\b|\\bcity\\s*(?:&|and)\\s*guilds\\b|\\bnvq\\b|\\bpart p\\b|\\belecsa\\b|\\baphc\\b|\\bciphe\\b|\\bbuy with confidence\\b|\\bsold secure\\b|\\bbs\\s?3621\\b|\\bts\\s?007\\b|\\bkitemark\\b',
    named: '\\bgas safe\\b|\\bniceic\\b|\\bnapit\\b|\\boftec\\b|\\bhetas\\b|\\btrustmark\\b|\\bcheckatrade\\b|\\bwhich\\?\\s*trusted\\b|\\bmybuilder\\b|\\brated people\\b|\\bfederation of master builders\\b|\\bfmb\\b|\\bmla\\b|\\bmaster locksmiths\\b|\\bcity\\s*(?:&|and)\\s*guilds\\b|\\bnvq\\b|\\bpart p\\b|\\belecsa\\b|\\baphc\\b|\\bciphe\\b|\\bbuy with confidence\\b|\\bsold secure\\b|\\bbs\\s?3621\\b|\\bts\\s?007\\b|\\bkitemark\\b|\\b(?:dbs|police|background)[\\s-]checked\\b' },
  { id: 'reviews', label: 'Reviews, ratings and stars', factKeys: ['review_profiles'], numbersMatch: true,
    pattern: '\\brated\\s+[1-5](?:\\.\\d)?\\b|\\b[1-5](?:\\.\\d)?\\s*(?:/\\s*5|out of 5)\\b|\\b(?:[1-5]|five)[\\s-]star\\s+(?:rated|rating|reviews?|service)\\b|\\b\\d[\\d,]*\\+?\\s+(?:google\\s+|verified\\s+|five[\\s-]star\\s+|5[\\s-]star\\s+)?reviews\\b|\\btop[\\s-]rated\\b|\\bhighly[\\s-]rated\\b|\\btrustpilot\\b' },
  { id: 'awards', label: 'Awards', factKeys: ['awards'],
    pattern: '\\baward[\\s-]?winning\\b|\\bwinners? of\\b|\\bawarded\\b|\\bfinalists?\\b' },
  { id: 'track_record', label: 'Job, project or customer counts', factKeys: ['standout', 'projects'], numbersMatch: true,
    pattern: '\\b\\d[\\d,]*\\+?\\s+(?:jobs|projects|installations|installs|customers|clients|homes|properties|households|businesses)\\b|\\b(?:hundreds|thousands) of (?:happy |satisfied )?(?:customers|clients|jobs|homes)\\b' },
  { id: 'guarantee', label: 'Guarantees and warranties', factKeys: ['guarantee', 'standout'],
    pattern: '\\bguarantee[ds]?\\b|\\bwarrant(?:y|ies)\\b|\\bmoney[\\s-]back\\b' },
  { id: 'price_superlative', label: 'Cheapest / best price / price match', factKeys: ['prices', 'standout'],
    pattern: '\\bcheapest\\b|\\blowest prices?\\b|\\bbest prices?\\b|\\bunbeatable\\b|\\bprice[\\s-]match' },
  { id: 'leading', label: '"Leading", "No.1" or "number one"', factKeys: ['standout', 'awards'],
    pattern: '\\bno\\.?\\s?1\\b|\\bnumber one\\b|#1\\b|\\bleading (?:local )?(?:\\w+ )?(?:company|firm|provider|specialists?|experts?)\\b' },
];

/** A claim hit is skipped when this is in the same sentence just before it ("no 24-hour call-outs",
 *  "not DBS checked", "we do not offer out-of-hours work", "we can't guarantee…"). */
export const NEGATION_BEFORE = '\\b(?:no|not|never|without|nor|neither|cannot|can[\'’]?t|don[\'’]?t|doesn[\'’]?t|isn[\'’]?t|aren[\'’]?t|won[\'’]?t|do not|does not|is not|are not)\\b[^.!?;:]{0,32}$';

export interface ClaimHit {
  rule: string;
  label: string;
  /** The words that matched, as written. */
  text: string;
  supported: boolean;
  /** Why it is unsupported, in words. */
  why: string;
}

const squash = (s: string) => String(s).toLowerCase().replace(/&/g, ' and ').replace(/[^a-z0-9?]+/g, ' ').trim();
const numbersIn = (s: string) => (String(s).match(/\d+(?:\.\d+)?/g) ?? []);

/** Every un-negated match of a rule in a text. */
function hitsOf(rule: ClaimRule, text: string): string[] {
  const out: string[] = [];
  const re = new RegExp(rule.pattern, 'gi');
  const neg = new RegExp(NEGATION_BEFORE, 'i');
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    if (!m[0]) { re.lastIndex++; continue; }
    const before = text.slice(Math.max(0, m.index - 60), m.index);
    if (!neg.test(before)) out.push(m[0]);
  }
  return out;
}

export interface ClaimSupport {
  /** Rule id → the verified values that make that claim themselves. */
  supported: Record<string, string[]>;
  /** Every verified value (any key), for the named-body and number checks. */
  verified: string[];
}

/** Which rules the verified facts back. `facts` = the VERIFIED values only, by fact key. */
export function claimSupport(facts: ReadonlyArray<{ key: string; value: string }>): ClaimSupport {
  const supported: Record<string, string[]> = {};
  for (const r of CLAIM_RULES) {
    const vals = facts.filter((f) => r.factKeys.includes(f.key) && f.value.trim() && hitsOf(r, f.value).length).map((f) => f.value.trim());
    if (vals.length) supported[r.id] = vals;
  }
  return { supported, verified: facts.map((f) => f.value.trim()).filter(Boolean) };
}

/** Every claim hit in `text`, each judged against the support. Pure. */
export function scanClaims(text: string, support: ClaimSupport): ClaimHit[] {
  const out: ClaimHit[] = [];
  const all = squash(support.verified.join(' | '));
  for (const r of CLAIM_RULES) {
    const backing = support.supported[r.id] ?? [];
    for (const t of hitsOf(r, String(text))) {
      let why = '';
      const named = r.named ? new RegExp(r.named, 'i').exec(t) : null;
      if (named) { if (!all.includes(squash(named[0]))) why = '"' + named[0] + '" is not in any verified fact'; }
      else if (!backing.length) why = 'no verified fact says this';
      if (!why && r.numbersMatch) {
        const nums = numbersIn(t);
        const have = new Set(numbersIn(backing.concat(support.verified).join(' ')));
        const missing = nums.filter((n) => !have.has(n));
        if (missing.length) why = 'the figure ' + missing.join(', ') + ' is not in a verified fact';
      }
      out.push({ rule: r.id, label: r.label, text: t, supported: !why, why });
    }
  }
  return out;
}

/** The site gate's --expect "claims" block: the rules and what the verified facts back. */
export interface ClaimExpect {
  claimRulesVersion: number;
  negation: string;
  rules: Array<{ id: string; label: string; pattern: string; named?: string; numbersMatch?: boolean; supportedBy: string[] }>;
  verified: string[];
}
export function claimExpect(facts: ReadonlyArray<{ key: string; value: string }>): ClaimExpect {
  const s = claimSupport(facts);
  return {
    claimRulesVersion: CLAIM_RULES_VERSION,
    negation: NEGATION_BEFORE,
    rules: CLAIM_RULES.map((r) => ({ id: r.id, label: r.label, pattern: r.pattern, ...(r.named ? { named: r.named } : {}), ...(r.numbersMatch ? { numbersMatch: true } : {}), supportedBy: s.supported[r.id] ?? [] })),
    verified: s.verified,
  };
}

/** The builder's instruction (build prompts and the page generator). Word for word, one place. */
export const DO_NOT_INVENT_LINES: readonly string[] = [
  '⛔ DO NOT INVENT — use ONLY the verified facts supplied. If a fact is not supplied, leave it out (the section closes up) and list it for Paul. Never invent:',
  '  services · service areas · prices · insurance · qualifications · experience (years, "since", "established") · response or arrival times ·',
  '  24/7 or out-of-hours availability · reviews, ratings or star counts · awards · memberships, registrations or approvals · projects, jobs or customer counts.',
  '  Never write a stock or generated image as the client\'s own work, and never a before / after you were not given.',
  'The site quality gate scans every page for these claim classes and FAILS one that no verified fact backs (a negation such as "no 24-hour call-outs" is fine). It cannot prove every sentence true: Paul still reads every page.',
];
