/* ════════════════════════════════════════════════════════════════════════════════════════════════
   MARKET MODEL — where a business actually competes, which is not the same as where the
   transaction happens.

   🔴 THE ROOT FAULT THIS REPLACES. The wizard asked "How do clients work with you?" and offered
   "They come to my premises / I work remotely / A mix of both". That is a DELIVERY question, and
   it produced two wrong answers at once: a remote-delivering national firm (Findable itself) was
   read as local-by-default and had a town injected into every question, and the national path it
   should have taken generated ONE sentence pattern — "[service] for [audience] [country]" — so a
   20-question national set was twenty paraphrases of one query.

   The three models below are about the MARKET, not the delivery:
     · local    — chosen mainly because of proximity to a town or area.
     · national — chosen across a country/market; proximity is irrelevant.
     · hybrid   — a real local market AND a wider one.

   IMPORTED BY AN EDGE FUNCTION: relative imports with an explicit .ts extension only (CLAUDE.md §4).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export type MarketModel = 'local' | 'national' | 'hybrid';

/** The one place the wizard's wording for this choice lives, so the screen and the prompt cannot
 *  describe the same three options differently. */
export const MARKET_MODEL_QUESTION = 'Where do you serve customers?';

export const MARKET_MODEL_OPTIONS: ReadonlyArray<{
  value: MarketModel;
  label: string;
  hint: string;
  blurb: string;
}> = [
  { value: 'local', label: 'Local / service area', hint: 'Local', blurb: 'I mainly serve customers in one town, city or surrounding area.' },
  { value: 'national', label: 'National / remote', hint: 'National', blurb: 'I serve customers across the country or work remotely.' },
  { value: 'hybrid', label: 'Hybrid', hint: 'Hybrid', blurb: 'I have a local market but also serve customers more widely.' },
];

/** A town is a REQUIREMENT for local and hybrid (both ask local questions) and is meaningless for
 *  national. Derived in one place so the screen's "can I continue" and the server's refusal agree. */
export function townRequiredFor(model: MarketModel | null): boolean {
  return model !== 'national';
}

/** A business-wide audience only shapes questions when the market is wider than one town. */
export function audienceUsefulFor(model: MarketModel | null): boolean {
  return model === 'national' || model === 'hybrid';
}

/* ── THE NATIONAL INTENT MIX ──────────────────────────────────────────────────────────────────
   A national audit's whole value is coverage of the DIFFERENT ways a buyer arrives, because there
   is no town to vary. Seven intents, weighted by how much of a real buying journey each carries.
   The weights are the tuning dial; the categories are the contract the tests assert on. */

export type NationalIntent =
  | 'provider' | 'problem' | 'service' | 'audience' | 'category' | 'comparison' | 'terminology';

type IntentSpec = { intent: NationalIntent; weight: number; label: string; brief: string; example: string };

const NATIONAL_INTENT_SPECS: readonly IntentSpec[] = [
  { intent: 'provider', weight: 3, label: 'PROVIDER / COMMERCIAL', brief: 'who supplies this, asked as a buyer looking for a supplier', example: 'who offers AI visibility services for UK local businesses' },
  { intent: 'problem', weight: 3, label: 'PROBLEM / NEED', brief: 'the symptom the buyer has, in their own words, with no product name in it', example: 'who can help if chatgpt recommends my competitors instead of my business' },
  { intent: 'service', weight: 3, label: 'SERVICE-SPECIFIC', brief: 'one named service or deliverable, one intent each', example: 'who can audit whether my business appears in chatgpt' },
  { intent: 'audience', weight: 2, label: 'AUDIENCE-SPECIFIC', brief: 'the same need qualified by who the buyer is', example: 'what AI visibility services suit small UK businesses' },
  { intent: 'category', weight: 2, label: 'CATEGORY DISCOVERY', brief: 'the buyer naming the category rather than a firm', example: 'what companies provide AI SEO services in the uk' },
  { intent: 'comparison', weight: 1, label: 'COMPARISON / ALTERNATIVE', brief: 'weighing options, only where a buyer would really compare', example: 'alternatives to a traditional SEO agency for AI search' },
  { intent: 'terminology', weight: 1, label: 'TERMINOLOGY / INFORMATIONAL', brief: 'the term itself, ONLY when the answer names suppliers — never a how-to and never a course', example: 'what is generative engine optimisation and who does it' },
];

export const NATIONAL_INTENTS: readonly NationalIntent[] = NATIONAL_INTENT_SPECS.map((s) => s.intent);

/**
 * Split `n` questions across the seven intents by weight, largest remainder, in the priority order
 * above. Categories that round to zero are dropped entirely rather than given a token single
 * question — the brief's "do NOT force every category if inappropriate".
 */
