/* ════════════════════════════════════════════════════════════════════════════════════════════════
   PROSPECT PREVIEW — the words on the evidence card and the suggested WhatsApp message.

   ⛔ NO PROVEN CAUSATION. We saw AI name other firms; we saw issues on the site. We did NOT see why
   an engine chose who it chose (CLAUDE.md: "never assert how an AI model decides"). The link is
   always "may be contributing". ⛔ NO PROMISES: no guaranteed recommendation, citation, ranking or
   improvement — the homepage is "structured so search engines and AI can more clearly understand
   the business", never "this will make AI recommend you". ⛔ NO PRICE in the preview message.
   `copyProblems` is the check; every generated string goes through it.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import type { FindingSelection, ProspectHeadline } from './types.ts';

export interface CardCopy {
  askedLabel: string;
  question: string;
  engineLine: string;
  recommendedLabel: string;
  competitors: string[];
  notNamedLine: string;
  checkedLabel: string;
  /** Issue lines (1–3), or empty on the fallback. */
  issues: string[];
  /** The hedged link between the two halves. */
  bridgeLine: string;
  rebuiltLabel: string;
  rebuiltLine: string;
}

const enginesText = (e: string[]) => (e.length <= 1 ? e[0] ?? 'AI' : `${e.slice(0, -1).join(', ')} and ${e[e.length - 1]}`);

export function buildCardCopy(h: ProspectHeadline, sel: FindingSelection, businessName: string, hasWebsite: boolean): CardCopy {
  const issues = sel.primary ? [sel.primary.line, ...sel.secondary.map((s) => s.line)] : [];
  // ⛔ Always the ENGINE, never "AI" as a whole: the headline is one engine's answer, and another
  // engine may well have named them (Paul, 2026-09-26: "Gemini didn't name E.E.S", not "AI doesn't").
  const engine = enginesText(h.engines);
  const notNamed = `${engine} didn’t name ${businessName}.`;
  let bridgeLine: string;
  let checkedLabel = 'We checked your current site';
  if (!hasWebsite) {
    checkedLabel = 'We looked for your website';
    bridgeLine = 'We couldn’t find a website for the business — that leaves AI very little of your own to go on.';
  } else if (issues.length) {
    bridgeLine = issues.length > 1 ? 'These issues may be contributing to the visibility gap.' : 'This may be contributing to the visibility gap.';
  } else if (sel.fallbackReason?.startsWith('The site was read')) {
    bridgeLine = `The site is technically accessible, but ${engine} still named other businesses for this search. The new concept makes your services, areas and evidence much clearer.`;
  } else if (sel.fallbackReason?.startsWith('The current site could not be read')) {
    // We did not read it, so we compare it to nothing.
    bridgeLine = `${engine} named other businesses for this search. The new concept sets out your services, areas and evidence clearly.`;
  } else {
    bridgeLine = `${engine} named other businesses for this search. The new concept makes your services, areas and evidence much clearer.`;
  }
  return {
    askedLabel: 'We asked AI',
    question: h.question,
    engineLine: `Asked on ${enginesText(h.engines)}`,
    recommendedLabel: `${engine} recommended`,
    competitors: h.competitors.slice(0, 3),
    notNamedLine: notNamed,
    checkedLabel,
    issues,
    bridgeLine,
    rebuiltLabel: hasWebsite ? 'So we rebuilt the homepage' : 'So we mocked up a homepage',
    rebuiltLine: 'Structured so Google and AI systems can more clearly understand the business, its services, the areas it covers and the evidence behind it.',
  };
}

/** The suggested opener to send WITH the images. Human, lower-case, no price, no hard sell. */
export function suggestedMessage(h: ProspectHeadline, sel: FindingSelection, hasWebsite: boolean): string {
  const rivals = h.competitors.slice(0, 3);
  const who = rivals.length > 1 ? 'those businesses are' : `${rivals[0]} is`;
  const down = !!sel.primary && /^rule:site_down/.test(sel.primary.id);
  const unread = !sel.primary && !!sel.fallbackReason?.startsWith('The current site could not be read');
  const clean = !sel.primary && !!sel.fallbackReason?.startsWith('The site was read');
  const issues = sel.primary ? 1 + sel.secondary.length : 0;
  const first = !hasWebsite
    ? `i had a look at why ${who} coming up instead of you, and one thing that stands out is there's no website for AI to read about you.`
    : down
      ? `i had a look at why ${who} coming up instead of you, and your website is showing an error page at the moment.`
      : sel.primary
        ? `i had a look at why ${who} coming up instead of you and found ${issues > 1 ? 'a few issues' : 'an issue'} with the current site.`
        : clean
          ? `i had a look at why ${who} coming up instead of you. the site itself is accessible, but it doesn't make your services and areas very clear.`
          // Not read: say nothing about it.
          : `i had a look at why ${who} coming up instead of you.`;
  if (unread) {
    return `${first}\n\nrather than just telling you what i'd do, i mocked up a homepage that sets out your services and areas clearly so you can see it 👇`;
  }
  const second = hasWebsite
    ? `rather than just telling you what i'd change i mocked up what i'd actually replace it with so you can see it 👇`
    : `so rather than just telling you, i mocked up what i'd build for you so you can see it 👇`;
  return `${first}\n\n${second}`;
}

/* ─────────────────────────────── the claim check ─────────────────────────────── */

const FORBIDDEN: Array<[RegExp, string]> = [
  [/\bbecause (?:your|the) (?:site|website)\b/i, 'asserts the site CAUSED the result'],
  [/\b(?:caus(?:e|es|ed|ing)|due to|the reason (?:ai|you))\b/i, 'causal wording'],
  [/\bguarantee(?:d|s)?\b/i, 'a guarantee'],
  [/\bwill (?:make|get|have) (?:ai|google|chatgpt|gemini)\b/i, 'promises an engine outcome'],
  [/\b(?:ai|google|chatgpt|gemini) will (?:recommend|name|cite|rank|list|show)\b/i, 'promises an engine outcome'],
  [/\b(?:rank(?:ing)? (?:#?1|first|top)|top of google|page one)\b/i, 'promises a ranking'],
  [/£\s?\d/, 'names a price'],
  [/\b(?:comprehensive|analysis|leverag|synerg|solutions provider)\b/i, 'corporate wording'],
  [/\bseo score\b/i, 'claims an SEO score'],
];

export function copyProblems(text: string): string[] {
  const out: string[] = [];
  for (const [re, why] of FORBIDDEN) if (re.test(text)) out.push(`${why}: "${re.exec(text)?.[0]}"`);
  return out;
}

export function cardCopyText(c: CardCopy): string {
  return [c.askedLabel, c.question, c.engineLine, c.recommendedLabel, ...c.competitors, c.notNamedLine, c.checkedLabel, ...c.issues, c.bridgeLine, c.rebuiltLabel, c.rebuiltLine].join('\n');
}
