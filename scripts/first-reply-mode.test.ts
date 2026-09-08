/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE REPLY MODE — the properties that make "run audit only" trustworthy.

   Run: npx tsx scripts/first-reply-mode.test.ts

   ⛔ THE ONE THIS EXISTS FOR: in audit_only mode, NO input of any kind may produce a sendable row.
   Not an unknown mode, not a blank column, not a lead that already has a completed audit, not a
   lead already holding a legacy row. The status an audit_only arm writes must be one the send
   path's arming query cannot see — and that query is scoped to 'awaiting_audit', so the test is
   that audit_only never yields it.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import {
  AUDIT_ONLY_STATUS,
  AUTO_REPLY_STALE_MS,
  DEFAULT_FIRST_REPLY_MODE,
  DEFAULT_FIRST_REPLY_TEMPLATE,
  FIRST_REPLY_MODES,
  FIRST_REPLY_MODE_HINTS,
  FIRST_REPLY_MODE_LABELS,
  armStatusFor,
  isStaleAutoReply,
  modeRunsAudit,
  modeSends,
  parseFirstReplyMode,
  type FirstReplyMode,
} from '../src/lib/firstReplyMode.ts';

let fails = 0;
const ok = (c: boolean, l: string) => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };

console.log('── ABSENCE IS NEVER PERMISSION ──');
/* Every one of these is a real state: the SQL not yet run (undefined), a NULL column, an empty
   string from a bad write, a value from a future build, and a near-miss typo. */
for (const bad of [undefined, null, '', '   ', 'SEND', 'audit', 'on', 'true', 'off_', 42, {}, []] as unknown[]) {
  const m = parseFirstReplyMode(bad);
  ok(m === 'audit_only', `${JSON.stringify(bad)} → 'audit_only' (got '${m}')`);
}
ok(DEFAULT_FIRST_REPLY_MODE === 'audit_only', 'and the declared default is the silent one');
ok(parseFirstReplyMode('send') === 'send', 'while an exact "send" is honoured — the operator can still choose it');
/* ⚠️ WHITESPACE IS TRIMMED, DELIBERATELY, AND MY FIRST DRAFT OF THIS TEST HAD IT THE OTHER WAY.
   A trailing space typed into a hand-run SQL update is not an operator changing their mind: silently
   demoting 'send ' to audit_only would leave the control saying "auto-send" over a rule that does
   not, which is the screen-and-behaviour disagreement this whole feature is built to avoid. Case is
   NOT normalised though — 'SEND' is not a value this system ever writes, so it stays unknown. */
ok(parseFirstReplyMode('send ') === 'send' && parseFirstReplyMode('  audit_only  ') === 'audit_only',
  'surrounding whitespace is trimmed rather than treated as an unknown value');
ok(parseFirstReplyMode('SEND') === 'audit_only', 'but a wrong CASE is unknown, and unknown is silent');
ok(parseFirstReplyMode('off') === 'off' && parseFirstReplyMode('audit_only') === 'audit_only',
  'and the other two exact values round-trip');

console.log('\n── ONLY AN EXPLICIT "send" SENDS ──');
ok(modeSends('send'), 'send sends');
ok(!modeSends('audit_only'), 'audit_only does not');
ok(!modeSends('off'), 'off does not');
/* The property, not the enumeration: a mode added tomorrow must default to NOT sending, which is
   what asserting on the positive gives you. `mode !== 'audit_only'` would make it send. */
ok(!modeSends('measure_and_notify' as FirstReplyMode),
  'and an UNKNOWN mode does not send — the test that a future mode joins the safe side');

console.log('\n── BOTH WORKING MODES MEASURE ──');
ok(modeRunsAudit('audit_only') && modeRunsAudit('send'), 'audit_only and send both run the audit');
ok(!modeRunsAudit('off'), 'off runs nothing');

console.log('\n── THE ARM STATUS: audit_only CAN NEVER YIELD A SENDABLE ROW ──');
/* 'awaiting_audit' is the ONLY status the completion hook upgrades to 'pending'
   (process-ai-audit-queue: .eq("status", "awaiting_audit")), and 'pending' is the only status the
   drain selects. So "unsendable" means: never either of those two. */
