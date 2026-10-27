/* MULTI-USER SAFETY (2026-10-27, docs/multi-user.md §10). Salespeople with their own accounts must not collide with the admin or
   each other. The pure rule (auto-send never answers a lead someone else works) is driven directly; the server and screen
   wiring is read as source. The two-user database half (same lead, cross-user visibility, duplicate add, a leaver's
   notifications) is supabase/tests/multi-user-safety.sql, run against the live schema and always rolled back.
   Nothing here can message anyone. */
import { readFileSync } from 'node:fs';
import { autoSendVerdict, AUTO_SEND_CHOICES, type AutoSendFacts } from '../src/lib/aiAutoSend.ts';
import { OUTREACH_LIST_COLUMNS, SALES_LIST_COLUMNS } from '../src/lib/outreachLeadColumns.ts';

let f = 0;
const ok = (c: unknown, m: string) => { if (c) console.log('  PASS ' + m); else { f++; console.log('  FAIL ' + m); } };
const read = (p: string) => readFileSync(new URL(`../${p}`, import.meta.url), 'utf8').replace(/\r\n/g, '\n');

const ADMIN = 'admin-1';
const REP_A = 'rep-a';
const KEY = AUTO_SEND_CHOICES[0].key;
const base = (lead: AutoSendFacts['lead'], sendAs: string | null = ADMIN): AutoSendFacts => ({
  masterOn: true, intentsOn: [KEY], dailyCap: 30, usedToday: 0, theirMessages: ['Yes it is'],
  draft: { key: KEY, kind: 'draft', text: 'A clean draft.', needsYou: false, stop: false, noDraft: false, label: null, confidence: false,
    allowPrice: false, problems: [], usedFallback: false, evidenceComplete: true },
  latestInbound: 'Yes it is', threadHard: null, digits: '447700900123', lead, suppressed: false, personActiveAt: null,
  senderIsAdmin: true, sendAsUserId: sendAs, nowMs: Date.parse('2026-10-27T10:00:00Z'),
});
const prospect = (owner: string | null | undefined) => ({ amount_paid: null, status: 'replied', is_archived: false, assigned_to_user_id: owner });
const reason = (v: ReturnType<typeof autoSendVerdict>) => (v.send ? 'send' : v.reason);

console.log('1. auto-send never answers a lead another person works');
{
  const control = reason(autoSendVerdict(base(prospect(null))));
  ok(control === 'send' || control === 'not_simple_first_reply', `control: an unassigned (book) lead is not refused for ownership (${control})`);
  ok(reason(autoSendVerdict(base(prospect(REP_A)))) === 'assigned_to_other', "a salesperson's lead → never sent in the admin's name");
  ok(reason(autoSendVerdict(base(prospect(ADMIN)))) === control, "the send-as admin's own lead → judged as before");
  ok(reason(autoSendVerdict(base(prospect(undefined)))) === 'assigned_to_other', 'the owner not read (undefined) → never sent (absent ≠ unassigned)');
  ok(reason(autoSendVerdict(base(prospect(REP_A), null))) === 'assigned_to_other', 'no send-as person and an owned lead → never sent');
}

console.log('2. both callers read the owner and pass the send-as person');
{
  const drafts = read('supabase/functions/ai-reply-drafts/index.ts');
  ok(/select\(`\$\{RESEARCH_LEAD_COLUMNS\}, amount_paid, status, call_booked_at, ai_visible_at, assigned_to_user_id`\)/.test(drafts), 'ai-reply-drafts loadLead reads assigned_to_user_id');
  ok(drafts.includes('sendAsUserId: st.sendAs ?? null'), 'ai-reply-drafts passes the send-as person');
  const drain = read('supabase/functions/inbox-scheduled-send/index.ts');
  ok(drain.includes('select("amount_paid, status, is_archived, assigned_to_user_id")'), 'the drain re-reads the owner at send time');
  ok(drain.includes('sendAsUserId: r.queued_by ?? null'), 'the drain judges against the person who queued it');
}

console.log('3. a queued draft can never go twice (bulk Send drafts / single approve)');
{
  const drafts = read('supabase/functions/ai-reply-drafts/index.ts');
  const complete = drafts.slice(drafts.indexOf('async function handleComplete'), drafts.indexOf('async function handleDiscard'));
  const qi = complete.indexOf('if (str(body.error) === "queued_for_send_hours")');
  const pi = complete.indexOf('status: "pending", claimed_by: null');
  ok(qi > 0 && pi > qi, 'queued_for_send_hours is settled BEFORE the hand-back to pending');
  const branch = complete.slice(qi, pi);
  ok(/status: "discarded"/.test(branch) && /\.eq\("status", "sending"\)/.test(branch) && /error: "queued_for_send_hours"/.test(branch),
    "…in one conditional write 'sending' → discarded, keeping the error the outcome trigger records as sent");
  ok(!/status: "pending"/.test(branch), '…never through pending (where a second person could claim it)');
}

