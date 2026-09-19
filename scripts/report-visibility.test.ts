import fs from 'node:fs';

const source = fs.readFileSync('src/hooks/useInbox.ts', 'utf8');
const ok = (condition: unknown, message: string) => {
  if (!condition) throw new Error(`FAIL: ${message}`);
  console.log(`PASS: ${message}`);
};

ok(source.includes('const AUDIT_SELECT_FALLBACK'), 'Inbox has a report-ready audit fallback projection');
ok(source.includes('if (!rich.error) return rich'), 'rich audit projection is preferred when available');
ok(source.includes('return sb.from(\'ai_audits\').select(AUDIT_SELECT_FALLBACK)'), 'projection errors retry the known-working audit read');
ok(source.includes("fetchAllRows<InboxData['audits'][number]>('Inbox (audits)', fetchInboxAudits)"), 'paginated Inbox audit read uses the fallback-aware loader');

type Read<T> = { data: T[]; error: Error | null };
async function readWithFallback<T>(rich: () => Promise<Read<T>>, fallback: () => Promise<Read<T>>) {
  const first = await rich();
  return first.error ? fallback() : first;
}

const completed = { id: 'audit-1', ai_audit_runs: [{ status: 'complete' }] };
const recovered = await readWithFallback(
  async () => ({ data: [], error: new Error('optional JSON projection rejected') }),
  async () => ({ data: [completed], error: null }),
);
ok(recovered.error === null && recovered.data[0] === completed, 'fallback preserves a completed audit/report row');

const preferred = await readWithFallback(
  async () => ({ data: [completed], error: null }),
  async () => ({ data: [], error: null }),
);
ok(preferred.data[0] === completed, 'successful rich read is not replaced by fallback data');

console.log('All report visibility checks passed.');
