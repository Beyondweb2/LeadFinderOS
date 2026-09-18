import { technicalTasks } from '../supabase/functions/_shared/action-plan.ts';

const assert = (ok: unknown, message: string) => { if (!ok) throw new Error(message); };

const unavailable = technicalTasks({ status: 'unavailable', signals: { fetchFailed: true } });
assert(unavailable.length === 0, 'unavailable crawl must not invent technical tasks');

const tasks = technicalTasks({
  status: 'complete',
  signals: {
    fetchFailed: false, searchBlocked: ['GPTBot'], readableAs: 'google',
    clientRendered: { flagged: false, visibleChars: 1000 }, missingH1: true, noJsonLd: true,
    duplicates: null, thinPages: 0, homeUrl: 'https://example.test',
  },
});
assert(tasks.some((t) => t.id === 'crawl-search-blocked' && t.priority === 'critical'), 'blocked crawler should be critical');
assert(tasks.some((t) => t.id === 'crawl-structured-data'), 'missing structured data should be actionable');
assert(tasks.some((t) => t.id === 'crawl-h1'), 'missing H1 should be actionable');

console.log('action-plan technical task tests: ALL PASS');
