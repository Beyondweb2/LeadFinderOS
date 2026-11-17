/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE OPPORTUNITY SCORE (Paul, 2026-11-16) — which leads are our ICP: businesses AI ignores AND whose website is the
   reason, and who are worth working. Record, every weight and the Master Standard section behind it:
   docs/OPPORTUNITY_SCORE.md.

   ⛔ TEAM ONLY. A sorting aid for the sales team on Outreach and Find Leads. Never in a report, a reply, a template, a
      voice note or anything a business reads (scripts/opportunity-score.test.ts fences the imports), and never a
      prediction of AI visibility or a promise: it ranks where OUR work is most likely to matter.
   ⛔ ONLY WEBSITE CHECKS THAT PASSED THE ACCURACY BENCH (docs/WEBSITE_CHECK_ACCURACY.md, 90% bar). Every finding kind
      the score reads is listed below with its bench result; a kind in CLIENT_HIDDEN_KINDS is never read. Two exact
      one-file reads the bench had no case of (robots.txt blocks, the phone viewport tag) are listed apart and named
      in the doc. Page timing (slow_pages) is NOT read: it is one download from our server, not a phone speed test,
      and the bench never measured it.
   ⛔ NEVER GUESSED. No deep website check, or no finished AI audit = "Incomplete", with what is missing. A missing
      input is never read as a good or a bad one (the absent-value law, docs/rules/engineering.md).
   ⛔ NEVER SUGGESTS THIN SERVICE × TOWN PAGES (Master Standard §05, §19). A site that HAS copy-paste town pages scores
      higher (it is a problem we fix), and no reason line ever tells anyone to add a page per town.
   ⛔ NOT a winnability score (docs/architecture-rules.md): it never scores a search. It reads the audit's stored counts
      (one ruler, auditScore.ts) and, where the audit is on rules v3, its stored winnable count.
   Pure: no I/O, no clock, no DOM. Same inputs → same score.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { classifyLeadWebsite } from './leadWebsiteKind.ts';
import { CLIENT_HIDDEN_KINDS } from './websiteCheckAccuracy.ts';
import { coldWhatsAppVerdict } from './coldWhatsAppEligibility.ts';
import type { StoredAuditScore } from './auditScore.ts';

export const OPPORTUNITY_SCORE_VERSION = 1;

/* ── The website signals (Master Standard §03, §04, §05, §07, §13, §16) ─────────────────────────────────────────── */

export type OppSignalKey =
  | 'no_own_site' | 'ai_blocked' | 'unreadable' | 'services_not_own_pages' | 'no_areas' | 'no_contact'
  | 'no_business_schema' | 'thin_pages' | 'town_swap_pages' | 'heavy_pages' | 'not_mobile_ready';

export type OppTier = 'critical' | 'big';

export interface OppSignal {
  key: OppSignalKey;
  tier: OppTier;
  points: number;
  /** The finding kinds that raise it (the one website check's ids). Empty = read from the lead, not the check. */
  kinds: readonly string[];
  /** The plain reason line the team reads. Never advice to add pages per town. */
  words: string;
  /** Master Standard section(s) the weight comes from. */
  standard: string;
}

/** CRITICAL: AI cannot read the site, or the site does not say what / where / how to reach. HEAVY weight. */
export const OPP_CRITICAL_POINTS = 20;
/** BIG: the site can be read but gives AI little to use. */
export const OPP_BIG_POINTS = 8;
/** The website part never exceeds this, however many problems (two criticals + one big). */
export const OPP_WEBSITE_MAX = 50;

