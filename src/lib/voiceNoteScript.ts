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
   primary finding actually used. Length is a target, not a gate; only a script that is plainly too
   short or too long is sent back.

   🔴 THE SHAPE (Paul, 2026-09-27, generator v3). Five beats, 30–45 seconds, nothing padded:
     1. SEARCH CONTEXT, short: trade + town + engine ("i was looking for an electrician in Shrewsbury,
        so i asked Google AI who it recommended"). Never the audit query's qualifiers ("who can come
        today") — they are the tell of a machine-worded search.
     2. "it came up with X, Y and Z, but you didn't come up."
     3. "i had a look at why you weren't coming up and found something that could be holding you back" +
        ONE genuine finding (Paul, 2026-09-30: the natural wording, conclusion hedged). Never "this is why".
     4. "i actually specialise in AI visibility for local businesses."
     5. THE CTA ESTABLISHES WHO CONTROLS THE WEBSITE (voiceNoteCtaKind) — it decides whether Findable can
        optimise the site, work with the provider, or rebuild it. Never "i can send you the audit and show
        you exactly what i'd change": the quick check contains no change plan. A lead whose only page is a
        TradeHQ / Facebook profile is asked whether they have a site of their own, never "do you own your
        website?".

   THE PICK FOLLOWS THE CARD (2026-09-27): the Inbox card, the report and the Call Script all quote the
   hook pick (hookScore.ts), as does the send path. The voice note uses that same result whenever its
   answer has any usable name (one name is flagged thin); only a card result with NO usable names falls
   back to Paul's older order, and the operator is told which search the script used instead.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import { HOOK_PICK_ENGINE_ORDER, hookEngineLabel, hookMissScore, type HookPick, type HookResult } from './hookScore.ts';
import { usableRivals, excludeSelfRivals } from './rivalHook.ts';
import { nameMatches } from './nameMatch.ts';
import { articleTrade } from './templateVars.ts';
import { findingMentioned, sayableDetails, findingSourceLabel, selectReplyFindings } from './warmReply.ts';
import type { ResearchFinding, WarmLeadResearch } from './warmLeadResearch.ts';
import { classifyLeadWebsite, type SiteSource } from './leadWebsiteKind.ts';
import { SALES_STYLE_RULES, salesStyleProblems } from './salesStyle.ts';
import { callerFirstName } from './callerName.ts';

/** Bump when the prompt, the pick or the checks change in a way worth telling apart in stored rows.
 *  v4 (2026-09-30): the shared house style (salesStyle.ts) in the prompt and the checks, one beat per
 *  line so it reads aloud with a breath between, and the derived short version (shortVoiceNote). */
export const VOICE_NOTE_GENERATOR_VERSION = 5;
/** The stronger writing model (Paul, 2026-09-26: tone matters, ~1–2p a script is fine). */
export const VOICE_NOTE_MODEL = 'gpt-4o';
/** The spoken target, ~30–45 seconds at Paul's pace (Paul, 2026-09-27: shorter is better). */
export const VOICE_NOTE_TARGET_WORDS = { min: 65, max: 100 } as const;
/** Outside this a length is worth a note to Paul — never a rewrite. */
export const VOICE_NOTE_NOTE_WORDS = { min: 50, max: 110 } as const;
/** Outside this the script is plainly wrong-sized and is sent back once. */
export const VOICE_NOTE_HARD_WORDS = { min: 40, max: 125 } as const;
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

const evidenceOf = (m: HookResult, competitors: string[]): VoiceNoteEvidence => ({
  questionIndex: m.questionIndex, question: m.question, engine: m.engine,
  engineLabel: hookEngineLabel(m.engine), competitors, answerExcerpt: m.answerExcerpt, thin: competitors.length < 2,
});

/**
 * @param preferred the card's hook pick (score.hook). Used as it is whenever that exact result has two
 *        or more usable names — the Inbox card, the report and the Call Script quote it, so the voice
 *        note does too. Absent (an older caller) = Paul's original order alone.
 */
export function selectVoiceNoteEvidence(
  results: readonly HookResult[],
  ctx: { business: string; town: string; trade: string },
  preferred?: Pick<HookPick, 'questionIndex' | 'engine'> | null,
): VoiceNoteSelection {
  const valid0 = results.filter((r) => r.status === 'named' || r.status === 'not_named');
  const card = preferred
    ? valid0.find((r) => r.status === 'not_named' && r.questionIndex === preferred.questionIndex && r.engine === preferred.engine) ?? null
    : null;
  if (card) {
    const names = usableVoiceNoteRivals(card.competitors, ctx.business);
    /* ⛔ ONE SOURCE OF TRUTH (Paul, 2026-09-27): the card's result is used whenever its own answer has
       ANY usable name. One name is a thinner note, flagged, never a different search. */
    if (names.length >= 1) {
      return { ok: true, evidence: evidenceOf(card, names), note: names.length < 2 ? `Only one usable competitor name in this search's answer (${hookEngineLabel(card.engine)}). The note names just that one.` : null };
    }
  }
  const fallback = selectVoiceNoteEvidenceByOrder(results, ctx);
  if (card && fallback.ok) {
    const e = fallback.evidence;
    if (e.questionIndex !== card.questionIndex || e.engine !== card.engine) {
      const why = `The best missed search on the card (${hookEngineLabel(card.engine)}, question ${card.questionIndex + 1}) has no usable competitor names, so this script uses ${e.engineLabel}, question ${e.questionIndex + 1} instead.`;
      return { ...fallback, note: fallback.note ? `${why} ${fallback.note}` : why };
    }
  }
  return fallback;
}

function selectVoiceNoteEvidenceByOrder(
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

/* The website classification (own site vs directory / social profile) lives in leadWebsiteKind.ts,
   shared with the Cold Call Playbook. Re-exported here for existing callers. */
export { classifyLeadWebsite, type SiteSource, type LeadWebsiteKind } from './leadWebsiteKind.ts';

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

const INTERPRETIVE_KINDS: ReadonlySet<string> = new Set(['weak_evidence', 'outdated_content', 'other']);
/** A judgement read into the page (a model's reading, or a soft kind) rather than something measured. */
export function isInterpretiveFinding(f: ResearchFinding): boolean {
  return f.source === 'model' || INTERPRETIVE_KINDS.has(f.kind);
}

export function selectVoiceNoteFindings(research: WarmLeadResearch | null | undefined, website: string | null | undefined, town?: string | null): VoiceNoteSite {
  const kind = classifyLeadWebsite(website);
  const base = { source: kind.source, sourceLabel: kind.label, services: [] as string[], serviceEvidence: '' };
  if (kind.source === 'none' || research?.status === 'no_website') return { ...base, mode: 'no_website', findings: [] };
  if (kind.source !== 'own_site') return { ...base, mode: 'profile', findings: [] };
  const readOk = !!research && research.status !== 'failed';
  const services = readOk ? (research!.services ?? []).map((s) => s.trim()).filter(Boolean) : [];
  const sel = selectReplyFindings(research, [], town ?? null, null);
  /* ⛔ CONCRETE FIRST (Paul, 2026-09-27). A measured / rule-checked finding (crawlers blocked, no
     service pages, duplicate pages, conflicting details, broken pages) always beats an interpretive one
     (a model's reading, "weak evidence of qualifications"). The interpretive kind is used only when
     nothing concrete exists, and is then written as observation, never as a verdict. */
  const pool = sel.primary ? [sel.primary, ...sel.secondary, ...sel.strongNotUsed] : [];
  const concrete = pool.filter((f) => !isInterpretiveFinding(f));
  const findings = (concrete.length ? concrete : pool).slice(0, VOICE_NOTE_MAX_FINDINGS);
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

THE SHAPE, five short beats, in this order. Every sentence has to earn its place:
0. WHO IS SPEAKING, first, in a few words: "hi mate, it's Paul from Findable." Use the name given under WHO IS SPEAKING (Paul when none is given). Never skip it: the owner has to know who is talking before anything else.
1. SEARCH CONTEXT, one short sentence: the trade, the town and the engine, nothing else. "hi mate, i asked Google AI for an electrician in Shrewsbury" or "hi mate, i was looking for an electrician in Shrewsbury, so i asked Google AI". No adjective on the trade ("a reliable electrician", "a trusted electrician") and no reason for the search. Do NOT read the search back and do NOT narrate its qualifiers ("who can come out today", "near me", "for a same-day job", "UK"). At most ONE word of the search may colour the trade, and only if it is the heart of it (an "emergency locksmith"); usually leave it out.
2. THE MISS, one sentence: "it came up with [the competitors], but you didn't come up." Name every competitor given, exactly, and no others.
3. THE FINDING: "i had a look at why you weren't coming up and found something that could be holding you back:" (or "a few things that could be holding you back" ONLY when you are given two website points) + the website point, in very plain English, keeping its concrete details. Use a second point only if it is the same kind of problem and fits in the same sentence. The conclusion stays hedged: "could be holding you back", never "this is why".
4. POSITIONING, one short sentence: "i actually specialise in AI visibility for local businesses." Do not explain the service.
5. THE QUESTION (the CTA line you are given): a simple question about who owns and controls their website. It ends the note. Nothing after it.

LENGTH: about 65 to 100 spoken words (30 to 45 seconds). Shorter is better when the evidence is simple. Never pad, never over 125.
LAYOUT: put each beat on its own line, so Paul can take a breath between them. Short clauses he can say in one go; no sentence he would have to read twice.

STYLE: Paul talking into his phone, not reading. Relaxed, British, conversational, direct. Contractions everywhere (i'm, i'd, you're, didn't, there's, it's). Short sentences, simple joins ("and", "so", "but"). "mate" once or twice, never more. No corporate language, nothing polished, nothing salesy. Lowercase is fine.

${SALES_STYLE_RULES}
TALK TO THEM: the note is addressed to the business owner. Never say the business's own name; say "you" ("you didn't come up").
NEVER put the search in quotation marks, never read it word for word, never say "UK" after the town.
NEVER: "I hope this message finds you well", "unlock your potential", "leverage", "digital presence", "revolutionise", "dominate Google", any guarantee. No em dash or en dash. No price, no figures about money, no link, no website address. Do not offer to send the audit, do not offer to "show you exactly what i'd change" or "explain what i'd change": the quick check does not contain a change plan. Do not ask for a call.

EVIDENCE RULES, which override everything:
- The competitors are exactly the ones listed, from that one search on that one engine. Never add, swap or drop one. If only one or two are listed, name just those.
- Say the engine exactly as given ("Google AI" or "ChatGPT"). Never name the other engine as the one you asked.
- Website points: ONLY the ones in WEBSITE POINTS. Never invent or add a problem. Never claim a technical issue that is not listed.
- OBSERVATION, NOT JUDGEMENT: say what the site says or shows, and what it doesn't show. "your service pages don't give much detail about the work you actually do" is right; "you have weak evidence of qualifications", "there's no evidence" or "your site is poor" are judgements, never say them.
- If there are no website points, follow the NO WEBSITE POINTS instruction in spirit, with a natural variation.
- SERVICES: never name a specific service or job type (rewiring, fuse boards, boiler repairs, lock changes...) unless it is listed under SERVICES THEY OFFER or is in the search itself. Otherwise say "the work you do" or "your main services".
- If the WEBSITE on record is a profile page (see WEBSITE SOURCE), it is NOT their website: never call it "your website" or "your site", never say you looked through their site, and never ask whether they own their website.
- CAUSATION: never say a website issue is why the AI engine left them out, and never say you looked into why the engine recommended the others. Never "this is why", "that's why", "that's why your competitors are being recommended", "the reason you're not showing", "i looked into why google recommended them". "i had a look at why you weren't coming up" is fine; what you found only "could be holding you back".
- LOST WORK: do not add a sentence about lost customers. If one slips in it must be a possibility ("that can mean"), never a fact.

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
  /** Who records it: the signed-in person's first name (callerName.ts). Absent = the book owner's. */
  caller?: string | null;
}

const NO_POINT_LINES: Record<Exclude<VoiceNoteSiteMode, 'findings'>, string> = {
  clean: 'NO WEBSITE POINTS: the site was checked and nothing obviously broken was found. Say, briefly, something like: "i had a look at why you weren\'t coming up, and nothing\'s obviously broken on the site, but there\'s a few things i\'d tighten up around how clearly it tells AI what you do and where." Do not claim any specific fault.',
  unread: 'NO WEBSITE POINTS: the site could not be read properly today, so say nothing specific about it. Say, briefly, something like: "i had a look at why you weren\'t coming up, and there\'s a few things i\'d tighten up around how clearly you come across to AI." Do not claim any specific fault.',
  profile: 'NO WEBSITE POINTS: the only web page on record is their {LABEL} profile, not a website of their own. Say, naturally: "i had a look at why you weren\'t coming up, and i couldn\'t find a website of your own, just your {LABEL} profile." Never call the profile their website. Do not claim anything else.',
  no_website: 'NO WEBSITE POINTS: there is no website on record for this business. Say, naturally: "i had a look at why you weren\'t coming up, and i couldn\'t find a website for you." Do not claim anything else.',
};

/* ─────────────────────────────── the CTA: who controls the website ─────────────────────────────── */

/** Which ownership question ends the note (Paul, 2026-09-27). Derived from the website on record:
 *    own_site   → "do you own and control the website yourself, or is it managed by an agency?"
 *    profile    → "have you got a website of your own as well, or is [TradeHQ] basically what you're using?"
 *    no_website → "have you got a website at the moment, or not yet?"
 *  ⛔ A profile page is never "your website", so it never gets the own-site question. */
export type VoiceNoteCtaKind = 'own_site' | 'profile' | 'no_website';
export function voiceNoteCtaKind(site: Pick<VoiceNoteSite, 'mode' | 'source'>): VoiceNoteCtaKind {
  if (site.mode === 'profile' || site.source === 'directory_profile' || site.source === 'social_profile') return 'profile';
  if (site.mode === 'no_website' || site.source === 'none') return 'no_website';
  return 'own_site';
}

export function voiceNoteCtaInstruction(site: Pick<VoiceNoteSite, 'mode' | 'source' | 'sourceLabel'>): string {
  const label = site.sourceLabel ?? 'directory';
  switch (voiceNoteCtaKind(site)) {
    case 'own_site':
      return 'CTA LINE (end with this question, in a natural variation): "quick one mate, do you own and control the website yourself, or is it managed by an agency?" Variations like "do you control the website yourself, mate, or does an agency manage it for you?" or "just so i know what would actually be possible, do you own the site yourself or is it with an agency?" are fine. It must ask whether they own or control the site, or whether an agency manages it.';
    case 'profile':
      return `CTA LINE (end with this question, in a natural variation): "have you got a website of your own as well, or is ${label} basically what you're using at the moment?" or "do you have a site of your own that you control, mate, or are you mainly using the ${label} profile?" It must name ${label}. Never ask whether they own "the website" or "your website": the ${label} page is not theirs.`;
    case 'no_website':
      return 'CTA LINE (end with this question, in a natural variation): "have you got a website at the moment, mate, or not yet?" Never assume they have one.';
  }
}

/** The words to say the trade with ("a plumber"), or the raw trade when it cannot be read. */
export function spokenTrade(trade: string): string {
  const t = articleTrade(trade);
  return t.ok ? t.value : trade.trim();
}

/* ─────────────────────────────── the short version (derived, never stored) ─────────────────────────────── */

/**
 * The 20-second version (Paul, 2026-09-30: "where appropriate, a short version and a slightly longer
 * one"). The SAME saved result — engine, that search's own competitors, the ownership question for this
 * website — with the website finding and the positioning detail left out. Built by code from the saved
 * row, so it costs nothing, invents nothing and always agrees with the full script beside it.
 * Returns null when there is not enough to say it honestly (no names, no trade).
 */
export function shortVoiceNote(i: {
  engineLabel: string; competitors: readonly string[]; trade: string | null | undefined; area: string | null | undefined;
  site: Pick<VoiceNoteSite, 'mode' | 'source' | 'sourceLabel'>;
  /** Who records it (callerName.ts); absent = the book owner. Said first (fix workstream 5, 2026-10-04). */
  caller?: string | null;
}): string | null {
  const names = i.competitors.map((c) => c.trim()).filter(Boolean).slice(0, 3);
  const t = articleTrade(i.trade ?? '');
  const town = String(i.area ?? '').replace(/,?\s*\b(?:UK|United Kingdom)$/i, '').trim();
  if (!names.length || !t.ok || !i.engineLabel.trim()) return null;
  const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
  const label = i.site.sourceLabel ?? 'directory';
  /* No "quick one" (filler, Session A A-21). With no website on file it confirms rather than interrogates. */
  const ask = voiceNoteCtaKind(i.site) === 'own_site'
    ? 'do you look after the website yourself, or is it managed by an agency?'
    : voiceNoteCtaKind(i.site) === 'profile'
      ? `have you got a website of your own, or is ${label} mainly what you're using?`
      : "have you got a website i missed, or is it something you've not got round to?";
  return [
    `hi mate, it's ${callerFirstName(i.caller)} from Findable. i asked ${i.engineLabel} for ${t.value}${town ? ` in ${town}` : ''} and it came up with ${list}, but you didn't come up.`,
    'i specialise in AI visibility for local businesses.',
    ask,
  ].join('\n');
}

export function buildVoiceNotePrompt(input: VoiceNotePromptInput): string {
  const e = input.evidence;
  const lines: string[] = [
    `WHO IS SPEAKING (open with it, e.g. "hi mate, it's ${callerFirstName(input.caller)} from Findable"): ${callerFirstName(input.caller)} from Findable`,
    `BUSINESS (you are talking TO them; never say this name in the script): ${input.business}`,
    `TRADE: ${input.trade} (say it like "${spokenTrade(input.trade)}")`,
    `AREA: ${input.area}`,
    `WEBSITE: ${input.website?.trim() || 'none on record'}`,
    `WEBSITE SOURCE: ${input.site.source === 'own_site' ? 'their own website' : input.site.source === 'none' ? 'none' : `a ${input.site.sourceLabel ?? 'directory'} profile page, NOT their own website`}`,
    input.site.services.length
      ? `SERVICES THEY OFFER (from their own site): ${input.site.services.slice(0, 8).join(', ')}`
      : 'SERVICES THEY OFFER: none confirmed. Do not name any specific service or job type unless it is in the search.',
    '',
    `ENGINE NAME (say exactly this): ${e.engineLabel}`,
    `THE SEARCH YOU ASKED ${e.engineLabel.toUpperCase()} (for meaning only; say it as just "${spokenTrade(input.trade)} in ${input.area}", never read it out, quote it or narrate its qualifiers): ${e.question}`,
    `${input.business} was NOT named in ${e.engineLabel}'s answer.`,
    `COMPETITORS ${e.engineLabel.toUpperCase()} NAMED FOR THIS EXACT SEARCH (name all ${e.competitors.length}, exactly, no others):`,
    ...e.competitors.map((c, i) => `${i + 1}. ${c}`),
    '',
  ];
  if (input.site.mode === 'findings') {
    lines.push('WEBSITE POINTS (use the first; the second only if it is the same kind of problem and fits the same sentence; nothing else about the site):');
    input.site.findings.forEach((f, i) => {
      const details = findingDetailsForScript(f);
      // An interpretive finding goes in as what the page SAYS, with no evaluative title ("Weak Evidence…").
      lines.push(isInterpretiveFinding(f)
        ? `${i + 1}. OBSERVATION ONLY (say what the site says and what it doesn't show; no verdict words like weak, poor or no evidence): ${findingTextForScript(f)}${details.length ? ` What the site actually says: ${details.join(' | ')}` : ''}`
        : `${i + 1}. ${f.title}: ${findingTextForScript(f)}${details.length ? ` Concrete details to keep: ${details.join(' | ')}` : ''}`);
    });
  } else {
    lines.push(NO_POINT_LINES[input.site.mode].split('{LABEL}').join(input.site.sourceLabel ?? 'directory'));
  }
  lines.push('', voiceNoteCtaInstruction(input.site));
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
  /\b(looked|look|looking|dug|digging) into why\b/,
  /\bwhy (google( ai)?|chatgpt|ai|it|they) (recommended|picked|chose|went with|named)\b/,
];
const PRICE = /£\s?\d|\b\d+\s?(quid|pounds|pence)\b|\bprice|\bpricing\b|\bper month\b|\bmonthly\b|\b(a|per) year\b|\bfee\b|\bdiscount/;
/* ⛔ "from Findable" is the speaker saying who they are (fix workstream 5, 2026-10-04: a voice note must say who is
   talking) — the bare brand word is allowed; the ADDRESS, written or said ("findable dot live"), is still a link. */
const LINK = /https?:\/\/|\bwww\.|\b[a-z0-9-]+\.(co\.uk|com|uk|live|net|org|io)\b|\bfindable\s+dot\s+live\b/i;
/* The general filler ("hope this finds you", "unlock", "leverage", "digital presence", "revolutionise"…)
   is salesStyle.ts's list, checked below; these two are the voice note's own. */
const BANNED: Array<[RegExp, string]> = [
  [/\bdominat/, '"dominate"'], [/guarantee/, 'a guarantee'],
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

/* ⛔ THE SEARCH IS PARAPHRASED (Paul, 2026-09-27). Any quoted phrase of four words or more, the whole
   question, or a run of SEARCH_RUN_WORDS consecutive words of it counts as reading it out. A bare
   "uk" after the town is the tell of a machine-worded query. */
const SEARCH_RUN_WORDS = 5;

/* ⛔ THE SEARCH CONTEXT IS TRADE + TOWN (Paul, 2026-09-27). The words AFTER the town in an audit query
   ("…in Shrewsbury UK who can come today") are its qualifiers; three of them in a row in the script is
   narrating the query. Words before the town ("emergency electrician") may colour the trade. */
const QUALIFIER_RUN_WORDS = 3;
export function narratesSearchQualifiers(script: string, question: string, town: string | null | undefined): boolean {
  const q = norm(question).split(' ').filter(Boolean);
  const townWords = norm(town ?? '').split(' ').filter(Boolean);
  if (!townWords.length) return false;
  let at = -1;
  for (let i = 0; i + townWords.length <= q.length; i++) {
    if (townWords.every((w, j) => q[i + j] === w)) { at = i + townWords.length; break; }
  }
  if (at < 0) return false;
  const tail = q.slice(at).filter((w) => w !== 'uk');
  const s = ` ${norm(script)} `;
  for (let i = 0; i + QUALIFIER_RUN_WORDS <= tail.length; i++) {
    if (s.includes(` ${tail.slice(i, i + QUALIFIER_RUN_WORDS).join(' ')} `)) return true;
  }
  return false;
}

/* ⛔ THE OLD ENDING PROMISED A CHANGE PLAN THE QUICK CHECK DOES NOT HAVE (Paul, 2026-09-27). */
const CHANGE_PLAN_OFFER = /\b(explain|show you|tell you|walk you through|go through) (exactly )?what (id|i would|i d) (change|do|fix)\b|\bsend (you )?(over )?the (audit|report)\b|\bshow you exactly\b/;

/** Does the close ask the right ownership / control question for this website? Read from the last two
 *  sentences, which must end in a question. */
export function asksWebsiteControl(script: string, site: Pick<VoiceNoteSite, 'mode' | 'source' | 'sourceLabel'>): boolean {
  const sentences = sentencesOf(script.trim());
  if (!sentences.length || !/\?\s*$/.test(script.trim())) return false;
  const close = norm(sentences.slice(-2).join(' '));
  switch (voiceNoteCtaKind(site)) {
    case 'own_site':
      return /\b(own|control|manage|managed|manages|look after|looks after)\b/.test(close) && /\b(site|website)\b/.test(close)
        && /\b(agency|yourself|web designer|someone else|developer)\b/.test(close);
    case 'profile': {
      const label = norm(site.sourceLabel ?? '');
      return /\b(site|website) of your own\b|\bown (site|website)\b/.test(close) && (!label || close.includes(label));
    }
    case 'no_website':
      return /\b(got|have|run) (a|any) (web ?site|site)\b/.test(close);
  }
}
/** The own-site question, asked of a profile page ("do you own the website yourself?"). */
const ASKS_OWN_THE_WEBSITE = /\b(own|control)( and control)? (the|your) (web ?site|site)\b|\b(the|your) (web ?site|site) (yourself|managed|with an agency)\b/;

export function readsSearchVerbatim(script: string, question: string): boolean {
  if (/["“”][^"“”]*(\b\w+\b[^"“”]*){4,}["“”]/.test(script)) return true;
  const s = ` ${norm(script)} `;
  const q = norm(question).split(' ').filter(Boolean);
  if (q.length && s.includes(` ${q.join(' ')} `)) return true;
  for (let i = 0; i + SEARCH_RUN_WORDS <= q.length; i++) {
    if (s.includes(` ${q.slice(i, i + SEARCH_RUN_WORDS).join(' ')} `)) return true;
  }
  const ukAt = q.indexOf('uk');
  return ukAt > 0 && s.includes(` ${q[ukAt - 1]} uk `);
}
const VERDICT = /\b(weak|poor|lacking|insufficient) (evidence|proof|credentials|qualifications|content|site|website)\b|\bno (real )?evidence\b|\byour (site|website) is (poor|weak|bad|rubbish)\b/;
const POLISHED_ENDING = /\bjust let me know\b|\bif youd like\b|\bfeel free to (reach out|get in touch)\b|\bdont hesitate\b|\blook forward to hearing\b/;

export function checkVoiceNoteScript(raw: string, ctx: { evidence: VoiceNoteEvidence; site: VoiceNoteSite; town?: string | null; trade?: string | null; business?: string | null; caller?: string | null }): VoiceNoteCheck {
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
  // The house style (salesStyle.ts): no filler on the search, no stock sales phrases. Names are not ours.
  for (const p of salesStyleProblems(script, [...ctx.evidence.competitors, ctx.business ?? ''])) problems.push(p);
  // Website claims must be backed by a supplied finding.
  const supplied = ctx.site.findings;
  // "there isn't anything obviously broken" is the honest fallback, not a claim.
  const claimText = tb.replace(/\b(isnt|is not|wasnt|was not|nothings|nothing|not|no)( [a-z]+){0,2} broken\b/g, ' ');
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
  // The search is paraphrased, never read out (Paul, 2026-09-27: Firebeard's "…Shrewsbury UK who can come today").
  if (readsSearchVerbatim(script, ctx.evidence.question)) problems.push('Reads the search out word for word or in quotes. Paraphrase it naturally.');
  else if (narratesSearchQualifiers(script, ctx.evidence.question, ctx.town)) problems.push('Narrates the search\'s qualifiers. Say just the trade and the town ("an electrician in Shrewsbury").');
  // The close: who controls the website (Paul, 2026-09-27), never a change plan.
  if (CHANGE_PLAN_OFFER.test(tb)) problems.push('Offers to send the audit or explain what Paul would change. The quick check has no change plan; end on the website-ownership question instead.');
  if (!asksWebsiteControl(script, ctx.site)) {
    const kind = voiceNoteCtaKind(ctx.site);
    problems.push(kind === 'profile'
      ? `Does not end by asking whether they have a site of their own besides the ${ctx.site.sourceLabel ?? 'directory'} profile.`
      : kind === 'no_website'
        ? 'Does not end by asking whether they have a website at the moment.'
        : 'Does not end by asking whether they own and control the website themselves or an agency manages it.');
  }
  if (voiceNoteCtaKind(ctx.site) === 'profile' && ASKS_OWN_THE_WEBSITE.test(tb)) {
    problems.push(`Asks whether they own "the website", but the only page on record is their ${ctx.site.sourceLabel ?? 'directory'} profile.`);
  }
  // Talk TO them: their own name in the script is a third-person reference ("but not Firebeard Electrical").
  if (ctx.business && competitorNamed(script, ctx.business)) problems.push(`Refers to the business by name ("${ctx.business}"). Talk to them directly: "you didn't come up".`);
  // Observation, not verdict.
  if (VERDICT.test(tb)) problems.push('Uses a judgement ("weak evidence", "no evidence", "poor site"). Say what the site shows or doesn\'t show instead.');
  // Paul's register.
  if (POLISHED_ENDING.test(tb)) problems.push('Uses a polished ending ("just let me know", "if you\'d like"). End on the plain website-ownership question.');
  if ((tb.match(/\bmate\b/g) ?? []).length > 2) warnings.push('Says "mate" more than twice.');
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
  /* Who is speaking (fix workstream 5, 2026-10-04): checked when the caller is known (the function passes it). */
  if (ctx.caller && !/\bfrom findable\b/.test(t)) warnings.push(`Does not say who is speaking ("it's ${callerFirstName(ctx.caller)} from Findable").`);
  if (/[—–]/.test(raw)) warnings.push('A dash was replaced with a comma.');
  return { script, wordCount: words, problems, warnings };
}

/** Of two attempts, the one with fewer factual problems; the later one on a tie. */
export function betterAttempt(a: VoiceNoteCheck, b: VoiceNoteCheck): VoiceNoteCheck {
  return b.problems.length <= a.problems.length ? b : a;
}

/* ─────────────────────────────── 5. is a saved script still current? ─────────────────────────────── */

/* ⛔ A SAVED SCRIPT BELONGS TO THE AUDIT IT WAS WRITTEN FROM (Paul, 2026-09-27). Firebeard's two saved
   scripts quoted the 25 Sep audit after a 27 Sep one existed. A script is CURRENT only when the result it
   quotes (audit + question + engine) is the one a Regenerate would pick today; anything else is shown as
   OUT OF DATE. Nothing regenerates on its own: a regenerate costs a model call and is Paul's click. */
export interface VoiceNoteBasis { auditId: string | null; questionIndex: number | null; engine: string | null }
export function voiceNoteBasisIsCurrent(saved: VoiceNoteBasis, current: VoiceNoteBasis | null): boolean {
  if (!current || !current.auditId) return false;
  return saved.auditId === current.auditId && saved.questionIndex === current.questionIndex && saved.engine === current.engine;
}
