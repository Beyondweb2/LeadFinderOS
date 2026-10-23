/* ════════════════════════════════════════════════════════════════════════════════════════════════
   IS THIS LINKEDIN PROFILE THE PERSON WHO RUNS THIS BUSINESS? — the match rules (2026-09-30).

   Every profile a provider returns is a CANDIDATE, never an answer. This file grades each one against
   what we know about the business and the person, and decides whether there is one clear match, a set
   for a human to review, or nothing.

   ⛔ THE CONFIDENCE LADDER (Paul's three words; the same three the social-profiles table uses):
      CONFIRMED  — a HARD LINK between the business and the profile, plus the person's full name:
                   the business's own website links this exact profile, or the profile's own structured
                   data points at the business's domain or its LinkedIn company page. Soft agreement
                   (name + company + town) is never enough on its own, however much of it there is —
                   two "Hughes Plumbing"s in two towns is a real shape.
      LIKELY     — full name (or a known short form: Dave/David) AND the CURRENT company matches AND at
                   least one more independent signal: the town, a decision-maker title, the website's
                   domain in the profile text.
      UNVERIFIED — anything weaker that still carries the name. NEVER canonical automatically.
      (no name match → not a candidate at all; it is dropped with a reason.)
   ⛔ CONFLICTS CAP AT UNVERIFIED: a current employer that is clearly a different business, or a profile
      in a different country. A same-name stranger is the commonest wrong answer.
   ⛔ ONE CLEAR ANSWER OR REVIEW: two CONFIRMED, or two LIKELY with no CONFIRMED, is REVIEW — never pick.
   ⛔ COUNTRY-NEUTRAL: company suffixes for UK (Ltd, Limited, LLP, PLC), US (LLC, Inc, Corp) and AU
      (Pty Ltd, Proprietary Limited) all fold away; no postcode or UK address shape is read.

   Pure — no network, no Supabase. Imported by the edge service: relative .ts imports only.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import { foldAccents, roleFromText, tidyPersonName, type DecisionRole } from './decisionMaker.ts';

export type MatchConfidence = 'confirmed' | 'likely' | 'unverified';
export type LinkedInKind = 'person' | 'company';
export type DiscoveryCountry = 'UK' | 'US' | 'AU';

/* ── URLs ───────────────────────────────────────────────────────────────────────────────────────── */

export interface CanonicalLinkedIn { kind: LinkedInKind; url: string; slug: string }

/** Any LinkedIn link → its canonical form, or null when it is not a person or company page.
 *  uk.linkedin.com/in/sarah-jones-123/?trk=x → https://www.linkedin.com/in/sarah-jones-123
 *  Posts, jobs, search, feed, pulse, school and showcase pages are NOT profiles. */
