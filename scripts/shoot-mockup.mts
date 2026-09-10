/* The screenshot driver. Policy lives in _shared/screenshot-policy.ts; this is Playwright only. */
import { chromium, type Page, type Browser } from 'playwright';
import { SHOT_WIDTH, SHOT_HEIGHT, SHOT_SCALE, NAV_TIMEOUT_MS, SETTLE_MS, IDLE_TIMEOUT_MS,
         hideCss, hideByBehaviourJs, shotRefusal, shotUrl } from
  '../supabase/functions/_shared/screenshot-policy.ts';
import { writeFileSync } from 'node:fs';

const sleep = (ms: number) => new Promise(r => setTimeout(r, ms));

/* `trusted` means "this document is OURS" — the rendered mockup on disk, never a prospect's URL.
   ⛔ It is an explicit argument rather than a loosened policy: shotRefusal must keep refusing
   file:// and aggregator URLs for every caller that is photographing someone else's site. */
export async function shoot(browser: Browser, website: string, outPath: string,
                            opts: { trusted?: boolean } = {}) {
  const refusal = opts.trusted ? null : shotRefusal(website);
  if (refusal) return { ok: false as const, refusal, ms: 0, bytes: 0 };
  const url = opts.trusted ? website : shotUrl(website);
  const t0 = Date.now();
  const ctx = await browser.newContext({
    viewport: { width: SHOT_WIDTH, height: SHOT_HEIGHT },
    deviceScaleFactor: SHOT_SCALE,
    // A real UA: some sites serve a stripped page to obvious bots, which would misrepresent them.
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    locale: 'en-GB', timezoneId: 'Europe/London',
  });
  const page: Page = await ctx.newPage();
  let note = '';
  try {
    await page.goto(url, { waitUntil: 'load', timeout: NAV_TIMEOUT_MS });
    /* ⛔ networkidle IS TRIED, NOT REQUIRED. Analytics polling and chat sockets mean many real
       sites never reach it; refusing those would refuse a large share of prospects. */
    await page.waitForLoadState('networkidle', { timeout: IDLE_TIMEOUT_MS })
      .catch(() => { note = 'never reached network-idle; shot anyway'; });
    await page.addStyleTag({ content: hideCss() });
    /* Second layer, after the CSS: catch a banner the selector list does not know about.
       Whatever it hides is logged — a silent DOM edit to a prospect's site is not on. */
    const hid = await page.evaluate(hideByBehaviourJs()).catch(() => []) as string[];
    if (Array.isArray(hid) && hid.length) note = (note ? note + '; ' : '') + `hid by behaviour: ${hid.join(', ')}`;
    /* Trigger lazy-loaded above-fold images, then return to the top. Without the scroll a
       lazy hero is captured as its placeholder — the same fault as the picker grid. */
    await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
    await sleep(400);
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.evaluate(() => (document as any).fonts?.ready).catch(() => {});
    await sleep(SETTLE_MS);
    const buf = await page.screenshot({ animations: 'disabled', caret: 'hide', scale: 'device' });
    writeFileSync(outPath, buf);
    return { ok: true as const, bytes: buf.length, ms: Date.now() - t0, note, url };
  } catch (e) {
    return { ok: false as const, refusal: 'error' as const, detail: String((e as Error).message).slice(0, 120), ms: Date.now() - t0, bytes: 0 };
  } finally { await ctx.close(); }
}

if (process.argv[2] === '--consistency') {
  /* Paul's requirement: prove the SAME URL returns a consistent size across three runs. */
  const sites = ['https://www.first4locks.co.uk/', 'https://www.starrkeys.net/', 'https://www.nottinghamlocksmith.org.uk/'];
  const b = await chromium.launch();
  for (const s of sites) {
    const runs: number[] = [];
    for (let i = 1; i <= 3; i++) {
      const r = await shoot(b, s, `/mnt/c/shots/c-${i}.png`);
      runs.push(r.ok ? r.bytes : -1);
      if (r.ok && r.note) console.log(`    note: ${r.note}`);
    }
    const min = Math.min(...runs), max = Math.max(...runs);
    const spread = max > 0 ? ((max - min) / max * 100) : 0;
    console.log(`${new URL(s).hostname.padEnd(30)} ${runs.join('  ')}  bytes   spread ${spread.toFixed(2)}%`);
  }
  await b.close();
}

