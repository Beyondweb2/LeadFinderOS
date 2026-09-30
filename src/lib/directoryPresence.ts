/* RELATIVE imports with an explicit .ts — this file is reached by supabase/functions/directory-presence. */
import { nameMatches, nameIsTextJudgeable, normalizeForMatch } from './nameMatch.ts';
import { norm, EVIDENCE_MIN_AUDITS, THIN_MIN_AUDITS } from './buildPlaybook.ts';
import { CREDENTIALS } from './fullCrawl.ts';
import { isProvableJunkName } from './competitorCleaning.ts';
import { classifyKnownEntity } from './knownEntities.ts';
import {
  PRESENCE_SOURCES, sourceForUrl, sourceByKey, isProfileUrl, neverRecommendReason, hostOfUrl, pathOfUrl,
  type PresenceSource, type PresenceSourceKind,
} from './presenceSources.ts';
import type { DirectoryFact } from './directoryFacts.ts';

/* ════════════════════════════════════════════════════════════════════════════════════════════
   DIRECTORY + PUBLIC-PROFILE PRESENCE — where a business is already listed, whether those listings
   agree with each other, and which missing sources are worth the work. Discovery and audit ONLY:
   nothing here creates or edits a listing anywhere.

   Pure: no network, no database. The edge function `directory-presence` gathers the evidence and
   stores the rows; this file decides. docs/directory-presence.md is the record.

   ⛔ THREE RULES THIS FILE EXISTS TO KEEP
   1. A NAME IS NEVER ENOUGH. A listing is CONFIRMED only by something that identifies the business —
      the business's own site linking to it, the Google place id, its phone number, its domain, its
      postcode beside its name. Name + town is LIKELY at best, and only for a name that survives once
      the trade and town are taken away (nameIsTextJudgeable). "AK Electrical" in Whitehaven can never
      be confirmed from its name.
   2. AN INCONSISTENCY NEEDS A CONFIRMED LISTING. A different phone on a page that might be another
      business is not "your old number" — it is probably another business. So only a CONFIRMED listing
      can carry an inconsistency, and only for a field the confirmation did not itself rest on.
   3. ABSENCE IS NOT EVIDENCE. A search that did not surface a listing does not prove there is none;
      a listing seen once and not re-surfaced keeps its status (last_seen_at says when). Nothing is
      "worth adding" without POSITIVE evidence that the source matters for this business.
   ════════════════════════════════════════════════════════════════════════════════════════════ */

export type MatchConfidence = 'confirmed' | 'likely' | 'unverified';
export const MATCH_CONFIDENCES: readonly MatchConfidence[] = ['confirmed', 'likely', 'unverified'];

/** The lifecycle. `existing`, `needs_attention` and `worth_adding` are written by a check;
 *  `added` and `not_relevant` only by the operator; `verified` by a check that finds a listing the
 *  operator marked added (or by the operator directly). */
export type PresenceStatus = 'existing' | 'needs_attention' | 'worth_adding' | 'not_relevant' | 'added' | 'verified';
export const PRESENCE_STATUSES: readonly PresenceStatus[] = ['existing', 'needs_attention', 'worth_adding', 'not_relevant', 'added', 'verified'];
export const OPERATOR_STATUSES: readonly PresenceStatus[] = ['added', 'verified', 'not_relevant'];

export type Priority = 'high' | 'medium' | 'low';
export const PRIORITIES: readonly Priority[] = ['high', 'medium', 'low'];

export type MatchSignal =
  | 'linked_from_site' | 'operator_recorded' | 'place_id' | 'phone' | 'domain' | 'postcode' | 'name' | 'town' | 'profile_page';
export type DiscoveredVia = 'website' | 'places' | 'search' | 'citation' | 'lead_record' | 'trade_evidence' | 'credential';

/* ── identity ─────────────────────────────────────────────────────────────────────────────────── */

export type Provenance = 'lead' | 'places' | 'site';
export interface Held { value: string; from: Provenance[] }

/** Who the business is, from the sources we hold, each value with where it came from. The
 *  provenance matters for consistency: Google's phone cannot be "inconsistent" with itself. */
export interface BusinessIdentity {
  name: string;
  trade: string;
  town: string;
  /** The domain the site is SERVED on (after redirects), else the lead's website domain. */
  domain: string | null;
  /** Other domains that are the same business (the lead's stored domain when the site redirects). */
  domainAliases: string[];
  phones: Held[];
  postcodes: Held[];
  placeId: string | null;
}

/** UK phone in national form ("01480123456"), or null for anything that is not 10–11 digits. */
export function normPhone(raw: string | null | undefined): string | null {
  let d = String(raw ?? '').replace(/[^\d+]/g, '');
  if (d.startsWith('+44')) d = `0${d.slice(3)}`;
  else if (d.startsWith('0044')) d = `0${d.slice(4)}`;
  else if (d.startsWith('44') && d.length === 12) d = `0${d.slice(2)}`;
  d = d.replace(/\D/g, '').replace(/^0?0(?=\d{10}$)/, '0');
  if (d.startsWith('00')) return null;
  if (!/^0\d{9,10}$/.test(d)) return null;
  if (SHARED_PUBLIC_NUMBERS.has(d)) return null;
  return d;
}

/* Numbers printed on many businesses' pages that identify none of them. Measured: SC Plumbing's own
   site carries 0800 111 999 (the national gas emergency line), which would otherwise "confirm" any
   gas-related page by phone. */
const SHARED_PUBLIC_NUMBERS = new Set(['0800111999', '08004085500']);

/** Postcode, upper-case, no spaces. */
export function normPostcode(raw: string | null | undefined): string | null {
  const m = String(raw ?? '').toUpperCase().match(/\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/);
  return m ? `${m[1]}${m[2]}` : null;
}

/** Registrable-ish domain of a URL: host with one leading www. removed. */
export function domainOfUrl(raw: string | null | undefined): string | null {
  return hostOfUrl(String(raw ?? ''));
}