export const OPP_SIGNALS: readonly OppSignal[] = [
  { key: 'no_own_site', tier: 'critical', points: OPP_CRITICAL_POINTS, kinds: [],
    words: 'No website of its own: AI has nothing of theirs to read', standard: '§03, §04' },
  { key: 'ai_blocked', tier: 'critical', points: OPP_CRITICAL_POINTS,
    kinds: ['robots_blocks_all', 'robots_blocks_ai_search', 'robots_blocks_oai-searchbot', 'robots_blocks_perplexitybot', 'robots_blocks_googlebot', 'robots_blocks_bingbot', 'ct_robots_blocks_ai'],
    words: 'Site tells AI search tools to stay away (robots.txt)', standard: '§03, §16' },
  { key: 'unreadable', tier: 'critical', points: OPP_CRITICAL_POINTS, kinds: ['client_rendered', 'home_no_text', 'noindex_home'],
    words: 'Homepage is unreadable to AI (blank until scripts run, or marked noindex)', standard: '§03, §16' },
  { key: 'services_not_own_pages', tier: 'critical', points: OPP_CRITICAL_POINTS, kinds: ['no_service_pages', 'one_page_site', 'services_on_one_page'],
    words: 'Main services are not each on their own page', standard: '§05' },
  { key: 'no_areas', tier: 'critical', points: OPP_CRITICAL_POINTS, kinds: ['ct_areas_not_stated', 'town_missing'],
    words: 'Site does not say which areas they serve', standard: '§04' },
  { key: 'no_contact', tier: 'critical', points: OPP_CRITICAL_POINTS, kinds: ['no_contact_details'],
    words: 'No contact details on the site', standard: '§04' },
  { key: 'no_business_schema', tier: 'big', points: OPP_BIG_POINTS, kinds: ['no_business_schema', 'vs_business_schema'],
    words: 'No business details in the page code (LocalBusiness / Organization)', standard: '§13' },
  { key: 'thin_pages', tier: 'big', points: OPP_BIG_POINTS, kinds: ['thin_key_pages', 'thin_pages'],
    words: 'Key pages have very little text', standard: '§07' },
  { key: 'town_swap_pages', tier: 'big', points: OPP_BIG_POINTS, kinds: ['vs_town_swapped_pages'],
    words: 'Has copy-paste town pages (only the town name changes)', standard: '§05, §19' },
  { key: 'heavy_pages', tier: 'big', points: 5, kinds: ['heavy_pages'],
    words: 'Very heavy pages (slow on a phone signal)', standard: '§03, §16' },
  { key: 'not_mobile_ready', tier: 'big', points: OPP_BIG_POINTS, kinds: ['no_viewport'],
    words: 'Pages are not set up for phones', standard: '§03, §16' },
];

/** The bench result (docs/WEBSITE_CHECK_ACCURACY.md, replay of 2026-11-15) for every kind the score reads: true / labelled. */
export const OPP_BENCH: Readonly<Record<string, readonly [number, number]>> = {
  client_rendered: [5, 5], home_no_text: [1, 1], noindex_home: [2, 2],
  no_service_pages: [4, 4], one_page_site: [3, 3], services_on_one_page: [2, 2],
  ct_areas_not_stated: [4, 4], town_missing: [1, 1],
  no_contact_details: [1, 1],
  no_business_schema: [10, 10], vs_business_schema: [6, 6],
  thin_key_pages: [3, 3], thin_pages: [4, 4], vs_town_swapped_pages: [8, 8], heavy_pages: [1, 1],
};
/** Exact one-file reads the bench had no case of (no site in the set blocked AI or lacked the tag). Unit-tested in
 *  siteAudit; named in the doc so Paul can switch them off. */
export const OPP_EXACT_READS: ReadonlySet<string> = new Set([
  'robots_blocks_all', 'robots_blocks_ai_search', 'robots_blocks_oai-searchbot', 'robots_blocks_perplexitybot', 'robots_blocks_googlebot',
  'robots_blocks_bingbot', 'ct_robots_blocks_ai', 'no_viewport',
]);

/* ── The AI audit part (Master Standard §17) ───────────────────────────────────────────────────────────────────── */

/** Named in none of the answers. */
export const OPP_AI_NOT_NAMED = 30;
/** Named in at most a third of the answers. */
export const OPP_AI_LOW = 18;
/** Named in at most two thirds. */
export const OPP_AI_SOME = 6;
/** Named in more than OPP_NAMED_WIDELY of the answers = already named widely: capped Cold. */
export const OPP_NAMED_WIDELY = 2 / 3;
/** Rules v3 only, when the audit stores it: each winnable search adds this, up to OPP_WINNABLE_MAX. */
export const OPP_WINNABLE_EACH = 2;
export const OPP_WINNABLE_MAX = 6;

/* ── Worth it (Master Standard §10, §11: an active, real business AI can corroborate) ──────────────────────────── */
export const OPP_GOOGLE_LISTING = 2;
export const OPP_REVIEWS_SOME = 2;   // 3+ Google reviews
export const OPP_REVIEWS_MANY = 4;   // 10+
export const OPP_RATING_GOOD = 2;    // 4.0★ or better
export const OPP_MOBILE = 6;         // a UK mobile we can reach
export const OPP_WORTH_MAX = 14;

