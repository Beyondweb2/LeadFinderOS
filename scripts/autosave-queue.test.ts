/* AUTOSAVE, NO SUBMIT (Paul, 2026-11-02, docs/commission-owed.md): the queue on a fake clock, with a slow server, a dead connection and two tabs. */
import { readFileSync } from 'node:fs';
import { AUTOSAVE_DEBOUNCE_MS, AUTOSAVE_RETRY_MAX_MS, AutosaveQueue, withSaveRetry, type AutosaveStorage } from '../src/lib/autosaveQueue.ts';

let f = 0;
const ok = (c: unknown, l: string) => { if (!c) f++; console.log((c ? 'PASS ' : 'FAIL ') + l); };
const read = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

/* A fake clock. */
class Clock {
  t = 0; private q: { at: number; fn: () => void; id: number }[] = []; private id = 0;
  set = (fn: () => void, ms: number) => { const id = ++this.id; this.q.push({ at: this.t + ms, fn, id }); return id; };
  clear = (id: unknown) => { this.q = this.q.filter((x) => x.id !== id); };
  async go(ms: number) {
    const end = this.t + ms;
    for (;;) {
      const next = this.q.filter((x) => x.at <= end).sort((a, b) => a.at - b.at)[0];
      if (!next) break;
      this.q = this.q.filter((x) => x !== next); this.t = next.at; next.fn();
      for (let i = 0; i < 10; i++) await Promise.resolve();
    }
    this.t = end;
    for (let i = 0; i < 10; i++) await Promise.resolve();
  }
}
const mem = (): AutosaveStorage & { m: Map<string, string> } => { const m = new Map<string, string>(); return { m, getItem: (k) => m.get(k) ?? null, setItem: (k, v) => { m.set(k, v); }, removeItem: (k) => { m.delete(k); } }; };
const tick = async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); };
const make = (save: (k: string, v: string) => Promise<void>, clock: Clock, extra: Partial<ConstructorParameters<typeof AutosaveQueue>[0]> = {}) => new AutosaveQueue({ save, setTimer: clock.set, clearTimer: clock.clear, ...extra });

console.log('── 1. DEBOUNCE ──');
{
  const c = new Clock(); const saves: [string, string][] = [];
  const q = make(async (k, v) => { saves.push([k, v]); }, c);
  ok(q.status() === 'idle', 'nothing yet');
  q.set('notes', 'h'); await c.go(300); q.set('notes', 'he'); await c.go(300); q.set('notes', 'hel');
  ok(saves.length === 0 && q.status() === 'saving', 'typing: nothing sent, shows Saving');
  await c.go(AUTOSAVE_DEBOUNCE_MS);
  ok(saves.length === 1 && saves[0][1] === 'hel', 'about 800ms after typing stops: one save, the last text');
  ok(q.status() === 'saved', 'shows Saved');
  q.set('name', 'Sam'); q.flush('name'); await tick();
  ok(saves.length === 2 && saves[1][0] === 'name', 'blur saves at once, only that field');
  await c.go(5000);
  ok(saves.length === 2, 'and only once');
  q.set('a', '1'); q.set('b', '2'); await c.go(AUTOSAVE_DEBOUNCE_MS);
  ok(saves.slice(2).map((s) => s[0]).sort().join() === 'a,b', 'two changed fields: two small saves, one each');
  q.baseline('x', 'server'); q.set('x', 'server'); await c.go(5000);
  ok(!saves.some((s) => s[0] === 'x'), 'an unchanged value sends nothing');
}

console.log('── 2. A SLOW CONNECTION ──');
{
  const c = new Clock(); const server: string[] = []; const pending: (() => void)[] = [];
  const q = make((_k, v) => new Promise<void>((res) => { pending.push(() => { server.push(v); res(); }); }), c);
  q.set('n', 'first'); await c.go(AUTOSAVE_DEBOUNCE_MS);
  ok(pending.length === 1 && q.status() === 'saving', 'the first save is in flight');
  q.set('n', 'first and more'); await c.go(AUTOSAVE_DEBOUNCE_MS * 5);
  ok(pending.length === 1, 'a newer value waits: never two at once for one field, so an old reply cannot land last');
  ok(q.isDirty('n'), 'the field stays dirty');
  pending[0](); await tick();
  ok(pending.length === 2, 'the old reply lands, the newer text goes straight after');
  pending[1](); await tick();
  ok(server.join('|') === 'first|first and more' && q.status() === 'saved', 'the server ends with the newest text');
}

