/* ════════════════════════════════════════════════════════════════════════════════════════════════
   VOICE-NOTE SCRIPT — a personalised WhatsApp voice note for Paul to read out to a cold lead
   (Paul, 2026-09-26). Pure, edge-reachable: relative `.ts` imports only, no fetch, no Deno, no DOM.
   The edge function `voice-note-script` does the reading and the model call; every judgement is here.

   ⛔ IT NEVER SENDS ANYTHING. It returns text. Paul records the note himself.

   THE EVIDENCE TUPLE IS INSEPARABLE: QUESTION + ENGINE + ANSWER + COMPETITORS all come from ONE
   hook result (one question, one engine's answer to it). The competitors are that cell's own list,
   through the report's suppression / junk gates and the self-exclusion — never another question's,
   never the other engine's, never padded. The script must name the engine that was actually asked.

   THE PICK (selectVoiceNoteEvidence), Paul's order:
     1. a Google AI miss with 2–3 usable competitor names (3 preferred, then the hook rank);
     2. else a ChatGPT miss with 2–3 names;
     3. else, as a last resort, a miss with ONE name (Google AI first), flagged to the operator;
     4. else refuse and say why — named everywhere, or no usable names in any miss.

   THE WEBSITE HALF reuses the warm-lead research record (saved research → full crawl → crawl check →
   a targeted fetch; src/lib/warmLeadResearch.ts) and the warm drafter's deterministic selection
   (selectReplyFindings): one primary finding and at most one supporting one. No finding strong enough
   → the honest "nothing obviously broken" fallback. Nothing is ever invented.

   THE CHECKS (checkVoiceNoteScript) guard FACTS, not style: every competitor named and no other engine
   claimed, no causation claim, no price, no link, no technical fault that no finding supports, and the
   primary finding actually used. Length is a target, not a gate: 86 or 134 words is fine; only a script
   that is plainly too short or too long is sent back.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import { HOOK_PICK_ENGINE_ORDER, hookEngineLabel, hookMissScore, type HookResult } from './hookScore.ts';
import { usableRivals, excludeSelfRivals } from './rivalHook.ts';
import { nameMatches } from './nameMatch.ts';
import { articleTrade } from './templateVars.ts';
import { findingMentioned, sayableDetails, findingSourceLabel, selectReplyFindings } from './warmReply.ts';
import type { ResearchFinding, WarmLeadResearch } from './warmLeadResearch.ts';
import { isAggregatorUrl, domainOf } from './aggregators.ts';

/** Bump when the prompt, the pick or the checks change in a way worth telling apart in stored rows. */
export const VOICE_NOTE_GENERATOR_VERSION = 1;
/** The stronger writing model (Paul, 2026-09-26: tone matters, ~1–2p a script is fine). */
export const VOICE_NOTE_MODEL = 'gpt-4o';
/** The spoken target, ~35–55 seconds. */
export const VOICE_NOTE_TARGET_WORDS = { min: 90, max: 130 } as const;
/** Outside this a length is worth a note to Paul — never a rewrite. */
export const VOICE_NOTE_NOTE_WORDS = { min: 80, max: 145 } as const;
/** Outside this the script is plainly wrong-sized and is sent back once. */
export const VOICE_NOTE_HARD_WORDS = { min: 60, max: 175 } as const;
/** A voice note carries the strongest finding and at most one more. */
export const VOICE_NOTE_MAX_FINDINGS = 2;

/* ─────────────────────────────── 1. the hook result ─────────────────────────────── */

export interface VoiceNoteEvidence {
  questionIndex: number;
  question: string;
  engine: string;
  engineLabel: string;
  /** THIS cell's own usable names, 1–3. */
  competitors: string[];
  answerExcerpt: string;
  /** Only one usable name was available anywhere — a weaker note; the operator is told. */
  thin: boolean;
}

export type VoiceNoteSelection =
  | { ok: true; evidence: VoiceNoteEvidence; note: string | null }
  | { ok: false; code: 'no_results' | 'no_miss' | 'no_competitors'; reason: string };

/** A miss's names made usable for a script: self-exclusion, whitespace collapse, de-dup, max three.
 *  The report's run-level suppression and junk gate are applied BEFORE this (scoreHookRun's
 *  cleanCompetitors), so a suppressed run arrives here with no names at all. */
export function usableVoiceNoteRivals(names: readonly string[], business: string): string[] {
  return usableRivals(excludeSelfRivals(names, business, nameMatches));
}

