/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE PAID CLIENT HUB UNDER A SLOW BACKEND — honest statuses, real columns, a sentence on screen.

   🔴 THE FAULT (2026-09-22, MCLocksmiths detail page): "401 then 500", the page showing the raw
   word `server_error`. Reproduced with a fresh operator token: paid-baseline answered 401
   `unauthorized` after 19.6 s on a VALID token (the handler's own getUser() timed out and was read
   as "no user"), and paid-client-hub's `list` threw a Cloudflare 522 "Connection timed out" HTML
   page from PostgREST and answered 500 `server_error`. The hub also selected three client_pages
   columns that do not exist, so pages were always empty.

   Run: npx tsx scripts/paid-client-hub-resilience.test.ts
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EdgeFunctionError, edgeErrorMessage, looksLikeErrorToken } from '../src/lib/edgeInvokeCore';
import { hubBaselineStatus, paidBaselineStatusLabel } from '../src/lib/paidBaselineState';
import { formatBaselineProgress, attachPersistedQueueProgress } from '../src/lib/baselineProgress';
import { auditKind, findPaidBaseline } from '../src/lib/auditKind';
import { mergeClientContext } from '../src/lib/clientContext';

const root = resolve(import.meta.dirname, '..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8').replace(/\r\n/g, '\n');
const hubFn = read('supabase/functions/paid-client-hub/index.ts');
const baselineFn = read('supabase/functions/paid-baseline/index.ts');
const authShared = read('supabase/functions/_shared/operator-auth.ts');
const hubPage = read('src/pages/ClientHub.tsx');
const paidClients = read('src/pages/PaidClients.tsx');

/* The shared classifier is Deno-only at import (esm.sh); re-derive it from source for tsx. */
const classifySrc = authShared.slice(authShared.indexOf('export function classifyAuthFailure'), authShared.indexOf('export async function resolveOperator'));
const outageSrc = authShared.slice(authShared.indexOf('export function isUpstreamOutage'));
// deno-lint-ignore no-explicit-any
const classifyAuthFailure: (e: any) => string = new Function(classifySrc.replace('export function classifyAuthFailure', 'return function classifyAuthFailure').replace(/: "unauthorized" \| "auth_unavailable"/, '').replace(/\(error: \{[^)]*\)/, '(error)'))() as never;
// deno-lint-ignore no-explicit-any
const isUpstreamOutage: (e: any) => boolean = new Function(outageSrc.replace('export function isUpstreamOutage', 'return function isUpstreamOutage').replace('(error: unknown): boolean', '(error)').replace('(error as { message?: unknown })?.message', 'error?.message'))() as never;

const checks: Array<[string, boolean]> = [];
const check = (label: string, ok: boolean) => checks.push([label, ok]);

// 1. A getUser() that does not answer is never "unauthorized".
check('auth: a refused token is 401', classifyAuthFailure({ status: 401, message: 'invalid JWT' }) === 'unauthorized' && classifyAuthFailure({ status: 403, message: 'forbidden' }) === 'unauthorized');
check('auth: a timeout is auth_unavailable', classifyAuthFailure({ status: 0, message: 'auth service timed out after 8000 ms' }) === 'auth_unavailable');
check('auth: a Cloudflare 522 page is auth_unavailable', classifyAuthFailure({ status: 502, message: '<!DOCTYPE html>… 522: Connection timed out' }) === 'auth_unavailable');
check('auth: a network failure is auth_unavailable', classifyAuthFailure({ message: 'TypeError: fetch failed' }) === 'auth_unavailable' && classifyAuthFailure(null) === 'auth_unavailable');
check('auth: both operator functions use the shared resolver and answer its status', hubFn.includes('const who = await resolveOperator(req);') && baselineFn.includes('const who = await resolveOperator(req);') && hubFn.includes('return json({ ok: false, error: who.error, detail: who.detail }, who.status);') && !hubFn.includes('async function operator(') && !baselineFn.includes('async function operator('));
check('auth: the resolver bounds getUser with a timeout and answers 503 on it', authShared.includes('OPERATOR_AUTH_TIMEOUT_MS') && authShared.includes('status: 503, error: "auth_unavailable"'));

// 2. The API not answering is 503 upstream_timeout, never a bare 500.
check('outage: the 522 page is classified as an outage', isUpstreamOutage({ message: '<!DOCTYPE html>\n<title>supabase.co | 522: Connection timed out</title>' }) && isUpstreamOutage(new Error('TypeError: fetch failed')));
check('outage: a real query refusal is not', !isUpstreamOutage({ message: 'column client_pages.existing_url does not exist' }));
check('outage: both functions answer 503 upstream_timeout with a sentence', hubFn.includes('error: "upstream_timeout", detail:') && baselineFn.includes('error: "upstream_timeout", detail:') && hubFn.includes('}, 503);'));
check('outage: the 500 fallback carries a sentence, and logs one line not a page of HTML', hubFn.includes('error: "server_error", detail: `The server could not complete this request') && hubFn.includes('message.split("\\n")[0].slice(0, 300)'));