export function nationalIntentMix(n: number): Array<{ intent: NationalIntent; count: number }> {
  const want = Math.max(0, Math.floor(n));
  if (want === 0) return [];
  /* Small sets take the highest-weight intents whole rather than fragmenting into sevenths: at
     n=3 that is three different intents of one each, which is exactly what a 3-question set wants. */
  if (want <= NATIONAL_INTENT_SPECS.length) {
    return NATIONAL_INTENT_SPECS.slice(0, want).map((s) => ({ intent: s.intent, count: 1 }));
  }
  const total = NATIONAL_INTENT_SPECS.reduce((a, s) => a + s.weight, 0);
  const rows = NATIONAL_INTENT_SPECS.map((s) => {
    const exact = (want * s.weight) / total;
    return { intent: s.intent, count: Math.floor(exact), rem: exact - Math.floor(exact) };
  });
  let left = want - rows.reduce((a, r) => a + r.count, 0);
  for (const row of [...rows].sort((a, b) => b.rem - a.rem)) {
    if (left <= 0) break;
    row.count += 1;
    left -= 1;
  }
  return rows.filter((r) => r.count > 0).map((r) => ({ intent: r.intent, count: r.count }));
}

/** Context the prompt blocks and the deterministic templates both read. */
export type MarketContext = {
  businessType: string;
  /** Country/market word used in national phrasing ("uk"). NEVER a town. */
  region: string;
  /** e.g. "UK local businesses". Empty when not given. */
  audience: string;
  /** Services / topics the operator listed. */
  topics: string[];
  /** Optional specialist sectors / niches. */
  sectors: string[];
};

const listLine = (items: string[]) => items.filter(Boolean).join(', ');

/**
 * The national rule block. Replaces the single "[service] for [audience] [country]" instruction
 * that turned every national set into paraphrases of one query.
 */
export function nationalIntentDirective(n: number, ctx: MarketContext): string {
  const mix = nationalIntentMix(n);
  const lines = mix.map(({ intent, count }) => {
    const spec = NATIONAL_INTENT_SPECS.find((s) => s.intent === intent)!;
    return `- ${count} x ${spec.label}: ${spec.brief}. Shape: "${spec.example}".`;
  });
  const audienceLine = ctx.audience
    ? `TARGET CUSTOMER: ${ctx.audience}. Qualify by this audience where it makes the question more realistic — NOT on every line.`
    : 'No target customer was given — infer the most likely buyer from the category and topics.';
  const topicLine = ctx.topics.length
    ? `SERVICES / TOPICS: ${listLine(ctx.topics)}. Spread the service and category questions across these; one topic per question.`
    : '';
  const sectorLine = ctx.sectors.length
    ? `SPECIALIST SECTORS: ${listLine(ctx.sectors)}. Worth a minority of the questions at most.`
    : '';
  return [
    '- NEVER use "near me", and NEVER name a town, city or local area. This business is not chosen for proximity.',
    `- NEVER use broad head-terms ("best [service] in ${ctx.region}", "top [service] ${ctx.region}", "leading…"). Directories own them, they are unwinnable for one firm and they prove nothing.`,
    `- The market is ${ctx.region}. Use it as a qualifier where a real person would, not on every line.`,
    '',
    'INTENT MIX — produce EXACTLY this spread, and never paraphrase one intent to fill another intent’s slots:',
    ...lines,
    '',
    audienceLine,
    topicLine,
    sectorLine,
    '- Every question must be one a REAL potential customer would type. No two questions may be the same question in different words.',
  ].filter((l) => l !== '').join('\n');
}

/**
 * How a hybrid set is split. Local leads because the local half is the half with a verifiable town
 * to judge; the wider half is what makes it a hybrid at all.
 */
export function hybridAllocation(n: number): { local: number; national: number } {
  const want = Math.max(0, Math.floor(n));
  if (want <= 1) return { local: want, national: 0 };
  const local = Math.ceil(want / 2);
  return { local, national: want - local };
}

/** The hybrid rule block: both worlds, explicitly counted, explicitly not the same query twice. */
export function hybridIntentDirective(n: number, ctx: MarketContext, placeLabel: string): string {
  const { local, national } = hybridAllocation(n);
  return [
    `This business has a REAL LOCAL MARKET and a WIDER ${ctx.region.toUpperCase()} MARKET. Produce both, in these proportions:`,
    '',
    `LOCAL HALF — ${local} question(s):`,
    `- Written as "[service] in ${placeLabel}", the place ALWAYS exactly "${placeLabel}".`,
    '- NEVER "near me". Vary the SERVICE and the situation, never just the adjective.',
    '',
    `WIDER HALF — ${national} question(s):`,
    nationalIntentDirective(national, ctx),
    '',
    '⛔ THE TWO HALVES MUST NOT BE THE SAME QUESTION WITH AND WITHOUT THE TOWN. Where a local',
    'question asks about one service, the wider questions ask about different services, problems',
    'or audiences.',
  ].join('\n');
}

