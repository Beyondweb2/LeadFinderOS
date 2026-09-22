// operator-auth — who is calling an OPERATOR edge function, and the one honest answer when the
// auth service cannot say.
//
// 🔴 THE FAULT (2026-09-22, /paid-clients). Every operator function resolved the caller with
// `client.auth.getUser()` and treated ANY failure as "no user" → 401 `unauthorized`. A cold boot
// plus a slow GoTrue answer made that call fail after 19.6 s WITH A VALID TOKEN (reproduced three
// times in a row: 401, 200, 200 on the same token). The browser then read "unauthorized" for an
// operator who was signed in, refreshed the token, retried, and — one more transient failure — would
// have signed the operator OUT. An unreachable auth service is a 503 with its own code, never a 401.
//
// ⛔ A 401 IS ONLY FOR A TOKEN THE AUTH SERVICE LOOKED AT AND REFUSED. Absence of a bearer, or a
// definite auth error (status 401/403, "invalid"/"expired" JWT) → 401. Everything else — network,
// timeout, a Cloudflare 522 page, a 5xx — is `auth_unavailable`, 503, with a sentence.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

export const OPERATOR_AUTH_TIMEOUT_MS = 8_000;

export type OperatorResolution =
  | { ok: true; user: { id: string; email?: string } }
  | { ok: false; status: 401 | 503; error: "unauthorized" | "auth_unavailable"; detail: string };

/** Pure classifier: is this getUser() failure a refusal of the token, or the service not answering? */
export function classifyAuthFailure(error: { status?: unknown; message?: unknown; name?: unknown } | null | undefined): "unauthorized" | "auth_unavailable" {
  const status = typeof error?.status === "number" ? error.status : 0;
  if (status === 401 || status === 403) return "unauthorized";
  const message = String(error?.message ?? "").toLowerCase();
  if (/invalid|expired|malformed|bad_jwt|jwt|not authenticated|session_not_found|user not found/.test(message) && status < 500 && !/timed out|522|<!doctype|fetch failed|network|econn|socket/.test(message)) {
    return "unauthorized";
  }
  return "auth_unavailable";
}

export async function resolveOperator(req: Request): Promise<OperatorResolution> {
  const auth = req.headers.get("Authorization") ?? "";
  if (!auth.startsWith("Bearer ")) {
    return { ok: false, status: 401, error: "unauthorized", detail: "Sign in to use this screen." };
  }
  const url = Deno.env.get("SUPABASE_URL")!;
  const anon = Deno.env.get("SUPABASE_ANON_KEY") ?? "";
  const client = createClient(url, anon, { global: { headers: { Authorization: auth } }, auth: { persistSession: false } });
  let timer: number | undefined;
  try {
    const result = await Promise.race([
      client.auth.getUser(),
      new Promise<{ data: { user: null }; error: { message: string; status: number } }>((resolve) => {
        timer = setTimeout(() => resolve({ data: { user: null }, error: { message: `auth service timed out after ${OPERATOR_AUTH_TIMEOUT_MS} ms`, status: 0 } }), OPERATOR_AUTH_TIMEOUT_MS);
      }),
    ]);
    const user = result.data?.user ?? null;
    if (user?.id) return { ok: true, user: { id: user.id, email: user.email ?? undefined } };
    const kind = classifyAuthFailure(result.error);
    if (kind === "unauthorized") {
      return { ok: false, status: 401, error: "unauthorized", detail: "Your session was not accepted. Sign in again." };
    }
    console.warn(`[operator-auth] auth service unavailable: ${String(result.error?.message ?? "no user, no error")}`);
    return { ok: false, status: 503, error: "auth_unavailable", detail: "The sign-in service did not answer in time. You are still signed in — try again in a moment." };
  } catch (e) {
    console.warn(`[operator-auth] getUser threw: ${e instanceof Error ? e.message : String(e)}`);
    return { ok: false, status: 503, error: "auth_unavailable", detail: "The sign-in service did not answer in time. You are still signed in — try again in a moment." };
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** Was this thrown error the API not answering (Cloudflare 522/5xx page, fetch failure), rather
 *  than a query the database refused? Pure, so the classification can be tested. */
export function isUpstreamOutage(error: unknown): boolean {
  const message = String((error as { message?: unknown })?.message ?? error ?? "").toLowerCase();
  return /<!doctype|connection timed out|error code 52\d|error code 50\d|fetch failed|network|econnreset|timed out|socket hang up/.test(message);
}