export function selectVoiceNoteEvidence(
  results: readonly HookResult[],
  ctx: { business: string; town: string; trade: string },
): VoiceNoteSelection {
  const valid = results.filter((r) => r.status === 'named' || r.status === 'not_named');
  if (!valid.length) return { ok: false, code: 'no_results', reason: 'The audit has no answered searches to quote.' };
  const misses = valid.filter((r) => r.status === 'not_named');
  if (!misses.length) {
    return { ok: false, code: 'no_miss', reason: `Every answered search named ${ctx.business || 'the business'}, so there is no missed search to talk about.` };
  }
  const engineRank = (e: string) => {
    const i = (HOOK_PICK_ENGINE_ORDER as readonly string[]).indexOf(e);
    return i < 0 ? HOOK_PICK_ENGINE_ORDER.length : i;
  };
  const candidates = misses.map((m) => {
    const competitors = usableVoiceNoteRivals(m.competitors, ctx.business);
    return { m, competitors, score: hookMissScore({ question: m.question, competitors }, { town: ctx.town, trade: ctx.trade }) };
  }).filter((c) => c.competitors.length > 0);
  if (!candidates.length) {
    return { ok: false, code: 'no_competitors', reason: 'The missed searches have no usable competitor names (none extracted, or the names were withheld as unreliable), so there is nothing honest to name.' };
  }
  const order = (a: typeof candidates[number], b: typeof candidates[number]) =>
    engineRank(a.m.engine) - engineRank(b.m.engine)
    || Number(b.competitors.length >= 3) - Number(a.competitors.length >= 3)
    || b.score - a.score
    || a.m.questionIndex - b.m.questionIndex;
  const strong = candidates.filter((c) => c.competitors.length >= 2).sort(order);
  const pick = strong[0] ?? candidates.sort(order)[0];
  const thin = pick.competitors.length < 2;
  const geminiMissed = misses.some((m) => m.engine === 'gemini');
  const note = thin
    ? `Only one usable competitor name was found in any missed search (${hookEngineLabel(pick.m.engine)}). The note names just that one.`
    : pick.m.engine !== 'gemini' && geminiMissed
      ? 'Google AI missed them too, but without two usable competitor names, so the ChatGPT result is used.'
      : null;
  return {
    ok: true,
    evidence: {
      questionIndex: pick.m.questionIndex, question: pick.m.question, engine: pick.m.engine,
      engineLabel: hookEngineLabel(pick.m.engine), competitors: pick.competitors,
      answerExcerpt: pick.m.answerExcerpt, thin,
    },
    note,
  };
}

/* ─────────────────────────────── 2. the website findings ─────────────────────────────── */

/* ⛔ A PROFILE PAGE IS NOT "YOUR WEBSITE" (Paul, 2026-09-26). Firebeard Electrical's website on record
   is tradehq.co.uk/firebeardelectrical — a directory profile. Researching it as their site produced
   "nothing obviously broken" about a page they do not own. So the lead's website is CLASSIFIED first:
   a directory / social profile is never researched, and the script says what it really is. The host
   lists are aggregators.ts (the shared "not an own website" sets) plus the trade-profile platforms it
   does not carry; the additions live here so this does not change what other features call a directory. */
const EXTRA_PROFILE_HOSTS = ['tradehq.co.uk', 'houzz.co.uk', 'houzz.com', 'linktr.ee', 'myhammer.co.uk', 'localheroes.com', 'yably.co.uk'];
const SOCIAL_HOSTS = ['facebook.com', 'fb.com', 'fb.me', 'm.me', 'instagram.com', 'instagr.am', 'tiktok.com', 'x.com', 'twitter.com', 'linkedin.com', 'youtube.com', 'pinterest.com', 'linktr.ee'];
const PROFILE_LABELS: Record<string, string> = {
  'tradehq.co.uk': 'TradeHQ', 'checkatrade.com': 'Checkatrade', 'mybuilder.com': 'MyBuilder', 'ratedpeople.com': 'Rated People',
  'trustatrader.com': 'TrustATrader', 'bark.com': 'Bark', 'yell.com': 'Yell', 'yell.co.uk': 'Yell', 'houzz.co.uk': 'Houzz', 'houzz.com': 'Houzz',
  'freeindex.co.uk': 'FreeIndex', 'thomsonlocal.com': 'Thomson Local', 'yelp.com': 'Yelp', 'yelp.co.uk': 'Yelp', 'nextdoor.co.uk': 'Nextdoor',
  'nextdoor.com': 'Nextdoor', 'facebook.com': 'Facebook', 'fb.com': 'Facebook', 'fb.me': 'Facebook', 'instagram.com': 'Instagram',
  'linkedin.com': 'LinkedIn', 'tiktok.com': 'TikTok', 'x.com': 'X', 'twitter.com': 'X', 'youtube.com': 'YouTube', 'linktr.ee': 'Linktree',
  'google.com': 'Google', 'business.google.com': 'Google', 'myhammer.co.uk': 'MyHammer', 'localheroes.com': 'Local Heroes', 'yably.co.uk': 'Yably',
};

export type SiteSource = 'own_site' | 'directory_profile' | 'social_profile' | 'none';
export interface LeadWebsiteKind { source: SiteSource; host: string; label: string | null }

