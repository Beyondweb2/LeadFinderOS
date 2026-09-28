/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE NICHE CHECK — "is this niche worth selling Findable into?" (2026-09-28, Paul's brief + his
   methodology decisions). Pure: the plan, the questions and the verdict. The runner is the
   niche-sample edge function; the questions go through the ONE audit engine (create-ai-audit,
   purpose discovery, is_market) — no second audit system.

   ── THE METHOD (NICHE_SAMPLE_METHOD 1) ─────────────────────────────────────────────────────────
     · 3 towns, one per size band — a major city, a medium city / large town, a smaller town — each
       from a DIFFERENT region, drawn at random inside the band (never the same three every time;
       towns an earlier sample of this niche used are avoided when the band allows). London is never
       drawn (unusually large; ONS's built-up-area list excludes it anyway).
     · 4 customer questions per town, the SAME four intents in every town, no brands, the town
       disambiguated with "UK".
     · 3 runs of each. Measured 2026-09-28 over every stored repeat-run question: two identical runs
       share only ~20–30% of the businesses Gemini names (mean Jaccard 0.18–0.32 by trade), so one
       run reads rotation as fragmentation. Three runs let "named every time" be told from "named
       once".
     · Both engines come back from one call, so ChatGPT costs nothing extra. GEMINI DECIDES the
       verdict (the lever: ABLM 0→3 all Gemini; ChatGPT follows directories — findings §5).
       ChatGPT is one line of context and is never averaged in.
     · One Google Places text search per town ("{trade} in {town}", 20 results) — the real local
       market to read Gemini against: are there genuine providers, and is Gemini naming that kind of
       firm, returning directories, or naming almost nobody despite a healthy market? It is NOT a
       ranking: review counts are not read and no "best" set is defined.
     · 36 question-runs + 3 searches ≈ NICHE_SAMPLE_USD (≈ 50p).

   ── THE VERDICT ────────────────────────────────────────────────────────────────────────────────
   Each town gets ONE Gemini pattern in plain words (TownPattern). The niche verdict counts towns:
     WORKABLE        — most towns are "spread across many local firms" or "few names despite a
                       healthy local market" (the gap Findable closes)
     HARDER NICHE    — most towns are "the same few firms", "directories and national brands", or
                       "a thin market" (Google itself lists very few providers)
     PROMISING — NEEDS MORE DATA — the towns disagree
     NEED MORE DATA  — too few valid answers, too few towns readable, or too few businesses
                       surfaced with no market check to interpret the silence
   "Most" is at least two thirds of the towns read (2 of 3). Confidence (High / Medium / Low) is
   how many towns agree, stepped down for failed answers, a failed market search or unstable runs.
   No composite score, anywhere.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { isRealCompetitor } from './auditReport.ts';
import { classifyKnownEntity } from './knownEntities.ts';
import { articleTrade, pluraliseTrade } from './templateVars.ts';
import { isAggregatorUrl } from './aggregators.ts';
import { AUDIT_EST_USD_PER_QUESTION, asPence } from './marketView.ts';

export const NICHE_SAMPLE_METHOD = 1;
export const NICHE_SAMPLE_TOWNS = 3;
export const NICHE_SAMPLE_QUESTIONS_PER_TOWN = 4;
export const NICHE_SAMPLE_RUNS = 3;
/** Google Places Text Search at the ENTERPRISE tier (the mask carries websiteUri) — the rate
 *  search-leads logs to api_usage_log for the same request. */
export const NICHE_PLACES_USD_PER_TOWN = 0.035;
export const NICHE_SAMPLE_QUESTION_RUNS = NICHE_SAMPLE_TOWNS * NICHE_SAMPLE_QUESTIONS_PER_TOWN * NICHE_SAMPLE_RUNS;
export const NICHE_SAMPLE_USD = NICHE_SAMPLE_QUESTION_RUNS * AUDIT_EST_USD_PER_QUESTION + NICHE_SAMPLE_TOWNS * NICHE_PLACES_USD_PER_TOWN;
/** A stored sample this recent is shown instead of offering to spend again. */
export const NICHE_SAMPLE_FRESH_DAYS = 30;

/* ── Towns ─────────────────────────────────────────────────────────────────────────────────────── */
export type SizeBand = 'major' | 'medium' | 'small';
export const NICHE_SAMPLE_BANDS: ReadonlyArray<{ key: SizeBand; label: string; min: number; max: number }> = [
  { key: 'major', label: 'Major city', min: 250_000, max: Number.POSITIVE_INFINITY },
  { key: 'medium', label: 'Medium city / large town', min: 60_000, max: 249_999 },
  { key: 'small', label: 'Smaller town', min: 15_000, max: 40_000 },
];
export type TownRow = { name: string; ons_code: string; population: number | null; region: string | null; suppressed_at?: string | null };
export type SampleTown = { name: string; ons_code: string; population: number; region: string; band: SizeBand };

export function bandOf(population: number | null | undefined): SizeBand | null {
  if (typeof population !== 'number' || !Number.isFinite(population)) return null;
  return NICHE_SAMPLE_BANDS.find((b) => population >= b.min && population <= b.max)?.key ?? null;
}

/** One town per band, distinct regions, random within the band; avoids `avoid` (ons codes an earlier
 *  sample of this niche used) whenever the band still has a choice. null = a band cannot be filled. */
export function pickSampleTowns(towns: readonly TownRow[], opts: { random: () => number; avoid?: ReadonlySet<string> }): SampleTown[] | null {
  const usable = towns.filter((t) => !t.suppressed_at && typeof t.population === 'number' && t.region && t.name && !/^london$/i.test(t.name.trim()));
  const picked: SampleTown[] = [];
  for (const band of NICHE_SAMPLE_BANDS) {
    const inBand = usable.filter((t) => bandOf(t.population) === band.key && !picked.some((p) => p.region === t.region || p.ons_code === t.ons_code));
    const fresh = inBand.filter((t) => !opts.avoid?.has(t.ons_code));
    const pool = fresh.length ? fresh : inBand;
    if (!pool.length) return null;
    const t = pool[Math.min(pool.length - 1, Math.floor(opts.random() * pool.length))];
    picked.push({ name: t.name.trim(), ons_code: t.ons_code, population: t.population as number, region: t.region as string, band: band.key });
  }
  return picked;
}

/* ── Questions ─────────────────────────────────────────────────────────────────────────────────── */
/** The four intents, identical in every town. A niche name that is not a business noun ("plumbing",
 *  a sentence) is refused rather than guessed at — the same rules the templates use. */
export function nicheQuestions(trade: string, town: string): { ok: true; questions: string[] } | { ok: false; reason: string } {
  const a = articleTrade(trade);
  const p = pluraliseTrade(trade);
  if (!a.ok || !p.ok) return { ok: false, reason: 'Name the niche as the business a customer hires — e.g. "roofers", "dog groomers", "accountants".' };
  const place = `${town.trim()}, UK`;
  return {
    ok: true,
    questions: [
      `Can you recommend ${a.value} in ${place}?`,
      `Who are the best ${p.value} in ${place}?`,
      `I need ${a.value} in ${place}. Who should I contact?`,
      `Which ${p.value} in ${place} do local people trust?`,
    ],
  };
}

/* ── The fold ──────────────────────────────────────────────────────────────────────────────────── */
export type NicheEngine = 'gemini' | 'chatgpt';
export type NicheAnswer = { question: string; run: number; engine: NicheEngine; present: boolean; competitors: string[]; citations: string[] };
export type PlacesCandidate = { name: string; website: string | null; primaryType: string | null };
export type NicheTownInput = { town: SampleTown; answers: NicheAnswer[]; places: PlacesCandidate[] | null };

export type NameKind = 'local' | 'directory' | 'national' | 'junk';
export function nameKind(name: string, town: string): NameKind {
  const known = classifyKnownEntity(name);
  if (known?.kind === 'directory') return 'directory';
  if (known?.kind === 'national') return 'national';
  if (!isRealCompetitor(name, town)) return 'junk';
  return 'local';
}

const SUFFIX = new Set(['ltd', 'limited', 'llp', 'plc', 'co', 'inc', 'group', 'uk', 'the', 'and', 'of', 'services', 'service', 'company']);
/** A firm's comparison key: lowercase words minus legal suffixes, the town and the trade words. */
export function firmNameKey(name: string, town: string, trade: string): string {
  const drop = new Set([...town.toLowerCase().split(/[^a-z0-9]+/), ...trade.toLowerCase().split(/[^a-z0-9]+/).flatMap((w) => [w, w.replace(/s$/, ''), `${w}s`])].filter(Boolean));
  const toks = name.toLowerCase().replace(/&/g, ' ').split(/[^a-z0-9]+/).filter((t) => t.length > 1 && !SUFFIX.has(t) && !drop.has(t));
  return toks.join(' ') || name.trim().toLowerCase();
}
function sameFirm(a: string, b: string): boolean {
  if (!a || !b) return false;
  if (a === b) return true;
  const [s, l] = a.length <= b.length ? [a, b] : [b, a];
  return s.length >= 5 && (` ${l} `).includes(` ${s} `);
}

export type EngineTownRead = {
  planned: number; answers: number;
  localPerAnswer: number; emptyShare: number; dirNatShare: number;
  distinctLocal: number; top3Share: number; heldShare: number; flipShare: number;
  directoryCitationShare: number;
  placesListed: number | null; placesNamed: number | null;
};

export type TownPattern =
  | 'fragmented'                 // spread across many local firms
  | 'low_coverage_healthy_market' // few names, but Google lists plenty of providers — the gap
  | 'concentrated'               // the same few firms every time
  | 'directory_national'         // directories and national brands, not local firms
  | 'thin_market'                // few names AND Google lists very few providers
  | 'sparse_unclear'             // few names, market size unknown or middling
  | 'mixed'                      // none of the above clearly
  | 'insufficient';              // too few valid answers to read

export const TOWN_PATTERN_LABEL: Record<TownPattern, string> = {
  fragmented: 'spread across many local firms',
  low_coverage_healthy_market: 'names few firms despite a healthy local market',
  concentrated: 'the same few firms every time',
  directory_national: 'mostly directories and national brands',
  thin_market: 'few firms named, and few exist',
  sparse_unclear: 'names few firms (market size unclear)',
  mixed: 'no clear pattern',
  insufficient: 'too few answers to read',
};

/* The thresholds — judgement, named, and each with its reason. */
/** Below this many local firms per Gemini answer, the answer is "sparse". Stored single runs name 2.4–6 by trade. */
export const SPARSE_LOCAL_PER_ANSWER = 1.5;
/** …or this share of answers name no local firm at all. */
export const SPARSE_EMPTY_SHARE = 0.4;
/** Half or more of Gemini's named businesses being directories / national brands = it is not naming local firms. */
export const DIRECTORY_NATIONAL_SHARE = 0.5;
/** Google listing at least this many genuine local providers (of the 20 one search returns) = a healthy market. */
export const HEALTHY_MARKET_MIN = 8;
/** At most this many = a thin market. */
export const THIN_MARKET_MAX = 3;
/** Concentrated: this few distinct local firms across all 12 answers, with the top three holding this share… */
export const CONCENTRATED_MAX_FIRMS = 5;
export const CONCENTRATED_TOP3_SHARE = 0.7;
/** …or names that repeat in every run of a question making up this share of each answer. */
export const CONCENTRATED_HELD_SHARE = 0.6;
/** Fragmented: at least this many distinct local firms, with the top three holding less than this share. */
export const FRAGMENTED_MIN_FIRMS = 8;
export const FRAGMENTED_TOP3_SHARE = 0.6;
/** Answers a town must return (share of planned) to be read at all. */
export const TOWN_MIN_VALID_SHARE = 0.5;
/** Across the sample: the Gemini answers that must come back for any verdict. */
export const SAMPLE_MIN_VALID_SHARE = 0.8;
/** Fewer distinct local firms than this across the whole sample, with no market check to explain it, is too little to judge. */
export const SAMPLE_MIN_DISTINCT_FIRMS = 10;
/** A question whose runs disagree about naming anyone at all is unstable; this share of such questions lowers confidence. */
export const UNSTABLE_FLIP_SHARE = 0.5;

export function readEngineTown(input: NicheTownInput, engine: NicheEngine, nationalKeys: ReadonlySet<string>, trade: string): EngineTownRead {
  const town = input.town.name;
  const planned = NICHE_SAMPLE_QUESTIONS_PER_TOWN * NICHE_SAMPLE_RUNS;
  const rows = input.answers.filter((a) => a.engine === engine && a.present);
  const mentions = new Map<string, number>();
  let local = 0, dirNat = 0, empty = 0, localPerAnswerSum = 0, dirCites = 0, allCites = 0;
  const perAnswerLocal: Array<{ q: string; keys: Set<string> }> = [];
  for (const r of rows) {
    const keys = new Set<string>();
    for (const c of r.competitors) {
      const kind = nameKind(c, town);
      const key = firmNameKey(c, town, trade);
      if (kind === 'directory' || kind === 'national' || (kind === 'local' && nationalKeys.has(key))) { dirNat++; continue; }
      if (kind !== 'local') continue;
      keys.add(key);
    }
    for (const k of keys) mentions.set(k, (mentions.get(k) ?? 0) + 1);
    local += keys.size;
    localPerAnswerSum += keys.size;
    if (keys.size === 0) empty++;
    perAnswerLocal.push({ q: r.question, keys });
    for (const u of r.citations) { allCites++; if (isAggregatorUrl(u)) dirCites++; }
  }
  const byQ = new Map<string, Set<string>[]>();
  for (const a of perAnswerLocal) byQ.set(a.q, [...(byQ.get(a.q) ?? []), a.keys]);
  let heldSum = 0, heldN = 0, flip = 0, flipN = 0;
  for (const sets of byQ.values()) {
    if (sets.length < 2) continue;
    flipN++;
    if (sets.some((s) => s.size > 0) && sets.some((s) => s.size === 0)) flip++;
    const mean = sets.reduce((t, s) => t + s.size, 0) / sets.length;
    if (mean <= 0) continue;
    const held = [...sets[0]].filter((k) => sets.every((s) => s.has(k))).length;
    heldSum += held / mean; heldN++;
  }
  const counts = [...mentions.values()].sort((a, b) => b - a);
  const top3 = counts.slice(0, 3).reduce((t, n) => t + n, 0);
  let placesListed: number | null = null, placesNamed: number | null = null;
  if (input.places) {
    const cands = input.places.filter((p) => nameKind(p.name, town) === 'local' && !(p.website && isAggregatorUrl(p.website)));
    const cKeys = cands.map((p) => firmNameKey(p.name, town, trade));
    placesListed = cands.length;
    placesNamed = cKeys.filter((ck) => [...mentions.keys()].some((mk) => sameFirm(ck, mk))).length;
  }
  return {
    planned, answers: rows.length,
    localPerAnswer: rows.length ? localPerAnswerSum / rows.length : 0,
    emptyShare: rows.length ? empty / rows.length : 1,
    dirNatShare: local + dirNat ? dirNat / (local + dirNat) : 0,
    distinctLocal: mentions.size,
    top3Share: local ? top3 / local : 0,
    heldShare: heldN ? heldSum / heldN : 0,
    flipShare: flipN ? flip / flipN : 0,
    directoryCitationShare: allCites ? dirCites / allCites : 0,
    placesListed, placesNamed,
  };
}

export function townPattern(g: EngineTownRead): TownPattern {
  if (g.answers < g.planned * TOWN_MIN_VALID_SHARE) return 'insufficient';
  if (g.dirNatShare >= DIRECTORY_NATIONAL_SHARE) return 'directory_national';
  if (g.localPerAnswer < SPARSE_LOCAL_PER_ANSWER || g.emptyShare >= SPARSE_EMPTY_SHARE) {
    if (g.placesListed === null) return 'sparse_unclear';
    if (g.placesListed >= HEALTHY_MARKET_MIN) return 'low_coverage_healthy_market';
    if (g.placesListed <= THIN_MARKET_MAX) return 'thin_market';
    return 'sparse_unclear';
  }
  if ((g.distinctLocal <= CONCENTRATED_MAX_FIRMS && g.top3Share >= CONCENTRATED_TOP3_SHARE) || g.heldShare >= CONCENTRATED_HELD_SHARE) return 'concentrated';
  if (g.distinctLocal >= FRAGMENTED_MIN_FIRMS && g.top3Share < FRAGMENTED_TOP3_SHARE) return 'fragmented';
  return 'mixed';
}

const WORKABLE_PATTERNS: ReadonlySet<TownPattern> = new Set(['fragmented', 'low_coverage_healthy_market']);
const HARDER_PATTERNS: ReadonlySet<TownPattern> = new Set(['concentrated', 'directory_national', 'thin_market']);

export type NicheVerdictLabel = 'WORKABLE' | 'HARDER NICHE' | 'PROMISING — NEEDS MORE DATA' | 'NEED MORE DATA';
export type NicheConfidence = 'High' | 'Medium' | 'Low';
export type NicheTownResult = { town: SampleTown; pattern: TownPattern; gemini: EngineTownRead; chatgpt: EngineTownRead; placesFailed: boolean };
export type NicheSampleVerdict = {
  verdict: NicheVerdictLabel;
  why: string;
  gemini: string;
  chatgpt: string;
  markets: string;
  confidence: NicheConfidence;
  nextStep: string;
  towns: NicheTownResult[];
  validGeminiShare: number;
};

const pct = (x: number) => `${Math.round(x * 100)}%`;
const bandLabel = (b: SizeBand) => NICHE_SAMPLE_BANDS.find((x) => x.key === b)?.label ?? b;
const stepDown = (c: NicheConfidence): NicheConfidence => (c === 'High' ? 'Medium' : 'Low');

export function nicheSampleVerdict(trade: string, inputs: readonly NicheTownInput[]): NicheSampleVerdict {
  const plural = pluraliseTrade(trade);
  const tradeWords = plural.ok ? plural.value : trade.toLowerCase();
  /* A "local" name Gemini gives in two or more of the sampled towns — towns chosen from different
     regions — is a chain or a national brand, not a local firm. */
  const townsByKey = new Map<string, Set<string>>();
  for (const t of inputs) {
    for (const a of t.answers) {
      if (a.engine !== 'gemini' || !a.present) continue;
      for (const c of a.competitors) {
        if (nameKind(c, t.town.name) !== 'local') continue;
        const k = firmNameKey(c, t.town.name, trade);
        townsByKey.set(k, new Set([...(townsByKey.get(k) ?? []), t.town.ons_code]));
      }
    }
  }
  const nationalKeys = new Set([...townsByKey.entries()].filter(([, s]) => s.size >= 2).map(([k]) => k));

  const towns: NicheTownResult[] = inputs.map((t) => {
    const g = readEngineTown(t, 'gemini', nationalKeys, trade);
    return { town: t.town, pattern: townPattern(g), gemini: g, chatgpt: readEngineTown(t, 'chatgpt', nationalKeys, trade), placesFailed: t.places === null };
  });
  const planned = towns.reduce((s, t) => s + t.gemini.planned, 0);
  const valid = towns.reduce((s, t) => s + t.gemini.answers, 0);
  const validGeminiShare = planned ? valid / planned : 0;
  const readable = towns.filter((t) => t.pattern !== 'insufficient');
  const w = readable.filter((t) => WORKABLE_PATTERNS.has(t.pattern));
  const h = readable.filter((t) => HARDER_PATTERNS.has(t.pattern));
  const distinctFirms = new Set<string>();
  for (const t of inputs) for (const a of t.answers) if (a.engine === 'gemini' && a.present) for (const c of a.competitors) if (nameKind(c, t.town.name) === 'local') distinctFirms.add(`${t.town.ons_code}|${firmNameKey(c, t.town.name, trade)}`);
  const anyHealthyMarket = towns.some((t) => (t.gemini.placesListed ?? 0) >= HEALTHY_MARKET_MIN);
  const unstable = readable.length > 0 && readable.reduce((s, t) => s + t.gemini.flipShare, 0) / readable.length >= UNSTABLE_FLIP_SHARE;

  const markets = towns.map((t) => `${t.town.name} (${bandLabel(t.town.band).toLowerCase()}, ${t.town.region})`).join(' · ');
  const gemini = 'Gemini: ' + towns.map((t) => `${t.town.name} — ${TOWN_PATTERN_LABEL[t.pattern]}`).join('; ') + '.';
  const cg = towns.filter((t) => t.chatgpt.answers > 0);
  const cLocal = cg.length ? cg.reduce((s, t) => s + t.chatgpt.localPerAnswer, 0) / cg.length : 0;
  const gLocal = readable.length ? readable.reduce((s, t) => s + t.gemini.localPerAnswer, 0) / readable.length : 0;
  const cDir = cg.length ? cg.reduce((s, t) => s + t.chatgpt.directoryCitationShare, 0) / cg.length : 0;
  const chatgpt = !cg.length
    ? 'ChatGPT: no answers came back.'
    : `ChatGPT: about ${cLocal.toFixed(1)} local firms per answer (Gemini ${gLocal.toFixed(1)}); ${pct(cDir)} of its sources are directories${cDir >= 0.5 ? ' — listings drive it here, not pages' : ''}. Context only.`;

  const need = (why: string, next: string): NicheSampleVerdict => ({ verdict: 'NEED MORE DATA', why, gemini, chatgpt, markets, confidence: 'Low', nextStep: next, towns, validGeminiShare });
  if (validGeminiShare < SAMPLE_MIN_VALID_SHARE || readable.length < 2) {
    return need(`Only ${valid} of ${planned} Gemini answers came back, so there is not enough to judge.`, 'Run the check again — failed answers are not charged twice, and a new draw of towns helps if one town failed.');
  }
  if (distinctFirms.size < SAMPLE_MIN_DISTINCT_FIRMS && !anyHealthyMarket && h.length < Math.ceil(readable.length * 2 / 3)) {
    return need(`Gemini surfaced only ${distinctFirms.size} local firms across the sample and the market search could not show whether that is silence or a small market.`, `Check the niche name is what a customer would search for (e.g. "${tradeWords}"), then run it again.`);
  }

  const agree = (n: number) => n >= Math.ceil(readable.length * 2 / 3);
  let verdict: NicheVerdictLabel;
  let why: string;
  let nextStep: string;
  const count = (p: TownPattern) => readable.filter((t) => t.pattern === p).length;
  if (agree(w.length)) {
    verdict = 'WORKABLE';
    const lowCov = count('low_coverage_healthy_market');
    const frag = count('fragmented');
    /* Name every town that supports the verdict — "1 of 3 towns" under a WORKABLE read as the minority. */
    why = lowCov && frag
      ? `In ${w.length} of ${readable.length} towns Gemini leaves room: it spreads its answers across many local ${tradeWords} in ${frag === 1 ? 'one' : frag}, and names few of the providers Google lists in ${lowCov === 1 ? 'another' : lowCov} — the gap Findable closes.`
      : lowCov
        ? `Google lists plenty of local ${tradeWords}, but Gemini names few of them in ${lowCov} of ${readable.length} towns — the gap Findable's work on a client's own website closes.`
        : `Gemini spreads its answers across many different local ${tradeWords} in ${frag} of ${readable.length} towns — no small group holds the recommendations, so a client can win a place.`;
    nextStep = `Find leads in these towns and start outreach — pitch Gemini visibility first.`;
  } else if (agree(h.length)) {
    verdict = 'HARDER NICHE';
    const top = (['concentrated', 'directory_national', 'thin_market'] as TownPattern[]).sort((a, b) => count(b) - count(a))[0];
    if (top === 'thin_market') {
      why = `Google itself lists very few local ${tradeWords} in these towns — the niche may be too thin to prospect, whatever AI says.`;
      nextStep = 'Not worth prospecting on this evidence. Try a broader niche name, or a different niche.';
    } else if (top === 'directory_national') {
      why = `Gemini answers mostly with directories and national brands rather than local firms — a client's own pages move this less; directory listings do.`;
      nextStep = 'Only take clients here who will get listed where Gemini is looking; do not lead the pitch with website work.';
    } else {
      why = `Gemini keeps naming the same small group of firms in ${count('concentrated')} of ${readable.length} towns — getting a client in means displacing them.`;
      nextStep = 'Only pursue businesses already close to that group; otherwise pick another niche.';
    }
  } else {
    verdict = 'PROMISING — NEEDS MORE DATA';
    why = `The towns disagree (${readable.map((t) => `${t.town.name}: ${TOWN_PATTERN_LABEL[t.pattern]}`).join('; ')}), so one sample cannot settle it.`;
    nextStep = `Run a second check on three different towns (about ${asPence(NICHE_SAMPLE_USD)}) before committing.`;
  }

  const top = Math.max(w.length, h.length, readable.length - w.length - h.length);
  let confidence: NicheConfidence = top === readable.length && readable.length >= 3 ? 'High' : agree(top) ? 'Medium' : 'Low';
  if (validGeminiShare < 0.9) confidence = stepDown(confidence);
  if (towns.some((t) => t.placesFailed)) confidence = stepDown(confidence);
  if (unstable) confidence = stepDown(confidence);
  if (verdict === 'PROMISING — NEEDS MORE DATA' && confidence === 'High') confidence = 'Medium';
  return { verdict, why, gemini, chatgpt, markets, confidence, nextStep, towns, validGeminiShare };
}
