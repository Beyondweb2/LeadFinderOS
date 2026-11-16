/* ════════════════════════════════════════════════════════════════════════════════════════════════
   PROSPECT RE-CHECK (Paul, 2026-11-16, branch v1-prospect-recheck) — the ONE rule file.

   On a call the rep finds the lead's details were wrong ("Engineer" was really "Mechanic"). They fix the
   trade / areas / services on the lead and press "Re-check now": three searches, pre-filled from the
   CURRENT details and editable, each asked RECHECK_RUNS times on both AIs (3 × 3 × 2 = 18 answers),
   judged by the live audit rules (v4: locked spots, one firm per spelling, Couldn't measure, Audit
   incomplete). It is an audit of its own, `audit_purpose = 'recheck'`, never a run bolted onto the old
   one. The old audit and its link are kept exactly as they were; on the team's screens it reads
   "Replaced: details were wrong". Nothing is deleted.

   ⚠️ A LEAF: imported by create-ai-audit (Deno) through a relative path, so relative imports with
   explicit .ts only. Pure; nothing here reads, writes, spends or sends.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { nameIsTextJudgeable, nameMatches, normalizeForMatch } from './nameMatch.ts';
import { HOOK_QUESTION_MAX_CHARS } from './hookQuestionEdit.ts';

/** The stored purpose. `ai_audits.audit_purpose` is plain text with no check constraint: no migration. */
export const RECHECK_AUDIT_PURPOSE = 'recheck';
/** Searches in a re-check. */
export const RECHECK_QUESTIONS = 3;
/** How many times each search is asked of each AI (the v4 rules judge each AI on its own 3 asks). */
export const RECHECK_RUNS = 3;
/** ChatGPT + Gemini. */
export const RECHECK_ENGINES = 2;
/** A rep may start at most this many re-checks on one lead in 24 hours (each one is 9 AI searches). */
export const RECHECK_PER_LEAD_PER_DAY = 2;
/** What the old audit is called once a re-check replaced it (team screens only; its public link is unchanged). */
export const RECHECK_REPLACED_LABEL = 'Replaced: details were wrong';

/** "Re-check: 3 searches, asked 3 times each" — the label on the prospect page and the report. */
export function recheckLabel(searches: number = RECHECK_QUESTIONS, runs: number = RECHECK_RUNS): string {
  const s = Math.max(1, Math.round(searches));
  const r = Math.max(1, Math.round(runs));
  return `Re-check: ${s} search${s === 1 ? '' : 'es'}, asked ${r} time${r === 1 ? '' : 's'} each`;
}

/** Answers a re-check expects: searches × runs × AIs (18). */
export const recheckExpectedAnswers = (searches: number = RECHECK_QUESTIONS, runs: number = RECHECK_RUNS): number =>
  searches * runs * RECHECK_ENGINES;

/** The prospecting-pool estimate for a re-check: every search, every run, priced per AI search question. */
export const recheckEstimateUsd = (perQuestionUsd: number, searches: number = RECHECK_QUESTIONS, runs: number = RECHECK_RUNS): number =>
  Math.max(0, perQuestionUsd) * searches * runs;

export interface RecheckDetails {
  trade: string;
  /** The town the business is in. */
  town: string;
  areas: readonly string[];
  services: readonly string[];
}

const clean = (s: unknown): string => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim() : '');
const article = (w: string): string => (/^[aeiou]/i.test(w) ? 'an' : 'a');
const lower = (s: string): string => s.toLowerCase();
/** A service as the rep typed it, with a capitalised first word lowered ("Clutch repair" -> "clutch repair") and an
 *  acronym kept ("MOT", "EV charger"). */
const serviceWords = (s: string): string => (/^[A-Z0-9]{2,}(\b|$)/.test(s) ? s : s.charAt(0).toLowerCase() + s.slice(1));

/** The three proposed searches, from the details AS THEY ARE NOW. The rep edits them before running. Empty when the
 *  trade or the town is missing (the panel asks for them first). */
export function recheckDraftQuestions(d: RecheckDetails): string[] {
  const trade = lower(clean(d.trade));
  const town = clean(d.town);
  if (!trade || !town) return [];
  const areas = (d.areas ?? []).map(clean).filter((a) => a && a.toLowerCase() !== town.toLowerCase());
  const services = (d.services ?? []).map((s) => serviceWords(clean(s))).filter((s) => s && s.toLowerCase() !== trade);
  const place2 = areas[0] ?? town;
  const place3 = areas[1] ?? areas[0] ?? town;
  const out = [`Who is the best ${trade} in ${town}?`];
  out.push(services[0]
    ? `Can you recommend ${article(trade)} ${trade} for ${services[0]} in ${place2}?`
    : `Can you recommend a reliable ${trade} in ${place2}?`);
  out.push(services[1]
    ? `Who is the best ${trade} for ${services[1]} in ${place3}?`
    : services[0] && place3 !== place2
      ? `Who is the best ${trade} for ${services[0]} in ${place3}?`
      : `Which ${trade} near ${place3} has the best reviews?`);
  /* Never two the same (a short profile can make 2 and 3 meet). */
  const seen = new Set<string>();
  return out.map((q, i) => {
    let v = q;
    if (seen.has(v.toLowerCase())) v = i === 2 ? `Which ${trade} near ${town} do people recommend?` : `Can you recommend a good ${trade} near ${town}?`;
    seen.add(v.toLowerCase());
    return v;
  });
}

