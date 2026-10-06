import assert from 'node:assert/strict';
import fs from 'node:fs';

const writers = [
  'supabase/functions/send-whatsapp-message/index.ts',
  'supabase/functions/process-whatsapp-queue/index.ts',
  'supabase/functions/stripe-webhook/index.ts',
  'supabase/functions/_shared/free-check-result.ts',
];
for (const file of writers) {
  const source = fs.readFileSync(file, 'utf8');
  assert.match(source, /template_snapshot\s*:/, `${file} persists template_snapshot`);
  assert.match(source, /createTemplateSnapshot/, `${file} uses shared snapshot builder`);
}
assert.match(fs.readFileSync('src/pages/Inbox.tsx', 'utf8'), /WhatsAppTemplateMessage/, 'Inbox uses structured template renderer');
assert.match(fs.readFileSync('src/hooks/useInbox.ts', 'utf8'), /template_snapshot/, 'Inbox realtime type retains template snapshot');
const immediate = fs.readFileSync('supabase/functions/send-whatsapp-message/index.ts', 'utf8');
/* 2026-10-07: the link templates send in Meta's LIVE registered language — `sentLang` is hoisted (function scope),
   set only on that branch, and falls back to the registry for every other template. */
assert.equal((immediate.match(/language: sentLang \?\? WA_TEMPLATES\[usedTemplate\]\.lang/g) ?? []).length, 2,
  'manual preview and send snapshots use the language actually sent (hoisted sentLang, else the registry), not a block-scoped variable');
assert.match(immediate, /let sentLang: string \| null = null;/, 'sentLang is declared once, before the branches');
console.log('whatsapp-template-snapshot-paths: all assertions passed');
