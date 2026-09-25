/* ════════════════════════════════════════════════════════════════════════════════════════════════
   PROSPECT PREVIEW — the prospect's facts, from what LeadFinder already holds.

   Priority: lead record → AI audit → existing crawl (siteInfo) → the pages read for research → a
   targeted homepage fetch (the caller's job, only when nothing fresher is held).

   THE SOURCE-SITE RULE: a thing the business states on its own public website may be reused,
   labelled "existing client website" — never "verified". ⛔ Nothing is invented: a value no source
   carries is absent and the section that needed it is left out.

   ⛔ CONFLICTS ARE FLAGGED, NOT RESOLVED. Two different years-trading claims → neither is used.
   Two phone numbers → the lead record's is used (it is the number the business gave Google and the
   one we would call) and the other is shown to the operator; a second number is common, not a lie.

   ⛔ A TOWN THAT ONLY EXISTS AS A MASS-GENERATED URL IS NOT A SERVICE AREA. The crawl's location
   cluster ("/electrician-in-<town>/" × 300) is how doorway sites are built; a town is an area only
   when their visible page text names it.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import type { FactConflict, ProspectConfig, ProspectService, Sourced, FactSource } from './types.ts';
import type { BrandRead } from './brand.ts';
import { tradePackFor, singularTrade } from './trades.ts';

export interface LeadFacts {
  id: string;
  business_name: string | null;
  website: string | null;
  phone: string | null;
  email?: string | null;
  address?: string | null;
  category?: string | null;
  search_keyword?: string | null;
  search_location?: string | null;
  derived_town?: string | null;
  rating?: number | null;
  review_count?: number | null;
}

export interface SiteInfoFacts {
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  openingHours?: string[] | null;
  services?: string[];
  towns?: string[];
}

export interface PageText { url: string; ok: boolean; text: string; metaDescription?: string | null; title?: string | null }

export interface ResearchConflictHint { kind: string; title: string; detail: string; evidence: string[] }

export interface FactsInput {
  lead: LeadFacts;
  /** The number LeadFinder is actually communicating with for this lead (the WhatsApp thread's
   *  number); defaults to the lead row's phone. */
  contactPhone?: string | null;
  /** Trade + town as the audit asked them. */
  audit: { trade: string | null; town: string | null } | null;
  siteInfo: SiteInfoFacts | null;
  pages: PageText[];
  brand: BrandRead | null;
  /** Conflict findings the warm-lead research already measured (positioning / hours / contact). */
  researchConflicts?: ResearchConflictHint[];
  /** Mark every value as fixture-sourced (tests only). */
  fixture?: boolean;
}

export type FactsResult =
  | { ok: true; config: ProspectConfig }
  | { ok: false; reason: string };

const NAV_NOISE = /^(?:home|about(?: us)?|contact(?: us)?|blog|news|gallery|our work|projects?|reviews?|testimonials?|faqs?|areas?(?: we cover| covered)?|locations?|privacy.*|cookie.*|terms.*|sitemap|careers|jobs|shop|book(?: now| online)?|get a quote|quote|services|our services|menu|login|account|cart|basket|search|team|meet the team|why choose us)$/i;

/** Menu entries that are pages, not services (found live 2026-09-26: Finance, Thankyou, Complaint Procedure). */
const NOT_A_SERVICE = /^contact\b|\b(?:finance|financing|thank ?you|thanks|complaints?|procedure|polic(?:y|ies)|cookies?|privacy|terms|accessibility|careers?|vacanc\w*|testimonials?|reviews?|gallery|portfolio|case stud\w*|faqs?|blog|news|shop|login|sitemap|brochure|downloads?)\b/i;
/** Sentences that are legal / finance / site boilerplate, never a description. */
const BOILERPLATE = /\b(?:finance|credit|introduc(?:e|er|ing) customers|fca|authori[sz]ed|regulated|registered (?:in|office)|company (?:no|number)|vat|cookies?|privacy|terms|all rights reserved|copyright|subject to status|complaints?)\b|©/i;

