/* ════════════════════════════════════════════════════════════════════════════════════════════════
   FILL A QUESTION SET TO ITS TARGET — dedupe BEFORE the slice, top up AFTER (2026-09-13).

   🔴 WHY 11 AND 18, NOT 12 AND 20. create-ai-audit builds a paid baseline / full measure from TWO
   model calls (the money questions in their own call so the flag is a fact, the rest in another),
   concatenates them, slices to the target, and only THEN ran the duplicate check — so when the two
   calls produced the same question the duplicate was dropped after the slice and nothing topped
   the set back up. AD Locksmithing's baseline lost one that way (contract said 12, queued 11) and
   its full measure lost two (asked 31, cut to 20, queued 18). The only step that could shrink the
   count was the last one, and it ran after every chance to recover had passed.

   ⛔ THE ORDER HERE IS THE FIX: exclude → dedupe → slice → top up. The top-up source is the
   deterministic template set (it always embeds the town and cannot fail), filtered by the same
   exclusion and the same dedupe, so a topped-up question is never a repeat of one already kept and
   never one of the baseline's judged questions.

   ⛔ IDENTITY IS BY INTENT, NOT BY SPELLING. The queue's own identity (questionKey) is case and
   punctuation only, which is exactly right for the day-28 replay (a stored question and its replay
   are byte-identical) and exactly wrong for generation: "safe installation in X" and "safes
   installation in X" both queued, and both were paid for three times. questionIntentKey folds the
   trailing plural on every word (safes → safe, services → service, locks → lock) — deliberately
   nothing cleverer: a stemmer would start merging "lock repair" with "locking repairs", and the
   one-'s' rule already catches every collision seen on real rows. It is used ONLY here, at
   generation. The replay's identity rule (questionKey / excludeAsked) is untouched.

   Pure and Deno-free — create-ai-audit imports it with an explicit .ts path, the test drives it.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { questionKey } from './seedGuard.ts';

/** One word's intent form: the same word whether written singular or plural. Words of three
 *  letters or fewer and words ending in a double s are left alone ("gas", "glass", "his"). */
function foldPlural(word: string): string {
  if (word.length <= 3) return word;
  if (word.endsWith('ies')) return word.slice(0, -3) + 'y';   // "properties" → "property"
  if (word.endsWith('ss')) return word;
  if (word.endsWith('s')) return word.slice(0, -1);
  return word;
}

/** Case- and punctuation-insensitive (questionKey), then plural-folded per word. */
export function questionIntentKey(q: string): string {
  return questionKey(q ?? '').split(' ').filter(Boolean).map(foldPlural).join(' ');
}

/** Keep the FIRST spelling of each intent; report what was dropped. */
export function dedupeByIntent(questions: readonly string[]): { questions: string[]; duplicates: string[] } {
  const seen = new Set<string>();
  const out: string[] = [];
  const duplicates: string[] = [];
  for (const raw of questions ?? []) {
    const q = (raw ?? '').trim();
    if (!q) continue;
    const k = questionIntentKey(q);
    if (!k) continue;
    if (seen.has(k)) { duplicates.push(q); continue; }
    seen.add(k);
    out.push(q);
  }
  return { questions: out, duplicates };
}

export interface FillResult {
  /** Exactly `target` questions when the sources allow it; fewer only when both ran dry. */
  questions: string[];
  /** Candidates removed because they collide with an EXCLUDED question (the baseline's asked set). */
  excluded: string[];
  /** Candidates removed as intent-duplicates of an earlier candidate. */
  duplicates: string[];
  /** How many came from the top-up source rather than the candidates. */
  toppedUp: number;
  /** target − questions.length: > 0 only when the top-up source was exhausted too. */
  short: number;
}

/**
 * exclude → dedupe → slice → top up. `excluded` is compared by INTENT as well (a paraphrase of a
 * judged question must not reach a full measure); `topUp` is walked in order and goes through the
 * same exclusion and dedupe as the candidates.
 */
export function fillToTarget(opts: {
  candidates: readonly string[];
  target: number;
  excluded?: readonly string[];
  topUp?: readonly string[];
}): FillResult {
  const target = Math.max(0, Math.floor(Number(opts.target) || 0));
  const banned = new Set((opts.excluded ?? []).map((q) => questionIntentKey(q ?? '')).filter(Boolean));
  const seen = new Set<string>();
  const out: string[] = [];
  const excluded: string[] = [];
  const duplicates: string[] = [];
  let toppedUp = 0;

  const consider = (raw: string, fromTopUp: boolean): void => {
    if (out.length >= target) return;
    const q = (raw ?? '').trim();
    if (!q) return;
    const k = questionIntentKey(q);
    if (!k) return;
    if (banned.has(k)) { if (!fromTopUp) excluded.push(q); return; }
    if (seen.has(k)) { if (!fromTopUp) duplicates.push(q); return; }
    seen.add(k);
    out.push(q);
    if (fromTopUp) toppedUp++;
  };

  for (const q of opts.candidates ?? []) consider(q, false);
  for (const q of opts.topUp ?? []) consider(q, true);

  return { questions: out, excluded, duplicates, toppedUp, short: Math.max(0, target - out.length) };
}
