/* ════════════════════════════════════════════════════════════════════════════════════════════════
   SERVICE SCOPE — WHAT THE CLIENT ACTUALLY DOES, AND WHETHER A QUESTION IS ABOUT IT (2026-10-04,
   fix/04-ai-measurement, docs/pre-sales-certification/fixes-04-ai-measurement.md).

   🔴 WHY THIS EXISTS. Session C (C-04) gave Discovery a locksmith who explicitly does NOT do car keys.
   Discovery wrote "car keys and auto locksmith in Canterbury UK", nothing flagged it, the approval
   seeded it into the client's improvement backlog — and MCLocksmiths' real frozen baseline already
   carries "Who offers auto locksmith services in Canterbury?". The only guard was one prompt sentence
   ("NEVER invent a service"). A prompt is a request; this module is the check.

   ⛔ BUSINESS TRUTH OUTRANKS GENERATED IDEAS. Two rules, one place:
     1. resolveServiceTruth — WHICH list of services is the truth. The highest-ranked non-empty list
        wins WHOLE (the clientFacts.ts rule): the client's own onboarding answer, else a build fact Paul
        VERIFIED, else what Sales recorded on the lead (usable, but never "client-confirmed"). Discovery's
        stored `specialism` and the website crawl NEVER count — they are ideas, not facts.
     2. questionScope — is a question about a confirmed service ('service'), about the business in
        general ('core'), about something the client said they do NOT offer ('not_offered'), or about
        something nobody confirmed ('unsupported')?

   ⛔ STRICT ON PURPOSE. A question is 'service' only when EVERY specific word in it traces to a
   confirmed service (or is a generic word — a verb, an urgency word, a situation). "car keys" for a
   locksmith whose only key service is "Key cutting" is unsupported: "key" is covered, "car" is not,
   and "car" is exactly the word that makes it a different trade. The operator can still approve such
   a question — with a typed reason (baselineQuality.ts) — but nothing slips in unseen.

   Pure, deterministic. IMPORTED BY EDGE FUNCTIONS (paid-baseline, baseline-discovery): relative
   imports with an explicit .ts only.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { EMERGENCY, canonicalServices, meaningTokens, stemToken, type CanonService } from './baselineMix.ts';

/* ── 1. WHICH LIST IS THE TRUTH ─────────────────────────────────────────────────────────────────── */

/** Where the winning service list came from. 'lead' = typed by Sales on the prospect — usable for
 *  drafting, never shown as client-confirmed. */
export type ServiceTruthSource = 'onboarding' | 'build_facts' | 'lead';

/** The sources that count as the CLIENT's (or Paul's verified) word. */
export const CLIENT_CONFIRMED_SOURCES: readonly ServiceTruthSource[] = ['onboarding', 'build_facts'];

/** A free-text or array answer as a clean list: commas, semicolons, new lines and bullets split it;
 *  blanks dropped; duplicates (case-insensitive) dropped, first spelling kept. */
export function splitServiceList(value: unknown): string[] {
  const raw = Array.isArray(value)
    ? value.flatMap((v) => (typeof v === 'string' ? v.split(/[,;\n•]+/) : []))
    : typeof value === 'string' ? value.split(/[,;\n•]+/) : [];
  const out: string[] = [];
  for (const part of raw) {
    const s = part.replace(/^[\s\-*–]+/, '').trim();
    if (!s) continue;
    if (!out.some((x) => x.toLowerCase() === s.toLowerCase())) out.push(s);
  }
  return out;
}

export interface ServiceTruthInput {
  /** onboarding_responses.services_list (the ticked list) — the client's own answer. */
  onboardingList?: unknown;
  /** onboarding_responses.services (free text) — the same answer, typed. Same source as the list. */
  onboardingText?: unknown;
  /** A VERIFIED Client Build Fact (clientContext.verifiedBuildFacts().services). */
  buildFacts?: unknown;
  /** outreach_leads.services_included — what Sales recorded. */
  lead?: unknown;
  /** onboarding_responses.services_not_offered — the client's explicit "we do NOT do this". */
  notOffered?: unknown;
}

export interface ServiceTruth {
  services: string[];
  source: ServiceTruthSource | null;
  /** True only when the winning list is the client's own answer or a verified build fact. */
  clientConfirmed: boolean;
  /** The client's explicit negatives. Never measured, never written about. */
  notOffered: string[];
  /** Lower-ranked lists holding entries the winner lacks — shown for Paul to ask about, never merged. */
  unconfirmed: Array<{ source: ServiceTruthSource; values: string[] }>;
}

