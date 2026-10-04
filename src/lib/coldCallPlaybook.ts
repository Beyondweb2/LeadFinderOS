/* ════════════════════════════════════════════════════════════════════════════════════════════════
   COLD CALL PLAYBOOK v1 — a read-only call guide assembled from evidence already stored (2026-09-23).

   Paul rings a UK local business with this open. It leads with the AI visibility result (never "I
   build websites"), shows the proof behind it, the strongest one to three website findings, a plain
   explanation, the offer and short answers to the usual objections — and it knows whether this is a
   first call or a follow-up to a WhatsApp conversation.

   ⛔ PURE AND DETERMINISTIC. No fetch, no LLM, no React, no clock read except the `nowMs` it is
      given. The data is loaded by src/hooks/useColdCallPlaybook.ts with READS ONLY; this file only
      assembles words from what that read returned. Opening a playbook therefore cannot start an
      audit, a crawl, an Apify run, a model call or a send — there is nothing here that could.
      scripts/cold-call-playbook.test.ts pins that structurally.

   ⛔ NOTHING IS INVENTED. Every competitor is a name the stored answer returned (already cleaned and
      run-suppressed by buildReportData, the same ruler the public report uses); every website
      finding is a candidate from siteFindings.ts, with the words siteFindings.ts already wrote; every
      date is a stored timestamp. Where a piece is missing the playbook says so and uses a line that
      does not need it — never a placeholder name, never "a few local firms" standing in for names.

   ⛔ ONE SELECTION RULE EACH, BORROWED, NOT RESTATED:
        · the report      → resolveLeadReportAudit (auditReportResolver.ts), the rule Inbox uses;
        · the AI evidence → that same audit's buildReportData output (hook gap first, then the
                            question breakdown) — what the report itself prints;
        · the findings    → resolveFindingsSource (siteFindings.ts), the loop the WhatsApp {{6}} uses.

   🔴 CORRELATION IS NOT CAUSATION. A website finding "could be contributing"; it never "is why you
      don't show up". The finding copy is siteFindings.ts's, which is already hedged and tested for it.

   🔴 THE CALL FLOW (fix workstream 5, 2026-10-04): opening read (who is calling first, then why) → what we
      found → the questions worth asking → the close for the route that fits (callClose.ts: price, payments,
      what they get, the guarantee, "I'll send you the link now") → what happens after they pay. Plus the
      gatekeeper and voicemail lines. It works with no audit and with no WhatsApp ever sent.

   🔴 THE OFFER IS READ FROM findableOffer.ts, NEVER TYPED HERE: FINDABLE_OFFER_SUMMARY (£99 to start,
      then £99 a month; 12 payments on Build, 6 on Optimise — Paul, 2026-09-29) and FINDABLE_GUARANTEE. Until that date
      the sources disagreed and the playbook said "check current offer"; they are one source now.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { CRAWL_FRESH_MS, usableCrawlSignals, type CrawlSignals } from './crawlCheck.ts';
import { resolveFindingsSource, MAX_SITE_FINDINGS, type FindingKind, type FindingsSource, type SiteFinding } from './siteFindings.ts';
import type { SiteEvidenceFinding } from './siteEvidence.ts';
import { SALES_DOMAIN_LINE } from './domainAuthority.ts';
import { cleanAnswerText, isJunkAnswer, isMapCardAnswer } from './answerText.ts';
import { excludeSelfRivals } from './rivalHook.ts';
import { nameMatches } from './nameMatch.ts';
import { displayBusinessName } from './displayName.ts';
import { articleTrade, pluraliseTrade } from './templateVars.ts';
import { HOOK_ENGINE_LABELS, HOOK_SCORE_RESULTS } from './hookScore.ts';
import { isRealSend } from './realSend.ts';
import { REPORT_LINK_TEMPLATES } from './templateAttribution.ts';
import { readableTemplateBody } from './templateBodies.ts';
import { FINDABLE_GUARANTEE, FINDABLE_OFFER_SUMMARY, FINDABLE_SETUP_PRICE_GBP, reportPublicUrl, termMonthsFor, totalPaymentsFor } from './findableOffer.ts';
import { shortReportUrl } from './reportSlug.ts';
import { classifyLeadWebsite, type SiteSource } from './leadWebsiteKind.ts';
import { buildCallClose, type CallClose } from './callClose.ts';
import { callerFirstName, DEFAULT_CALLER_NAME } from './callerName.ts';

/* ── Tunables, named ──────────────────────────────────────────────────────────────────────────── */

/** An AI answer older than this is flagged as possibly out of date. AI answers move week to week;
 *  quoting a two-month-old answer as "earlier" would be misleading. Nothing is re-run — it is a flag. */
export const PLAYBOOK_AUDIT_STALE_DAYS = 30;
/** Competitors named in the spoken opening. Three names is a sentence; five is a list. */
export const OPENING_COMPETITORS = 3;
/** Competitors listed in the evidence box. */
export const EVIDENCE_COMPETITORS = 5;
/** The answer excerpt, cut at a sentence boundary. Long enough to read out, short enough to glance at. */
export const EXCERPT_CHARS = 320;
/** A previous message, trimmed for the follow-up box. The playbook is not a transcript. */
export const MESSAGE_SNIPPET_CHARS = 220;

const DAY_MS = 86_400_000;

/* ── Input shapes (narrow on purpose — a caller cannot pass a whole row and have a column matter) ─ */

export interface PlaybookLead {
  id: string;
  business_name: string | null;
  phone: string | null;
  website: string | null;
  category?: string | null;
  search_keyword?: string | null;
  search_location?: string | null;
  derived_town?: string | null;
  status?: string | null;
  contact_name?: string | null;
}

export interface PlaybookAudit {
  id: string;
  short_code: string | null;
  created_at: string | null;
  business_name?: string | null;
  business_type?: string | null;
  location_text?: string | null;
}

/** The subset of buildReportData's output the playbook reads. Structural, so AiAuditReportData fits. */
export interface PlaybookReport {
  hook?: {
    questionsTested: number;
    gap: { question: string; engineLabel: string; namedInstead: string[]; answerExcerpt: string } | null;
    tested: Array<{ question: string; perEngine: Array<{ label: string; named: boolean | null }> }>;
  } | null;
  questionBreakdown?: Array<{
    question: string;
    namedYou: boolean;
    rivals: string[];
    perEngine?: Array<{ label: string; ran: boolean; named: number | boolean; counted?: boolean }>;
  }>;
}

export interface PlaybookMessage {
  id: string;
  created_at: string;
  direction: 'inbound' | 'outbound';
  body: string | null;
  message_type?: string | null;
  template_name: string | null;
  status: string | null;
}

export interface PlaybookInput {
  lead: PlaybookLead;
  /** The audit resolveLeadReportAudit chose, or null when the lead has no usable report. */
  reportAudit: PlaybookAudit | null;
  /** buildReportData for that audit (null when it has no settled rows). */
  report: PlaybookReport | null;
  /** True when some audit for this lead is pending/running right now. */
  auditRunning?: boolean;
  /** Crawl sources in the order resolveFindingsSource wants them: audit-run crawls newest first. */
  runCrawls: FindingsSource[];
  leadCrawl: FindingsSource | null;
  messages: PlaybookMessage[];
  nowMs: number;
  /** Who is ringing: the signed-in person's display name (team_members). Absent means the book
   *  owner's name, which is what every script said before Sales used it (2026-09-28). */
  callerName?: string | null;
}