const PHONE_IN_TEXT = /(?:\+44\s?\(?0?\)?\s?|\b0)(?:\d[\s-]?){9,10}\b/g;
const POSTCODE_IN_TEXT = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/gi;
const DOMAIN_IN_TEXT = /\b(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+(?:co\.uk|org\.uk|uk|com|net|org|biz|info|io)\b/gi;

export function phonesIn(text: string): string[] {
  return [...new Set((String(text ?? '').match(PHONE_IN_TEXT) ?? []).map(normPhone).filter((p): p is string => !!p))];
}
export function postcodesIn(text: string): string[] {
  return [...new Set((String(text ?? '').match(POSTCODE_IN_TEXT) ?? []).map(normPostcode).filter((p): p is string => !!p))];
}

function addHeld(list: Held[], value: string | null, from: Provenance) {
  if (!value) return;
  const h = list.find((x) => x.value === value);
  if (h) { if (!h.from.includes(from)) h.from.push(from); } else list.push({ value, from: [from] });
}

export interface IdentityInputs {
  lead: {
    business_name: string | null; phone?: string | null; website?: string | null; address?: string | null;
    derived_town?: string | null; search_location?: string | null; search_keyword?: string | null;
    category?: string | null; place_id?: string | null;
  };
  /** The lead's newest audit business_type — the key the trade evidence is folded on. */
  auditTrade?: string | null;
  places?: { phone?: string | null; website?: string | null; address?: string | null } | null;
  site?: { servedUrl?: string | null; phones?: string[]; postcodes?: string[] } | null;
}

export function buildIdentity(i: IdentityInputs): BusinessIdentity {
  const phones: Held[] = [];
  const postcodes: Held[] = [];
  addHeld(phones, normPhone(i.lead.phone), 'lead');
  addHeld(phones, normPhone(i.places?.phone), 'places');
  for (const p of i.site?.phones ?? []) addHeld(phones, normPhone(p), 'site');
  addHeld(postcodes, normPostcode(i.lead.address), 'lead');
  addHeld(postcodes, normPostcode(i.places?.address), 'places');
  for (const p of i.site?.postcodes ?? []) addHeld(postcodes, normPostcode(p), 'site');
  const leadDomain = sourceForUrl(i.lead.website ?? '')?.source.kind === 'other' ? domainOfUrl(i.lead.website) : null;
  const served = domainOfUrl(i.site?.servedUrl);
  const domain = served ?? leadDomain;
  const aliases = [leadDomain, served].filter((d): d is string => !!d && d !== domain);
  return {
    name: String(i.lead.business_name ?? '').trim(),
    trade: String(i.auditTrade ?? i.lead.search_keyword ?? i.lead.category ?? '').trim(),
    town: String(i.lead.derived_town ?? i.lead.search_location ?? '').trim(),
    domain,
    domainAliases: [...new Set(aliases)],
    phones, postcodes,
    placeId: i.lead.place_id ? String(i.lead.place_id) : null,
  };
}

/** Can the business's NAME identify it at all, once the trade and the town are taken away? */
export function nameIsDistinctive(id: BusinessIdentity): boolean {
  if (!id.name) return false;
  if (!id.trade && !id.town) return false;
  return nameIsTextJudgeable(id.name, { trade: id.trade, town: id.town });
}

/* ── candidates and matching ──────────────────────────────────────────────────────────────────── */

export interface FoundDetails {
  name?: string | null;
  phones?: string[];
  website?: string | null;
  address?: string | null;
  postcodes?: string[];
  category?: string | null;
  snippet?: string | null;
  /** Every distinct profile URL seen for this source (more than one = a duplicate listing). */
  urls?: string[];
}

/** One place a listing might be. `text` is whatever words came with it (a search snippet, a title). */
export interface ListingCandidate {
  url: string;
  title?: string | null;
  text?: string | null;
  via: DiscoveredVia;
  /** The business's own site links to this URL (a link or schema sameAs). */
  linkedFromSite?: boolean;
  /** Structured details we already hold for it (Google's record for the GBP). */
  details?: { name?: string | null; phone?: string | null; website?: string | null; address?: string | null; category?: string | null } | null;
  /** An operator typed this URL onto the lead by hand (facebook_method = 'manual'): a person vetted it. */
  operatorRecorded?: boolean;
  /** This candidate IS the lead's own Google place (the place id on the lead row). */
  placeIdMatch?: boolean;
}

export interface MatchResult {
  confidence: MatchConfidence | null;
  signals: MatchSignal[];
  /** Hard identifiers present on the listing that DISAGREE with ours (phone / postcode / website). */
  conflicts: Array<'phone' | 'postcode' | 'website'>;
  found: FoundDetails;
}

function heldValues(list: Held[]): string[] { return list.map((h) => h.value); }

function townIn(text: string, town: string): boolean {
  const t = normalizeForMatch(town).split(/\s+/).filter(Boolean);
  if (!t.length) return false;
  const hay = normalizeForMatch(text).split(/\s+/).filter(Boolean);
  for (let i = 0; i + t.length <= hay.length; i++) if (t.every((w, j) => hay[i + j] === w)) return true;
  return false;
}

/** URL path words, so a slug like /rg-locksmiths-cambs-huntingdon/ can be read as text. */
function urlWords(url: string): string {
  return decodeURIComponent(pathOfUrl(url)).replace(/[^a-z0-9]+/gi, ' ');
}

/** The WHOLE name, collapsed ("brodleylocksmiths"), inside the URL path ("/brodleylocksmithsandprop…").
 *  Only the whole name: two of its words in a path is how a Timpson store page at /shoe-repairs read
 *  as "Ronnie's Shoe Repairs" on live data, so ownCitations.looksLikeOwnListing's two-token rule —
 *  too loose for a name made of trade words — is deliberately not used here. */
function slugCarriesName(url: string, name: string): boolean {
  const slug = normalizeForMatch(name).split(/\s+/).filter((t) => t && !['ltd', 'limited', 'the', 'and', 'co', 'uk', 'llp', 'plc'].includes(t)).join('');
  if (slug.length < 8) return false;
  return pathOfUrl(url).toLowerCase().replace(/[^a-z0-9]/g, '').includes(slug);
}

/**
 * Is this candidate the business, and how sure are we? See the header: a name is never enough.
 *
 * CONFIRMED  — the business's own site links to this profile (or an operator recorded it by hand) ·
 *              or it is the lead's own Google place ·
 *              or the profile shows the business's name AND its phone / domain / postcode ·
 *              or its phone AND its domain.
 * LIKELY     — a profile showing the phone or the domain (but not the name) · or a profile showing a
 *              DISTINCTIVE name and the town, with no conflicting phone/postcode/website.
 * UNVERIFIED — a profile showing a distinctive name only, or a distinctive name with a conflict.
 * null       — not this business as far as we can tell. A generic name alone is always null.
 */
export function matchListing(id: BusinessIdentity, c: ListingCandidate, source: PresenceSource): MatchResult {
  const text = [c.title ?? '', c.text ?? '', c.details?.name ?? '', c.details?.address ?? ''].join(' \n ');
  const phones = [...new Set([...phonesIn(text), ...(c.details?.phone ? [normPhone(c.details.phone)].filter((p): p is string => !!p) : [])])];
  const postcodes = [...new Set([...postcodesIn(text), ...(c.details?.address ? postcodesIn(c.details.address) : [])])];
  const website = c.details?.website ?? null;
  const found: FoundDetails = {
    name: c.details?.name ?? c.title ?? null,
    phones, postcodes,
    website,
    address: c.details?.address ?? null,
    category: c.details?.category ?? null,
    snippet: c.text ? String(c.text).slice(0, 300) : null,
    urls: [c.url],
  };

  const signals: MatchSignal[] = [];
  const conflicts: MatchResult['conflicts'] = [];
  const profile = source.key === 'google-business-profile' && c.placeIdMatch ? true : isProfileUrl(c.url, source);
  if (profile) signals.push('profile_page');
  if (c.linkedFromSite) signals.push('linked_from_site');
  if (c.operatorRecorded) signals.push('operator_recorded');
  if (c.placeIdMatch) signals.push('place_id');

  const ourPhones = heldValues(id.phones);
  if (phones.length && ourPhones.length) {
    if (phones.some((p) => ourPhones.includes(p))) signals.push('phone'); else conflicts.push('phone');
  }
  const ourDomains = [id.domain, ...id.domainAliases].filter((d): d is string => !!d);
  if (ourDomains.length) {
    const inText = (text.match(DOMAIN_IN_TEXT) ?? []).map((d) => d.toLowerCase().replace(/^www\./, ''));
    const inPath = urlWords(c.url).toLowerCase();
    const siteDom = domainOfUrl(website);
    const hit = ourDomains.some((d) => inText.includes(d) || siteDom === d || inPath.includes(d.replace(/[^a-z0-9]+/g, ' ').trim()));
    if (hit) signals.push('domain');
    else if (siteDom && sourceForUrl(website ?? '')?.source.kind === 'other') conflicts.push('website');
  }
  const ourPostcodes = heldValues(id.postcodes);
  if (postcodes.length && ourPostcodes.length) {
    if (postcodes.some((p) => ourPostcodes.includes(p))) signals.push('postcode'); else conflicts.push('postcode');
  }

  const distinctive = nameIsDistinctive(id);
  const nameHay = `${text} \n ${urlWords(c.url)}`;
  /* A generic name can still be READ (for the inconsistency check below) but never COUNTED alone. */
  const nameSeen = !!id.name && (nameMatches(nameHay, id.name, { trade: id.trade, town: id.town }) || slugCarriesName(c.url, id.name));
  if (nameSeen) signals.push('name');
  if (id.town && townIn(nameHay, id.town)) signals.push('town');

  const has = (s: MatchSignal) => signals.includes(s);
  const hardId = has('phone') || has('domain') || (has('postcode') && nameSeen);
  let confidence: MatchConfidence | null = null;
  if (has('place_id')) confidence = 'confirmed';
  else if (!profile) confidence = null;
  else if (has('linked_from_site') || has('operator_recorded')) confidence = 'confirmed';
  else if (nameSeen && hardId) confidence = 'confirmed';
  else if (has('phone') && has('domain')) confidence = 'confirmed';
  else if (has('phone') || has('domain')) confidence = 'likely';
  else if (nameSeen && distinctive && has('town') && conflicts.length === 0) confidence = 'likely';
  else if (nameSeen && distinctive) confidence = 'unverified';
  return { confidence, signals, conflicts, found };
}

/* ── consistency ──────────────────────────────────────────────────────────────────────────────── */

export type InconsistencyField = 'phone' | 'website' | 'address' | 'name' | 'duplicate' | 'unconfirmed';
export interface Inconsistency {
  field: InconsistencyField;
  /** What we hold (and where from), when there is one. */
  expected?: string | null;
  found?: string | null;
  note: string;
}

const PROV_LABEL: Record<Provenance, string> = { lead: 'our record', places: 'Google', site: 'the website' };
const fmtHeld = (h: Held) => `${h.value} (${h.from.map((f) => PROV_LABEL[f]).join(', ')})`;

/** Compare a CONFIRMED listing's details with what we hold. Only fields where both sides are known
 *  are compared, and a source is never compared with itself (Google's phone vs Google's phone). */
export function compareDetails(
  id: BusinessIdentity, m: MatchResult, self: Provenance | null,
): { inconsistencies: Inconsistency[]; compared: string[] } {
  const out: Inconsistency[] = [];
  const compared: string[] = [];
  if (m.confidence !== 'confirmed') return { inconsistencies: out, compared };
  /* What the listing is compared AGAINST. The lead row was scraped from Google, so for the Google
     listing only the website's own values count; for the website, only the lead/Google values. */
  const against: Provenance[] = self === 'places' ? ['site'] : self === 'site' ? ['lead', 'places'] : ['lead', 'places', 'site'];
  const others = (list: Held[]) => list.filter((h) => h.from.some((f) => against.includes(f)));

  const ourPhones = others(id.phones);
  const theirPhones = m.found.phones ?? [];
  if (theirPhones.length && ourPhones.length) {
    compared.push('phone');
    const stray = theirPhones.filter((p) => !ourPhones.some((h) => h.value === p));
    if (stray.length && !theirPhones.some((p) => ourPhones.some((h) => h.value === p))) {
      out.push({ field: 'phone', expected: ourPhones.map(fmtHeld).join('; '), found: stray.join(', '), note: 'A different phone number is shown here — possibly an old number.' });
    }
  }
  const theirSite = domainOfUrl(m.found.website);
  if (theirSite && id.domain && sourceForUrl(m.found.website ?? '')?.source.kind === 'other') {
    compared.push('website');
    if (theirSite !== id.domain) {
      const old = id.domainAliases.includes(theirSite);
      out.push({ field: 'website', expected: id.domain, found: theirSite, note: old ? `Points at ${theirSite}, which now redirects to ${id.domain} — the old domain.` : 'Links to a different website.' });
    }
  }
  const ourPc = others(id.postcodes);
  const theirPc = m.found.postcodes ?? [];
  if (theirPc.length && ourPc.length) {
    compared.push('address');
    if (!theirPc.some((p) => ourPc.some((h) => h.value === p))) {
      out.push({ field: 'address', expected: ourPc.map(fmtHeld).join('; '), found: theirPc.join(', '), note: 'A different postcode is shown — possibly an old address.' });
    }
  }
  /* A confirmed listing that does not carry the name: listed under a different (or old) name. Only
     from a STRUCTURED name (Google's record), never from a page title, which is too noisy to judge. */
  const structuredName = m.found.name && !m.signals.includes('name') && self === 'places' ? m.found.name : null;
  if (structuredName && id.name) {
    compared.push('name');
    if (!nameMatches(structuredName, id.name) && !nameMatches(id.name, structuredName)) {
      out.push({ field: 'name', expected: id.name, found: structuredName, note: 'Listed under a different business name.' });
    }
  }
  return { inconsistencies: out, compared };
}

/* ── the client's own AI evidence ─────────────────────────────────────────────────────────────── */

export interface CitationRow {
  question: string | null;
  result: Record<string, unknown> | null;
}

export interface HostCitationFold {
  host: string;
  sourceKey: string;
  questions: Set<string>;
  engines: Set<string>;
  /** Citation URLs that look like THIS business's page on the host. */
  ownUrls: Array<{ url: string; title: string | null }>;
  /** Distinct profile-shaped URLs on the host that are NOT this business — competitor evidence. */
  otherProfiles: Set<string>;
  /** Businesses named in the answers that cited this host, with how many answers. */
  competitors: Map<string, number>;
  sampleUrl: string;
}

export interface ClientCitationFold {
  hosts: Map<string, HostCitationFold>;
  questionsCounted: number;
}

/** Google redirect citations ("/url?…&q=<real>") unwrapped to the real target. Same rule as
 *  auditReport.ts's unwrapCitationUrl, which lives in a module too heavy to pull in here. */
function unwrap(raw: string): string {
  const u = String(raw ?? '').trim();
  const m = /\/url\?/.test(u) ? u.match(/[?&](?:url|q)=([^&]+)/) : null;
  if (!m) return u;
  try { return decodeURIComponent(m[1]); } catch { return m[1]; }
}

/* Path segments that PREFIX a profile id (/biz/<id>, /trades/<id>, /company/<id>). Anything after the
   id (/reviews, ?page=2, utm tags) is still the same profile. */
const PROFILE_PREFIXES = new Set(['biz', 'trades', 'traders', 'profile', 'review', 'businesses', 'company', 'in', 'pages', 'people', 'channel', 'c', 'user', 'pro', 'professionals', 'stores', 'place']);

/** One key per PROFILE, so two URLs of one page are never "a duplicate listing". Null when the URL
 *  cannot identify a profile (a Google Maps short link): such a URL is never counted as a second one.
 *  Measured on live data: maps.app.goo.gl/… + maps.google.com/?cid=… (MCLocksmiths) and
 *  facebook.com/AKElectrical1 + …/AKElectrical1/reviews/ were both being reported as duplicates. */
export function profileKey(url: string): string | null {
  const host = (hostOfUrl(url) ?? '').replace(/^(m|mobile|uk|en-gb|business)\./, '');
  if (!host) return null;
  const cid = /[?&](?:cid|ludocid)=(\d+)/.exec(url)?.[1];
  if (cid) return `gbp:${cid}`;
  if (/^(maps\.app\.goo\.gl|g\.page|goo\.gl)$/.test(host) || /^(maps\.)?google\./.test(host)) return null;
  const qid = /[?&]id=(\d+)/.exec(url)?.[1];
  if (qid) return `${host}?id=${qid}`;
  const segs = pathOfUrl(url).split('?')[0].split('#')[0].toLowerCase().split('/').filter(Boolean);
  const at = segs.findIndex((x) => PROFILE_PREFIXES.has(x));
  const keep = at >= 0 && at + 1 < segs.length ? segs.slice(0, at + 2) : segs.slice(0, 1);
  return `${host}/${keep.join('/')}`;
}

/** A competitor string that names a business, not noise. The stored competitor lists carry the town
 *  ("Huntingdon"), stray words ("Give", "Services") and sources ("Master Locksmiths Association"); a
 *  reason naming those as rivals would be wrong. Provable junk and known directories use the report's
 *  own rules; the town, source labels and single short words are dropped here. */
function isRealRivalName(n: string, id: BusinessIdentity): boolean {
  if (isProvableJunkName(n)) return false;
  if (classifyKnownEntity(n)?.kind === 'directory') return false;
  const k = normalizeForMatch(n);
  if (!k || (id.town && k === normalizeForMatch(id.town))) return false;
  const toks = k.split(/\s+/).filter(Boolean);
  /* One word is a place (Ramsey, Cambridgeshire) or a stray word (Services) far more often than a
     firm; a one-word brand is lost here, deliberately — a wrong rival is worse than a missing one. */
  if (toks.length < 2) return false;
  if (PRESENCE_SOURCES.some((s) => normalizeForMatch(s.label) === k)) return false;
  return true;
}

/** Fold the citations of every answer to this business's own audit questions, per source. */
export function foldClientCitations(rows: CitationRow[], id: BusinessIdentity): ClientCitationFold {
  const hosts = new Map<string, HostCitationFold>();
  const questions = new Set<string>();
  const ctx = { trade: id.trade, town: id.town };
  for (const r of rows) {
    const q = String(r.question ?? '').trim();
    if (!q || !r.result) continue;
    questions.add(q.toLowerCase());
    for (const [engine, raw] of Object.entries(r.result)) {
      if (engine.startsWith('_') || !raw || typeof raw !== 'object') continue;
      const er = raw as { citations?: Array<{ url?: string; title?: string }>; competitors?: unknown };
      const names = (Array.isArray(er.competitors) ? er.competitors : [])
        .map((n) => String(typeof n === 'string' ? n : (n as { name?: unknown })?.name ?? '').trim())
        .filter((n) => n && !(id.name && (nameMatches(n, id.name, ctx) || nameMatches(id.name, n))) && isRealRivalName(n, id));
      const seenHere = new Set<string>();
      for (const c of er.citations ?? []) {
        const url = unwrap(String(c?.url ?? ''));
        const s = sourceForUrl(url);
        if (!s) continue;
        const host = hostOfUrl(url) ?? '';
        if (id.domain && (host === id.domain || host.endsWith(`.${id.domain}`))) continue; // the client's own site
        const key = s.source.key;
        let f = hosts.get(key);
        if (!f) {
          f = { host, sourceKey: key, questions: new Set(), engines: new Set(), ownUrls: [], otherProfiles: new Set(), competitors: new Map(), sampleUrl: url };
          hosts.set(key, f);
        }
        f.questions.add(q.toLowerCase());
        f.engines.add(engine);
        const title = c?.title ? String(c.title) : null;
        const own = matchListing(id, { url, title, via: 'citation' }, s.source).confidence;
        if (own) { if (!f.ownUrls.some((o) => o.url === url)) f.ownUrls.push({ url, title }); }
        else if (isProfileUrl(url, s.source)) { const k = profileKey(url); if (k) f.otherProfiles.add(k); }
        if (!seenHere.has(key)) {
          seenHere.add(key);
          for (const n of names) f.competitors.set(n, (f.competitors.get(n) ?? 0) + 1);
        }
      }
    }
  }
  return { hosts, questionsCounted: questions.size };
}

/* ── the site's own links ─────────────────────────────────────────────────────────────────────── */

export interface SiteSignals {
  /** Absolute outbound URLs from <a href>, <link href> and schema sameAs. */
  links: string[];
  sameAs: string[];
  phones: string[];
  postcodes: string[];
  /** Visible-ish text, for credential claims. */
  text: string;
}

function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&nbsp;/g, ' ');
}

