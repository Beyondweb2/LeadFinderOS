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

   🔴 THE OFFER IS READ FROM findableOffer.ts, NEVER TYPED HERE: FINDABLE_OFFER_SUMMARY (£99 to start,
      then £99 a month, 12-month minimum — Paul, 2026-09-23) and FINDABLE_GUARANTEE. Until that date
      the sources disagreed and the playbook said "check current offer"; they are one source now.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { CRAWL_FRESH_MS, usableCrawlSignals, type CrawlSignals } from './crawlCheck.ts';
import { resolveFindingsSource, MAX_SITE_FINDINGS, type FindingKind, type FindingsSource, type SiteFinding } from './siteFindings.ts';
import type { SiteEvidenceFinding } from './siteEvidence.ts';
import { cleanAnswerText, isJunkAnswer, isMapCardAnswer } from './answerText.ts';
import { excludeSelfRivals } from './rivalHook.ts';
import { nameMatches } from './nameMatch.ts';
import { displayBusinessName } from './displayName.ts';
import { pluraliseTrade } from './templateVars.ts';
import { isRealSend } from './realSend.ts';
import { REPORT_LINK_TEMPLATES } from './templateAttribution.ts';
import { readableTemplateBody } from './templateBodies.ts';
import { FINDABLE_GUARANTEE, FINDABLE_MINIMUM_TERM_MONTHS, FINDABLE_OFFER_SUMMARY, FINDABLE_SETUP_PRICE_GBP, reportPublicUrl } from './findableOffer.ts';
import { shortReportUrl } from './reportSlug.ts';

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
  opening: string[];
  evidence: PlaybookEvidence;
  findings: PlaybookFinding[];
  findingsNote: string | null;
  explain: string[];
  transition: string;
  offer: { lines: string[]; monthly: string; nextSteps: string[] };
  objections: Array<{ objection: string; answer: string }>;
  followUp: PlaybookFollowUp | null;
  reportUrl: string | null;
  reportNote: string | null;
}

/* ── Small, pure helpers ──────────────────────────────────────────────────────────────────────── */

const clean = (s: string | null | undefined): string => (s ?? '').replace(/\s+/g, ' ').trim();

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

interface FindingsOutcome {
  findings: PlaybookFinding[];
  note: string | null;
  crawlAtMs: number | null;
  crawlStale: boolean;
}

