import fs from 'node:fs';

const source = fs.readFileSync('supabase/functions/_shared/whatsapp-inbound.ts', 'utf8');
const inbox = fs.readFileSync('src/pages/Inbox.tsx', 'utf8');
const migration = fs.readFileSync('supabase/migrations/20260917000000_whatsapp_inbox_realtime_media.sql', 'utf8');

const expect = (condition: unknown, message: string) => {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
};

expect(source.includes('if (type === "reaction")'), 'reaction messages have a dedicated parser branch');
expect(source.includes('reaction?.emoji'), 'reaction parser preserves the actual emoji');
expect(source.includes('type === "image" || type === "video" || type === "document"'), 'attachment captions are preserved');
expect(source.includes('saveInboundMedia'), 'attachment download/storage path remains enabled');
expect(source.includes("message_type: media.message_type") && source.includes('media_path: media.media_path'), 'stored inbound rows retain attachment metadata');
expect(inbox.includes("createSignedUrl(message.media_path") && inbox.includes("from('whatsapp-media')"), 'Inbox creates a private signed URL for stored media');
expect(inbox.includes("message.message_type === 'image' || message.message_type === 'sticker'"), 'Inbox renders images and stickers');
expect(inbox.includes("message.message_type === 'video'"), 'Inbox renders videos');
expect(inbox.includes("message.message_type === 'audio'"), 'Inbox renders audio');
expect(inbox.includes("message.media_filename ?? 'Open document'"), 'Inbox renders documents as a signed download');
expect(migration.includes("values ('whatsapp-media', 'whatsapp-media', false, 20971520"), 'media bucket stays private with a 20 MB limit');
expect(migration.includes('whatsapp media read own or admin') && migration.includes('auth.uid()'), 'media read policy remains owner/admin scoped');

console.log('All inbound media display checks passed.');
