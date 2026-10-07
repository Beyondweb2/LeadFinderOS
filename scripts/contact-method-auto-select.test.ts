/* ════════════════════════════════════════════════════════════════════════════════════════════════
   CONTACT METHOD FOLLOWS THE ROUTE THE REP IS WORKING (Paul, 2026-10-07).

   Pins:
     1. Pressing CALL sets the lead's Contact Method to Call; queueing WhatsApp sets it to WhatsApp — both
        write the ONE existing column (outreach_leads.contact_method), never a second field.
     2. Latest route wins, either order (Call after a WhatsApp queue → Call; a queue after Call → WhatsApp).
     3. A salesperson's write goes through ONE ownership-checked function (lead_set_contact_method): their
        own non-client lead only, 'call' / 'whatsapp' only, nothing else written.
     4. Only the pill moves: no attempt, no status, no history; unqueue clears (no invented replacement).
     5. The existing call popup and WhatsApp queue are unchanged.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { planSalesPatch, SALES_CONTACT_ROUTES, NOT_STORED_FOR_SALES } from '../src/lib/salesPatchPlan.ts';
import { CONTACT_METHODS } from '../src/lib/contactMethods.ts';

let f = 0;
const ok = (c: unknown, msg: string) => { if (c) console.log('  ✓ ' + msg); else { f++; console.log('  ✗ ' + msg); } };
const read = (p: string) => readFileSync(new URL('../' + p, import.meta.url), 'utf8').replace(/\r\n/g, '\n');
const code = (src: string) => src.replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/^\s*--.*$/gm, '');
const slice = (src: string, from: string, to: string) => { const i = src.indexOf(from); return i < 0 ? '' : src.slice(i, src.indexOf(to, i + from.length)); };

const table = read('src/components/OutreachTable.tsx');
const outreach = read('src/pages/Outreach.tsx');
const mig = code(read('supabase/migrations/20261015110000_lead_set_contact_method.sql'));

/* A tiny model of the one column, driven by the SAME two rules the app uses: the Call tap, the queue write. */
type Row = { id: string; contact_method: string | null; owner: string };
const press = (rows: Row[], id: string, route: 'call' | 'whatsapp', caller: string) =>
  rows.map((r) => (r.id === id && r.owner === caller && SALES_CONTACT_ROUTES.includes(route) && r.contact_method !== route ? { ...r, contact_method: route } : r));

