/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE SIGNATURE IS THE ONLY GATE ON A PUBLIC ENDPOINT — so it is the one part that must be tested.

   `resend-webhook` runs with verify_jwt = false because Resend has no Supabase JWT. Nothing else
   stands between a stranger and our delivery record. Every assertion below is the same property from
   a different angle: A FORGERY MUST NOT PASS, and an honest request must not be refused by accident.

   ⛔ THE FAIL-CLOSED CASES ARE THE POINT, NOT THE HAPPY PATH. A verifier that returns true when it
   cannot tell (unusable secret, malformed header, unknown version) is worse than no verifier, because
   every surface then reads as verified.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { verifySvix, timingSafeEqual, b64 } from "../supabase/functions/_shared/svix-verify.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

const SECRET_RAW = "c3VwZXJzZWNyZXRrZXltYXRlcmlhbDEyMzQ1Ng==";   // base64, as Svix issues it
const SECRET = `whsec_${SECRET_RAW}`;
const ID = "msg_2abcDEF";
const TS = "1789200000";
const BODY = JSON.stringify({ type: "email.bounced", data: { email_id: "re_123", to: ["a@b.co.un"] } });

/** Sign exactly the way Svix does, so the test proves the format and not just the code's own idea. */
async function sign(secretB64: string, id: string, ts: string, body: string): Promise<string> {
  const keyBytes = Uint8Array.from(atob(secretB64), (c) => c.charCodeAt(0));
  const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${body}`)));
}

async function main() {
  const good = await sign(SECRET_RAW, ID, TS, BODY);

  console.log("── the honest request ──");
  ok(await verifySvix(SECRET, ID, TS, BODY, `v1,${good}`), "a correctly signed payload verifies");
  ok(await verifySvix(SECRET_RAW, ID, TS, BODY, `v1,${good}`), "the whsec_ prefix is optional, not required");

  console.log("\n── ⚠️ THE HEADER IS A LIST (Svix rotates by sending old AND new) ──");
  {
    const otherRaw = "b3RoZXJzZWNyZXRrZXltYXRlcmlhbDEyMzQ1Ng==";
    const stale = await sign(otherRaw, ID, TS, BODY);
    ok(await verifySvix(SECRET, ID, TS, BODY, `v1,${stale} v1,${good}`), "ours in SECOND position still verifies (mid-rotation)");
    ok(await verifySvix(SECRET, ID, TS, BODY, `v1,${good} v1,${stale}`), "ours in first position verifies");
    ok(!(await verifySvix(SECRET, ID, TS, BODY, `v1,${stale} v1,${stale}`)), "a list of signatures that are ALL wrong is refused");
  }

  console.log("\n── ⛔ A FORGERY MUST NOT PASS ──");
  ok(!(await verifySvix(SECRET, ID, TS, BODY, "v1,AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=")), "a wrong signature is refused");
  ok(!(await verifySvix(SECRET, ID, TS, BODY + " ", `v1,${good}`)), "ONE TRAILING SPACE in the body invalidates it — the body is signed, not summarised");
  ok(!(await verifySvix(SECRET, "msg_other", TS, BODY, `v1,${good}`)), "the id is part of the signed string (a signature cannot be moved to another message)");
  ok(!(await verifySvix(SECRET, ID, "1789200001", BODY, `v1,${good}`)), "the timestamp is part of it too (a replay cannot be re-stamped)");
  ok(!(await verifySvix("whsec_" + "b3RoZXJzZWNyZXRrZXltYXRlcmlhbDEyMzQ1Ng==", ID, TS, BODY, `v1,${good}`)), "a different secret refuses");

  console.log("\n── ⛔ EVERY MALFORMED SHAPE FAILS CLOSED ──");
  {
    const shapes: Array<[string, string, string]> = [
      ["empty header", SECRET, ""],
      ["no version prefix", SECRET, good],
      ["unknown version", SECRET, `v2,${good}`],
      ["version with no signature", SECRET, "v1,"],
      ["bare comma", SECRET, ","],
      ["spaces only", SECRET, "   "],
      ["signature of a different length", SECRET, `v1,${good.slice(0, 10)}`],
      ["unusable secret (not base64)", "whsec_!!!not base64!!!", `v1,${good}`],
      ["empty secret", "", `v1,${good}`],
      /* 🔴 THE ONE THAT WAS REALLY BROKEN: a truncated paste. `whsec_` with nothing after it decodes
         to a zero-length key and importKey THREW — which the handler does not catch, so Resend would
         have seen a 500 and retried for hours. Caught only once this loop stopped swallowing throws. */
      ["truncated secret (whsec_ and nothing else)", "whsec_", `v1,${good}`],
    ];
    /* ⛔ NO try/catch HERE, DELIBERATELY. Wrapping the call makes a throw indistinguishable from a
       refusal, and the difference is a 401 versus a retry storm. If this ever throws, the suite dies
       loudly, which is the correct outcome. */
    for (const [label, secret, header] of shapes) {
      ok(!(await verifySvix(secret, ID, TS, BODY, header)), `${label} → refused (never throws, never passes)`);
    }
  }

  console.log("\n── ⚠️ THE COMPARE IS LENGTH-SAFE AND VALUE-CORRECT ──");
  ok(timingSafeEqual("abc", "abc"), "equal strings compare equal");
  ok(!timingSafeEqual("abc", "abd"), "a differing last byte is caught (no early exit means no early PASS either)");
  ok(!timingSafeEqual("abc", "abcd"), "different lengths are refused");
  ok(!timingSafeEqual("", "a"), "empty vs non-empty is refused");
  ok(timingSafeEqual("", ""), "empty vs empty is equal (it is only reachable with an empty expected value, which HMAC never produces)");

  console.log(f ? `\n${f} FAILURES` : "\nALL PASS");
  if (f) process.exitCode = 1;
}

main();
