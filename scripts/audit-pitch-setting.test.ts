/* ═══════════════════════════════════════════════════════════
   A MANUAL AUDIT OBEYS "WHEN A PROSPECT REPLIES" (2026-10-09, Paul). Pins:
   · Do nothing / Audit only: the audit runs and NOTHING is parked or sent; Audit and reply: the existing WhatsApp pitch; texts: never
   · the rule is read on the SERVER (create-ai-audit, the completion step, the drain) — the browser's tooltip is advice
   · the button's tooltip / confirm / toast say what the CURRENT setting will do
   · no other caller can queue a pitch, and nothing here changes a sales status
   ═══════════════════════════════════════════════════════════ */
import { readFileSync, readdirSync } from 'node:fs';
import { WAITING_PITCH_MAX_AGE_DAYS, WAITING_PITCH_STATUSES, auditButtonCopy, auditStartedDescription, isWaitingPitchExpired, pitchMayFollowAudit, pitchRefusalNote, waitingPitchCutoffIso } from '../src/lib/auditPitchRule.ts';

let f = 0;
const ok = (c: unknown, msg: string) => { if (c) console.log('  ✓ ' + msg); else { f++; console.log('  ✗ ' + msg); } };
const read = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
(globalThis as unknown as { Deno: unknown }).Deno = { env: { get: () => undefined } };

console.log('1. the rule, for each setting and channel');
{
  ok(!pitchMayFollowAudit('off') && !pitchMayFollowAudit('off', 'sms'), 'Do nothing: no pitch, either channel');
  ok(!pitchMayFollowAudit('audit_only') && !pitchMayFollowAudit('audit_only', 'sms'), 'Audit only: no pitch, either channel');
  ok(pitchMayFollowAudit('send') && pitchMayFollowAudit('send', 'whatsapp'), 'Audit and reply: the existing pitch on WhatsApp');
  ok(!pitchMayFollowAudit('send', 'sms'), 'Audit and reply on the SMS channel: never a pitch');
  ok(!pitchMayFollowAudit(null) && !pitchMayFollowAudit(undefined) && !pitchMayFollowAudit('weird' as never), 'an absent / unreadable / unknown setting is NOT a yes');
  ok(pitchRefusalNote('off') === 'reply_rule_off' && pitchRefusalNote('audit_only') === 'reply_rule_audit_only' && pitchRefusalNote(null) === 'reply_rule_unreadable', 'each refusal names its reason');
}

console.log('2. the server reads the setting (effectiveReplyMode) — the three real settings');
{
  const { effectiveReplyMode } = await import('../supabase/functions/_shared/auto-reply-rules.ts');
  const svc = (row: Record<string, unknown> | null, err = false) => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => (err ? { data: null, error: { message: 'x' } } : { data: row, error: null }) }) }) }) });
  const rule = async (row: Record<string, unknown> | null, err = false) => effectiveReplyMode(svc(row, err));
  ok(await rule({ auto_reply_enabled: false, first_reply_mode: 'send' }) === 'off', 'toggle off (Do nothing) reads off even when the remembered mode is send');
  ok(await rule({ auto_reply_enabled: true, first_reply_mode: 'audit_only' }) === 'audit_only', 'Audit only reads audit_only');
  ok(await rule({ auto_reply_enabled: true, first_reply_mode: 'send' }) === 'send', 'Audit and reply reads send');
  ok(await rule(null) === 'off' && await rule(null, true) === 'off', 'a missing / unreadable setting reads off — the safe direction');
  for (const [row, expectPitch] of [[{ auto_reply_enabled: false, first_reply_mode: 'send' }, false], [{ auto_reply_enabled: true, first_reply_mode: 'audit_only' }, false], [{ auto_reply_enabled: true, first_reply_mode: 'send' }, true]] as const) {
    ok(pitchMayFollowAudit(await rule(row as never)) === expectPitch, `end to end: ${JSON.stringify(row)} → a manual audit ${expectPitch ? 'parks the pitch' : 'parks and sends NOTHING'}`);
  }
}

