import { mergeReconciledLeads, upsertAuditById } from '../src/lib/inboxCache.ts';

let failures = 0;
const ok = (condition: boolean, label: string) => { if (!condition) failures++; console.log(`${condition ? 'PASS' : 'FAIL'} ${label}`); };

/* ══════════════════════ upsertAuditById — the targeted realtime patch ══════════════════════ */

{
  const before = [{ id: 'a1', short_code: 'old' }, { id: 'a2', short_code: 'x' }];
  const after = upsertAuditById(before, { id: 'a1', short_code: 'new' });
  ok(after.length === 2, 'upsertAuditById replaces an existing row without growing the array');
  ok(after.find((r) => r.id === 'a1')?.short_code === 'new', 'the matching row is replaced with the fresh one');
  ok(after.find((r) => r.id === 'a2')?.short_code === 'x', 'an unrelated row is untouched');
}

{
  const before = [{ id: 'a1', short_code: 'x' }];
  const after = upsertAuditById(before, { id: 'a2', short_code: 'y' });
  ok(after.length === 2 && after.some((r) => r.id === 'a2'), 'upsertAuditById adds a brand-new audit id');
}

{
  // A duplicate/replayed realtime event applying the SAME fresh row twice must leave the same state.
  const once = upsertAuditById([{ id: 'a1', short_code: 'x' }], { id: 'a1', short_code: 'y' });
  const twice = upsertAuditById(once, { id: 'a1', short_code: 'y' });
  ok(JSON.stringify(once) === JSON.stringify(twice), 'applying the same fresh audit row twice is idempotent');
}

/* ══════════════════════ mergeReconciledLeads — the reconcile()-vs-optimistic-patch race ══════════════════════ */

{
  // The exact regression: a manual status write patches the cache optimistically, THEN a stale
  // focus/reconnect reconcile snapshot (read from the DB before the write's own effect was visible
  // to that read, or simply racing it) arrives and must not revert the status.
  const staleSnapshot = [{ id: 'lead-1', status: 'queued' }];
  const pending = new Map([['lead-1', { status: 'replied' }]]);
  const merged = mergeReconciledLeads(staleSnapshot, pending);
  ok(merged[0].status === 'replied', 'a pending local patch survives a stale reconcile snapshot');
}

{
  // Once the write is authoritatively confirmed (a realtime outreach_leads UPDATE, or the targeted
  // single-lead fetch after an inbound reply), the caller clears the pending entry — from then on
  // reconcile's fresh read is trusted again with no override.
  const freshSnapshot = [{ id: 'lead-1', status: 'replied' }];
  const pending = new Map<string, { status?: string }>(); // cleared by the caller already
  const merged = mergeReconciledLeads(freshSnapshot, pending);
  ok(merged[0].status === 'replied', 'once confirmed, the fresh authoritative row is used with no override');
}

{
  // A lead with no pending patch is passed through untouched — reconcile still does real work for
  // every OTHER lead while one has an in-flight local write.
  const freshSnapshot = [{ id: 'lead-1', status: 'queued' }, { id: 'lead-2', status: 'closed' }];
  const pending = new Map([['lead-2', { status: 'replied' }]]);
  const merged = mergeReconciledLeads(freshSnapshot, pending);
  ok(merged[0].status === 'queued', 'a lead with no pending override takes the fresh reconcile value');
  ok(merged[1].status === 'replied', 'a lead with a pending override keeps it, independent of the other lead');
}

{
  // No pending patches at all → identity behaviour, no wasted allocation/rewrite.
  const freshSnapshot = [{ id: 'lead-1', status: 'queued' }];
  const merged = mergeReconciledLeads(freshSnapshot, new Map());
  ok(merged === freshSnapshot, 'an empty pending map returns the fresh array unchanged');
}

if (failures) process.exit(1);
