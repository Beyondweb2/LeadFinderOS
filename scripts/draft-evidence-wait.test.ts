/* THE PITCH WAITS FOR ITS EVIDENCE (Paul, 2026-10-21). src/lib/draftEvidenceWait.ts + fn ai-reply-drafts.
   Pins: a reply that arrives before the audit / website check is final waits (no draft), is drafted the tick both are final,
   is flagged "Audit did not finish" after 30 minutes; Draft reply / Regenerate say the audit is still running; an open pitch
   written without evidence is rewritten once; stop / angry / no / media never wait. Nothing here sends. */
import { readFileSync } from 'node:fs';
import {
  auditPhaseOf, crawlPhaseOf, draftLackedEvidence, evidenceVerdict, pitchNeedsEvidence,
  AUDIT_NOT_FINISHED_LABEL, AUDIT_RUNNING_DETAIL, EVIDENCE_WAIT_MS, WAITING_REASON,
} from '../src/lib/draftEvidenceWait.ts';
import { aiReplyDecision, aiChipFor, type AiReplyRow } from '../src/lib/aiReplyDraft.ts';
import { pickMove, PITCH_INTRO_LINE, type MoveEvidence, type MoveThreadMsg } from '../src/lib/replyMove.ts';

let f = 0;
const ok = (c: unknown, m: string) => { if (c) console.log('  PASS ' + m); else { f++; console.log('  FAIL ' + m); } };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const FN = read('supabase/functions/ai-reply-drafts/index.ts');
const INBOX = read('src/pages/Inbox.tsx');

const T0 = Date.parse('2026-10-21T10:00:00Z');
const min = (n: number) => T0 + n * 60_000;
const opener: MoveThreadMsg = { from: 'us', text: '[initial_contact_short]', templateName: 'initial_contact_short' };
const lead = { amount_paid: null, status: 'replied', is_archived: false };
/* What the drafter can see while the audit is still running: no trade / town / counts / names, the site not yet checked. */
const before: MoveEvidence = { businessName: 'ZZ Fixture Plumbing 91', trade: null, town: null, engineWords: 'ai', named: null, competitors: [], hookAlreadySent: false,
  findings: [], hasWebsite: true, ownerName: null, foundOnGoogle: true, site: { state: 'not_checked', issues: [] } };
const after: MoveEvidence = { ...before, trade: 'plumbers', town: 'Rugby', named: { named: 0, valid: 6 }, competitors: ['Rival A Plumbing', 'Rival B Plumbing'],
  site: { state: 'issues', issues: ['Your town is not on your home page'] } };
const pm = (text: string, e: MoveEvidence) => pickMove({ thread: [opener, { from: 'them', text }], suppressed: false, aiSentSinceWin: 0, evidence: e });

console.log('1. the phases');
{
  ok(auditPhaseOf([]) === 'none', 'no audit yet → none (waits: the reply may have just started one)');
  ok(auditPhaseOf([{ audit_purpose: 'audit', runs: [] }]) === 'running', 'an audit with no runs yet → running');
  ok(auditPhaseOf([{ audit_purpose: 'audit', runs: [{ status: 'pending' }] }]) === 'running', 'a pending run → running');
  ok(auditPhaseOf([{ audit_purpose: null, runs: [{ status: 'complete' }] }]) === 'done', 'a complete run → done');
  ok(auditPhaseOf([{ audit_purpose: 'audit', runs: [{ status: 'capped' }] }]) === 'done', 'a capped run → done');
  ok(auditPhaseOf([{ audit_purpose: 'audit', runs: [{ status: 'failed' }, { status: 'cancelled' }] }]) === 'failed', 'every run failed / cancelled → failed (final)');
  ok(auditPhaseOf([{ audit_purpose: 'audit', runs: [{ status: 'failed' }, { status: 'running' }] }]) === 'running', 'one run still going → running, never failed');
  ok(auditPhaseOf([{ audit_purpose: 'baseline', runs: [{ status: 'complete' }] }]) === 'none', 'a baseline is not the hook audit');
  ok(auditPhaseOf([{ audit_purpose: 'audit', is_measurement: true, runs: [{ status: 'complete' }] }]) === 'none', 'a measurement is not the hook audit');
  ok(auditPhaseOf([{ audit_purpose: 'audit', runs: [{ status: 'running' }] }, { audit_purpose: 'audit', runs: [{ status: 'complete' }] }]) === 'done', 'an older completed audit counts as done');
  for (const s of ['issues', 'clean', 'unreadable', 'no_website', 'profile']) ok(crawlPhaseOf(s, false) === 'final', `website check "${s}" → final`);
  ok(crawlPhaseOf('not_checked', false) === 'running', 'not checked yet → running');
  ok(crawlPhaseOf('not_checked', true) === 'final', 'not checked but the last attempt failed → final ("couldn\'t check the site")');
  ok(crawlPhaseOf(undefined, false) === 'running', 'unknown → running (never a pitch without evidence)');
}