console.log('4. a salesperson who has left: nothing goes out in their name');
{
  const wa = read('supabase/functions/process-whatsapp-queue/index.ts');
  ok(wa.includes('.from("team_members").select("user_id").or("suspended_at.not.is.null,status.eq.disabled")'), 'WhatsApp queue holds suspended AND disabled');
  ok(wa.includes('(!l.queued_by_user_id || !suspendedIds.has(l.queued_by_user_id))'), '…by who queued it as well as who works it (the signature is the queuer)');
  ok(!/select\("user_id"\)\.not\("suspended_at", "is", null\)/.test(wa), 'no suspended-only read left in the WhatsApp queue');
  const sms = read('supabase/functions/process-sms-queue/index.ts');
  ok(sms.includes('.or("suspended_at.not.is.null,status.eq.disabled")'), 'SMS queue holds suspended AND disabled');
  ok(sms.includes('!suspended.has(String(l.assigned_to_user_id))'), '…by owner as well as by who queued it');
}

console.log('5. Find Leads: already added = what the add refuses; "Added by"; no bulk-select of another person\'s lead');
{
  const m = read('supabase/migrations/20261128090000_multi_user_safety.sql');
  const cov = read('supabase/migrations/20261111090000_coverage_town.sql');
  // The add's three extra refusals, and the lookup's three extra checks, read the same keys.
  ok(/'same_name'/.test(cov) && /'previously_added'/.test(cov) && /'same_website'/.test(cov), 'coverage_add_leads still refuses same name / previously added / same website');
  ok(/by_name as/.test(m) && /coalesce\(l\.country, 'UK'\)/.test(m) && /l\.business_name in/.test(m), 'lookup: same name in the same country (UK by default)');
  ok(/by_site as/.test(m) && /public\.website_identity\(l\.website\)/.test(m), 'lookup: the same website identity');
  ok(/hist_name as/.test(m) && /hist_maps as/.test(m) && /outreach_history/.test(m), 'lookup: a previously-added name or Maps link');
  ok(/added_by_name text/.test(m) && /team_members a on a\.user_id = l\.added_by_user_id/.test(m), 'lookup returns who ADDED it');
  ok(/revoke all on function public\.lead_identity_lookup\(jsonb\) from public, anon;/.test(m) && /grant execute on function public\.lead_identity_lookup\(jsonb\) to authenticated;/.test(m), 'grants restated: anon none, signed-in yes');
  ok(/case when v_role = 'admin' or r\.state in \('yours', 'claimable'\) then r\.lead_id end/.test(m), 'sales still never gets another person\'s lead id');
  ok(/t\.status = 'disabled'/.test(m) && /lead_recipient/.test(m), "a leaver's replies notify the book owner");

  const table = read('src/components/LeadsTable.tsx');
  ok(/!held\(l\) && !isAlreadyAdded\(ownership\?\.\(l\)\)/.test(table), 'bulk select-all leaves out every business the server says is already added');
  ok((table.match(/disabled=\{inOutreach \|\| held\(lead\) \|\| isAlreadyAdded\(ownership\?\.\(lead\)\)\}/g) ?? []).length === 2, 'the row checkbox is disabled for it (desktop and phone)');
  const own = read('src/components/FindLeadsOwnership.tsx');
  ok(/AlreadyAddedBadge ownerName=\{own\.ownerName\} addedByName=\{own\.addedByName\}/.test(own), 'the sales badge is given who added it');
  const badge = read('src/components/OwnerBadge.tsx');
  ok(/aria-disabled="true"/.test(badge.slice(badge.indexOf('export function AlreadyAddedBadge'))) && /Added by \$\{who\}/.test(badge), 'the badge reads "Added by <name>" and is not a control');
  ok(read('src/pages/Index.tsx').includes('addedByName: hit.added_by_name ?? null'), 'Find Leads passes the server\'s added_by_name through');
}

console.log('6. Outreach rows say who added the lead');
{
  ok((OUTREACH_LIST_COLUMNS as readonly string[]).includes('added_by_user_id'), 'the admin list reads added_by_user_id');
  ok((SALES_LIST_COLUMNS as readonly string[]).includes('added_by_user_id'), 'the salesperson list reads it too (the view has it)');
  ok(read('src/components/OutreachTable.tsx').includes('data-testid="outreach-added-by"'), 'the row draws "Added by <name>"');
  ok(read('src/components/OutreachMobileCard.tsx').includes('data-testid="outreach-added-by"'), '…and so does the phone card');
  ok(read('src/components/LeadsTable.tsx').includes('salesOwnershipCell(ownership?.(lead), onClaim, claiming, true)'), 'Find Leads phone cards use the compact badge (the name keeps its room)');
}

console.log('7. a salesperson never sees a model cost');
{
  const p = read('src/components/AiDraftPanel.tsx');
  ok(/\{role === 'admin' && <p><span className="font-medium text-foreground">Cost: <\/span>/.test(p), 'the Cost line is admin-only');
}

console.log(f ? `\n${f} FAILURE(S)` : '\nALL PASS');
if (f) process.exit(1);