// 3. Every column the hub selects exists (read back against the live schema 2026-09-22).
const selects = [...hubFn.matchAll(/\.select\("([^"]+)"\)/g)].map((m) => m[1]);
const live: Record<string, string[]> = {
  outreach_leads: ['id','business_name','address','search_location','derived_town','website','email','phone','contact_name','amount_paid','payment_date','status','next_action','next_action_date','baseline_audit_id','remeasure_audit_id','remeasure_due_date','delivery_checklist','category','search_keyword','services_included','delivery_ref','notes','delivery_notes','project_overview','project_status','paid_for'],
  onboarding_responses: ['id','confirmed_location','services','services_list','areas_list','areas_wanted','contact_email','baseline_status','baseline_questions','baseline_approved_at','website_route','domain_status','access_status','client_source','audit_id','standout','accreditations','gbp_consent','gbp_manager_email'],
  ai_audits: ['id','baseline_completed_at','short_code','created_at'],
  ai_audit_runs: ['id','run_number','status','created_at'],
  ai_audit_queue: ['run_id','status'],
  client_pages: ['id','status','primary_question','service','town','lead_id','created_at'],
};
const known = new Set(Object.values(live).flat());
const unknownCols = selects.flatMap((s) => s.split(',').map((c) => c.trim())).filter((c) => !known.has(c));
check('schema: every selected column exists in the live schema', unknownCols.length === 0 && hubFn.includes('const CLIENT_PAGES_COLUMNS = "id,status,primary_question,service,town";') && !/from\("ai_audit_runs"\)\.select\("[^"]*completed_at/.test(hubFn));
check('schema: the client_pages error is read, not swallowed', hubFn.includes('if (p.error) throw p.error;'));

// 4/5. The page never prints a raw token.
check('ui: hub page renders an error panel with Try again', hubPage.includes('const errorPanel = pageError &&') && hubPage.includes('>Try again</Button>') && hubPage.includes('onClick={retry}'));
check('ui: hub page maps errors through edgeErrorMessage', hubPage.includes('edgeErrorMessage(e, fallback)') && !hubPage.includes("e instanceof Error ? e.message : 'Could not load client'"));
check('ui: a missing client is a sentence, not a token', hubPage.includes('This client is not in your paid-client list.'));
check('ui: raw server_error is never rendered', edgeErrorMessage(new EdgeFunctionError('server_error', '', 500)) === 'The server could not complete this request. Try again.' && edgeErrorMessage(new Error('server_error')) === 'The server could not complete this request. Try again.');
check('ui: an unknown token is quoted inside a sentence', edgeErrorMessage(new EdgeFunctionError('weird_new_code', '', 500), 'Could not load this client') === 'Could not load this client (the server reported "weird_new_code"). Try again.');
check('ui: the server sentence wins when present', edgeErrorMessage(new EdgeFunctionError('upstream_timeout', 'The database did not answer in time.', 503)) === 'The database did not answer in time.');
check('ui: token detection', looksLikeErrorToken('server_error') && looksLikeErrorToken('Auth required') === false && !looksLikeErrorToken('The server failed.'));
check('ui: Paid Clients page shows sentences too', paidClients.includes('edgeErrorMessage(e,'));

// 6/7. MCLocksmiths-shaped data does not crash the hub, and Discovery rows are irrelevant to it.
const onboarding = { baseline_status: 'approved', audit_id: null, services: null, services_list: null, baseline_questions: Array.from({ length: 20 }, (_, i) => `Q${i + 1}`) };
const status = hubBaselineStatus(onboarding, null);
check('data: approved + null audit_id + blank services resolves to approved', status === 'approved' && paidBaselineStatusLabel(status) === 'Approved, ready to start');
check('data: progress formatting survives no runs and no queue', formatBaselineProgress([], 3) === 'Run 1: waiting · Run 2: waiting · Run 3: waiting' && attachPersistedQueueProgress([], []).length === 0);
const merged = mergeClientContext({ onboarding: { confirmed_location: 'Canterbury', services: null, services_list: null }, lead: { search_keyword: 'Locksmiths', category: null, website: 'https://mc-locksmiths.com/' }, discovery: { business_type: 'Locksmiths', location_text: 'Canterbury', website: 'https://mc-locksmiths.com/', specialism: null } });
check('data: blank services stay blank; nothing invented', merged.services.length === 0 && merged.business_category === 'Locksmiths' && merged.primary_location === 'Canterbury');
const discoveryRows = [{ id: 'd1', audit_purpose: 'discovery', baseline_target_runs: 3, baseline_contract: null }, { id: 'd2', audit_purpose: 'discovery', baseline_target_runs: 2, baseline_contract: null }, { id: 'h', audit_purpose: null, baseline_target_runs: null, baseline_contract: null }];
check('data: discovery and hook rows are never mistaken for the baseline', discoveryRows.every((r) => auditKind(r) !== 'paid_baseline') && findPaidBaseline(discoveryRows) === null);
check('data: the hub reads only the lead pointer, never "the newest audit"', hubFn.includes('.baseline_audit_id as string | null') && !hubFn.includes('order("created_at", { ascending: false }).limit(1).maybeSingle();\n      const auditId'));

// 8. A page load creates nothing.
check('safety: the hub never inserts an audit, starts a baseline or calls the audit creator', !hubFn.includes('startPaidBaseline') && !hubFn.includes('create-ai-audit') && !hubFn.includes('from("ai_audits").insert') && !hubFn.includes('from("ai_audit_runs").insert'));
check('safety: the hub page load calls the hub with get only', hubPage.includes("call({ action: 'get', lead_id: leadId })") && !hubPage.includes("call({ action: 'run'"));
check('safety: the hub get path performs no update or insert', !/action === "get"[\s\S]*?\.(update|insert)\(/.test(hubFn.slice(hubFn.indexOf('if (action === "get")'), hubFn.indexOf('if (action === "create_manual")'))));

let failures = 0;
for (const [label, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`); if (!ok) failures++; }
if (failures) throw new Error(`${failures} failures`);
