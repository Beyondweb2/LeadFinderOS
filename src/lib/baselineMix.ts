/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE BASELINE MIX — services, towns, intents, near-duplicates, coverage and the balanced 20.

   🔴 WHY BS4'S DRAFT WAS 20 BRISTOL QUESTIONS (2026-09-23). The baseline was deliberately HOME-TOWN
   ONLY (Paul, 2026-09-12): create-ai-audit's generator rejects any question that does not name the
   primary town (dropMissingTown) and refills from primary-town templates, and its prompt says
   "ALWAYS write the place EXACTLY as <town> UK". The approved areas were passed in and could never
   survive. Paul's decision of 2026-09-23 reverses the policy: the paid baseline spans the home town
   AND the approved service areas, and the refund is judged on all 20.
   And the draft repeated one intent in many wordings ("rewiring services in bristol uk", "rewiring
   Electricians in Bristol UK") because the only dedupe folded case and plurals.

   This module is pure and deterministic — no model call, no I/O. It decides:
     · which approved services are really the same service (canonicalServices)
     · which town and service a question is about, and its intent type (classifyQuestion)
     · when two questions are the same intent in different words (intentKey / nearDuplicates)
     · the coverage of a set and the warnings Paul sees before freezing (coverageReport)
     · a balanced 20 from a candidate pool (buildBalancedBaseline)

   ⛔ BALANCE CHOOSES THE BASELINE, NEVER WINNABILITY ALONE. This module does not read Discovery's
   verdicts. Since 2026-09-30 (Paul) the caller may pass a RANK that breaks ties between candidates
   that balance the set equally — baselineRecommendation.ts uses it to prefer questions where the
   business is not yet named. Balance is applied first, so a rank can never turn the 20 into the
   easiest questions: picking those would measure a flattering set, not the business.

   IMPORTED BY AN EDGE FUNCTION (paid-baseline): relative imports with an explicit .ts only.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export type IntentType = 'broad' | 'service' | 'location' | 'emergency';
export const INTENT_LABELS: Record<IntentType, string> = {
  broad: 'Broad / core business', service: 'Service (home town)', location: 'Service + other area', emergency: 'Emergency / problem',
};

/* Words that never change what a customer is asking for. */
const FILLER = new Set([
  'a', 'an', 'the', 'in', 'on', 'at', 'for', 'of', 'to', 'and', 'or', 'with', 'my', 'me', 'our', 'your', 'i', 'we', 'you',
  'is', 'are', 'can', 'could', 'do', 'does', 'who', 'what', 'where', 'which', 'how', 'any', 'some', 'near', 'around', 'local',
  'uk', 'england', 'best', 'top', 'good', 'great', 'recommended', 'recommend', 'rated', 'trusted', 'reliable', 'reputable',
  'affordable', 'cheap', 'professional', 'qualified', 'experienced', 'find', 'need', 'looking', 'get', 'hire', 'book',
  'service', 'services', 'company', 'companies', 'firm', 'firms', 'business', 'businesses', 'specialist', 'specialists',
  'expert', 'experts', 'provider', 'providers', 'contractor', 'contractors', 'installer', 'installers', 'installation',
  'installations', 'install', 'installing', 'fitting', 'fitter', 'fitters', 'engineer', 'engineers', 'technician', 'technicians',
  'electrician', 'electricians', 'electrical', 'electric', 'plumber', 'plumbers', 'locksmith', 'locksmiths', 'upgrade', 'upgrades',
  'upgrading', 'report', 'reports', 'area', 'areas', 'nearby', 'someone', 'somebody', 'person', 'people',
  // The default customer is a household: 'for my home' does not make a new question. residential /
  // commercial / landlord DO, and are kept.
  'house', 'home', 'homes', 'domestic', 'property', 'properties', 'additional', 'extra', 'new', 'callout', 'callouts',
  // Sales adjectives: "efficient fault finding electricians" is still fault finding (BS4, 2026-09-23).
  'efficient', 'fast', 'quick', 'quickly', 'friendly', 'honest', 'cheapest', 'lowest', 'highly', 'fully', 'decent',
  'dependable', 'competent', 'skilled', 'approved', 'certified', 'accredited', 'registered', 'licensed', 'insured',
  /* Customer-question words (2026-10-04, fix/04): Discovery now writes questions a person asks an AI
     ("Is there anyone who can…?", "Who should I call if…?"), and none of these words changes WHAT is
     being asked for. Without them two phrasings of one intent read as different questions. */
  'there', 'anyone', 'anybody', 'help', 'please', 'should', 'would', 'will', 'im', 'am', 'if', 'it', 'this', 'that',
  'they', 'them', 'their', 'have', 'has', 'got', 'want', 'offer', 'offers', 'offering', 'whos', 'whats', 'tell',
]);
/* Different words for the same thing (applied after lower-casing, before stemming). */
const PHRASES: Array<[RegExp, string]> = [
  [/\bfuse ?boards?\b/g, 'consumerunit'], [/\bconsumer units?\b/g, 'consumerunit'],
  [/\bre-?wir(?:e|es|ing|ed)\b/g, 'rewire'],
  [/\b(?:ev|electric vehicle|car) charg(?:er|ers|ing|e ?points?)\b/g, 'evcharger'], [/\bcharge ?points?\b/g, 'evcharger'], [/\bev\b/g, 'evcharger'],
  [/\beicrs?\b/g, 'eicr'], [/\belectrical (?:installation )?condition reports?\b/g, 'eicr'], [/\belectrical safety (?:certificates?|checks?|inspections?)\b/g, 'eicr'],
  [/\b(?:electrical )?certificates?\b/g, 'eicr'],
  [/\blights?\b/g, 'lighting'], [/\bsockets?\b/g, 'socket'], [/\bsmoke (?:alarms?|detectors?)\b/g, 'smokealarm'],
  [/\bfault(?:s)? ?find(?:ing|er)?\b/g, 'faultfinding'], [/\bcall ?outs?\b/g, 'callout'],
  [/\b24 ?\/ ?7\b/g, 'emergency'], [/\burgent(?:ly)?\b/g, 'emergency'], [/\bout of hours\b/g, 'emergency'],
];
const stem = (w: string) => (w.length > 4 && w.endsWith('ies') ? w.slice(0, -3) + 'y' : w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w);
/** The one stemmer the mix uses, exported so serviceScope.ts reads words the same way. */
export const stemToken = stem;

export const normTown = (t: string) => t.toLowerCase().replace(/[-–]/g, ' ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();

/** A question's meaning: its meaningful tokens with every approved town removed. */
export function meaningTokens(text: string, towns: string[] = []): string[] {
  let s = ' ' + text.toLowerCase().replace(/[-–]/g, ' ').replace(/[^a-z0-9/ ]+/g, ' ') + ' ';
  for (const t of towns.map(normTown).filter(Boolean).sort((a, b) => b.length - a.length)) s = s.split(` ${t} `).join(' ');
  for (const [re, to] of PHRASES) s = s.replace(re, to);
  const out = s.split(/\s+/).filter(Boolean).map(stem).filter((w) => !FILLER.has(w) && !/^\d+$/.test(w));
  return [...new Set(out)];
}

/** Which approved town a question names (longest match wins), or null. */
export function townOf(question: string, towns: string[]): string | null {
  const q = ' ' + normTown(question) + ' ';
  let best: string | null = null;
  for (const t of towns) { const n = normTown(t); if (n && q.includes(` ${n} `) && (!best || n.length > normTown(best).length)) best = t; }
  return best;
}

export interface CanonService { label: string; key: string; tokens: string[]; aliases: string[] }

/** The approved services with duplicates merged ("EICRs", "EICR reports", "EICR Bristol" → one). The
 *  first wording seen is kept as the label. Nothing is added — only merged. */
export function canonicalServices(services: string[], towns: string[]): CanonService[] {
  const out: CanonService[] = [];
  for (const raw of services) {
    const label = raw.replace(new RegExp(`\\s+(?:in\\s+)?(?:${towns.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|') || '(?!)'})\\s*$`, 'i'), '').trim();
    const tokens = meaningTokens(label, towns);
    if (!tokens.length) continue;
    const key = [...tokens].sort().join(' ');
    const hit = out.find((s) => s.key === key || (tokens.length === 1 && s.tokens.length === 1 && s.tokens[0] === tokens[0]));
    if (hit) { if (!hit.aliases.includes(raw)) hit.aliases.push(raw); continue; }
    out.push({ label, key, tokens, aliases: [raw] });
  }
  return out;
}

/** The service a question is about: the approved service whose tokens it contains (most specific). */
export function serviceOf(question: string, services: CanonService[], towns: string[]): CanonService | null {
  const q = new Set(meaningTokens(question, towns));
  let best: CanonService | null = null;
  for (const s of services) if (s.tokens.every((t) => q.has(t)) && (!best || s.tokens.length > best.tokens.length)) best = s;
  return best;
}

/* ⚠️ "24 hour" / "24-hour" added 2026-10-04 (C-22): "24 hour locksmith" was classed as a plain service
   question, so the urgent-intent slot never counted it. Exported: serviceScope.ts asks the same question. */
export const EMERGENCY = /\bemergency\b|\burgent|\btoday\b|\btonight\b|\bright now\b|\basap\b|24 ?\/ ?7|\b24[- ]?hours?\b|out of hours|\bno power\b|power cut|keeps? (?:tripping|blowing)|\btripp(?:ing|ed)\b|burning smell|sparking|\bshock\b|\blocked out\b|\bleak(?:ing)?\b|\bburst\b|keeps letting me down|\bbroken\b|stopped working/i;

export interface MixContext { primaryTown: string; areas: string[]; services: CanonService[] }

export interface QuestionMix { question: string; town: string | null; service: string | null; intent: IntentType; key: string }

export function classifyQuestion(question: string, ctx: MixContext): QuestionMix {
  const towns = [ctx.primaryTown, ...ctx.areas].filter(Boolean);
  const town = townOf(question, towns);
  const service = serviceOf(question, ctx.services, towns);
  const intent: IntentType = EMERGENCY.test(question) ? 'emergency'
    : service && town && normTown(town) !== normTown(ctx.primaryTown) ? 'location'
    : service ? 'service' : 'broad';
  return { question, town, service: service?.label ?? null, intent, key: intentKey(question, towns) };
}

/** One intent = the same meaningful tokens about the same town. */
export function intentKey(question: string, towns: string[]): string {
  const town = townOf(question, towns);
  return `${[...meaningTokens(question, towns)].sort().join(' ')}@${town ? normTown(town) : '-'}`;
}

const jaccard = (a: string[], b: string[]) => {
  const A = new Set(a), B = new Set(b);
  const inter = [...A].filter((x) => B.has(x)).length;
  return inter / Math.max(1, new Set([...A, ...B]).size);
};

/** Same intent in different words: identical meaning about the same town, or ≥ 80% token overlap
 *  about the same town (one extra adjective does not make a new question). */
export function sameIntent(a: string, b: string, towns: string[]): boolean {
  if (townOf(a, towns) !== townOf(b, towns)) return false;
  const ta = meaningTokens(a, towns), tb = meaningTokens(b, towns);
  if (!ta.length || !tb.length) return ta.length === tb.length;
  const ka = [...ta].sort().join(' '), kb = [...tb].sort().join(' ');
  return ka === kb || jaccard(ta, tb) >= 0.8;
}

/** Every near-duplicate pair in a list (indexes). */
export function nearDuplicates(questions: string[], towns: string[]): Array<[number, number]> {
  const out: Array<[number, number]> = [];
  for (let i = 0; i < questions.length; i++) for (let j = i + 1; j < questions.length; j++) if (sameIntent(questions[i], questions[j], towns)) out.push([i, j]);
  return out;
}

/** Keep the first of each intent. */
export function dedupeByMeaning(questions: string[], towns: string[]): string[] {
  const kept: string[] = [];
  for (const q of questions) if (q.trim() && !kept.some((k) => sameIntent(k, q, towns))) kept.push(q.trim());
  return kept;
}

/* ── coverage ─────────────────────────────────────────────────────────────────────────────────── */

export interface CoverageReport {
  total: number;
  areas: Array<{ town: string; count: number }>;
  noTown: number;
  unusedAreas: string[];
  services: Array<{ service: string; count: number }>;
  noService: number;
  intents: Record<IntentType, number>;
  duplicates: Array<[number, number]>;
  warnings: string[];
}

/** The client's MAIN services are the ones they listed first (onboarding order is theirs). A baseline
 *  missing one of these is missing a meaningful part of the business; the rest may sit in the backlog. */
export const MAIN_SERVICE_COUNT = 3;

export function coverageReport(questions: string[], ctx: MixContext, target = 20): CoverageReport {
  const qs = questions.map((q) => q.trim()).filter(Boolean);
  const mixes = qs.map((q) => classifyQuestion(q, ctx));
  const towns = [ctx.primaryTown, ...ctx.areas].filter(Boolean);
  const byTown = new Map<string, number>();
  for (const t of towns) byTown.set(t, 0);
  let noTown = 0, noService = 0;
  const byService = new Map<string, number>();
  const intents: Record<IntentType, number> = { broad: 0, service: 0, location: 0, emergency: 0 };
  for (const m of mixes) {
    if (m.town) byTown.set(m.town, (byTown.get(m.town) ?? 0) + 1); else noTown++;
    if (m.service) byService.set(m.service, (byService.get(m.service) ?? 0) + 1); else noService++;
    intents[m.intent]++;
  }
  const duplicates = nearDuplicates(qs, towns);
  const warnings: string[] = [];
  const primaryCount = byTown.get(ctx.primaryTown) ?? 0;
  const unusedAreas = ctx.areas.filter((a) => (byTown.get(a) ?? 0) === 0);
  /* ⛔ REPRESENTATIVE, NOT EXHAUSTIVE (Paul, 2026-09-30). Twenty questions cannot hold one per town,
     and a business with many areas was told "N areas not covered" on every draft — a warning that
     can never be satisfied teaches the reader to ignore warnings. Warn only when a MEANINGFUL part
     of the business is missing: the home area, a main service, every area but one, one service
     taking over. Unused areas are returned (unusedAreas) for an information line, never a warning;
     they stay in the Opportunity Backlog. */
  if (qs.length !== target) warnings.push(`${qs.length} of ${target} questions — the paid baseline is exactly ${target}.`);
  if (qs.length && ctx.primaryTown && primaryCount === 0) warnings.push(`No question names ${ctx.primaryTown} — the home area must be in the baseline.`);
  const townsUsed = [...byTown.entries()].filter(([, n]) => n > 0).map(([t]) => t);
  if (ctx.areas.length && qs.length >= 5 && townsUsed.length <= 1) {
    warnings.push(`Every question is about ${townsUsed[0] ?? 'one place'} — none of the ${ctx.areas.length} approved service area${ctx.areas.length === 1 ? ' is' : 's is'} represented.`);
  }
  const maxShare = Math.max(4, Math.ceil(qs.length * 0.25));
  for (const [s, n] of byService) if (n > maxShare) warnings.push(`"${s}" appears in ${n} of ${qs.length} questions — one service dominates.`);
  const missingMain = ctx.services.slice(0, MAIN_SERVICE_COUNT).filter((s) => !byService.get(s.label));
  if (qs.length >= target && missingMain.length) warnings.push(`Main service${missingMain.length === 1 ? '' : 's'} not in the baseline: ${missingMain.map((s) => s.label).join(', ')}.`);
  if (duplicates.length) warnings.push(`${duplicates.length} near-duplicate pair${duplicates.length === 1 ? '' : 's'} — the same question in different words.`);
  return {
    total: qs.length,
    areas: [...byTown.entries()].map(([town, count]) => ({ town, count })).sort((a, b) => b.count - a.count),
    noTown, unusedAreas,
    services: [...byService.entries()].map(([service, count]) => ({ service, count })).sort((a, b) => b.count - a.count),
    noService, intents, duplicates, warnings,
  };
}

/* ── the balanced 20 ──────────────────────────────────────────────────────────────────────────── */

/** 'locked' = kept verbatim whatever else is true (the Hook Audit questions — baselineRecommendation.ts);
 *  'core'   = the mandatory core questions (customerQuestion.coreQuestions, 2026-10-04): admitted right
 *             after the locked ones, still de-duplicated against them;
 *  'manual' = Paul's own additions, kept first but still de-duplicated. */
export interface Candidate { question: string; source: 'locked' | 'core' | 'manual' | 'discovery' | 'generated' }

/** Guidance for 20 (scaled for other targets): broad, service, service+area, emergency. */
export function mixTargets(target = 20, hasAreas = true): Record<IntentType, number> {
  const f = (x: number) => Math.round((x * target) / 20);
  if (!hasAreas) return { broad: f(5), service: f(12), location: 0, emergency: target - f(5) - f(12) };
  return { broad: f(4), service: f(8), location: f(6), emergency: target - f(4) - f(8) - f(6) };
}

/**
 * A balanced baseline from a pool. Paul's own additions (source 'manual') are kept first; then each
 * intent type is filled toward mixTargets, rotating across services and towns so no service or town
 * takes over; near-duplicates are never admitted; if a type runs short the remainder is filled from
 * whatever is left, still rotating. Deterministic. ⛔ Never reads winnability.
 */
/* ⚠️ opts.rank is a TIE-BREAK ONLY, after the balance score: among candidates that would balance the
   set equally, the lower rank goes first. This module never knows what the rank means — the caller
   decides (baselineRecommendation.ts prefers questions where the business is not yet named). Balance
   always wins, so a rank cannot turn the baseline into a list of the easiest questions. */
/* ⚠️ opts.serviceCap (2026-10-04, C-03): the recommendation passes MAX_QUESTIONS_PER_SERVICE so one service
   cannot become a grid across towns. Absent = the original cap. The relaxed last pass still ignores
   caps rather than leave the set short; baselineQuality.ts then warns about it. */
/* ⚠️ opts.hardServiceCap: the service cap holds even in the relaxed pass — the set comes back SHORT
   rather than repeat one service (the recommendation's `short` says so and Paul adds his own). */
/* ⚠️ opts.serviceOf: the caller's own reading of which service a question is about (serviceScope.ts
   matches by meaning — "burglary repair" IS "Burglary repair and make safe"), so the cap counts the
   same services the final-20 checks count. Absent = classifyQuestion's exact-token reading. */
export function buildBalancedBaseline(pool: Candidate[], ctx: MixContext, target = 20, opts: { rank?: (question: string) => number; serviceCap?: number; hardServiceCap?: boolean; serviceOf?: (question: string) => string | null } = {}): string[] {
  const towns = [ctx.primaryTown, ...ctx.areas].filter(Boolean);
  const chosen: QuestionMix[] = [];
  const admit = (m: QuestionMix) => {
    if (chosen.length >= target || chosen.some((c) => sameIntent(c.question, m.question, towns))) return false;
    chosen.push(m); return true;
  };
  const all = pool.map((c) => {
    const m = classifyQuestion(c.question.trim(), ctx);
    return { c, m: opts.serviceOf ? { ...m, service: opts.serviceOf(m.question) ?? m.service } : m };
  }).filter((x) => x.m.question);
  /* Locked questions go in first, verbatim, and are never refused as a near-duplicate of each other. */
  for (const x of all) if (x.c.source === 'locked' && chosen.length < target && !chosen.some((c) => c.question === x.m.question)) chosen.push(x.m);
  for (const x of all) if (x.c.source === 'core') admit(x.m);
  for (const x of all) if (x.c.source === 'manual') admit(x.m);
  const counts = (pred: (m: QuestionMix) => boolean) => chosen.filter(pred).length;
  const serviceCap = opts.serviceCap ?? Math.max(3, Math.ceil(target * 0.2));
  const townCap = (t: string | null) => (t && normTown(t) === normTown(ctx.primaryTown)) ? Math.ceil(target * 0.45) : Math.max(2, Math.ceil(target * 0.15));
  const goals = mixTargets(target, ctx.areas.length > 0);
  const rest = all.filter((x) => x.c.source !== 'manual' && x.c.source !== 'locked' && x.c.source !== 'core').map((x) => x.m);
  const rankOf = (q: string) => (opts.rank ? opts.rank(q) : 0);
  /* Fill one intent type by rotation: repeatedly take the candidate whose service and town are
     currently least used, respecting the caps. */
  const fill = (type: IntentType | null, goal: number, relax = false) => {
    for (let guard = 0; guard < 400; guard++) {
      if (chosen.length >= target || (type && counts((m) => m.intent === type) >= goal)) return;
      const pick = rest
        .filter((m) => (!type || m.intent === type) && !chosen.includes(m))
        .filter((m) => {
          const serviceOk = !m.service || counts((c) => c.service === m.service) < serviceCap;
          if (relax) return !opts.hardServiceCap || serviceOk;
          return serviceOk && counts((c) => c.town === m.town) < townCap(m.town);
        })
        .filter((m) => !chosen.some((c) => sameIntent(c.question, m.question, towns)))
        .map((m, i) => ({ m, i, r: rankOf(m.question), s: counts((c) => c.service === m.service) * 3 + counts((c) => c.town === m.town) }))
        .sort((a, b) => a.s - b.s || a.r - b.r || a.i - b.i)[0];
      if (!pick) return;
      admit(pick.m);
    }
  };
  for (const t of ['emergency', 'location', 'broad', 'service'] as IntentType[]) fill(t, goals[t]);
  fill(null, target);
  fill(null, target, true);
  // Present in a readable order: locked (Hook Audit) first, then the core questions, then broad, service, location, emergency.
  const order: IntentType[] = ['broad', 'service', 'location', 'emergency'];
  const locked = new Set(all.filter((x) => x.c.source === 'locked').map((x) => x.m.question));
  const core = new Set(all.filter((x) => x.c.source === 'core').map((x) => x.m.question));
  const head = chosen.filter((m) => locked.has(m.question));
  const coreRows = chosen.filter((m) => !locked.has(m.question) && core.has(m.question));
  const tail = chosen.filter((m) => !locked.has(m.question) && !core.has(m.question)).sort((a, b) => order.indexOf(a.intent) - order.indexOf(b.intent));
  return [...head, ...coreRows, ...tail].map((m) => m.question);
}
