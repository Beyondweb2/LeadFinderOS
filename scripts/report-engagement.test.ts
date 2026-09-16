/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE INBOX ENGAGEMENT PILLS — same source as the campaign card, same rules.

   Run: npx tsx scripts/report-engagement.test.ts

   Two pills, two questions, and the two rules that make them honest:
     AUDIT — leadReportOpenedAt: they opened their report link. An open counts ONLY when it happened
             at/after we sent the report link (minus the slack), because an operator preview hits the
             same URL and bumps the same counter. No report-link send on record → no pill.
     SITE  — leadSiteVisitedAt: they landed on the sign-up page, counted only from SITE_TRACKING_START
             (before that there was no logging, so a "0" would be a lie, not a fact).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import {
  leadReportOpenedAt, leadSiteVisitedAt,
  REPORT_LINK_TEMPLATES, SITE_TRACKING_START, OPEN_ATTRIBUTION_SLACK_MS,
} from '../src/lib/templateAttribution.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };

const iso = (ms: number) => new Date(ms).toISOString();
const SENT = Date.parse('2026-09-10T10:00:00Z');

console.log('── AUDIT: an open counts only when it followed the send ──');
{
  const audit = (openCount: number | null, openedMs: number | null) =>
    [{ open_count: openCount, first_opened_at: openedMs == null ? null : iso(openedMs) }];

  ok(leadReportOpenedAt(audit(1, SENT + 60_000), SENT) === iso(SENT + 60_000),
    'opened a minute AFTER the send → that open');
  ok(leadReportOpenedAt(audit(1, SENT - 5 * 60_000), SENT) === null,
    'opened five minutes BEFORE the send → null (operator preview, not them)');
  ok(leadReportOpenedAt(audit(1, SENT - 30_000), SENT) === iso(SENT - 30_000),
    'opened 30s before the send is INSIDE the slack → counts (clock skew, not a preview)');
  ok(leadReportOpenedAt(audit(1, SENT + 60_000), null) === null,
    'no report-link send on record → null even though it was opened');
  ok(leadReportOpenedAt(audit(0, SENT + 60_000), SENT) === null,
    'open_count 0 → null (coalesced first_opened_at with no real open)');
  ok(leadReportOpenedAt(audit(null, SENT + 60_000), SENT) === null, 'open_count null → null');
  ok(leadReportOpenedAt(audit(3, null), SENT) === null, 'first_opened_at null → null');
  ok(leadReportOpenedAt([], SENT) === null, 'no audits → null');
}

console.log('\n── AUDIT: earliest qualifying open across several audits ──');
{
  const audits = [
    { open_count: 1, first_opened_at: iso(SENT + 5 * 60_000) },
    { open_count: 1, first_opened_at: iso(SENT + 60_000) },        // earliest qualifying
    { open_count: 1, first_opened_at: iso(SENT - 10 * 60_000) },   // preview, excluded
  ];
  ok(leadReportOpenedAt(audits, SENT) === iso(SENT + 60_000), 'returns the earliest open that is after the send');
}

console.log('\n── SITE: only hits since tracking began, earliest wins ──');
{
  ok(leadSiteVisitedAt([iso(SITE_TRACKING_START + 86_400_000)]) === iso(SITE_TRACKING_START + 86_400_000),
    'a hit after tracking began → that hit');
  ok(leadSiteVisitedAt([iso(SITE_TRACKING_START - 86_400_000)]) === null,
    'a hit BEFORE tracking began → null (there was no logging to trust)');
  ok(leadSiteVisitedAt([
      iso(SITE_TRACKING_START + 3 * 86_400_000),
      iso(SITE_TRACKING_START + 86_400_000),
    ]) === iso(SITE_TRACKING_START + 86_400_000),
    'earliest qualifying hit wins');
  ok(leadSiteVisitedAt([]) === null, 'no hits → null');
  ok(leadSiteVisitedAt(['not-a-date']) === null, 'a bad timestamp is ignored, not thrown');
}

console.log('\n── the shared constants are the ones the campaign card uses ──');
{
  for (const t of ['audit_reply', 'video_template', 'free_check_result', 'audit_reply_warm', 'competitor_hook', 'audit_followup']) {
    ok(REPORT_LINK_TEMPLATES.has(t), `REPORT_LINK_TEMPLATES contains ${t}`);
  }
  ok(!REPORT_LINK_TEMPLATES.has('audit_followup_call'), 'and NOT audit_followup_call — it carries no report link');
  ok(!REPORT_LINK_TEMPLATES.has('initial_contact'), 'and NOT the cold opener');
  ok(OPEN_ATTRIBUTION_SLACK_MS === 60_000, 'the open slack is one minute');
  ok(Number.isFinite(SITE_TRACKING_START), 'SITE_TRACKING_START is a real timestamp');
}

console.log(f === 0 ? '\nALL PASS' : `\n${f} FAILED`);
process.exit(f === 0 ? 0 : 1);
