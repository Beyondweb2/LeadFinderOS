import { groupInboxMessages, mergeInboxMessages } from '../src/lib/inboxCache.ts';

let failures = 0;
const ok = (condition: boolean, label: string) => { if (!condition) failures++; console.log(`${condition ? 'PASS' : 'FAIL'} ${label}`); };

const first = { id: 'one', created_at: '2026-09-17T10:00:00.000Z', user_id: 'u', phone: '441', status: 'sent' };
const changed = { ...first, status: 'read' };
const later = { id: 'two', created_at: '2026-09-17T10:01:00.000Z', user_id: 'u', phone: '441', status: 'received' };
const merged = mergeInboxMessages([first, later], [changed, later]);
ok(merged.length === 2, 'realtime INSERT/UPDATE rows deduplicate by message id');
ok(merged[0].status === 'read', 'realtime UPDATE replaces the cached message');
ok(groupInboxMessages(merged).get('u::441')?.length === 2, 'thread lookup uses a pre-grouped conversation');

if (failures) process.exit(1);
