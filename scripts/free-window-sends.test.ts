/* ============================================================
   FREE-WINDOW SENDS (2026-11-16, v1-free-window-sends). Paul: "never pay for a template when it doesn't have to".

   ⛔ THE FAILURES THIS SUITE EXISTS FOR:
     · a template sent from ANY door (lead popup, dashboard, Quick Close, welcome pack, Inbox bulk, the automatic audit reply
       or report follow-up) while their 24-hour window is open, going out as the PAID template instead of its free wording;
     · a free message sent so close to the end of the 24 hours that it lands after the window shuts (the landing margin);
     · "Send only the free ones" sending a paid template because a window shut between the check and the send;
     · the bulk confirm or a single send promising "free" for a send whose shape the server never confirmed (absent = paid);
     · a price written as a number instead of the constant.
   Pure rules, the real template builder, source sweeps. Nothing sends.
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { FREE_WINDOW_MS, freeTextVersionOf, freeWindowOpen, inWindowShape, WINDOW_LANDING_MARGIN_MS, WOULD_BE_PAID_REASON } from '../src/lib/inWindowFreeText.ts';
import { WHATSAPP_SERVICE_WINDOW_MS } from '../src/lib/serviceWindow.ts';
import { applyBulkChecks, type BulkCandidate } from '../src/lib/inboxBulkSend.ts';
import { bulkFreePaidLine, FREE_SEND_LABEL, PAID_SEND_LABEL, PAID_TEMPLATE_COST_WORDS, sendCostFromLastInbound, sendCostOf } from '../src/lib/freeWindowLabels.ts';
import { CHANNEL_COST_GBP } from '../src/lib/channelCosts.ts';
import { freeWindowSwap } from '../supabase/functions/_shared/free-window.ts';
import { claimTemplatePayload, renderTemplateBody, WA_TEMPLATES } from '../supabase/functions/_shared/whatsapp-send.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
const H = 60 * 60 * 1000;
const NOW = Date.parse('2026-11-16T12:00:00Z');

/* ── 1. the window, as WhatsApp keeps it: 24 hours from their last inbound, and the send must LAND inside it ── */
{
  ok(WHATSAPP_SERVICE_WINDOW_MS === 24 * H && FREE_WINDOW_MS === WHATSAPP_SERVICE_WINDOW_MS, 'the window is 24 hours, the same in both leaves');
  ok(WINDOW_LANDING_MARGIN_MS > 0 && WINDOW_LANDING_MARGIN_MS <= 15 * 60_000, 'a small landing margin (minutes, not hours)');
  ok(freeWindowOpen(null, NOW) === false && freeWindowOpen(undefined, NOW) === false && freeWindowOpen(NaN, NOW) === false, 'no inbound (or an unreadable time) → closed');
  ok(freeWindowOpen(NOW - 1 * H, NOW) === true, 'they wrote an hour ago → open');
  ok(freeWindowOpen(NOW - 23 * H, NOW) === true, '23 hours ago → open');
  ok(freeWindowOpen(NOW - 24 * H + WINDOW_LANDING_MARGIN_MS + 60_000, NOW) === true, 'just outside the margin → still open');
  ok(freeWindowOpen(NOW - 24 * H + WINDOW_LANDING_MARGIN_MS - 1, NOW) === false, 'inside the last few minutes → closed (it could land after the window shuts)');
  ok(freeWindowOpen(NOW - 24 * H, NOW) === false && freeWindowOpen(NOW - 30 * H, NOW) === false, '24 hours or more → closed');
  ok(freeWindowOpen(NOW + 2 * H, NOW) === false, 'an inbound "from the future" (clock skew) → closed, never open');
  ok(sendCostFromLastInbound(new Date(NOW - H).toISOString(), NOW) === 'free' && sendCostFromLastInbound(null, NOW) === 'paid'
    && sendCostFromLastInbound(new Date(NOW - 24 * H + 60_000).toISOString(), NOW) === 'paid', 'the screens\' label uses the same rule and margin');
}

/* ── 2. every door converts; freeOnly never pays ── */
{
  const words = freeTextVersionOf({ template: { components: [{ type: 'body', parameters: [] }] } }, 'Hi Acme');
  const shape = (o: Partial<Parameters<typeof inWindowShape>[0]>) => inWindowShape({ origin: 'other', windowOpen: true, allowClosedText: false, typed: false, version: words, ...o });
  for (const origin of ['inbox', 'scheduled', 'other'] as const) {
    ok(shape({ origin }).as === 'text', `${origin}: window open → free text`);
    ok(shape({ origin, windowOpen: false }).as === 'template', `${origin}: window closed → the paid template`);
  }
  const fo = shape({ windowOpen: false, freeOnly: true });
  ok(fo.as === 'refuse' && (fo as { error: string }).error === 'would_be_paid' && (fo as { reason: string }).reason === WOULD_BE_PAID_REASON, 'free only + window closed → refused would_be_paid, never the template');
  ok(shape({ freeOnly: true }).as === 'text', 'free only + window open → free text');
  const noVersion = freeTextVersionOf({ template: { components: [{ type: 'header', parameters: [] }, { type: 'body', parameters: [] }] } }, 'Hi');
  ok(shape({ version: noVersion }).as === 'template', 'window open but no faithful free version → the template (with its reason)');
  ok(shape({ version: noVersion, freeOnly: true }).as === 'refuse', 'free only + no free version → refused, not paid');
  const btn = freeTextVersionOf({ template: { components: [{ type: 'body', parameters: [] }, { type: 'button', sub_type: 'url', parameters: [] }] } }, 'Hi');
  ok(btn.ok === false && (btn as { why: string }).why === 'has_buttons', 'a template with buttons has no free version (a normal message cannot carry them)');
}