/* ── Output ───────────────────────────────────────────────────────────────────────────────────── */

export type CallMode = 'cold' | 'follow_up';

export interface PlaybookFinding {
  kind: FindingKind;
  title: string;
  /** What we saw, in plain English (siteFindings.ts's clause, as a sentence). */
  explanation: string;
  /** Why it may matter — hedged (siteFindings.ts's rest). */
  whyItMayMatter: string;
  /** The stored proof: verbatim URLs, counts, crawler names. Operator-facing. */
  proof: string[];
}

export interface PlaybookEvidence {
  /** gap = the business was NOT named in the answer shown; named = it was; none = no AI result. */
  kind: 'gap' | 'named' | 'none';
  question: string | null;
  engine: string | null;
  named: boolean | null;
  competitors: string[];
  excerpt: string | null;
  /** Why the excerpt is absent, when it is. */
  excerptNote: string | null;
  /** True when the stored run proved names are unsafe to print (run-level suppression). */
  competitorsNote: string | null;
}

export interface PlaybookFollowUp {
  sentCount: number;
  receivedCount: number;
  firstContactAt: string | null;
  lastOutbound: { at: string; text: string } | null;
  lastInbound: { at: string; text: string } | null;
  reportSentAt: string | null;
  continuation: string;
}

export interface ColdCallPlaybook {
  mode: CallMode;
  context: {
    business: string;
    trade: string | null;
    town: string | null;
    phone: string | null;
    website: string | null;
    auditDate: string | null;
    auditStale: boolean;
    crawlDate: string | null;
    crawlStale: boolean;
    whatsappStatus: string;
    leadStatus: string | null;
  };
  warnings: string[];
  /** Their own site, a directory / social profile, or none (leadWebsiteKind.ts, the voice note's rule). */
  site: { source: SiteSource; label: string | null };
  /** THE script Paul follows on the call (2026-09-27): opening, where it left off, the AI miss, the
   *  strongest finding, the Findable line and the next step as ONE read, one paragraph per beat. The
   *  structured pieces below (opening, explain, transition, offer) are what it is assembled from. */
  callScript: string[];
  /** The same facts written for LinkedIn and for email (2026-09-30). Copy-only; nothing sends. */
  messages: { linkedin: string; email: { subject: string; body: string } };
  opening: string[];
  evidence: PlaybookEvidence;
  findings: PlaybookFinding[];
  findingsNote: string | null;
  explain: string[];
  transition: string;
  offer: { lines: string[]; monthly: string; nextSteps: string[] };
  objections: Array<{ objection: string; answer: string }>;
  /** THE CALL FLOW (fix workstream 5, 2026-10-04): after the opening read (callScript), the questions worth
   *  asking, the close for the route that fits (callClose.ts) and the two calls that never reach the owner. */
  qualify: string[];
  close: CallClose;
  /** The fallback when they would rather see it first — a hint beside the script, not a line to read. */
  fallback: string;
  gatekeeper: string;
  voicemail: string;
  /** The AI check in one line for the top of the call screen: ready / running / none (never invented). */
  audit: { state: 'ready' | 'running' | 'none'; headline: string; finding: string | null };
  followUp: PlaybookFollowUp | null;
  reportUrl: string | null;
  reportNote: string | null;
  /** The audit the AI opportunity and the report come from (resolveLeadReportAudit). */
  auditId: string | null;
}

/* ── Small, pure helpers ──────────────────────────────────────────────────────────────────────── */

const clean = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();

/** The name said on the call: the first word of the person's display name, or the book owner's (callerName.ts,
 *  shared with the voice note). Re-exported for the callers that import it from here. */
export { callerFirstName, DEFAULT_CALLER_NAME };

/** "22 Sep 2026", London time — the day Paul would say out loud. */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function playbookDate(iso: string | number | null | undefined): string | null {
  if (iso === null || iso === undefined || iso === '') return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  /* Numeric parts in London time, month named here: ICU prints "Sept" for en-GB on some engines. */
  const parts = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'numeric', year: 'numeric', timeZone: 'Europe/London' }).formatToParts(d);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return get('day') + ' ' + MONTHS[get('month') - 1] + ' ' + get('year');
}

/** A past day said the way a person says it on the phone (Session A A-04: never the year for this week):
 *  "earlier today", "yesterday", "on Tuesday" within the week, "on 4 Oct" this year, "on 4 Oct 2025" before. */
export function spokenDay(iso: string | number | null | undefined, nowMs: number): string | null {
  if (iso === null || iso === undefined || iso === '') return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  const day = (ms: number) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/London' }).format(new Date(ms));
  const then = day(d.getTime());
  const today = day(nowMs);
  const daysAgo = Math.round((Date.parse(today + 'T12:00:00Z') - Date.parse(then + 'T12:00:00Z')) / DAY_MS);
  if (daysAgo <= 0) return 'earlier today';
  if (daysAgo === 1) return 'yesterday';
  if (daysAgo < 7) return 'on ' + new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'Europe/London' }).format(d);
  const full = playbookDate(d.getTime())!;
  return 'on ' + (then.slice(0, 4) === today.slice(0, 4) ? full.replace(/ \d{4}$/, '') : full);
}

/** "Who's this?" and its cousins — the reply that must be answered with a name before anything else. */
export const WHO_ASKED_RE = /\bwho(?:'s| is| are| r)? ?(?:this|that|you|u)\b|\bwho dis\b|\bwhos this\b|\bhow did you get (?:my|this) number\b|\bis this (?:a )?(?:scam|spam|sales)\b|\bdo i know you\b/i;

function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? '';
  return names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];
}

function trimToSentence(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const stop = Math.max(cut.lastIndexOf('. '), cut.lastIndexOf('! '), cut.lastIndexOf('? '));
  return stop > max * 0.5 ? cut.slice(0, stop + 1).trim() : cut.trim() + '…';
}

const sentence = (clause: string): string => {
  const c = clean(clause);
  return c ? c.charAt(0).toUpperCase() + c.slice(1) + (/[.!?]$/.test(c) ? '' : '.') : '';
};

/** The engine's answer, only if it is real prose — the SAME two refusals the report's hook card
 *  applies (a map card or markup junk is not a quote). */
export function usableExcerpt(raw: string | null | undefined): string | null {
  const t = clean(raw);
  if (!t || isJunkAnswer(t) || isMapCardAnswer(t)) return null;
  const out = trimToSentence(cleanAnswerText(t), EXCERPT_CHARS);
  return out || null;
}

/** Real names only: de-duplicated, never the business itself. The list arrives already cleaned by
 *  buildReportData (junk filter + run-level suppression); this only removes a self-match. */
export function playbookCompetitors(names: readonly string[] | null | undefined, business: string): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const raw of excludeSelfRivals(names ?? [], business, nameMatches)) {
    const n = clean(raw);
    const k = n.toLowerCase();
    if (!n || seen.has(k)) continue;
    seen.add(k);
    out.push(n);
  }
  return out;
}