const onHost = (host: string, list: readonly string[]) => list.find((d) => host === d || host.endsWith(`.${d}`)) ?? null;

export function classifyLeadWebsite(url: string | null | undefined): LeadWebsiteKind {
  const raw = (url ?? '').trim();
  if (!raw) return { source: 'none', host: '', label: null };
  const host = domainOf(raw);
  if (!host) return { source: 'none', host: '', label: null };
  const social = onHost(host, SOCIAL_HOSTS);
  if (social) return { source: 'social_profile', host, label: PROFILE_LABELS[social] ?? social };
  const extra = onHost(host, EXTRA_PROFILE_HOSTS);
  if (extra || isAggregatorUrl(raw)) {
    const key = extra ?? Object.keys(PROFILE_LABELS).find((d) => host === d || host.endsWith(`.${d}`)) ?? host;
    return { source: 'directory_profile', host, label: PROFILE_LABELS[key] ?? host };
  }
  return { source: 'own_site', host, label: null };
}

/** What the script may say about the site. */
export type VoiceNoteSiteMode =
  /** One or two real findings to explain. */
  | 'findings'
  /** The site was read and nothing strong enough was found → the honest fallback. */
  | 'clean'
  /** The site could not be read today and no earlier crawl measured anything → say nothing specific. */
  | 'unread'
  /** The "website" on record is a directory or social profile, not their own site. Never researched. */
  | 'profile'
  /** No website on record. */
  | 'no_website';

export interface VoiceNoteSite {
  mode: VoiceNoteSiteMode;
  findings: ResearchFinding[];
  source: SiteSource;
  /** The profile platform's name ("TradeHQ") when source is a profile. */
  sourceLabel: string | null;
  /** Services their OWN site says they offer (research). Empty = none confirmed. */
  services: string[];
  /** Everything that may license naming a service: their services, the site summary, and the
   *  findings' own page-derived details (never a rule's generic examples). */
  serviceEvidence: string;
}

/* ⛔ A RULE'S GENERIC EXAMPLES ARE NOT THE BUSINESS'S SERVICES. The missing-core-pages finding says
   "electrical work such as rewiring, fuse boards, testing or emergency call-outs" for EVERY electrician
   — those are the rule's examples of what a page could cover, not something this business was seen to
   offer. They reached a draft as "there aren't pages for rewiring, fuse boards or testing". So they are
   stripped from what the model sees, from "Based on", and from the service evidence. */
const GENERIC_EXAMPLES = /\bsuch as\b/i;
export function findingDetailsForScript(f: ResearchFinding): string[] {
  return sayableDetails(f).filter((d) => !GENERIC_EXAMPLES.test(d));
}
export function findingTextForScript(f: ResearchFinding): string {
  if (f.kind === 'missing_core_service_pages') {
    return 'None of the pages linked from their homepage is about one of the services they offer, so there is less on the site that clearly says what they do and where.';
  }
  return f.detail.replace(/,?\s*such as [^.;]*/gi, '').trim();
}

export function selectVoiceNoteFindings(research: WarmLeadResearch | null | undefined, website: string | null | undefined, town?: string | null): VoiceNoteSite {
  const kind = classifyLeadWebsite(website);
  const base = { source: kind.source, sourceLabel: kind.label, services: [] as string[], serviceEvidence: '' };
  if (kind.source === 'none' || research?.status === 'no_website') return { ...base, mode: 'no_website', findings: [] };
  if (kind.source !== 'own_site') return { ...base, mode: 'profile', findings: [] };
  const readOk = !!research && research.status !== 'failed';
  const services = readOk ? (research!.services ?? []).map((s) => s.trim()).filter(Boolean) : [];
  const sel = selectReplyFindings(research, [], town ?? null, null);
  const findings = sel.primary ? [sel.primary, ...sel.secondary].slice(0, VOICE_NOTE_MAX_FINDINGS) : [];
  const serviceEvidence = [...services, readOk ? research!.businessSummary ?? '' : '', ...findings.flatMap(findingDetailsForScript)].join(' | ');
  const withEvidence = { ...base, services, serviceEvidence };
  if (findings.length) return { ...withEvidence, mode: 'findings', findings };
  return { ...withEvidence, mode: readOk ? 'clean' : 'unread', findings: [] };
}

/** The compact record of a finding kept with the script and shown under "Based on". */
export interface VoiceNoteFindingRecord {
  id: string; kind: string; title: string; source: string; details: string[];
}
export function findingRecord(f: ResearchFinding): VoiceNoteFindingRecord {
  return { id: f.id, kind: f.kind, title: f.title, source: findingSourceLabel(f), details: findingDetailsForScript(f) };
}

/* ─────────────────────────────── 3. the prompt ─────────────────────────────── */

