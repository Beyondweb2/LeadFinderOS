/* ============================================================
   IN-WINDOW FREE TEXT (2026-10-31, feat/in-window-free-text).

   ⛔ THE FAILURES THIS SUITE EXISTS FOR:
     · a Meta template sent from the Inbox while the lead's 24-hour window is open (it must go as free text, same wording);
     · a free-text send of a saved template NOT counting as that template (pitch guard, report_sent, snapshot, findings);
     · a template whose words need its video header going out as words that say "the video above" WITHOUT the video
       (2026-10-31b: in the window it goes as a normal video message, the words as its caption);
     · a queued send whose edited words cannot be read back failing with no reason (or the template's wording sent instead);
     · a closed window turning a typed edit into the template's own wording, silently;
     · the bulk cold-opener queue, the lead popup, the dashboard, the welcome pack or Quick Close changing behaviour;
     · a quick reply that disappears when the window is closed instead of saying why.
   Pure rules + source sweeps + the real template builder. Nothing sends.
   ============================================================ */
import fs from 'node:fs';
import path from 'node:path';
import { freeTextVersionOf, inWindowShape, NO_FREE_TEXT_WORDS, QUEUED_WORDS_UNREADABLE_REASON, VIDEO_CAPTION_MAX } from '../src/lib/inWindowFreeText.ts';
import { claimTemplatePayload, WA_TEMPLATES } from '../supabase/functions/_shared/whatsapp-send.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const ROOT = path.resolve(import.meta.dirname, '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');

const bodyOnly = { type: 'template', template: { name: 'audit_followup_call', language: { code: 'en' }, components: [{ type: 'body', parameters: [] }] } };
const withHeader = { type: 'template', template: { name: 'video_template', language: { code: 'en' }, components: [{ type: 'header', parameters: [] }, { type: 'body', parameters: [] }] } };

/* ── 1. the free-text version: a property of the payload and the words, never a list of names ── */
{
  const v = freeTextVersionOf(bodyOnly, '  Hi Acme, quick one.  ');
  ok(v.ok === true && v.text === 'Hi Acme, quick one.', 'a body-only template with real words has a free-text version (trimmed)');
  ok(freeTextVersionOf(withHeader, 'Watch the video above').ok === false
    && (freeTextVersionOf(withHeader, 'x') as { why: string }).why === 'has_header', 'a header with no video link means no free-text version');
  const vh = (link: unknown, extra: unknown[] = []) => ({ type: 'template', template: { name: 'video_template', language: { code: 'en' },
    components: [{ type: 'header', parameters: [{ type: 'video', video: { link } }, ...extra] }, { type: 'body', parameters: [] }] } });
  const v2 = freeTextVersionOf(vh('https://findable.live/media/findable-hook.mp4'), ' Watch the video above ');
  ok(v2.ok === true && v2.text === 'Watch the video above' && v2.videoUrl === 'https://findable.live/media/findable-hook.mp4', 'a video header (a link) → a version: the same video, the words as its caption');
  ok((freeTextVersionOf(vh('http://x.test/a.mp4'), 'Hi') as { why?: string }).why === 'has_header', 'a non-https video link → no version');
  ok((freeTextVersionOf(vh(null), 'Hi') as { why?: string }).why === 'has_header', 'a video header with no link → no version');
  ok((freeTextVersionOf(vh('https://x.test/a.mp4', [{ type: 'text', text: 'x' }]), 'Hi') as { why?: string }).why === 'has_header', 'a header with more than the one video → no version');
  const imageHeader = { type: 'template', template: { components: [{ type: 'header', parameters: [{ type: 'image', image: { link: 'https://x.test/a.png' } }] }] } };
  ok((freeTextVersionOf(imageHeader, 'Hi') as { why?: string }).why === 'has_header', 'any other header (an image) → no version');
  ok((freeTextVersionOf(vh('https://x.test/a.mp4'), 'a'.repeat(VIDEO_CAPTION_MAX + 1)) as { why?: string }).why === 'caption_too_long'
    && freeTextVersionOf(vh('https://x.test/a.mp4'), 'a'.repeat(VIDEO_CAPTION_MAX)).ok === true, 'words longer than a video caption → no version (exactly the limit is fine)');
  ok(freeTextVersionOf(bodyOnly, 'a'.repeat(VIDEO_CAPTION_MAX + 50)).ok === true, 'the caption limit binds only a video (plain text is unchanged)');
  ok((freeTextVersionOf(bodyOnly, '') as { why: string }).why === 'no_wording', 'no words = no version');
  ok((freeTextVersionOf(bodyOnly, null) as { why: string }).why === 'no_wording', 'null words = no version (absent is never a yes)');
  ok((freeTextVersionOf(bodyOnly, '[audit_reply]') as { why: string }).why === 'no_wording'
    && (freeTextVersionOf(bodyOnly, 'audit_reply') as { why: string }).why === 'no_wording', 'a placeholder body ([name] / bare name) = no version');
  ok((freeTextVersionOf(bodyOnly, 'Beating {{competitors}} today') as { why: string }).why === 'unfilled_marker', 'a {{marker}} left = no version');
  ok(freeTextVersionOf(null, 'Hi').ok === true, 'a payload with no components (none to carry) does not block real words');
  ok(Object.values(NO_FREE_TEXT_WORDS).every((w) => w.length > 10), 'every reason has words for the person');
}