/* ── The AI evidence ──────────────────────────────────────────────────────────────────────────── */

export function selectEvidence(report: PlaybookReport | null, business: string): PlaybookEvidence {
  const none: PlaybookEvidence = {
    kind: 'none', question: null, engine: null, named: null, competitors: [], excerpt: null,
    excerptNote: null, competitorsNote: null,
  };
  if (!report) return none;

  /* 1. The hook's gap — the exact answer the public report's evidence card prints. */
  const gap = report.hook?.gap;
  if (gap) {
    const excerpt = usableExcerpt(gap.answerExcerpt);
    const competitors = playbookCompetitors(gap.namedInstead, business).slice(0, EVIDENCE_COMPETITORS);
    return {
      kind: 'gap', question: clean(gap.question) || null, engine: gap.engineLabel || null, named: false,
      competitors, excerpt,
      excerptNote: excerpt ? null : (clean(gap.answerExcerpt) ? 'The stored answer was a map card or markup, not prose — not quotable.' : 'No answer text was stored for this question.'),
      competitorsNote: competitors.length ? null : 'No competitor names are safe to quote from this answer — do not name any.',
    };
  }

  /* 2. A hook that stopped because the business was named every time. */
  if (report.hook && report.hook.tested.length) {
    const t = report.hook.tested[0];
    const namedOn = t.perEngine.filter((e) => e.named === true).map((e) => e.label);
    return { ...none, kind: 'named', question: clean(t.question) || null, engine: namedOn.length ? joinNames(namedOn) : null, named: true };
  }

  /* 3. Any other audit shape: the report's own question breakdown. First a question they were NOT
        named on that has real rival names, then any question they were not named on. */
  const qs = report.questionBreakdown ?? [];
  const missed = qs.find((q) => !q.namedYou && playbookCompetitors(q.rivals, business).length > 0) ?? qs.find((q) => !q.namedYou);
  if (missed) {
    const engines = (missed.perEngine ?? []).filter((e) => e.ran && e.counted !== false).map((e) => e.label);
    const competitors = playbookCompetitors(missed.rivals, business).slice(0, EVIDENCE_COMPETITORS);
    return {
      kind: 'gap', question: clean(missed.question) || null, engine: engines.length ? joinNames(engines) : null, named: false,
      competitors, excerpt: null,
      excerptNote: 'This audit type does not keep a single answer to quote — the report has the full answers.',
      competitorsNote: competitors.length ? null : 'No competitor names are safe to quote from this answer — do not name any.',
    };
  }
  if (qs.length) {
    return { ...none, kind: 'named', question: clean(qs[0].question) || null, named: true };
  }
  return none;
}

/* ── Website findings ─────────────────────────────────────────────────────────────────────────── */

/** Short operator titles. Plain, and none of them claims a cause. */
const FINDING_TITLES: Record<FindingKind, string> = {
  sitemap_wrong_domain: 'Sitemap points at a different web address',
  canonical_off_domain: 'A main page names a different site as the real one',
  schema_wrong_domain: 'Business details in the code point at another address',
  noindex_important_page: 'A main page is marked "leave out of search"',
  crawler_blocked: 'AI search crawlers are being blocked',
  unreadable_homepage: 'Homepage is nearly empty when fetched directly',
  duplicate_pages: 'Several near-identical town/service pages',
  thin_pages: 'Service pages light on detail',
};

function proofFor(f: SiteFinding, signals: CrawlSignals, evidence: SiteEvidenceFinding[]): string[] {
  const ev = evidence.find((e) => e.kind === f.kind);
  if (ev) {
    const out: string[] = [];
    if (ev.evidence.subject) out.push('Site is on: ' + ev.evidence.subject);
    if (ev.pageUrl) out.push('Page: ' + ev.pageUrl);
    for (const o of ev.evidence.observed) out.push('Found: ' + o);
    if (ev.evidence.counted) out.push(ev.evidence.counted.matched + ' of ' + ev.evidence.counted.of + ' checked');
    if (ev.evidence.source) out.push('Read from: ' + ev.evidence.source);
    return out;
  }
  switch (f.kind) {
    case 'crawler_blocked':
      return ['Blocked on a real fetch: ' + signals.searchBlocked.join(', ')];
    case 'unreadable_homepage':
      return signals.clientRendered
        ? ['About ' + signals.clientRendered.visibleChars + ' characters of visible text on a direct fetch of ' + signals.homeUrl]
        : [];
    case 'duplicate_pages':
      return signals.duplicates
        ? [signals.duplicates.clusterSize + ' near-identical pages, about ' + signals.duplicates.similarityPct + '% the same']
        : [];
    case 'thin_pages': {
      const urls = signals.thinPageUrls ?? [];
      const words = new Map((signals.checkedPages ?? []).map((p) => [p.url, p.words]));
      const lines = urls.slice(0, 3).map((u) => (words.has(u) ? u + ' — ' + words.get(u) + ' words' : u));
      return lines.length ? lines : [signals.thinPages + ' page' + (signals.thinPages === 1 ? '' : 's') + ' flagged as thin'];
    }
    default:
      return [];
  }
}

