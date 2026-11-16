/* Audit alerts as hourly summaries (v1-incomplete-fix, Paul, 2026-11-16).
   The case: at 11:30 a batch of 15 sales Quick checks started; Apify's AI search never finished for 12 of them (3 tries,
   12 minutes each, error "run_age_exceeded"), and at 12:08 Paul got twelve "Audit incomplete" emails in a minute.
   Rules: Quick checks are judged by the same incomplete rule (they ARE firm-read); the alert is ONE summary per cause at
   most once an hour; the provider refusal alert is at most once an hour per provider. */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import {
  ALERT_WINDOW_MS, CAUSE_WORDS, SUMMARY_EMAIL_AFTER_MS, SUMMARY_MAX_NAMED, causeOfKey, countedKey, emailedKey, incompleteCause,
  incompleteSummary, incompleteSummaryEmail, isIncomplete, namesInSummary, providerAlert, providerKeyPrefix, refusalsIn, summaryDue,
  summaryEntry, summaryKey, summaryKeyPrefix, ukTime, unmeasuredAnswers, type AlertRow,
} from '../src/lib/auditAlerts.ts';

let failures = 0;
const ok = (condition: boolean, label: string) => { if (!condition) failures++; console.log(`${condition ? 'PASS' : 'FAIL'} ${label}`); };
const ROOT = new URL('..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

/* ── 1. Quick checks: the rule judges what they measure ───────────────────────────────────────────── */
const quickRead: AlertRow[] = [{ status: 'done', result: { chatgpt: { answer_text: 'a', firms_read: true }, gemini: { answer_text: 'b', firms_read: true } } }];
ok(!isIncomplete(unmeasuredAnswers(quickRead)), 'a finished Quick check (one ask, both answers firm-read) is complete');
const quickNamedNobody: AlertRow[] = [{ status: 'done', result: { chatgpt: { answer_text: 'a', firms_read: true, competitors: [] }, gemini: { answer_text: 'b', firms_read: true, competitors: [] } } }];
ok(!isIncomplete(unmeasuredAnswers(quickNamedNobody)), 'a Quick check whose AIs named nobody is a result, not "incomplete"');
const quickTimedOut: AlertRow[] = [{ status: 'failed', result: { error: 'run_age_exceeded' } }];
const ct = unmeasuredAnswers(quickTimedOut);
ok(ct.answers === 2 && ct.failed === 2 && isIncomplete(ct), 'the 16 Nov case: the search never finished = 2 of 2 unmeasured = really incomplete (not loosened)');

/* ── 2. The cause ─────────────────────────────────────────────────────────────────────────────────── */
ok(incompleteCause(quickTimedOut, []) === 'search_timeout', 'run_age_exceeded = "the AI search did not finish in time"');
ok(incompleteCause([{ status: 'failed', result: { error: 'apify_TIMED-OUT' } }], []) === 'search_timeout', "Apify's own time-out is the same cause");
ok(incompleteCause([{ status: 'failed', result: { error: 'apify_FAILED' } }], []) === 'search_failed', 'an Apify run that failed');
ok(incompleteCause([{ status: 'done', result: { chatgpt: { answer_text: 'a' }, gemini: { answer_text: 'b' } } }], []) === 'firms_unread', 'answers in but never firm-read');
ok(incompleteCause(quickTimedOut, refusalsIn(['Apify start x HTTP 402'])) === 'apify_refused', 'a provider refusal wins (it is the thing to fix)');
ok(incompleteCause([{ status: 'done', result: { chatgpt: { answer_text: 'a' }, gemini: { answer_text: 'b' } } }], refusalsIn(['no credits remaining'])) === 'openai_refused', 'OpenAI no credit');
ok(/did not finish in time/.test(CAUSE_WORDS.search_timeout), 'the words name what happened');

/* ── 3. The summary row ───────────────────────────────────────────────────────────────────────────── */
ok(ukTime('2026-11-16T12:08:29Z') === '12:08' && ukTime('2026-07-01T11:08:00Z') === '12:08', 'times are UK time (GMT and BST)');
const key = summaryKey('search_timeout', '2026-11-16T12:08:29.051Z');
ok(key === 'audit_incomplete:search_timeout:2026-11-16T12:08' && key.startsWith(summaryKeyPrefix('search_timeout')), 'one key per cause, stamped with the minute it opened');
ok(causeOfKey(key) === 'search_timeout' && causeOfKey('audit_incomplete:8fa29e99-553c-4ca2-8b84-54ffa1766abc') === null && causeOfKey(countedKey('x')) === null && causeOfKey(emailedKey(key)) === null, 'the old per-audit keys and the quiet claims are never read as summaries');
const one = incompleteSummary({ cause: 'search_timeout', count: 1, sinceIso: '2026-11-16T12:08:00Z', names: [summaryEntry('M Shooter', 'c23ssz')] });
ok(one.title === '1 audit incomplete since 12:08' && /Cause: the AI search on Apify did not finish/.test(one.body) && one.body.endsWith('Reports: M Shooter (c23ssz)') && one.link === '/ai-audit', 'the first audit opens the row');
const twelve = ['M Shooter (c23ssz)', 'Neil Harrod AES Ltd (ftzc4y)', 'Overton Electrical Services Ltd (mt9rne)', 'D&M Electrical Specialists Ltd (z8hdej)', 'Solis Air Ltd (kzvper)', 'C.W Electrical Solutions (6nksgy)', 'Birchwood Electrical Services (fe25bf)', 'G Betts Electrical Services (xbme49)', 'L.h.f Electrical Services (g4va28)', 'Derbyshire R W Ltd (kbcye2)', 'FS Electrical Installations Ltd (4kpa3e)', 'Nicolae-Tiberiu Pacurariu (hwb35p)'];
let body = one.body;
for (let i = 1; i < twelve.length; i++) body = incompleteSummary({ cause: 'search_timeout', count: i + 1, sinceIso: '2026-11-16T12:08:00Z', names: [...namesInSummary(body), twelve[i]] }).body;
ok(namesInSummary(body).length === 12 && namesInSummary(body)[11] === 'Nicolae-Tiberiu Pacurariu (hwb35p)', 'later audits are added to the same row (names survive the round trip, commas in names aside)');
const big = incompleteSummary({ cause: 'search_timeout', count: 40, sinceIso: '2026-11-16T12:08:00Z', names: Array.from({ length: 40 }, (_, i) => `Firm ${i}`) });
ok(namesInSummary(big.body).length === SUMMARY_MAX_NAMED && / and 15 more$/.test(big.body), 'a big burst names 25 and counts the rest');
ok(namesInSummary(incompleteSummary({ cause: 'search_timeout', count: 41, sinceIso: '2026-11-16T12:08:00Z', names: [...namesInSummary(big.body), 'Firm 40'] }).body).length === SUMMARY_MAX_NAMED, 'still 25 named after one more');

/* ── 4. The email: once, a few minutes after the row opened, with the whole count ─────────────────── */
ok(!summaryDue('2026-11-16T12:08:00Z', '2026-11-16T12:09:30Z'), 'not while the burst is still landing');
ok(summaryDue('2026-11-16T12:08:00Z', '2026-11-16T12:11:00Z') && SUMMARY_EMAIL_AFTER_MS === 3 * 60_000, 'due 3 minutes after it opened');
ok(!summaryDue('2026-11-16T09:00:00Z', '2026-11-16T12:11:00Z'), 'an old row is never emailed late');
ok(ALERT_WINDOW_MS === 3_600_000, 'the window is an hour');
const mail = incompleteSummaryEmail({ cause: 'search_timeout', count: 12, sinceIso: '2026-11-16T12:08:00Z', names: twelve });
ok(mail.subject === '12 audits incomplete since 12:08' && /Cause: the AI search on Apify did not finish in time/.test(mail.lines[0]), 'the subject: "N audits incomplete since HH:MM", then the cause');
ok(mail.lines.some((l) => /Nothing was sent to a client or a prospect/.test(l)) && mail.lines.some((l) => /re-run the check/.test(l)), 'says nothing went to a prospect, and what to do');

/* ── 5. Provider refusals: at most once an hour per provider ──────────────────────────────────────── */
const pa = providerAlert({ provider: 'Apify', why: 'Apify refused: out of credit (HTTP 402)', where: 'x', nowIso: '2026-11-16T12:08:29Z' });
ok(pa.dedupeKey.startsWith(providerKeyPrefix('Apify')) && pa.dedupeKey.endsWith('2026-11-16T12:08'), 'a provider alert carries the minute it opened');
ok(pa.lines.some((l) => /next hour only raise the bell row's count/.test(l)), 'and says repeats stay quiet for the hour');

/* ── 6. The writer and the watcher ────────────────────────────────────────────────────────────────── */
const writer = read('supabase/functions/_shared/audit-alerts.ts');
ok(!/incompleteAlert\(/.test(writer) && /addToSummary\(service, ownerId, incompleteCause\(qrows, refusals\)/.test(writer), 'the finaliser adds to a summary; no per-audit alert is left');
ok(/claimQuiet\(service, ownerId, "audit_finished", countedKey\(auditId\)\)/.test(writer) && /claimQuiet\(service, ownerId, "audit_finished", emailedKey\(row\.dedupe_key\)\)/.test(writer), 'each audit counted once, each summary emailed once (quiet claims)');
ok(/read_at: now, cleared_at: now/.test(writer), 'the quiet claims are written cleared, so the bell never shows them');
ok(/const open = await openRow\(service, ownerId, providerKeyPrefix\(r\.provider\)\);\n\s+if \(open\) \{\n\s+await service\.from\("notifications"\)\.update\(\{ count:/.test(writer), 'a provider refusal inside the hour only raises the count');
const addFn = writer.slice(writer.indexOf('async function addToSummary'), writer.indexOf('export async function checkAuditCompleteness'));
ok(!/sendOperatorAlert/.test(addFn), 'adding an audit to the summary never emails');
const watch = read('supabase/functions/audit-watch/index.ts');
ok(/const summaries = await sendDueIncompleteSummaries\(service\);/.test(watch), 'audit-watch sends the due summaries');
const mig = read('supabase/migrations/20261220090000_audit_watch_incomplete_summary.sql');
ok(/v_summary/.test(mig) && /interval '3 minutes'/.test(mig) && /'audit_incomplete_emailed:' \|\| n\.dedupe_key/.test(mig) && /or coalesce\(v_summary, false\)/.test(mig), 'the cron gate wakes audit-watch for a due summary');
for (const c of ['openai_refused', 'apify_refused', 'search_timeout', 'search_failed', 'firms_unread']) ok(mig.includes(c), `the gate knows the cause ${c}`);

if (failures) { console.log(`\n${failures} FAILED`); process.exit(1); }
console.log('\nall passed');
