/* ════════════════════════════════════════════════════════════════════════════════════════════
   THE REAL ERROR FROM AN EDGE FUNCTION, NOT THE WRAPPER STRING.

   🔴 WHY THIS IS ITS OWN FILE. supabase-js sets `error` on ANY non-2xx, and its `.message` is the
   useless "Edge Function returned a non-2xx status code" every time. The actual message is in the
   RESPONSE BODY, reachable through `error.context`. Reading only `.message` is what made a bulk
   audit failure unreadable for a day (recorded in useDirectoryCheck), and it happened again on
   2026-09-09: a 200-lead Push to Instantly failed and the screen could only say "edge function
   error", which is not a fault report, it is a shrug.

   ⛔ THE PATTERN WAS ALREADY IN THE CODEBASE THREE TIMES — useDirectoryCheck, OutreachTable and
   LeadSearchContext each hand-rolled it, and PushToInstantlyDialog, the one that mattered most
   because it spends money and sends email, had none of them. Three copies and a gap is exactly how
   a lesson gets half-learned. One function now.

   ⚠️ IT NEVER THROWS AND NEVER RETURNS EMPTY. A failure to read the body must not replace a poor
   message with no message — the wrapper string is the floor, not the goal.
   ════════════════════════════════════════════════════════════════════════════════════════════ */

/** What supabase-js hands back on a non-2xx: a message, and the raw Response as `context`. */
interface FunctionsError {
  message?: string;
  context?: unknown;
}

const FALLBACK = 'The server rejected that, and did not say why.';

/** The refusal an edge function actually wrote, parsed. `error` is the machine token the caller
 *  branches on; `detail` / `message` are the sentence a person reads. */
export type FunctionErrorBody = Record<string, unknown>;

/** supabase-js's own string, or the floor when it has none. */
export function functionErrorWrapper(err: unknown): string {
  const e = (err ?? {}) as FunctionsError;
  return typeof e.message === 'string' && e.message.trim() ? e.message.trim() : FALLBACK;
}

/**
 * The PARSED body of a functions.invoke() failure, or null when there isn't one.
 *
 * ⛔ THE BODY CAN ONLY BE READ ONCE. A caller that needs both the machine token (to branch on) and
 * the sentence (to show) calls this ONCE and passes the result to functionErrorSentence — calling
 * both readers on the same error gives the second one an already-consumed stream.
 */
export async function readFunctionErrorBody(err: unknown): Promise<FunctionErrorBody | null> {
  const e = (err ?? {}) as FunctionsError;
  const ctx = e.context as { text?: () => Promise<string> } | undefined;
  if (!ctx || typeof ctx.text !== 'function') return null;
  try {
    const raw = (await ctx.text())?.trim();
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw) as unknown;
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as FunctionErrorBody;
    } catch {
      /* Not JSON. A short plain-text body is still a better answer than the wrapper; a long one is
         an HTML error page, which would be worse than saying nothing useful. */
      if (raw.length <= 300 && !raw.startsWith('<')) return { message: raw };
    }
  } catch {
    /* Something else already consumed the stream. */
  }
  return null;
}

/**
 * The best sentence in a parsed refusal body.
 *
 * ⛔ `detail` AND `message` OUTRANK `error`. create-ai-audit's refusals carry a machine token in
 * `error` ("baseline_not_frozen") and the sentence a person needs in `detail` ("This client has no
 * recorded baseline…"). Showing the token is the catch-all-error fault in a different hat.
 */
export function functionErrorSentence(body: FunctionErrorBody | null, wrapper: string): string {
  const pick = [body?.detail, body?.message, body?.error]
    .find((v) => typeof v === 'string' && v.trim()) as string | undefined;
  return pick ? pick.trim() : wrapper;
}

/**
 * Pull the most useful message available out of a functions.invoke() error.
 *
 * ⚠️ Reads the body — see readFunctionErrorBody. Use that one instead when you also need to branch
 * on the token.
 */
export async function readFunctionError(err: unknown): Promise<string> {
  const wrapper = functionErrorWrapper(err);
  return functionErrorSentence(await readFunctionErrorBody(err), wrapper);
}