console.log('3. the button words tell the truth for the current setting');
{
  const base = { inFlight: false, inputsMissing: false, hasCompleted: false, business: 'Acme Plumbing' };
  const off = auditButtonCopy({ ...base, channel: 'whatsapp', rule: 'off' });
  const only = auditButtonCopy({ ...base, channel: 'whatsapp', rule: 'audit_only' });
  const send = auditButtonCopy({ ...base, channel: 'whatsapp', rule: 'send' });
  const sms = auditButtonCopy({ ...base, channel: 'sms', rule: 'send' });
  ok(off.title === 'Run AI audit — no message will be sent' && only.title === 'Run AI audit — no message will be sent', 'Do nothing / Audit only: "Run AI audit — no message will be sent"');
  ok(send.title === 'Run AI audit — the report pitch sends when it completes', 'Audit and reply: the pitch sends when it completes');
  ok(sms.title === 'Run AI audit — no message will be sent', 'texts: never a pitch, whatever the setting');
  ok(/Nothing is sent/.test(off.confirm) && /Nothing is sent/.test(only.confirm) && /Nothing is sent/.test(sms.confirm) && /auto-sends/.test(send.confirm), 'the confirm says the same thing');
  ok(!/pitch/i.test(off.title + only.title + sms.title + off.confirm + only.confirm + sms.confirm + off.startedToast + only.startedToast + sms.startedToast), 'no "pitch" wording anywhere when nothing will be sent');
  const unknown = auditButtonCopy({ ...base, channel: 'whatsapp', rule: undefined });
  ok(/depends on/.test(unknown.title) && !/sends when it completes/.test(unknown.title), 'while the setting is unread the tooltip does not promise a send');
  ok(auditButtonCopy({ ...base, channel: 'whatsapp', rule: 'audit_only', hasCompleted: true }).title === 'Re-run AI audit — no message will be sent', 're-run wording keeps the same tail');
  ok(auditStartedDescription({ pitch_note: 'reply_rule_audit_only' }, 'whatsapp').includes('Audit only') && auditStartedDescription({ pitch_note: 'reply_rule_off' }, 'whatsapp').includes('Do nothing'), 'the toast names the setting that stopped the pitch');
  ok(auditStartedDescription({ pitch_queued: true }, 'whatsapp').includes('auto-send') && !auditStartedDescription({}, 'sms').includes('pitch'), 'the toast reports a parked pitch only when the server parked one');
}

