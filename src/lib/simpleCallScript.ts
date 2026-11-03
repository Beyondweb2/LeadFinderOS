/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE SIMPLE CALL SCREEN (Paul, 2026-11-03: "dead simple for a new salesperson — facts, script, offer, close button").

   Two short scripts, chosen by whether the lead has a website of its own: HAS A WEBSITE / NO WEBSITE. The words are
   Paul's. Everything the rep SAYS is a `say` line; "Pick one", "If no", "If yes" and [ ] notes are grey prompts for the
   rep, never words to read out. The website issues are NOT inside the script any more — they sit in "What we found"
   above it (the ONE place, de-duplicated), and the rep reads two or three of them where the script says so.

   ⛔ NOTHING INVENTED: rivals are the stored answer's own names (coldCallPlaybook.evidence.competitors, up to three);
      with none on file the rival sentence is dropped and the rep is told so — never a made-up firm.
   ⛔ CORRELATION IS NOT CAUSATION stays a one-line reminder in "What we found" (SAY_IT_LINE).
   Pure. No React, no fetch, no clock.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { plainIssueTitle, type WebsiteIssue } from './websiteCheck.ts';
import { COMPLETE_UPFRONT_MONTHS, PAYMENT_PLAN_SPEC, completeUpfrontSavingGbp, gbpWords } from './paymentPlans.ts';

/** How many website issues "What we found" shows before "Show all". */
export const FOUND_ISSUES_SHOWN = 3;
/** The one reminder under the issues. */
export const SAY_IT_LINE = "Say it may make it harder. Never say it's the reason.";

export const PICK_ONE_QUESTIONS: readonly string[] = [
  'Is showing up in places like ChatGPT something you\'ve thought about yet?',
  'Is being recommended by AI something you\'d be interested in?',
  'Would you have the capacity for more customers coming through AI?',
];
export const AI_USE_STAT_LINE = '45% of people have now used AI to find a local business, and a year ago it was 6%.';
export const AI_USE_STAT_SOURCE = 'Source: BrightLocal 2026 survey.';
export const WEBSITE_SCRIPT_CLOSING_QUESTION = 'Do you look after the website yourself, or does someone do it for you?';
export const NO_WEBSITE_CLOSING_QUESTION = 'How do most of your jobs come in at the moment?';

export type ScriptKind = 'website' | 'no_website';

export type ScriptLine =
  /** Said out loud. */
  | { kind: 'say'; text: string }
  /** A small grey prompt for the rep: "[let them talk]", "Pick one". Never said. */
  | { kind: 'prompt'; text: string }
  /** "Pick one": a grey label over the questions, one of which is said. */
  | { kind: 'pick'; options: readonly string[] }
  /** "If no" / "If yes": a grey label, then the line to say; `note` is a grey [ ] prompt after it. */
  | { kind: 'branch'; label: string; text: string; note?: string; addWebsite?: boolean }
  /** The statistic line, with the small source note under it for the rep. */
  | { kind: 'stat'; text: string; source: string };

export interface SimpleScriptInput {
  /** True when the lead has a website of its own (a directory / social profile is NOT one). */
  hasWebsite: boolean;
  /** The contact's first name, when the lead has one. */
  contactFirstName: string | null;
  businessName: string;
  /** "a plumber in Rugby" — the search said plainly (playbook.context.searchFor). */
  searchFor: string;
  /** The stored answer's real competitor names, cleaned; the first three are said. */
  competitors: readonly string[];
}

const joinNames = (names: readonly string[]): string =>
  names.length <= 1 ? (names[0] ?? '') : names.slice(0, -1).join(', ') + ' and ' + names[names.length - 1];

