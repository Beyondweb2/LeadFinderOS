/* ════════════════════════════════════════════════════════════════════════════════════════════════
   BASELINE SUMMARY — the completed paid baseline, folded into the handful of facts a business owner
   can actually read, and the handful an operator (or a rebuild prompt) can act on.

   ⛔ DERIVED, NEVER STORED. Everything here is computed from the report payload `buildReportData()`
   already returns, so a summary can never freeze an old row at a stale rule (CLAUDE.md §6).
   ⛔ NO NEW MEASUREMENT AND NO SECOND OPINION. This module reads; it never asks an engine anything.
   ⛔ SCORED ENGINES ONLY (ChatGPT, Gemini — SCORED_ENGINES in auditReport.ts). AI Overview and
   Google organic are displayed on the report but are not part of the named score, and a summary
   that quietly folded them in would disagree with the report it sits next to.

   ⚠️ "Absent", "fragile" and "one-engine" are OPERATOR words. The Welcome Pack converts them into
   plain sentences (welcomePackHtml.ts); only the rebuild prompt and the hub use the labels.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import { SCORED_ENGINES, ENGINE_LABELS } from './auditReport.ts';
import type { AiAuditReportData } from './aiAuditReportHtml.ts';

/** One scored engine's share of the baseline. */
export interface EngineSummary {
  key: string;
  label: string;
  named: number;
  total: number;
  pct: number;
}

/** A question, graded by how the business fared on it across every run and scored engine. */
export interface QuestionSummary {
  question: string;
  /** Named on at least one scored engine in at least one run. */
  named: boolean;
  /** How many answers named them, and out of how many — the fragility denominator. */
  namedCount: number;
  answers: number;
  /** Scored engines that named them at least once. */
  engines: string[];
  /** Rival firms named in the answers to this question. */
  rivals: string[];
}

export interface BaselineSummary {
  businessName: string;
  /** e.g. "22 Sep 2026" — the date the measurement finished, not the date this was rendered. */
  completedLabel: string;
  completedAt: string | null;
  questionCount: number;
  runs: number;
  engineLabels: string[];
  named: number;
  total: number;
  pct: number;
  perEngine: EngineSummary[];
  /** Named every time they were asked, on at least one scored engine. */
  strong: QuestionSummary[];
  /** Named sometimes but not every time — the answer moved between runs. */
  fragile: QuestionSummary[];
  /** Named by exactly one of the two scored engines. */
  oneEngine: QuestionSummary[];
  /** Never named, on any engine, in any run. */
  absent: QuestionSummary[];
  /** Most-named rival firms across the whole baseline. */
  competitors: { name: string; count: number }[];
  /** True when the business name is only its trade and its town, so "named" cannot be judged. */
  nameNotJudgeable: boolean;
  /** True when rival names were withheld because the run's list could not be trusted. */
  namesWithheld: boolean;
}

/** dd MMM yyyy, in UTC — a stored day must not drift to the next one in BST (CLAUDE.md §4). */
export function dayLabel(iso: string | null | undefined): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
}

/** How many of a per-engine entry's answers named the business. Older payloads carried a boolean. */
function namedCountOf(named: number | boolean | undefined): number {
  if (typeof named === 'number') return named;
  return named === true ? 1 : 0;
}

/**
 * Fold a completed baseline's report payload into the summary.
 *
 * `report` is exactly what `buildReportData()` returns for the baseline audit. `completedAt` is
 * `ai_audits.baseline_completed_at` — passed in rather than inferred, because the report payload
 * carries a RENDER date and the client is being told when they were MEASURED.
 */
