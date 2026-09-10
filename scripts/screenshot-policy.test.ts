/* ============================================================
   WHO WE REFUSE TO PHOTOGRAPH, AND THE SHAPE OF THE SHOT.

   🔴 THE GATE THAT MATTERS: shooting a prospect's Facebook page and captioning it "your website"
   is a false claim made to the one person certain to catch it. Measured over the real book
   (3,203 leads, 2026-09-11): 2,714 shootable, 420 no_website, 69 aggregator. On the ENGAGED
   subset the mockup actually runs for — 500 leads — it is 432 shootable, 59 no_website,
   9 aggregator.
   ⛔ A no-website lead is a SKIP WITH A REASON, never an error: §9 records that it is the best
   DELIVERY case (nothing to migrate), just the wrong opening pitch.
   ============================================================ */
import { shotRefusal, shotUrl, hideCss, hideByBehaviourJs, HIDE_SELECTORS,
         SHOT_WIDTH, SHOT_HEIGHT, SETTLE_MS, NAV_TIMEOUT_MS } from "../supabase/functions/_shared/screenshot-policy.ts";

let f = 0;
const ok = (c: boolean, l: string) => { if (!c) f++; console.log(`${c ? "PASS" : "FAIL"} ${l}`); };

/* ── Refusals ───────────────────────────────────────────────────────────────────────────── */
ok(shotRefusal("https://www.facebook.com/somelocksmith") === "website_is_aggregator", "Facebook is refused");
ok(shotRefusal("https://www.instagram.com/x") === "website_is_aggregator", "Instagram is refused");
ok(shotRefusal("https://www.checkatrade.com/x") === "website_is_aggregator", "Checkatrade is refused");
ok(shotRefusal("https://www.first4locks.co.uk/") === null, "a real business site is shot");

/* ⛔ A FREE SUBDOMAIN IS STILL THEIR OWN WEBSITE (§9, decided 2026-08-05). Refusing wixsite.com
   would refuse exactly the customers whose site we would rebuild. */
ok(shotRefusal("https://richlloyd80.wixsite.com/rllocksmiths") === null, "a wixsite subdomain is THEIR site, not an aggregator");

/* Absence — never an error, always a named skip (the absent-value law). */
ok(shotRefusal("") === "no_website", "empty string is no_website");
ok(shotRefusal("   ") === "no_website", "whitespace is no_website");
ok(shotRefusal(null) === "no_website", "null is no_website");
ok(shotRefusal(undefined) === "no_website", "undefined is no_website");
ok(shotRefusal("javascript:alert(1)") === "not_http", "a non-http scheme is refused, not navigated");
ok(shotRefusal("file:///etc/passwd") === "not_http", "⛔ file:// is refused — a shot must never read the local disk");
ok(shotRefusal("not a url") === "not_http", "junk is refused, never shot");
ok(shotRefusal("//evil.com/x") === "not_http", "a protocol-relative URL is refused, not https-prefixed");
ok(shotRefusal("data:text/html,x") === "not_http", "a data: URI is refused");
ok(shotRefusal("localhost:8080") === "not_http", "a hostname with no dot is not a public website");

/* A bare domain is normal in this table and must still be shootable. */
ok(shotRefusal("first4locks.co.uk") === null, "a bare domain is accepted");
ok(shotUrl("first4locks.co.uk") === "https://first4locks.co.uk", "a bare domain gets https");
ok(shotUrl("http://x.co.uk/a") === "http://x.co.uk/a", "an explicit scheme is left alone");

/* ── The shot's shape ───────────────────────────────────────────────────────────────────── */
ok(SHOT_WIDTH === 1280 && SHOT_HEIGHT === 800, "a FIXED viewport — this is the byte-variance fix, not a preference");
ok(SETTLE_MS > 0, "a settle delay exists (fonts swap and carousels advance after load)");
ok(NAV_TIMEOUT_MS > 0 && NAV_TIMEOUT_MS <= 30_000, "navigation is bounded — a reply is waiting on it");

/* ── What gets hidden ───────────────────────────────────────────────────────────────────── */
const css = hideCss();
ok(/onetrust/i.test(css), "OneTrust is hidden");
ok(/consent-banner/i.test(css), "🔴 Wix's consent-banner is hidden — it rendered in the FIRST real screenshot and was missed");
ok(/intercom|tidio|hubspot/i.test(css), "chat widgets are hidden");
ok(/animation-duration:\s*0s/.test(css), "animations are frozen — a mid-flight carousel changes the image every run");
ok(!/click|\.accept/i.test(css), "⛔ nothing CLICKS a consent button — we do not answer a cookie prompt on someone else's site");
ok(HIDE_SELECTORS.every((s) => typeof s === "string" && s.length > 0), "no empty selector can blank the whole page");

const js = hideByBehaviourJs();
ok(/position/.test(js) && /400/.test(js) && /0\.4/.test(js),
   "the heuristic is bounded by position, text length AND height — an unbounded one would edit their website");
ok(/return hidden/.test(js), "it reports what it hid, so a DOM edit on a prospect's site is never silent");

console.log(f === 0 ? "\nOK all screenshot-policy assertions hold" : `\n${f} FAILED`);
if (f) process.exit(1);