export const VOICE_NOTE_SYSTEM_PROMPT = `You write WhatsApp voice-note scripts for Paul, a British guy who helps local trades businesses get named by AI search (ChatGPT and Google AI). Paul reads the script out loud and records it himself. You return ONLY the script, via the return_script tool.

GOAL. It must sound like Paul personally:
1. searched for this type of business in their area,
2. noticed the AI engine recommended competitors instead,
3. had a look at the prospect's website to see what might be contributing,
4. found the strongest genuine issue(s),
5. mentions he specialises in AI visibility for local businesses,
6. offers to explain what he'd change.
This is NOT a hard sell. It sounds like a genuine voice note from a trades-focused marketer, not a scripted sales pitch.

FLOW (broadly):
"hi mate, i was looking for a [trade] in [area]..." → say which AI engine you asked, using the ENGINE NAME you are given, exactly → name the competitors it recommended, exactly as given, all of them and no others → explain naturally, and hedged, that if AI is recommending other firms instead, that can mean potential customers going elsewhere → say you had a look at their site to see what might be contributing → explain the website point(s) you are given, in very plain English, keeping their concrete details → say you specialise in AI visibility for local businesses → offer softly to explain what you'd change to give them a better chance of being named in those searches.

STYLE: relaxed, conversational, straightforward, British. "mate" is natural. Short sentences. Spoken, not written: it should sound right read aloud. Not corporate, not over-polished, not aggressive, not cheesy, not salesy. Natural phrases like "i had a quick look", "a couple of things stood out", "that's probably not ideal", "that's the sort of thing i work on" are good. Lowercase is fine.
NEVER: "I hope this message finds you well", "unlock your potential", "leverage", "digital presence", "revolutionise", "dominate Google", any guarantee of rankings or recommendations. No em dash or en dash, anywhere. No price, no figures about money, no link, no website address. Do not ask for a call unless it flows naturally.

LENGTH: about 90 to 130 spoken words (35 to 55 seconds). Do not make it an audit.

EVIDENCE RULES, which override everything:
- The competitors are exactly the ones listed, from that one search on that one engine. Never add, swap or drop a competitor. If only one or two are listed, name just those, naturally.
- Say the engine exactly as given ("Google AI" or "ChatGPT"). Never name the other engine as the one you asked.
- Website points: ONLY the ones in WEBSITE POINTS. Never invent or add a problem. Never claim a technical issue that is not listed.
- If there are no website points, follow the NO WEBSITE POINTS instruction exactly in spirit, with a natural variation.
- LOST WORK IS A POSSIBILITY, NEVER A FACT. Never "that's work going straight to someone else", "you're losing jobs", "that's people ringing them instead". Say "that can mean potential customers going elsewhere", "that could be work going to someone else".
- SERVICES: never name a specific service or job type (rewiring, fuse boards, boiler repairs, lock changes...) unless it is listed under SERVICES THEY OFFER or is in the search itself. Otherwise say "the work you do" or "your main services".
- If the WEBSITE on record is a profile page (see WEBSITE SOURCE), it is NOT their website: never call it "your website" or "your site", and never say you looked through their site.
- CAUSATION: never say a website issue is why the AI engine left them out. Never "this is why", "that's why", "the reason you're not showing". Use "might be contributing", "could be making it harder for AI to properly understand the site", "a couple of things stood out".

OUTPUT: only the script text Paul will read. No heading, no bullet points, no notes, no quotation marks around it.`;

export const VOICE_NOTE_TOOL = {
  type: 'function',
  function: {
    name: 'return_script',
    description: 'Return the voice-note script Paul will read aloud.',
    parameters: {
      type: 'object',
      properties: { script: { type: 'string', description: 'The spoken script only.' } },
      required: ['script'],
      additionalProperties: false,
    },
  },
} as const;

export interface VoiceNotePromptInput {
  business: string;
  trade: string;
  area: string;
  website: string | null;
  evidence: VoiceNoteEvidence;
  site: VoiceNoteSite;
  /** The previous script, on Regenerate, so the next one is not a copy. */
  avoid?: string | null;
  /** Problems with the previous attempt, on the one automatic rewrite. */
  rewriteProblems?: string[] | null;
}

const NO_POINT_LINES: Record<Exclude<VoiceNoteSiteMode, 'findings'>, string> = {
  clean: 'NO WEBSITE POINTS: the site was checked and nothing obviously broken was found. Say something like: "i had a look through the site and there isn\'t anything obviously broken, but there are definitely a few things i\'d strengthen around how clearly it tells Google and AI what you do, where you work and why it should trust the business." Do not claim any specific fault.',
  unread: 'NO WEBSITE POINTS: the site could not be read properly today, so say nothing specific about it. Say something like: "i had a quick look at how the business comes across online and there are a few things i\'d strengthen around how clearly it tells Google and AI what you do, where you work and why it should trust you." Do not claim any specific fault.',
  profile: 'NO WEBSITE POINTS: the only web page on record is their {LABEL} profile, not a website of their own. Say, naturally, that you couldn\'t find a website of their own, just their {LABEL} profile, and that without their own site there\'s a lot less for AI to go on about what they do and where they work. Never call the profile their website. Do not claim anything else.',
  no_website: 'NO WEBSITE POINTS: there is no website on record for this business. Say, naturally, that you couldn\'t find a website for them, and that without one it is much harder for AI to find much about the business. Do not claim anything else.',
};