export function canonicalLinkedInUrl(raw: string | null | undefined): CanonicalLinkedIn | null {
  if (!raw || typeof raw !== 'string') return null;
  let s = raw.trim();
  if (!/^https?:\/\//i.test(s)) s = `https://${s.replace(/^\/+/, '')}`;
  let u: URL;
  try { u = new URL(s); } catch { return null; }
  const host = u.hostname.toLowerCase();
  if (!/(^|\.)linkedin\.com$/.test(host)) return null;
  let path = u.pathname;
  try { path = decodeURIComponent(path); } catch { /* keep raw */ }
  const parts = path.split('/').filter(Boolean);
  if (parts.length < 2) return null;
  const head = parts[0].toLowerCase();
  const slug = parts[1].trim().toLowerCase();
  if (!slug || slug.length > 100 || /[\s<>"']/.test(slug)) return null;
  if (head === 'in' || head === 'pub') return { kind: 'person', url: `https://www.linkedin.com/in/${encodeURIComponent(slug)}`, slug };
  if (head === 'company') return { kind: 'company', url: `https://www.linkedin.com/company/${encodeURIComponent(slug)}`, slug };
  return null;
}

/* ── Company and domain keys ────────────────────────────────────────────────────────────────────── */

/** Longest first so "pty ltd" goes before "ltd". Tail only, repeatedly. */
const LEGAL_TAILS = [
  'proprietary limited', 'pty limited', 'pty ltd', 'pty', 'private limited', 'pvt ltd',
  'limited liability partnership', 'limited liability company', 'limited', 'ltd', 'llp', 'plc',
  'l l c', 'llc', 'incorporated', 'inc', 'corporation', 'corp', 'company', 'co', 'cyf', 'cyfyngedig',
];

/** Business name → comparison key. "The Hughes Plumbing & Heating Co. Ltd" → "hughes plumbing and heating".
 *  A trailing "(Leeds)" Maps qualifier and anything after " - " / " | " are dropped too. */
export function companyNameKey(name: string | null | undefined): string {
  let s = foldAccents(String(name ?? '')).toLowerCase();
  s = s.replace(/\s*[([].*?[)\]]\s*$/, ' ');
  s = s.split(/\s+[-–|]\s+/)[0];
  s = s.replace(/&/g, ' and ').replace(/\+/g, ' and ').replace(/[.,'’]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
  s = s.replace(/^the\s+/, '');
  let changed = true;
  while (changed && s) {
    changed = false;
    for (const t of LEGAL_TAILS) {
      if (s === t) break;
      if (s.endsWith(` ${t}`)) { s = s.slice(0, -t.length - 1).trim(); changed = true; break; }
    }
  }
  return s;
}

/** Free text → the same alphabet as companyNameKey, without cutting or suffix-stripping. */
export function looseTextKey(text: string | null | undefined): string {
  return foldAccents(String(text ?? '')).toLowerCase().replace(/&|\+/g, ' and ').replace(/[.,'’]/g, '').replace(/[^a-z0-9\s]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Website → bare registrable-ish host: https://www.hughesplumbing.co.uk/about → hughesplumbing.co.uk */
export function domainKey(url: string | null | undefined): string | null {
  if (!url) return null;
  let s = String(url).trim();
  if (!s) return null;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const h = new URL(s).hostname.toLowerCase().replace(/^www\./, '');
    return h.includes('.') ? h : null;
  } catch { return null; }
}

/** The name-bearing label of a domain: hughesplumbing.co.uk → hughesplumbing. */
export function domainLabel(domain: string | null): string | null {
  if (!domain) return null;
  const parts = domain.split('.');
  const label = parts.length >= 3 && /^(co|com|org|net|gov|ac)$/.test(parts[parts.length - 2]) ? parts[parts.length - 3] : parts[parts.length - 2] ?? parts[0];
  return label && label.length >= 4 ? label : null;
}

/** Does the profile's company string refer to the same business? */
export function companyMatches(profileCompany: string | null | undefined, businessName: string, domain: string | null): 'exact' | 'contains' | 'domain' | null {
  const a = companyNameKey(profileCompany);
  const b = companyNameKey(businessName);
  if (!a || !b) return null;
  if (a === b) return 'exact';
  const label = domainLabel(domain);
  if (label && a.replace(/\s/g, '') === label) return 'domain';
  // Containment only when the shorter side is distinctive: two or more words, e.g. "hughes plumbing"
  // inside "hughes plumbing and heating". A single word ("acme") must match exactly.
  const [short, long] = a.length <= b.length ? [a, b] : [b, a];
  if (short.split(' ').length >= 2 && ` ${long} `.includes(` ${short} `)) return 'contains';
  return null;
}

/* ── Names ──────────────────────────────────────────────────────────────────────────────────────── */

/** Common English short forms. Deliberately small: a wrong equivalence is a wrong person. */
const SHORT_FORMS: Record<string, string[]> = {
  david: ['dave', 'davy'], michael: ['mike', 'mick', 'mickey'], christopher: ['chris'], stephen: ['steve', 'steph'],
  steven: ['steve'], robert: ['rob', 'bob', 'bobby', 'robbie'], thomas: ['tom', 'tommy'], james: ['jim', 'jimmy', 'jamie'],
  matthew: ['matt'], andrew: ['andy', 'drew'], anthony: ['tony', 'ant'], daniel: ['dan', 'danny'], samuel: ['sam'],
  nicholas: ['nick', 'nicky'], peter: ['pete'], joseph: ['joe', 'joey'], benjamin: ['ben'], william: ['will', 'bill', 'billy', 'liam'],
  richard: ['rich', 'rick', 'dick'], edward: ['ed', 'eddie', 'ted'], jonathan: ['jon', 'jonny'], john: ['jon', 'johnny', 'jack'],
  alexander: ['alex'], elizabeth: ['liz', 'beth', 'lizzie'], katherine: ['kate', 'kathy', 'katie'], catherine: ['kate', 'cathy', 'katie'],
  susan: ['sue', 'suzy'], jennifer: ['jen', 'jenny'], rebecca: ['becky', 'becca'], victoria: ['vicky', 'tori'],
  margaret: ['maggie', 'meg'], deborah: ['debbie', 'deb'], patricia: ['pat', 'trish'], gregory: ['greg'], timothy: ['tim'],
  kenneth: ['ken', 'kenny'], ronald: ['ron', 'ronnie'], raymond: ['ray'], philip: ['phil'], phillip: ['phil'], gary: ['gaz'],
  lee: [], paul: [], mark: [], simon: ['si'], nathan: ['nate'], zachary: ['zach', 'zack'], charles: ['charlie', 'chuck'],
};

function nameTokens(name: string): string[] {
  return foldAccents(tidyPersonName(name)).toLowerCase().replace(/[^a-z\s'-]/g, ' ').split(/\s+/).filter(Boolean);
}

function sameFirst(a: string, b: string): 'exact' | 'short' | null {
  if (a === b) return 'exact';
  for (const [full, shorts] of Object.entries(SHORT_FORMS)) {
    const set = [full, ...shorts];
    if (set.includes(a) && set.includes(b)) return 'short';
  }
  return null;
}

export type NameMatch = 'exact' | 'short_form' | 'initial' | 'first_only' | 'none';

/** Our person vs the profile's name. Middle names are ignored; the LAST name must agree exactly
 *  (hyphenated surnames match on any part). A first-name-only person can only reach first_only. */
export function nameMatch(personName: string, profileName: string | null | undefined, personPartial = false): NameMatch {
  const p = nameTokens(personName);
  const q = nameTokens(String(profileName ?? '').split(/\s+[-–|,]\s+/)[0] ?? '');
  if (!p.length || !q.length) return 'none';
  if (personPartial || p.length === 1) return q[0] && sameFirst(p[0], q[0]) === 'exact' ? 'first_only' : 'none';
  const pLast = p[p.length - 1];
  const qLasts = new Set(q.slice(1).flatMap((w) => w.split('-')));
  const lastOk = qLasts.has(pLast) || pLast.split('-').some((x) => qLasts.has(x));
  if (!lastOk) return 'none';
  const f = sameFirst(p[0], q[0]);
  if (f === 'exact') return 'exact';
  if (f === 'short') return 'short_form';
  if (q[0].replace(/\./g, '').length === 1 && q[0][0] === p[0][0]) return 'initial';
  return 'none';
}

/* ── Towns and countries ────────────────────────────────────────────────────────────────────────── */

const COUNTRY_WORDS: Record<DiscoveryCountry, RegExp> = {
  UK: /\b(united kingdom|england|scotland|wales|northern ireland|uk|great britain)\b/i,
  US: /\b(united states|usa|u\.s\.a?\.?)\b|,\s*(?:al|ak|az|ar|ca|co|ct|de|fl|ga|hi|id|il|in|ia|ks|ky|la|me|md|ma|mi|mn|ms|mo|mt|ne|nv|nh|nj|nm|ny|nc|nd|oh|ok|or|pa|ri|sc|sd|tn|tx|ut|vt|va|wa|wv|wi|wy)\b/i,
  AU: /\b(australia|new south wales|nsw|victoria|queensland|qld|western australia|south australia|tasmania|act)\b/i,
};

/** The country a location string names, or null when it names none of ours. */
export function countryOfLocation(location: string | null | undefined): DiscoveryCountry | null {
  const s = String(location ?? '');
  if (!s) return null;
  const hits = (Object.keys(COUNTRY_WORDS) as DiscoveryCountry[]).filter((c) => COUNTRY_WORDS[c].test(s));
  return hits.length === 1 ? hits[0] : null;
}

/** Lead `country` values (UK / USA / Australia, or ISO-2) → ours. Unknown → null (never a default). */
export function discoveryCountry(raw: string | null | undefined): DiscoveryCountry | null {
  const s = String(raw ?? '').trim().toLowerCase();
  if (['uk', 'gb', 'united kingdom', 'england', 'scotland', 'wales'].includes(s)) return 'UK';
  if (['usa', 'us', 'united states', 'united states of america'].includes(s)) return 'US';
  if (['australia', 'au', 'aus'].includes(s)) return 'AU';
  return null;
}

/** Does a location string name somewhere more specific than a country? "United Kingdom" → false,
 *  "Bristol, England, United Kingdom" → true. */
export function namesAPlace(location: string | null | undefined): boolean {
  let s = ` ${foldAccents(String(location ?? '')).toLowerCase()} `;
  for (const re of Object.values(COUNTRY_WORDS)) s = s.replace(new RegExp(re.source, 'gi'), ' ');
  return /[a-z]{3,}/.test(s.replace(/\b(area|region|greater)\b/g, ' '));
}

export function townMentioned(text: string | null | undefined, town: string | null | undefined): boolean {
  const t = foldAccents(String(town ?? '')).toLowerCase().trim();
  if (t.length < 3) return false;
  const esc = t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+');
  return new RegExp(`(^|[^a-z])${esc}([^a-z]|$)`, 'i').test(foldAccents(String(text ?? '')).toLowerCase());
}

/* ── Candidates and scoring ─────────────────────────────────────────────────────────────────────── */

/** One profile as any source hands it over, normalised. */
export interface ProfileCandidate {
  url: string;                    // canonical person URL
  name: string | null;
  headline: string | null;
  currentCompany: string | null;
  pastCompanies: string[];
  location: string | null;
  /** The profile's OWN structured website / contact link (profile scraper only). */
  websites: string[];
  /** The profile's current company's LinkedIn page (profile scraper only). */
  currentCompanyLinkedInUrl: string | null;
  /** Title + snippet + headline, for mention checks. */
  text: string;
  origin: 'website_link' | 'serp' | 'profile_scrape' | 'held';
}

export interface MatchContext {
  personName: string;
  personPartial: boolean;
  personRole: DecisionRole | null;
  businessName: string;
  domain: string | null;
  town: string | null;
  country: DiscoveryCountry | null;
  companyLinkedInUrl: string | null;
  /** Canonical person URLs the business's OWN website links to. */
  siteLinkedProfiles: string[];
}

export interface ScoredProfile {
  url: string;
  name: string | null;
  headline: string | null;
  company: string | null;
  location: string | null;
  confidence: MatchConfidence;
  /** Plain-English, shown to the salesperson: "Name matches", "Works at Hughes Plumbing", … */
  reasons: string[];
  /** Why it is not higher (or why it was dropped). */
  cautions: string[];
  origin: ProfileCandidate['origin'];
}

export interface Dropped { url: string; name: string | null; reason: string }

/** Grade one profile. null = not the person at all (no name match) — see `dropReason`. */
export function scoreProfile(p: ProfileCandidate, ctx: MatchContext): ScoredProfile | null {
  const nm = nameMatch(ctx.personName, p.name, ctx.personPartial);
  if (nm === 'none') return null;
  const reasons: string[] = [];
  const cautions: string[] = [];
  const blob = `${p.text} ${p.headline ?? ''}`;

  if (nm === 'exact') reasons.push('Full name matches');
  else if (nm === 'short_form') reasons.push(`Name matches (${p.name} / ${ctx.personName})`);
  else if (nm === 'initial') { reasons.push('Surname matches, first name is an initial'); cautions.push('Only an initial for the first name'); }
  else { reasons.push('First name matches'); cautions.push('We only know a first name'); }

  // HARD LINKS
  const siteLinked = ctx.siteLinkedProfiles.includes(p.url);
  if (siteLinked) reasons.push('Linked from the business’s own website');
  const bizDomain = ctx.domain;
  const profileSiteHit = !!bizDomain && p.websites.some((w) => domainKey(w) === bizDomain);
  if (profileSiteHit) reasons.push('Profile lists the business’s website');
  const coPage = canonicalLinkedInUrl(ctx.companyLinkedInUrl)?.url ?? null;
  const coPageHit = !!coPage && canonicalLinkedInUrl(p.currentCompanyLinkedInUrl)?.url === coPage;
  if (coPageHit) reasons.push('Current job is at the business’s LinkedIn company page');
  const hardLink = siteLinked || profileSiteHit || coPageHit;

  // SOFT SIGNALS
  const coNow = companyMatches(p.currentCompany, ctx.businessName, bizDomain)
    ?? companyMatches(headlineCompany(p.headline), ctx.businessName, bizDomain);
  const bizKey = companyNameKey(ctx.businessName);
  const mentionsBiz = bizKey.split(' ').length >= 2 && ` ${looseTextKey(blob)} `.includes(` ${bizKey} `);
  const coPast = !coNow && p.pastCompanies.some((c) => companyMatches(c, ctx.businessName, bizDomain));
  if (coNow) reasons.push(`Works at ${p.currentCompany || headlineCompany(p.headline) || ctx.businessName}`);
  else if (mentionsBiz) reasons.push('Profile mentions the business name');
  if (coPast) cautions.push('The business appears only as a past job');
  const domainInText = !!bizDomain && foldAccents(blob).toLowerCase().includes(bizDomain);
  if (domainInText && !profileSiteHit) reasons.push('Profile text mentions the website');
  const role = roleFromText(p.headline ?? '') ?? roleFromText(blob);
  if (role) reasons.push(`Title: ${role.label}`);
  const townHit = townMentioned(`${p.location ?? ''} ${blob}`, ctx.town);
  if (townHit) reasons.push(`Location: ${ctx.town}`);

  // CONFLICTS
  let conflict = false;
  if (p.currentCompany && !coNow && !hardLink) {
    conflict = true;
    cautions.push(`Current job is at ${p.currentCompany}`);
  }
  const theirCountry = countryOfLocation(p.location);
  if (ctx.country && theirCountry && theirCountry !== ctx.country) {
    conflict = true;
    cautions.push(`Profile is in ${theirCountry === 'UK' ? 'the UK' : theirCountry === 'US' ? 'the US' : 'Australia'}`);
  }
  // A location that names a PLACE (not just a country) other than the business's town is the
  // discriminator between two same-named businesses — without a hard link it goes to a human.
  if (ctx.town && p.location && !townHit && !hardLink && namesAPlace(p.location)) {
    conflict = true;
    cautions.push(`Profile location is ${p.location}, not ${ctx.town}`);
  }

  let confidence: MatchConfidence = 'unverified';
  const fullName = nm === 'exact' || nm === 'short_form';
  if (hardLink && fullName && !(conflict && !siteLinked)) confidence = 'confirmed';
  else if (!conflict && fullName && (coNow || mentionsBiz) && (townHit || !!role || domainInText)) confidence = 'likely';
  // A site link is the strongest evidence there is; with an initial-only name it is still LIKELY.
  if (confidence === 'unverified' && siteLinked && nm === 'initial') confidence = 'likely';

  if (confidence === 'unverified' && !cautions.length) cautions.push('Not enough evidence that this is the same person');
  return {
    url: p.url, name: p.name, headline: p.headline, company: p.currentCompany ?? headlineCompany(p.headline),
    location: p.location, confidence, reasons, cautions, origin: p.origin,
  };
}

/** "Owner at Hughes Plumbing Ltd" / "Director - Hughes Plumbing" → "Hughes Plumbing Ltd". */
export function headlineCompany(headline: string | null | undefined): string | null {
  const h = String(headline ?? '');
  const m = /\b(?:at|@)\s+([^|·•,]+?)\s*(?:$|[|·•,])/i.exec(h) ?? /\s[-–]\s([^|·•]+?)\s*$/.exec(h);
  return m ? m[1].trim() : null;
}

/* ── Resolution ─────────────────────────────────────────────────────────────────────────────────── */

export type ResolveOutcome =
  | { outcome: 'match'; best: ScoredProfile; alternatives: ScoredProfile[] }
  | { outcome: 'review'; candidates: ScoredProfile[]; reason: string }
  | { outcome: 'none'; reason: string };

const RANK: Record<MatchConfidence, number> = { confirmed: 3, likely: 2, unverified: 1 };

/** One clear answer, a review list, or nothing. Never picks between equals. */
export function resolveProfiles(all: ScoredProfile[]): ResolveOutcome {
  const byUrl = new Map<string, ScoredProfile>();
  for (const s of all) {
    const prev = byUrl.get(s.url);
    if (!prev || RANK[s.confidence] > RANK[prev.confidence]) byUrl.set(s.url, s);
  }
  const list = [...byUrl.values()].sort((a, b) => RANK[b.confidence] - RANK[a.confidence] || b.reasons.length - a.reasons.length);
  if (!list.length) return { outcome: 'none', reason: 'No LinkedIn profile carried this person’s name.' };
  const confirmed = list.filter((s) => s.confidence === 'confirmed');
  const likely = list.filter((s) => s.confidence === 'likely');
  if (confirmed.length === 1) return { outcome: 'match', best: confirmed[0], alternatives: list.filter((s) => s !== confirmed[0]).slice(0, 4) };
  if (confirmed.length > 1) return { outcome: 'review', candidates: confirmed.slice(0, 5), reason: 'More than one profile is linked to the business — check which is right.' };
  if (likely.length === 1) return { outcome: 'match', best: likely[0], alternatives: list.filter((s) => s !== likely[0]).slice(0, 4) };
  if (likely.length > 1) return { outcome: 'review', candidates: likely.slice(0, 5), reason: 'Several profiles look plausible — check which is right.' };
  return { outcome: 'review', candidates: list.slice(0, 5), reason: 'Profiles with this name were found, but none is clearly linked to the business.' };
}

/* ── Manual search fallback (opened by the salesperson, in their own browser) ──────────────────── */

/** LinkedIn's own people search (needs the salesperson to be signed in to LinkedIn themselves) and a
 *  Google site: search (works signed out). Nothing is automated — these are links a person clicks. */
export function manualLinkedInSearchLinks(args: { personName?: string | null; businessName: string; town?: string | null }): { linkedin: string; google: string } {
  const person = tidyPersonName(args.personName ?? '');
  const biz = companyNameKey(args.businessName) || args.businessName;
  const kw = [person, biz].filter(Boolean).join(' ');
  const linkedin = `https://www.linkedin.com/search/results/people/?keywords=${encodeURIComponent(kw)}`;
  const g = [
    'site:linkedin.com/in',
    person ? `"${person}"` : '(owner OR founder OR director)',
    `"${args.businessName.replace(/"/g, '')}"`,
    args.town ? args.town : '',
  ].filter(Boolean).join(' ');
  return { linkedin, google: `https://www.google.com/search?q=${encodeURIComponent(g)}` };
}
