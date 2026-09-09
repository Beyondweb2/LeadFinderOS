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

/**
 * Pull the most useful message available out of a functions.invoke() error.
 *
 * Order of preference: the body's `error` field, then its `message`, then the raw body text if it
 * is short enough to be a message rather than a page, then supabase-js's wrapper string.
 */
export async function readFunctionError(err: unknown): Promise<string> {
  const e = (err ?? {}) as FunctionsError;
  const wrapper = typeof e.message === 'string' && e.message.trim() ? e.message.trim() : FALLBACK;

  const ctx = e.context as { text?: () => Promise<string> } | undefined;
  if (!ctx || typeof ctx.text !== 'function') return wrapper;

  try {
    const raw = (await ctx.text())?.trim();
    if (!raw) return wrapper;
    try {
      const parsed = JSON.parse(raw) as { error?: unknown; message?: unknown };
      const fromBody = [parsed?.error, parsed?.message]
        .find((v) => typeof v === 'string' && v.trim()) as string | undefined;
      if (fromBody) return fromBody.trim();
    } catch {
      /* Not JSON. A short plain-text body is still a better answer than the wrapper; a long one is
         an HTML error page, which would be worse than saying nothing useful. */
      if (raw.length <= 300 && !raw.startsWith('<')) return raw;
    }
  } catch {
    /* The body can only be read once, and something else may already have consumed it. */
  }
  return wrapper;
}