/** A strong site (site score "Little to gain", 80+) with no critical problem: the website part counts nothing. */
export const OPP_STRONG_SITE_AT = 80;
/** Lowered leads (named widely) never rise above this: always Cold. */
export const OPP_LOWERED_CAP = 30;

export type OppBand = 'hot' | 'warm' | 'cold';
export const OPP_BAND_MIN = { hot: 60, warm: 35 } as const;
export const OPP_BAND_LABELS: Record<OppBand, string> = { hot: 'Hot', warm: 'Warm', cold: 'Cold' };
export function oppBand(score: number): OppBand {
  return score >= OPP_BAND_MIN.hot ? 'hot' : score >= OPP_BAND_MIN.warm ? 'warm' : 'cold';
}

/** Lead statuses that mean "never contact" or "already ours" — excluded, never scored. */
const STOP_STATUSES: ReadonlySet<string> = new Set(['opted_out', 'do_not_contact', 'wrong_number']);
const CLIENT_STATUSES: ReadonlySet<string> = new Set(['payment_received', 'refunded']);

/* ── Inputs and result ─────────────────────────────────────────────────────────────────────────────────────────── */

export interface OppLeadFacts {
  website: string | null | undefined;
  phone?: string | null;
  country?: string | null;
  status?: string | null;
  /** The server's Find Leads status key (findLeadsLeadStatus.ts) when that is all we have. */
  findLeadsStatus?: string | null;
  /** The lead is on the opt-out / suppression list (any source). */
  suppressed?: boolean;
  hasGoogleListing?: boolean;
  reviewCount?: number | null;
  rating?: number | null;
}

/** The one website check, already read by websiteCheckFor (team audience) + the site score view. */
export interface OppWebsiteFacts {
  /** 'deep' = a deep check whose findings we may read. Anything else = not usable (incomplete). */
  depth: 'deep' | 'quick' | 'failed' | 'none';
  /** Finding ids the check made (team view). */
  issueIds: readonly string[];
  /** Site score state from siteScoreViewFor: 'scored' with a number, or the state key. */
  siteScore: number | null;
  siteState: string | null;
}

export interface OppAuditFacts {
  /** The stored hook score (auditScore.parseStoredScore). Null = none of this version. */
  score: StoredAuditScore | null;
  updating: boolean;
  /** Rules v3 only, when stored: searches judged Winnable / all judged. Absent = not stored (never guessed). */
  v3?: { winnable: number; judged: number } | null;
  /** A prospect re-check replaced the hook (2026-11-16, prospectRecheck.ts): its named share over every answer is used
   *  INSTEAD of the hook score. null = the re-check has no usable share yet. Absent = no re-check (the hook score). */
  recheckShare?: { named: number; total: number } | null;
}

export interface OppReason { text: string; points: number; kind: 'website' | 'ai' | 'worth' | 'lowered' }

/** Which of the two inputs a lead still lacks: the deep website scan, the finished AI audit, or both (2026-11-17). */
export type OppNeeds = 'scan' | 'audit' | 'both';
export const OPP_NEEDS_LABELS: Record<OppNeeds, string> = { scan: 'Needs scan', audit: 'Needs audit', both: 'Needs both' };

export type OppResult =
  | { kind: 'excluded'; why: string; critical: boolean; reasons: OppReason[] }
  | { kind: 'incomplete'; missing: string[]; needs: OppNeeds; critical: boolean; reasons: OppReason[]; partial: number }
  | { kind: 'scored'; score: number; band: OppBand; critical: boolean; reasons: OppReason[]; parts: { website: number; ai: number; worth: number }; lowered: string | null };

const kindUsable = (id: string) => !CLIENT_HIDDEN_KINDS.has(id) && (id in OPP_BENCH || OPP_EXACT_READS.has(id));

