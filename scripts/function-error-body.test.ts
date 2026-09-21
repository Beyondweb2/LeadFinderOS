/* ════════════════════════════════════════════════════════════════════════════════════════════════
   A DESIGNED REFUSAL MUST REACH THE OPERATOR'S SCREEN.

   🔴 THE INCIDENT (2026-09-21, MCLocksmiths centre). Paul pressed "Confirm & run" on a Full
   Measurement for a PAYING client with no frozen baseline. create-ai-audit refused exactly as
   designed — 409, `{ error: "baseline_not_frozen", detail: "This client has no recorded baseline.
   The full measure runs after the baseline freezes, never before it." }` — and the screen said
   "Edge Function returned a non-2xx status code". The sentence that would have told him what to
   do next was in the response BODY, and nothing read it.

   ⛔ TWO RULES, AND BOTH ARE HERE BECAUSE EACH FAILED ON ITS OWN.
     · supabase-js answers EVERY non-2xx with data === null and one wrapper string, so a caller
       that branches on `data?.error` is branching on something that is never there. The wizard's
       business_not_in_town dialog was written that way and could never open.
     · The body carries a machine TOKEN in `error` and the human SENTENCE in `detail`. Preferring
       the token is the catch-all-error fault wearing a different hat.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import {
  readFunctionErrorBody, functionErrorSentence, functionErrorWrapper, readFunctionError,
} from "../src/lib/functionError.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

/** supabase-js's FunctionsHttpError, modelled as it actually arrives: the wrapper string, and the
 *  untouched Response as `context`. The body is a STREAM — it reads once and only once. */
const WRAPPER = "Edge Function returned a non-2xx status code";
function invokeError(status: number, body: unknown) {
  return { message: WRAPPER, context: new Response(JSON.stringify(body), { status }) };
}

/* ── The refusal that was invisible ──────────────────────────────────────────────────────────── */
{
  const err = invokeError(409, {
    ok: false,
    error: "baseline_not_frozen",
    detail: "This client has no recorded baseline. The full measure runs after the baseline freezes, never before it.",
  });
  const body = await readFunctionErrorBody(err);
  ok(body?.error === "baseline_not_frozen", "the machine token survives for the caller to branch on");
  const shown = functionErrorSentence(body, functionErrorWrapper(err));
  ok(shown.startsWith("This client has no recorded baseline."), "the SENTENCE is what a person is shown, not the token");
  ok(shown !== WRAPPER, "the wrapper string never reaches the screen when a body exists");
}

/* ── The dialog that could never open ────────────────────────────────────────────────────────── */
{
  const err = invokeError(409, {
    ok: false, error: "business_not_in_town", message: "MCLocksmiths is 31km from Canterbury.",
    distance_km: 31, town: "Canterbury", override_field: "override_distance",
  });
  const body = await readFunctionErrorBody(err);
  ok(body?.error === "business_not_in_town", "a 409 refusal is readable at all — the old `!error && data?.error` saw nothing");
  ok(Number(body?.distance_km) === 31 && body?.town === "Canterbury", "the dialog's own fields come back with it");
}

/* ── The floor: a body that says nothing must not replace a poor message with no message ─────── */
{
  ok(functionErrorSentence(null, WRAPPER) === WRAPPER, "no body → the wrapper string is the floor");
  ok(await readFunctionError({ message: "" }) === "The server rejected that, and did not say why.",
    "no message and no body → the stated fallback, never empty");
  const noCtx = await readFunctionErrorBody({ message: WRAPPER });
  ok(noCtx === null, "an error with no Response has no body");
}

/* ── Token-only and plain-text bodies ────────────────────────────────────────────────────────── */
{
  const err = invokeError(403, { ok: false, error: "lead_not_found" });
  ok(functionErrorSentence(await readFunctionErrorBody(err), WRAPPER) === "lead_not_found",
    "with no sentence the token is still better than the wrapper");
  const html = { message: WRAPPER, context: new Response("<html><body>502</body></html>", { status: 502 }) };
  ok(functionErrorSentence(await readFunctionErrorBody(html), WRAPPER) === WRAPPER,
    "an HTML error page is not a message");
  const text = { message: WRAPPER, context: new Response("upstream timed out", { status: 504 }) };
  ok(functionErrorSentence(await readFunctionErrorBody(text), WRAPPER) === "upstream timed out",
    "a short plain-text body is a message");
}

/* ── Read once. A second reader must degrade, never throw. ───────────────────────────────────── */
{
  const err = invokeError(409, { error: "x", detail: "read me once" });
  const first = await readFunctionErrorBody(err);
  const second = await readFunctionErrorBody(err);
  ok(first?.detail === "read me once", "the first read gets the body");
  ok(second === null, "the second read returns null rather than throwing — the stream is spent");
}

console.log(f ? `\n${f} FAILED` : "\nAll passed");
process.exit(f ? 1 : 0);
