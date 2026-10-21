/* THE OUTREACH WHATSAPP DIALOG (2026-10-11) — the twin of the Text dialog.
   Pins Paul's three promises: (1) the WhatsApp button opens the dialog and keeps everything else it did (No-WhatsApp toast,
   the contact gate, the Contact Method pill); (2) a send goes through the ONE request the Inbox uses — no second sending path,
   no write of its own (status, Next Action, queue); (3) the dialog has the parts the Text one has. */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { readableTemplateBody } from '../src/lib/templateBodies';
import { WHATSAPP_TEMPLATES } from '../src/types/outreach';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (p: string) => fs.readFileSync(path.join(ROOT, p), 'utf8').replace(/\r\n/g, '\n');
let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
// Code only — comments may name things the code must not do.
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');

const table = read('src/components/OutreachTable.tsx');
const panel = read('src/components/LeadWhatsAppPanel.tsx');
const dialog = read('src/components/LeadWhatsAppDialog.tsx');
const req = read('src/lib/whatsAppSendRequest.ts');
const inbox = read('src/hooks/useInbox.ts');

console.log('── 1. the button ──');
{
  const i = table.indexOf('const handleWhatsAppClick = useCallback(');
  const body = table.slice(i, table.indexOf('}, [', i));
  ok(i > 0, 'handleWhatsAppClick exists');
  ok(/lead\.whatsapp_status === 'no'[\s\S]*?not on WhatsApp\. Try a call\.[\s\S]*?return;/.test(body), 'a "not on WhatsApp" lead still gets the Try-a-call note and nothing opens');
  ok(/if \(onContactGated && !onContactGated\('whatsapp', lead\.id\)\) return;/.test(body), 'the contact gate still runs first');
  ok(/onContactMethodChange\(lead\.id, 'whatsapp' as ContactMethod\)/.test(body), 'the Contact Method pill is set exactly as before');
  ok(/setWaDialogLead\(lead\);/.test(body) && !/navigate\(/.test(code(body)), 'it opens the dialog instead of jumping to the Inbox');
  ok(!/executeContact|leadRpc|invoke|supabase|updateLead/.test(code(body)), 'the click itself still records no contact and sends nothing');
  ok(/<LeadWhatsAppDialog open=\{!!waDialogLead\}/.test(table), 'the dialog is mounted on the table');
}

console.log('── 2. one send path ──');
{
  ok((req.match(/functions\.invoke\('send-whatsapp-message'/g) ?? []).length === 1, 'whatsAppSendRequest makes the one send-whatsapp-message call');
  ok(/phone: args\.phone,\s*lead_id: args\.leadId,\s*country: args\.country \?\? null,\s*body: args\.body,\s*template_name: args\.templateName,\s*allow_resend: args\.allowResend === true,/.test(req), 'with exactly the body the Inbox has always sent');
  /* 2026-10-21: the Inbox adds via:'inbox' (its send window — src/lib/inboxSendWindow.ts); the rest of the body is the same request. */
  ok(/await sendWhatsAppRequest\(sb, \{ \.\.\.args, via: 'inbox' \}\)/.test(inbox), 'the Inbox sends through it');
  const inboxSendBlock = inbox.slice(inbox.indexOf('const send = useCallback('), inbox.indexOf('const sendVoice = useCallback('));
  ok(!/'send-whatsapp-message'/.test(code(inboxSendBlock)), '…and no longer has its own copy of the request');
  const c = code(panel);
  ok(/sendWhatsAppRequest\(sb, \{ phone, leadId: lead\.id, country: lead\.country \?\? null, templateName: tpl, allowResend: alreadySent, via: 'lead_panel' \}\)/.test(c), 'the dialog sends a template through it (repeat override as the Inbox does)');
  ok(/sendWhatsAppRequest\(sb, \{ phone, leadId: lead\.id, country: lead\.country \?\? null, body, via: 'lead_panel' \}\)/.test(c), 'the dialog sends free text through it');
  ok(!/functions\.invoke|invokeEdge|\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(|leadRpc|executeContact/.test(c), 'the dialog writes nothing itself — no status, Next Action, queue or log row');
  ok(!/wa\.me|window\.open/.test(c), 'and opens nothing external');
}

console.log('── 3. what it shows ──');
{
  ok(/title=\{lead\?\.business_name/.test(dialog), 'header = the business name');
  ok(/No messages yet\./.test(panel), 'empty history says "No messages yet."');
  ok(/const DEFAULT_TEMPLATE = 'initial_contact';/.test(panel), 'the picker starts on the original opener');
  ok(WHATSAPP_TEMPLATES.find((t) => t.value === 'initial_contact')?.label === 'Initial contact — original opener', '…whose label is "Initial contact — original opener"');
  ok(/WHATSAPP_TEMPLATES\.map/.test(panel) && /getTemplateSendability\(/.test(panel), 'the same template list and the same per-lead gate as the Inbox');
  const preview = readableTemplateBody(null, 'initial_contact', { businessName: 'ZZ QA Plumbing Ltd', sentAt: new Date().toISOString() });
  ok(/ZZ QA Plumbing/.test(preview) && !/\{\{/.test(preview), `the preview fills the lead's name ("${preview.slice(0, 60)}…")`);
  ok(/data-testid="whatsapp-send-template"/.test(panel) && /data-testid="whatsapp-send"/.test(panel) && /<Textarea/.test(panel), 'Send template, a free-text box and Send');
  ok(/max-h-\[92dvh\] overflow-y-auto/.test(dialog), 'fits a phone screen (scrolls inside the viewport)');
}

console.log(f ? `\n${f} FAILED` : '\nALL PASS');
process.exit(f ? 1 : 0);
