import { newestUsableAudit, resolveLeadReport, resolveLeadReportAudit, resolveReportsByLead, type ResolvableAudit } from '../src/lib/auditReportResolver.ts';

let failures = 0;
const ok = (condition: boolean, label: string) => { if (!condition) failures++; console.log(`${condition ? 'PASS' : 'FAIL'} ${label}`); };

const audit = (over: Partial<ResolvableAudit> & { id: string }): ResolvableAudit => ({
  lead_id: 'lead-1',
  short_code: `code-${over.id}`,
  created_at: '2026-09-01T00:00:00.000Z',
  ai_audit_runs: [{ status: 'complete' }],
  ...over,
});

/* 1. Newest audit incomplete, older audit completed → the older, usable one still resolves. A
   newer audit being CREATED (or still running) must never make an existing usable report vanish —
   this is the exact bug the four hand-rolled traversals in useInbox.ts used to have the ingredients
   for, and the concrete "reports disappear after an audit-logic change" symptom traces to it. */
{
  const audits = [
    audit({ id: 'newer-running', created_at: '2026-09-10T00:00:00.000Z', ai_audit_runs: [{ status: 'running' }] }),
    audit({ id: 'older-complete', created_at: '2026-09-01T00:00:00.000Z', ai_audit_runs: [{ status: 'complete' }] }),
  ];
  const report = resolveLeadReport(audits, 'lead-1');
  ok(report?.auditId === 'older-complete', 'newest incomplete audit falls through to an older completed one');
}

/* 2. Newest audit completed → it wins over an older completed one (the ordinary, ordinary case). */
{
  const audits = [
    audit({ id: 'newest-complete', created_at: '2026-09-10T00:00:00.000Z' }),
    audit({ id: 'older-complete', created_at: '2026-09-01T00:00:00.000Z' }),
  ];
  const report = resolveLeadReport(audits, 'lead-1');
  ok(report?.auditId === 'newest-complete', 'newest completed audit is the one resolved');
}

/* 3. Mixed purposes: a measurement/remeasure is an OPERATOR document (isInternalMeasurement 403s
   its public URL) and must never be resolved as "the report" even when it is the newest completed
   audit — but every OTHER purpose (ordinary/free_check/paid baseline with a contract/discovery/
   hook/unrecorded) participates normally. */
{
  const audits = [
    audit({ id: 'newest-measurement', created_at: '2026-09-10T00:00:00.000Z', audit_purpose: 'measurement' }),
    audit({ id: 'older-ordinary', created_at: '2026-09-05T00:00:00.000Z', audit_purpose: 'audit' }),
  ];
  const report = resolveLeadReport(audits, 'lead-1');
  ok(report?.auditId === 'older-ordinary', 'a measurement purpose is never resolved as the report, even when newest');

  const remeasure = resolveLeadReport(
    [audit({ id: 'a-remeasure', audit_purpose: 'remeasure' })], 'lead-1',
  );
  ok(remeasure === null, 'a lead whose only audit is a remeasure resolves to no report');

  for (const purpose of ['audit', 'free_check', 'discovery', undefined, null]) {
    const eligible = resolveLeadReport([audit({ id: 'p', audit_purpose: purpose as string | null | undefined })], 'lead-1');
    ok(eligible?.auditId === 'p', `purpose ${JSON.stringify(purpose)} is Inbox-eligible`);
  }
  const baseline = resolveLeadReport([audit({ id: 'b', audit_purpose: 'baseline', baseline_contract: { frozen: true } })], 'lead-1');
  ok(baseline?.auditId === 'b', 'a paid baseline with a contract is Inbox-eligible');
}

/* 4. Run/array order must never matter — the resolver sorts itself rather than trusting the
   caller's query order. Same audits, shuffled, same answer both ways. */
{
  const a = audit({ id: 'newest', created_at: '2026-09-10T00:00:00.000Z' });
  const b = audit({ id: 'older', created_at: '2026-09-01T00:00:00.000Z' });
  ok(resolveLeadReport([a, b], 'lead-1')?.auditId === resolveLeadReport([b, a], 'lead-1')?.auditId,
    'shuffled audit array order resolves to the same report');
}