/** Prose, not a run of menu labels: mostly lower-case words, no label repeated three times. The
 *  visible text of a page starts with its menu ("About Services Gallery Reviews About Services…"),
 *  which a sentence splitter happily returns as one "sentence" (E.E.S Electrical, live 2026-09-26). */
export function isProse(s: string): boolean {
  const words = s.split(/\s+/).filter((w) => /[A-Za-z]/.test(w));
  if (words.length < 6) return false;
  const lower = words.filter((w) => /^[a-z]/.test(w)).length;
  const counts = new Map<string, number>();
  for (const w of words) counts.set(w.toLowerCase(), (counts.get(w.toLowerCase()) ?? 0) + 1);
  const repeatedLabel = [...counts.entries()].some(([w, n]) => n >= 3 && /^[A-Z]/.test(words.find((x) => x.toLowerCase() === w) ?? ''));
  return lower / words.length >= 0.3 && !repeatedLabel;
}

/** A CUSTOMER speaking (a testimonial on their page) — never the business's own description. Found
 *  live 2026-09-26: R.Coulson's "Bathrooms" card got "…we are extremely pleased with his work". */
const REVIEW_VOICE = /\b(?:his|her|their) work\b|\b(?:highly|would|thoroughly|definitely) recommend|\bpleased with\b|\bthank(?:s| you)\b|\bcame out\b|\bturned up\b|\bfive stars?\b|\b5 stars?\b|\bgreat job\b|\bamazing job\b|\bwe (?:were|are) (?:very |extremely |so |really )?(?:happy|pleased|impressed)\b/i;

const titleCase = (s: string) => s.replace(/\b([a-z])([a-z]*)/g, (_m, a: string, b: string) => a.toUpperCase() + b)
  .replace(/\b(And|Of|In|For|The|To|A|An|On|With)\b/g, (w) => w.toLowerCase()).replace(/^./, (c) => c.toUpperCase());

export function normalisePhone(p: string | null | undefined): string {
  const d = (p ?? '').replace(/[^\d+]/g, '');
  if (d.startsWith('+44')) return '0' + d.slice(3);
  if (d.startsWith('0044')) return '0' + d.slice(4);
  if (d.startsWith('44') && d.length === 12) return '0' + d.slice(2);
  return d.replace(/^\+/, '');
}

/** "01932 123456" style for display, from any UK form. */
export function displayPhone(p: string): string {
  const d = normalisePhone(p);
  if (/^07\d{9}$/.test(d)) return `${d.slice(0, 5)} ${d.slice(5)}`;
  if (/^0(?:20|23|24|28|29)\d{8}$/.test(d)) return `${d.slice(0, 3)} ${d.slice(3, 7)} ${d.slice(7)}`;
  if (/^01\d{9}$/.test(d) || /^0\d{10}$/.test(d)) return `${d.slice(0, 5)} ${d.slice(5)}`;
  return p.trim();
}

const postcodeOf = (a: string | null | undefined) => (/\b([A-Z]{1,2}\d[A-Z\d]?)\s*(\d[A-Z]{2})\b/i.exec(a ?? '')?.slice(1, 3).join(' ') ?? '').toUpperCase();

/** Sentences of visible text. A full stop inside "E.E.S" is not a boundary: a boundary is
 *  [.!?] + space + a capital. */
