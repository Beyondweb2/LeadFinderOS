/* ════════════════════════════════════════════════════════════════════════════════════════════════
   "YOU'RE ALREADY NAMED ON X SEARCHES" — THE BASELINE'S CONTEXT FROM THE DISCOVERY (Paul, 2026-11-15).

   A baseline shows only its 20 target searches. A client AI already names elsewhere (Moments: 13 searches
   in her Discovery) read "0%" and "AI doesn't mention you yet" — false. So the baseline page now opens with
   the searches the business's Discovery found it already named on:
     • from the Discovery's STORED answers, shown once, labelled "from your Discovery on <date>";
     • NOT re-measured for the client and NOT part of the guarantee: the 20 target searches, their re-checks,
       the frozen day-0 numbers and the guarantee maths are untouched;
     • a search that is also one of the 20 targets is left out of this list (the 20 are "more").
   Internally (never the client) Paul gets a re-check of these searches every quarter, flagging any that
   dropped (weekly-visibility, purpose 'named_recheck').

   Also here: the report header's PLACE. It used to fall back to the commonest place in the search list,
   so Moments' baseline (no town stored; Mayo-based, covers all of Ireland) said "Clare". The header now
   says only what is known: the audit's town, else its stored address, else (a nationwide business) the
   country — never a place guessed from the searches.
   ⚠️ Pure, no I/O: the renderer and weekly-visibility do the reads (_shared/already-named.ts).
   Tested by scripts/baseline-already-named.test.ts.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** The internal re-check of already-named searches runs this often. */
export const NAMED_RECHECK_DAYS = 91;
const DAY_MS = 86_400_000;

const norm = (s: string) => s.trim().toLowerCase().replace(/[?.!]+$/, '').replace(/\s+/g, ' ');

/** One Discovery search, as the report model reads it (OppQuestion subset). */
export interface NamedSource {
  question: string;
  namedYou: number;
  tier?: string;
  verdict?: { rule: string; verdict: string | null } | null;
}

/** Was the business named on this Discovery search? Rules v2: the verdict's own "Already named" (rule 'visible');
 *  older audits: named in at least one answer. A flagged / left-out search never counts. */
export function namedOn(q: NamedSource): boolean {
  if (q.tier === 'flagged') return false;
  if (q.verdict) return q.verdict.rule === 'visible';
  return q.namedYou > 0;
}

/** The Discovery's already-named searches, most-named first, minus any that is one of the baseline's targets. */
export function alreadyNamedSearches(discovery: NamedSource[], targets: string[]): string[] {
  const t = new Set(targets.map(norm));
  const seen = new Set<string>();
  return discovery
    .filter((q) => namedOn(q) && !t.has(norm(q.question)))
    .sort((a, b) => b.namedYou - a.namedYou || a.question.localeCompare(b.question))
    .filter((q) => { const k = norm(q.question); if (seen.has(k)) return false; seen.add(k); return true; })
    .map((q) => q.question.trim());
}

/* ── The header place ─────────────────────────────────────────────────────────────────────── */

const countryWords = (c: string): string => {
  const k = c.trim().toLowerCase();
  if (k === 'uk' || k === 'united kingdom' || k === 'gb') return 'the UK';
  if (k === 'us' || k === 'usa' || k === 'united states') return 'the US';
  return c.trim();
};

/** The report header's place, from what is KNOWN about the business. null = nothing known (the header shows no
 *  place rather than a guess). `fromSearches` (the searches' own widest region, e.g. "East London") is used only
 *  when it is a fuller form of the known town. */
export function reportPlaceLabel(o: { town?: string | null; address?: string | null; scope?: string | null; country?: string | null; fromSearches?: string | null }): string | null {
  const town = String(o.town ?? '').trim();
  const address = String(o.address ?? '').trim();
  const country = String(o.country ?? '').trim();
  const national = String(o.scope ?? '').trim().toLowerCase() === 'national';
  const wide = String(o.fromSearches ?? '').trim();
  let place = town && wide && wide.toLowerCase().includes(town.toLowerCase()) ? wide : town || address;
  if (!place) return national && country ? `All of ${countryWords(country).replace(/^the /, '')}` : null;
  if (national && country && place.toLowerCase() !== country.toLowerCase()) place = `${place} · covers all of ${countryWords(country)}`;
  return place;
}

/* ── The internal quarterly re-check ─────────────────────────────────────────────────────── */

/** Is a re-check of the already-named searches due? First one NAMED_RECHECK_DAYS after the Discovery, then every
 *  NAMED_RECHECK_DAYS after the last re-check started. */
export function namedRecheckDue(o: { discoveryAt: string; lastRecheckAt?: string | null; now?: number }): { due: boolean; dueAt: string } {
  const from = Date.parse(o.lastRecheckAt ?? '') || Date.parse(o.discoveryAt);
  const dueAt = new Date((Number.isFinite(from) ? from : Date.now()) + NAMED_RECHECK_DAYS * DAY_MS);
  return { due: (o.now ?? Date.now()) >= dueAt.getTime(), dueAt: dueAt.toISOString() };
}

export interface NamedRecheckFold {
  /** Still named in at least one answer. */
  kept: string[];
  /** Asked and answered, not named in any answer: flagged for Paul. */
  dropped: string[];
  /** Not answered (failed / not asked): neither kept nor dropped. */
  unknown: string[];
}

/** Fold a re-check: for each already-named search, named answers / answered answers in the re-check. */
export function foldNamedRecheck(searches: string[], results: Map<string, { named: number; answered: number }>): NamedRecheckFold {
  const byKey = new Map([...results.entries()].map(([q, v]) => [norm(q), v]));
  const out: NamedRecheckFold = { kept: [], dropped: [], unknown: [] };
  for (const s of searches) {
    const r = byKey.get(norm(s));
    if (!r || r.answered === 0) out.unknown.push(s);
    else if (r.named > 0) out.kept.push(s);
    else out.dropped.push(s);
  }
  return out;
}