console.log('4. the wiring: server rule first, every route consistent');
{
  const ca = read('supabase/functions/create-ai-audit/index.ts');
  const gate = ca.indexOf('!pitchMayFollowAudit(replyRule)');
  const park = ca.indexOf('from("whatsapp_auto_replies").insert({', gate);
  ok(gate > 0 && park > gate && /effectiveReplyMode\(service\)/.test(ca), 'create-ai-audit reads the setting and refuses to park a pitch BEFORE the insert');
  ok(/pitchNote = pitchRefusalNote\(replyRule\)/.test(ca), '…and answers with the reason');
  const q = read('supabase/functions/process-ai-audit-queue/index.ts');
  const arm = q.indexOf('if (completionSendJobs.length && autoReplyEnvOn() && pitchesMayFollow)');
  ok(arm > 0 && /pitchMayFollowAudit\(await effectiveReplyMode\(service\)\)/.test(q) && q.indexOf('.update({ status: "pending", fire_after', arm) > arm, 'a completed audit arms a parked pitch / the audit_complete pitch only under Audit and reply');
  const drain = read('supabase/functions/process-whatsapp-queue/index.ts');
  ok(/trigger === "audit_complete" && \(!replyToggleOn \|\| !replyModeSends\)\) continue/.test(drain) && /trigger === "first_reply" && !replyModeSends\) continue/.test(drain), 'the drain re-checks at send time for both triggers');
  ok(/replyRule: effectiveFirstReplyMode\(st\?\.auto_reply_enabled, st\?\.first_reply_mode\)/.test(drain), 'the Inbox can read the effective rule (queue_state, both roles)');
  const inbox = read('src/pages/Inbox.tsx');
  ok(/queue_pitch_on_complete: pitchMayFollowAudit\(queueState\?\.replyRule, channel\)/.test(inbox), 'the Inbox only ASKS for a pitch when the rule allows one');
  ok(/title=\{auditCopy\.title\}/.test(inbox) && !/pitch auto-sends on completion\)/.test(inbox.replace(/\/\*[\s\S]*?\*\//g, '')), 'the tooltip comes from the setting; the old fixed text is gone');
  // nobody else can queue a pitch
  const walk = (d: string): string[] => readdirSync(new URL('../' + d, import.meta.url), { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]);
  const callers = [...walk('src'), ...walk('supabase/functions')].filter((p) => /\.tsx?$/.test(p)).filter((p) => /queue_pitch_on_complete\s*:/.test(read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')));
  ok(callers.length === 1 && callers[0] === 'src/pages/Inbox.tsx', `the Inbox header button is the ONLY caller that asks for a pitch (found: ${callers.join(', ')})`);
  ok(!/status:\s*['"]not_interested['"]|set_lead_status|setLeadPipelineStatus/.test(ca) , 'create-ai-audit never sets a sales status');
  ok(/budgetPoolForPurpose\(auditPurpose\) === "prospecting"/.test(ca), 'budget rules untouched: prospecting pool only');
}

console.log('5. a waiting pitch older than 7 days expires instead of sending');
{
  const NOW = Date.parse('2026-10-10T12:00:00Z');
  const ago = (d: number) => new Date(NOW - d * 86_400_000).toISOString();
  ok(WAITING_PITCH_MAX_AGE_DAYS === 7, 'the limit is 7 days');
  ok(!isWaitingPitchExpired(ago(0), NOW) && !isWaitingPitchExpired(ago(6.9), NOW), 'a fresh row is not expired');
  ok(isWaitingPitchExpired(ago(7.1), NOW) && isWaitingPitchExpired(ago(39), NOW), 'a row over 7 days old (the 2026-09-01 ones were 39 days) is expired');
  ok(isWaitingPitchExpired(null, NOW) && isWaitingPitchExpired('not a date', NOW) && isWaitingPitchExpired(undefined, NOW), 'an undated waiting row reads as expired — never as fresh');
  ok(Date.parse(waitingPitchCutoffIso(NOW)) === NOW - 7 * 86_400_000, 'the sweep cutoff is exactly 7 days back');
  ok(JSON.stringify([...WAITING_PITCH_STATUSES]) === JSON.stringify(['awaiting_audit', 'pending']), 'only the two waiting statuses are swept (audit_only, sent, flagged_* are left alone)');
  const q = read('supabase/functions/process-ai-audit-queue/index.ts');
  const expire = q.indexOf('.lt("created_at", waitingPitchCutoffIso())');
  const arm = q.indexOf('.eq("status", "awaiting_audit").gte("created_at", waitingPitchCutoffIso())');
  ok(expire > 0 && arm > expire, 'the completion step retires old waiting rows FIRST and arms only a row inside the window');
  const d = read('supabase/functions/process-whatsapp-queue/index.ts');
  const sweep = d.indexOf('THE EXPIRY SWEEP RUNS FIRST');
  const env = d.indexOf('if (!autoReplyEnvOn()) return json({ ok: true, mode, skipped: "env_off"', sweep);
  ok(sweep > 0 && env > sweep, 'the drain sweeps expired rows BEFORE the kill-switch / toggle checks (so they expire even while the rule is off)');
  const rowCheck = d.indexOf('isWaitingPitchExpired(row.created_at)');
  const toggle = d.indexOf('if (trigger === "first_reply" && !replyToggleOn) continue;', rowCheck);
  ok(rowCheck > 0 && toggle > rowCheck, 'and each row is checked for expiry before any send decision');
  ok(/results\[row\.lead_id\] = "expired";\s*continue;/.test(d), 'an expired row is retired and skipped — never sent');
  ok(/skipped_stale/.test(d.slice(sweep, sweep + 900)), 'it uses the existing retired status (skipped_stale), with a reason');
}

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log('\nall passed');
