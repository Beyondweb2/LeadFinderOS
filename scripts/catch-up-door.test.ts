/* THE CATCH-UP DOOR (Paul, 2026-10-25): an internal caller (CRON_SECRET + x-internal-job, no login) may (1) start a fresh PROSPECT
   crawl of a lead's own site and (2) rewrite one OPEN draft. Never a send, never a client, never while paused. Pure + source checks. */
import { readFileSync } from 'node:fs';
import { isCatchUpCrawlRequest, isIntakeCrawlRequest, resolveCrawlMode } from '../src/lib/fullCrawl.ts';

let failures = 0;
const ok = (c: unknown, m: string) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) failures++; };

console.log('1. the crawl request shape');
{
  const good = { mode: 'full', requested_from: 'catch_up', lead_id: 'abc' };
  ok(isCatchUpCrawlRequest(true, good), 'internal + full + catch_up + lead id');
  ok(!isCatchUpCrawlRequest(false, good), 'a caller that is not internal never gets it');
  ok(!isCatchUpCrawlRequest(true, { ...good, mode: 'standard' }) && !isCatchUpCrawlRequest(true, { requested_from: 'catch_up', lead_id: 'abc' }), 'mode must be exactly full');
  ok(!isCatchUpCrawlRequest(true, { ...good, requested_from: 'outreach' }) && !isCatchUpCrawlRequest(true, { ...good, requested_from: undefined }), 'the source must be catch_up');
  ok(!isCatchUpCrawlRequest(true, { ...good, lead_id: '' }) && !isCatchUpCrawlRequest(true, { mode: 'full', requested_from: 'catch_up' }), 'a lead id is required');
  ok(!isCatchUpCrawlRequest(true, { ...good, url: 'https://x.test' }) && !isCatchUpCrawlRequest(true, { ...good, audit_id: 'a' }) && !isCatchUpCrawlRequest(true, { ...good, run_id: 'r' }), 'no url / audit / run: the lead\'s own website only');
  ok(!isCatchUpCrawlRequest(true, null) && !isCatchUpCrawlRequest(true, 'full'), 'junk bodies are refused');
  ok(!isIntakeCrawlRequest(true, good), 'it is not the paid-client intake door');
  ok(resolveCrawlMode('full', false) === 'standard', 'every other internal caller stays standard');
}

console.log('2. crawl-check: prospects only, nothing paused, reuse bypassed');
{
  const s = readFileSync('supabase/functions/crawl-check/index.ts', 'utf8').replace(/\r\n/g, '\n');
  ok(s.includes('const catchUpCrawl = isCatchUpCrawlRequest(internal, body);'), 'the door is derived from `internal` (the CRON_SECRET check), never the body alone');
  ok(/catchUpCrawl && isClient\) return json\(\{ ok: false, error: "client_lead"/.test(s), 'a paid client is refused');
  ok(/catchUpCrawl && \(await paidMode\(service\)\) !== "running"\) return json\(\{ ok: false, error: "paused"/.test(s), 'any pause / all-stop refuses it');
  ok(s.includes('force: body?.force === true || catchUpCrawl, role: catchUpCrawl ? "admin" : role'), 'the saved crawl is replaced, not reused');
  ok(!/pageCap = null/.test(s.slice(s.indexOf('catchUpCrawl && isClient'), s.indexOf('catchUpCrawl && isClient') + 600)), 'the prospect page cap still applies (crawlPageCapFor)');
}

console.log('3. ai-reply-drafts: internal only, rewrite an open draft, send nothing');
{
  const s = readFileSync('supabase/functions/ai-reply-drafts/index.ts', 'utf8').replace(/\r\n/g, '\n');
  ok(s.includes('if (action === "catch_up_regenerate") return internal ? await handleCatchUpRegenerate(service, body) : json({ ok: false, error: "not_authorised" }, 401);'), 'refused 401 unless CRON_SECRET + x-internal-job');
  const a = s.indexOf('async function handleCatchUpRegenerate');
  const fn = s.slice(a, s.indexOf('/** "Draft reply"', a));
  ok(fn.includes('paidMode(service)) !== "running"') && fn.includes('modeMayAutoSend(parseInboxReplyMode(st.ai_reply_mode))'), 'refused while paused, or while the Inbox mode is Auto or unreadable');
  ok(fn.includes('regenerateOpenDraft('), 'it goes through the same function the Regenerate button uses');
  ok(!/send-whatsapp|status: "sent"|\.insert\(|whatsapp_messages|sendMessage|fetch\(/.test(fn), 'the door body sends nothing and creates nothing');
  const reg = s.slice(s.indexOf('async function regenerateOpenDraft'), s.indexOf('/* ⛔ THE CATCH-UP DOOR'));
  ok(['"not_open"', 'STOP_REASONS.has', 'AI_REPLY_MAX_REGENERATIONS', 'serviceWindowState(d.inbound_at).open', 'pitchNeedsEvidence(ctx.plan) && ev.state === "waiting"', 'VISIBLE_NO_PITCH_ERROR', 'stopAutoSend'].every((x) => reg.includes(x)), 'every Regenerate rule still applies (open, stop, cap, window, evidence, Visible, auto-send stop)');
  ok(/\.eq\("status", "pending"\)\.select\("id, draft_text/.test(reg), 'the write only touches a draft that is still pending');
}

if (failures) { console.log(`\n${failures} FAILED`); process.exit(1); }
console.log('\nall passed');
