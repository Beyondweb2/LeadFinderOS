/* PAUL APPROVES A SALESPERSON'S MESSAGE NAME (2026-10-27, docs/team-access-tidy.md §4a). The database half (a rep's write
   waits, a rep cannot approve, approve / reject, the admin unchanged) is supabase/tests/message-name-approval.sql, run against
   the live schema and always rolled back. Here: the rule's wiring, read as source. Nothing here can message anyone. */
import { readFileSync } from 'node:fs';

let f = 0;
const ok = (c: unknown, m: string) => { if (c) console.log('  PASS ' + m); else { f++; console.log('  FAIL ' + m); } };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

console.log('1. the database is the barrier');
{
  const m = read('supabase/migrations/20261128100000_message_name_approval.sql');
  ok(/if auth\.uid\(\) is null or public\.my_role\(\) = 'admin' then return new; end if;/.test(m), 'only the service and an admin write message_name directly');
  ok(/new\.message_name := old\.message_name; new\.message_name_set_at := old\.message_name_set_at;/.test(m), "anyone else's write keeps the approved name");
  ok(/new\.message_name_pending := new\.message_name/.test(m), '…and their typed name waits instead');
  ok(/before insert or update on public\.profiles/.test(m), 'on insert and update');
  ok(/if public\.my_role\(\) is distinct from 'admin' then raise exception 'admin_only'/.test(m), 'review_message_name is admin only');
  ok(/revoke all on function public\.review_message_name\(uuid, boolean\) from public, anon;/.test(m), 'anon cannot review');
}

console.log('2. a waiting name is never used on a message');
{
  const s = read('supabase/functions/_shared/sender-name.ts');
  ok(/select\("message_name, message_name_pending"\)/.test(s), 'the sender reads the waiting name');
  ok(/if \(!hasChosenMessageName\(saved\) && hasChosenMessageName\(waiting\)\) return "";/.test(s), 'only a waiting name → no name (not the email fallback) → the send refuses');
  const chosen = s.slice(s.indexOf('export async function senderChosenName'));
  ok(/select\("message_name"\)/.test(chosen) && !/message_name_pending/.test(chosen), 'the hook signature reads the APPROVED name only');
  ok(read('src/hooks/useMyMessageName.ts').includes(".select('message_name').eq('user_id', uid)"), 'the browser signs with the approved name only');
}

console.log('3. the screens');
{
  const d = read('src/components/MessageNameDialog.tsx');
  ok(/needsApproval \? \{ message_name_pending: name, message_name_pending_at: now \} : \{ message_name: name, message_name_set_at: now \}/.test(d), 'a salesperson saves into the waiting slot; the admin saves the name');
  ok(/const needsApproval = role !== 'admin';/.test(d), 'anyone not positively admin waits (an unknown role too)');
  ok(/!hasChosenMessageName\(name\) && !hasChosenMessageName\(pend\)/.test(d), 'a waiting name stops the first-time box asking again');
  const inbox = read('src/pages/Inbox.tsx');
  ok(/if \(activeAiIsHook && !myMessageName && myNameWaiting\)/.test(inbox), 'the Inbox says the name is waiting for approval, not "add your name"');
  const team = read('src/pages/Team.tsx');
  ok(/<MessageNameApprovals nameOf=/.test(team), 'the Team page shows the names waiting');
  const card = read('src/components/team/MessageNameApprovals.tsx');
  ok(/sb\.rpc\('review_message_name', \{ _user_id: w\.user_id, _approve: approve \}\)/.test(card), 'Approve / Reject go through review_message_name');
}

console.log(f ? `\n${f} FAILURE(S)` : '\nALL PASS');
if (f) process.exit(1);
