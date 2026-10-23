import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { REMEASURE_CLAIM_SENTENCE } from '../src/lib/findableOffer.ts';
const sp = process.argv[2];
const codes = readdirSync(`${sp}/qa2`).filter((f) => f.endsWith('.html')).map((f) => f.replace('.html', ''));
const get = async (c: string) => (await fetch(`https://ruusxpkkmwtljxxulhbq.supabase.co/functions/v1/render-audit-report?slug=${c}&preview=1`)).text();
const cta = (h: string) => { const i = h.indexOf('<section class="cta">'); return i < 0 ? '' : h.slice(i, h.indexOf('</section>', i)); };
const unent = (x: string) => x.replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"');
const guarantee = REMEASURE_CLAIM_SENTENCE.replace(/'/g, '&#39;');
let pass = 0;
const fails: string[] = [];
for (const c of codes) {
  let h = '';
  for (let i = 0; i < 3; i++) {
    h = await get(c);
    if (h.includes('Want to improve your AI visibility?')) break;
    await new Promise((z) => setTimeout(z, 20000));
  }
  writeFileSync(`${sp}/live3/${c}.html`, h);
  const s = cta(h);
  const biz = unent((h.match(/<div class="q4-biz">([^<]+)<\/div>/) || [])[1] ?? '');
  const start = (s.match(/<a class="cta-btn start"[^>]*>([^<]+)<\/a>/) || [])[1] ?? '';
  const wa = unent((s.match(/<a class="cta-btn wa" href="([^"]+)"[^>]*>Ask me anything<\/a>/) || [])[1] ?? '');
  const waText = decodeURIComponent(wa.split('?text=')[1] ?? '');
  const checks = {
    heading: s.includes('<h3>Want to improve your AI visibility?</h3>'),
    button: start === 'Improve AI visibility',
    noPrice: !/£|&pound;|\d/.test(start),
    call: s.includes('<button type="submit" class="cta-btn call">Request a call</button>'),
    whatsapp: wa.startsWith('https://wa.me/447943262742?text=') && biz.length > 0 && waText.includes(biz),
    guarantee: s.includes(guarantee),
    footer: h.includes('<footer class="site-foot">'),
  };
  if (Object.values(checks).every(Boolean)) pass++;
  else fails.push(`${c}: ${JSON.stringify(checks)} start="${start}"`);
}
console.log(`six-answer reports with the new CTA verified: ${pass}/${codes.length}`);
fails.forEach((f) => console.log('FAIL', f));
const sample = cta(readFileSync(`${sp}/live3/qx36cj.html`, 'utf8'));
const href = unent((sample.match(/<a class="cta-btn wa" href="([^"]+)"/) || [])[1] ?? '');
console.log('sample WhatsApp link:', href.split('?')[0], '| prefill:', decodeURIComponent(href.split('?text=')[1] ?? ''));