/** ⛔ The highest-ranked non-empty list wins WHOLE. Lists are never concatenated: a service the
 *  client took off their list must not come back from an older lead row (clientFacts.ts). */
export function resolveServiceTruth(i: ServiceTruthInput): ServiceTruth {
  const notOffered = splitServiceList(i.notOffered);
  const ranked: Array<{ source: ServiceTruthSource; values: string[] }> = [
    { source: 'onboarding', values: splitServiceList([...splitServiceList(i.onboardingList), ...splitServiceList(i.onboardingText)]) },
    { source: 'build_facts', values: splitServiceList(i.buildFacts) },
    { source: 'lead', values: splitServiceList(i.lead) },
  ];
  const winner = ranked.find((r) => r.values.length > 0) ?? null;
  const have = new Set((winner?.values ?? []).map((v) => v.toLowerCase()));
  const unconfirmed = ranked
    .filter((r) => r !== winner && r.values.length > 0)
    .map((r) => ({ source: r.source, values: r.values.filter((v) => !have.has(v.toLowerCase())) }))
    .filter((r) => r.values.length > 0);
  return {
    services: winner?.values ?? [],
    source: winner?.source ?? null,
    clientConfirmed: !!winner && CLIENT_CONFIRMED_SOURCES.includes(winner.source),
    notOffered,
    unconfirmed,
  };
}

/* ── 2. IS A QUESTION ABOUT IT ──────────────────────────────────────────────────────────────────── */

/* Words that never name a SERVICE: urgency, availability, price, reputation, the situation a customer
   is in, and the verbs that sit in front of the thing being bought ("repair", "fix", "replace" — the
   NOUN decides the service: "glass repair" is still glass). Each one was read against Session C's
   truth set and MCLocksmiths' hand-written 20; adding a word here can only let more questions count
   as on-scope, so a new entry must be a word that cannot name a service on its own. */
const GENERIC = new Set([
  // urgency and availability
  'emergency', 'urgent', 'urgently', 'hour', 'hours', 'night', 'tonight', 'today', 'now', 'asap', 'weekend', 'saturday',
  'sunday', 'bank', 'holiday', 'late', 'open', 'available', 'availability', 'same', 'day', 'fast', 'quick', 'quickly', 'soon',
  'week', 'evening', 'morning', 'christma',
  // price, reputation, choice
  'price', 'pricing', 'cost', 'charge', 'cheap', 'cheapest', 'quote', 'free', 'estimate', 'much', 'review', 'rating',
  'reputation', 'popular', 'known', 'well', 'trustworthy', 'trust', 'independent', 'family', 'run', 'owned', 'small', 'nearest',
  'closest', 'mobile', 'option', 'choice', 'compare', 'good', 'better', 'decent', 'great', 'ok', 'okay', 'proper',
  // contact
  'call', 'phone', 'number', 'contact', 'email', 'whatsapp', 'come', 'out', 'visit', 'arrive', 'turn', 'up',
  // situation
  'lost', 'stuck', 'jammed', 'locked', 'broke', 'broken', 'damaged', 'snapped', 'happened', 'after', 'before', 'again', 'since',
  'front', 'back', 'old', 'my', 'our', 'flat', 'apartment', 'place', 'rented', 'renting',
  // verbs in front of the noun
  'repair', 'repairing', 'repaired', 'fix', 'fixing', 'fixed', 'replace', 'replacing', 'replaced', 'replacement', 'change', 'changing',
  'changed', 'sort', 'sorted', 'deal', 'do', 'done', 'doing', 'work', 'job', 'jobs', 'need', 'needed', 'needing', 'how', 'long',
  'take', 'does', 'cost', 'worth', 'way', 'best', 'top', 'help', 'go', 'use', 'used', 'ask', 'someone', 'person',
  'removal', 'remove', 'removing', 'assistance', 'assist', 'support', 'advice', 'local', 'area',
]);

/* Different words for one thing, applied to the raw text before tokens are read (both the question
   and the service list go through it, so they meet in the middle). */
