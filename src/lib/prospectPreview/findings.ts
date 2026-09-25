/* ════════════════════════════════════════════════════════════════════════════════════════════════
   PROSPECT PREVIEW — what the evidence card says: the audit headline and the site findings.

   ⛔ THE HEADLINE IS THE REPORT'S OWN LEAD EXAMPLE (`gutPunch` from buildReportData): the same
   question, engine and rival firms the prospect's report leads with, so the card and the report
   agree by construction. It is by definition a cell where the business was NOT named, and its
   firms are already junk-filtered. A run whose names are withheld (uncleaned) has no card.

   ⛔ THE FINDINGS ARE WARM-LEAD RESEARCH'S, RANKED BY ITS OWN SCORE (`rankStrongest`) — evidence,
   severity, specificity, relevance. Nothing is re-measured or re-worded into a cause: the card
   says the issues "may be contributing", never that they made AI pick someone else.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import type { CardFinding, FindingSelection, ProspectHeadline } from './types.ts';
import { rankStrongest, type ResearchFinding } from '../warmLeadResearch.ts';
import type { AiAuditReportData } from '../aiAuditReportHtml.ts';

/** Named in MORE than this share of answers = not performing poorly for this tool. Exactly half
 *  (named by one engine, missed by the other) still qualifies — the card then names the engine that
 *  missed them (2026-09-26, E.E.S Electrical: ChatGPT named them, Gemini did not). */
export const POOR_VISIBILITY_MAX_SHARE = 0.5;
/** A finding leads the card only at this strength or above (warm research's 1–5 scale). */
export const PRIMARY_MIN_STRENGTH = 3;
export const MAX_SECONDARY_FINDINGS = 2;

/** Kinds that are not a SITE issue for the card: the audit result itself, and the ownership clue
 *  (useful to the operator, never a fault to show the owner). */
const NOT_A_CARD_ISSUE = new Set(['ai_visibility', 'provider_attribution']);

/** Phone-readable card lines. Keyed by finding id prefix first, then kind; the title otherwise. */
const LINE_BY_ID: Array<[RegExp, string]> = [
  [/^rule:site_down_not_found/, 'Your website is showing a “Not found” error'],
  [/^rule:site_down_error/, 'Your website is showing a server error'],
  [/^full:robots_all/, 'The whole site tells crawlers to stay out'],
  [/^crawl:crawler_blocked/, 'AI search crawlers are blocked'],
  [/^crawl:unreadable_homepage/, 'The homepage is almost empty without JavaScript'],
];
const LINE_BY_KIND: Record<string, string> = {
  positioning_conflict: 'The site gives conflicting locations',
  hours_conflict: 'Opening hours don’t match across pages',
  contact_conflict: 'Contact details differ between pages',
  missing_core_service_pages: 'Core services have no pages of their own',
  thin_or_duplicate: 'Lots of thin or near-identical pages',
  title_h1: 'The homepage doesn’t clearly say what you do, and where',
  structured_data: 'No business details marked up for search engines',
  weak_evidence: 'Little evidence of credentials or reviews on the site',
  off_trade_content: 'Content that isn’t about your trade',
  outdated_content: 'Parts of the site look out of date',
};

export function cardLine(f: ResearchFinding): string {
  for (const [re, line] of LINE_BY_ID) if (re.test(f.id)) return line;
  if (f.kind === 'crawl_indexing' && /noindex/i.test(`${f.title} ${f.detail}`)) return 'Important pages are hidden from search';
  if (f.kind === 'crawl_indexing' && /canonical|sitemap|domain/i.test(`${f.title} ${f.detail}`)) return 'The site points search engines at the wrong address';
  return LINE_BY_KIND[f.kind] ?? f.title.replace(/\.$/, '');
}

const toCard = (f: ResearchFinding): CardFinding => ({ id: f.id, line: cardLine(f), detail: f.detail, strength: f.strength, source: f.source });

export interface ResearchForCard {
  status: string;
  technicallyClean: boolean;
  strongestFindings: ResearchFinding[];
  technicalFindings?: ResearchFinding[];
  contentFindings?: ResearchFinding[];
  localVisibilityFindings?: ResearchFinding[];
}

