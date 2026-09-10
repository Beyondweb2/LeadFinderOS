/* ════════════════════════════════════════════════════════════════════════════════════════════════
   ASK AN IMAGE CDN FOR THE SIZE YOU ACTUALLY WANT.

   🔴 WHY THIS EXISTS — A REAL BUG, FOUND BY PAUL LOOKING AT THE PICKER (2026-09-10).
   He said "some of the images are blurry not sure why". They were, and it was not their
   photography: Starr Keys' site is WIX, and Wix serves a deliberately blurred LOW-QUALITY IMAGE
   PLACEHOLDER in the `src` attribute, swapping in the real photo with JavaScript. The harvested
   URLs literally contained the reason:
       /media/…~mv2.jpg/v1/fill/w_73,h_49,al_c,q_80,…,blur_2,enc_avif,…/…jpg
                                ^^^^^^^^^                   ^^^^^^
                                73x49 pixels                blur_2
   TEN OF TWELVE carried `blur_2`. So the grid showed placeholders, and — worse — the vision pass
   scored them, flagging nine as "blurry". The quality scores were grading MY HARVESTING, not their
   work. A measurement of the wrong thing that looks exactly like a measurement of the right thing.

   ⛔ AND THE OBVIOUS FIX IS ALSO WRONG. Stripping the transform gives the ORIGINAL, which for those
   twelve is 2-7.5 MB each — 4000x3000, 5760x3840, 5861x2288. Measured. Twelve of those is ~50MB in
   one grid, which is precisely why Paul also said it was "abit slow to load in". The LQIP is too
   small and the original is far too big.
   ⛔ SO THE ANSWER IS TO ASK FOR A SIZE. These CDNs encode the transform in the URL, so a specific
   width can be requested: a ~400px thumbnail for the grid, ~1600px for the copy that gets placed
   and re-hosted. One fix, both complaints.

   ⚠️ EXTENSIBLE BY DESIGN AND HONEST WHEN IT CANNOT HELP. An unrecognised host is returned
   UNCHANGED rather than guessed at — a mangled URL is worse than a large one, because it 404s and
   the photo vanishes instead of merely loading slowly.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Below this, a harvested image is almost certainly a placeholder rather than a photograph. */
export const LQIP_MAX_EDGE = 200;

/**
 * A URL for the same image at roughly `width` px, where the CDN allows it.
 *
 * Returns the input unchanged when the host is not recognised.
 */
export function imageVariant(rawUrl: string, width: number): string {
  const w = Math.max(64, Math.min(4096, Math.round(width)));
  let url: URL;
  try { url = new URL(rawUrl); } catch { return rawUrl; }

  /* ── Wix ──────────────────────────────────────────────────────────────────────────────────
     /media/<id>/v1/<op>/<params>/<name> — the params carry w_, h_, q_, blur_ and enc_.
     ⛔ REBUILT RATHER THAN PATCHED. Editing the existing params in place would preserve
     `blur_2` and the tiny h_, which is the bug. `fit` rather than `fill` so nothing is cropped:
     the operator is choosing a photo, and a crop decided by a URL is a layout decision this code
     has no business making. */
  if (/(?:^|\.)wixstatic\.com$/i.test(url.hostname)) {
    const m = url.pathname.match(/^(\/media\/[^/]+)\/v1\/[^/]+\/[^/]+\/(.+)$/);
    if (m) return `${url.origin}${m[1]}/v1/fit/w_${w},h_${w},al_c,q_85,enc_auto/${m[2]}`;
    // Already a bare /media/<id> URL (the original): add a transform to bound the size.
    const bare = url.pathname.match(/^(\/media\/[^/]+)$/);
    if (bare) return `${url.origin}${bare[1]}/v1/fit/w_${w},h_${w},al_c,q_85,enc_auto/image.jpg`;
    return rawUrl;
  }

  /* ── Google (Maps listing photos, and Google-hosted site images) ──────────────────────────
     Size lives in a `=w1920-h1080-k-no` suffix on the PATH, not in the query. */
  if (/(?:^|\.)(?:googleusercontent\.com|ggpht\.com)$/i.test(url.hostname)) {
    const path = url.pathname.replace(/=[-\w]+$/, "");
    return `${url.origin}${path}=w${w}-h${w}`;
  }

  /* ── Squarespace ──────────────────────────────────────────────────────────────────────── */
  if (/(?:^|\.)squarespace-cdn\.com$/i.test(url.hostname)) {
    url.searchParams.set("format", `${w}w`);
    return url.toString();
  }

  /* ── WordPress / generic "-WIDTHxHEIGHT" size suffix ──────────────────────────────────────
     ⚠️ ONLY STRIPPED, NEVER REWRITTEN TO A DIFFERENT SIZE. WordPress generates a fixed set of
     sizes at upload; asking for one that was never generated 404s. Removing the suffix reaches
     the original, which always exists — accepting that it may be large. */
  const wpm = url.pathname.match(/^(.*)-\d{2,4}x\d{2,4}(\.(?:jpe?g|png|webp|avif))$/i);
  if (wpm) return `${url.origin}${wpm[1]}${wpm[2]}${url.search}`;

  return rawUrl;
}

/**
 * Is this URL a placeholder rather than a photograph, judged from the URL alone?
 *
 * ⚠️ URL-ONLY AND DELIBERATELY SO — it runs before anything is fetched, so it costs nothing and
 * can bound a pool before 50MB is downloaded. It cannot catch a placeholder that is honestly
 * named, which is why the pool ALSO demotes rather than deletes: a wrong guess here ranks a photo
 * last instead of losing it.
 */
export function looksLikePlaceholder(rawUrl: string): boolean {
  let url: URL;
  try { url = new URL(rawUrl); } catch { return false; }
  const p = url.pathname;
  // An explicit blur transform is conclusive: nobody blurs a photograph they want shown.
  if (/[,/]blur_\d/i.test(p)) return true;
  // A declared width or height under LQIP_MAX_EDGE in a transform segment.
  const wh = p.match(/[,/](?:w|h)_(\d{1,4})/gi) ?? [];
  const nums = wh.map((s) => Number(s.replace(/[^\d]/g, ""))).filter((n) => n > 0);
  if (nums.length && Math.max(...nums) <= LQIP_MAX_EDGE) return true;
  // A "-64x64" style suffix at thumbnail scale.
  const sfx = p.match(/-(\d{2,4})x(\d{2,4})\.(?:jpe?g|png|webp|avif)$/i);
  if (sfx && Math.max(Number(sfx[1]), Number(sfx[2])) <= LQIP_MAX_EDGE) return true;
  return false;
}

/** Widths used across the mockup flow. Named so the two consumers cannot drift. */
export const GRID_WIDTH = 420;    // the picker's thumbnail grid
export const PLACE_WIDTH = 1600;  // the copy that is re-hosted and rendered
