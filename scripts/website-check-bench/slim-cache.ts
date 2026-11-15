// MAKE THE SAVED SITES SMALL ENOUGH TO KEEP IN GIT (2026-11-15, docs/WEBSITE_CHECK_ACCURACY.md).
//
// The body of every inline <script> (except JSON-LD) and <style> is replaced by spaces of the SAME length: the page's size,
// its tags and every offset stay as they were, so the crawl reads it exactly as before (proved: a replay before and after
// gives identical findings), and spaces compress to almost nothing. Run once after recording.
//   node --import tsx scripts/website-check-bench/slim-cache.ts
import { gunzipSync, gzipSync } from 'node:zlib';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { CACHE_DIR } from './net.ts';

const blank = (html: string) => html
  .replace(/(<script\b(?![^>]*application\/ld\+json)[^>]*>)([\s\S]*?)(<\/script>)/gi, (_m, a, b, c) => a + ' '.repeat(b.length) + c)
  .replace(/(<style\b[^>]*>)([\s\S]*?)(<\/style>)/gi, (_m, a, b, c) => a + ' '.repeat(b.length) + c);

for (const f of readdirSync(CACHE_DIR).filter((x) => x.endsWith('.json.gz'))) {
  const file = path.join(CACHE_DIR, f);
  const saved = JSON.parse(gunzipSync(readFileSync(file)).toString('utf8')) as Record<string, { b64: string; ct: string | null }>;
  for (const [k, s] of Object.entries(saved)) {
    if (!s.b64) continue;
    if (k.startsWith('RENDER')) {
      try { const j = JSON.parse(Buffer.from(s.b64, 'base64').toString('utf8')); if (typeof j.result === 'string') { j.result = blank(j.result); s.b64 = Buffer.from(JSON.stringify(j)).toString('base64'); } } catch { /* not JSON */ }
    } else if (/html/i.test(s.ct ?? '')) {
      const buf = Buffer.from(s.b64, 'base64');
      const text = buf.toString('utf8');
      // Only when the bytes are plain UTF-8 (re-encoding must not change the size the crawl measures).
      if (Buffer.byteLength(text, 'utf8') === buf.length) s.b64 = Buffer.from(blank(text), 'utf8').toString('base64');
    }
  }
  writeFileSync(file, gzipSync(Buffer.from(JSON.stringify(saved)), { level: 9 }));
  console.log(f, readFileSync(file).length);
}