/** The website signals a lead has. A no-website lead has `no_own_site` without any check. */
export function websiteSignalsOf(lead: Pick<OppLeadFacts, 'website'>, site: OppWebsiteFacts | null): { signals: OppSignal[]; known: boolean } {
  const src = classifyLeadWebsite(lead.website).source;
  if (src === 'none' || src === 'social_profile' || src === 'directory_profile') {
    return { signals: OPP_SIGNALS.filter((s) => s.key === 'no_own_site'), known: true };
  }
  /* Only a DEEP check's findings are read: a quick check judges little, a failed one nothing (siteScore.ts, same rule). */
  const ids = new Set(site?.depth === 'deep' ? site.issueIds.filter(kindUsable) : []);
  /* robots.txt blocking everything is also a site-score state (the check then reads nothing else). */
  if (site?.siteState === 'robots_blocked') ids.add('robots_blocks_all');
  if (site?.siteState === 'js_only') ids.add('client_rendered');
  const known = site?.depth === 'deep' || site?.siteState === 'robots_blocked' || site?.siteState === 'js_only';
  const signals = OPP_SIGNALS.filter((s) => s.kinds.some((k) => ids.has(k)));
  return { signals, known };
}

function namedShare(s: StoredAuditScore): { named: number; total: number } | null {
  const total = s.scored.expected;
  if (!s.complete || !(total > 0)) return null;
  return { named: Math.min(Math.max(0, s.scored.named), total), total };
}

export function opportunityScore(lead: OppLeadFacts, site: OppWebsiteFacts | null, audit: OppAuditFacts | null): OppResult {
  const reasons: OppReason[] = [];
  const web = websiteSignalsOf(lead, site);
  const critical = web.signals.some((s) => s.tier === 'critical');
  const status = String(lead.status ?? '').toLowerCase();
  const fl = String(lead.findLeadsStatus ?? '').toLowerCase();
  for (const s of web.signals) reasons.push({ text: s.words, points: s.points, kind: 'website' });

  // Excluded: never contact, or already a client.
  if (lead.suppressed || STOP_STATUSES.has(status) || STOP_STATUSES.has(fl)) {
    const why = status === 'wrong_number' || fl === 'wrong_number' ? 'Wrong number' : 'Do Not Contact / opted out';
    /* ⛔ Never 'critical': the 'Has critical website issues' filter must not surface a lead nobody may contact. */
    return { kind: 'excluded', why, critical: false, reasons: [{ text: why, points: 0, kind: 'lowered' }] };
  }
  if (CLIENT_STATUSES.has(status) || fl === 'client') return { kind: 'excluded', why: 'Already a client', critical: false, reasons: [{ text: 'Already a client', points: 0, kind: 'lowered' }] };

  // Website part.
  const strong = !critical && web.known && typeof site?.siteScore === 'number' && site.siteScore >= OPP_STRONG_SITE_AT;
  let website = Math.min(OPP_WEBSITE_MAX, web.signals.reduce((n, s) => n + s.points, 0));
  if (strong) { website = 0; reasons.length = 0; reasons.push({ text: `Website already strong (site score ${site!.siteScore})`, points: 0, kind: 'lowered' }); }

  // Worth it.
  let worth = 0;
  const worthBits: string[] = [];
  if (lead.hasGoogleListing) worth += OPP_GOOGLE_LISTING;
  const rc = Number(lead.reviewCount ?? 0);
  if (rc >= 10) { worth += OPP_REVIEWS_MANY; worthBits.push(`${rc} Google reviews`); } else if (rc >= 3) { worth += OPP_REVIEWS_SOME; worthBits.push(`${rc} Google reviews`); }
  const rt = Number(lead.rating ?? 0);
  if (rc >= 3 && rt >= 4) { worth += OPP_RATING_GOOD; worthBits.push(`${rt.toFixed(1)}★`); }
  const mobile = coldWhatsAppVerdict(lead.phone, lead.country).eligible;
  if (mobile) { worth += OPP_MOBILE; worthBits.push('UK mobile'); }
  worth = Math.min(OPP_WORTH_MAX, worth);
  if (worthBits.length) reasons.push({ text: `Active: ${worthBits.join(', ')}`, points: worth, kind: 'worth' });
  else if (!mobile) reasons.push({ text: 'No UK mobile to reach', points: 0, kind: 'lowered' });

  // AI audit part.
  const missing: string[] = [];
  const needScan = !web.known;
  let needAudit = false;
  if (!web.known) missing.push(site?.depth === 'quick' ? 'only a quick website check (deep check not run yet)' : site?.depth === 'failed' ? 'website could not be read' : 'no website scan yet');
  const fromRecheck = !!audit && audit.recheckShare !== undefined;
  const share = fromRecheck ? audit!.recheckShare ?? null : audit?.score ? namedShare(audit.score) : null;
  if (!share) {
    needAudit = true;
    missing.push(fromRecheck
      ? (audit!.updating ? 'Re-check still running' : 'Re-check incomplete')
      : audit?.updating && audit.score ? 'AI audit still updating' : audit?.score ? 'AI audit incomplete' : 'no AI audit yet');
  }

  const partial = website + worth;
  if (missing.length) return { kind: 'incomplete', missing, needs: needScan && needAudit ? 'both' : needScan ? 'scan' : 'audit', critical, reasons: topReasons(reasons), partial };

  let ai = 0;
  let lowered: string | null = null;
  const pct = share!.named / share!.total;
  if (share!.named === 0) ai = OPP_AI_NOT_NAMED;
  else if (pct <= 1 / 3) ai = OPP_AI_LOW;
  else if (pct <= OPP_NAMED_WIDELY) ai = OPP_AI_SOME;
  else lowered = `Already named widely by AI (${share!.named} of ${share!.total} answers)`;
  const aiText = (share!.named === 0 ? `AI never named them (0 of ${share!.total} answers)` : `AI named them in ${share!.named} of ${share!.total} answers`) + (fromRecheck ? ' (re-check)' : '');
  if (!lowered) reasons.push({ text: aiText, points: ai, kind: 'ai' });
  const v3 = audit?.v3;
  if (v3 && v3.judged > 0 && !lowered) {
    const add = Math.min(OPP_WINNABLE_MAX, v3.winnable * OPP_WINNABLE_EACH);
    ai += add;
    if (v3.winnable > 0) reasons.push({ text: `${v3.winnable} of ${v3.judged} searches winnable`, points: add, kind: 'ai' });
  }

  let score = Math.max(0, Math.min(100, Math.round(website + ai + worth)));
  if (lowered) { score = Math.min(score, OPP_LOWERED_CAP); reasons.unshift({ text: lowered, points: 0, kind: 'lowered' }); }
  if (strong && score > OPP_LOWERED_CAP) score = OPP_LOWERED_CAP;
  return { kind: 'scored', score, band: oppBand(score), critical, reasons: topReasons(reasons), parts: { website, ai, worth }, lowered: lowered ?? (strong ? 'Website already strong' : null) };
}

