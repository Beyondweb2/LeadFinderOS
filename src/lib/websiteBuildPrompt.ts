/* ════════════════════════════════════════════════════════════════════════════════════════════════
   WEBSITE BUILD — the EVIDENCE sections every generated build prompt shares: the frozen baseline and
   the rule not to touch it, the client's own URLs engines cited (do-not-break), Findable's stored
   crawl findings, and the facts whose sources disagree. The Build Pack (buildPack.ts) assembles its
   prompts from these plus the approved facts, template and architecture.

   ⛔ NOTHING IS INVENTED. Every value comes from a resolved fact (clientFacts.ts) or stored evidence.
   ⛔ A DISAGREEMENT BETWEEN SOURCES IS A QUESTION, NOT A CHOICE.
   ⛔ CITATION IS NOT CAUSATION. The do-not-break section says these URLs were CITED while an engine
   answered, and tells Claude to investigate before redirecting or removing one.

   ⚠️ BUILT FROM ARRAYS OF PLAIN STRINGS, joined — not one enormous template literal. A backtick
   inside a template literal has broken this repo's build three times (CLAUDE.md §3).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import type { ClientFacts, ConfirmationItem } from './clientFacts.ts';
import type { BaselineSummary, VisibilitySignal } from './baselineSummary.ts';
import type { WebsiteBuildState } from './websiteBuildState.ts';

/* ── the evidence input ──────────────────────────────────────────────────────────────────────── */

export interface RebuildPromptInput {
  facts: ClientFacts;
  confirmations: ConfirmationItem[];
  build: WebsiteBuildState;
  /** The completed paid baseline, folded. Null when there is none yet. */
  baseline: BaselineSummary | null;
  /** The EXACT approved question set, in its frozen order. */
  frozenQuestions: string[];
  baselineAuditId: string | null;
  /** The client's own URLs engines cited while answering baseline questions. */
  signals: VisibilitySignal[];
  /** Stored crawl findings, already turned into sentences. Empty when nothing is stored. */
  crawlFindings: string[];
  crawlUrl: string | null;
  crawlCheckedAt: string | null;
  /** Page-plan rows already queued for this client. */
  plannedPages: Array<{ service?: string | null; town?: string | null; status?: string | null }>;
}

export function baselineProtection(i: RebuildPromptInput): string[] {
  if (!i.baseline) {
    return [
      '## BASELINE PROTECTION',
      '',
      '⛔ This client has no completed paid baseline recorded yet. Do not create, run, or simulate',
      'one — measurement is Findable’s job and happens outside this repository. Ask Paul before',
      'assuming anything about their current AI visibility.',
    ];
  }
  const b = i.baseline;
  const out = [
    '## BASELINE PROTECTION — READ THIS BEFORE YOU TOUCH ANYTHING',
    '',
    'This client’s AI-visibility baseline is ALREADY COMPLETE and it is FROZEN.',
    '',
    `- Baseline completed:  ${b.completedLabel || 'recorded in Findable'}`,
    `- Baseline audit id:   ${i.baselineAuditId ?? 'not recorded'}`,
    `- Questions:           ${b.questionCount}, each asked ${b.runs || 3} times per engine`,
    `- Scored engines:      ${b.engineLabels.join(', ') || 'recorded in Findable'}`,
    `- Overall result:      named in ${b.named} of ${b.total} answers (${b.pct}%)`,
    ...b.perEngine.map((e) => `- ${e.label}: named in ${e.named} of ${e.total} answers (${e.pct}%)`),
    '',
    'RULES:',
    '- DO NOT change, re-run, regenerate or "improve" the baseline. It is not in this repository and',
    '  nothing you do here should try to reach it.',
    '- DO NOT rewrite the frozen questions. They are replayed verbatim at the four-week remeasure.',
    '- The website work you are about to do is what gets MEASURED against this baseline. That is the',
    '  point of the exercise: the before number already exists, and it must stay exactly as it is.',
    '',
    '### The exact frozen baseline questions',
    '',
    'These are the questions, in their approved order. They are here so you understand what this site',
    'is being judged on — NOT so you can stuff them into the pages. Writing a page that parrots a',
    'question back is the gimmick this whole approach rejects.',
    '',
    ...(i.frozenQuestions.length
      ? i.frozenQuestions.map((q, n) => `${n + 1}. ${q}`)
      : ['(The approved set is not available to this prompt. Ask Paul before assuming any wording.)']),
  ];

  const gaps = [
    b.absent.length ? `${b.absent.length} question(s) where the business was never named on any engine` : '',
    b.fragile.length ? `${b.fragile.length} question(s) where it was named on some asks but not others` : '',
    b.oneEngine.length ? `${b.oneEngine.length} question(s) where only one scored engine named it` : '',
    b.strong.length ? `${b.strong.length} question(s) where every ask named it` : '',
  ].filter(Boolean);
  if (gaps.length) out.push('', '### What the baseline found', ...gaps.map((g) => `- ${g}`));
  if (b.absent.length) {
    out.push('', 'Never named on these questions (the openings):',
      ...b.absent.slice(0, 12).map((q) => `- ${q.question}`));
  }
  if (b.fragile.length) {
    out.push('', 'Named only some of the time on these (on the edge of the answer):',
      ...b.fragile.slice(0, 12).map((q) => `- ${q.question} — ${q.namedCount} of ${q.answers} answers`));
  }
  if (b.oneEngine.length) {
    out.push('', 'Named by one engine only on these:',
      ...b.oneEngine.slice(0, 12).map((q) => `- ${q.question} — ${q.engines.join(', ')}`));
  }
  if (b.competitors.length && !b.namesWithheld) {
    out.push('', '### Competitors that actually appeared in the baseline answers',
      ...b.competitors.slice(0, 12).map((c) => `- ${c.name} (${c.count} mention${c.count === 1 ? '' : 's'})`),
      '',
      'These are for your understanding of the market only. ⛔ Do NOT name a competitor anywhere on',
      'the client’s website, and do not copy their content.');
  }
  if (b.namesWithheld) {
    out.push('', '⚠ Rival names from this baseline were withheld because the extracted list could not be',
      'trusted. Do not go looking for them; they are not needed for this work.');
  }
  if (b.nameNotJudgeable) {
    out.push('', '⚠ This business’s name is close to its trade plus its town, so an automated check cannot',
      'reliably tell a mention of the business from a mention of the trade. Treat the per-question',
      'detail as indicative, not as a score.');
  }
  return out;
}

