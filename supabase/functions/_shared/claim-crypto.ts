// Shared crypto helpers for the barber claim-token flow.
// The plaintext token is shown to the admin exactly once; the database only ever
// stores its SHA-256 hash, so a leaked DB row can't be turned back into a link.

/** URL-safe base64 (no padding) of raw bytes. */
export function toBase64Url(bytes: Uint8Array): string {
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Generate a new claim token: 32 CSPRNG bytes as a URL-safe base64 string. */
export function generateToken(): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(32)));
}

/** SHA-256 of a string, lowercase hex. Used to hash tokens before storage/lookup. */
export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const buf = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