console.log('── 3. A DEAD CONNECTION NEVER LOSES TEXT ──');
{
  const c = new Clock(); const store = mem(); let down = true; const server = new Map<string, string>(); let tries = 0;
  const save = async (k: string, v: string) => { tries++; if (down) throw new Error('Failed to fetch'); server.set(k, v); };
  const q = make(save, c, { storage: store, storageKey: 'lead-1' });
  q.set('n', 'typed on the call');
  ok(store.m.get('lead-1')?.includes('typed on the call'), 'the text is kept locally the moment it is typed');
  await c.go(AUTOSAVE_DEBOUNCE_MS);
  ok(q.status() === 'retrying', 'shows Failed, retrying');
  await c.go(1000); await c.go(2000); await c.go(4000);
  ok(tries === 4 && q.status() === 'retrying', 'it keeps trying, backing off');
  await c.go(AUTOSAVE_RETRY_MAX_MS * 4);
  const before = tries; await c.go(AUTOSAVE_RETRY_MAX_MS - 1000); ok(tries - before <= 1, 'backing off to the cap, never hammering');

  /* The tab crashes here. */
  const c2 = new Clock();
  const q2 = make(save, c2, { storage: store, storageKey: 'lead-1' });
  const left = q2.restore();
  ok(left.n === 'typed on the call', 'reopened: the unsaved text comes back');
  down = false;
  for (const [k, v] of Object.entries(left)) q2.set(k, v);
  await c2.go(AUTOSAVE_DEBOUNCE_MS);
  ok(server.get('n') === 'typed on the call' && q2.status() === 'saved', 'and saves');
  ok(!store.m.has('lead-1'), 'the local copy is removed only once the server has it');
}

console.log('── 4. A REFUSAL IS NOT RETRIED ──');
{
  const c = new Clock(); let tries = 0;
  const q = make(async () => { tries++; throw Object.assign(new Error('nope'), { refused: true }); }, c, { isRefusal: (e) => !!(e as { refused?: boolean }).refused });
  q.set('n', 'x'); await c.go(AUTOSAVE_DEBOUNCE_MS); await c.go(60_000);
  ok(tries === 1 && q.status() === 'refused', 'a server refusal stops and says so');
  q.set('n', 'y'); ok(q.status() === 'saving', 'typing again tries again');
}

console.log('── 5. TWO TABS ──');
{
  /* The server merges per field (sales_handoff_set_field), as the database does. */
  const server: Record<string, string> = {};
  const save = async (k: string, v: string) => { server[k] = v; };
  const c = new Clock();
  const tabA = make(save, c); const tabB = make(save, c);
  tabA.set('decision_maker_name', 'Sam Jones'); tabB.set('notes_for_paul', 'Prefers mornings');
  await c.go(AUTOSAVE_DEBOUNCE_MS);
  ok(server.decision_maker_name === 'Sam Jones' && server.notes_for_paul === 'Prefers mornings', 'different fields in two tabs: both kept');
  tabA.baseline('notes_for_paul', server.notes_for_paul);
  ok(!tabA.isDirty('notes_for_paul'), 'the other tab’s change arrives in an idle field');
  tabA.set('promised', 'half typed');
  tabA.baseline('promised', 'old server value');
  ok(tabA.isDirty('promised'), 'a server value never replaces text not yet saved');
  const mig = read('supabase/migrations/20261203090000_commission_owed_tracker.sql');
  ok(/select coalesce\(sales_handoff, '\{\}'::jsonb\) into v_prev[\s\S]*for update/.test(mig), 'the database locks the row and merges inside one write');
}