/** A contact name's first word, only when it is a plain name — never a guess (the playbook's rule). */
export function contactFirstNameOf(raw: string | null | undefined): string | null {
  const w = String(raw ?? '').replace(/\s+/g, ' ').trim().split(' ')[0] ?? '';
  return /^[A-Za-z][A-Za-z'-]*$/.test(w) ? w : null;
}

/** "Hi, is this Dave?" — or, with no contact name, "Hi, is that Smith Plumbing?". */
export function greetingLine(i: Pick<SimpleScriptInput, 'contactFirstName' | 'businessName'>): string {
  return i.contactFirstName ? `Hi, is this ${i.contactFirstName}?` : `Hi, is that ${i.businessName}?`;
}

/** The opener line: what was searched, and who AI recommended. */
export function searchLine(i: Pick<SimpleScriptInput, 'searchFor' | 'competitors'>): { say: string; note: string | null } {
  const top = i.competitors.slice(0, 3);
  const base = `Hi mate, I was looking for ${i.searchFor}, so I asked AI`;
  return top.length
    ? { say: `${base} and it recommended ${joinNames(top)}.`, note: null }
    : { say: `${base}.`, note: 'No rival names on file for this lead. Don\'t name any.' };
}

/** The script for this lead, as lines the screen draws. */
export function buildSimpleScript(i: SimpleScriptInput): ScriptLine[] {
  const search = searchLine(i);
  const open: ScriptLine[] = [
    { kind: 'say', text: greetingLine(i) },
    { kind: 'say', text: search.say },
    ...(search.note ? [{ kind: 'prompt', text: '[' + search.note + ']' } as const] : []),
  ];
  const stat: ScriptLine = { kind: 'stat', text: AI_USE_STAT_LINE, source: AI_USE_STAT_SOURCE };
  const pick: ScriptLine = { kind: 'pick', options: PICK_ONE_QUESTIONS };
  const talk: ScriptLine = { kind: 'prompt', text: '[let them talk]' };

  if (i.hasWebsite) {
    return [
      ...open,
      { kind: 'say', text: "I found a few issues with the way your website is set up, which I think are the reasons why AI doesn't name you." },
      pick, talk, stat,
      { kind: 'prompt', text: '[read 2 or 3 issues]' },
      { kind: 'say', text: WEBSITE_SCRIPT_CLOSING_QUESTION },
    ];
  }
  return [
    ...open,
    { kind: 'say', text: 'Have you got a website at the moment?' },
    { kind: 'branch', label: 'If no', text: "Ah, that'll be why then. A few years ago it didn't matter much, but some AI tools now use websites to decide who to recommend." },
    { kind: 'branch', label: 'If yes', text: "Oh right, what's the address?", note: '[add it to the lead, then carry on]', addWebsite: true },
    pick, talk, stat,
    { kind: 'say', text: NO_WEBSITE_CLOSING_QUESTION },
  ];
}

/** Every line the rep SAYS, as one string — what the "never says" tests read. Grey prompts are left out. */
export function simpleScriptSpoken(lines: readonly ScriptLine[]): string {
  return lines.flatMap((l) => (l.kind === 'say' || l.kind === 'branch' || l.kind === 'stat' ? [l.text] : l.kind === 'pick' ? [...l.options] : [])).join('\n');
}

/* ── What we found: the website issues, said once ──────────────────────────────────────────────── */

/** The same issue twice (two checks or two sources naming it) shows once: by its plain title, case-blind. Order kept. */
export function dedupeIssues(issues: readonly WebsiteIssue[]): WebsiteIssue[] {
  const seen = new Set<string>();
  const out: WebsiteIssue[] = [];
  for (const i of issues) {
    const k = plainIssueTitle(i).trim().toLowerCase().replace(/\s+/g, ' ');
    if (!k || seen.has(k)) continue;
    seen.add(k);
    out.push(i);
  }
  return out;
}

/** The top issues, and how many more sit behind "Show all". */
export function foundIssues(serious: readonly WebsiteIssue[]): { shown: WebsiteIssue[]; all: WebsiteIssue[]; hidden: number } {
  const all = dedupeIssues(serious);
  return { shown: all.slice(0, FOUND_ISSUES_SHOWN), all, hidden: Math.max(0, all.length - FOUND_ISSUES_SHOWN) };
}

/* ── What we offer (Findable Complete) ─────────────────────────────────────────────────────────── */

export function offerUnderLine(): string {
  return `Price an issue? Offer paying up front (save ${gbpWords(completeUpfrontSavingGbp())}). Still an issue? Essential, in Quick Close.`;
}
export const OFFER_UNDER_LINE = offerUnderLine();

/** The offer list, top to bottom. Every figure is read from paymentPlans.ts, never typed here. */
export function offerLines(): string[] {
  const c = PAYMENT_PLAN_SPEC.complete;
  return [
    'Money-back guarantee: we improve AI visibility or you get your money back',
    `${gbpWords(c.monthlyGbp)} a month, or ${gbpWords(PAYMENT_PLAN_SPEC.complete_upfront.firstGbp)} up front for the year (saves ${gbpWords(completeUpfrontSavingGbp())})`,
    'Day 1: a discovery audit to find the questions they can win, plus a 20-question baseline audit',
    'We build an AI-optimised website set up to win those questions',
    'Every month: we re-run the 20-question audit to measure how often AI names them',
    'We handle their review replies',
    'We add them to relevant directories, where it applies',
    'Changes and updates, within reason',
    `We host the site. They own it after the final payment (up front: after the ${COMPLETE_UPFRONT_MONTHS} months).`,
  ];
}
