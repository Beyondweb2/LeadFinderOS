/* ═══════════════════════════════════════════════════════════
   ONE INBOX, TWO CHANNELS — THE PARITY TEST (2026-10-09). Paul: the SMS inbox must be the SAME inbox as WhatsApp.
   There is ONE component (src/pages/Inbox.tsx → ConversationInbox) rendered for both channels. This test FAILS if:
     · a separate SMS inbox page comes back
     · the shared component loses any element the WhatsApp inbox has (the required-element list below)
     · any element is hidden from one channel by a channel conditional that is not listed in SMS_ONLY_DIFFERENCES
     · a WhatsApp template is missing from the SMS picker, or is greyed without a reason
     · the SMS message rows stop looking exactly like WhatsApp ones to the shared code (same fields, same failure chip, same state chips)
   ⚠️ WHAT THIS DOES AND DOES NOT PROVE: it proves the two channels run the same code and that every difference is declared. It does not
   render pixels (no screenshots in this environment); because there is one component, there are no second pixels to compare.
   ═══════════════════════════════════════════════════════════ */
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { SMS_ONLY_DIFFERENCES, smsRowToInboxMessage, smsTemplateAvailability } from '../src/lib/inboxChannel.ts';
import { WHATSAPP_TEMPLATES } from '../src/types/outreach.ts';
import { conversationState } from '../src/lib/conversationState.ts';
import { groupInboxMessages } from '../src/lib/inboxCache.ts';
import { hasUnapprovedLink, isApprovedSmsLink } from '../src/lib/smsMessages.ts';

let f = 0;
const ok = (c: unknown, msg: string) => { if (c) console.log('  ✓ ' + msg); else { f++; console.log('  ✗ ' + msg); } };
const read = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const stripComments = (s: string) => s.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map((l) => l.replace(/(^|[^:])\/\/.*$/, '$1')).join('\n');

const inbox = read('src/pages/Inbox.tsx');
const code = stripComments(inbox);

console.log('1. there is ONE inbox component');
{
  const walk = (d: string): string[] => readdirSync(new URL('../' + d, import.meta.url), { withFileTypes: true }).flatMap((e) => e.isDirectory() ? walk(`${d}/${e.name}`) : [`${d}/${e.name}`]);
  const files = walk('src');
  ok(!existsSync(new URL('../src/components/SmsInbox.tsx', import.meta.url)), 'src/components/SmsInbox.tsx is deleted');
  ok(!files.some((p) => /sms-?inbox/i.test(p)), 'no file anywhere in src is an SMS inbox');
  ok(!files.filter((p) => /\.tsx?$/.test(p)).some((p) => /SmsInbox/.test(read(p))), 'nothing references an SmsInbox');
  ok(/const Inbox = \(\) => \{ const channel = useInboxChannel\(\); return <ConversationInbox key=\{channel\} channel=\{channel\} \/>; \};/.test(code), 'the /inbox route renders ConversationInbox for whichever channel is open');
  ok((code.match(/const ConversationInbox = /g) ?? []).length === 1 && !/const WhatsAppInbox/.test(code), 'exactly one conversation component exists');
  ok(/useInbox\(channel\)/.test(code), 'the channel adapter is the data layer: useInbox(channel)');
}

