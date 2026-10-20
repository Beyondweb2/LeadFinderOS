import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { compareLastProspectMessage, compareNewestMessage, DEFAULT_INBOX_SORT } from '../src/lib/inboxSort.ts';

const c = (key: string, lastMessageAt: string, lastInboundAt: string | null) => ({ key, lastMessageAt, lastInboundAt });

test('default is the last prospect message', () => {
  assert.equal(DEFAULT_INBOX_SORT, 'recent_reply');
});

test('sending a reply does not move a conversation', () => {
  const a = c('a', '2026-10-20T10:00:00Z', '2026-10-20T09:00:00Z');
  const b = c('b', '2026-10-20T08:00:00Z', '2026-10-20T08:00:00Z');
  assert.deepEqual([a, b].sort(compareLastProspectMessage).map((x) => x.key), ['a', 'b']);
  // We reply to b just now: its newest message changes, its prospect message does not.
  const b2 = c('b', '2026-10-20T11:00:00Z', '2026-10-20T08:00:00Z');
  assert.deepEqual([a, b2].sort(compareLastProspectMessage).map((x) => x.key), ['a', 'b']);
  // The old "newest message" order is what jumped.
  assert.deepEqual([a, b2].sort(compareNewestMessage).map((x) => x.key), ['b', 'a']);
});

test('a new prospect message moves a conversation up; never-answered ones go below', () => {
  const a = c('a', '2026-10-20T10:00:00Z', '2026-10-20T09:00:00Z');
  const b = c('b', '2026-10-20T12:00:00Z', '2026-10-20T12:00:00Z');
  const n1 = c('n1', '2026-10-19T00:00:00Z', null);
  const n2 = c('n2', '2026-10-20T13:00:00Z', null);
  assert.deepEqual([n1, a, n2, b].sort(compareLastProspectMessage).map((x) => x.key), ['b', 'a', 'n2', 'n1']);
});

test('the Inbox offers both sorts and uses the helper', () => {
  const src = readFileSync(new URL('../src/pages/Inbox.tsx', import.meta.url), 'utf8');
  assert.match(src, /label: 'Last prospect message'/);
  assert.match(src, /label: 'Newest message'/);
  assert.match(src, /compareLastProspectMessage/);
});