export function buildBaselineSummary(
  report: AiAuditReportData,
  completedAt: string | null,
): BaselineSummary {
  const breakdown = report.questionBreakdown ?? [];
  const scoredLabels = new Set<string>((SCORED_ENGINES as readonly string[]).map((k) => ENGINE_LABELS[k] ?? k));

  const questions: QuestionSummary[] = breakdown.map((q) => {
    const engines = (q.perEngine ?? [])
      .filter((e) => scoredLabels.has(e.label) && namedCountOf(e.named) > 0)
      .map((e) => e.label);
    return {
      question: q.question,
      named: !!q.namedYou,
      namedCount: typeof q.namedCount === 'number' ? q.namedCount : (q.namedYou ? 1 : 0),
      answers: typeof q.answers === 'number' ? q.answers : 0,
      engines,
      rivals: q.rivals ?? [],
    };
  });

  /* ⛔ ENUMERATED, NOT else-carried. A question is graded on the state it IS in: absent when nothing
     named it, fragile when it was named on some asks and not others, strong when every ask named it.
     A question with no recorded answer count cannot be called fragile — it lands in `strong` only if
     it was named, and otherwise in `absent`, which is the direction that never overstates. */
  const absent = questions.filter((q) => !q.named);
  const namedQs = questions.filter((q) => q.named);
  const fragile = namedQs.filter((q) => q.answers > 0 && q.namedCount < q.answers);
  const strong = namedQs.filter((q) => !(q.answers > 0 && q.namedCount < q.answers));
  const oneEngine = namedQs.filter((q) => q.engines.length === 1);

  /* ⛔ ReportEngineRow carries a LABEL, not a key (aiAuditReportHtml.ts) — so the scored set is
     matched on the labels SCORED_ENGINES maps to, never on a key that does not exist. `pct` is
     computed here because the row does not carry one. */
  const labelToKey = new Map<string, string>(
    (SCORED_ENGINES as readonly string[]).map((k) => [ENGINE_LABELS[k] ?? k, k]),
  );
  const perEngine: EngineSummary[] = (report.perEngine ?? [])
    .filter((row) => scoredLabels.has(row.label))
    .map((row) => {
      const total = Number(row.total ?? 0);
      const named = Number(row.named ?? 0);
      return {
        key: labelToKey.get(row.label) ?? '',
        label: row.label,
        named,
        total,
        pct: total > 0 ? Math.round((named / total) * 100) : 0,
      };
    });

  return {
    businessName: report.businessName,
    completedAt: completedAt ?? null,
    completedLabel: dayLabel(completedAt),
    questionCount: typeof report.questionsAsked === 'number' ? report.questionsAsked : breakdown.length,
    runs: typeof report.measurementRuns === 'number' ? report.measurementRuns : 0,
    engineLabels: perEngine.map((e) => e.label),
    named: report.named,
    total: report.total,
    pct: report.pct,
    perEngine,
    strong,
    fragile,
    oneEngine,
    absent,
    competitors: report.topCompetitors ?? [],
    nameNotJudgeable: report.nameNotJudgeable === true,
    namesWithheld: report.namesWithheld === true,
  };
}

/* ── DO-NOT-BREAK / EXISTING VISIBILITY SIGNALS ───────────────────────────────────────────────────
   URLs on the client's OWN site that an engine cited while answering a baseline question.

   ⛔ CITATION IS NOT CAUSATION, AND THE WORDING MUST NOT SAY IT IS. An engine citing a page while
   naming the business is correlation. This module labels these "cited while answering", records
   whether the business was named on that question, and stops there — the rebuild prompt tells Claude
   to INVESTIGATE before redirecting or removing one, which is a different instruction from "this
   page caused your visibility" and is the only one the evidence supports. */

export interface VisibilitySignal {
  url: string;
  domain: string;
  /** The baseline questions this URL was cited on. */
  questions: string[];
  /** True when the business was named on at least one of those questions. */
  namedOnAny: boolean;
}

/** Host of a URL, lowercased, `www.` stripped. Empty string when it cannot be parsed. */
export function hostOf(raw: string): string {
  try {
    return new URL(String(raw || '').trim()).hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * The client's own pages that engines cited in the baseline, most-cited first.
 *
 * `ownWebsite` is their site as the CLIENT RECORD holds it. When it is blank there is no host to
 * match on and the answer is an empty list — never "every citation", which would hand the rebuild
 * a do-not-break list made of directories and rivals.
 */
export function visibilitySignals(report: AiAuditReportData, ownWebsite: string | null | undefined): VisibilitySignal[] {
  const own = hostOf(String(ownWebsite || ''));
  if (!own) return [];
  const byUrl = new Map<string, VisibilitySignal>();
  for (const q of report.questionBreakdown ?? []) {
    const cites = [
      ...(q.citations ?? []),
      ...((q.perEngine ?? []).flatMap((e) => e.citations ?? [])),
    ];
    for (const c of cites) {
      const url = String(c?.url || '').trim();
      if (!url) continue;
      const host = hostOf(url) || String(c?.domain || '').toLowerCase().replace(/^www\./, '');
      if (host !== own) continue;
      const entry = byUrl.get(url) ?? { url, domain: host, questions: [], namedOnAny: false };
      if (!entry.questions.includes(q.question)) entry.questions.push(q.question);
      if (q.namedYou) entry.namedOnAny = true;
      byUrl.set(url, entry);
    }
  }
  return [...byUrl.values()].sort((a, b) => b.questions.length - a.questions.length || a.url.localeCompare(b.url));
}
