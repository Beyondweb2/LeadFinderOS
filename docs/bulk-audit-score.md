# Bulk AI audits carry the quick check's score (2026-10-14)

## The problem

`ai_visibility_report_offer` needs {{4}} = the lead's AI visibility score ("66%"). The resolver
(`_shared/audit-reply.ts` `resolveAuditReplyVars` → `visibilityPct`) reads it ONLY from a run whose
`results.hook` is a version-2 state, scored by `scoreHookRun` (`src/lib/hookScore.ts`) — the same figure the
report's "Overall AI visibility" shows. The quick AI check writes that marker. Outreach → **Run AI audits**
(`bulk-jobs` → `create-ai-audit`) did not, so every bulk-audited lead was refused "no visibility score".

## What a bulk audit already asks

Measured live: bulk audits are 3 questions (operator can pick 3–5), each row on ChatGPT + Gemini, one run —
the quick check's shape. So the score can come from the answers the audit already collects. **No extra AI call,
no cost change, no cap touched** ($3/audit, $15/day, the monthly Apify warning are unchanged).

## The fix — a marker, not a number

- `bulk-jobs` sends `bulk_score: true` to `create-ai-audit` (internal door only — a public caller cannot set it).
- `create-ai-audit` then stamps `results.hook = initialHookStateV2(questions AS QUEUED, AUDIT_ENGINES)`.
  It changes nothing asked: no hook plan, no top-up, no one-in-flight rule, no person guard, reuse unchanged.
  ⛔ It is NOT a hook (`isHookAudit` stays false) — the "never infer a hook" rule in create-ai-audit still holds.
- From there every reader already does the right thing: `scoreHookRun` (score), the report's Concept 4 quick
  view, the Inbox / lead AI-check card, and the resolver.
- Honest by construction: one failed or missing answer → `complete: false` → no percentage → the report offer
  refuses `no_score` with plain words. Fewer than 3 questions queued → no score.
- Named in every answer → refused as "named in the answers", now at ANY size
  (`sixResultHookForbidsAbsenceCopy` no longer requires exactly 6 results; a 5-question audit has 10).
- Competitor names: the v2 summary's gap — the one MISSED answer's own list. Never an answer that named the lead.
- Side effect, intended: a bulk audit with a website now follows the hook deep-crawl gate (a complete audit with a
  miss → deep; all-named or incomplete → the cheap crawl). It can only crawl less, never cost more.

## Backfill (2026-10-14, applied once)

Scope: leads whose CURRENT audit (the newest with a complete/capped run — the one the resolver reads) is a bulk
audit (`bulk_jobs.items[].audit_id`, job types `audit` / `audit_and_push`), ordinary purpose, no marker yet,
3–5 distinct questions, every row done on both engines with an answer. Marker only — no audit re-run, no score
stored. Incomplete runs are NOT marked (marking them would turn an old report into an "incomplete" notice).

- Read-only count: 38 leads whose current audit is a bulk audit; 28 complete; 10 not (no score, left alone).
- Rolled-back write: 28 rows marked inside `begin … rollback`, 0 afterwards.
- Read-only simulation through the real resolver (marker injected in memory, GET-only): 0 had a score before;
  26 gain a report-offer score and are sendable; 1 refused "named in all answers" (its report shows 100%),
  1 refused "competitor names not extracted yet". All 28 reports show their score.
- Applied: 28 runs marked (see the commit for the read-back).
