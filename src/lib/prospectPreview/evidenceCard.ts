/* ════════════════════════════════════════════════════════════════════════════════════════════════
   PROSPECT PREVIEW — the evidence card: one portrait image for WhatsApp.

   Not an audit report. Three beats a tradesperson reads on a phone in ten seconds:
     WE ASKED AI → (these firms came up, you didn't) → WE CHECKED YOUR SITE → SO WE REBUILT IT.
   The words come from copy.ts (and pass its claim check); this file only lays them out. The
   rebuilt beat can carry the mobile screenshot of their new homepage, so the card alone shows
   the improvement without a click.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import type { CardCopy } from './copy.ts';
import { esc, icon, FONT_LINK } from './html.ts';
import { paletteFrom } from './color.ts';

export const CARD_WIDTH = 1080;

export function renderEvidenceCard(c: CardCopy, opts: { businessName: string; brandPrimary?: string | null; previewImageSrc?: string | null }): string {
  const pal = paletteFrom(opts.brandPrimary ?? null, null);
  const shot = opts.previewImageSrc && /^(?:https:\/\/|data:image\/(?:png|jpeg|webp);base64,)/.test(opts.previewImageSrc) ? opts.previewImageSrc : null;
  const q = c.question.replace(/^["“]|["”]$/g, '');
  return `<!doctype html><html lang="en-GB"><head><meta charset="utf-8"><meta name="viewport" content="width=${CARD_WIDTH}"><meta name="robots" content="noindex">
${FONT_LINK}
<style>
*{box-sizing:border-box}body{margin:0;width:${CARD_WIDTH}px;background:#0b1220;color:#fff;font:500 30px/1.4 'Inter',system-ui,sans-serif;-webkit-font-smoothing:antialiased}
.card{padding:72px 72px 64px}
.lab{font:800 24px/1 'Plus Jakarta Sans',sans-serif;letter-spacing:.16em;text-transform:uppercase;color:#fbbf24;display:flex;align-items:center;gap:14px}
.lab:after{content:"";flex:1;height:2px;background:rgba(255,255,255,.12)}
.q{font:800 58px/1.12 'Plus Jakarta Sans',sans-serif;letter-spacing:-.02em;margin:26px 0 14px}
.q span{color:#fbbf24}
.eng{color:rgba(255,255,255,.55);font-size:25px;margin:0 0 40px}
.rec{background:#fff;color:#0f172a;border-radius:28px;padding:34px 38px 30px}
.rec h3{margin:0 0 18px;font:700 25px/1 'Inter',sans-serif;color:#64748b;letter-spacing:.04em;text-transform:uppercase}
.rec ol{list-style:none;margin:0;padding:0;display:grid;gap:14px}
.rec li{display:flex;align-items:center;gap:20px;font:700 36px/1.2 'Plus Jakarta Sans',sans-serif;letter-spacing:-.01em}
.rec li b{flex:none;display:grid;place-items:center;width:52px;height:52px;border-radius:14px;background:#e2e8f0;color:#334155;font-size:25px}
.miss{margin-top:24px;padding-top:22px;border-top:2px dashed #e2e8f0;display:flex;align-items:center;gap:18px;font:700 32px/1.25 'Inter',sans-serif;color:#b91c1c}
.miss i{flex:none;display:grid;place-items:center;width:52px;height:52px;border-radius:50%;background:#fee2e2;color:#b91c1c}
.sec{margin-top:52px}
.iss{list-style:none;margin:24px 0 0;padding:0;display:grid;gap:16px}
.iss li{display:flex;gap:18px;align-items:flex-start;font:600 32px/1.3 'Inter',sans-serif}
.iss li i{flex:none;margin-top:2px;display:grid;place-items:center;width:46px;height:46px;border-radius:12px;background:rgba(251,191,36,.14);color:#fbbf24}
.bridge{margin:22px 0 0;color:rgba(255,255,255,.66);font-size:27px;line-height:1.45}
.rebuilt{margin-top:52px;background:${pal.deep};border:2px solid rgba(255,255,255,.1);border-radius:30px;padding:40px;display:flex;gap:36px;align-items:center}
.rebuilt .txt{flex:1}
.rebuilt h2{margin:18px 0 14px;font:800 44px/1.1 'Plus Jakarta Sans',sans-serif;letter-spacing:-.02em}
.rebuilt p{margin:0;color:rgba(255,255,255,.75);font-size:26px}
.phone{flex:none;width:300px;border-radius:40px;padding:12px;background:#111827;box-shadow:0 30px 60px -20px rgba(0,0,0,.7);outline:2px solid rgba(255,255,255,.14)}
.phone img{display:block;width:100%;border-radius:30px;aspect-ratio:390/780;object-fit:cover;object-position:top}
</style></head><body><div class="card">
<div class="lab">${esc(c.askedLabel)}</div>
<div class="q"><span>“</span>${esc(q)}<span>”</span></div>
<p class="eng">${esc(c.engineLine)}</p>
<div class="rec"><h3>${esc(c.recommendedLabel)}</h3><ol>${c.competitors.map((n, i) => `<li><b>${i + 1}</b>${esc(n)}</li>`).join('')}</ol>
<div class="miss"><i>${icon('x', 28)}</i>${esc(c.notNamedLine)}</div></div>
<div class="sec"><div class="lab">${esc(c.checkedLabel)}</div>
${c.issues.length ? `<ul class="iss">${c.issues.map((l) => `<li><i>${icon('alert', 26)}</i>${esc(l)}</li>`).join('')}</ul>` : ''}
<p class="bridge">${esc(c.bridgeLine)}</p></div>
<div class="rebuilt"><div class="txt"><div class="lab" style="color:${pal.fromBrand ? '#fff' : '#fbbf24'}">${esc(c.rebuiltLabel)}</div><h2>${esc(opts.businessName)}</h2><p>${esc(c.rebuiltLine)}</p></div>
${shot ? `<div class="phone"><img src="${esc(shot)}" alt=""></div>` : ''}</div>
</div></body></html>`;
}
