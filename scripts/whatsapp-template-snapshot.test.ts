import assert from 'node:assert/strict';
import { createTemplateSnapshot, parseTemplateSnapshot, type WhatsAppTemplateSnapshot } from '../src/lib/whatsappTemplateSnapshot.ts';

const payload = (components: unknown[]) => ({ type: 'template', template: { name: 'audit_followup_fault', language: { code: 'en' }, components } });
const body = 'Hi MCLocksmiths,\n\nHere\'s the main thing holding you back.\n\nYour service pages do not clearly tell AI which areas you cover.';
const bodyParameters = [{ type: 'text', text: 'a locksmith' }, { type: 'text', text: 'Canterbury' }, { type: 'text', text: 'Your service pages do not clearly tell AI which areas you cover.' }];

const plain = createTemplateSnapshot({ templateName: 'audit_followup_fault', language: 'en', body, payload: payload([{ type: 'body', parameters: bodyParameters }]) });
assert.equal(plain.body, body);
assert.deepEqual(plain.resolved_parameters, bodyParameters.map((p) => p.text));
assert.equal(plain.header, undefined);

for (const [type, parameter, expected] of [
  ['text', { type: 'text', text: 'Your audit' }, { type: 'text', text: 'Your audit' }],
  ['image', { type: 'image', image: { link: 'https://findable.live/media/header.jpg' } }, { type: 'image', media_url: 'https://findable.live/media/header.jpg' }],
  ['video', { type: 'video', video: { link: 'https://findable.live/media/header.mp4' } }, { type: 'video', media_url: 'https://findable.live/media/header.mp4' }],
  ['document', { type: 'document', document: { link: 'https://findable.live/report.pdf', filename: 'Report.pdf' } }, { type: 'document', media_url: 'https://findable.live/report.pdf', filename: 'Report.pdf' }],
] as const) {
  const snapshot = createTemplateSnapshot({ templateName: 'example', language: 'en_GB', body: 'Body', payload: payload([{ type: 'header', parameters: [parameter] }, { type: 'body', parameters: [] }]), footer: 'Footer', buttons: [{ type: 'quick_reply', text: 'Reply' }, { type: 'url', text: 'Open', url: 'https://findable.live/r/x' }, { type: 'phone', text: 'Call', phone: '+441234' }] });
  assert.deepEqual(snapshot.header, expected, `${type} header`);
  assert.equal(snapshot.footer, 'Footer');
  assert.equal(snapshot.buttons?.length, 3);
}

const noWebsite = 'You don\'t currently have a website, which means Google and other AI tools have very little first-party information to use when deciding whether to recommend your business.';
const cleanFallback = 'Right now, AI has stronger reasons to recommend other local businesses ahead of you.';
for (const siteFault of [noWebsite, cleanFallback, 'Your service pages do not clearly tell AI which areas you cover.']) {
  const snapshot = createTemplateSnapshot({ templateName: 'audit_followup_fault', language: 'en', body: `Fault: ${siteFault}`, payload: payload([{ type: 'body', parameters: [{ type: 'text', text: siteFault }] }]) });
  assert.equal(snapshot.resolved_parameters[0], siteFault);
  assert.match(snapshot.body, new RegExp(siteFault.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
}

assert.equal(parseTemplateSnapshot(null), null, 'historical null snapshot falls back');
assert.equal(parseTemplateSnapshot({ version: 1, template_name: 'x', language: 'en', body: '   ' }), null, 'blank body is not a usable snapshot');
const stored = JSON.parse(JSON.stringify(plain)) as WhatsAppTemplateSnapshot;
const laterDefinitionChanged = { ...stored, body: stored.body };
assert.deepEqual(parseTemplateSnapshot(laterDefinitionChanged), stored, 'stored snapshot is independent of future template definitions');

console.log('whatsapp-template-snapshot: all assertions passed');
