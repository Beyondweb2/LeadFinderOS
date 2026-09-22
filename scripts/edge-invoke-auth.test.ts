/* ════════════════════════════════════════════════════════════════════════════════════════════════
   PROTECTED EDGE CALLS CARRY A REAL SESSION — never the anon key, never a 401 loop.

   🔴 THE FAULT (2026-09-22). /paid-clients answered 401 from paid-client-hub and submissions while
   Paul was signed in, and rendered "No paid clients yet." supabase-js falls back to the ANON key
   when auth.getSession() cannot hand it a token (an expired access token whose refresh failed for a
   retryable reason keeps the session, tells nobody and answers session: null). The gateway accepts
   the anon JWT; the handler finds no user; 401. The page caught nothing.

   Run: npx tsx scripts/edge-invoke-auth.test.ts
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EdgeAuthError, EdgeFunctionError, createEdgeInvoker, edgeErrorMessage, type EdgeInvokerDeps } from '../src/lib/edgeInvokeCore';

const root = resolve(import.meta.dirname, '..');
const read = (p: string) => readFileSync(resolve(root, p), 'utf8').replace(/\r\n/g, '\n');
const paidClients = read('src/pages/PaidClients.tsx');
const hub = read('src/pages/ClientHub.tsx');
const submissions = read('src/hooks/useSubmissions.ts');
const helper = read('src/lib/paidBaseline.ts');

const checks: Array<[string, boolean]> = [];
const check = (label: string, ok: boolean) => checks.push([label, ok]);

type Script = {
  sessions?: Array<{ access_token: string } | null>;   // successive getSession answers
  refreshes?: Array<{ access_token: string } | null>;  // successive refreshSession answers (null = failed)
  responses?: Array<(token: string) => { data: unknown; error: null | { message: string; context: { status: number; clone: () => { json: () => Promise<unknown> } } } }>;
};
function harness(script: Script) {
  const calls: Array<{ name: string; auth: string; body: unknown }> = [];
  let signedOut = 0; let refreshCalls = 0;
  const sessions = [...(script.sessions ?? [])];
  const refreshes = [...(script.refreshes ?? [])];
  const responses = [...(script.responses ?? [])];
  const deps: EdgeInvokerDeps = {
    getSession: async () => sessions.length ? sessions.shift()! : null,
    refreshSession: async () => { refreshCalls++; if (!refreshes.length) throw new Error('AuthSessionMissingError'); return refreshes.shift()!; },
    invoke: async (name, { body, headers }) => {
      calls.push({ name, auth: headers.Authorization, body });
      const next = responses.shift();
      return next ? next(headers.Authorization.replace('Bearer ', '')) : { data: { ok: true, echo: body }, error: null };
    },
    signOutLocal: async () => { signedOut++; },
  };
  return { invoke: createEdgeInvoker(deps), calls, refreshCalls: () => refreshCalls, signedOut: () => signedOut };
}
const http = (status: number, payload: unknown) => () => ({ data: null, error: { message: `Edge Function returned a non-2xx status code`, context: { status, clone: () => ({ json: async () => payload }) } } });
const ok = (payload: unknown) => () => ({ data: payload, error: null });

async function main() {
  // 1. The request waits for a session: none stored → one refresh → the request carries the fresh token.
  {
    const h = harness({ sessions: [null], refreshes: [{ access_token: 'fresh-1' }] });
    const data = await h.invoke('paid-client-hub', { action: 'list' });
    check('1. a missing session is refreshed before the request is sent', h.refreshCalls() === 1 && h.calls.length === 1 && h.calls[0].auth === 'Bearer fresh-1');
    check('1. the caller gets the payload', (data as { ok: boolean }).ok === true);
  }
  // 2. A valid JWT is what travels: the current access token, explicitly, on every protected call.
  {
    const h = harness({ sessions: [{ access_token: 'user-jwt' }] });
    await h.invoke('submissions', { limit: 5 });
    check('2. the current access token is set explicitly as the bearer', h.calls[0].auth === 'Bearer user-jwt' && h.calls[0].name === 'submissions');
    check('2. the anon key never travels to a protected function', !h.calls.some((c) => c.auth.includes('eyJ') && c.auth !== 'Bearer user-jwt'));
  }
  // 3. An expired session refreshes and retries safely: 401 → one refresh → one retry with the new token.
  {
    const h = harness({ sessions: [{ access_token: 'stale' }], refreshes: [{ access_token: 'renewed' }], responses: [http(401, { ok: false, error: 'unauthorized' }), ok({ ok: true, clients: [] })] });
    const data = await h.invoke('paid-client-hub', { action: 'list' });
    check('3. a 401 is retried once with a refreshed token', h.calls.length === 2 && h.calls[0].auth === 'Bearer stale' && h.calls[1].auth === 'Bearer renewed' && (data as { ok: boolean }).ok === true);
    check('3. nothing was signed out on a successful retry', h.signedOut() === 0);
  }
  // 7. No repeated request loop: a second 401 ends it, and a failed refresh sends nothing at all.
  {
    const h = harness({ sessions: [{ access_token: 'stale' }], refreshes: [{ access_token: 'renewed' }], responses: [http(401, { ok: false, error: 'unauthorized' }), http(401, { ok: false, error: 'unauthorized' })] });
    let err: unknown = null;
    try { await h.invoke('paid-client-hub', { action: 'list' }); } catch (e) { err = e; }
    check('7. a 401 that survives a fresh token is a genuine sign-out, after exactly two requests', h.calls.length === 2 && err instanceof EdgeAuthError && !err.transient && h.signedOut() === 1);
    const cold = harness({ sessions: [null], refreshes: [null] });
    let coldErr: unknown = null;
    try { await cold.invoke('paid-client-hub', { action: 'list' }); } catch (e) { coldErr = e; }
    check('7. a session that cannot be refreshed sends no request and is reported as transient, not a sign-out', cold.calls.length === 0 && coldErr instanceof EdgeAuthError && coldErr.transient && cold.signedOut() === 0);
    const same = harness({ sessions: [{ access_token: 'same' }], refreshes: [{ access_token: 'same' }], responses: [http(401, { ok: false, error: 'unauthorized' })] });
    let sameErr: unknown = null;
    try { await same.invoke('paid-client-hub', { action: 'list' }); } catch (e) { sameErr = e; }
    check('7. a refresh that returns the same token is not retried with it', same.calls.length === 1 && sameErr instanceof EdgeAuthError && !sameErr.transient);
    check('7. the submissions query never retries an auth error', submissions.includes('retry: (count, e) => !(e instanceof EdgeAuthError) && count < 1'));
  }
  // 6/4. Server refusals surface their own sentence; a failed load is an error state, never the empty card.
  {
    const h = harness({ sessions: [{ access_token: 't' }], responses: [http(422, { ok: false, error: 'baseline_context_incomplete', detail: 'The baseline records at least one service it is measured on, and the client record has none saved.' })] });
    let err: unknown = null;
    try { await h.invoke('paid-baseline', { action: 'approve' }); } catch (e) { err = e; }
    check('6. a non-401 refusal carries the machine code and the server sentence', err instanceof EdgeFunctionError && err.code === 'baseline_context_incomplete' && err.detail.startsWith('The baseline records') && err.status === 422);
    const soft = harness({ sessions: [{ access_token: 't' }], responses: [ok({ ok: false, error: 'client_not_found' })] });
    let softErr: unknown = null;
    try { await soft.invoke('paid-client-hub', { action: 'get' }); } catch (e) { softErr = e; }
    check('6. a 200 with ok:false is still an error, with its code', softErr instanceof EdgeFunctionError && softErr.code === 'client_not_found');
    check('4. Paid Clients renders an error state with retry on failure', paidClients.includes("Could not load paid clients: {error}") && paidClients.includes('Try again') && paidClients.includes('role="alert"'));
    check('4. the empty card is shown only after a successful load', paidClients.includes('{!showSpinner && !error && clients && <div') && paidClients.includes("clients.length === 0 && <Card>") && !paidClients.includes('useState<Client[]>([])'));
    check('4. the load is caught, so nothing rejects unhandled', paidClients.includes('catch (e) {') && paidClients.includes("setError(edgeErrorMessage(e, 'Could not load paid clients'))"));
    check('4. a genuine sign-out is left to the sign-in flow, not painted as an error', paidClients.includes('if (e instanceof EdgeAuthError && !e.transient) return;'));
  }
  // 5. An authenticated, successful request renders clients — and only after the session is known.
  {
    const h = harness({ sessions: [{ access_token: 't' }], responses: [ok({ ok: true, clients: [{ id: 'l1', business_name: 'MCLocksmiths centre' }] })] });
    const data = await h.invoke<{ clients: Array<{ id: string }> }>('paid-client-hub', { action: 'list' });
    check('5. a successful list returns the clients', data.clients.length === 1 && data.clients[0].id === 'l1');
    check('5. the page waits for auth before fetching', paidClients.includes("const { user, isLoading: authLoading } = useAuth();") && paidClients.includes('if (!authLoading && user?.id) void load();') && paidClients.includes('if (!user?.id) return;'));
    check('5. every paid-client caller goes through the invoker', paidClients.includes("invokeEdge<T>('paid-client-hub', body)") && hub.includes("invokeEdge<Record<string, any>>('paid-client-hub', body)") && helper.includes("invokeEdge<{ baseline: PaidBaseline }>('paid-baseline'") && submissions.includes("invokeEdge<{ rows?: SubmissionRow[] }>('submissions'"));
    check('5. no page calls supabase.functions.invoke for these functions directly any more', !paidClients.includes('supabase.functions.invoke') && !hub.includes('supabase.functions.invoke') && !submissions.includes('supabase.functions.invoke') && !helper.includes('supabase.functions.invoke'));
  }
  // 503 from the function (auth service or database not answering) is transient: no retry loop, no sign-out.
  {
    const h = harness({ sessions: [{ access_token: 't' }], responses: [http(503, { ok: false, error: 'auth_unavailable', detail: 'The sign-in service did not answer in time. You are still signed in — try again in a moment.' })] });
    let err: unknown = null;
    try { await h.invoke('paid-client-hub', { action: 'get' }); } catch (e) { err = e; }
    check('503. an unavailable auth service is a function error with its sentence, not a sign-out', err instanceof EdgeFunctionError && err.status === 503 && err.code === 'auth_unavailable' && h.signedOut() === 0 && h.refreshCalls() === 0 && h.calls.length === 1);
    const t = harness({ sessions: [{ access_token: 't' }], responses: [http(503, { ok: false, error: 'upstream_timeout', detail: 'The database did not answer in time. Nothing was changed — try again in a moment.' })] });
    let tErr: unknown = null;
    try { await t.invoke('paid-client-hub', { action: 'list' }); } catch (e) { tErr = e; }
    check('503. a database timeout surfaces its sentence after exactly one request', tErr instanceof EdgeFunctionError && tErr.detail.startsWith('The database did not answer') && t.calls.length === 1);
    const bare = harness({ sessions: [{ access_token: 't' }], responses: [http(500, { ok: false, error: 'server_error' })] });
    let bareErr: unknown = null;
    try { await bare.invoke('paid-client-hub', { action: 'get' }); } catch (e) { bareErr = e; }
    check('500. a bare server_error is never shown raw', bareErr instanceof EdgeFunctionError && edgeErrorMessage(bareErr) === 'The server could not complete this request. Try again.' && !edgeErrorMessage(bareErr).startsWith('server_error'));
  }
  // 6 (spinner). The remaining full-width loader on Paid Clients is the primary accent.
  {
    check('6. the Paid Clients page spinner uses text-primary', paidClients.includes('<Loader2 className="h-8 w-8 animate-spin text-primary"/>') && !/<Loader2 className="animate-spin"\s*\/>/.test(paidClients));
  }

  let failures = 0;
  for (const [label, ok] of checks) { console.log(`${ok ? 'PASS' : 'FAIL'} ${label}`); if (!ok) failures++; }
  if (failures) throw new Error(`${failures} failures`);
}
main().catch((e) => { console.error(e); process.exit(1); });