console.log('2. a reply that arrives BEFORE the audit finishes');
{
  const plan = pm('Yes it is', before);
  ok(plan.move === 'first_reply_pitch' && pitchNeedsEvidence(plan), 'a bare "yes it is" is the pitch, and the pitch needs evidence');
  ok(aiReplyDecision({ inboundAt: new Date(min(0)).toISOString(), lead, hadOutreach: true, plan, nowMs: min(1) }).kind === 'draft', 'the decision is still "draft"; the wait is the extra step');
  const v1 = evidenceVerdict({ audit: 'running', crawl: 'running', inboundAtMs: min(0), nowMs: min(1) });
  ok(v1.state === 'waiting' && v1.waitingFor.join() === 'audit,crawl', 'one minute later, both running → WAIT (no draft written)');
  const v2 = evidenceVerdict({ audit: 'done', crawl: 'running', inboundAtMs: min(0), nowMs: min(6) });
  ok(v2.state === 'waiting' && v2.waitingFor.join() === 'crawl', 'audit done, crawl still running → still waiting');
  const v3 = evidenceVerdict({ audit: 'done', crawl: 'final', inboundAtMs: min(0), nowMs: min(9) });
  ok(v3.state === 'ready', 'both final → ready: the tick drafts it now');
  const drafted = pm('Yes it is', after);
  ok(drafted.move === 'first_reply_pitch' && /Rival A Plumbing/.test(drafted.fixedText ?? '') && /town is not on your home page/i.test(drafted.fixedText ?? ''),
    'the draft written once ready names the competitors AND the site issue');
  ok(!/Rival A/.test(plan.fixedText ?? ''), '(the draft that WOULD have been written before had neither — the bug)');
  const v4 = evidenceVerdict({ audit: 'failed', crawl: 'final', inboundAtMs: min(0), nowMs: min(3) });
  ok(v4.state === 'ready', 'an audit that failed after its retries is final too');
  const v5 = evidenceVerdict({ audit: 'running', crawl: 'final', inboundAtMs: min(0), nowMs: min(30) });
  ok(v5.state === 'timed_out' && EVIDENCE_WAIT_MS === 30 * 60_000, '30 minutes after their reply with the audit still running → timed out');
  ok(evidenceVerdict({ audit: 'none', crawl: 'running', inboundAtMs: NaN, nowMs: min(1) }).state === 'timed_out', 'an unreadable reply time never waits for ever');
  const waitingRow: AiReplyRow = { id: 'w', phone: '447700900091', lead_id: 'l', kind: 'skipped', status: 'pending', inbound_at: new Date(min(0)).toISOString(), reason: WAITING_REASON };
  ok(aiChipFor(waitingRow, min(1)) === null, 'the waiting row draws no chip and no panel (no layout change)');
}

console.log('3. stop / angry / not interested / media never wait');
{
  for (const [text, what] of [['STOP', 'a stop'], ['Fuck off', 'an angry reply'], ['Not interested thanks', 'a no'], ['[audio]', 'a voice note'], ['[image]', 'an image']] as const) {
    const p = pm(text, before);
    ok(!pitchNeedsEvidence(p), `${what} is not a pitch: decided at once, no wait`);
  }
  const auto = pickMove({ thread: [opener, { from: 'them', text: 'Thanks for contacting ZZ Fixture Plumbing 91. We will get back to you soon.' }], suppressed: false, aiSentSinceWin: 0, evidence: before });
  ok(auto.move === 'auto_reply' && !!auto.fixedText && pitchNeedsEvidence(auto), 'the first auto-reply\'s pitch waits like the pitch');
}