export function selectFindings(research: ResearchForCard | null): FindingSelection {
  const unread = !research || research.status === 'failed';
  if (!research) {
    return { primary: null, secondary: [], fallback: true, fallbackReason: 'The current site could not be read, so the card makes no claim about it.' };
  }
  if (research.status === 'no_website') {
    return { primary: null, secondary: [], fallback: true, fallbackReason: 'No website — the card leads on the AI result and the new site.' };
  }
  const pool = [
    ...research.strongestFindings,
    ...(research.technicalFindings ?? []), ...(research.contentFindings ?? []), ...(research.localVisibilityFindings ?? []),
  ]
    .filter((f) => f.verified && !NOT_A_CARD_ISSUE.has(f.kind))
    // Site unreadable today: only what the (fresh) crawl already MEASURED may still be said.
    .filter((f) => !unread || f.source === 'crawl');
  const ranked = rankStrongest(pool, 1 + MAX_SECONDARY_FINDINGS + 2);
  const primary = ranked.find((f) => f.strength >= PRIMARY_MIN_STRENGTH) ?? null;
  if (!primary) {
    return {
      primary: null, secondary: [], fallback: true,
      fallbackReason: unread ? 'The current site could not be read, so the card makes no claim about it.' : research.technicallyClean
        ? 'The site was read and nothing technical of substance was found.'
        : 'No site finding was strong enough to lead with.',
    };
  }
  const lines = new Set([cardLine(primary)]);
  const secondary = ranked.filter((f) => f !== primary && f.strength >= 2)
    .filter((f) => { const l = cardLine(f); if (lines.has(l)) return false; lines.add(l); return true; })
    .slice(0, MAX_SECONDARY_FINDINGS)
    .map(toCard);
  return { primary: toCard(primary), secondary, fallback: false, fallbackReason: null };
}

/* ─────────────────────────────── the audit headline ─────────────────────────────── */

export function pickHeadline(data: AiAuditReportData | null, meta: { auditId: string; runId: string | null; trade: string | null; town: string | null }): ProspectHeadline | null {
  if (!data || data.namesWithheld || data.nameNotJudgeable || !data.gutPunch) return null;
  const gp = data.gutPunch;
  const competitors = (gp.businesses?.length ? gp.businesses : gp.rivals).map((c) => String(c).trim()).filter(Boolean).slice(0, 3);
  if (!competitors.length) return null;
  const q = data.questionBreakdown?.find((x) => x.question === gp.question) ?? null;
  return {
    auditId: meta.auditId,
    runId: meta.runId,
    question: gp.question,
    engines: [gp.engineLabel],
    competitors,
    // gutPunch is chosen from cells where the business was NOT named; across engines it may have been.
    prospectNamed: q ? q.namedYou : false,
    trade: meta.trade,
    town: meta.town,
    namedDatapoints: data.named,
    totalDatapoints: data.total,
  };
}

/* ─────────────────────────────── eligibility ─────────────────────────────── */

export type Eligibility = { eligible: true; notes: string[] } | { eligible: false; reason: string };

export function previewEligibility(i: {
  headline: ProspectHeadline | null;
  auditComplete: boolean;
  hasWebsite: boolean;
  hasPhoneOrEmail: boolean;
  hasTown: boolean;
}): Eligibility {
  if (!i.auditComplete) return { eligible: false, reason: 'No completed AI audit for this lead yet — run the audit first.' };
  if (!i.headline) return { eligible: false, reason: 'The audit has no usable example of AI naming other businesses instead (names withheld, not judgeable, or none named).' };
  const h = i.headline;
  if (h.totalDatapoints && h.namedDatapoints != null && h.namedDatapoints / h.totalDatapoints > POOR_VISIBILITY_MAX_SHARE) {
    return { eligible: false, reason: `The business was named in ${h.namedDatapoints} of ${h.totalDatapoints} answers — it is not performing poorly enough for this pitch.` };
  }
  if (!i.hasTown) return { eligible: false, reason: 'No home town is known for this business.' };
  if (!i.hasWebsite && !i.hasPhoneOrEmail) return { eligible: false, reason: 'No website and no phone or email — not enough to build a truthful homepage.' };
  const notes: string[] = [];
  if (!i.hasWebsite) notes.push('No website: the homepage is built from the lead record only.');
  if (h.prospectNamed) notes.push('On the headline question another engine did name them — the card says which engine did not.');
  return { eligible: true, notes };
}