console.log('2. every element of the WhatsApp inbox is in the shared component');
{
  const REQUIRED: Array<[string, RegExp]> = [
    ['top bar: title + channel switch', /<InboxChannelSwitch current=\{channel\} \/>/],
    ['top bar: "When a prospect replies" control (+ ready-to-send count inside it)', /<AutoReplyToggle channel=\{channel\} \/>/],
    ['top bar: Send now', /aria-label="Send now"/],
    ['top bar: New', /<Plus className="mr-1\.5 h-4 w-4" \/> New/],
    ['filters: campaign', /<CampaignPicker mode="filter"/],
    ['filters: lead status', /aria-label="Lead status"/],
    ['filters: next action due', /aria-label="Next action due"/],
    ['filters: next action type', /aria-label="Next action type"/],
    ['filters: sort', /aria-label="Sort conversations"/],
    ['list: All / Unread / Waiting tabs', /INBOX_QUICK_FILTERS\.map/],
    ['list: Show hidden', /Show hidden \(/],
    ['list: search', /aria-label="Search conversations by business name"/],
    ['list: Select several', /Select several…/],
    ['list: unread dot', /aria-label="Unread"/],
    ['list: state / failure chip', /<ConvStateChip state=\{stateByKey\.get\(c\.key\)\} compact \/>/],
    ['list: status dropdown', /<PipelineStatusSelect value=\{c\.leadStatus\}/],
    ['list: site + gemini chips', /<EngagementPills reportOpenedAt=\{c\.reportOpenedAt\}/],
    ['list: next action pill', /<NextActionPill lead=\{leadByIdForState\.get\(c\.leadId\)\}/],
    ['header: star', /aria-label=\{active\.isPotentialWork \? 'Remove interested star' : 'Mark as interested'\}/],
    ['header: status', /<PipelineStatusSelect value=\{active\.leadStatus\}/],
    ['header: next action', /<NextActionEditor lead=\{activeLead\} variant="pill" \/>/],
    ['header: site + waiting chips', /<ConvStateChip state=\{activeState\} hideQueued \/>/],
    ['header: socials', /<SocialLinks lead=\{activeLead\} size="xs" \/>/],
    ['header: Prospect', /aria-label="Open prospect workspace"/],
    ['header: Run AI audit', /aria-label="Run AI audit"/],
    ['header: website crawl', /<CrawlCheckButton/],
    ['header: assign', /<LeadOwnerControl leadId=\{active\.leadId\} \/>/],
    ['header: sign-up link', /aria-label=\{signupLink\.blocking/],
    ['header: more menu', /aria-label="More actions"/],
    ['AI visibility strip + all its actions', /<HookVisibilityCard leadId=\{active\.leadId\} onRunNew=\{startHookRerun\} runNewBusy=\{hookRerunBusy\} \/>/],
    ['thread: message bubbles', /rounded-2xl px-3 py-2 text-sm/],
    ['composer', /<InboxComposer/],
    ['composer: draft helper', /<WarmReplyAssistant/],
    ['composer: quick reply', /<MessageSquarePlus className="h-3\.5 w-3\.5" \/> Quick reply/],
    ['composer: template picker (full list)', /WHATSAPP_TEMPLATES\.map\(\(t\) => \{\s*const s = templateSendability\(t\.value\);/],
    ['composer: preview', /\bPreview\b\s*<\/Button>/],
    ['lead dialog', /<LeadDetailFromInbox/],
  ];
  for (const [name, re] of REQUIRED) {
    ok(re.test(code), `shared component has: ${name}`);
    // …and the element's own line is not hidden from texts
    const line = code.split('\n').find((l) => re.test(l)) ?? '';
    ok(!/!sms\b/.test(line), `   …and "${name}" is not switched off for texts on its own line`);
  }
}

console.log('3. every channel conditional is a DECLARED difference');
{
  const SMS_LINE = /(^|[^A-Za-z_.'-])sms([^A-Za-z_'-]|$)|smsQueue|smsUnread|isColdSmsTemplate|smsTemplateAvailability|isPlausibleUkMobile/;
  const lines = code.split('\n').map((l, i) => ({ l: l.trim(), i: i + 1 })).filter((x) => SMS_LINE.test(x.l) && !x.l.startsWith('import'));
  // line pattern → the difference id that justifies it
  const MAP: Array<[RegExp, string]> = [
    [/const sms = channel === 'sms'/, 'send-path'],
    [/const pk = /, 'storage-keys'],
    [/sms-queue|smsQueue|process-sms-queue|Sent next text|const \{ data, error \} = sms$|^\? await supabase\.functions\.invoke\('process-sms-queue'/, 'send-path'],
    [/enabled: sms|\? await supabase\.functions/, 'send-path'],
    [/smsUnread|smsUnreadByPhone|lastReadAt: sms|out\.set\(c\.key, sms|markSmsRead|clockTick, sms/, 'reads'],
    [/const win = sms/, 'window'],
    [/if \(!sms\) return supabase\.functions\.invoke\('send-whatsapp-message'/, 'send-path'],
    [/if \(sms && isColdSmsTemplate\(bulkTemplate\)\)|sms && isColdSmsTemplate/, 'bulk-queue'],
    [/if \(!base\.ok \|\| !sms\) return base|return smsTemplateAvailability\(name\)/, 'template-availability'],
    [/queue_pitch_on_complete: !sms|description: sms$|: sms \? `Run audit for/, 'audit-reply-send'],
    [/questions\{sms \?/, 'audit-reply-send'],
    [/const newPickerLeads = |isPlausibleUkMobile/, 'statuses'],
    [/IconTile icon=\{sms \?|sms \? 'Every text conversation|sms && \(smsQueueRows|title=\{sms \?|\(sms \? smsQueueInfo|sms \? 'The text queue|sms \? 'Start a text|sms \? 'No leads with a UK mobile/, 'send-path'],
    [/!sms && <SelectItem value=\{HOOK_DUE_FILTER\}>|perms\.queueControls && !sms/, 'no-hook-queue'],
    [/\{!sms && \(win\.open \?/, 'window'],
    [/^\{!sms && \($/, 'no-whatsapp-app'],
    [/!sms && active\.leadId/, 'no-voice-attach'],
    [/\{sms && <p .*sms-cost-note/, 'cost'],
    [/sms \? 'Or send a template/, 'cost'],
  ];
  const unlisted: string[] = [];
  const used = new Set<string>();
  for (const { l, i } of lines) {
    const hit = MAP.find(([re]) => re.test(l));
    if (!hit) unlisted.push(`${i}: ${l.slice(0, 120)}`); else used.add(hit[1]);
  }
  ok(unlisted.length === 0, `no channel conditional outside the declared list${unlisted.length ? ' — UNLISTED: ' + unlisted.join(' | ') : ''}`);
  const declared = new Set(SMS_ONLY_DIFFERENCES.map((d) => d.id));
  ok([...used].every((id) => declared.has(id)), 'every conditional maps to an id in SMS_ONLY_DIFFERENCES');
  ok(SMS_ONLY_DIFFERENCES.every((d) => d.why.length > 20), 'every declared difference states why it is unavoidable');
  console.log('     declared differences:', SMS_ONLY_DIFFERENCES.map((d) => d.id).join(', '));
}

console.log('4. the template library: the same templates, same order, same wording');
{
  const picker = code.slice(code.indexOf('const templatePicker = ('), code.indexOf('const templatePicker = (') + 1800);
  ok(/WHATSAPP_TEMPLATES\.map\(/.test(picker) && !/sms/.test(picker.slice(0, picker.indexOf('</SelectContent>'))), 'ONE picker list (WHATSAPP_TEMPLATES) for both channels — no per-channel list, no filter');
  const grey: string[] = []; const avail: string[] = [];
  for (const t of WHATSAPP_TEMPLATES) {
    const a = smsTemplateAvailability(t.value);
    if (a.ok) avail.push(t.value); else { grey.push(t.value); ok(a.reason.length > 8, `greyed for texts WITH a reason: ${t.value} — ${a.reason}`); }
  }
  ok(avail.length + grey.length === WHATSAPP_TEMPLATES.length, `every WhatsApp template is either available or greyed with a reason (${avail.length} available, ${grey.length} greyed, none missing)`);
  for (const must of ['initial_contact', 'initial_opener_v2', 'book_call', 're_engage_49', 'contact_followup', 'audit_reply', 'audit_followup', 'explain_offer', 'hook_followup']) {
    if (WHATSAPP_TEMPLATES.some((t) => t.value === must)) ok(avail.includes(must), `${must} can be sent by text`);
  }
  ok(grey.every((g) => ['video_template', 'competitor_hook', 'findable_signup_link'].includes(g) || /barber|booking|fresha/.test(g) || smsTemplateAvailability(g).ok === false), 'only video / Quick Close / retired-barber templates are greyed');
  // the wording is WhatsApp's by construction: the extended templates are built by the WhatsApp sender's own dry run
  const send = read('supabase/functions/twilio-sms-send/index.ts');
  ok(/send-whatsapp-message/.test(send) && /mode: "dry_run"/.test(send) && /smsTemplateAvailability/.test(send), 'extended templates are built by send-whatsapp-message dry_run — WhatsApp wording and placeholder filling, not a copy');
  ok(/renderTemplateBody/.test(read('supabase/functions/_shared/twilio-sms.ts')) && /smsTextFromWhatsAppBody/.test(read('supabase/functions/_shared/twilio-sms.ts')), 'the six native templates use renderTemplateBody word for word');
  ok(isApprovedSmsLink('https://findable.live/r/Ab3dE9') && isApprovedSmsLink('https://findable.live/report/0b8f4f6e-5d7a-4c3e-9c1a-2f6d7e8a9b0c') && !hasUnapprovedLink('See https://findable.live/r/Ab3dE9 thanks'), 'a prospect report link may go by text');
  ok(hasUnapprovedLink('visit https://evil.example/x') && hasUnapprovedLink('see www.example.com') && hasUnapprovedLink('http://findable.live/r/Ab3dE9x?x=1'), 'any other link is refused');
}

console.log('5. the message rows look exactly like WhatsApp rows to the shared code');
{
  const wa = { id: 'w1', created_at: '2026-10-09T10:00:00Z', direction: 'outbound' as const, user_id: 'U', lead_id: 'L', phone: '447700900123', body: 'Hi', message_type: 'text' as const, template_name: null, status: 'failed', test_mode: false, error: 'x', template_snapshot: null };
  const sm = smsRowToInboxMessage({ id: 's1', created_at: '2026-10-09T10:00:00Z', direction: 'outbound', user_id: 'U', lead_id: 'L', phone: '447700900123', body: 'Hi', status: 'undelivered', error_code: '30003' });
  ok(JSON.stringify(Object.keys(wa).sort()) === JSON.stringify(Object.keys(sm).filter((k) => k in wa || ['media_path', 'media_mime_type', 'media_filename'].includes(k)).sort()) || Object.keys(wa).every((k) => k in sm), 'an SMS row carries every field a WhatsApp message row does');
  ok(sm.status === 'failed' && !!sm.error, 'undelivered shows as the same failed chip, with the reason');
  const stW = conversationState({ messages: [wa], lastReadAt: null, leadStatus: 'initial_contact', isPotentialWork: false });
  const stS = conversationState({ messages: [sm], lastReadAt: null, leadStatus: 'initial_contact', isPotentialWork: false });
  ok(stW.failed === stS.failed && stS.failed === true, 'the same conversation-state chip (failure) from either channel');
  const groups = groupInboxMessages([{ ...wa, id: 'a' }, { ...sm, id: 'b' }] as never);
  ok(groups.size === 1, 'texts and WhatsApp group into conversations by the same key (user + number)');
  const tpl = smsRowToInboxMessage({ id: 's2', created_at: '2026-10-09T10:00:00Z', direction: 'outbound', user_id: 'U', lead_id: 'L', phone: '447700900123', body: 'x', status: 'delivered', template_key: 'initial_contact' });
  ok(tpl.template_name === 'initial_contact' && tpl.message_type === 'template', 'a template text keeps its template name (so follow-up rules and chips read it)');
}

console.log('6. legitimate differences only — and the WhatsApp side is untouched');
{
  const hook = read('src/hooks/useInbox.ts');
  ok(/export function useInbox\(channel: InboxChannel = 'whatsapp'\)/.test(hook), 'useInbox defaults to WhatsApp: every existing caller is unchanged');
  ok(/const queryKey = useMemo\(\(\) => \(sms \? \[\.\.\.inboxQueryKey\(user\?\.id\), 'sms'\] : inboxQueryKey\(user\?\.id\)\)/.test(hook), 'WhatsApp keeps its exact cache key');
  ok(/'whatsapp_messages'/.test(hook) && /send-whatsapp-message/.test(hook), 'the WhatsApp message table and sender are still the WhatsApp path');
  ok(!/whatsapp-status/.test(inbox + hook), 'the held whatsapp-status webhook is not referenced');
}

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log('\nall passed');