export function selectFindings(input: Pick<PlaybookInput, 'lead' | 'runCrawls' | 'leadCrawl' | 'nowMs'>): FindingsOutcome {
  const hasWebsite = !!clean(input.lead.website);
  const all = [...input.runCrawls, ...(input.leadCrawl ? [input.leadCrawl] : [])].filter((s) => s.result);
  const newestMs = all.length ? Math.max(...all.map((s) => s.createdAtMs)) : null;
  const crawlStale = newestMs !== null && !(input.nowMs - newestMs < CRAWL_FRESH_MS);

  if (!hasWebsite) {
    return {
      findings: [], crawlAtMs: newestMs, crawlStale,
      note: 'No website on file, so there is nothing to crawl. In everything we have measured, Gemini has not named a business without a website of its own — that is the conversation to have.',
    };
  }
  const found = resolveFindingsSource(true, input.runCrawls, input.leadCrawl);
  if (found) {
    const findings = found.candidates.slice(0, MAX_SITE_FINDINGS).map((f) => {
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
    return { findings, note: null, crawlAtMs: found.source.createdAtMs, crawlStale: false };
  }
  if (newestMs === null) {
    return { findings: [], crawlAtMs: null, crawlStale: false, note: 'This site has not been crawled yet, so there are no website findings. (Opening the playbook never runs a crawl — use Crawl site if you want one.)' };
  }
  if (crawlStale) {
    return { findings: [], crawlAtMs: newestMs, crawlStale, note: 'The newest crawl is more than 30 days old, so its findings are not used — the site may have changed.' };
  }
  const usable = all.map((s) => usableCrawlSignals(s.result, s.createdAtMs)).find((s) => !!s);
  if (usable?.fetchFailed) {
    return { findings: [], crawlAtMs: newestMs, crawlStale, note: 'The crawl could not read the site at all, so there is nothing reliable to say about it.' };
  }
  return { findings: [], crawlAtMs: newestMs, crawlStale, note: 'The crawl found no strong website issues. Do not lead with the website on this call.' };
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

export function buildColdCallPlaybook(input: PlaybookInput): ColdCallPlaybook {
  const { lead, reportAudit, report, nowMs } = input;
  const business = clean(reportAudit?.business_name) || clean(lead.business_name) || 'this business';
  const town = clean(reportAudit?.location_text) || clean(lead.derived_town) || clean(lead.search_location) || null;
  const trade = tradePlural(reportAudit, lead);
  const callName = displayBusinessName(business, { town, style: 'identify' }) || business;
  const lookingAt = trade ? trade + (town ? ' in ' + town : '') : town ? 'businesses like yours in ' + town : 'businesses like yours';

  const evidence = selectEvidence(report, business);
  const f = selectFindings(input);
  const convo = summariseConversation(input.messages, business);

  const auditMs = reportAudit?.created_at ? new Date(reportAudit.created_at).getTime() : null;
  const auditStale = auditMs !== null && nowMs - auditMs > PLAYBOOK_AUDIT_STALE_DAYS * DAY_MS;
  const auditDate = playbookDate(reportAudit?.created_at ?? null);

  const warnings: string[] = [];
  if (auditStale) warnings.push('The AI result is from ' + auditDate + ' — more than ' + PLAYBOOK_AUDIT_STALE_DAYS + ' days old. Say "when I checked", not "earlier", or re-run the audit before calling.');
  if (evidence.kind === 'none') warnings.push(input.auditRunning ? 'An audit is still running for this lead — its result is not in yet.' : 'No AI result is stored for this lead. The opening below does not claim one.');
  if (f.crawlStale && !f.findings.length) warnings.push('The website crawl is more than 30 days old.');

  /* ── B. the opening ── */
  const when = auditStale ? 'recently' : 'earlier';
  const top = evidence.competitors.slice(0, OPENING_COMPETITORS);
  const aiFact = evidence.kind === 'gap'
    ? (top.length
      ? 'It mentioned ' + joinNames(top) + ', but your business didn\'t come up in that answer.'
      : 'Your business didn\'t come up in the answer it gave.')
    : evidence.kind === 'named'
      ? 'It did mention you, which is good' + (f.findings.length ? ' — but I also had a look at your website and noticed something worth telling you about.' : ' — I wanted to run something by you about keeping it that way.')
      : null;

  const opening: string[] = [];
  if (convo.mode === 'cold') {
    opening.push('Hi, is that ' + callName + '?');
    if (aiFact) {
      opening.push('It\'s Paul from Findable. I was looking at ' + lookingAt + ' ' + when + ', so I asked AI who it would recommend.');
      opening.push(aiFact);
    } else {
      opening.push('It\'s Paul from Findable. I look at how clearly local businesses come across to AI assistants like ChatGPT and Gemini when someone asks for ' + lookingAt + '.');
    }
    opening.push('Have you got a minute? I\'ll explain why I\'m ringing.');
  } else {
    const fu = convo.followUp!;
    opening.push('Hi, is that ' + callName + '? It\'s Paul from Findable — I messaged you on WhatsApp' + (fu.firstContactAt ? ' on ' + playbookDate(fu.firstContactAt) : '') + '.');
    if (fu.lastInbound && convo.followUp && fu.lastInbound.at >= (fu.lastOutbound?.at ?? '')) {
      opening.push('Thanks for getting back to me — I thought it would be easier to explain on a quick call.');
    } else if (fu.reportSentAt) {
      opening.push('I sent over a short report on what AI says when someone asks for ' + lookingAt + ' — I thought it would be easier to talk you through it.');
    } else {
      opening.push('I thought it would be easier to explain on a quick call than over messages.');
    }
    if (evidence.kind === 'gap') {
      opening.push(top.length
        ? 'When I asked AI, it mentioned ' + joinNames(top) + ', but not you.'
        : 'When I asked AI, your business didn\'t come up in the answer.');
    }
    opening.push('Have you got a minute?');
  }

  /* ── E. how to explain it ── */
  const explain: string[] = [];
  if (evidence.kind === 'gap') {
    explain.push('When someone asks ChatGPT or Gemini for ' + lookingAt + ', it gives them a short list of names rather than ten links. On the question I asked, you weren\'t on that list' + (top.length ? ' — ' + joinNames(top) + ' were.' : '.'));
  } else if (evidence.kind === 'named') {
    explain.push('When someone asks AI for ' + lookingAt + ', it gives a short list of names. You were on it for the question I checked — the aim is to keep it that way across more of the questions people actually ask.');
  }
  if (f.findings.length) {
    const lead0 = f.findings[0];
    const clause = lead0.explanation.charAt(0).toLowerCase() + lead0.explanation.slice(1).replace(/\.$/, '');
    explain.push('The main thing I noticed on your site is ' + clause + '. ' + lead0.whyItMayMatter + ' It could be contributing — it\'s not the only thing AI looks at.');
  }
  if (!explain.length) explain.push('Keep it simple: you look at what AI assistants say when people ask for ' + lookingAt + ', and you measure it before and after any work.');

  /* ── F. transition ── */
  const transition = 'That\'s basically what I do. I help local businesses make the information on their site clearer for AI and search systems, then I measure the same questions again afterwards to see whether visibility improves.';

  /* ── G. offer / next step ── */
  const reportUrl = reportAudit
    ? (reportAudit.short_code ? shortReportUrl(reportAudit.short_code) : reportPublicUrl(reportAudit.id))
    : null;
  const nextSteps: string[] = [];
  nextSteps.push(reportUrl ? 'Offer to send the report (link below) — send it yourself from the Inbox.' : 'No shareable report yet — offer to run the check and send it over.');
  if (f.findings.length) nextSteps.push('Walk them through the website finding — they can check it on their own phone.');
  nextSteps.push('Book a follow-up call once they have looked at it.');
  if (clean(lead.website)) nextSteps.push('If they can\'t get into their site to change it, talk about moving it to our hosting or a rebuild.');
  else nextSteps.push('They have no website on file — talk about getting one built.');
  const offer = {
    lines: [
      FINDABLE_OFFER_SUMMARY,
      FINDABLE_GUARANTEE,
    ],
    /* Paul's build terms (findableOffer.ts, FINDABLE_MINIMUM_TERM_MONTHS) — they apply to a site we build. */
    monthly: 'If we build the site: we build, host and manage it for the ' + FINDABLE_MINIMUM_TERM_MONTHS + " months, and once the term is complete and paid, it's theirs. Nothing is charged after the " + FINDABLE_MINIMUM_TERM_MONTHS + ' months.',
    nextSteps,
  };

  /* ── H. objections ── */
  const findingShort = f.findings[0] ? f.findings[0].explanation.replace(/\.$/, '').toLowerCase() : null;
  const objections = [
    {
      objection: 'I already have a website guy',
      answer: 'That\'s fine — I\'m not trying to replace them. This is one specific thing: what AI says when someone asks for ' + lookingAt + '. I can send your web person exactly what I found so they can look at it.',
    },
    {
      objection: 'My website is fine',
      answer: findingShort
        ? 'It may well look fine to customers. This is about how clearly it reads to AI and search tools — for example, ' + findingShort + ". I can show you exactly where, and you can check it yourself."
        : 'It may well be. What I\'m talking about is what AI answered when I asked — that\'s separate from how the site looks.',
    },
    {
      objection: 'I already come up on Google',
      answer: 'That\'s good, and it\'s a different thing. When someone asks ChatGPT or Gemini instead of scrolling Google, they get a short list of names' + (evidence.kind === 'gap' ? ' — and on the question I asked, you weren\'t on it.' : '.'),
    },
    {
      objection: 'Nobody uses AI for this',
      answer: 'More people are starting to, but I can\'t tell you how many of your customers do. That\'s why I measure it — you see the before and after on the same questions rather than taking my word for it.',
    },
    {
      objection: 'I\'m too busy',
      answer: 'No problem. Can I send you the report on WhatsApp and ring back when it suits you? What time is better?',
    },
    {
      objection: 'How much is it?',
      answer: FINDABLE_OFFER_SUMMARY + ' The £' + FINDABLE_SETUP_PRICE_GBP + ' covers measuring where you are now, doing the work, and re-measuring at four weeks.',
    },
    {
      objection: 'Can you guarantee I\'ll show up?',
      /* ⛔ NO "I can't promise" HERE: a hedge beside the conditional refund reads as walking it back
         (CLAUDE.md §1). What is promised is the measurement and the refund — never a placement. */
      answer: "What I guarantee is the measurement, not a spot in the answer. We measure how often AI names you before we start and re-measure after four weeks on the same questions. If that number hasn't gone up, you email within 14 days of your results and get your £" + FINDABLE_SETUP_PRICE_GBP + ' back.',
    },
    {
      objection: 'Just send me the information',
      answer: reportUrl
        ? 'Sure — I\'ll WhatsApp you the report. It shows the exact question, what AI answered and who it named. Can I give you a quick ring once you\'ve had a look?'
        : 'Sure — I\'ll put together a short report and send it over. Can I give you a quick ring once you\'ve had a look?',
    },
  ];

  return {
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
    followUp: convo.followUp,
    reportUrl,
    reportNote: reportUrl ? null : (input.auditRunning ? 'The audit is still running — no report link yet.' : 'No usable public report for this lead.'),
  };
}
