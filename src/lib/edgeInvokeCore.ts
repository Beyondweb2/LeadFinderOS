/* ════════════════════════════════════════════════════════════════════════════════════════════════
   ONE WAY TO CALL A PROTECTED EDGE FUNCTION FROM THE OPERATOR APP.

   🔴 THE FAULT (2026-09-22, /paid-clients, Paul signed in). supabase-js builds the Authorization
   header from `auth.getSession()`, and when the stored access token has EXPIRED it refreshes it
   first. If that refresh fails for a *retryable* reason — this project's token endpoint has been
   measured at 1–35 s, and a backgrounded/mobile tab does not run the refresh ticker — auth-js keeps
   the session, tells NOBODY (no SIGNED_OUT), and getSession answers `session: null`. supabase-js
   then falls back to the ANON key. The gateway accepts it (it is a valid JWT), the handler finds no
   user, and every protected function answers 401 (`unauthorized` / `Auth required`) while React
   still shows the operator as signed in. Paid Clients caught nothing and rendered the failure as
   "No paid clients yet."

   ⛔ THIS HELPER NEVER SENDS THE ANON KEY TO A PROTECTED FUNCTION. It resolves the session itself,
   refreshes once if it is missing, sets Authorization explicitly (supabase-js leaves an explicit
   header alone), and on a 401 refreshes once and retries once. A 401 that survives a fresh token
   is a genuine sign-out: the local session is cleared, which is what sends the operator through the
   existing ProtectedRoute → /auth flow. A refresh that cannot complete is reported as a transient
   error to retry, never as a sign-out and never as "no data".

   Pure core (createEdgeInvoker) with injected dependencies so a test can count requests. Zero imports:
   the bound app instance lives in edgeInvoke.ts so this file loads under tsx.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export type EdgeSession = { access_token: string } | null;
export type EdgeInvokeResult = { data: unknown; error: null | { message?: string; context?: unknown } };
export type EdgeInvokerDeps = {
  getSession: () => Promise<EdgeSession>;
  refreshSession: () => Promise<EdgeSession>;
  invoke: (name: string, options: { body: unknown; headers: Record<string, string> }) => Promise<EdgeInvokeResult>;
  /** Clears the LOCAL session; the auth listener then routes the operator to sign-in. */
  signOutLocal: () => Promise<void>;
};

/** The session could not be established or was refused by the server. `transient` means "retry";
 *  otherwise the local session has already been cleared and the sign-in flow is taking over. */
export class EdgeAuthError extends Error {
  readonly transient: boolean;
  constructor(message: string, transient: boolean) {
    super(message);
    this.name = 'EdgeAuthError';
    this.transient = transient;
  }
}

/** A non-2xx answer from the function itself, with the machine token and the server's sentence. */
export class EdgeFunctionError extends Error {
  readonly code: string;
  readonly detail: string;
  readonly status: number | null;
  constructor(code: string, detail: string, status: number | null) {
    super(detail || code || 'Request failed');
    this.name = 'EdgeFunctionError';
    this.code = code;
    this.detail = detail;
    this.status = status;
  }
}

const statusOf = (error: { context?: unknown } | null): number | null => {
  const ctx = error?.context as { status?: unknown } | undefined;
  return typeof ctx?.status === 'number' ? ctx.status : null;
};

/** Read `{ error, detail, message }` out of a Response-like context without ever throwing. */
async function bodyOf(error: { message?: string; context?: unknown } | null): Promise<{ code: string; detail: string }> {
  const ctx = error?.context as { clone?: () => { json: () => Promise<unknown> } } | undefined;
  let code = '';
  let detail = '';
  if (ctx && typeof ctx.clone === 'function') {
    try {
      const payload = await ctx.clone().json() as { error?: unknown; detail?: unknown; message?: unknown };
      if (typeof payload?.detail === 'string' && payload.detail.trim()) detail = payload.detail.trim();
      code = typeof payload?.error === 'string' ? payload.error : typeof payload?.message === 'string' ? payload.message : '';
    } catch { /* non-JSON body: keep the SDK's own message */ }
  }
  return { code: code || (error?.message ?? ''), detail };
}

