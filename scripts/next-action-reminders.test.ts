/* ════════════════════════════════════════════════════════════════════════════════════════════════
   HOURLY NEXT ACTION REMINDERS + DONE/CLEAR TAKE THE NOTE (2026-10-02, Paul; docs/outreach-workspace.md §L).
   Live, rolled-back halves: supabase/tests/next-action-reminders.sql (21 checks: the ten scenarios, the note,
   who may run the sweep) and notifications.sql (the reminder once per version, the security checks).
   Run: node scripts/run-tests.mjs next-action-reminders
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { activityDetail } from '../src/lib/salesCrm.ts';

let fails = 0;
const ok = (c: boolean, l: string) => { if (!c) fails++; console.log(`${c ? 'PASS' : 'FAIL'} ${l}`); };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const mig = read('supabase/migrations/20261002190000_next_action_reminders.sql');
const sweep = mig.slice(mig.indexOf('create or replace function public.notify_due_follow_ups'));

console.log('── Done / Clear take the Next Action note with them ──');
ok(/if v_action = 'none' then v_date := null; v_note := null; end if;/.test(mig), 'lead_set_follow_up: none (Done or Clear) clears the day, the time AND the note');
ok(/'from', jsonb_build_object\('next_action', v_old\.na, 'date', v_old\.d, 'time', to_char\(v_old\.t, 'HH24:MI'\), 'note', v_old\.n\)/.test(mig), '…and History keeps the note it had');
ok(/call_booked_at = v_at/.test(mig) && /v_at := case when v_action = 'meeting' and v_time is not null then public\.next_action_due_at\(v_date, v_time\) end;/.test(mig), 'built on the one-next-action body: the booking stays the timed Meeting\'s mirror');
ok(!/notes\s*=|website_control_note|lead_add_note/.test(mig.slice(mig.indexOf('create or replace function public.lead_set_follow_up'), mig.indexOf('create or replace function public.notify_due_follow_ups'))), 'it never touches the lead\'s own notes, learned-on-call notes or client notes');
const h = (data: Record<string, unknown>) => activityDetail({ kind: 'follow_up_set', data }, () => '');
ok(h({ next_action: 'none', change: 'completed', from: { next_action: 'call', date: '2026-10-02', time: '14:30', note: 'ask about the website' } }) === 'Completed: Call · Fri 2 Oct · 14:30 — ask about the website', 'History: what was completed, with its note');
ok(h({ next_action: 'none', change: 'cleared', from: { next_action: 'chase_payment', date: '2026-10-02', note: 'invoice 1042' } }) === 'Cleared: Chase payment · Fri 2 Oct — invoice 1042', 'History: what was cleared, with its note');

console.log('\n── the sweep: hourly, UK time, once per version ──');
ok(/select cron\.schedule\('notify-follow-ups-due', '0 \* \* \* \*', 'select public\.notify_due_follow_ups\(\)'\);/.test(mig), 'the same job, now hourly on the hour (was daily 06:00 UTC)');
ok(/v_today date := \(now\(\) at time zone 'Europe\/London'\)::date;/.test(sweep) && /v_morning boolean := extract\(hour from \(now\(\) at time zone 'Europe\/London'\)\) >= 7;/.test(sweep), 'it reads the UK day and the UK hour');
ok(/\(l\.next_action_time is null and \(l\.next_action_date < v_today or \(l\.next_action_date = v_today and v_morning\)\)\)/.test(sweep), 'date-only: due today from the first sweep at/after 07:00 UK; an earlier day at the next sweep');
ok(/\(l\.next_action_time is not null and public\.next_action_due_at\(l\.next_action_date, l\.next_action_time\) <= v_now\)/.test(sweep), 'timed: the first sweep at/after its UK time');
ok(/l\.next_action_date is not null/.test(sweep) && /l\.next_action::text <> 'none'/.test(sweep) && /l\.is_archived is not true/.test(sweep), 'no date, nothing planned or archived → never (exclusions unchanged)');
ok(/v_key := 'followup:' \|\| r\.id \|\| ':' \|\| r\.na \|\| ':' \|\| r\.d;/.test(sweep), 'date-only key: lead + type + day (the old key — nothing already reminded is reminded again)');
ok(/v_key := 'followup:' \|\| r\.id \|\| ':' \|\| r\.na \|\| ':' \|\| r\.d \|\| ':' \|\| to_char\(r\.t, 'HH24:MI'\);/.test(sweep), 'timed key: + the time — a reschedule, a new time or a new type is a new version');
ok(/not exists \(select 1 from public\.notifications where user_id = r\.to_user and dedupe_key = v_key\)/.test(sweep) && /public\.lead_recipient\(l\.id\) as to_user/.test(sweep), 'one per (person, version); the recipient is the owner AT the sweep');
ok(/public\.next_action_label\(r\.na\) \|\| ' at ' \|\| to_char\(r\.t, 'HH24:MI'\)/.test(sweep) && !/replace\(r\.na/.test(sweep), 'the words: "Business — Send proposal at 16:00", never a raw value');
ok(/revoke all on function public\.notify_due_follow_ups\(\) from public, anon, authenticated;/.test(mig), 'only the scheduler can run the sweep');

console.log(`\n${fails ? `${fails} FAILED` : 'all passed'}`);
if (fails) process.exit(1);
