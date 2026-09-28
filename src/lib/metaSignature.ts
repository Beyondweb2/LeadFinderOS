// metaSignature — Meta's webhook signature check (X-Hub-Signature-256), in ONE place (2026-09-29).
//
// Meta signs the RAW request body with the app secret: "sha256=" + hex(HMAC-SHA256(appSecret, body)).
// ⛔ The HMAC is taken over the exact BYTES received, never a decoded-then-re-encoded string, so a
// payload carrying any non-ASCII character is judged on what Meta actually signed.
// ⛔ A missing header, a header without the "sha256=" prefix, a wrong length or a wrong digest are all
// refusals. An EMPTY secret never verifies anything (the caller decides what "not configured" means;
// whatsapp-status reports it to the admin instead of pretending).
// Edge-reachable: no imports. Uses Web Crypto (Deno and Node 20+ both have globalThis.crypto.subtle).

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function metaSignatureHex(body: Uint8Array, appSecret: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    'raw', new TextEncoder().encode(appSecret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, body);
  return [...new Uint8Array(mac)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

export async function validMetaSignature(body: Uint8Array, header: string | null | undefined, appSecret: string): Promise<boolean> {
  if (!appSecret) return false;
  if (typeof header !== 'string' || !header.startsWith('sha256=')) return false;
  const provided = header.slice('sha256='.length).trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(provided)) return false;
  return constantTimeEqual(await metaSignatureHex(body, appSecret), provided);
}
