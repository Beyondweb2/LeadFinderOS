/* statusUpdatePatch — the DB patch a hand-set status change produces. Pins the 2026-09-13
   decision: "replied" writes NO next_action (the stored 'send_draft' piled up to 625 overdue rows
   because nothing cleared it; the Dashboard derives "unanswered reply" from message timestamps). */
import { statusUpdatePatch } from '../src/lib/statusPatch.ts';

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };

console.log('── replied writes the status and nothing else ──');
{
  const p = statusUpdatePatch('replied');
  ok(p.status === 'replied', 'status set');
  ok(!('next_action' in p) && !('next_action_date' in p), 'no next_action / next_action_date written — a stored task is only ever something a person set');
}
console.log('── the other automatic patches are unchanged ──');
{
  const p = statusUpdatePatch('site_sent');
  ok(p.next_action === 'follow_up' && typeof p.next_action_date === 'string', 'site_sent still schedules a next-day follow-up');
ok(statusUpdatePatch('not_interested').is_potential_work === false, 'not_interested still untracks');
ok(statusUpdatePatch('interested').is_potential_work === true && !('status' in statusUpdatePatch('interested')), 'interested adds the separate tracked/starred marker without changing pipeline status');
ok(Object.keys(statusUpdatePatch('contacted')).join(',') === 'status', 'a plain status change writes only the status');
}

console.log(f ? `\n${f} FAILURES` : '\nALL PASS');
if (f) process.exit(1);