/** The words to say the trade with ("a plumber"), or the raw trade when it cannot be read. */
export function spokenTrade(trade: string): string {
  const t = articleTrade(trade);
  return t.ok ? t.value : trade.trim();
}

export function buildVoiceNotePrompt(input: VoiceNotePromptInput): string {
  const e = input.evidence;
  const lines: string[] = [
    `BUSINESS: ${input.business}`,
    `TRADE: ${input.trade} (say it like "${spokenTrade(input.trade)}")`,
    `AREA: ${input.area}`,
    `WEBSITE: ${input.website?.trim() || 'none on record'}`,
    `WEBSITE SOURCE: ${input.site.source === 'own_site' ? 'their own website' : input.site.source === 'none' ? 'none' : `a ${input.site.sourceLabel ?? 'directory'} profile page, NOT their own website`}`,
    input.site.services.length
      ? `SERVICES THEY OFFER (from their own site): ${input.site.services.slice(0, 8).join(', ')}`
      : 'SERVICES THEY OFFER: none confirmed. Do not name any specific service or job type unless it is in the search.',
    '',
    `ENGINE NAME (say exactly this): ${e.engineLabel}`,
    `THE SEARCH YOU ASKED ${e.engineLabel.toUpperCase()}: "${e.question}"`,
    `${input.business} was NOT named in ${e.engineLabel}'s answer.`,
    `COMPETITORS ${e.engineLabel.toUpperCase()} NAMED FOR THIS EXACT SEARCH (name all ${e.competitors.length}, exactly, no others):`,
    ...e.competitors.map((c, i) => `${i + 1}. ${c}`),
    '',
  ];
  if (input.site.mode === 'findings') {
    lines.push('WEBSITE POINTS (use the first; the second only if it fits naturally; nothing else about the site):');
    input.site.findings.forEach((f, i) => {
      const details = findingDetailsForScript(f);
      lines.push(`${i + 1}. ${f.title}: ${findingTextForScript(f)}${details.length ? ` Concrete details to keep: ${details.join(' | ')}` : ''}`);
    });
  } else {
    lines.push(NO_POINT_LINES[input.site.mode].split('{LABEL}').join(input.site.sourceLabel ?? 'directory'));
  }
  if (input.avoid?.trim()) {
    lines.push('', 'A PREVIOUS VERSION (write a fresh one; same facts, different wording and rhythm):', input.avoid.trim());
  }
  if (input.rewriteProblems?.length) {
    lines.push('', 'YOUR LAST ATTEMPT HAD THESE PROBLEMS. Rewrite it, keeping it natural, and fix every one:', ...input.rewriteProblems.map((p) => `- ${p}`));
  }
  return lines.join('\n');
}

export function parseVoiceNoteScript(args: unknown): string | null {
  const s = (args as { script?: unknown } | null)?.script;
  return typeof s === 'string' && s.trim() ? s.trim() : null;
}

/* ─────────────────────────────── 4. the checks ─────────────────────────────── */