/* 5. Hook stop_reason (or any other results-shaped field) is never inspected — only run status. A
   completed run stays resolvable whatever its hook metadata says. */
{
  const audits = [audit({
    id: 'hook-run', created_at: '2026-09-10T00:00:00.000Z', audit_purpose: 'audit',
    ai_audit_runs: [{ status: 'complete' }],
  })];
  // @ts-expect-error -- extra, resolver-irrelevant fields a real row would also carry
  audits[0].results = { hook: { stop_reason: 'gap', executed: 1 } };
  const report = resolveLeadReport(audits, 'lead-1');
  ok(report?.auditId === 'hook-run', 'a completed run resolves regardless of hook stop_reason/executed count');
}

/* 6. Run count / baseline_target_runs differences never block resolution — only whether SOME run
   settled usable. A 1-run hook, a 3-run baseline and a 40-run Discovery scan are equally resolvable. */
{
  for (const [label, runs, baselineTargetRuns] of [
    ['1-run hook', [{ status: 'complete' }], null],
    ['3-run baseline', [{ status: 'complete' }, { status: 'complete' }, { status: 'complete' }], 3],
    ['many-run discovery', Array.from({ length: 40 }, () => ({ status: 'complete' })), 40],
  ] as const) {
    const report = resolveLeadReport([audit({ id: label, ai_audit_runs: runs as { status: string }[], baseline_target_runs: baselineTargetRuns })], 'lead-1');
    ok(report?.auditId === label, `${label}: run count difference does not block resolution`);
  }
}

/* `capped` counts as usable too (resolveAuditReplyVars already accepts it — RUN_USABLE, not a new
   literal). */
{
  const report = resolveLeadReport([audit({ id: 'capped', ai_audit_runs: [{ status: 'capped' }] })], 'lead-1');
  ok(report?.auditId === 'capped', 'a capped run is usable');
}

/* A lead with only pending/running/failed runs has no report — never invented from partial state. */
{
  const report = resolveLeadReport([audit({ id: 'x', ai_audit_runs: [{ status: 'pending' }] })], 'lead-1');
  ok(report === null, 'no settled run → no report');
}

/* resolveReportsByLead (the bulk map useInbox actually renders from) agrees with resolveLeadReport
   called per-lead, across multiple leads at once. */
{
  const audits = [
    audit({ id: 'a1', lead_id: 'lead-a', created_at: '2026-09-10T00:00:00.000Z' }),
    audit({ id: 'a2', lead_id: 'lead-b', created_at: '2026-09-05T00:00:00.000Z', ai_audit_runs: [{ status: 'running' }] }),
    audit({ id: 'a3', lead_id: 'lead-b', created_at: '2026-09-01T00:00:00.000Z', ai_audit_runs: [{ status: 'complete' }] }),
  ];
  const byLead = resolveReportsByLead(audits);
  ok(byLead['lead-a']?.auditId === 'a1', 'bulk resolver: lead-a resolves to its only audit');
  ok(byLead['lead-b']?.auditId === 'a3', 'bulk resolver: lead-b falls through to its older completed audit');
  ok(!('lead-c' in byLead), 'bulk resolver: a lead with no audits is simply absent, not a false negative elsewhere');
}

/* newestUsableAudit (the crawl/fault-lookup helper) applies NO purpose filter — a measurement's
   crawl result is still real site data even though its report link must never be shown. */
{
  const audits = [audit({ id: 'm', audit_purpose: 'measurement', created_at: '2026-09-10T00:00:00.000Z' })];
  ok(newestUsableAudit(audits, 'lead-1')?.id === 'm', 'newestUsableAudit does not exclude measurement purpose');
  ok(resolveLeadReportAudit(audits, 'lead-1') === null, 'resolveLeadReportAudit (the report gate) still excludes it');
}

if (failures) process.exit(1);