console.log('4. drafts written without evidence');
{
  const legacy = { move: 'first_reply_pitch', closer: 'agency', search: null, named: null, findingsNote: null };
  ok(draftLackedEvidence(legacy, 'Hi mate, ...'), 'an old pitch with no audit on it lacked evidence');
  ok(draftLackedEvidence({ move: 'first_reply_pitch', closer: 'agency', search: 'plumbers in Rugby', named: { named: 0, valid: 6 }, findingsNote: 'Nobody has checked this website yet, so there are no website points to mention.' }, 'x'),
    'an old pitch whose website was not checked lacked evidence');
  ok(!draftLackedEvidence({ move: 'first_reply_pitch', closer: 'agency', search: 'plumbers in Rugby', named: { named: 0, valid: 6 }, findingsNote: null }, 'x'), 'an old pitch with both did not');
  ok(!draftLackedEvidence({ ...legacy, evidence: { ready: true, audit: 'done', crawl: 'final' } }, 'x'), 'a new draft trusts its recorded evidence (ready)');
  ok(draftLackedEvidence({ ...legacy, search: 'x', named: {}, evidence: { ready: false, audit: 'running', crawl: 'final' } }, 'x'), 'a draft written after the wait ran out is refreshed later');
  ok(!draftLackedEvidence({ move: 'offer_voice_note', search: null, named: null }, 'x'), 'a non-pitch draft never counts');
  ok(!draftLackedEvidence({ move: 'auto_reply', closer: null, search: null, named: null }, 'No rush, speak soon.'), 'an auto-reply line is not a pitch');
  ok(!draftLackedEvidence(legacy, ''), 'no text, nothing to rewrite');
  ok(draftLackedEvidence({ move: 'first_reply_pitch', closer: 'agency', search: 'x', named: { named: 0, valid: 3 } }, `Hi mate,\n\n${PITCH_INTRO_LINE}\n\nAre you with an agency…`),
    'an old pitch whose TEXT is the no-audit opening lacked evidence (Pass With Paul, 21 Oct)');
}

console.log('5. the function (source pins)');
{
  const proc = FN.slice(FN.indexOf('async function processInbound'), FN.indexOf('async function refreshEvidenceLessPitches'));
  const wait = proc.indexOf('pitchNeedsEvidence(plan) && ev.state === "waiting"');
  ok(wait > 0 && wait < proc.indexOf('await writeDraft('), 'the tick checks the evidence BEFORE writing a pitch');
  ok(proc.indexOf('decision.kind === "needs_you"') < wait && proc.indexOf('decision.kind === "skipped"') < wait, 'every flag (stop / angry / media…) is decided before the wait, unchanged');
  ok(/reason: WAITING_REASON/.test(proc) && /kind: "skipped", status: "pending"/.test(proc), 'waiting = kind skipped, status pending, reason waiting_for_audit (existing columns, no migration)');
  ok(/reason: AUDIT_NOT_FINISHED_REASON, reason_label: AUDIT_NOT_FINISHED_LABEL/.test(proc) && AUDIT_NOT_FINISHED_LABEL === 'Audit did not finish', 'after the wait: Needs you, "Audit did not finish"');
  ok(/\.eq\("reason", WAITING_REASON\)/.test(FN) && /eq\("status", "pending"\)\.eq\("reason", WAITING_REASON\)\.select/.test(FN), 'the tick picks waiting rows up each minute, claimed by one conditional write');
  const draftFn = FN.slice(FN.indexOf('async function handleDraft'), FN.indexOf('async function handleMarkOptedOut'));
  ok(draftFn.indexOf('AUDIT_RUNNING_ERROR') > 0 && draftFn.indexOf('AUDIT_RUNNING_ERROR') < draftFn.indexOf('inbox_scheduled_sends'), 'Draft reply says the audit is still running, before touching anything');
  const regen = FN.slice(FN.indexOf('async function handleRegenerate'), FN.indexOf('async function handleDraft'));
  ok(regen.indexOf('AUDIT_RUNNING_ERROR') > 0 && regen.indexOf('AUDIT_RUNNING_ERROR') < regen.indexOf('personDraft('), 'Regenerate says the audit is still running, before any model call');
  ok(/AUDIT_RUNNING_DETAIL/.test(FN) && /still running/.test(AUDIT_RUNNING_DETAIL), 'the words say the audit is still running');
  ok(/res\.ok === false\) toast\(\{ title: "Couldn't write another version", description: res\.detail/.test(INBOX), 'the Inbox shows a Regenerate refusal (it used to say nothing)');
  const refresh = FN.slice(FN.indexOf('async function refreshEvidenceLessPitches'), FN.indexOf('/* ───────────────────────── person actions'));
  ok(/draftLackedEvidence\(d\.why, d\.draft_text\)/.test(refresh) && /\.is\("auto_send_id", null\)/.test(refresh) && /\.eq\("updated_at", d\.updated_at\)/.test(refresh),
    'open pitches written without evidence are rewritten once ready, only if nobody touched them');
  ok(/evidenceStale: true/.test(refresh), 'a rewrite that is no longer a pitch is marked for Regenerate instead');
  ok(!/graph\.facebook\.com|functions\/v1\/send-whatsapp|from\("whatsapp_messages"\)\.insert|from\("whatsapp_sends"\)(?!\.select\()/.test(FN), 'the function still never sends (it only READS a receipt)');
  ok(/x-ai-reply-drafts": "2026-10-(?:21[e-z]|2[2-9][a-z]|3[01][a-z])-[a-z-]+"/.test(FN), 'deploy marker bumped (this release or a later one)');
}

console.log(f ? `\n${f} FAILURE(S)` : '\nALL PASS');
process.exit(f ? 1 : 0);