export function sentencesOf(text: string): string[] {
  const parts = text.replace(/\s+/g, ' ').split(/(?<=[.!?])\s+(?=[A-Z0-9“"'])/).map((x) => x.trim()).filter(Boolean);
  // "R. Coulson", "J. Smith & Sons": a lone initial before the stop is not a sentence end.
  const out: string[] = [];
  for (const x of parts) {
    if (out.length && /(?:^|\s)[A-Z]\.$/.test(out[out.length - 1])) out[out.length - 1] += ' ' + x;
    else out.push(x);
  }
  return out;
}

function sentenceWith(text: string, needle: RegExp, min = 30, max = 220): string | null {
  return sentencesOf(text).find((x) => needle.test(x) && x.length >= min && x.length <= max) ?? null;
}

const escapeRe = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Service names from the site's menu / page titles, cleaned. Town-suffixed doorway titles
 *  ("Electrician in Woking") are reduced to the service or dropped. */
export function cleanServices(raw: string[], tradeLabel: string, towns: string[], businessName = ''): string[] {
  const townRe = towns.length ? new RegExp(`\\s*(?:in|near|around|across|for)?\\s*(?:${towns.map(escapeRe).join('|')})\\b.*$`, 'i') : null;
  // A menu entry that is the business's own name ("R Coulson Plumbing") is not a service.
  const nameWord = (businessName.replace(/[^A-Za-z ]/g, ' ').split(/\s+/).find((w) => w.length >= 4) ?? '').toLowerCase();
  const out: string[] = [];
  const seen = new Set<string>();
  for (const r of raw) {
    let s = (r ?? '').replace(/\s*[|–—-]\s*.*$/, '').replace(/\s+/g, ' ').trim();
    if (townRe) s = s.replace(townRe, '').trim();
    s = s.replace(/\s+(?:in|near)\s+[A-Z][\w' -]+$/, '').trim();
    if (s.length < 3 || s.length > 48 || NAV_NOISE.test(s) || NOT_A_SERVICE.test(s)) continue;
    if (nameWord && s.toLowerCase().includes(nameWord)) continue;
    if (s.toLowerCase() === tradeLabel.toLowerCase() || s.toLowerCase() === `${tradeLabel}s`) continue;
    const key = s.toLowerCase().replace(/s$/, '');
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(/[A-Z]/.test(s.slice(1)) ? s : titleCase(s));
  }
  return out.slice(0, 8);
}

const AREA_LEAD = /\b(?:areas? (?:we )?(?:cover|serve)|we (?:also )?cover|covering|serving|service areas?|based in|throughout|surrounding areas?(?: of| including)?|including)\b[:\s]*([^.]{3,260})/gi;

/** Towns their visible text names as areas. Capitalised words inside an "areas we cover …"
 *  sentence, split on commas / "and". */
export function areasFromText(text: string): string[] {
  const found: string[] = [];
  for (const m of text.matchAll(AREA_LEAD)) {
    for (const part of m[1].split(/,|\band\b|&|\//)) {
      const t = part.replace(/\(.*?\)/g, '').trim().replace(/^(?:the|in|and)\s+/i, '');
      if (/^(?:[A-Z][a-z'’-]+)(?:[- ](?:on|upon|under|le|by|in|the|[A-Z][a-z'’-]+)){0,3}$/.test(t) && t.length <= 30 && !/^(?:We|Our|All|Surrey|Kent|London|Areas|Surrounding|Local|The|Call|Contact|Free)$/.test(t)) found.push(t);
    }
  }
  return [...new Set(found)];
}

export function yearsTradingClaims(text: string, nowYear: number): string[] {
  const out = new Set<string>();
  for (const m of text.matchAll(/\b(?:established(?: in)?|est\.?|trading since|in business since|since|founded(?: in)?)\s+((?:19[5-9]|20[0-2])\d)\b/gi)) {
    const y = Number(m[1]);
    if (y <= nowYear) out.add(`Established ${y}`);
  }
  for (const m of text.matchAll(/\b(over |more than )?(\d{1,2})\+?\s+years['’]?\s+(?:of\s+)?(?:experience|in business|in the trade|trading)\b/gi)) {
    out.add(`${m[1] ? 'Over ' : ''}${m[2]} years’ experience`);
  }
  return [...out];
}

export function buildProspectConfig(i: FactsInput): FactsResult {
  const src = (s: FactSource): FactSource => (i.fixture ? 'fixture' : s);
  const name = (i.lead.business_name ?? '').trim();
  if (!name) return { ok: false, reason: 'The lead has no business name.' };
  const trade = (i.audit?.trade || i.lead.category || i.lead.search_keyword || '').trim();
  const town = (i.audit?.town || i.lead.derived_town || i.lead.search_location || '').trim();
  if (!town) return { ok: false, reason: 'No home town is known for this business (lead or audit).' };
  const pack = tradePackFor(trade);
  const tradeLabel = pack.key === 'generic' ? (singularTrade(trade) || 'local business') : pack.label;

  const flags: string[] = [];
  const conflicts: FactConflict[] = [];
  const pages = i.pages.filter((p) => p.ok && p.text);
  const home = pages[0] ?? null;
  const allText = pages.map((p) => p.text).join(' \n ');
  const site = i.siteInfo ?? {};

  /* ── contact ──
     ⛔ THE PHONE RULE (Paul, 2026-09-26). Agree → used normally. Differ → a SOURCE CONFLICT: this
     OUTREACH preview may put the number we are actually messaging on its CTA, but the website's
     number stays recorded as its own fact (websitePhone), the two are never presented as
     consistent, and the operator is told. A paid build must resolve it before production. */
  const requiresResolution: string[] = [];
  const contactPhone = (i.contactPhone ?? i.lead.phone)?.trim() || null;
  const sitePhone = site.phone?.trim() || null;
  const websitePhone: Sourced<string> | null = sitePhone ? { value: displayPhone(sitePhone), source: src('existing_site'), url: home?.url ?? null } : null;
  let phone: Sourced<string> | null = null;
  if (contactPhone && sitePhone && normalisePhone(contactPhone) !== normalisePhone(sitePhone)) {
    phone = { value: displayPhone(contactPhone), source: src('outreach_contact') };
    const note = `Phone mismatch: LeadFinder/contact number is ${displayPhone(contactPhone)}; current website shows ${displayPhone(sitePhone)}.`;
    conflicts.push({ field: 'phone', note: `${note} The preview CTA uses the contact number (outreach only).`,
      values: [{ value: displayPhone(contactPhone), source: src('outreach_contact') }, { value: displayPhone(sitePhone), source: src('existing_site'), url: home?.url ?? null }] });
    requiresResolution.push(`${note} Confirm with the client which number goes on the site.`);
  } else if (contactPhone) {
    phone = { value: displayPhone(contactPhone), source: src(sitePhone ? 'existing_site' : 'lead_record'), url: sitePhone ? home?.url ?? null : null };
  } else if (websitePhone) {
    phone = websitePhone;
  }
  const email: Sourced<string> | null = site.email ? { value: site.email.trim(), source: src('existing_site'), url: home?.url ?? null }
    : i.lead.email ? { value: i.lead.email.trim(), source: src('lead_record') } : null;

  let address: Sourced<string> | null = null;
  const siteAddr = site.address?.trim() || null;
  const leadAddr = i.lead.address?.trim() || null;
  if (siteAddr && leadAddr && postcodeOf(siteAddr) && postcodeOf(leadAddr) && postcodeOf(siteAddr) !== postcodeOf(leadAddr)) {
    conflicts.push({ field: 'address', note: 'Their website and their Google listing give different postcodes — no address is shown.',
      values: [{ value: siteAddr, source: src('existing_site') }, { value: leadAddr, source: src('google_places') }] });
  } else if (siteAddr) address = { value: siteAddr, source: src('existing_site'), url: home?.url ?? null };
  else if (leadAddr) address = { value: leadAddr, source: src('google_places') };

  /* ── research conflicts (already measured) ── */
  let hoursBlocked = false;
  for (const c of i.researchConflicts ?? []) {
    if (!/conflict/.test(c.kind)) continue;
    conflicts.push({ field: c.kind.replace(/_conflict$/, ''), note: c.detail, values: c.evidence.slice(0, 4).map((e) => ({ value: e, source: src('existing_site') })) });
    if (c.kind === 'hours_conflict') hoursBlocked = true;
  }
  const openingHours: Sourced<string[]> | null = !hoursBlocked && site.openingHours?.length
    ? { value: site.openingHours.slice(0, 7), source: src('existing_site'), url: home?.url ?? null } : null;

  /* ── areas ── */
  const textAreas = areasFromText(allText).filter((t) => t.toLowerCase() !== town.toLowerCase());
  const clusterTowns = (site.towns ?? []).map((t) => titleCase(t.replace(/-/g, ' ')));
  const inText = (t: string) => new RegExp(`\\b${escapeRe(t)}\\b`, 'i').test(allText);
  const rejectedAreas = clusterTowns.filter((t) => !inText(t) && t.toLowerCase() !== town.toLowerCase());
  if (rejectedAreas.length) flags.push(`${rejectedAreas.length} town(s) appear only as generated location URLs on their site and were NOT used as service areas: ${rejectedAreas.slice(0, 6).join(', ')}${rejectedAreas.length > 6 ? '…' : ''}.`);
  const areaNames = [...new Set([...textAreas, ...clusterTowns.filter((t) => inText(t) && t.toLowerCase() !== town.toLowerCase())])].slice(0, 10);
  const areas: Array<Sourced<string>> = [
    { value: town, source: src(i.audit?.town ? 'ai_audit' : 'lead_record') },
    ...areaNames.map((a) => ({ value: a, source: src('existing_site'), url: home?.url ?? null })),
  ];

  /* ── services ── */
  const serviceNames = cleanServices(site.services ?? [], tradeLabel, [town, ...areaNames, ...clusterTowns], name);
  /* A description is THEIR sentence about THAT service: it names the service, it is not a list of
     several services (that sentence describes none of them), and no two cards share one. */
  const sentences = sentencesOf(allText);
  const keyRe = (n: string) => {
    const words = n.split(/\s+/).filter((w) => w.length > 3).slice(0, 2).map((w) => escapeRe(w.replace(/s$/i, '')));
    return words.length ? new RegExp(`\\b${words.join('\\w*\\s+(?:\\w+\\s+)?')}`, 'i') : null;
  };
  const used = new Set<string>();
  const services: ProspectService[] = serviceNames.map((n) => {
    const re = keyRe(n);
    const others = serviceNames.filter((o) => o !== n).map(keyRe).filter((r): r is RegExp => !!r);
    const d = re ? sentences
      .filter((x) => re.test(x) && x.length >= 40 && x.length <= 190 && !used.has(x) && !/\?$/.test(x) && !/\|/.test(x) && !BOILERPLATE.test(x) && isProse(x) && !REVIEW_VOICE.test(x) && !/^(?:This|It|It['’]s|Its|These|That|They|Those|He|She|Here|Yes|No|Absolutely|Of course)\b/.test(x) && others.filter((o) => o.test(x)).length < 2)
      .sort((x, y) => x.length - y.length)[0] ?? null : null;
    if (d) used.add(d);
    return { name: n, description: d, source: src('existing_site'), url: home?.url ?? null };
  });
  if (!services.length) flags.push('No services could be read from their site — the services section lists none. Add them in the lead before regenerating, or send the card only.');

  /* ── proof ── */
  const credentials: Array<Sourced<string>> = [];
  for (const re of pack.credentials) {
    const m = re.exec(allText);
    if (m && !credentials.some((c) => c.value.toLowerCase() === m[0].toLowerCase())) {
      credentials.push({ value: m[0], source: src('existing_site'), url: home?.url ?? null, quote: sentenceWith(allText, re, 10, 200) });
    }
  }
  const years = yearsTradingClaims(allText, new Date().getUTCFullYear());
  let yearsTrading: Sourced<string> | null = null;
  if (years.length > 1) {
    conflicts.push({ field: 'years_trading', note: 'Their site makes more than one years-trading claim — neither is used.', values: years.map((v) => ({ value: v, source: src('existing_site') })) });
  } else if (years.length === 1) yearsTrading = { value: years[0], source: src('existing_site'), url: home?.url ?? null };

  const rating = typeof i.lead.rating === 'number' && typeof i.lead.review_count === 'number' && i.lead.review_count >= 5 && i.lead.rating >= 4
    ? { value: { rating: Math.round(i.lead.rating * 10) / 10, count: i.lead.review_count }, source: src('google_places') } : null;

  // The name's most distinctive word ("R.Coulson …" → "Coulson"): spacing and punctuation in the
  // name vary across one site ("R.Coulson" / "R. Coulson").
  // Built from the name's FIRST word with its punctuation optional: "E.E.S" matches "EES" / "E. E. S",
  // "R.Coulson" matches "R. Coulson". Never a generic later word ("Electrical" is everyone's).
  const firstChars = (name.split(/\s+/)[0] ?? '').replace(/[^A-Za-z0-9]/g, '');
  const nameRe = firstChars.length >= 2 ? new RegExp('\\b' + firstChars.split('').map(escapeRe).join('[.\\s]*'), 'i') : new RegExp(escapeRe(name), 'i');
  const tradeRe = new RegExp(escapeRe(tradeLabel.split(' ')[0].slice(0, 6)), 'i');
  const meta = home?.metaDescription?.trim() ?? '';
  /* The summary is a sentence ABOUT the business: it names them, and it is not legal / finance /
     cookie boilerplate (R.Coulson's footer finance disclaimer was picked live, 2026-09-26). A sentence
     that also names the trade or says what they do ranks first. */
  const allSentences = sentencesOf(allText);
  const aboutSentences = allSentences.filter((x) => nameRe.test(x) && x.length >= 40 && x.length <= 240 && !BOILERPLATE.test(x) && !REVIEW_VOICE.test(x) && !/\?$/.test(x) && isProse(x));
  let bestAbout = aboutSentences.find((x) => tradeRe.test(x) || /\b(?:we|our)\b/i.test(x)) ?? aboutSentences[0] ?? null;
  // A short one ("I set up E.E.S … since 2008.") carries on into their next "We …" sentence, verbatim.
  if (bestAbout && bestAbout.length < 110) {
    const next = allSentences[allSentences.indexOf(bestAbout) + 1];
    if (next && /^(?:We|Our)\b/.test(next) && isProse(next) && !BOILERPLATE.test(next) && bestAbout.length + next.length <= 280) bestAbout = bestAbout + ' ' + next;
  }
  const summaryText = meta.length >= 50 && meta.length <= 240 && !BOILERPLATE.test(meta) && (nameRe.test(meta) || tradeRe.test(meta)) ? meta : bestAbout;
  const summary = summaryText ? { value: summaryText, source: src('existing_site'), url: home?.url ?? null } : null;

  /* ── brand ── */
  const b = i.brand;
  const brand: ProspectConfig['brand'] = {
    logoUrl: b?.logoUrl ? { value: b.logoUrl, source: src('existing_site'), url: home?.url ?? null } : null,
    primary: b?.primary ? { value: b.primary, source: src('existing_site'), quote: b.colourSource } : null,
    accent: b?.accent ? { value: b.accent, source: src('existing_site'), quote: b.colourSource } : null,
    photos: (b?.photos ?? []).map((p) => ({ value: p, source: src('existing_site'), url: home?.url ?? null })),
  };
  if (!brand.logoUrl) flags.push('No logo found on their site — the header uses their business name as a text wordmark.');
  if (b?.logoWarning) flags.push(b.logoWarning);
  if (!brand.photos.length) flags.push('No genuine business photos found — the page uses no imagery rather than stock.');
  if (!brand.primary) flags.push('No brand colour found — a neutral palette is used.');
  if (conflicts.length) flags.push(`${conflicts.length} source conflict(s) — see below. Conflicting values are not shown on the page.`);

  const website = (i.lead.website ?? '').trim();
  return {
    ok: true,
    config: {
      tradeKey: pack.key,
      tradeLabel,
      business: {
        name: { value: name, source: src('lead_record') },
        website: website ? { value: website, source: src('lead_record') } : null,
        phone, email, address,
        town: { value: town, source: src(i.audit?.town ? 'ai_audit' : 'lead_record') },
        openingHours,
        websitePhone,
      },
      brand,
      services,
      areas,
      proof: { credentials, yearsTrading, rating, summary },
      conflicts,
      flags,
      rejectedAreas,
      requiresResolution,
    },
  };
}