/* ── 3. the automatic sends (process-whatsapp-queue), with the REAL builder ── */
{
  const tp = claimTemplatePayload('initial_contact', WA_TEMPLATES.initial_contact.lang, 'Acme Plumbing', '', { town: 'Leeds' });
  const words = renderTemplateBody('initial_contact', 'Acme Plumbing', '', undefined, undefined, undefined, 'Leeds');
  const open = freeWindowSwap(tp, words, NOW - H, NOW);
  ok(!!open && open.messageType === 'text' && (open.payload as { type?: string }).type === 'text'
    && (open.payload as { text?: { body?: string } }).text?.body === words.trim() && open.body === words.trim(), 'window open → a text payload carrying exactly the template\'s rendered words');
  ok(freeWindowSwap(tp, words, NOW - 25 * H, NOW) === null, 'window closed → null (the template goes as built)');
  ok(freeWindowSwap(tp, words, null, NOW) === null, 'no inbound / failed read → null (the template)');
  ok(freeWindowSwap(tp, words, NOW - 24 * H + 60_000, NOW) === null, 'inside the landing margin → null (the template)');
  const vp = claimTemplatePayload('video_template', 'en', 'Acme Plumbing', '', { trade: 'plumber', town: 'Leeds', auditUrl: 'https://findable.live/r/abc123' });
  const vs = freeWindowSwap(vp, 'Hi Acme Plumbing', NOW - H, NOW);
  ok(!!vs && vs.messageType === 'video' && (vs.payload as { video?: { link?: string; caption?: string } }).video?.link === WA_TEMPLATES.video_template.headerVideoUrl
    && (vs.payload as { video?: { caption?: string } }).video?.caption === 'Hi Acme Plumbing', 'a video template in the window → a normal video message, the words as caption');

  const q = read('supabase/functions/process-whatsapp-queue/index.ts');
  ok(/import \{ freeWindowSwap, lastInboundMsFor(?:, tradeForFreeText)? \} from "\.\.\/_shared\/free-window\.ts";/.test(q), 'the queue reads the one shared swap');
  ok((q.match(/freeWindowSwap\(/g) ?? []).length === 3, 'exactly three lanes convert: the automatic audit reply, the report follow-up and (2026-11-16) a queued follow-up');
  ok(/const campaignSwap = isColdOutreachTemplate\(templateName\) \? null : freeWindowSwap\(/.test(q), '…a queued follow-up only — a cold opener is never swapped');
  const ar = q.slice(q.indexOf('const arQa = await qaSendHold('), q.indexOf('/* And the send-audit row.'));
  ok(ar.indexOf('freeWindowSwap(') > 0 && ar.indexOf('freeWindowSwap(') < ar.indexOf('sendViaGraph('), 'audit reply: decided before the Graph POST');
  ok(ar.includes('message_type: arMessageType, template_name: templateName') && ar.includes('payload: arTemplatePayload'), 'audit reply: the row keeps the template name, records the real shape, snapshot from the template payload');
  const hk = q.slice(q.indexOf('let hBody = renderTemplateBody("hook_followup"'), q.indexOf('/* ══ CONTACT FOLLOW-UP LANE'));
  ok(hk.indexOf('freeWindowSwap(') > 0 && hk.includes('const payload = hSwap ? hSwap.payload : hPayload;') && hk.includes('message_type: hMessageType, template_name: "hook_followup"')
    && hk.includes('payload: hPayload })'), 'report follow-up: the same, snapshot from the template payload');
  const sh = read('supabase/functions/_shared/free-window.ts');
  ok(/\.eq\("phone", phone\)\.eq\("direction", "inbound"\)/.test(sh) && /if \(error \|\| !Array\.isArray\(data\) \|\| !data\.length\) return null;/.test(sh) && /catch \{\s*return null;/.test(sh),
    'the window read is the number\'s newest inbound; a failed read is CLOSED (null)');
  ok(/windowOpen: freeWindowOpen\(lastInboundMs, nowMs\), allowClosedText: false, typed: false/.test(sh), 'the automatic sends never send typed words and never treat closed as open');
}

/* ── 4. the sender: every door, the margin, free_only ── */
{
  const s = read('supabase/functions/send-whatsapp-message/index.ts');
  ok(/WOULD_BE_PAID_REASON, freeWindowOpen, type SendOrigin \} from "\.\.\/\.\.\/\.\.\/src\/lib\/inWindowFreeText\.ts";/.test(s), 'the sender reads the landing-margin rule from the one leaf');
  ok(!read('src/lib/serviceWindow.ts').includes('freeWindowOpen'), 'serviceWindow.ts (20 functions import it) is untouched');
  ok(s.includes('const freeWindow = freeWindowOpen(lastInboundAt);'), 'judged from the same newest inbound the sender already reads');
  ok(/inWindowShape\(\{ origin: sendOrigin, windowOpen: freeWindow, .*, freeOnly \}\);/.test(s), 'the conversion uses the margin and carries free_only');
  ok(s.includes('const freeOnly = !sched && body.free_only === true;'), 'free_only is strictly true, and never on a queued run');
  const gate = s.slice(s.indexOf('const gate = await queueGate('), s.indexOf('if (gate) return json('));
  ok(gate.includes('freeOnly && usedTemplate ? async () => ({ ok: false as const, error: "would_be_paid"'), 'free_only outside their send hours → refused, nothing queued (a queued send could go paid later)');
  ok(s.includes('if (env.live && !windowOpen) return json({ ok: false, error: "window_closed" }, 200);'), 'a typed free-text reply keeps its own gate, unchanged');
  /* A later change may bump BUILD_ID again (2026-11-16b polite_hook did): pin this change's own log line, not today's id. */
  ok(s.includes('/* 2026-11-16a: in-window free text from EVERY door') && /const BUILD_ID = "2026-11-1[6-9][a-z]-/.test(s), 'BUILD_ID bumped');
}

/* ── 5. the browser: one request field, the bulk split, the labels ── */
{
  const req = read('src/lib/whatsAppSendRequest.ts');
  ok(req.includes('...(args.freeOnly ? { free_only: true } : {}),'), 'the one send request carries free_only only when asked');

  const c = (key: string): BulkCandidate => ({ key, leadId: key, label: key.toUpperCase(), phone: '447700900' + key.length });
  const plan = applyBulkChecks([c('a'), c('bb'), c('ccc'), c('dddd')], {
    a: { ok: true, free: true }, bb: { ok: true, free: false }, ccc: { ok: true }, dddd: { ok: false, error: 'opted_out' },
  });
  ok(plan.ready.length === 3 && plan.free.map((x) => x.key).join() === 'a' && plan.paid.map((x) => x.key).join() === 'bb,ccc' && plan.refused.length === 1,
    'the split: free only when the server said so; an unconfirmed shape counts as paid; refused stays refused');
  ok(plan.free.every((x) => plan.ready.includes(x)) && plan.paid.every((x) => plan.ready.includes(x)), 'free and paid are both drawn from the checked, ready list');

  ok(PAID_TEMPLATE_COST_WORDS === `about £${CHANNEL_COST_GBP.whatsapp_marketing.toFixed(2)}`, 'the price is the constant (channelCosts.ts), never a number written in the label');
  ok(bulkFreePaidLine(3, 2) === `3 free (window open) · 2 need a paid template (window closed, ${PAID_TEMPLATE_COST_WORDS} each)`, 'the bulk line, both halves');
  ok(bulkFreePaidLine(1, 0) === '1 free (window open)' && bulkFreePaidLine(0, 1) === `1 needs a paid template (window closed, ${PAID_TEMPLATE_COST_WORDS} each)`, 'one half only, singular');
  ok(FREE_SEND_LABEL === 'Free (window open)' && PAID_SEND_LABEL === `Paid template (window closed, ${PAID_TEMPLATE_COST_WORDS})`, 'the single-send labels');
  ok(sendCostOf('text') === 'free' && sendCostOf('template') === 'paid' && sendCostOf(undefined) === 'paid', 'absent is paid');

  const ib = read('src/pages/Inbox.tsx');
  ok(ib.includes("free: res.ok === true && res.sentAs === 'text' };"), 'Inbox bulk: each lead\'s free/paid comes from its own dry run');
  ok(ib.includes('const targets = freeOnly ? bulkChecked.free : bulkChecked.ready;') && ib.includes('...(freeOnly ? { freeOnly: true } : {}),'), 'Send only the free ones sends only those, each free_only');
  ok(ib.includes('onClick={() => void runBulkSend(true)} data-testid="bulk-send-free-only"') && ib.includes('`Send all ${bulkChecked.ready.length}`'), 'the confirm offers both: only the free ones, or all');
  ok(ib.includes('{bulkFreePaidLine(bulkChecked.free.length, bulkChecked.paid.length)}'), 'the confirm shows the split line');
  ok(/const res = await send\(\{\s*phone: target\.phone,/.test(ib), 'the bulk "Send N now" sends through useInbox.send (via inbox), the same server rule');
  ok(ib.includes('data-testid="picker-paid-note"') && ib.includes('{FREE_SEND_LABEL}.'), 'Inbox single send: the same free / paid label');
  const lp = read('src/components/LeadWhatsAppPanel.tsx');
  ok(lp.includes('const sendCost = sendCostFromLastInbound(lastInboundAt);') && lp.includes('data-testid="whatsapp-send-cost"'), 'Outreach popup: the same label, from the thread\'s newest inbound');
}

if (f) process.exit(1);
console.log('\nfree-window-sends: all passed');