export function createEdgeInvoker(deps: EdgeInvokerDeps) {
  return async function invokeEdge<T = unknown>(name: string, body: Record<string, unknown> = {}): Promise<T> {
    /* 1. A real session, or nothing is sent. One explicit refresh when the stored one is unusable. */
    let session = await deps.getSession().catch(() => null);
    if (!session?.access_token) session = await deps.refreshSession().catch(() => null);
    if (!session?.access_token) {
      throw new EdgeAuthError('Your session could not be refreshed. Check your connection and try again.', true);
    }
    const send = (token: string) => deps.invoke(name, { body, headers: { Authorization: `Bearer ${token}` } });

    /* 2. Send with the current token; on 401 refresh once and retry once, never more. */
    let token = session.access_token;
    let result = await send(token);
    if (result.error && statusOf(result.error) === 401) {
      const fresh = await deps.refreshSession().catch(() => null);
      if (fresh?.access_token && fresh.access_token !== token) {
        token = fresh.access_token;
        result = await send(token);
      }
    }
    if (result.error && statusOf(result.error) === 401) {
      /* 3. A fresh token was refused (or none could be had): the session is genuinely gone. */
      await deps.signOutLocal().catch(() => undefined);
      throw new EdgeAuthError('Your session has expired. Please sign in again.', false);
    }
    if (result.error) {
      const { code, detail } = await bodyOf(result.error);
      throw new EdgeFunctionError(code, detail, statusOf(result.error));
    }
    const data = result.data as { ok?: unknown; error?: unknown; detail?: unknown } | null;
    if (data && typeof data === 'object' && data.ok === false) {
      throw new EdgeFunctionError(
        typeof data.error === 'string' ? data.error : 'request_failed',
        typeof data.detail === 'string' ? data.detail : '',
        200,
      );
    }
    return result.data as T;
  };
}

/** Machine tokens the functions answer with, in operator English. A token missing here is still
 *  never shown bare (see edgeErrorMessage). */
export const EDGE_ERROR_SENTENCES: Record<string, string> = {
  server_error: 'The server could not complete this request. Try again.',
  upstream_timeout: 'The database did not answer in time. Nothing was changed — try again in a moment.',
  auth_unavailable: 'The sign-in service did not answer in time. You are still signed in — try again in a moment.',
  unauthorized: 'Your session was not accepted. Sign in again.',
  'Auth required': 'Your session was not accepted. Sign in again.',
  client_not_found: 'This client is not in your paid-client list.',
  request_failed: 'The request failed. Try again.',
  method_not_allowed: 'The server refused the request method.',
  unsupported_action: 'The server did not recognise this action.',
};

/** Does this read as a raw machine token (`server_error`, `client_not_found`) rather than a sentence? */
export function looksLikeErrorToken(value: string): boolean {
  const v = value.trim();
  return v.length > 0 && v.length <= 64 && !/\s/.test(v) && /^[a-z0-9_.-]+$/i.test(v);
}

/** The sentence to show an operator for any error this module throws. ⛔ NEVER A BARE TOKEN: the
 *  server's own sentence first, then the known-token map, then a sentence that quotes the token. */
export function edgeErrorMessage(e: unknown, fallback = 'Request failed'): string {
  const humanise = (code: string, detail: string): string => {
    if (detail && !looksLikeErrorToken(detail)) return detail;
    if (code && EDGE_ERROR_SENTENCES[code]) return EDGE_ERROR_SENTENCES[code];
    if (code && looksLikeErrorToken(code)) return `${fallback} (the server reported "${code}"). Try again.`;
    return code || detail || fallback;
  };
  if (e instanceof EdgeFunctionError) return humanise(e.code, e.detail);
  if (e instanceof Error) return humanise(e.message, '');
  return fallback;
}
