/* ============================================================
   THE BATCH SUPPRESSION INDEX AGREES WITH THE PER-LEAD CHECK, ALWAYS.

   Run: npx tsx scripts/suppression-index.test.ts

   🔴 WHY THIS SUITE EXISTS AT ALL. suppression.ts opens with "two copies of a suppression rule is
   how somebody gets emailed", and the push triage now uses a SECOND implementation of that rule —
   a whole-table read intersected in memory, because three round trips per lead is what forced the
   push to carry a cap. Both live in the same file so they cannot be edited apart by accident; this
   drives them over the SAME rows and asserts they never disagree, which is the part a shared file
   alone does not guarantee.

   ⛔ AND IT PINS THE DIRECTION OF FAILURE. A partial or failed read must suppress everybody, not
   clear them: a truncated suppression list is indistinguishable from a clean one, which is exactly
   the bug this table exists to prevent.
   ============================================================ */
import {
  checkSuppressed, loadSuppressionIndex, normEmail, toE164,
} from '../supabase/functions/_shared/suppression.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };

interface Row { id: number; phone_e164: string | null; email: string | null; lead_id: string | null; reason: string | null }

/** A stub speaking the two shapes the two implementations use, and nothing else. */
function fakeService(rows: Row[], opts: { throwOn?: 'read'; pageSize?: number } = {}) {
  const page = opts.pageSize ?? 1000;
  return {
    from() {
      const state: { col?: string; val?: unknown } = {};
      const api: Record<string, unknown> = {
        select: () => api,
        eq(col: string, val: unknown) { state.col = col; state.val = val; return api; },
        limit: () => api,
        order: () => api,
        async maybeSingle() {
          if (opts.throwOn === 'read') throw new Error('boom');
          const hit = rows.find((r) => (r as unknown as Record<string, unknown>)[state.col!] === state.val);
          return { data: hit ? { reason: hit.reason } : null, error: null };
        },
        async range(from: number, to: number) {
          if (opts.throwOn === 'read') throw new Error('boom');
          const sorted = [...rows].sort((a, b) => a.id - b.id);
          return { data: sorted.slice(from, Math.min(to + 1, from + page)), error: null };
        },
      };
      return api;
    },
  };
}

const ROWS: Row[] = [
  { id: 1, phone_e164: '+447908774372', email: null, lead_id: null, reason: null },
  { id: 2, phone_e164: '+447919712943', email: null, lead_id: null, reason: 'replied_no' },
  { id: 3, phone_e164: null, email: 'no@thanks.co.uk', lead_id: null, reason: 'unsubscribed' },
  { id: 4, phone_e164: null, email: null, lead_id: 'lead-archived-1', reason: 'not_interested' },
  { id: 5, phone_e164: '+447000000001', email: 'BOTH@x.com', lead_id: 'lead-both', reason: 'closed' },
];

const IDENTITIES = [
  { label: 'a suppressed phone, bare digits as leads store them', who: { phone: '447908774372' } },
  { label: 'a suppressed phone, already E.164', who: { phone: '+447919712943' } },
  { label: 'a suppressed phone with spaces and punctuation', who: { phone: '+44 7908 774372' } },
  { label: 'a clean phone', who: { phone: '+447111111111' } },
  { label: 'a suppressed email', who: { email: 'no@thanks.co.uk' } },
  { label: 'a suppressed email in the wrong case', who: { email: '  No@Thanks.Co.UK ' } },
  { label: 'a clean email', who: { email: 'hello@example.com' } },
  { label: 'a suppressed lead id', who: { leadId: 'lead-archived-1' } },
  { label: 'a clean lead id', who: { leadId: 'lead-fresh' } },
  { label: 'clean phone + suppressed email', who: { phone: '+447111111111', email: 'no@thanks.co.uk' } },
  { label: 'suppressed phone + clean email (phone wins)', who: { phone: '+447919712943', email: 'hello@example.com' } },
  { label: 'all three clean', who: { phone: '+447111111111', email: 'hello@example.com', leadId: 'lead-fresh' } },
  { label: 'all three suppressed on one row', who: { phone: '+447000000001', email: 'both@x.com', leadId: 'lead-both' } },
  /* ⚠️ NO IDENTIFIERS AT ALL is not a clearance and not an error — there is simply nobody to check. */
  { label: 'nothing to match on', who: {} },
  { label: 'blank strings only', who: { phone: '   ', email: '', leadId: '  ' } },
  { label: 'nulls only', who: { phone: null, email: null, leadId: null } },
];