/** Does this question contain the business's own name? The baseline's "branded" ruler (nameMatches, only when the name
 *  can be told apart from the trade and town), plus the full name word for word — a search that names the business
 *  makes AI "name" it and says nothing about whether customers find it. */
export function questionNamesBusiness(question: string, businessName: string, ctx: { trade?: string | null; town?: string | null }): boolean {
  const name = clean(businessName);
  const q = clean(question);
  if (!name || !q) return false;
  const nctx = { trade: ctx.trade || null, town: ctx.town || null };
  if (nameIsTextJudgeable(name, nctx) && nameMatches(q, name, nctx)) return true;
  const full = normalizeForMatch(name).split(/\s+/).filter((t) => t && !['ltd', 'limited', 'llp', 'plc', 'the'].includes(t));
  if (!full.length || full.join('').length < 4) return false;
  const hay = normalizeForMatch(q).split(/\s+/).filter(Boolean);
  for (let i = 0; i + full.length <= hay.length; i++) {
    if (full.every((t, j) => hay[i + j] === t)) return true;
  }
  return false;
}

export type RecheckQuestionsCheck =
  | { ok: true; questions: string[] }
  | { ok: false; reason: string; index: number | null; code: 'count' | 'blank' | 'too_long' | 'repeat' | 'own_name' };

/** The one check on the three searches, run by the panel AND by create-ai-audit (the server is the rule). */
export function checkRecheckQuestions(
  input: ReadonlyArray<string | null | undefined>,
  biz: { businessName: string; trade?: string | null; town?: string | null },
): RecheckQuestionsCheck {
  const qs = (input ?? []).map((q) => clean(q));
  if (qs.length !== RECHECK_QUESTIONS) return { ok: false, code: 'count', index: null, reason: `A re-check asks exactly ${RECHECK_QUESTIONS} searches.` };
  const seen = new Set<string>();
  for (let i = 0; i < qs.length; i++) {
    const q = qs[i];
    if (!q) return { ok: false, code: 'blank', index: i, reason: `Search ${i + 1} is empty.` };
    if (q.length > HOOK_QUESTION_MAX_CHARS) return { ok: false, code: 'too_long', index: i, reason: `Search ${i + 1} is too long. Keep it to one customer-style question.` };
    if (questionNamesBusiness(q, biz.businessName, { trade: biz.trade, town: biz.town })) {
      return { ok: false, code: 'own_name', index: i, reason: `Search ${i + 1} contains the business's own name. Ask it the way a customer who doesn't know them would.` };
    }
    const k = q.toLowerCase();
    if (seen.has(k)) return { ok: false, code: 'repeat', index: i, reason: `Search ${i + 1} repeats another one.` };
    seen.add(k);
  }
  return { ok: true, questions: qs };
}

export const isRecheckPurpose = (p: unknown): boolean =>
  typeof p === 'string' && p.trim().toLowerCase() === RECHECK_AUDIT_PURPOSE;

/** DERIVED, never stored: which of the lead's other checks a re-check replaced. Every outreach check (quick check / hook,
 *  or an earlier re-check) made BEFORE the newest re-check. A check started after it is not replaced. Paid baselines,
 *  measurements and Discoveries are different instruments and never "replaced". */
export function replacedAuditIds(audits: ReadonlyArray<{ id: string; created_at: string | null; audit_purpose?: string | null; outreach?: boolean }>): Set<string> {
  const newest = audits
    .filter((a) => isRecheckPurpose(a.audit_purpose) && a.created_at)
    .map((a) => Date.parse(a.created_at as string))
    .filter((t) => Number.isFinite(t))
    .reduce((m, t) => Math.max(m, t), Number.NEGATIVE_INFINITY);
  const out = new Set<string>();
  if (!Number.isFinite(newest)) return out;
  for (const a of audits) {
    if (!a.created_at) continue;
    const t = Date.parse(a.created_at);
    if (!Number.isFinite(t) || t >= newest) continue;
    if (isRecheckPurpose(a.audit_purpose) || a.outreach === true) out.add(a.id);
  }
  return out;
}

/** Why a re-check did not run, in words — the create-ai-audit refusal or the queue's stored row error. Null = not a skip. */
export function recheckSkipReason(code: string | null | undefined, detail?: string | null): string | null {
  const c = clean(code);
  if (!c) return null;
  if (c === 'prospecting_budget_used' || c === 'pool_cap' || c === 'daily_cap' || c === 'budget_used') {
    return clean(detail) || "Skipped: today's checking budget is used. Your leads are still here, try tomorrow or ask Paul.";
  }
  if (c === 'apify_reserve' || c === 'monthly_limit') return 'Skipped: the monthly search limit is reached. Ask Paul to raise it.';
  if (c === 'recheck_limit_for_lead') return 'Skipped: this lead already had its re-checks today. Open the latest one below.';
  if (c === 'all_stop') return 'Skipped: the emergency stop is on. No new checks start until Paul releases it.';
  return null;
}