/* ── The deliverable: their real site beside the mockup, one PNG ────────────────────────────
   ⚠️ THE MOCKUP IS RENDERED FROM THE POOL URLS AT FULL SIZE, NOT FROM THE REHOSTED SLOT ASSETS.
   The assets currently in the bucket were placed BEFORE the placeholder fix — First4locks' hero
   was rehosted from a `w_146,h_98,blur_2` Wix URL at 3,858 bytes. Rendering those would show a
   blurred hero and misrepresent the template. Same photos Paul chose, asked for at 1600px. */
if (process.argv[2] === '--compose') {
  const { readFileSync: rf } = await import('node:fs');
  const { renderPage, capData } = await import('../src/lib/mockupRender.ts');
  const { MOCKUP_MAX_SERVICES, MOCKUP_MAX_AREAS } = await import('../src/lib/mockupNiche.ts');
  const { imageVariant, PLACE_WIDTH } = await import('../supabase/functions/_shared/image-variant.ts');
  const spec = JSON.parse(rf(process.argv[3], 'utf8'));
  const tpl = rf('src/mockup/templates/locksmith.html', 'utf8');

  const data = capData({
    business: spec.business,
    services: spec.services,
    areas: spec.areas,
    slots: Object.fromEntries(Object.entries(spec.slotSources as Record<string, string>)
      .map(([k, u]) => [k, imageVariant(u, PLACE_WIDTH)])),
  }, { services: MOCKUP_MAX_SERVICES, areas: MOCKUP_MAX_AREAS });
  const html = renderPage(tpl, 'home', data);
  writeFileSync('/mnt/c/shots/mockup.html', html);

  const b = await chromium.launch();
  const site = await shoot(b, spec.website, '/mnt/c/shots/site.png');
  console.log('their site :', site.ok ? `${site.bytes} bytes in ${site.ms}ms${site.note ? ' — ' + site.note : ''}` : `REFUSED (${site.refusal})`);
  /* ⚠️ THE LINUX PATH, NOT THE WINDOWS ONE. Playwright runs inside WSL, so file:///C:/... does
     not exist for it; C:/ is only how PAUL opens the result in Windows Chrome. */
  const mockPath = process.env.MOCK_HTML ?? 'file:///mnt/c/shots/mockup.html';
  const mock = await shoot(b, mockPath, '/mnt/c/shots/mock.png', { trusted: true });
  console.log('the mockup :', mock.ok ? `${mock.bytes} bytes in ${mock.ms}ms` : `FAILED (${(mock as any).detail ?? mock.refusal})`);

  // Composite in the browser: no image library, and the labels are real text.
  const b64 = (p: string) => rf(p).toString('base64');
  const page = await (await b.newContext({ viewport: { width: 1700, height: 620 }, deviceScaleFactor: 2 })).newPage();
  await page.setContent(`<style>
      body{margin:0;background:#0b0d12;font:14px system-ui,-apple-system,Segoe UI,sans-serif;color:#e7ecf3}
      .w{display:flex;gap:18px;padding:18px}
      .c{flex:1;min-width:0}
      h2{margin:0 0 8px;font-size:14px;font-weight:600;letter-spacing:.02em}
      .t{color:#9aa7b8;font-weight:400}
      img{width:100%;display:block;border-radius:8px;border:1px solid #263041}
    </style>
    <div class="w">
      <div class="c"><h2>Their website today <span class="t">— first4locks.co.uk</span></h2>
        <img src="data:image/png;base64,${b64('/mnt/c/shots/site.png')}"></div>
      <div class="c"><h2>What we would build <span class="t">— same photos, their own details</span></h2>
        <img src="data:image/png;base64,${b64('/mnt/c/shots/mock.png')}"></div>
    </div>`);
  await new Promise(r => setTimeout(r, 300));
  const buf = await page.screenshot({ fullPage: true });
  writeFileSync('/mnt/c/shots/f4l.png', buf);
  console.log(`\nOPEN THIS:  file:///C:/shots/f4l.png   (${Math.round(buf.length / 1024)}KB)`);
  await b.close();
}