/** The 3 lines shown: a lowering reason first, then the biggest points. Stable order on ties (stored order). */
export function topReasons(rs: OppReason[], n = 3): OppReason[] {
  return rs.map((r, i) => ({ r, i }))
    .sort((a, b) => Number(b.r.kind === 'lowered') - Number(a.r.kind === 'lowered') || b.r.points - a.r.points || a.i - b.i)
    .slice(0, n).map((x) => x.r);
}

/* ── One key for the lists (filter + sort), so the chip, the filter and the sort agree ─────────────────────────── */

export type OppGroup = OppBand | 'incomplete' | 'excluded';
export const OPP_GROUP_LABELS: Record<OppGroup, string> = { ...OPP_BAND_LABELS, incomplete: 'Incomplete', excluded: 'Excluded' };
export const OPP_GROUPS: readonly OppGroup[] = ['hot', 'warm', 'cold', 'incomplete', 'excluded'];
export function oppGroupOf(r: OppResult): OppGroup { return r.kind === 'scored' ? r.band : r.kind; }
/** Best opportunity first: scored high → low, then incomplete (critical first), then excluded. Lower key = first. */
export function oppSortKey(r: OppResult): number {
  if (r.kind === 'scored') return 100 - r.score;
  if (r.kind === 'incomplete') return 200 + (r.critical ? 0 : 1);
  return 300;
}

/* ── Adapters from what the lists already hold ─────────────────────────────────────────────────────────────────── */

/** The website facts from a WebsiteCheckView (websiteCheck.ts) + the site score view (siteScore.ts). */
export function oppWebsiteFacts(
  view: { state: string; summary: { depth?: string | null; issues: readonly { id: string }[] } | null } | null,
  siteView: { kind: 'scored'; score: number } | { kind: 'state'; state: string } | null,
): OppWebsiteFacts | null {
  if (!view && !siteView) return null;
  const depth = view?.summary?.depth === 'deep' ? 'deep' : view?.summary?.depth === 'failed' || view?.state === 'unreadable' ? 'failed' : view?.summary ? 'quick' : 'none';
  return {
    depth,
    issueIds: view?.summary?.issues.map((i) => i.id) ?? [],
    siteScore: siteView?.kind === 'scored' ? siteView.score : null,
    siteState: siteView?.kind === 'scored' ? 'scored' : siteView?.state ?? null,
  };
}
