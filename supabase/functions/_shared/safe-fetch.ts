/* ════════════════════════════════════════════════════════════════════════════════════════════
   SAFE SERVER-SIDE PAGE FETCH — a dependency-free leaf.

   The same SSRF guard and capped body reader as _shared/site-research.ts (isPublicHttpUrl,
   readCapped), in a leaf so directory-presence does not pull site-research's closure (the audit
   report and hook stack) into its bundle — importing site-research made directory-presence one of the
   functions to redeploy whenever those modules change.
   ⚠️ TWO COPIES UNTIL site-research IMPORTS THIS. Owed, not done here: switching site-research over
   means redeploying warm-lead-reply and voice-note-script, which other sessions own
   (docs/directory-presence.md §11). Change both together until then.
   ════════════════════════════════════════════════════════════════════════════════════════════ */

const MAX_BODY_BYTES = 1_000_000;

/** Public http(s) only: a loopback / private-range address is refused rather than followed. */
export function isPublicHttpUrl(raw: string): boolean {
  try {
    const u = new URL(raw);
    if (!/^https?:$/.test(u.protocol)) return false;
    const h = u.hostname.toLowerCase();
    if (h === "localhost" || h.endsWith(".local") || h.endsWith(".internal")) return false;
    if (/^\d+\.\d+\.\d+\.\d+$/.test(h)) {
      const [a, b] = h.split(".").map(Number);
      if (a === 10 || a === 127 || a === 0 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168)) return false;
    }
    if (h.startsWith("[") || h.includes(":")) return false;
    return true;
  } catch { return false; }
}

/** The body, at most MAX_BODY_BYTES, decoded as UTF-8. Whatever arrived before a read error is kept. */
export async function readCapped(res: Response): Promise<string> {
  if (!res.body) return await res.text().catch(() => "");
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < MAX_BODY_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      if (value) { chunks.push(value); total += value.byteLength; }
    }
  } catch { /* keep what arrived */ } finally { try { await reader.cancel(); } catch { /* closed */ } }
  const joined = new Uint8Array(Math.min(total, MAX_BODY_BYTES));
  let at = 0;
  for (const c of chunks) { const n = Math.min(c.byteLength, joined.length - at); if (n <= 0) break; joined.set(c.subarray(0, n), at); at += n; }
  return new TextDecoder("utf-8", { fatal: false }).decode(joined);
}