/* ── 2. how a template send goes: origin × window × typed ── */
{
  const yes = freeTextVersionOf(bodyOnly, 'Hi Acme');
  const no = freeTextVersionOf(withHeader, 'Watch the video above');
  const shape = (o: Partial<Parameters<typeof inWindowShape>[0]>) => inWindowShape({ origin: 'inbox', windowOpen: true, allowClosedText: false, typed: false, version: yes, ...o });

  ok(shape({}).as === 'text' && (shape({}) as { text: string }).text === 'Hi Acme', 'Inbox + window open → free text of the same words');
  ok(shape({ origin: 'scheduled' }).as === 'text', 'a queued Inbox send that runs with the window open → free text');
  ok(shape({ origin: 'scheduled', windowOpen: false }).as === 'template', 'a queued send that runs with the window closed → the template (never refused)');
  ok(shape({ windowOpen: false }).as === 'template', 'Inbox template button with the window closed → the template, as before');
  const closedTyped = shape({ windowOpen: false, typed: true });
  ok(closedTyped.as === 'refuse' && (closedTyped as { error: string }).error === 'window_closed', 'typed words with the window closed (live) → refused, never silently swapped for the template');
  ok(shape({ windowOpen: false, typed: true, allowClosedText: true }).as === 'text', 'test mode: typed words go as (simulated) text, as any free text does there');
  ok(shape({ windowOpen: false, allowClosedText: true }).as === 'template', 'test mode never turns an untyped closed-window template into text (QA keeps exercising templates)');
  const vid = shape({ version: no });
  ok(vid.as === 'template' && /header/.test((vid as { noFreeText: string }).noFreeText), 'window open but a header with no faithful version → the template, with the reason');
  const withVideo = freeTextVersionOf({ template: { components: [{ type: 'header', parameters: [{ type: 'video', video: { link: 'https://x.test/v.mp4' } }] }] } }, 'Hi Acme');
  const sv = shape({ version: withVideo });
  ok(sv.as === 'text' && (sv as { videoUrl?: string }).videoUrl === 'https://x.test/v.mp4', 'window open + a video template → free-form, carrying the video');
  ok(shape({ version: withVideo, typed: true }).as === 'text', 'the composer\'s edited words for a video template → free-form with the video');
  ok(shape({ version: withVideo, origin: 'scheduled', windowOpen: false }).as === 'template', 'a queued video template run with the window closed → the template');
  ok(shape({ version: withVideo, origin: 'other' }).as === 'template', 'every other door still sends the video template as the template');
  const vidTyped = shape({ version: no, typed: true });
  ok(vidTyped.as === 'refuse' && (vidTyped as { error: string }).error === 'no_free_text_version', 'typed words for a template with no free-text version → refused with the reason');
  for (const open of [true, false]) for (const typed of [true, false]) {
    ok(shape({ origin: 'other', windowOpen: open, typed }).as === 'template', `any other door (bulk queue, lead popup, dashboard, welcome pack, Quick Close) → the template (open=${open}, typed=${typed})`);
  }
}

/* ── 3. the real builder: every video-header template, as really built, goes in-window as its own video + words ── */
{
  const video = Object.entries(WA_TEMPLATES).filter(([, e]) => !!e.headerVideoUrl).map(([n]) => n).sort();
  ok(video.length >= 1 && video.includes('video_template'), `the registry's video templates: ${video.join(', ')}`);
  const vp = claimTemplatePayload('video_template', 'en', 'Acme Plumbing', '', { trade: 'plumber', town: 'Leeds', auditUrl: 'https://findable.live/r/abc123' });
  const vv = freeTextVersionOf(vp, 'Hi Acme Plumbing');
  ok(vv.ok === true && vv.videoUrl === WA_TEMPLATES.video_template.headerVideoUrl, 'video_template as really built → its own header video, the words as caption');
  for (const n of ['competitor_hook', 'explain_offer', 'explain_offer_v2']) {
    ok(WA_TEMPLATES[n]?.headerVideoUrl === WA_TEMPLATES.video_template.headerVideoUrl, `${n} carries the same video header (a link)`);
  }
  const cp = claimTemplatePayload('initial_contact', WA_TEMPLATES.initial_contact.lang, 'Acme Plumbing', '', { town: 'Leeds' });
  ok(freeTextVersionOf(cp, 'Hi, is this Acme Plumbing?').ok === true, 'a body-only template as really built → has a free-text version');
}

