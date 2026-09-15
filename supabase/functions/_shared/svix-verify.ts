/* ════════════════════════════════════════════════════════════════════════════════════════════════
   SVIX SIGNATURE VERIFICATION — the only gate on a public endpoint.

   ⛔ EXTRACTED INTO A LEAF SO IT CAN BE TESTED. resend-webhook/index.ts calls Deno.serve at module
   scope, so importing it from a test would start a server; the security-critical half would have
   been the one part nobody could exercise. This file imports nothing and runs anywhere.

   ⛔ IT FAILS CLOSED ON EVERY PATH. An unusable secret, a malformed header, an unknown version
   prefix and a wrong signature all return false. There is no branch that returns true because it
   could not tell — absence is not permission, least of all here.

   ⚠️ THE HEADER CARRIES A LIST. `svix-signature` is space-separated `v1,<sig>` pairs, because Svix
   rotates secrets by sending old and new together. Reading only the first would reject every
   request mid-rotation.
   ⚠️ THE COMPARISON IS CONSTANT-TIME. A fast exit on the first wrong byte leaks the signature one
   byte at a time to anyone willing to retry.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Constant-time compare. A fast exit on the first wrong byte leaks the signature. */
export function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function b64(bytes: ArrayBuffer): string {
  return btoa(String.fromCharCode(...new Uint8Array(bytes)));
}

/**
 * Verify a Svix-signed payload.
 *
 * ⚠️ `svix-signature` carries a SPACE-SEPARATED LIST of `v1,<sig>` — Svix rotates secrets by
 * sending both old and new. Checking only the first would reject every request mid-rotation.
 */
export async function verifySvix(secret: string, id: string, ts: string, body: string, header: string): Promise<boolean> {
  try {
    const raw = secret.startsWith("whsec_") ? secret.slice(6) : secret;
    const keyBytes = Uint8Array.from(atob(raw), (c) => c.charCodeAt(0));
    const key = await crypto.subtle.importKey("raw", keyBytes, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
    const expected = b64(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${id}.${ts}.${body}`)));
    for (const part of header.split(" ")) {
      const [version, sig] = part.split(",");
      if (version !== "v1" || !sig) continue;
      if (timingSafeEqual(sig, expected)) return true;
    }
    return false;
  } catch {
    /* ⛔ A THROW IS A REFUSAL, NEVER A 500. The catch started as `atob` only and that was not enough:
       `whsec_` with nothing after it — a truncated paste, the likeliest real mistake — decodes to an
       empty key and `importKey` throws "Zero-length key is not supported". The handler has no try
       around this call, so that surfaced as a 500, and a non-2xx makes Resend RETRY FOR HOURS. The
       whole body is guarded now: every unusable secret fails closed and quietly. */
    return false;
  }
}