/** host + path, no scheme, no www, no trailing slash — enough to tell "the homepage" apart. */
const pageKey = (u: string): string => clean(u).toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/[?#].*$/, '').replace(/\/+$/, '');

function isOnlyHomepage(urls: string[], homeUrl: string): boolean {
  const home = pageKey(homeUrl);
  return urls.length > 0 && !!home && urls.every((u) => pageKey(u) === home || !pageKey(u).includes('/'));
}

/** Why the findings list is what it is. Lets another surface (the Inbox AI visibility details) word
 *  the empty cases itself without parsing the playbook's operator note. */
export type FindingsStatus = 'findings' | 'no_website' | 'profile' | 'not_crawled' | 'crawl_stale' | 'unreadable' | 'clean';

export interface FindingsOutcome {
  status: FindingsStatus;
  findings: PlaybookFinding[];
  note: string | null;
  crawlAtMs: number | null;
  crawlStale: boolean;
}

/** @param max how many findings to return — the playbook's MAX_SITE_FINDINGS by default; the Inbox
 *        details ask for all of them and show the first few (2026-09-27). */
export function selectFindings(input: Pick<PlaybookInput, 'lead' | 'runCrawls' | 'leadCrawl' | 'nowMs'>, max: number = MAX_SITE_FINDINGS): FindingsOutcome {
  const hasWebsite = !!clean(input.lead.website);
  const all = [...input.runCrawls, ...(input.leadCrawl ? [input.leadCrawl] : [])].filter((s) => s.result);
  const newestMs = all.length ? Math.max(...all.map((s) => s.createdAtMs)) : null;
  const crawlStale = newestMs !== null && !(input.nowMs - newestMs < CRAWL_FRESH_MS);

  if (!hasWebsite) {
    return {
      status: 'no_website', findings: [], crawlAtMs: newestMs, crawlStale,
      /* ⛔ NO ABSOLUTE CLAIM (Session A A-05, M-009): "Google AI has not named a business without a website" was
         contradicted by a lead's own audit. Less to go on — never "never named". */
      note: 'No website on file, so there is nothing to crawl. Without a site of their own there is a lot less for AI to go on about what they do and where — that is the conversation to have. Never say AI cannot name a business without a website: it sometimes does.',
    };
  }
  /* ⛔ A PROFILE IS NOT THEIR WEBSITE (the voice note's rule, leadWebsiteKind.ts). A crawl of a TradeHQ
     page describes TradeHQ, so its findings are never offered as "your site". */
  const kind = classifyLeadWebsite(input.lead.website);
  if (kind.source === 'directory_profile' || kind.source === 'social_profile') {
    return {
      status: 'profile', findings: [], crawlAtMs: newestMs, crawlStale,
      note: 'No standalone business website found, only a ' + kind.label + ' profile. Never call it their website.',
    };
  }
  const found = resolveFindingsSource(true, input.runCrawls, input.leadCrawl);
  if (found) {
    const findings = found.candidates.slice(0, max).map((f) => {
      /* ⛔ THE THIN PAGE IS SOMETIMES THE HOMEPAGE. siteFindings.ts says "one of the service pages";
         read aloud on a call next to proof that is the homepage URL, that is a false statement to
         the owner (The Royal Locksmiths, 2026-09-23: the only thin page was the homepage). Said as
         the homepage when every thin URL is the homepage; the WhatsApp copy is left as it is. */
      if (f.kind === 'thin_pages' && isOnlyHomepage(found.signals.thinPageUrls ?? [], found.signals.homeUrl)) {
        return {
          kind: f.kind,
          title: 'Homepage light on detail',
          explanation: 'Your homepage is really light on detail.',
          whyItMayMatter: 'It says what you do, but there may not be much useful information there for AI to work with when somebody asks a more specific question.',
          proof: proofFor(f, found.signals, found.evidence),
        };
      }
      return {
        kind: f.kind,
        title: FINDING_TITLES[f.kind],
        explanation: sentence(f.clause),
        whyItMayMatter: clean(f.rest),
        proof: proofFor(f, found.signals, found.evidence),
      };
    });
    return { status: 'findings', findings, note: null, crawlAtMs: found.source.createdAtMs, crawlStale: false };
  }
  if (newestMs === null) {
    return { status: 'not_crawled', findings: [], crawlAtMs: null, crawlStale: false, note: 'Nobody has checked this website yet, so there are no website points to mention. Keep the call to the AI result.' };
  }
  if (crawlStale) {
    return { status: 'crawl_stale', findings: [], crawlAtMs: newestMs, crawlStale, note: 'The newest crawl is more than 30 days old, so its findings are not used — the site may have changed.' };
  }
  const usable = all.map((s) => usableCrawlSignals(s.result, s.createdAtMs)).find((s) => !!s);
  if (usable?.fetchFailed) {
    return { status: 'unreadable', findings: [], crawlAtMs: newestMs, crawlStale, note: 'The crawl could not read the site at all, so there is nothing reliable to say about it.' };
  }
  return { status: 'clean', findings: [], crawlAtMs: newestMs, crawlStale, note: 'The crawl found no strong website issues. Do not lead with the website on this call.' };
}

/* ── WhatsApp history ─────────────────────────────────────────────────────────────────────────── */

function messageText(m: PlaybookMessage, business: string): string {
  if (m.message_type && !['text', 'template'].includes(m.message_type)) return '[' + m.message_type + ']';
  const text = m.template_name
    ? readableTemplateBody(m.body, m.template_name, { businessName: business, sentAt: m.created_at })
    : clean(m.body);
  const t = clean(text) || (m.template_name ? '[' + m.template_name + ']' : '');
  return t.length > MESSAGE_SNIPPET_CHARS ? t.slice(0, MESSAGE_SNIPPET_CHARS).trimEnd() + '…' : t;
}

export function summariseConversation(messages: PlaybookMessage[], business: string): { mode: CallMode; status: string; followUp: PlaybookFollowUp | null } {
  const sorted = [...messages].sort((a, b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id));
  const sent = sorted.filter((m) => m.direction === 'outbound' && isRealSend(m.status));
  const failed = sorted.filter((m) => m.direction === 'outbound' && !isRealSend(m.status));
  const received = sorted.filter((m) => m.direction === 'inbound');
  if (!sent.length && !received.length) {
    return {
      mode: 'cold', followUp: null,
      status: failed.length ? 'WhatsApp attempted but never delivered — treat as a first contact' : 'No WhatsApp contact yet',
    };
  }
  const lastOut = sent[sent.length - 1] ?? null;
  const lastIn = received[received.length - 1] ?? null;
  const reportSent = [...sent].reverse().find((m) => !!m.template_name && REPORT_LINK_TEMPLATES.has(m.template_name)) ?? null;
  const last = sorted.filter((m) => m.direction === 'inbound' || isRealSend(m.status)).pop()!;

  let continuation: string;
  if (last.direction === 'inbound') {
    continuation = 'They replied last — pick up from what they said rather than starting the pitch again.';
  } else if (reportSent && !lastIn) {
    continuation = 'The report went out and they have not replied — ask whether they had a chance to look at it.';
  } else if (lastIn) {
    continuation = 'You messaged after their last reply and have not heard back — refer to that message, briefly.';
  } else {
    continuation = 'They have not replied yet — this is a warm follow-up to your WhatsApp, not a first contact.';
  }

  const parts = ['Messaged ' + (playbookDate(sent[0]?.created_at ?? null) ?? '?') + ' (' + sent.length + ' sent)'];
  if (lastIn) parts.push('replied ' + playbookDate(lastIn.created_at));
  else parts.push('no reply yet');
  return {
    mode: 'follow_up',
    status: parts.join(' · '),
    followUp: {
      sentCount: sent.length,
      receivedCount: received.length,
      firstContactAt: (sent[0] ?? received[0]).created_at,
      lastOutbound: lastOut ? { at: lastOut.created_at, text: messageText(lastOut, business) } : null,
      lastInbound: lastIn ? { at: lastIn.created_at, text: messageText(lastIn, business) } : null,
      reportSentAt: reportSent?.created_at ?? null,
      continuation,
    },
  };
}

/* ── Assembly ─────────────────────────────────────────────────────────────────────────────────── */

function tradePlural(audit: PlaybookAudit | null, lead: PlaybookLead): string | null {
  for (const raw of [audit?.business_type, lead.category, lead.search_keyword]) {
    const r = pluraliseTrade(raw);
    if (r.ok) return r.value;
  }
  return null;
}

/** "a plumber" — the trade the way a person says it (templateVars' vocabulary, the voice note's). */
function tradeSpoken(audit: PlaybookAudit | null, lead: PlaybookLead): string | null {
  for (const raw of [audit?.business_type, lead.category, lead.search_keyword]) {
    const r = articleTrade(raw);
    if (r.ok) return r.value;
  }
  return null;
}

/** The engine as it is said out loud. The report labels Gemini "Gemini"; the product says Google AI
 *  (HOOK_ENGINE_LABELS), and so does every script. */
export function spokenEngine(label: string | null | undefined): string {
  let l = clean(label);
  if (!l) return 'AI';
  for (const [key, said] of Object.entries(HOOK_ENGINE_LABELS)) l = l.replace(new RegExp('\\b' + key + '\\b', 'gi'), said);
  return l;
}

/** A town said aloud: the audit's "Rugby UK" disambiguation is for the engines, not for a person. */
const spokenTown = (town: string | null): string | null => {
  const t = clean(town).replace(/,?\s*\b(?:UK|United Kingdom)$/i, '').trim();
  return t || null;
};

/* 🔴 THE HOUSE STYLE (Paul, 2026-09-30; src/lib/salesStyle.ts). The call sounds like someone who asked
   AI for the trade in the town, saw who it named, looked at the site and is just saying so:
     "I'm ringing because I asked Google AI for a plumber in Rugby and it named A, B and C, but not you.
      I had a look at your website and one thing stood out: …. We specialise in AI visibility …"
   ⛔ No "Have you got a minute?" before the reason for ringing, no "How are you today?" — the reason
      IS the opener, and the rep asks for the time once they have said why.
   ⛔ The search is said plainly ("a plumber in Rugby"), never the audit query's qualifiers.
   The objections are short, spoken answers built from the same facts and the canonical offer; no
   guarantee, discount or number that findableOffer.ts does not hold. */
/** THE AI CHECK IN ONE LINE — the call card's headline and website finding, from the stored evidence
 *  only. ONE copy: the call screen (buildColdCallPlaybook) and the "Check before calling" results panel
 *  (fix/07) both read it, so a bulk result can never say something the call screen does not. */
/** The finding for a complete six-result check that named the business in every answer (Paul,
 *  2026-10-04): a FACT shown to the rep — never a status change. The lead keeps its status. */
export const STRONG_VISIBILITY_HEADLINE = `Strong AI visibility — named in all ${HOOK_SCORE_RESULTS} answers`;

/** True when the stored hook result has every one of its HOOK_SCORE_RESULTS answers present and
 *  naming the business. An unanswered cell, a missing engine or fewer answers is never "all". */
export function namedInEveryHookAnswer(report: PlaybookReport | null | undefined): boolean {
  const cells = (report?.hook?.tested ?? []).flatMap((t) => t.perEngine ?? []);
  return cells.length === HOOK_SCORE_RESULTS && cells.every((c) => c.named === true);
}

export function callCardAudit(input: Pick<PlaybookInput, 'lead' | 'reportAudit' | 'report' | 'auditRunning' | 'runCrawls' | 'leadCrawl' | 'nowMs'>): ColdCallPlaybook['audit'] {
  const business = clean(input.reportAudit?.business_name) || clean(input.lead.business_name) || 'this business';
  const evidence = selectEvidence(input.report, business);
  const f = selectFindings(input);
  const siteKind = classifyLeadWebsite(input.lead.website);
  const engine = spokenEngine(evidence.engine);
  const top = evidence.competitors.slice(0, OPENING_COMPETITORS);
  const lead0 = f.findings[0] ?? null;
  return evidence.kind === 'none'
    ? { state: input.auditRunning ? 'running' : 'none', headline: input.auditRunning ? 'AI check running — the result is not in yet' : 'No audit yet', finding: lead0 ? lead0.title : null }
    : {
      state: 'ready',
      headline: evidence.kind === 'gap'
        ? engine + ' did not name them' + (top.length ? ' — it named ' + joinNames(top) : '')
        : namedInEveryHookAnswer(input.report) ? STRONG_VISIBILITY_HEADLINE
        : engine + ' named them',
      finding: lead0 ? lead0.title : siteKind.source === 'none' ? 'No website on file' : siteKind.source === 'own_site' ? null : 'Only a ' + siteKind.label + ' profile, no site of their own',
    };
}

export function buildColdCallPlaybook(input: PlaybookInput): ColdCallPlaybook {
  const { lead, reportAudit, report, nowMs } = input;
  const business = clean(reportAudit?.business_name) || clean(lead.business_name) || 'this business';
  const town = clean(reportAudit?.location_text) || clean(lead.derived_town) || clean(lead.search_location) || null;
  const trade = tradePlural(reportAudit, lead);
  const callName = displayBusinessName(business, { town, style: 'identify' }) || business;
  const caller = callerFirstName(input.callerName);
  const place = spokenTown(town);
  const oneOf = tradeSpoken(reportAudit, lead);
  /** "a plumber in Rugby" — what was asked for, said the way a person says it. */
  const searchFor = oneOf ? oneOf + (place ? ' in ' + place : '') : place ? 'businesses like yours in ' + place : 'businesses like yours';

  const evidence = selectEvidence(report, business);
  const f = selectFindings(input);
  const siteKind = classifyLeadWebsite(lead.website);
  const convo = summariseConversation(input.messages, business);
  const engine = spokenEngine(evidence.engine);

  const auditMs = reportAudit?.created_at ? new Date(reportAudit.created_at).getTime() : null;
  const auditStale = auditMs !== null && nowMs - auditMs > PLAYBOOK_AUDIT_STALE_DAYS * DAY_MS;
  const auditDate = playbookDate(reportAudit?.created_at ?? null);

  const warnings: string[] = [];
  if (auditStale) warnings.push('The AI result is from ' + auditDate + ' — more than ' + PLAYBOOK_AUDIT_STALE_DAYS + ' days old. Say "when I checked", not "earlier", or re-run the audit before calling.');
  if (evidence.kind === 'none') warnings.push(input.auditRunning ? 'An audit is still running for this lead — its result is not in yet.' : 'No AI result is stored for this lead. The opening below does not claim one. Run the AI check first if you can (about a minute), or ring anyway: the script works without it.');
  if (f.crawlStale && !f.findings.length) warnings.push('The website crawl is more than 30 days old.');

  const top = evidence.competitors.slice(0, OPENING_COMPETITORS);
  /* "I asked Google AI for a plumber in Rugby" — or, for an old result, "When I checked, …". */
  const asked = auditStale ? 'When I checked, I asked ' + engine + ' for ' + searchFor : 'I asked ' + engine + ' for ' + searchFor;
  const missLine = top.length
    ? asked + ' and it named ' + joinNames(top) + ', but not you.'
    : asked + ' and your business didn\'t come up in the answer it gave.';
  const namedLine = asked + ' and it did name you, which is good.';
  /** Carry on a sentence with a line: its first letter lower-cased, but never the pronoun "I". */
  const joinOn = (line: string) => (/^I\b/.test(line) ? line : line.charAt(0).toLowerCase() + line.slice(1));

  /* The website, in one or two plain sentences: the strongest finding's own words (siteFindings.ts,
     already hedged), a profile page, or no site at all. Nothing when there is nothing strong. */
  const lead0 = f.findings[0] ?? null;
  const lowerClause = (s: string) => s.charAt(0).toLowerCase() + s.slice(1).replace(/\.$/, '');
  /* Two lines for a finding — what I saw, then why it matters — so it is said with a breath between.
     🔴 "I had a look at why you weren't coming up" (Paul, 2026-09-30) is used only after a MISS, and what
     was found only "could be holding you back": never "that's why", never a proven cause. "Something"
     for one finding, "a few things" only when there is more than one. */
  const missed = evidence.kind === 'gap';
  const lookedWhy = 'I had a look at why you weren\'t coming up';
  const foundWhat = f.findings.length > 1 ? 'a few things' : 'something';
  const siteLines: string[] = siteKind.source === 'directory_profile' || siteKind.source === 'social_profile'
    ? [(missed ? lookedWhy + ', and I could only find your ' : 'I also looked for your website and could only find your ') + siteKind.label + ' profile, not a site of your own. Without one there\'s a lot less for AI to go on about what you do and where.']
    : siteKind.source === 'none'
      ? [(missed ? lookedWhy + ', and I couldn\'t find a website for you.' : 'I also couldn\'t find a website for you.') + ' Without one it\'s much harder for AI to know what you do and where.']
      : lead0
        ? [(missed
          ? lookedWhy + ' and found ' + foundWhat + ' that could be holding you back. ' + (f.findings.length > 1 ? 'The main one is that ' : 'It\'s that ') + lowerClause(lead0.explanation) + '.'
          : 'I had a look at your website and one thing stood out: ' + lowerClause(lead0.explanation) + '.'), lead0.whyItMayMatter].filter(Boolean)
        : [];

  /* ── B. the opening (the first beats, also what the tests read) ── */
  const opening: string[] = [];
  if (convo.mode === 'cold') {
    opening.push('Hi, is that ' + callName + '? It\'s ' + caller + ' from Findable.');
    if (evidence.kind === 'gap') opening.push('I\'m ringing because ' + joinOn(missLine));
    else if (evidence.kind === 'named') opening.push('I\'m ringing because ' + joinOn(namedLine));
    else opening.push('I\'m ringing because we check what AI tools like ChatGPT and Google AI say when someone asks for ' + searchFor + ', and I wanted to see how you come up.');
  } else {
    /* ⛔ WHO IS CALLING COMES FIRST (Session A A-04, M-009): the name and Findable before anything else, and
       after a "who's this?" the reply is answered as such. "Quick recap" only when a pitch actually went out
       (a report-carrying message); otherwise the reason for ringing, as on a first call. Days are said the
       way a person says them — never the year for this week. */
    const fu = convo.followUp!;
    const repliedLast = !!fu.lastInbound && fu.lastInbound.at >= (fu.lastOutbound?.at ?? '');
    const whoAsked = repliedLast && WHO_ASKED_RE.test(fu.lastInbound?.text ?? '');
    const when = spokenDay(fu.lastOutbound?.at ?? fu.firstContactAt, nowMs);
    if (whoAsked) {
      opening.push('Hi, is that ' + callName + '? It\'s ' + caller + ' from Findable. You asked who I was when I messaged' + (when ? ' ' + when : '') + ', so I thought I\'d ring and explain.');
      opening.push('We help local businesses get named when people ask AI tools like ChatGPT and Google AI for ' + searchFor + '.');
    } else {
      opening.push('Hi, is that ' + callName + '? It\'s ' + caller + ' from Findable, I messaged you on WhatsApp' + (when ? ' ' + when : '') + '.');
      opening.push(repliedLast
        ? 'Thanks for getting back to me. It\'s easier to explain on the phone.'
        : fu.reportSentAt
          ? 'I sent you the report on what AI says when someone asks for ' + searchFor + ', so I thought I\'d talk you through it.'
          : 'I thought it\'d be quicker to explain on the phone.');
    }
    if (evidence.kind === 'gap') opening.push((fu.reportSentAt ? 'Quick recap: ' : 'I\'m ringing because ') + joinOn(missLine));
    else if (evidence.kind === 'named' && !whoAsked) opening.push('I\'m ringing because ' + joinOn(namedLine));
  }

  /* ── E. how to explain it (plain, short; the "what is AI visibility" answer reads from here) ── */
  const explain: string[] = [];
  if (evidence.kind === 'gap') {
    explain.push('When someone asks ChatGPT or Google AI for ' + searchFor + ', they get a few names, not ten links. For the search I did, you weren\'t one of them' + (top.length ? '. ' + joinNames(top) + ' were.' : '.'));
  } else if (evidence.kind === 'named') {
    explain.push('When someone asks ChatGPT or Google AI for ' + searchFor + ', they get a few names, not ten links. You were one of them for the search I did. The aim is to keep it that way across more of the searches people make.');
  }
  if (lead0) {
    explain.push('The main thing I noticed on your site is ' + lowerClause(lead0.explanation) + '. ' + lead0.whyItMayMatter + ' It could be contributing, it\'s not the only thing AI looks at.');
  }
  if (!explain.length) explain.push('Keep it simple: we look at what AI tools say when people ask for ' + searchFor + ', and we measure it before and after any work.');

  /* ── F. transition: who we are, in one breath ── */
  const transition = 'We specialise in AI visibility for local businesses. We fix this sort of thing, then ask AI the same searches again afterwards so you can see whether it\'s worked.';

  /* ── G. offer / next step ── */
  const reportUrl = reportAudit
    ? (reportAudit.short_code ? shortReportUrl(reportAudit.short_code) : reportPublicUrl(reportAudit.id))
    : null;
  const nextSteps: string[] = [];
  nextSteps.push(reportUrl ? 'Offer to send the report (link below) — send it yourself from the Inbox.' : 'No shareable report yet — offer to run the check and send it over.');
  if (f.findings.length) nextSteps.push('Walk them through the website finding — they can check it on their own phone.');
  nextSteps.push('Book a follow-up call once they have looked at it.');
  /* ⛔ THE DOMAIN RULE (Paul, 2026-09-28): an agency MANAGING the site is usually fine; one OWNING or
     controlling the domain blocks a new site until the client gets control. Never promise a rebuild or
     a switch-over before that, and never give legal advice about their agency agreement. */
  if (clean(lead.website)) nextSteps.push('If they can\'t get into their site, ask who owns and controls the domain before offering a new site. ' + SALES_DOMAIN_LINE + ' If an agency owns it, or they don\'t know, flag it to Paul and promise nothing.');
  else nextSteps.push('They have no website on file — talk about getting one built (they register the domain in their own business name).');
  const build = totalPaymentsFor('build');
  const optimise = totalPaymentsFor('optimise');
  const offer = {
    lines: [
      FINDABLE_OFFER_SUMMARY,
      FINDABLE_GUARANTEE,
    ],
    /* Paul's two routes (findableOffer.ts, 2026-09-29) — the build terms apply only to a site we build. */
    monthly: 'If we build the site (Findable Build): we build, host and manage it for the ' + termMonthsFor('build') + " months, and once the term is complete and paid, it's theirs; nothing is charged after the " + build + 'th payment. If they keep their own site (Findable Optimise): it stays theirs, and nothing is charged after the ' + optimise + 'th payment. The sign-up £' + FINDABLE_SETUP_PRICE_GBP + ' is the first payment either way.',
    nextSteps,
  };

  /* ── THE CLOSE (callClose.ts): the route that fits this lead first, the guarantee, the close line. ── */
  const close = buildCallClose(siteKind.source);

  /* ── H. objections: short, spoken, true. Every figure is a findableOffer.ts constant. ── */
  const findingShort = lead0 ? lowerClause(lead0.explanation) : null;
  const objections = [
    {
      objection: 'What exactly do you do?',
      answer: 'We make it more likely AI names you when someone asks for ' + searchFor + '. We check what it says now, fix what\'s on your site and the places AI reads, then ask the same searches again afterwards so you can see the difference.',
    },
    {
      objection: 'I don\'t really understand AI visibility',
      answer: 'It\'s simple really. When someone asks ChatGPT or Google AI for ' + searchFor + ', it names a few businesses. AI visibility is whether you\'re one of them.'
        + (evidence.kind === 'gap' ? ' For the search I did, you weren\'t.' : evidence.kind === 'named' ? ' For the search I did, you were.' : ''),
    },
    {
      objection: 'We already have an SEO company',
      answer: 'That\'s fine, I\'m not trying to replace them. This is one specific thing: what AI says when someone asks for ' + searchFor + '. I can send over what I found so they can look at it too.',
    },
    {
      objection: 'I already have a website guy',
      answer: 'That\'s fine. This is one specific thing, what AI says when someone asks for ' + searchFor + '. I can send your web person exactly what I found.',
    },
    {
      /* ⛔ Never legal advice, never "break your contract", never a promise to take over a domain. */
      objection: 'My agency controls the website / domain',
      answer: SALES_DOMAIN_LINE + ' Your agreement with them is yours to check. I can\'t advise on that, and we would never ask you to break it.',
    },
    {
      objection: 'My website is fine',
      answer: siteKind.source === 'directory_profile' || siteKind.source === 'social_profile'
        ? 'The only page I could find for you is your ' + siteKind.label + ' profile, not a site of your own. That page belongs to ' + siteKind.label + ', so there\'s a lot less for AI to go on about what you do and where.'
        : findingShort
          ? 'It may look fine to customers. This is about how clearly it reads to AI. For example, ' + findingShort + '. I can show you where, and you can check it yourself.'
          : 'It may well be. This is about what AI said when I asked, which is separate from how the site looks.',
    },
    {
      objection: 'I don\'t want a new website',
      answer: siteKind.source === 'own_site'
        ? 'That\'s fine, you don\'t need one. If you can give us access, we can usually work on the site you\'ve already got. I\'d just check what it\'s built on first. That\'s Findable Optimise.'
        : 'That\'s fine. It\'s your call. Without a site of your own, though, AI has a lot less to go on, so that\'s the part I\'d talk to you about.',
    },
    {
      objection: 'I already rank on Google',
      answer: 'That\'s good, and it\'s a different thing. When someone asks ChatGPT or Google AI instead of scrolling Google, they get a few names' + (evidence.kind === 'gap' ? ', and for the search I did, you weren\'t one of them.' : '.'),
    },
    {
      objection: 'Nobody uses AI for this',
      answer: 'More people are starting to, but I can\'t tell you how many of your customers do. That\'s why we measure it. You see the before and after on the same searches rather than taking my word for it.',
    },
    {
      objection: 'We\'re busy enough',
      answer: 'Fair enough, that\'s a good place to be. Can I send you the report on WhatsApp so you\'ve got it for when it suits?',
    },
    {
      objection: 'I\'m too busy',
      answer: 'No problem. Can I send you the report on WhatsApp and ring you back when it suits? What time\'s better?',
    },
    {
      objection: 'How do you know this works?',
      /* ⛔ The measurement and the refund, stated plainly — no hedge beside the guarantee (CLAUDE.md §1). */
      answer: 'You don\'t have to take my word for it. We measure how often AI names you before we start, then ask the same searches again after four weeks. If that number hasn\'t gone up, you email us within 14 days of your results and get your £' + FINDABLE_SETUP_PRICE_GBP + ' back.',
    },
    {
      objection: 'Can you guarantee I\'ll appear?',
      /* ⛔ THE MASTER PLAN'S WORDING (M-009, 2026-10-04): "What I guarantee is the measurement" confused people
         (the measurement is not what is guaranteed). Nobody can promise a placement; what IS promised is the
         number going up or the £99 back — said plainly, with no hedge after it. */
      answer: "Nobody can promise AI will name you, and I won't. What I can promise: we measure how often AI names you before we start and again after four weeks on the same questions. If that number hasn't gone up, you email us within 14 days of your results and get your £" + FINDABLE_SETUP_PRICE_GBP + ' back.',
    },
    {
      objection: 'How much is it?',
      /* ⛔ STARTS WITH THE CANONICAL SENTENCE (scripts/findable-offer-terms.test.ts), so the price said on
         a call can never drift from the checkout. The tail is only what a caller asks next. */
      answer: FINDABLE_OFFER_SUMMARY + ' If we build it, the site\'s yours at the end. Nothing\'s charged after the last payment.',
    },
    {
      objection: 'Why is it monthly?',
      /* ⛔ The agreed monthly wording (Paul, 2026-10-02): never "the monthly keeps you there" (an outcome). */
      answer: 'The £' + FINDABLE_SETUP_PRICE_GBP + ' covers the first measurement and getting started. ' + close.monthly + ' The four-week check is the first one, not the end.',
    },
    {
      objection: 'Why twelve months?',
      answer: 'Twelve is when we build you a new site (Findable Build). We build it, host it and look after it. Once the ' + build + ' payments are done, the site\'s yours and nothing more is charged.',
    },
    {
      objection: 'Why six months?',
      answer: 'Six is when you keep your own website (Findable Optimise). It stays yours and we work on it. That\'s ' + optimise + ' payments including the first, then it stops.',
    },
    {
      objection: 'That\'s a lot / £' + FINDABLE_SETUP_PRICE_GBP + '?',
      answer: 'I get that. If the number hasn\'t gone up at four weeks, you get the £' + FINDABLE_SETUP_PRICE_GBP + ' back. ' + close.monthly,
    },
    {
      objection: 'I need to think about it',
      answer: 'Of course. Can I send you the report on WhatsApp so you\'ve got it in front of you? When\'s good for a quick ring back, tomorrow?',
    },
    {
      objection: 'Who are you? Is this a scam?',
      answer: 'Fair question. I\'m ' + caller + ' from Findable. We help local businesses get named when people ask AI tools for ' + searchFor + '. You don\'t pay anything unless you decide to go ahead, and you can look us up at findable.live first.',
    },
    {
      objection: 'Can I cancel?',
      /* ⛔ The minimum term is said BEFORE payment (Session A objection audit), from the constants. */
      answer: 'It\'s a minimum term, so it\'s ' + build + ' payments if we build the site and ' + optimise + ' if we work on yours, the £' + FINDABLE_SETUP_PRICE_GBP + ' today included. After the last payment nothing more is charged. And if the number hasn\'t gone up at four weeks, a valid claim gets your £' + FINDABLE_SETUP_PRICE_GBP + ' back and stops the monthly too.',
    },
    {
      objection: 'How long does it take?',
      answer: 'We start once you\'ve paid. We measure where you are first, then do the work, and check the same questions again at four weeks. Paul keeps you posted along the way.',
    },
    {
      objection: 'Just send me the information',
      answer: reportUrl
        ? 'Sure, I\'ll WhatsApp you the report. It shows the exact search, what AI said and who it named. Can I give you a quick ring once you\'ve had a look?'
        : 'Sure, I\'ll run the check and send it over. Can I give you a quick ring once you\'ve had a look?',
    },
  ];

  /* ── THE CALL SCRIPT: one read, built from the pieces above, nothing repeated ── */
  const callScript: string[] = [...opening];
  callScript.push(...siteLines);
  /* Plain words, not "AI visibility" (Session A: jargon to a plumber). After a "who's this?" the line
     saying what we do has already been said, so only the ask remains. */
  const whatWeDo = 'We help local businesses get named when people ask AI for ' + searchFor + '.';
  const alreadySaid = opening.some((l) => l.startsWith('We help local businesses'));
  const withWhat = (s: string) => (alreadySaid ? '' : whatWeDo + ' ') + s;
  callScript.push(evidence.kind === 'none'
    ? withWhat('I can run a quick check on what AI says about you and send it over. Is now OK for a couple of minutes, or shall I ring you back?')
    : evidence.kind === 'named'
      ? withWhat('I wanted to run something by you about keeping it that way. Is now OK for a couple of minutes, or shall I ring you back?')
      : withWhat('I can explain what I\'d do to make you more likely to be one of the names. Is now OK for a couple of minutes, or shall I ring you back?'));
  const fallback = reportUrl
    ? 'If they\'d rather see it first: "I\'ll WhatsApp you the report. It shows the exact search, what AI said and who it named." Then set a Call for when they\'ve looked.'
    : 'If they\'d rather see it first: "I\'ll run the check properly and send it over on WhatsApp." Then set a Call for when they\'ve looked.';

  /* ── THE QUESTIONS WORTH ASKING (short; each one changes what happens next) ── */
  const qualify: string[] = [
    siteKind.source === 'own_site'
      ? 'Do you look after the website yourself, or does someone else?'
      : siteKind.source === 'none'
        ? 'Have you got a website I missed, or is it something you\'ve not got round to?'
        : 'Is your ' + siteKind.label + ' page mainly what you use, or have you got a site of your own?',
    'Where does most of your work come from at the moment? Word of mouth, Google, directories?',
    'Which jobs would you most like more of?',
    'Which towns do you cover?',
    'Are you the one who decides on something like this?',
  ];

  /* ── THE CALLS THAT NEVER REACH THE OWNER (Session A: none existed) ── */
  const gatekeeper = 'Is the owner about? It\'s ' + caller + ' from Findable. It\'s about how the business comes up when people ask AI for ' + searchFor + '. When\'s best to catch them?';
  const voicemail = evidence.kind === 'gap'
    ? 'Hi, it\'s ' + caller + ' from Findable. I asked ' + engine + ' for ' + searchFor + ' and wanted to tell you what it said about you. I\'ll send it over on WhatsApp, or ring me back on this number.'
    : 'Hi, it\'s ' + caller + ' from Findable. I wanted a quick word about how you come up when people ask AI for ' + searchFor + '. I\'ll try you again, or drop me a WhatsApp on this number.';

  /* ── THE AI CHECK IN ONE LINE (top of the call screen) — what is stored, or that nothing is ── */
  const audit = callCardAudit(input);

  /* ── LINKEDIN AND EMAIL (Paul, 2026-09-30): the SAME facts as the call — the engine, the search said
     plainly, that result's own competitors, the strongest finding in its own hedged words — written
     for the channel. No second prompt, no second fact source, so they cannot drift from the call.
     LinkedIn: very short, no link, a question at the end. Email: a little longer, the report link when
     there is one, plain sign-off. Neither says the business's own name back to them. */
  /* The contact's own first name when the lead has one; otherwise a plain "Hi," — never a guess. */
  const nameWord = clean(lead.contact_name).split(/\s+/)[0] ?? '';
  const firstName = /^[A-Za-z][A-Za-z'-]*$/.test(nameWord) ? nameWord : '';
  const hi = firstName ? 'Hi ' + firstName + ',' : 'Hi,';
  const lookedShort = siteKind.source === 'directory_profile' || siteKind.source === 'social_profile'
    ? 'I had a look at why and could only find your ' + siteKind.label + ' profile, not a website of your own.'
    : siteKind.source === 'none'
      ? 'I had a look at why and couldn\'t find a website for you.'
      : lead0 ? 'I had a look at why and found ' + foundWhat + ' on your website that could be holding you back.' : null;
  const linkedin = evidence.kind === 'gap'
    ? [hi, missLine, lookedShort, 'We specialise in AI visibility. Happy to explain what I\'d do if it\'s useful?'].filter(Boolean).join(' ')
    : evidence.kind === 'named'
      ? [hi, namedLine, 'We specialise in AI visibility. Happy to explain how to keep it that way if it\'s useful?'].join(' ')
      : [hi, 'we check what ChatGPT and Google AI say when someone asks for ' + searchFor + '. Happy to run it for you and send over what it says?'].join(' ');
  const emailParas: string[] = [hi];
  if (evidence.kind === 'gap') {
    emailParas.push(missLine);
    if (siteLines.length) emailParas.push(siteLines.join(' '));
    emailParas.push('We specialise in AI visibility for local businesses.' + (reportUrl ? ' The report shows the exact search, what AI said and who it named: ' + reportUrl : ''));
    emailParas.push('Happy to explain what I\'d do to make you more likely to be the one AI recommends. Is it worth a quick call?');
  } else if (evidence.kind === 'named') {
    emailParas.push(namedLine);
    if (siteLines.length) emailParas.push(siteLines.join(' '));
    emailParas.push('We specialise in AI visibility for local businesses, and I\'d be happy to explain how to keep it that way. Is it worth a quick call?');
  } else {
    emailParas.push('We check what AI tools like ChatGPT and Google AI say when someone asks for ' + searchFor + ', and which businesses they name.');
    if (siteLines.length) emailParas.push(siteLines.join(' '));
    emailParas.push('Happy to run the check for you and send over what it says. Would that be useful?');
  }
  emailParas.push(caller + '\nFindable');
  const email = {
    subject: evidence.kind === 'none' ? 'What AI says when someone asks for ' + searchFor : 'Asked ' + engine + ' for ' + searchFor,
    body: emailParas.join('\n\n'),
  };

  return {
    site: { source: siteKind.source, label: siteKind.label },
    callScript,
    messages: { linkedin, email },
    mode: convo.mode,
    context: {
      business,
      trade,
      town,
      phone: clean(lead.phone) || null,
      website: clean(lead.website) || null,
      auditDate,
      auditStale,
      crawlDate: f.crawlAtMs !== null ? playbookDate(f.crawlAtMs) : null,
      crawlStale: f.crawlStale,
      whatsappStatus: convo.status,
      leadStatus: lead.status ?? null,
    },
    warnings,
    opening,
    evidence,
    findings: f.findings,
    findingsNote: f.note,
    explain,
    transition,
    offer,
    objections,
    qualify,
    close,
    fallback,
    gatekeeper,
    voicemail,
    audit,
    followUp: convo.followUp,
    reportUrl,
    auditId: reportAudit?.id ?? null,
    reportNote: reportUrl ? null : (input.auditRunning ? 'The audit is still running — no report link yet.' : 'No usable public report for this lead.'),
  };
}