console.log('── 1. Call sets Contact Method = Call (the existing column) ──');
{
  const call = code(slice(table, 'const handleCallClick', '}, [onContactGated, onContactMethodChange]);'));
  ok(/if \(lead\.contact_method !== 'call'\) onContactMethodChange\?\.\(lead\.id, 'call' as ContactMethod\);/.test(call), 'handleCallClick sets the pill to Call (skipped when it already says Call)');
  ok(call.indexOf("onContactMethodChange?.(lead.id, 'call'") < call.indexOf("setDetailLead(lead)"), '…immediately, as the Call flow opens');
  ok(/setDetailTab\('call'\);\s*setDetailLogContact\(false\);\s*setDetailNumberPopup\(true\);\s*setDetailLead\(lead\);/.test(call), '…and the call popup opens exactly as before');
  ok(!/executeContact|logAttempt|outreach_attempts|last_outreach_attempt_at|status:|lead_log_contact|lead_activity/.test(call), '…and records no call: no attempt, no status, no history');
  ok(/onContactMethodChange\(lead\.id, 'whatsapp' as ContactMethod\)/.test(code(table)), 'the row\'s WhatsApp button still sets WhatsApp (unchanged)');
  ok(/const handleContactMethodChange = useCallback\(async \(leadId: string, method: ContactMethod\) => \{[^}]*updateLead\(leadId, \{ contact_method: method \}\)/.test(outreach), 'the write is the page\'s one handler → updateLead({ contact_method }) — the same field the pill reads');
  ok(/value=\{lead\.contact_method \|\| ''\}/.test(table) && /<ContactMethodBadge method=\{lead\.contact_method as ContactMethod\}/.test(table), 'the pill reads that same column, from the row the hook re-places on write (no refresh)');
}

console.log('── 2. WhatsApp queued sets Contact Method = WhatsApp, on every queue path ──');
{
  ok(/status: 'queued'[\s\S]{0,400}contact_method: 'whatsapp'/.test(code(slice(table, 'const patch: Partial<OutreachLead> = {', '};'))) || /contact_method: 'whatsapp'/.test(code(slice(table, 'const patch: Partial<OutreachLead> = {', '};'))), 'the bulk queue writes contact_method = whatsapp with the queue state');
  ok(/status: 'queued',[\s\S]{0,900}contact_method: 'whatsapp'/.test(code(read('src/components/WhatsAppLeadControls.tsx'))), 'the per-lead queue button writes it too');
  const q = code(read('supabase/migrations/20261015090000_outreach_uk_only.sql'));
  ok(/set status = 'queued'[\s\S]{0,200}contact_method = 'whatsapp'/.test(q), 'a salesperson\'s queue (sales_queue_opener, newest definition) writes it server-side');
  ok(/contact_method: null, \/\/ clear the WhatsApp tag/.test(read('src/components/WhatsAppLeadControls.tsx').replace(/\r/g, '')), 'cancelling the queue clears the tag — nothing invented in its place');
  ok(!/contact_method = 'call'/.test(q) && !/contact_method: 'call'/.test(code(read('src/components/WhatsAppLeadControls.tsx'))), 'the queue never writes Call');
}

console.log('── 3. Latest route wins, either order ──');
{
  let rows: Row[] = [{ id: 'a', contact_method: null, owner: 'rep1' }];
  rows = press(rows, 'a', 'call', 'rep1');
  ok(rows[0].contact_method === 'call', 'Call → Call');
  rows = press(rows, 'a', 'whatsapp', 'rep1');
  ok(rows[0].contact_method === 'whatsapp', 'queue after Call → WhatsApp');
  rows = press(rows, 'a', 'call', 'rep1');
  ok(rows[0].contact_method === 'call', 'Call after the WhatsApp queue → Call');
  const again = press(rows, 'a', 'call', 'rep1');
  ok(again[0] === rows[0], 'pressing Call again changes nothing (no rewrite)');
}

console.log('── 4. Only the right lead, only the owner ──');
{
  const rows: Row[] = [{ id: 'a', contact_method: null, owner: 'rep1' }, { id: 'b', contact_method: 'email', owner: 'rep2' }];
  const out = press(rows, 'a', 'call', 'rep1');
  ok(out[0].contact_method === 'call' && out[1].contact_method === 'email', 'the correct lead only is updated');
  ok(press(rows, 'b', 'call', 'rep1')[1].contact_method === 'email', 'a rep cannot change another rep\'s lead');
  ok(/perform public\._require_work\(_lead_id\);/.test(mig) && /begin\s+perform public\._require_work\(_lead_id\);/.test(mig), 'the SQL function runs the role + ownership check FIRST (assigned to the caller, not a client)');
  ok(/security definer set search_path = public/.test(mig) && /revoke all on function public\.lead_set_contact_method\(uuid, text\) from public, anon;/.test(mig) && /grant execute on function public\.lead_set_contact_method\(uuid, text\) to authenticated;/.test(mig), 'security definer, fixed search_path, not callable by anon');
  ok(/_method not in \('call', 'whatsapp'\)/.test(mig), 'the function accepts only the two routes');
  const sets = [...mig.matchAll(/\bupdate public\.outreach_leads set ([^;]*?) where id = _lead_id;/g)].map((m) => m[1].trim());
  ok(sets.length === 1 && sets[0] === "contact_method = _method", 'it writes contact_method and nothing else');
  ok(!/lead_activity|status|outreach_attempts|drop |delete from|truncate|policy/i.test(mig.replace(/-- .*/g, '').replace(/not a client/g, '')), 'no history row, no status, nothing destructive, no policy touched');
}

console.log('── 5. A salesperson\'s edit reaches it through the plan, not a direct write ──');
{
  ok(planSalesPatch({ contact_method: 'call' }).steps.length === 1 && (planSalesPatch({ contact_method: 'call' }).steps[0] as { fn: string; method: string }).fn === 'lead_set_contact_method' && (planSalesPatch({ contact_method: 'call' }).steps[0] as { method: string }).method === 'call', 'contact_method: call → lead_set_contact_method(call)');
  ok((planSalesPatch({ contact_method: 'whatsapp' }).steps[0] as { method: string }).method === 'whatsapp', 'contact_method: whatsapp → lead_set_contact_method(whatsapp)');
  ok(planSalesPatch({ contact_method: 'email' }).steps.length === 0 && planSalesPatch({ contact_method: 'email' }).refused.length === 0, 'any other pill value stays the accepted no-op it was (never reaches the server)');
  ok(planSalesPatch({ contact_method: null }).steps.length === 0, 'a cleared value is not written for a rep either');
  ok(SALES_CONTACT_ROUTES.every((r) => CONTACT_METHODS.some((m) => m.value === r)), 'both routes are members of THE contact-method set — no parallel vocabulary');
  ok(!NOT_STORED_FOR_SALES.has('contact_method') && NOT_STORED_FOR_SALES.has('outreach_attempts'), 'attempt counters stay unstored for a rep');
  ok(planSalesPatch({ contact_method: 'call', business_name: 'x' }).steps.length === 0, 'a patch with any refused key still writes nothing');
  ok(/case 'lead_set_contact_method': r = await leadRpc\(step\.fn, \{ _lead_id: leadId, _method: step\.method \}\)/.test(read('src/lib/leadRpc.ts')), 'leadRpc runs the plan step with the lead id and method');
  const hook = read('src/hooks/useOutreach.ts');
  ok(/if \(isSales\(\)\) return salesUpdateLead\(leadId, updates as Record<string, unknown>\);/.test(hook) && /if \(!r\.wrote\) return null;/.test(hook), 'the hook routes a rep through salesUpdateLead and re-reads the row from sales_leads when something was written (pill updates at once)');
}

console.log('── 6. REGRESSION ──');
{
  ok(/navigate\('\/inbox', \{ state: \{ launch: \{ leadId: lead\.id \} \} \}\);/.test(table), 'the WhatsApp button still opens the in-app conversation');
  ok(/openNumberPopup=\{detailNumberPopup\}/.test(table) && /openLogContact=\{detailLogContact\}/.test(table), 'the call popup is still told which window to arrive on');
  ok(!/tel:/.test(code(table)), 'no tel: link on the call path');
  ok(/useCallback\(\(lead: OutreachLead\) => \{\s*if \(onContactGated && !onContactGated\('call', lead\.id\)\) return;/.test(table), 'the contact gate still runs first, so a blocked rep sets nothing');
}

if (f) { console.log(`\n${f} FAILED`); process.exit(1); }
console.log('\nall contact-method auto-select checks passed');
