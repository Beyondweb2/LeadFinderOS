// One-off diagnostic: reproduce scan-services' EXACT raw-fetch + strip pipeline
// against a URL so we can see whether services/prices survive into the text the
// model actually receives — or whether the page is JS-rendered (prices absent).
//
// Usage: node scripts/diagnose-scan.mjs <url> [<url> ...]

const FETCH_TIMEOUT_MS = 8000;
const MAX_HTML_BYTES = 1024 * 1024;
const MAX_TEXT_CHARS = 60_000;

function isPrivateHostname(h) {
  if (["localhost", "127.0.0.1", "0.0.0.0", "::1", "metadata.google.internal"].includes(h)) return true;
  if (h.startsWith("169.254.") || h.startsWith("10.") || h.startsWith("192.168.")) return true;
  const m = h.match(/^172\.(\d+)\./);
  if (m && +m[1] >= 16 && +m[1] <= 31) return true;
  if (h.startsWith("fd") || h.startsWith("fe80")) return true;
  return false;
}
function normaliseUrl(raw) {
  let u = raw.trim();
  if (!u.startsWith("http://") && !u.startsWith("https://")) u = `https://${u}`;
  try {
    const p = new URL(u);
    if (!["http:", "https:"].includes(p.protocol)) return null;
    if (isPrivateHostname(p.hostname)) return null;
    return p;
  } catch { return null; }
}
async function fetchHtml(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { "User-Agent": "Mozilla/5.0 (compatible; LeadFinder/1.0)", Accept: "text/html" },
    });
    if (!res.ok || !res.body) return { html: null, status: res.status };
    const reader = res.body.getReader();
    let total = 0; const chunks = [];
    while (total < MAX_HTML_BYTES) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value); total += value.length;
    }
    reader.cancel();
    const dec = new TextDecoder();
    const html = chunks.map((c) => dec.decode(c, { stream: true })).join("") + dec.decode();
    return { html, status: res.status, bytes: total };
  } catch (e) {
    return { html: null, error: e.name === "AbortError" ? "timeout(8s)" : String(e.message || e) };
  } finally { clearTimeout(timeout); }
}
const BOOKING_WIDGET_PATH = /(booking-calendar|book-now|book-online|book-a|\/booking\/|\/bookings\/|\/book\/|schedule|appointment|calendar|service-page\/)/i;
function findServiceLinks(html, base, limit) {
  const re = /<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const baseHref = base.href.replace(/#.*$/, "");
  const scored = new Map();
  let m;
  while ((m = re.exec(html)) !== null) {
    const href = m[1]; const text = m[2].replace(/<[^>]+>/g, " ");
    const hay = `${href} ${text}`.toLowerCase();
    let score = -1;
    if (/price/.test(hay)) score = 3;
    else if (/menu/.test(hay)) score = 2;
    else if (/service/.test(hay)) score = 1;
    else if (/\bbook/.test(hay)) score = 0;
    if (score < 0) continue;
    try {
      const abs = new URL(href, base);
      if (abs.hostname !== base.hostname) continue;
      if (isPrivateHostname(abs.hostname)) continue;
      abs.hash = "";
      const clean = abs.href.replace(/#.*$/, "").replace(/\/+$/, "") || abs.href;
      if (clean === baseHref.replace(/\/+$/, "")) continue;
      if (score <= 1 && BOOKING_WIDGET_PATH.test(abs.pathname)) continue;
      const prev = scored.get(clean);
      if (prev === undefined || score > prev) scored.set(clean, score);
    } catch { continue; }
  }
  return [...scored.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([url]) => url);
}
function htmlToText(html) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&pound;/gi, "£")
    .replace(/&#163;/g, "£").replace(/&[a-z]+;/gi, " ")
    .replace(/[ \t\f\v]+/g, " ").replace(/\s*\n\s*/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}
function detectBuilder(html) {
  const sigs = [];
  if (/static\.wixstatic\.com|wix-code|X-Wix-|_wixCssStates|wixBiSession/i.test(html)) sigs.push("Wix");
  if (/squarespace\.com|static1\.squarespace|Static\.SQUARESPACE_CONTEXT/i.test(html)) sigs.push("Squarespace");
  if (/cdn\.shopify\.com|Shopify\.theme/i.test(html)) sigs.push("Shopify");
  if (/wp-content|wp-includes/i.test(html)) sigs.push("WordPress");
  if (/godaddy|websitebuilder|secureserver/i.test(html)) sigs.push("GoDaddy");
  if (/data-reactroot|__NEXT_DATA__|ng-version|id="root"/i.test(html) && !sigs.length) sigs.push("SPA/JS-app");
  return sigs;
}

const priceRe = /£\s?\d{1,4}(?:\.\d{2})?/g;

async function diagnose(rawUrl) {
  console.log("\n" + "=".repeat(78));
  console.log("URL:", rawUrl);
  const base = normaliseUrl(rawUrl);
  if (!base) { console.log("  ✗ invalid URL"); return; }

  const home = await fetchHtml(base.toString());
  if (!home.html) { console.log("  ✗ fetch failed:", home.error || `status ${home.status}`); return; }

  const builder = detectBuilder(home.html);
  const homeText = htmlToText(home.html);
  const homePrices = homeText.match(priceRe) || [];
  const rawHtmlPrices = (home.html.match(priceRe) || []).length;
  const textRatio = (homeText.length / home.html.length);

  console.log(`  homepage: ${home.bytes} bytes HTML → ${homeText.length} chars text  (text/html ratio ${(textRatio*100).toFixed(1)}%)`);
  console.log(`  builder signatures: ${builder.length ? builder.join(", ") : "none (looks like server-rendered HTML)"}`);
  console.log(`  £-prices in RAW HTML: ${rawHtmlPrices}   |   £-prices in STRIPPED TEXT: ${homePrices.length}`);
  if (homePrices.length) console.log(`    sample prices: ${[...new Set(homePrices)].slice(0, 12).join("  ")}`);

  const MAX_SUBPAGE_CHARS = 15_000, MAX_SUBPAGES = 3, HOMEPAGE_PRICE_SUFFICIENT = 3;
  let combined = homeText;
  const homepagePriceCount = (homeText.match(/£\s?\d/g) || []).length;

  if (homepagePriceCount >= HOMEPAGE_PRICE_SUFFICIENT) {
    console.log(`  homepage has ${homepagePriceCount} £ prices (>=${HOMEPAGE_PRICE_SUFFICIENT}) → SKIPPING subpages (menu is on the homepage)`);
  } else {
    const candidates = findServiceLinks(home.html, base, MAX_SUBPAGES);
    console.log(`  candidate subpages (ranked price>menu>service>book, booking widgets excluded): ${candidates.length ? candidates.join("  ") : "(none)"}`);
    for (const url of candidates) {
      const sub = await fetchHtml(url);
      if (!sub.html) { console.log(`    → ${url} fetch failed: ${sub.error || sub.status}`); continue; }
      const subText = htmlToText(sub.html).slice(0, MAX_SUBPAGE_CHARS);
      const subPrices = (subText.match(priceRe) || []).length;
      console.log(`    → ${url}: ${subText.length} chars (capped ${MAX_SUBPAGE_CHARS}), ${subPrices} £-prices`);
      combined += "\n\n----\n\n" + subText;
      if (combined.length >= MAX_TEXT_CHARS) break;
    }
  }
  combined = combined.slice(0, MAX_TEXT_CHARS);
  const totalPrices = (combined.match(priceRe) || []).length;

  // Verdict the model would face:
  let verdict;
  if (totalPrices >= 3) verdict = "PRICES PRESENT in fetched text → extraction SHOULD work (if empty, prompt/parse is the issue)";
  else if (builder.length && rawHtmlPrices === 0) verdict = `JS-RENDERED (${builder.join("/")}) — prices NOT in raw HTML → only headless rendering (3c) can read it`;
  else if (rawHtmlPrices === 0) verdict = "No £-prices anywhere in raw HTML — either no prices on page, image/PDF menu, or JS-rendered";
  else verdict = "Some prices in raw HTML but few after strip — check truncation / strip";
  console.log(`  >> VERDICT: ${verdict}`);

  // Show a snippet of the text around the first price (what the model sees).
  const firstPriceIdx = combined.search(priceRe);
  if (firstPriceIdx >= 0) {
    const snip = combined.slice(Math.max(0, firstPriceIdx - 120), firstPriceIdx + 240).replace(/\n/g, " ⏎ ");
    console.log(`  context around first price: …${snip}…`);
  }
}

const urls = process.argv.slice(2);
if (!urls.length) { console.log("pass one or more URLs"); process.exit(1); }
for (const u of urls) await diagnose(u);