console.log('── 6. ONE-TAP ANSWERS ──');
{
  let n = 0; const states: boolean[] = [];
  const r = await withSaveRetry(async () => { n++; if (n < 3) throw new Error('Failed to fetch'); return 'ok'; }, (on) => states.push(on), [1, 1, 1], async () => {});
  ok(r === 'ok' && n === 3 && states.join() === 'true,true,false', 'a bad connection is ridden out, saying so');
  let m = 0;
  const refused = await withSaveRetry(async () => { m++; throw Object.assign(new Error('no'), { status: 403 }); }, undefined, [1, 1], async () => {}).catch((e) => e);
  ok(m === 1 && (refused as Error).message === 'no', 'a refusal is not retried');
}

console.log('── 7. NO SUBMIT ──');
{
  const profile = read('src/components/LeadCrmPanel.tsx');
  ok(!/>Save<\/Button>/.test(profile.slice(profile.indexOf('prospect-profile'), profile.indexOf('/* ── WORK:'))), 'no Save button on Services and areas');
  ok(!/Add note<\/Button>/.test(profile) && /auto\.set\('note', e\.target\.value\)/.test(profile) && /lead_note_draft/.test(profile), 'an internal note saves as they type, as one row');
  ok(profile.includes('placeholder="Who decides? Anything you promised? Best way to reach them?"'), 'the note box carries the hint, as hint text only');
  ok(/const edit = \(patch: Partial<typeof f>\) => \{[^\n]*auto\.set\('all'/.test(profile), 'Services and areas save as they type');
  const mig = read('supabase/migrations/20261206100000_autosave_note_and_profile.sql');
  ok(/actor_user_id = auth\.uid\(\) and kind = 'note' and created_at > now\(\) - interval '1 hour'/.test(mig) && /perform public\._require_work\(_lead_id\)/.test(mig), 'a person only ever changes their own note, just typed, on a lead they may work');
  ok(/revoke all on function public\.lead_note_draft\(uuid, uuid, text\) from public, anon/.test(mig), 'closed to anon');
  ok(/kind = 'details_set' and created_at > now\(\) - interval '10 minutes'/.test(mig), 'one History line per edit of Services and areas, not one per pause');
  const details = read('src/components/LeadDetailDialog.tsx');
  ok(/onBlur=\{\(\) => \{ if \(!cancellingEdit\.current\) void saveField\(field\);/.test(details) && /autoDetails\.set\('notes', e\.target\.value\)/.test(details) && /putBack\(editingField\)/.test(details), 'the older lead window saves as they type; Escape puts back what was there');
  ok(/if \(field !== 'phone' \|\| !phoneAsksFirst\) autoDetails\.set/.test(details), 'a number on a queued or messaged lead still asks first: it never saves while typing');
  const hook = read('src/hooks/useAutosaveFields.tsx');
  ok(/const held = \{ save: opts\.save \}/.test(hook), 'a queue keeps its own save, so text typed on one lead cannot reach the next');
  const close = read('src/components/QuickCloseDialog.tsx');
  ok(close.includes('cleanCloseEmail(val).ok) auto.set(k, val.trim())'), 'a half-typed email waits: it would only be refused');
  const qcFn = read('supabase/functions/quick-close/index.ts');
  ok(/trade && \(!tradeNow \|\| \(!!tradePrev && !lead\.category && tradeNow === tradePrev\)\)/.test(qcFn), 'the trade: a set one is never overwritten, except what this box itself just saved');
  ok(/\(!v\.lead\.trade \|\| tradeTyped\)/.test(close), 'the trade box stays open while it is being typed');
  ok(/function CorrectDetails/.test(close) && /<AutosaveIndicator status=\{auto\.status\} \/>/.test(close) && !/saveFixes/.test(close), 'Correct a detail saves itself, with the indicator');
  const fn = read('supabase/functions/quick-close/index.ts');
  const at = fn.indexOf('mode === "save_handoff_field"');
  ok(at > 0 && fn.slice(at, at + 400).includes('mayHandoff'), 'the field save has the same who-may-write check');
  ok(fn.slice(at, at + 900).includes('HANDOFF_QUESTIONS.some') && fn.slice(at, at + 900).includes('cleanHandoff'), 'only known keys, cleaned');
  ok(read('src/components/ColdCallPlaybook.tsx').includes('quiet: true'), 'the call screen saves a small write with a small reply');
}

console.log(f ? `\n${f} FAILED` : '\nALL PASS');
process.exit(f ? 1 : 0);