const SENDABLE = new Set(['pending', 'awaiting_audit']);
for (const hasAudit of [true, false]) {
  const st = armStatusFor('audit_only', hasAudit);
  ok(st === AUDIT_ONLY_STATUS, `audit_only + hasCompletedAudit=${hasAudit} → '${AUDIT_ONLY_STATUS}'`);
  ok(!SENDABLE.has(st as string), `  …and that status is NOT one the send path can act on`);
}
ok(armStatusFor('send', true) === 'pending', 'send + an existing audit → pending (send it after the cancel window)');
ok(armStatusFor('send', false) === 'awaiting_audit', 'send + no audit → awaiting_audit (the hook arms it on completion)');
ok(armStatusFor('off', false) === null && armStatusFor('off', true) === null,
  'off arms NOTHING — null, not a status');
/* Why null rather than a "we did nothing" row: lead_id is UNIQUE on whatsapp_auto_replies, so any
   row permanently spends the lead's once-ever slot. Recording inaction would mean this lead could
   never be pitched after the mode is turned on. */
ok(armStatusFor('whatever' as FirstReplyMode, false) === null,
  'and an unknown mode arms nothing at all, rather than falling into a sending branch');

console.log('\n── STALE PARKED ROWS ARE RETIRED, NOT SENT ──');
const NOW = Date.parse('2026-09-08T12:00:00Z');
ok(isStaleAutoReply(null, NOW), 'a row with no fire_after is stale — a row we cannot date, we do not send');
ok(isStaleAutoReply('not-a-date', NOW), 'an unparseable stamp is stale, never treated as fresh');
ok(isStaleAutoReply(new Date(NOW - AUTO_REPLY_STALE_MS - 1000).toISOString(), NOW),
  'just past the window is stale');
ok(!isStaleAutoReply(new Date(NOW - AUTO_REPLY_STALE_MS + 1000).toISOString(), NOW),
  'just inside the window still sends — the guard retires a pile, it does not break the rule');
ok(!isStaleAutoReply(new Date(NOW - 3 * 60_000).toISOString(), NOW),
  'and the normal 3-minute cancel window is nowhere near stale');
/* The measured case this exists for: rows parked on 1 and 7 Sep, read on the 8th. */
ok(isStaleAutoReply('2026-09-07T11:41:24Z', NOW), 'the real 7 Sep parked row is stale');
ok(isStaleAutoReply('2026-09-01T12:05:40Z', NOW), 'and the real 1 Sep one is very stale');
ok(!isStaleAutoReply(new Date(NOW + 60_000).toISOString(), NOW),
  'a future fire_after is not stale (it is simply not due yet — the drain filters that separately)');

console.log('\n── THE TEMPLATE DEFAULT IS THE WARM ONE, IN ONE PLACE ──');
ok(DEFAULT_FIRST_REPLY_TEMPLATE === 'audit_reply_warm',
  'the shared default is audit_reply_warm, so arm-time and send-time cannot disagree');

console.log('\n── NOTHING CAN RENDER AS A RAW SLUG ──');
ok(FIRST_REPLY_MODES.length === 3, 'three modes');
for (const m of FIRST_REPLY_MODES) {
  ok(typeof FIRST_REPLY_MODE_LABELS[m] === 'string' && FIRST_REPLY_MODE_LABELS[m].length > 0, `${m} has a label`);
  ok(typeof FIRST_REPLY_MODE_HINTS[m] === 'string' && FIRST_REPLY_MODE_HINTS[m].length > 0, `${m} has a hint`);
}
ok(/send/i.test(FIRST_REPLY_MODE_LABELS.send), 'the sending mode says the word "send" on its face');
ok(!/send/i.test(FIRST_REPLY_MODE_LABELS.audit_only), 'and the audit-only one does not');

console.log(fails === 0 ? '\nALL PASS' : `\n${fails} FAILED`);
process.exit(fails === 0 ? 0 : 1);
