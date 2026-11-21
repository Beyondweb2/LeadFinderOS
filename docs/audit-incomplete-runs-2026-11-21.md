# Incomplete audit runs — London Domestic Maintenance Ltd (21 Nov 2026)

**What happened.** Discovery audit, 39 questions x 3 runs (117 queue rows, 234 scored answers). Only 47 rows (94 answers) were read.
Nothing was missed at queue time: all 117 rows existed. 70 were failed with `cost_cap`; runs 2 and 3 ended `capped`.

**Root cause.** The flat per-run Apify ceiling (`AUDIT_RUN_CAP_USD`, $1) was sized for runs of up to 20 questions with one actor start each.
Each question now starts two actors (ChatGPT+Gemini, Google AI) plus lane retries, so a 39-question run spent $1 on about 16 questions.
Not the scheduler, not self-heal (it only covers one-run audits of 12 asks or fewer and never heals a budget refusal), not a question limit.

**Fix.** `auditRunCapUsd(questionCount)` (src/lib/auditLimits.ts): never below $1, grows by `AUDIT_PER_QUESTION_CAP_USD` per question.
The daily pool cap and the Apify reserve are unchanged. The app audit page (`src/lib/auditCoverage.ts`) shows "In progress, X of Y answers" with no
score and blocks Create report / Prospect preview until complete or a teammate ticks "Use the answers in hand anyway". The report header
(`ReportModel.planned`) says the real searches x asks.

**Repair.** The 70 `cost_cap` rows of this audit were set back to pending (attempts 0) and its three runs to running with a `self_heal` round-1 stamp,
so finishing sends nothing (no auto-reply, free-check or completion send) and nobody is charged again. Only missing answers were re-asked.
No other audit in the last 45 days had `cost_cap` rows; none in the last 30 days had fewer answered rows than questions x runs.
Test: `scripts/audit-coverage.test.ts`.
