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
console.log('whatsapp-template-snapshot-paths: all assertions passed');