const SYNONYMS: Array<[RegExp, string]> = [
  [/\blocked out\b|\block[- ]?outs?\b|\bcan'?t get (?:in|into)\b/gi, ' lockout '],
  [/\bkey (?:duplication|duplicating|duplicates?|copying|copies|copy)\b|\b(?:duplicate|copy|copies of) (?:a |my )?keys?\b/gi, ' key cutting '],
  [/\bbreak[- ]?ins?\b|\bbroken into\b|\bburgl(?:ary|ed|ar|ars)\b/gi, ' burglary '],
  [/\b24 ?\/ ?7\b|\b24[- ]?hours?\b|\bout of hours\b/gi, ' emergency '],
];

/* Apostrophes are dropped first: "I'm" must read as one (filler) word, not "i" + "m". */
const synonymised = (text: string) => SYNONYMS.reduce((s, [re, to]) => s.replace(re, to), ` ${String(text ?? '').replace(/['’]/g, '')} `);

/** Two tokens are the same word when equal, singular/plural, or sharing a five-letter stem
 *  (install / installation, drain / drainage) — the offTradeReason rule, for the same reason. */
function alike(a: string, b: string): boolean {
  if (a === b || a === `${b}s` || `${a}s` === b) return true;
  let i = 0;
  while (i < a.length && i < b.length && a[i] === b[i]) i++;
  return i >= 5;
}

const rawTokens = (s: string) => s.toLowerCase().replace(/[-–]/g, ' ').replace(/[^a-z0-9 ]+/g, ' ').split(/\s+/).filter(Boolean).map(stemToken);

export interface ServiceScope {
  trade: string;
  towns: string[];
  /** The confirmed services, merged where they are the same service (canonicalServices). */
  confirmed: CanonService[];
  /** Every token any confirmed service uses — a question word must be one of these to count. */
  confirmedTokens: string[];
  /** `newWork`: the negative names NEW / INSTALL / FIT work ("new boilers", "bathroom fitting"). */
  notOffered: Array<{ label: string; tokens: string[]; newWork?: boolean }>;
  tradeTokens: string[];
}

export function buildServiceScope(i: { services: string[]; notOffered?: string[]; trade: string; towns: string[] }): ServiceScope {
  const towns = i.towns.filter((t) => t && t.trim());
  const tradeTokens = [...new Set(rawTokens(i.trade ?? ''))];
  const dropTrade = (tokens: string[]) => tokens.filter((t) => !tradeTokens.some((tt) => alike(t, tt)));
  /* Labels and merging from the client's own wording; the TOKENS also read the synonyms, so "Emergency
     lockouts" and a question about being "locked out" meet on one word. */
  const confirmed = canonicalServices(i.services, towns).map((s) => ({
    ...s, tokens: [...new Set([...s.tokens, ...s.aliases.flatMap((a) => meaningTokens(synonymised(a), towns))])],
  }));
  const confirmedTokens = [...new Set(confirmed.flatMap((s) => dropTrade(s.tokens)))];
  /* "Car keys / auto locksmith" is two things the client does not do; either one is enough to refuse
     a question, so each part is its own negative. */
  /* ⛔ THE CLIENT'S OWN "NO" IS NOT A WORD OF THE SERVICE (pre-sales final, 2026-10-05). A negative is
     matched by requiring EVERY one of its words in the customer's question, and customers never type
     "no" / "we don't" / "fit". "No new boilers" kept "no", "We do not fit new boilers" kept "not" and
     "fit", so neither could ever match — a client who said they do not install boilers had installation
     questions pass as their "Boiler repair" service, into the baseline and onto a planned page. The
     negation and the client's own verbs are stripped from the LABEL only (never from questions: "no hot
     water" is a customer's words); a new-work verb is carried by `newWork`, which already binds the
     negative to new / install / fit questions. */
  const forTokens = (label: string, newWork: boolean) => {
    const plain = label.replace(NOT_OFFERED_PREAMBLE, ' ');
    return newWork ? plain.replace(NEW_WORK_ALL, ' ') : plain;
  };
  const notOffered = (i.notOffered ?? [])
    .flatMap((label) => label.split(/\s*\/\s*|\s+or\s+/i).map((part) => part.trim()).filter(Boolean))
    .map((label) => { const newWork = NEW_WORK.test(label); return { label, tokens: dropTrade(meaningTokens(synonymised(forTokens(label, newWork)), towns)), newWork }; })
    .filter((n) => n.tokens.length > 0);
  return { trade: i.trade ?? '', towns, confirmed, confirmedTokens, notOffered, tradeTokens };
}

/** Words that ask for NEW work — a new unit supplied and fitted, not a repair or a service of an existing one. */
const NEW_WORK_SOURCE = String.raw`\b(?:new|brand[\s-]new|install(?:s|ed|ing|ation|ations|er|ers)?|fit|fits|fitted|fitting|fittings|fitter|fitters|supply|supplied|replace(?:s|d|ment|ments)?|replacing)\b`;
const NEW_WORK = new RegExp(NEW_WORK_SOURCE, 'i');
const NEW_WORK_ALL = new RegExp(NEW_WORK_SOURCE, 'gi');
/** How a client words a negative around the service itself: "No …", "We don't do …", "Not offered: …".
 *  Stripped from a not-offered LABEL before its words are read (buildServiceScope). */
const NOT_OFFERED_PREAMBLE = /\b(?:no|not|none|never|nor|without|don['’]?t|doesn['’]?t|do|does|we|i|us|any|offer(?:s|ed|ing)?|provide(?:s|d)?|undertake|carry out)\b|:/gi;

export type ScopeVerdict = 'core' | 'service' | 'not_offered' | 'unsupported';

export interface QuestionScope {
  verdict: ScopeVerdict;
  /** The confirmed service it is about (verdict 'service'). */
  service: string | null;
  /** The not-offered entry it hits (verdict 'not_offered'). */
  notOffered: string | null;
  /** The specific words nothing confirmed (verdict 'unsupported'). */
  unconfirmedTerms: string[];
  /** Urgent / emergency intent ("24 hour", "locked out", "tonight"). */
  urgent: boolean;
}

/** Which kind of question this is, against the client's confirmed services. */
export function questionScope(question: string, scope: ServiceScope): QuestionScope {
  const text = synonymised(question);
  const urgent = EMERGENCY.test(question) || /\blockout\b|\bemergency\b/.test(text);
  const dropTrade = (tokens: string[]) => tokens.filter((t) => !scope.tradeTokens.some((tt) => alike(t, tt)));
  const tokens = dropTrade(meaningTokens(text, scope.towns));
  // 1. An explicit negative wins over everything: every word of the not-offered entry is in the question.
  for (const n of scope.notOffered) {
    /* ⛔ A NEGATIVE ABOUT NEW WORK BINDS ONLY NEW WORK (wave 1 integration, 2026-10-04). meaningTokens drops
       "new", "installation", "fitting" as filler, so "Does NOT fit new boilers" used to shrink to "boiler"
       and refuse "Who can repair my boiler" and "cheapest boiler service" — the plumber's REAL services,
       kept out of his own baseline and (through siteServiceTruth) off his site. Such a negative now matches
       only a question that also asks for new / install / fit / replacement work. */
    if (n.newWork && !NEW_WORK.test(question)) continue;
    if (n.tokens.every((nt) => tokens.some((t) => alike(t, nt)))) {
      return { verdict: 'not_offered', service: null, notOffered: n.label, unconfirmedTerms: [], urgent };
    }
  }
  const specific = tokens.filter((t) => !GENERIC.has(t) && !/^\d/.test(t));
  // 2. Nothing specific left: a question about the business itself ("a good locksmith in Canterbury").
  if (!specific.length) return { verdict: 'core', service: null, notOffered: null, unconfirmedTerms: [], urgent };
  // 3. Every specific word must trace to a confirmed service.
  const uncovered = specific.filter((t) => !scope.confirmedTokens.some((c) => alike(t, c)));
  if (uncovered.length) return { verdict: 'unsupported', service: null, notOffered: null, unconfirmedTerms: uncovered, urgent };
  /* Which confirmed service: the most of its words present (generic words count here — "snapped" picks
     "Snapped key extraction" over "Key cutting"), ties to the tighter service, then list order. */
  let best: CanonService | null = null;
  let bestScore = 0;
  for (const s of scope.confirmed) {
    const hits = s.tokens.filter((c) => tokens.some((t) => alike(t, c))).length;
    const score = hits === 0 ? 0 : hits + hits / Math.max(1, s.tokens.length);
    if (score > bestScore) { best = s; bestScore = score; }
  }
  return { verdict: 'service', service: best?.label ?? null, notOffered: null, unconfirmedTerms: [], urgent };
}

/** May this question enter a client's measurement or backlog without a person's say-so? */
export const inScope = (q: QuestionScope) => q.verdict === 'core' || q.verdict === 'service';

/** Does the confirmed list include urgent / emergency work? (An urgent question for a business that
 *  never said it does emergencies is a warning, not a block — urgency is how customers ask.) */
export function offersUrgentWork(scope: ServiceScope): boolean {
  return scope.confirmed.some((s) => s.aliases.some((a) => EMERGENCY.test(a) || /\block ?out|\bcall ?out|\bemergenc/i.test(a)));
}

/** One sentence for the operator: why a question is out of scope. */
export function describeScope(q: QuestionScope): string {
  switch (q.verdict) {
    case 'not_offered': return `The client said they do not offer "${q.notOffered}".`;
    case 'unsupported': return `Mentions ${q.unconfirmedTerms.map((t) => `"${t}"`).join(', ')}, which is not on the client's confirmed services.`;
    case 'core': return 'A question about the business itself, not one service.';
    case 'service': return q.service ? `About ${q.service}.` : 'About a confirmed service.';
  }
}
