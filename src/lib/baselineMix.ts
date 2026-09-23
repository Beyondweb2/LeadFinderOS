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

   ⛔ WINNABILITY NEVER CHOOSES THE BASELINE. Discovery's verdicts are shown to Paul as information;
   buildBalancedBaseline does not read them. Picking the easiest questions would measure a flattering
   set, not the business.

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

const EMERGENCY = /\bemergency\b|\burgent|\btoday\b|\btonight\b|\bright now\b|\basap\b|24 ?\/ ?7|out of hours|\bno power\b|power cut|keeps? (?:tripping|blowing)|\btripp(?:ing|ed)\b|burning smell|sparking|\bshock\b|\blocked out\b|\bleak(?:ing)?\b|\bburst\b|keeps letting me down|\bbroken\b|stopped working/i;

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
  if (qs.length !== target) warnings.push(`${qs.length} of ${target} questions — the paid baseline is exactly ${target}.`);
  if (ctx.areas.length && qs.length && primaryCount / qs.length > 0.6) {
    warnings.push(`${primaryCount} of ${qs.length} questions target ${ctx.primaryTown}${unusedAreas.length ? ` while ${unusedAreas.length} other approved service area${unusedAreas.length === 1 ? ' is' : 's are'} unused (${unusedAreas.join(', ')})` : ''}.`);
  } else if (unusedAreas.length && qs.length >= target) {
    warnings.push(`Approved service area${unusedAreas.length === 1 ? '' : 's'} not covered: ${unusedAreas.join(', ')}.`);
  }
  const maxShare = Math.max(4, Math.ceil(qs.length * 0.25));
  for (const [s, n] of byService) if (n > maxShare) warnings.push(`"${s}" appears in ${n} of ${qs.length} questions — one service dominates.`);
  const usedServices = [...byService.values()].filter((n) => n > 0).length;
  if (ctx.services.length >= 4 && qs.length >= target && usedServices < Math.min(5, ctx.services.length)) warnings.push(`Only ${usedServices} of ${ctx.services.length} approved services are represented.`);
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

export interface Candidate { question: string; source: 'manual' | 'discovery' | 'generated' }

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
export function buildBalancedBaseline(pool: Candidate[], ctx: MixContext, target = 20): string[] {
  const towns = [ctx.primaryTown, ...ctx.areas].filter(Boolean);
  const chosen: QuestionMix[] = [];
  const admit = (m: QuestionMix) => {
    if (chosen.length >= target || chosen.some((c) => sameIntent(c.question, m.question, towns))) return false;
    chosen.push(m); return true;
  };
  const all = pool.map((c) => ({ c, m: classifyQuestion(c.question.trim(), ctx) })).filter((x) => x.m.question);
  for (const x of all) if (x.c.source === 'manual') admit(x.m);
  const counts = (pred: (m: QuestionMix) => boolean) => chosen.filter(pred).length;
  const serviceCap = Math.max(3, Math.ceil(target * 0.2));
  const townCap = (t: string | null) => (t && normTown(t) === normTown(ctx.primaryTown)) ? Math.ceil(target * 0.45) : Math.max(2, Math.ceil(target * 0.15));
  const goals = mixTargets(target, ctx.areas.length > 0);
  const rest = all.filter((x) => x.c.source !== 'manual').map((x) => x.m);
  /* Fill one intent type by rotation: repeatedly take the candidate whose service and town are
     currently least used, respecting the caps. */
  const fill = (type: IntentType | null, goal: number, relax = false) => {
    for (let guard = 0; guard < 400; guard++) {
      if (chosen.length >= target || (type && counts((m) => m.intent === type) >= goal)) return;
      const pick = rest
        .filter((m) => (!type || m.intent === type) && !chosen.includes(m))
        .filter((m) => relax || ((!m.service || counts((c) => c.service === m.service) < serviceCap) && counts((c) => c.town === m.town) < townCap(m.town)))
        .filter((m) => !chosen.some((c) => sameIntent(c.question, m.question, towns)))
        .map((m, i) => ({ m, i, s: counts((c) => c.service === m.service) * 3 + counts((c) => c.town === m.town) }))
        .sort((a, b) => a.s - b.s || a.i - b.i)[0];
      if (!pick) return;
      admit(pick.m);
    }
  };
  for (const t of ['emergency', 'location', 'broad', 'service'] as IntentType[]) fill(t, goals[t]);
  fill(null, target);
  fill(null, target, true);
  // Present in a readable order: broad, service, location, emergency.
  const order: IntentType[] = ['broad', 'service', 'location', 'emergency'];
  return [...chosen].sort((a, b) => order.indexOf(a.intent) - order.indexOf(b.intent)).map((m) => m.question);
}