export function wordCount(text: string): number {
  return (text.match(/[A-Za-z0-9£$][A-Za-z0-9'’£$.,-]*/g) ?? []).length;
}

const norm = (s: string) => s.toLowerCase().replace(/[’']/g, '').replace(/&/g, ' and ').replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim();
const LEGAL = /\b(ltd|limited|llp|plc|co|company|uk)\b/g;

/** Is this competitor clearly named in the script? Exact (normalised), or with a legal suffix dropped. */
export function competitorNamed(script: string, name: string): boolean {
  const s = ` ${norm(script)} `;
  const n = norm(name);
  if (!n) return false;
  if (s.includes(` ${n} `)) return true;
  /* A bracketed descriptor ("Able Group (Shrewsbury Service)") or a legal suffix may be left out when
     it is said aloud; the name itself may not. */
  const core = norm(name.replace(/\([^)]*\)/g, ' ')).replace(LEGAL, ' ').replace(/\s+/g, ' ').trim();
  return core.length >= 3 && s.includes(` ${core} `);
}

/** Dashes Paul does not use are replaced mechanically — never a reason for a worse rewrite. */
export function tidyScript(raw: string): string {
  return raw.trim()
    .replace(/^["“”']+|["“”']+$/g, '')
    .replace(/\s*[—–]\s*/g, ', ')
    .replace(/,\s*,/g, ',')
    .replace(/[ \t]+/g, ' ')
    .trim();
}

const CAUSATION: RegExp[] = [
  /\b(this|that|which|these|those|it) (is|are|was) (why|the reason|what (is )?(stopping|keeping))\b/,
  /\b(thats|its|whats) (why|the reason|stopping|keeping)\b/,
  /\bthe reason (you|google|chatgpt|ai|it|they|youre)\b/,
  /\bwhy (google|chatgpt|ai|it|they)( ai)? (isnt|didnt|doesnt|wont|is not|did not|does not|never)\b/,
  /\bbecause of (this|that|these|those)\b/,
  /\b(is|are) (stopping|preventing|keeping) (you|google|chatgpt|ai)\b/,
];
const PRICE = /£\s?\d|\b\d+\s?(quid|pounds|pence)\b|\bprice|\bpricing\b|\bper month\b|\bmonthly\b|\b(a|per) year\b|\bfee\b|\bdiscount/;
const LINK = /https?:\/\/|\bwww\.|\b[a-z0-9-]+\.(co\.uk|com|uk|live|net|org|io)\b|\bfindable\b/i;
const BANNED: Array<[RegExp, string]> = [
  [/hope (this|the) message finds you/, '"hope this message finds you well"'],
  [/\bunlock\b/, '"unlock"'], [/\bleverag/, '"leverage"'], [/digital presence/, '"digital presence"'],
  [/revolutionis|revolutioniz/, '"revolutionise"'], [/\bdominat/, '"dominate"'], [/guarantee/, 'a guarantee'],
];

/** A technical/website claim, and the findings that may back it. */
const CLAIMS: Array<{ label: string; re: RegExp; backed: (f: ResearchFinding) => boolean }> = [
  { label: 'blocked crawlers / robots', re: /\b(block\w*|crawler\w*|robots|bots?)\b/, backed: (f) => f.kind === 'crawl_indexing' && (/robots|block|crawler/.test(f.id) || /block/i.test(f.title)) },
  { label: 'noindex / hidden from search', re: /\b(noindex|no index|hidden from|told not to (list|show|index)|not (being )?indexed)\b/, backed: (f) => /noindex/.test(f.id) },
  { label: 'sitemap', re: /\bsitemap\b/, backed: (f) => /sitemap/.test(f.id) },
  { label: 'canonical', re: /\bcanonical\b/, backed: (f) => /canonical/.test(f.id) },
  { label: 'broken pages or links', re: /\b(broken|404|dead links?|doesnt load|dont load)\b/, backed: (f) => /broken/.test(f.id) || /broken/i.test(f.title) },
  { label: 'javascript / blank page', re: /\b(javascript|blank page|empty page|nearly empty)\b/, backed: (f) => /client_rendered|unreadable/.test(f.id) || /javascript/i.test(f.title) },
  { label: 'thin or duplicate pages', re: /\b(duplicat\w*|identical|copy and paste\w*|copied|thin|same (text|content|wording|page))\b/, backed: (f) => f.kind === 'thin_or_duplicate' || f.kind === 'title_h1' },
  { label: 'opening hours', re: /\bopening (hours|times)\b/, backed: (f) => f.kind === 'hours_conflict' },
  { label: 'phone numbers', re: /\b(phone numbers|contact numbers|different numbers)\b/, backed: (f) => f.kind === 'contact_conflict' },
  { label: 'nationwide vs local', re: /\b(nationwide|across the uk|uk wide|all over the country)\b/, backed: (f) => f.kind === 'positioning_conflict' },
  { label: 'missing service pages', re: /\b(no (proper |dedicated |separate )?pages?|missing pages?|(dont|doesnt|do not|does not) have (a |any )?(proper |dedicated |separate )?pages?|no page for)\b/, backed: (f) => f.kind === 'missing_core_service_pages' },
  { label: 'out-of-date content', re: /\b(out of date|outdated|old copyright)\b/, backed: (f) => f.kind === 'outdated_content' },
];

export interface VoiceNoteCheck {
  script: string;
  wordCount: number;
  /** Factual problems. One automatic rewrite, then shown to Paul as "check this script". */
  problems: string[];
  /** Worth a glance; never a rewrite. */
  warnings: string[];
}

/* ⛔ NAMED SERVICES NEED EVIDENCE (Paul, 2026-09-26). A model writing for "an electrician" reaches for
   rewiring and fuse boards whether or not this business does them. Common trade services are listed
   here; any one in the script must appear in the search, the trade, or what their OWN site says. */
const SERVICE_TERMS: readonly string[] = [
  // electrical
  'rewire', 'rewires', 'rewiring', 'fuse board', 'fuse boards', 'fuseboard', 'fuseboards', 'consumer unit', 'consumer units', 'eicr', 'eicrs',
  'pat testing', 'electrical testing', 'ev charger', 'ev chargers', 'ev charging', 'car charger', 'car chargers', 'lighting', 'sockets',
  'security lighting', 'cctv', 'solar panels', 'solar', 'call outs', 'callouts',
  // plumbing and heating
  'boiler', 'boilers', 'boiler repair', 'boiler repairs', 'boiler servicing', 'boiler installation', 'boiler installations', 'central heating',
  'bathroom', 'bathrooms', 'bathroom fitting', 'leak', 'leaks', 'drain', 'drains', 'drainage', 'blocked drains', 'radiator', 'radiators',
  'gas safety', 'landlord certificates', 'underfloor heating', 'heat pump', 'heat pumps', 'powerflush', 'power flush', 'power flushing',
  // locks
  'lock change', 'lock changes', 'lockout', 'lockouts', 'upvc', 'car keys', 'safes', 'key cutting', 'burglary repairs',
  // roofing and building
  'flat roof', 'flat roofs', 'guttering', 'gutters', 'chimney', 'chimneys', 'fascias', 'soffits', 'lead work', 'leadwork',
  'extension', 'extensions', 'loft conversion', 'loft conversions', 'plastering', 'rendering', 'driveway', 'driveways', 'patio', 'patios',
  'fencing', 'decking', 'landscaping', 'tarmac', 'block paving', 'kitchen', 'kitchens', 'kitchen fitting',
  // finishing and cleaning
  'painting', 'decorating', 'tiling', 'flooring', 'double glazing', 'conservatory', 'conservatories', 'carpet cleaning', 'oven cleaning',
  'end of tenancy', 'window cleaning', 'gutter cleaning',
];
const SERVICE_RE = new RegExp(`\\b(${[...SERVICE_TERMS].sort((a, b) => b.length - a.length).map((t) => t.replace(/ /g, ' ?')).join('|')})\\b`, 'g');
const stem = (w: string) => w.replace(/(ings|ing|es|s)$/, '');

/** The common trade services a (normalised) script names, longest match first. */
export function servicesNamed(normText: string): string[] {
  return [...new Set(normText.match(SERVICE_RE) ?? [])];
}
/** Does the (normalised) evidence support this service? Every word's stem must be present. */
export function serviceSupported(term: string, normEvidence: string): boolean {
  const words = term.split(' ').filter(Boolean);
  return words.length > 0 && words.every((w) => normEvidence.includes(stem(w)));
}

/* ⛔ LOST WORK IS A POSSIBILITY, NEVER A FACT (Paul, 2026-09-26). "that's work going straight to someone
   else" asserts what happened to a stranger's customers; nobody measured that. A lost-work sentence must
   carry a hedge (can / could / may / might / potentially). */
const LOST_WORK = /\b(going|goes|go|went) (straight |right )?(to (someone|somebody|them|whoever|another)|elsewhere)|\bto someone else\b|\b(losing|lose|lost) (out|work|jobs|customers|business|money|calls|enquiries)\b|\b(ringing|calling|phoning) (them|someone else) instead\b|\bmissing out on (work|jobs|customers|calls)\b|\bgoes to whoever\b/;
const HEDGE = /\b(can|could|may|might|potentially|possibly|probably|likely|perhaps)\b/;
const sentencesOf = (text: string) => text.split(/(?<=[.!?])\s+|\n+/).filter((s) => s.trim());

/** "had a look at your site", "your website says", "on your site" — said of a page they do not own. */
const CALLS_IT_THEIR_SITE = /\b((look|looked|looking) (at|through|over) your (web ?site|site)|on your (web ?site|site)|your (web ?site|site) (is|has|says|shows|doesnt|isnt|looks|needs))\b/;

export function checkVoiceNoteScript(raw: string, ctx: { evidence: VoiceNoteEvidence; site: VoiceNoteSite; town?: string | null; trade?: string | null }): VoiceNoteCheck {
  const script = tidyScript(raw);
  const t = norm(script);
  /* The claim, link and phrase checks read the script WITHOUT the competitor names: "Block Paving Co"
     is not a claim about blocked crawlers, and a firm called "Plumbing.com" is not a link. */
  let bare = script;
  for (const c of ctx.evidence.competitors) bare = bare.split(c).join(' ');
  const tb = norm(bare);
  const problems: string[] = [];
  const warnings: string[] = [];

  // The competitors: all of them, from this one result.
  for (const c of ctx.evidence.competitors) {
    if (!competitorNamed(script, c)) problems.push(`Competitor not named exactly: ${c}.`);
  }
  // The engine: the one actually asked, never the other.
  /* ⛔ A CRAWLER'S NAME IS NOT AN ENGINE CLAIM. The first live script (RP Electrics) was flagged
     "mentions ChatGPT" for quoting the blocked crawler "ChatGPT-User" from its own finding. */
  const tEngine = t.replace(/\b(chat ?gpt user|oai searchbot|gptbot|claude user|perplexitybot|google extended|googlebot)\b/g, ' ');
  const saysGoogleAi = /\b(google ai|googles ai|google s ai|gemini)\b/.test(tEngine);
  const saysChatGpt = /\bchat ?gpt\b/.test(tEngine);
  if (ctx.evidence.engine === 'gemini') {
    if (!saysGoogleAi) problems.push('Does not say it was Google AI that was asked.');
    if (saysChatGpt) problems.push('Mentions ChatGPT, but these competitors came from Google AI.');
  } else if (ctx.evidence.engine === 'chatgpt') {
    if (!saysChatGpt) problems.push('Does not say it was ChatGPT that was asked.');
    if (saysGoogleAi) problems.push('Mentions Google AI, but these competitors came from ChatGPT.');
  }
  // Causation, price, link, banned phrases.
  if (CAUSATION.some((re) => re.test(tb))) problems.push('States a website issue as the reason the AI left them out. Use "might be contributing" instead.');
  if (PRICE.test(tb) || /£/.test(bare)) problems.push('Mentions a price or money.');
  if (LINK.test(bare)) problems.push('Contains a link or web address.');
  for (const [re, label] of BANNED) if (re.test(tb)) problems.push(`Uses ${label}.`);
  // Website claims must be backed by a supplied finding.
  const supplied = ctx.site.findings;
  // "there isn't anything obviously broken" is the honest fallback, not a claim.
  const claimText = tb.replace(/\b(isnt|is not|wasnt|was not|nothing|not|no)( [a-z]+){0,2} broken\b/g, ' ');
  /* A claim is also backed when the finding's OWN words carry it: a missing-pages finding whose menu
     reads "contact us | legal notice | sitemap" may be quoted without that being a sitemap claim. */
  const ownWords = (f: ResearchFinding) => norm([f.title, f.detail, ...sayableDetails(f)].join(' '));
  for (const claim of CLAIMS) {
    if (claim.re.test(claimText) && !supplied.some((f) => claim.backed(f) || claim.re.test(ownWords(f)))) problems.push(`Mentions ${claim.label}, but no website finding supports that.`);
  }
  // Services: only ones the search, the trade or their own site support.
  const supportedServices = norm([ctx.evidence.question, ctx.trade ?? '', ctx.site.serviceEvidence].join(' | '));
  for (const term of servicesNamed(tb)) {
    if (!serviceSupported(term, supportedServices)) problems.push(`Names a service ("${term}") that nothing on record says they offer.`);
  }
  // Lost work: a possibility, never a fact.
  for (const sentence of sentencesOf(bare)) {
    const s = norm(sentence);
    if (LOST_WORK.test(s) && !HEDGE.test(s)) {
      problems.push(`States lost work as a fact ("${sentence.trim().slice(0, 80)}"). Hedge it: "that can mean potential customers going elsewhere".`);
    }
  }
  // A profile page is not their website.
  if (ctx.site.mode === 'profile' && CALLS_IT_THEIR_SITE.test(tb)) {
    problems.push(`Calls the ${ctx.site.sourceLabel ?? 'directory'} profile their website.`);
  }
  // The strongest finding must actually be said.
  const primary = supplied[0];
  if (primary && !findingMentioned(script, primary, ctx.town ?? null)) problems.push(`Does not clearly explain the main website finding: ${primary.title}.`);
  // Length: a target, not a gate.
  const words = wordCount(script);
  if (words < VOICE_NOTE_HARD_WORDS.min) problems.push(`Far too short (${words} words, aim for ${VOICE_NOTE_TARGET_WORDS.min}–${VOICE_NOTE_TARGET_WORDS.max}).`);
  else if (words > VOICE_NOTE_HARD_WORDS.max) problems.push(`Far too long (${words} words, aim for ${VOICE_NOTE_TARGET_WORDS.min}–${VOICE_NOTE_TARGET_WORDS.max}).`);
  else if (words < VOICE_NOTE_NOTE_WORDS.min || words > VOICE_NOTE_NOTE_WORDS.max) warnings.push(`${words} words, a little outside the ${VOICE_NOTE_TARGET_WORDS.min}–${VOICE_NOTE_TARGET_WORDS.max} target.`);
  if (!/\bai visibility\b/.test(t)) warnings.push('Does not say Paul specialises in AI visibility.');
  if (/[—–]/.test(raw)) warnings.push('A dash was replaced with a comma.');
  return { script, wordCount: words, problems, warnings };
}

/** Of two attempts, the one with fewer factual problems; the later one on a tie. */
export function betterAttempt(a: VoiceNoteCheck, b: VoiceNoteCheck): VoiceNoteCheck {
  return b.problems.length <= a.problems.length ? b : a;
}