/** Everything a page says about where else the business lives. Pure string work on fetched HTML. */
export function extractSiteSignals(html: string, pageUrl: string): SiteSignals {
  const h = String(html ?? '');
  const links = new Set<string>();
  const add = (raw: string) => {
    const v = decodeEntities(raw.trim());
    if (!v || /^(#|mailto:|tel:|javascript:|data:)/i.test(v)) return;
    try {
      const u = new URL(v, pageUrl);
      if (!/^https?:$/.test(u.protocol)) return;
      u.hash = '';
      links.add(u.toString());
    } catch { /* unparseable: never a match */ }
  };
  for (const m of h.matchAll(/<(?:a|link|area)\b[^>]*?\shref\s*=\s*(["'])(.*?)\1/gis)) add(m[2]);
  const sameAs: string[] = [];
  const phones: string[] = [];
  const postcodes: string[] = [];
  const walk = (n: unknown) => {
    if (!n || typeof n !== 'object') return;
    if (Array.isArray(n)) { n.forEach(walk); return; }
    const o = n as Record<string, unknown>;
    const sa = o.sameAs;
    for (const s of Array.isArray(sa) ? sa : sa ? [sa] : []) if (typeof s === 'string') { sameAs.push(s); add(s); }
    if (typeof o.telephone === 'string') phones.push(o.telephone);
    const addr = o.address as Record<string, unknown> | string | undefined;
    if (typeof addr === 'string') postcodes.push(...postcodesIn(addr));
    else if (addr && typeof addr.postalCode === 'string') postcodes.push(addr.postalCode);
    for (const v of Object.values(o)) if (v && typeof v === 'object') walk(v);
  };
  for (const m of h.matchAll(/<script\b[^>]*type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { walk(JSON.parse(m[1].trim())); } catch { /* a broken block says nothing */ }
  }
  for (const m of h.matchAll(/href\s*=\s*["']tel:([^"']+)["']/gi)) phones.push(decodeEntities(m[1]));
  const text = decodeEntities(h.replace(/<script\b[\s\S]*?<\/script>|<style\b[\s\S]*?<\/style>/gi, ' ').replace(/<[^>]+>/g, ' ')).replace(/\s+/g, ' ').slice(0, 60_000);
  phones.push(...(text.match(PHONE_IN_TEXT) ?? []));
  postcodes.push(...postcodesIn(text));
  return {
    links: [...links],
    sameAs: [...new Set(sameAs)],
    phones: [...new Set(phones.map(normPhone).filter((p): p is string => !!p))],
    postcodes: [...new Set(postcodes.map(normPostcode).filter((p): p is string => !!p))],
    text,
  };
}

/** Trade-body and manufacturer sources the business's OWN site claims, with the words it used. */
export function claimedCredentials(text: string): Array<{ sourceKey: string; credential: string; quote: string }> {
  const out: Array<{ sourceKey: string; credential: string; quote: string }> = [];
  for (const s of PRESENCE_SOURCES) {
    if (!s.credential) continue;
    const c = CREDENTIALS.find((x) => x.name === s.credential);
    if (!c) continue;
    const m = c.re.exec(text);
    if (!m) continue;
    out.push({ sourceKey: s.key, credential: s.credential, quote: text.slice(Math.max(0, m.index - 60), m.index + 90).replace(/\s+/g, ' ').trim() });
  }
  return out;
}

/* ── assembling the findings ──────────────────────────────────────────────────────────────────── */

export interface TradeEvidenceRow { trade: string; host: string; citations: number; audits: number }

export interface PresenceInputs {
  identity: BusinessIdentity;
  candidates: ListingCandidate[];
  citations: ClientCitationFold;
  /** playbook-evidence rows (every trade — this file selects the business's). */
  tradeEvidence: TradeEvidenceRow[];
  tradeAuditTotals: Record<string, number>;
  claimed: Array<{ sourceKey: string; credential: string; quote: string }>;
  /** Did a web search run in this check? Without one, "worth adding" is said with that caveat. */
  searched: boolean;
}

export interface PresenceEvidence {
  client_questions?: number;
  client_questions_total?: number;
  client_engines?: string[];
  competitor_profiles?: number;
  competitors_named?: string[];
  trade_audits?: number;
  trade_audits_total?: number;
  trade_key?: string;
  credential?: string;
  credential_quote?: string;
  cost?: string;
  actor?: string;
  search_ran?: boolean;
  possible_listing?: string;
}

/** What one check says about one source — the shape that becomes (or updates) a stored row. */
export interface PresenceFinding {
  source_key: string;
  source_label: string;
  source_kind: PresenceSourceKind;
  status: 'existing' | 'needs_attention' | 'worth_adding';
  match_confidence: MatchConfidence | null;
  listing_url: string | null;
  match_signals: MatchSignal[];
  found_details: FoundDetails;
  inconsistencies: Inconsistency[];
  fields_compared: string[];
  priority: Priority | null;
  reason: string;
  evidence: PresenceEvidence;
  discovered_via: DiscoveredVia[];
}

export interface PresenceReviewItem { source_key: string; label: string; why: string; client_questions: number; sample_url: string }

const CONF_RANK: Record<MatchConfidence, number> = { confirmed: 3, likely: 2, unverified: 1 };
const VIA_RANK: Record<DiscoveredVia, number> = { lead_record: 6, places: 5, website: 4, citation: 3, search: 2, trade_evidence: 1, credential: 1 };
const ENGINE_NAME: Record<string, string> = { chatgpt: 'ChatGPT', gemini: 'Gemini', ai_overview: 'AI Overview', google_organic: 'Google' };
const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** The trade keys the evidence could be folded under for this business ("locksmiths" and
 *  "locksmith" are different keys there; an audit has one business_type, so they never overlap). */
export function tradeKeys(trade: string): string[] {
  const t = norm(trade);
  if (!t) return [];
  return [...new Set([t, t.replace(/s$/, ''), `${t.replace(/s$/, '')}s`])];
}

function selfOf(via: DiscoveredVia): Provenance | null {
  return via === 'places' ? 'places' : via === 'website' ? 'site' : null;
}

/** A site-linked social/directory profile whose handle names something else (RG Locksmiths linking
 *  to facebook.com/RGCarpentryAndBuilding). A NOTE, never an issue: handles are often abbreviations,
 *  so a mismatch is worth a look, not a finding. Only a long alphabetic handle is read at all. */
function handleMismatch(url: string, source: PresenceSource, id: BusinessIdentity): boolean {
  if (source.kind !== 'social' || !id.name) return false;
  const handle = (pathOfUrl(url).split('?')[0].split('/').filter(Boolean).pop() ?? '').toLowerCase();
  if (!/^[a-z][a-z0-9._-]{9,}$/.test(handle)) return false;
  /* Take away everything that IS the business (its name's words, its town, filler); a handle that
     still carries eight or more letters of something else names something else. */
  let rest = handle.replace(/[^a-z]/g, '');
  const words = normalizeForMatch(`${id.name} ${id.town}`).split(/\s+/).filter((w) => w.length >= 2)
    .concat(['ltd', 'limited', 'official', 'page', 'the', 'and', 'uk', 'co']).sort((x, y) => y.length - x.length);
  for (const w of words) rest = rest.split(w).join('');
  return rest.length >= 8;
}

/** A source cited on this share of the client's own questions is strong evidence for it. */
export const CLIENT_STRONG_SHARE = 0.15;
/** Trade-fold shares: medium needs 20% of the trade's audits, low needs 5%. Below that, nothing. */
export const TRADE_STRONG_SHARE = 0.2;
export const TRADE_SOME_SHARE = 0.05;
const MAX_REVIEW = 8;

/** Could an UNCLASSIFIED host be a directory worth a human look? Most unclassified hosts cited for a
 *  business are its competitors' own websites — intelligence, never a listing. So: cited across a
 *  real share of the questions, carrying several distinct profile-shaped pages, and not named like a
 *  business in this trade or like a rival the answers named. */
function looksLikeADirectory(cf: HostCitationFold, id: BusinessIdentity, questionsCounted: number): boolean {
  if (!cf.host.includes('.')) return false;
  if (cf.questions.size < Math.max(2, Math.ceil(0.2 * questionsCounted))) return false;
  if (cf.otherProfiles.size < 2) return false;
  const hostWords = cf.host.replace(/\.(co\.uk|org\.uk|com|net|org|uk|io)$/, '').replace(/[^a-z0-9]+/g, ' ');
  const stem = normalizeForMatch(id.trade).replace(/s$/, '').slice(0, 5);
  if (stem.length >= 4 && hostWords.replace(/\s+/g, '').includes(stem)) return false;
  const ctx = { trade: id.trade, town: id.town };
  for (const n of cf.competitors.keys()) if (nameMatches(hostWords, n, ctx) || nameMatches(n, hostWords.trim())) return false;
  return true;
}

/** Decide every source. Returns the findings (one per source) and the sources that deserve a
 *  human look but can never be recommended as they stand (unclassified hosts that keep coming up). */
export function assemblePresence(inp: PresenceInputs): { findings: PresenceFinding[]; review: PresenceReviewItem[] } {
  const id = inp.identity;
  type Best = { m: MatchResult; c: ListingCandidate; source: PresenceSource; fact: DirectoryFact | undefined };
  const bySource = new Map<string, { best: Best | null; profiles: Map<string, string>; via: Set<DiscoveredVia>; source: PresenceSource; fact: DirectoryFact | undefined }>();
  const slot = (source: PresenceSource, fact: DirectoryFact | undefined) => {
    let s = bySource.get(source.key);
    if (!s) { s = { best: null, profiles: new Map(), via: new Set(), source, fact }; bySource.set(source.key, s); }
    return s;
  };

  /* Own citations are listing candidates too: a cited page that is this business's own profile. */
  const cands: ListingCandidate[] = [...inp.candidates];
  for (const f of inp.citations.hosts.values()) for (const o of f.ownUrls) cands.push({ url: o.url, title: o.title, via: 'citation' });

  for (const c of cands) {
    const s = sourceForUrl(c.url);
    if (!s) continue;
    if (id.domain && s.source.kind === 'other') {
      const h = hostOfUrl(c.url) ?? '';
      if (h === id.domain || h.endsWith(`.${id.domain}`) || id.domainAliases.includes(h)) continue; // own site
    }
    const m = matchListing(id, c, s.source);
    if (!m.confidence) continue;
    const sl = slot(s.source, s.fact);
    sl.via.add(c.via);
    const pk = profileKey(c.url);
    if (m.confidence !== 'unverified' && pk) sl.profiles.set(pk, c.url);
    const b = sl.best;
    if (!b || CONF_RANK[m.confidence] > CONF_RANK[b.m.confidence!] || (CONF_RANK[m.confidence] === CONF_RANK[b.m.confidence!] && VIA_RANK[c.via] > VIA_RANK[b.c.via])) {
      sl.best = { m, c, source: s.source, fact: s.fact };
    }
  }

  const findings: PresenceFinding[] = [];
  const review: PresenceReviewItem[] = [];
  const keys = tradeKeys(id.trade);
  const tradeTotal = keys.reduce((n, k) => n + (inp.tradeAuditTotals[k] ?? 0), 0);
  const tradeByHost = new Map<string, number>();
  for (const e of inp.tradeEvidence) {
    if (!keys.includes(e.trade)) continue;
    const s = sourceForUrl(e.host);
    if (!s) continue;
    tradeByHost.set(s.source.key, (tradeByHost.get(s.source.key) ?? 0) + e.audits);
  }

  /* 1. Sources where a listing was seen. */
  for (const [key, sl] of bySource) {
    if (!sl.best) continue;
    const { m, c, source } = sl.best;
    const self = selfOf(c.via);
    const cmp = compareDetails(id, m, self);
    const inconsistencies = [...cmp.inconsistencies];
    const urls = [...new Set(sl.profiles.values())];
    if (urls.length > 1 && m.confidence !== 'unverified') {
      inconsistencies.push({ field: 'duplicate', found: urls.join(' | '), note: `${urls.length} separate profiles on ${source.label} — a duplicate listing.` });
    }
    if (m.confidence === 'unverified') {
      inconsistencies.push({ field: 'unconfirmed', found: c.url, note: 'A listing that may be this business — nothing on it confirms it. Check it by hand before treating it as theirs or creating another.' });
    }
    if (m.confidence === 'unverified' && source.kind === 'other') continue; // an unknown host with a maybe: not worth a row
    const status: PresenceFinding['status'] = inconsistencies.length ? 'needs_attention' : 'existing';
    const cf = inp.citations.hosts.get(key);
    const evidence: PresenceEvidence = { search_ran: inp.searched };
    if (cf) { evidence.client_questions = cf.questions.size; evidence.client_questions_total = inp.citations.questionsCounted; evidence.client_engines = [...cf.engines]; }
    const how = m.signals.includes('linked_from_site') ? 'the business’s own website links to it'
      : m.signals.includes('operator_recorded') ? 'recorded on the lead by hand'
      : m.signals.includes('place_id') ? 'it is the Google listing this lead was found from'
      : [m.signals.includes('name') ? 'name' : '', m.signals.includes('phone') ? 'phone' : '', m.signals.includes('domain') ? 'website' : '', m.signals.includes('postcode') ? 'postcode' : '', m.signals.includes('town') ? 'town' : ''].filter(Boolean).join(' + ') + ' match';
    const reason = `${m.confidence === 'confirmed' ? 'Confirmed' : m.confidence === 'likely' ? 'Likely' : 'Unconfirmed'}: ${how}.`
      + (cf ? ` Cited in AI answers to ${cf.questions.size} of their ${inp.citations.questionsCounted} questions.` : '')
      + (handleMismatch(c.url, source, id) ? ` Its address (${pathOfUrl(c.url).split('?')[0]}) does not carry the business name — worth checking it is the current business.` : '');
    findings.push({
      source_key: key, source_label: source.label, source_kind: source.kind, status,
      match_confidence: m.confidence, listing_url: c.url, match_signals: m.signals,
      found_details: { ...m.found, urls }, inconsistencies, fields_compared: cmp.compared,
      priority: status === 'needs_attention' && m.confidence === 'confirmed' ? 'high' : status === 'needs_attention' ? 'medium' : null,
      reason, evidence, discovered_via: [...sl.via],
    });
  }

  /* 2. Sources worth adding — only with POSITIVE evidence, never by default. */
  const listed = new Set(findings.filter((f) => f.match_confidence !== 'unverified').map((f) => f.source_key));
  const unverifiedAt = new Map(findings.filter((f) => f.match_confidence === 'unverified').map((f) => [f.source_key, f]));
  const candidateKeys = new Set<string>([
    'google-business-profile',
    ...inp.citations.hosts.keys(),
    ...tradeByHost.keys(),
    ...inp.claimed.map((c) => c.sourceKey),
  ]);
  for (const key of candidateKeys) {
    if (listed.has(key)) continue;
    const cf = inp.citations.hosts.get(key);
    const s = sourceByKey(key) ? { source: sourceByKey(key)!, fact: sourceForUrl(key)?.fact } : cf ? sourceForUrl(cf.sampleUrl) : sourceForUrl(key);
    if (!s) continue;
    const { source, fact } = s;
    const claim = inp.claimed.find((c) => c.sourceKey === key);
    const q = cf?.questions.size ?? 0;
    const others = cf?.otherProfiles.size ?? 0;
    const a = tradeByHost.get(key) ?? 0;
    const never = neverRecommendReason(source, fact);
    if (never) {
      if (!fact && source.kind === 'other' && cf && looksLikeADirectory(cf, id, inp.citations.questionsCounted)) {
        review.push({ source_key: key, label: source.label, why: never, client_questions: q, sample_url: cf.sampleUrl });
      }
      continue;
    }
    if (fact?.townOnly && normalizeForMatch(fact.townOnly) !== normalizeForMatch(id.town)) continue;

    /* ── PRIORITY. The client's OWN evidence (their questions, competitors' profiles cited there)
       outranks the trade fold; the trade fold counts only as a SHARE of the trade's audits, so a host
       cited in 7 of 478 locksmith audits is noise, not a lead. ── */
    const Q = inp.citations.questionsCounted;
    const share = tradeTotal > 0 ? a / tradeTotal : 0;
    const clientStrong = others >= 2 || (q >= 2 && Q > 0 && q / Q >= CLIENT_STRONG_SHARE);
    const clientSome = q >= 1 || others >= 1;
    const tradeStrong = a >= EVIDENCE_MIN_AUDITS && share >= TRADE_STRONG_SHARE;
    const tradeSome = a >= THIN_MIN_AUDITS && share >= TRADE_SOME_SHARE;
    let priority: Priority | null = null;
    if (source.core || claim || clientStrong) priority = 'high';
    else if ((clientSome && (tradeSome || q >= 2)) || tradeStrong) priority = 'medium';
    else if (clientSome || tradeSome) priority = 'low';
    if (!priority) continue;
    const paid = fact && (fact.cost === 'paid' || fact.cost === 'pay-per-lead' || fact.cost === 'membership');
    /* A pay-per-lead marketplace sells leads; it is not an entity source, so it is never top priority.
       A paid or membership listing keeps the priority its evidence earned — the reason states the cost. */
    if (fact?.cost === 'pay-per-lead' && priority === 'high') priority = 'medium';
    /* A body the business must QUALIFY for, which its own site does not mention: we cannot know they
       qualify, so it is never top priority and the reason says so. */
    const qualifying = !claim && (source.kind === 'trade-body' || source.kind === 'manufacturer' || fact?.kind === 'trade-body');
    if (qualifying && priority === 'high') priority = 'medium';

    const parts: string[] = [];
    if (source.core) parts.push(inp.searched ? 'No Google Business Profile was found for this business.' : 'No Google Business Profile is on record for this business — check whether one exists before creating one.');
    if (claim) parts.push(`Their website mentions ${claim.credential}, but no ${source.label} profile of theirs was found — worth confirming the entry exists and linking to it from the site.`);
    if (q) parts.push(`Cited in AI answers to ${q} of their ${inp.citations.questionsCounted} questions (${[...cf!.engines].map((e) => ENGINE_NAME[e] ?? e).join(', ')}).`);
    if (others) parts.push(`${plural(others, 'other business’s profile', 'other businesses’ profiles')} on it ${others === 1 ? 'was' : 'were'} cited; theirs was not.`);
    const named = cf ? [...cf.competitors.entries()].sort((x, y) => y[1] - x[1]).slice(0, 4).map(([n]) => n) : [];
    if (named.length) parts.push(`Answers that cited it named: ${named.join(', ')}.`);
    if (a) parts.push(`Cited for ${keys[0]} in ${a} of ${tradeTotal} audits across our data.`);
    if (paid && !(qualifying && fact!.cost === 'membership')) parts.push(fact!.cost === 'pay-per-lead' ? 'Pay-per-lead — the client decides.' : fact!.cost === 'membership' ? 'Membership — the business must qualify.' : 'Paid listing — the client decides.');
    if (fact?.actor === 'client-only') parts.push('Only the business owner can apply.');
    if (qualifying) parts.push('Membership has to be earned and their website does not mention it — worth it only if they qualify.');
    const maybe = unverifiedAt.get(key);
    if (maybe) parts.push(`A possible listing was seen (${maybe.listing_url}) — check it before creating another.`);
    if (!inp.searched && !source.core) parts.push('Not yet searched for directly.');

    const evidence: PresenceEvidence = { search_ran: inp.searched };
    if (q) { evidence.client_questions = q; evidence.client_questions_total = inp.citations.questionsCounted; evidence.client_engines = [...cf!.engines]; }
    if (others) evidence.competitor_profiles = others;
    if (named.length) evidence.competitors_named = named;
    if (a) { evidence.trade_audits = a; evidence.trade_audits_total = tradeTotal; evidence.trade_key = keys[0]; }
    if (claim) { evidence.credential = claim.credential; evidence.credential_quote = claim.quote; }
    if (fact?.cost) evidence.cost = fact.cost;
    if (fact?.actor) evidence.actor = fact.actor;
    if (maybe) evidence.possible_listing = maybe.listing_url ?? undefined;

    const via: DiscoveredVia[] = [];
    if (cf) via.push('citation');
    if (a) via.push('trade_evidence');
    if (claim) via.push('credential');
    if (source.core && !via.length) via.push('lead_record');

    if (maybe) {
      /* The possible listing's row carries the recommendation too, so there is ONE row per source. */
      maybe.priority = priority;
      maybe.reason = `${maybe.reason} ${parts.join(' ')}`.trim();
      maybe.evidence = { ...maybe.evidence, ...evidence };
      maybe.discovered_via = [...new Set([...maybe.discovered_via, ...via])];
      continue;
    }
    findings.push({
      source_key: key, source_label: source.label, source_kind: source.kind, status: 'worth_adding',
      match_confidence: null, listing_url: null, match_signals: [], found_details: {}, inconsistencies: [],
      fields_compared: [], priority, reason: parts.join(' '), evidence, discovered_via: via,
    });
  }
  review.sort((x, y) => y.client_questions - x.client_questions);
  return { findings, review: review.slice(0, MAX_REVIEW) };
}

/* ── rechecks: one row per (lead, source), forever ────────────────────────────────────────────── */

/** A stored row, as the table holds it (the columns this file reads and writes). */
export interface StoredPresenceRow extends Omit<PresenceFinding, 'status'> {
  id?: string;
  lead_id: string;
  status: PresenceStatus;
  status_source: 'check' | 'operator';
  previous_status: PresenceStatus | null;
  first_seen_at: string;
  last_checked_at: string;
  last_seen_at: string | null;
  status_changed_at: string;
  verified_at: string | null;
  check_count: number;
  last_run_id: string | null;
  operator_note?: string | null;
}

/**
 * Fold one check's findings into the stored rows. Returns the rows to upsert (keyed lead_id +
 * source_key — never a second row for a source).
 *
 * ⛔ ABSENCE NEVER DOWNGRADES. A listing that was found before and is not re-surfaced keeps its
 *    status; last_seen_at keeps the date it was last actually seen.
 * ⛔ THE OPERATOR'S WORD STANDS until evidence moves it: `not_relevant` is kept whatever the check
 *    finds; `added` becomes `verified` only when a check finds the listing (confirmed or likely);
 *    a `verified` listing a check finds a problem with becomes `needs_attention`.
 * Sources the check did not look at are left exactly as they are.
 */
export function mergePresence(
  leadId: string, stored: StoredPresenceRow[], findings: PresenceFinding[], now: string, runId: string | null,
): StoredPresenceRow[] {
  const byKey = new Map(stored.map((r) => [r.source_key, r]));
  const out: StoredPresenceRow[] = [];
  for (const f of findings) {
    const s = byKey.get(f.source_key);
    const seen = f.status !== 'worth_adding' && f.match_confidence !== null && f.match_confidence !== 'unverified';
    if (!s) {
      out.push({
        ...f, lead_id: leadId, status: f.status, status_source: 'check', previous_status: null,
        first_seen_at: now, last_checked_at: now, last_seen_at: seen ? now : null, status_changed_at: now,
        verified_at: null, check_count: 1, last_run_id: runId,
      });
      continue;
    }
    let status: PresenceStatus = s.status;
    let statusSource = s.status_source;
    let verifiedAt = s.verified_at;
    if (s.status === 'not_relevant' && s.status_source === 'operator') {
      /* kept */
    } else if (s.status === 'added') {
      if (seen) { status = f.status === 'needs_attention' ? 'needs_attention' : 'verified'; statusSource = 'check'; verifiedAt = status === 'verified' ? now : verifiedAt; }
    } else if (s.status === 'verified') {
      if (seen && f.status === 'needs_attention') { status = 'needs_attention'; statusSource = 'check'; }
    } else if (['existing', 'needs_attention'].includes(s.status) && s.match_confidence && s.match_confidence !== 'unverified' && f.status === 'worth_adding') {
      /* ⛔ absence never downgrades: keep the listing, record that this check did not see it */
    } else {
      status = f.status; statusSource = 'check';
    }
    /* A kept listing keeps its listing fields when this check did not see it. */
    const keepListing = !seen && s.match_confidence && s.match_confidence !== 'unverified' && ['existing', 'needs_attention', 'verified'].includes(status);
    const base = keepListing
      ? { ...f, listing_url: s.listing_url, match_confidence: s.match_confidence, match_signals: s.match_signals, found_details: s.found_details, inconsistencies: s.inconsistencies, fields_compared: s.fields_compared, reason: s.reason, status: undefined }
      : { ...f, status: undefined };
    out.push({
      ...base,
      id: s.id, lead_id: leadId,
      status, status_source: statusSource,
      previous_status: status !== s.status ? s.status : s.previous_status,
      first_seen_at: s.first_seen_at,
      last_checked_at: now,
      last_seen_at: seen ? now : s.last_seen_at,
      status_changed_at: status !== s.status ? now : s.status_changed_at,
      verified_at: verifiedAt,
      check_count: (s.check_count ?? 0) + 1,
      last_run_id: runId,
      operator_note: s.operator_note ?? null,
    } as StoredPresenceRow);
  }
  /* Rows this check said nothing about were still checked: last_checked_at moves, nothing else. */
  const touched = new Set(findings.map((f) => f.source_key));
  for (const s of stored) {
    if (touched.has(s.source_key)) continue;
    out.push({ ...s, last_checked_at: now, check_count: (s.check_count ?? 0) + 1, last_run_id: runId });
  }
  return out;
}

/** The operator moving a row by hand. Returns null for a move that is not allowed. */
export function operatorSetStatus(row: StoredPresenceRow, to: PresenceStatus | 'reset', now: string): StoredPresenceRow | null {
  if (to === 'reset') {
    /* Back to whatever the evidence said last: a listing if one was ever seen, else worth adding. */
    const back: PresenceStatus = row.match_confidence && row.match_confidence !== 'unverified'
      ? (row.inconsistencies?.length ? 'needs_attention' : 'existing') : 'worth_adding';
    return { ...row, status: back, status_source: 'check', previous_status: row.status, status_changed_at: now };
  }
  if (!OPERATOR_STATUSES.includes(to)) return null;
  return {
    ...row, status: to, status_source: 'operator', previous_status: row.status, status_changed_at: now,
    verified_at: to === 'verified' ? now : row.verified_at,
  };
}

/* ── the shape the Paid Client hub reads ──────────────────────────────────────────────────────── */

export interface PresenceItem {
  source_key: string;
  label: string;
  kind: PresenceSourceKind;
  status: PresenceStatus;
  confidence: MatchConfidence | null;
  listing_url: string | null;
  priority: Priority | null;
  reason: string;
  issues: Inconsistency[];
  evidence: PresenceEvidence;
  first_seen_at: string;
  last_checked_at: string;
  last_seen_at: string | null;
  set_by_operator: boolean;
}

export interface PresenceSummary {
  lead_id: string;
  checked: boolean;
  last_checked_at: string | null;
  searched: boolean;
  counts: { already_on: number; needs_attention: number; worth_adding: number; in_progress: number; not_relevant: number };
  already_on: PresenceItem[];
  needs_attention: PresenceItem[];
  worth_adding: PresenceItem[];
  /** Marked added by the operator, not yet seen by a check. */
  in_progress: PresenceItem[];
  not_relevant: PresenceItem[];
  review: PresenceReviewItem[];
}

const PRIO_RANK: Record<Priority, number> = { high: 3, medium: 2, low: 1 };

export function toItem(r: StoredPresenceRow): PresenceItem {
  return {
    source_key: r.source_key, label: r.source_label, kind: r.source_kind, status: r.status,
    confidence: r.match_confidence, listing_url: r.listing_url, priority: r.priority, reason: r.reason,
    issues: r.inconsistencies ?? [], evidence: r.evidence ?? {},
    first_seen_at: r.first_seen_at, last_checked_at: r.last_checked_at, last_seen_at: r.last_seen_at,
    set_by_operator: r.status_source === 'operator',
  };
}

/** Group stored rows into ALREADY ON / NEEDS ATTENTION / WORTH ADDING (+ the operator's lists). */
export function presenceSummary(
  leadId: string, rows: StoredPresenceRow[],
  lastRun: { finished_at: string | null; searched: boolean; review?: PresenceReviewItem[] } | null,
): PresenceSummary {
  const items = rows.map(toItem);
  const byPrio = (a: PresenceItem, b: PresenceItem) => (PRIO_RANK[b.priority ?? 'low'] ?? 0) - (PRIO_RANK[a.priority ?? 'low'] ?? 0) || a.label.localeCompare(b.label);
  const byConf = (a: PresenceItem, b: PresenceItem) => (CONF_RANK[b.confidence ?? 'unverified'] - CONF_RANK[a.confidence ?? 'unverified']) || a.label.localeCompare(b.label);
  const already_on = items.filter((i) => i.status === 'existing' || i.status === 'verified').sort(byConf);
  const needs_attention = items.filter((i) => i.status === 'needs_attention').sort(byPrio);
  const worth_adding = items.filter((i) => i.status === 'worth_adding').sort(byPrio);
  const in_progress = items.filter((i) => i.status === 'added').sort(byPrio);
  const not_relevant = items.filter((i) => i.status === 'not_relevant');
  return {
    lead_id: leadId,
    checked: !!lastRun,
    last_checked_at: lastRun?.finished_at ?? null,
    searched: !!lastRun?.searched,
    counts: { already_on: already_on.length, needs_attention: needs_attention.length, worth_adding: worth_adding.length, in_progress: in_progress.length, not_relevant: not_relevant.length },
    already_on, needs_attention, worth_adding, in_progress, not_relevant,
    review: lastRun?.review ?? [],
  };
}

/* ── search queries ───────────────────────────────────────────────────────────────────────────── */

/** The web searches a check runs, when it runs them: name + town, the phone, and the domain off its
 *  own site. Each finds listings the others cannot (an old name under the same phone; a listing that
 *  names only the website). Deduped; empty parts are dropped. */
export function presenceQueries(id: BusinessIdentity): string[] {
  const q: string[] = [];
  if (id.name) q.push(`"${id.name}"${id.town ? ` ${id.town}` : ''}`);
  const phone = id.phones.find((p) => p.from.includes('site')) ?? id.phones[0];
  if (phone) q.push(`"${phone.value.replace(/^(0\d{4})(\d{6})$/, '$1 $2').replace(/^(0\d{3})(\d{7})$/, '$1 $2')}"`);
  if (id.domain) q.push(`"${id.domain}" -site:${id.domain}`);
  return [...new Set(q)];
}