export function doNotBreak(i: RebuildPromptInput): string[] {
  const out = [
    '## DO-NOT-BREAK / EXISTING VISIBILITY SIGNALS',
    '',
    '⛔ WORDING MATTERS HERE. The URLs below were CITED by an AI engine while it answered a baseline',
    'question. That is a correlation and a citation — it is NOT proof that the page caused the',
    'business to be named, and you must not describe it that way to Paul or in a commit message.',
    '',
    'What it does mean: an engine has fetched and used these exact URLs. Changing, merging,',
    'redirecting or removing one is a real risk that has to be taken deliberately.',
    '',
    'RULE: investigate before you touch any URL in this list. If a rebuild would change its address,',
    'say so explicitly, explain why, and propose a 301 — do not do it silently.',
    '',
  ];
  if (!i.signals.length) {
    out.push('No citations of the client’s own site appear in the baseline evidence. That is itself a',
      'finding: nothing on their current site is being read back by the engines we score. It does NOT',
      'mean the existing URLs are safe to churn.');
  } else {
    for (const s of i.signals) {
      out.push(`- ${s.url}`);
      out.push(`    cited while answering: ${s.questions.slice(0, 3).map((q) => `"${q}"`).join('; ')}`);
      out.push(`    business was named on ${s.namedOnAny ? 'at least one' : 'none'} of those questions`);
    }
  }
  /* ⛔ THE FLOOR APPLIES EITHER WAY. An empty evidence list is not permission to churn URLs — it
     used to be, because this line only existed on the branch that had citations. */
  out.push('', 'Plus, until your inventory proves otherwise, treat as do-not-break: the homepage, every',
    'service page, every location page, and the contact page of the live site.');
  return out;
}

export function crawlSection(i: RebuildPromptInput): string[] {
  if (!i.crawlFindings.length) return [];
  return [
    '## STORED TECHNICAL FINDINGS (from Findable’s own crawl — do not re-run it)',
    '',
    `Crawled: ${i.crawlUrl ?? 'the live site'}${i.crawlCheckedAt ? ` on ${i.crawlCheckedAt}` : ''}`,
    '',
    ...i.crawlFindings.map((f) => `- ${f}`),
    '',
    'Verify each of these yourself during the inventory — they are a starting point, and a stored',
    'finding can be out of date. ⛔ Do not carry a defect forward into the rebuild because the old',
    'site had it.',
  ];
}

export function confirmationsSection(i: RebuildPromptInput): string[] {
  if (!i.confirmations.length) {
    return ['## CLIENT CONFIRMATION REQUIRED', '', 'Nothing is in conflict and no required fact is missing at the time this prompt was generated.'];
  }
  return [
    '## CLIENT CONFIRMATION REQUIRED',
    '',
    'Findable’s sources disagree, or have nothing recorded, for the following. ⛔ A winner has NOT',
    'been chosen. Do not pick one, do not average them, and do not take the live site’s version as',
    'settled. Raise each of these with Paul and wait for the client’s answer before writing anything',
    'that depends on it.',
    '',
    ...i.confirmations.map((c) => `- ${c.label} (${c.kind}): ${c.detail}`),
  ];
}

export const AI_VISIBILITY: string[] = [
  '## AI VISIBILITY STANDARDS (Findable’s, and they are not what people assume)',
  '',
  'The objective is NOT to trick an AI. It is to make the business easy to:',
  '  discover · crawl · understand · verify · cite · describe — and, possibly, recommend.',
  '',
  '⛔ DO NOT PROMISE, IMPLY OR DESIGN FOR:',
  '  - AI recommendations',
  '  - AI citations',
  '  - "#1 in AI"',
  '  - guaranteed inclusion in Google’s AI answers',
  'Nobody controls those. Anything on the site or in your reporting that suggests otherwise is wrong.',
  '',
  'What we actually check and fix:',
  '- content is in crawlable HTML, present without JavaScript',
  '- correct, self-referencing canonicals',
  '- a real sitemap that matches the site',
  '- robots.txt that does not block the search crawlers (OAI-SearchBot, ChatGPT-User, Claude-User,',
  '  PerplexityBot). A block on these is the fault that stops a business being named.',
  '- sensible internal linking, no orphans',
  '- honest structured data that matches what is visible on the page',
  '- entity consistency: identical name, address, phone and description everywhere',
  '',
  'GPTBot and other TRAINING crawlers are a separate question and a legitimate client choice. Do not',
  'change training-crawler access without asking Paul; it is not the same thing as search access.',
  '',
  '⛔ No AI gimmicks: no hidden text, no keyword stuffing, no question-parroting pages, no "AI-',
  'optimised" markup that says something the page does not.',
];
