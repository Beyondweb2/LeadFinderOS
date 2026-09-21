/* Verifies the shape of useAuth.tsx's signIn() timeout guard in isolation, without a real
   Supabase client. signInWithPassword cannot be cancelled (no AbortSignal in the GoTrue client),
   so this mirrors the exact behaviour signIn() implements: a Promise.race against a timeout,
   a ref that stays held until the REAL request settles (not until the timeout fires), and a
   late-settlement path that must never re-throw or leave the guard stuck. */

let failures = 0;
const ok = (condition: boolean, label: string) => { if (!condition) failures++; console.log(`${condition ? 'PASS' : 'FAIL'} ${label}`); };

const SIGN_IN_TIMEOUT_MS = 50; // shortened for the test; production uses 30000

function makeSignIn() {
  let inFlight: Promise<{ error: { message: string } | null }> | null = null;
  const lateSettlements: string[] = [];

  // `startRequest` stands in for supabase.auth.signInWithPassword — the caller controls exactly
  // when it resolves, so the test can simulate "settles after the timeout already fired".
  return function signIn(startRequest: () => Promise<{ error: { message: string } | null }>) {
    if (inFlight) {
      return Promise.resolve({
        result: { error: new Error('A previous sign-in attempt is still finishing. Please wait a moment and try again.') },
        isInFlight: () => inFlight !== null,
        lateSettlements,
      });
    }

    let timedOut = false;
    const request = startRequest();
    inFlight = request;
    request
      .then(({ error }) => { if (timedOut) lateSettlements.push(error ? `error: ${error.message}` : 'succeeded'); })
      .catch((err) => { if (timedOut) lateSettlements.push(`rejected: ${err}`); })
      .finally(() => { inFlight = null; });

    let timeoutHandle: ReturnType<typeof setTimeout> | undefined;
    return (async () => {
      try {
        const { error } = await Promise.race([
          request,
          new Promise<never>((_, reject) => {
            timeoutHandle = setTimeout(() => { timedOut = true; reject(new Error('Sign-in is taking too long. Please check your connection and try again.')); }, SIGN_IN_TIMEOUT_MS);
          }),
        ]);
        return { error: error as Error | null };
      } catch (err) {
        return { error: err as Error };
      } finally {
        if (timeoutHandle) clearTimeout(timeoutHandle);
      }
    })().then((result) => ({ result, isInFlight: () => inFlight !== null, lateSettlements }));
  };
}

const wait = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// 1. A fast, real failure still surfaces its own error, and the guard clears immediately.
{
  const signIn = makeSignIn();
  const { result, isInFlight } = await signIn(() => Promise.resolve({ error: { message: 'Invalid login credentials' } }));
  ok(result.error?.message === 'Invalid login credentials', 'a fast real failure returns its own error');
  ok(!isInFlight(), 'the guard clears once a fast request settles');
}

// 2. A fast success passes through with no error, guard clears.
{
  const signIn = makeSignIn();
  const { result, isInFlight } = await signIn(() => Promise.resolve({ error: null }));
  ok(result.error === null, 'a fast success returns error: null');
  ok(!isInFlight(), 'the guard clears after a fast success too');
}

// 3. THE CORE CASE: the request never settles within the window — signIn() still resolves
//    (no permanent spinner hang), but the guard stays held because the real request is still
//    out there. A second attempt made immediately after is refused, not fired concurrently.
{
  const signIn = makeSignIn();
  const neverSettles = () => new Promise<{ error: null }>(() => {});
  const { result, isInFlight } = await signIn(neverSettles);
  ok(!!result.error, 'a request that never settles still resolves signIn() with an error');
  ok(isInFlight(), 'the guard stays held — the abandoned request is still presumed live');

  const secondAttempt = await signIn(() => Promise.resolve({ error: null }));
  const secondError = secondAttempt.result.error;
  ok(!!secondError, 'a second attempt while the first is still outstanding is refused');
  ok(!!secondError && (secondError.message.includes('already') || secondError.message.includes('still')),
    'the refusal names why, rather than silently doing nothing');
}

// 4. LATE SETTLEMENT AFTER TIMEOUT: the abandoned request eventually resolves (success or
//    failure) well after signIn() already gave up. This must not throw, must not resurrect a
//    resolved promise, and must release the guard so a real retry can proceed.
{
  const signIn = makeSignIn();
  let resolveLate: (v: { error: null }) => void;
  const lateRequest = () => new Promise<{ error: null }>((resolve) => { resolveLate = resolve; });
  const { result, isInFlight, lateSettlements } = await signIn(lateRequest);
  ok(!!result.error, 'signIn() gives up and resolves with a timeout error, not hanging');
  ok(isInFlight(), 'the guard is still held right after the timeout fires');

  // The background request finally succeeds, long after the caller stopped waiting.
  resolveLate!({ error: null });
  await wait(20);

  ok(!isInFlight(), 'the guard releases once the late request actually settles');
  ok(lateSettlements.length === 1 && lateSettlements[0] === 'succeeded',
    'the late success is observed exactly once, not silently dropped and not duplicated');

  // A retry AFTER the real abandoned request has finished is allowed — the guard is not
  // permanently stuck just because one attempt timed out.
  const retry = await signIn(() => Promise.resolve({ error: null }));
  ok(retry.result.error === null, 'a retry after the abandoned request finishes is allowed through');
}

// 5. A late REJECTION (network error arriving after the timeout) is caught, not an unhandled
//    rejection, and is also observed exactly once.
{
  const signIn = makeSignIn();
  let rejectLate: (e: Error) => void;
  const lateRequest = () => new Promise<{ error: null }>((_, reject) => { rejectLate = reject; });
  const { isInFlight, lateSettlements } = await signIn(lateRequest);
  rejectLate!(new Error('upstream request timeout'));
  await wait(20);
  ok(!isInFlight(), 'the guard releases after a late rejection too');
  ok(lateSettlements.length === 1 && lateSettlements[0].includes('upstream request timeout'),
    'the late rejection is observed once, cleanly, not thrown as an unhandled rejection');
}

if (failures) process.exit(1);