console.log('\n── THE TWO IMPLEMENTATIONS AGREE, IDENTITY BY IDENTITY ──');
{
  const svc = fakeService(ROWS);
  const index = await loadSuppressionIndex(svc);
  ok(index.ok && index.size === ROWS.length, `the index loaded all ${ROWS.length} rows`);
  for (const { label, who } of IDENTITIES) {
    const single = await checkSuppressed(svc, who);
    const batch = index.check(who);
    ok(single.suppressed === batch.suppressed && single.matchedOn === batch.matchedOn,
       `${label} -> ${batch.suppressed ? `suppressed on ${batch.matchedOn}` : 'not suppressed'} (both agree)`);
  }
}

console.log('\n── ⛔ BOTH FAIL CLOSED WHEN THE READ FAILS ──');
{
  const broken = fakeService(ROWS, { throwOn: 'read' });
  const index = await loadSuppressionIndex(broken);
  ok(!index.ok, 'a failed load is reported as not ok, never as an empty table');
  for (const { label, who } of IDENTITIES) {
    const single = await checkSuppressed(broken, who);
    const batch = index.check(who);
    ok(single.suppressed === batch.suppressed,
       `${label} -> ${batch.suppressed ? 'suppressed (fail-closed)' : 'no identity, so not suppressed'} (both agree)`);
  }
  ok(index.check({ phone: '+447111111111' }).matchedOn === 'lookup_failed',
     'a failed lookup says so rather than naming a match it never made');
  /* An identity with nothing on it is still NOT suppressed even when the read failed — there is no
     person there to have said no. Both implementations return before the lookup. */
  ok(index.check({}).suppressed === false, 'no identifiers is still not suppressed after a failure');
}

console.log('\n── ⛔ A TRUNCATED READ IS A FAILURE, NOT A CLEAN TABLE ──');
{
  /* The real trap: PostgREST stops at db-max-rows silently, so the phones that fall off the end
     read as never suppressed. The index pages to exhaustion and refuses if it runs out of pages. */
  const many: Row[] = Array.from({ length: 2500 }, (_, i) => ({
    id: i + 1, phone_e164: `+4470000${String(i).padStart(5, '0')}`, email: null, lead_id: null, reason: null,
  }));
  const svc = fakeService(many, { pageSize: 1000 });
  const index = await loadSuppressionIndex(svc);
  ok(index.ok, 'a 2,500-row table loads across pages without complaint');
  ok(index.size === 2500, `every row is held (${index.size})`);
  ok(index.check({ phone: many[2499].phone_e164 }).suppressed,
     'a row on the LAST page is found — the one a single unpaginated read would have dropped');
}

console.log('\n── THE NORMALISERS ARE THE SHARED ONES, NOT A SECOND COPY ──');
ok(toE164(' +44 (7908) 774-372 ') === '+447908774372', 'toE164 strips everything but the digits');
ok(toE164('') === null && toE164(null) === null, 'an empty phone is null, not "+"');
ok(normEmail('  Foo@Bar.COM ') === 'foo@bar.com', 'normEmail lowercases and trims');
ok(normEmail('   ') === null, 'a whitespace email is absent, not a value');

console.log(f ? `\n${f} FAILURES` : '\nALL PASS');
if (f) throw new Error(`${f} failures`);