/* ── DETERMINISTIC TEMPLATES ──────────────────────────────────────────────────────────────────
   The floor when OpenAI is unavailable. Same intent spread the prompt asks for, so a fallback
   national set is varied rather than thirteen "[trade] for [audience] uk" lines. */

const AUDIENCES_FALLBACK = ['small businesses', 'startups', 'sole traders', 'ecommerce businesses', 'limited companies'];

/** Append the market word unless the phrase already names it — an audience like "UK local
 *  businesses" would otherwise produce "… for uk local businesses uk". */
const withRegion = (phrase: string, region: string) =>
  phrase.toLowerCase().includes(region.toLowerCase()) ? phrase : `${phrase} ${region}`;

function templatesFor(intent: NationalIntent, t: string, ctx: MarketContext): string[] {
  const r = ctx.region;
  const aud = ctx.audience ? [ctx.audience, ...AUDIENCES_FALLBACK] : AUDIENCES_FALLBACK;
  const topics = ctx.topics.length ? ctx.topics : [t];
  const R = (p: string) => withRegion(p, r);
  switch (intent) {
    case 'provider':
      return [
        R(`who offers ${t}`),
        R(`who provides ${t} for ${aud[0]}`),
        R(`which firms offer ${t}`),
        R(`who can i hire for ${t}`),
        ...topics.map((s) => R(`who offers ${s}`)),
      ];
    case 'problem':
      return [
        ...topics.map((s) => R(`who can help with ${s}`)),
        R(`who do i talk to about ${t}`),
        ...topics.map((s) => R(`i need help with ${s} who should i use`)),
      ];
    case 'service':
      return [
        ...topics.map((s) => R(s)),
        ...topics.map((s) => R(`${s} for ${aud[0]}`)),
      ];
    case 'audience':
      return [
        ...aud.map((a) => R(`${t} for ${a}`)),
        ...aud.slice(1).map((a) => R(`${topics[0]} for ${a}`)),
      ];
    case 'category':
      return [
        R(`what companies provide ${t}`),
        R(`${t} providers`),
        R(`${t} companies`),
        R(`${t} specialists`),
        R(`who are the main ${t} providers`),
        ...topics.map((s) => R(`${s} companies`)),
      ];
    case 'comparison':
      return [
        R(`alternatives to a ${t} agency`),
        R(`how to choose a ${t} provider`),
        R(`is ${t} worth it for ${aud[0]}`),
        ...topics.slice(0, 3).map((s) => R(`who is best for ${s} vs doing it in house`)),
      ];
    case 'terminology':
      return [
        ...topics.map((s) => R(`what is ${s} and who provides it`)),
        ...topics.slice(0, 3).map((s) => R(`does ${s} matter for ${aud[0]}`)),
      ];
  }
}

/** A varied national template set, `count` long, spread across the intent mix. */
export function nationalFallbackQuestions(businessType: string, ctx: MarketContext, count: number): string[] {
  const t = (businessType || 'business').toLowerCase();
  const out: string[] = [];
  const seen = new Set<string>();
  const push = (q: string) => {
    const s = q.replace(/\s+/g, ' ').trim().toLowerCase();
    if (!s || seen.has(s)) return false;
    seen.add(s);
    out.push(s);
    return true;
  };
  for (const { intent, count: want } of nationalIntentMix(count)) {
    let taken = 0;
    for (const q of templatesFor(intent, t, ctx)) {
      if (taken >= want) break;
      if (push(q)) taken++;
    }
  }
  /* Top up across every intent in order rather than coming up short — the caller has already
     decided how many questions it is paying for. */
  if (out.length < count) {
    for (const spec of NATIONAL_INTENT_SPECS) {
      for (const q of templatesFor(spec.intent, t, ctx)) {
        if (out.length >= count) break;
        push(q);
      }
      if (out.length >= count) break;
    }
  }
  return out.slice(0, count);
}

/**
 * Vocabulary the off-trade guard may accept as "about this business", BEYOND the business type.
 *
 * ⛔ NATIONAL AND HYBRID ONLY, and that is the point. A national business's best questions are
 * problem-shaped ("who can help if chatgpt recommends my competitors") and carry neither the
 * category's own words nor any entry in TRADE_INTENTS, so the trade guard — tuned on "electrician
 * in Thetford" — throws them away. A local trade keeps the tight guard it was measured against.
 */
export function marketVocabulary(ctx: MarketContext): string[] {
  return [...ctx.topics, ...ctx.sectors, ctx.audience].filter((s) => typeof s === 'string' && s.trim().length > 0);
}