/* ── 4. the sender: one conversion, after the whole template build, before the queue and the dry run ── */
{
  const s = read('supabase/functions/send-whatsapp-message/index.ts');
  ok(/import \{[^}]*inWindowShape[^}]*\} from "\.\.\/\.\.\/\.\.\/src\/lib\/inWindowFreeText\.ts"/.test(s), 'the sender reads the one rule (relative .ts import)');
  ok((s.match(/inWindowShape\(/g) ?? []).length === 1, 'the conversion is decided in exactly one place');
  const conv = s.indexOf('inWindowShape(');
  const builtAt = s.lastIndexOf('usedTemplate = templateName;', conv);
  ok(builtAt > 0 && conv > builtAt, 'it runs after the template is fully built (every guard and resolver first)');
  ok(conv < s.indexOf('await queueGate(') && conv < s.indexOf('if (dryRun) {'), 'and before the send-hours queue and the dry-run answer');
  ok(/sendOrigin: SendOrigin = sched \? "scheduled" : body\.via === "inbox" \? "inbox" : "other"/.test(s), 'only the Inbox and a queued send that is now running convert; every other door is "other"');
  ok(/typedFreeText = !sched && sendOrigin === "inbox" && body\.as_free_text === true/.test(s), 'as_free_text is honoured only for a direct Inbox send');
  ok(/body\.body = r\.body \?\? "";/.test(s), 'a queued template row carries its stored words to the sender');
  ok(/kind: usedTemplate \? "template" : "text"/.test(s), 'a template send that would go as text is queued AS the template (judged again when it runs)');
  ok(/template_name: usedTemplate,/.test(s), 'the row keeps template_name, so pitchEverSent and the once-per-lead guards see a free-text send');
  ok(/usedTemplate \? \{ template_snapshot: createTemplateSnapshot\(\{[^}]*payload: templatePayload \?\? payload/.test(s), 'the snapshot is saved for the free-text send too, from the template payload');
  ok(/findingsShown\?\.length && findingsText && !shape\.text\.includes\(findingsText\.trim\(\)\)\) findingsShown = null/.test(s), 'findings_shown stays only while the sent words still carry the findings');
  ok(/const tvars = usedTemplate \? \(WA_TEMPLATES\[usedTemplate\]\?\.vars \?\? \[\]\) : \[\];/.test(s), 'report_sent still keys on the template it was, whatever shape went');
  ok(/const BUILD_ID = "2026-10-31b-in-window-video"/.test(s), 'BUILD_ID bumped (x-swm-build proves the deploy)');
  ok(s.includes('payload = shape.videoUrl ? videoPayload(shape.videoUrl, shape.text) : textPayload(shape.text);')
    && s.includes('messageType = shape.videoUrl ? "video" : "text";'), 'a video template in the window goes as a normal video message, recorded as message_type video');
  const w = read('supabase/functions/_shared/whatsapp-send.ts');
  ok(/export function videoPayload\(link: string, caption: string\) \{\s*return \{ type: "video", video: \{ link, caption \} \};/.test(w), 'videoPayload is Meta\'s media-by-link shape with the caption');
}

/* ── 4b. a queued send whose words cannot be read back (needs_from_you) ── */
{
  const s = read('supabase/functions/send-whatsapp-message/index.ts');
  const d = s.slice(s.indexOf('let queuedWordsOnly = false;'), s.indexOf('auditClaimUrl = "";', s.indexOf('let queuedWordsOnly = false;')));
  ok(d.length > 0 && d.includes('if (!(sched && text)) return json({ ok: false, error: "unsafe_template_var"'), 'a direct send with no item is refused exactly as before');
  ok(d.includes('if (!windowOpen) return json({ ok: false, error: "queued_words_unreadable", reason: QUEUED_WORDS_UNREADABLE_REASON }, 200);'), 'queued + window closed → refused WITH the reason (the drain stores it, the Inbox shows "Not sent — …")');
  ok(d.includes('payload = textPayload(text);') && d.includes('storedBody = text;'), 'queued + window open → the person\'s own words, as a normal message');
  ok(QUEUED_WORDS_UNREADABLE_REASON.length > 60 && /Nothing was sent/.test(QUEUED_WORDS_UNREADABLE_REASON), 'the reason says plainly that nothing went');
  const drain = read('supabase/functions/_shared/inbox-scheduled-drain.ts');
  ok(/const words = said\(body\.reason\)/.test(drain), 'the drain keeps the sender\'s reason words on the failed row');
  ok(read('src/lib/inboxSendWindow.ts').includes("if (r.status === 'failed') return `Not sent — ${r.error || 'no reason was recorded'}`;"), 'the Inbox shows a failed queued row with its reason');
}

/* ── 5. the doors that must NOT change ── */
{
  for (const p of ['supabase/functions/process-whatsapp-queue/index.ts', 'src/components/LeadWhatsAppPanel.tsx', 'src/components/admin/NeedsMeList.tsx']) {
    const t = read(p);
    ok(!t.includes('inWindowFreeText') && !t.includes('as_free_text') && !t.includes('asFreeText'), `${p} is untouched by the conversion`);
  }
  const req = read('src/lib/whatsAppSendRequest.ts');
  ok(/\.\.\.\(args\.asFreeText \? \{ as_free_text: true \} : \{\}\)/.test(req), 'the one send request carries as_free_text only when asked');
}

/* ── 6. the Inbox: fill the composer, carry the marker, quick reply Send now ── */
{
  const s = read('src/pages/Inbox.tsx');
  ok(s.includes("const inWindowWa = !sms && win.open;"), 'in-window is WhatsApp only (a text has no 24-hour window)');
  ok(/\{inWindowWa && \(\s*<Button onClick=\{\(\) => void fillComposerFromTemplate\(\)\}/.test(s), 'window open: the picker offers "Put in message box"');
  ok(/\{\(!inWindowWa \|\| templateGoesAsTemplate\) && \(\s*<Button onClick=\{\(\) => doSend\(true\)\}/.test(s), 'the template button shows in the window ONLY when the sender says it has no free-text version');
  const fill = s.slice(s.indexOf('const fillComposerFromTemplate'), s.indexOf('// Approved WhatsApp-template picker'));
  ok(fill.includes('await preview(') && fill.includes("r.sentAs !== 'text'") && fill.includes('unresolvedTokens(words)') && fill.includes('insertWarmDraft(target.key, words)'),
    'the words come from the sender\'s own dry run, blanks refuse, and they land in the conversation they were asked for');
  ok(!fill.includes('doSend('), 'filling never sends');
  ok(s.includes("onSend={(bodyText) => doSend(false, bodyText, { marker: freeTextOf })}"), 'the composer\'s Send carries the marker');
  const ds = s.slice(s.indexOf('const doSend = async'), s.indexOf('const quickReplyMenu'));
  ok(/const marker = !useTemplate && !sms && active\.leadId && opts\.marker\?\.key === sendKey \? opts\.marker : null;/.test(ds), 'the marker counts only for its own conversation, on WhatsApp, with a lead');
  ok(ds.includes('unresolvedTokens(body)') && ds.indexOf('unresolvedTokens(body)') < ds.indexOf('await send('), 'a message with a blank left is refused before anything is sent');
  const qr = s.slice(s.indexOf('const quickReplyMenu'), s.indexOf('/* ══ THE INBOX FILLS THE SCREEN'));
  ok(qr.includes('doSend(false, fillQuickReply(t.content), { keepDraft: true })'), 'quick reply Send now = the same doSend, keeping the half-typed draft');
  ok(!qr.includes('marker'), 'a quick reply never carries a template marker (saved replies are unchanged)');
  ok(qr.includes('disabled={!windowOpen || sending}') && qr.includes('{NO_REPLY_24H}') && s.includes("const NO_REPLY_24H = 'They haven’t replied in 24 hours';"), 'window closed: Send now is shown disabled with the reason');
  ok(s.includes('{quickReplyMenu(false)}') && s.includes('{quickReplyMenu(true)}'), 'the quick reply menu shows in both window states');
}

/* ── 7. the cost notes say what Meta charges from 1 Oct 2026 ── */
{
  const c = read('src/lib/channelCosts.ts');
  ok(/1,000 a month PER NUMBER/.test(c) && /UTILITY TEMPLATE sent inside the window is now charged/.test(c) && /UNCONFIRMED/.test(c), 'channelCosts.ts notes: 1,000 free a month per number, utility in the window now charged, UK figure unconfirmed');
  ok(/whatsapp_service: 0,/.test(c), 'no figure changed (notes only; no usage counter)');
  ok(/1,000 a month per\s+number/.test(read('src/lib/contactRouting.ts')), 'contactRouting.ts carries the same note');
}

if (f) process.exit(1);
console.log('\nin-window-free-text: all passed');
