/* ════════════════════════════════════════════════════════════════════════════════════════════════
   WHAT TO SHOOT, HOW BIG, AND WHAT TO HIDE — the policy, separated from the driver.

   🔴 WHY IT IS ITS OWN FILE. The screenshot will eventually run server-side (Cloudflare Browser
   Rendering, which drives Puppeteer) while it runs locally under Playwright today. Those are two
   different drivers, and if each carries its own idea of the viewport, the settle rules and the
   cookie-banner list, the picture Paul approves locally is not the picture a prospect receives.
   The DRIVER changes; the POLICY does not.

   ⛔ ABOVE THE FOLD, AT A FIXED VIEWPORT — NOT FULL PAGE. The decision and the reasoning:
     1. THIS IS THE VARIANCE FIX, not merely a framing choice. A full-page shot's height is
        whatever the page happened to lay out, so the SAME URL yields a different image every run
        — which is exactly the 769,000 vs 313,782 byte swing that started this. A fixed viewport
        removes the height variable by construction.
     2. It is what the pitch is ABOUT. The asset says "this is what someone sees when they land on
        you". That judgement happens above the fold, in about three seconds. A 6,000px full-page
        capture measures something nobody experiences.
     3. It has to survive WhatsApp. The composite puts their site beside the mockup; two 6,000px
        columns become unreadable slivers at the size WhatsApp actually renders an image.
     4. Two images of the SAME aspect ratio can be composited honestly. Different heights force a
        crop or a squash, and either one is us editing their website before showing it to them.
   ⚠️ THE COST, STATED: a long homepage's lower content is not shown. Accepted — the mockup is not
   a content audit, and cropping is visible and honest where squashing is not.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import { isAggregatorUrl } from "./aggregators.ts";

/** Desktop, 16:10. Wide enough that a site renders its real desktop layout rather than a
 *  hamburger menu; short enough to stay legible in a side-by-side composite. */
export const SHOT_WIDTH = 1280;
export const SHOT_HEIGHT = 800;

/** 2 gives a crisp image on a phone screen without quadrupling the byte size. */
export const SHOT_SCALE = 2;

/** Hard ceiling on one navigation. A prospect's reply is waiting on this. */
export const NAV_TIMEOUT_MS = 25_000;

/** After the network goes quiet, wait this long before shooting.
 *  ⚠️ MEASURED, NOT GUESSED — see screenshot-consistency in the report: at 0ms the same URL
 *  varied run to run because fonts swapped and hero carousels advanced mid-capture. */
export const SETTLE_MS = 1_200;

/** How long to allow for the network to fall quiet before giving up and shooting anyway.
 *  ⛔ GIVING UP AND SHOOTING IS DELIBERATE. Sites with analytics polling or a live-chat socket
 *  NEVER reach network-idle, and refusing to shoot them would refuse a large share of real
 *  businesses. A slightly early picture beats no picture. */
export const IDLE_TIMEOUT_MS = 8_000;

/* ── What must not appear in the picture ─────────────────────────────────────────────────────
   ⚠️ HIDDEN WITH CSS, NEVER CLICKED. Clicking "Accept" on a prospect's cookie banner is us
   making a consent choice on someone else's site from an automated browser. Hiding the element
   changes nothing on their end and cannot mis-click a link. */
export const HIDE_SELECTORS = [
  // Cookie and consent, by the ids and classes the common platforms actually ship.
  "#onetrust-consent-sdk", "#onetrust-banner-sdk", ".onetrust-pc-dark-filter",
  "#CybotCookiebotDialog", "#CybotCookiebotDialogBodyUnderlay",
  "#cookie-law-info-bar", "#cookie-notice", "#cookieConsent", "#cookiescript_injected",
  "#gdpr-cookie-message", "#moove_gdpr_cookie_info_bar", "#catapult-cookie-bar",
  "#usercentrics-root", "#cmpwrapper", "#didomi-host", "#hs-eu-cookie-confirmation",
  "[id*='cookie-banner']", "[class*='cookie-banner']", "[class*='cookie-consent']",
  "[aria-label*='cookie' i]",
  /* ⛔ WIX, AND IT WAS MISSED FIRST TIME ROUND. The banner rendered in the very first
     First4locks screenshot; the list above had 'cookie-consent' but Wix names it
     `data-hook="consent-banner-root"` with no "cookie" anywhere in the markup. That is why the
     heuristic below exists: a hand-written selector list is always one platform behind. */
  "[data-hook*='consent-banner']", "[class*='consent-banner']", "[data-hook='cookie-banner']",
  // Live chat and messenger widgets.
  "#tidio-chat", "#hubspot-messages-iframe-container", "#intercom-container",
  "#drift-widget", "#crisp-client", "#tawkchat-container", "#chat-widget-container",
  ".fb_dialog", "#fb-root", "#launcher", "#livechat-compact-container",
  "[id*='livechat' i]", "[class*='chat-widget' i]", "[id*='whatsapp-button' i]",
  // Newsletter / exit-intent overlays and the scroll locks they bring.
  "[class*='exit-intent' i]", "[id*='popup-overlay' i]", "[class*='modal-backdrop' i]",
];

/** CSS injected before the shot. Hides the furniture AND freezes motion. */
export function hideCss(): string {
  return `
    ${HIDE_SELECTORS.join(",\n    ")} {
      display: none !important; visibility: hidden !important; opacity: 0 !important;
    }
    /* ⛔ FREEZING MOTION IS HALF THE CONSISTENCY FIX. A hero carousel or a fade-in that is
       mid-flight when the shutter falls changes the image every single run. */
    *, *::before, *::after {
      animation-duration: 0s !important; animation-delay: 0s !important;
      animation-iteration-count: 1 !important;
      transition-duration: 0s !important; transition-delay: 0s !important;
      scroll-behavior: auto !important;
    }
    /* An overlay often locks the body; unlock it so the page renders at its real height. */
    html, body { overflow: visible !important; position: static !important; }
  `;
}

/* ── Who we refuse to photograph ─────────────────────────────────────────────────────────── */

export type ShotRefusal =
  | "no_website"
  | "website_is_aggregator"
  | "not_http";

/**
 * Should we screenshot this at all?
 *
 * 🔴 THE AGGREGATOR CHECK RUNS FIRST AND IT IS NOT A TIDINESS RULE. 228 of 969 leads have no
 * website and 49 of those are directory-only (§9). Shooting a Facebook page and captioning it
 * "your website" is a false claim made to the person best placed to catch it — and it is the
 * exact fault that once fired a $0.12 SEO scan against facebook.com.
 * ⚠️ A no-website lead is NOT a failure, it is a different product (§9: the best delivery case).
 * The caller must treat these as skips with a reason, never as errors.
 */
export function shotRefusal(website: string | null | undefined): ShotRefusal | null {
  const raw = (website ?? "").trim();
  if (!raw) return "no_website";
  /* 🔴 THE PREPEND IS ONLY SAFE FOR A BARE DOMAIN, AND A TEST CAUGHT IT NOT BEING SO.
     Blindly writing `https://` in front of anything without an http prefix turned
     "file:///etc/passwd" into "https://file:///etc/passwd", WHICH PARSES — so the refusal
     returned null and the driver would have navigated to it. Same for a protocol-relative
     "//evil.com/x". So: any scheme that is not http(s) is refused outright, and only a value
     carrying no scheme at all is allowed the prefix. */
  if (/^[a-z][a-z0-9+.-]*:/i.test(raw) && !/^https?:\/\//i.test(raw)) return "not_http";
  if (raw.startsWith("//")) return "not_http";
  let u: URL;
  try { u = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`); } catch { return "not_http"; }
  if (!["http:", "https:"].includes(u.protocol)) return "not_http";
  // A hostname with no dot is not a public website (it is "localhost", or a parse artefact).
  if (!u.hostname.includes(".")) return "not_http";
  if (isAggregatorUrl(u.href)) return "website_is_aggregator";
  return null;
}

/** The URL actually navigated to (bare domains in the lead table are common). */
export function shotUrl(website: string): string {
  const raw = website.trim();
  /* ⚠️ Call this ONLY on a value shotRefusal has cleared — the two share the prefix rule so a
     caller cannot navigate to something the gate would have refused. */
  return /^https?:\/\//i.test(raw) ? raw : `https://${raw}`;
}

/* ── The second layer: find the banner by what it DOES, not what it is called ────────────────
   🔴 THE SELECTOR LIST WILL ALWAYS BE ONE PLATFORM BEHIND, and that is not a hypothetical — Wix
   proved it on the first real screenshot. So after the CSS, this runs in the page and hides
   anything BEHAVING like a consent bar: pinned in place, mentioning cookies or consent, and
   small enough to be a bar rather than the content.

   ⛔ THE THREE BOUNDS ARE WHAT KEEP IT FROM EDITING SOMEONE'S WEBSITE. A heuristic that hid a
   real section would misrepresent the prospect's site to the prospect — the one person certain
   to notice. So: it must be position fixed/sticky/absolute (page content almost never is), its
   text must be under 400 characters (an article about cookies is not a banner), and it must
   occupy under 40% of the viewport height (anything bigger is the page, not a bar).
   ⚠️ It RETURNS WHAT IT HID so the caller can log it. A silent DOM edit on a prospect's site is
   not something to do without a record. */
export const COOKIE_TEXT_RE = "(cookie|consent|gdpr)";

export function hideByBehaviourJs(): string {
  return `(() => {
    const hidden = [];
    const re = new RegExp(${JSON.stringify(COOKIE_TEXT_RE)}, "i");
    const vh = window.innerHeight || 800;
    for (const el of Array.from(document.querySelectorAll("body *"))) {
      const t = (el.textContent || "").trim();
      if (!t || t.length > 400 || !re.test(t)) continue;
      const cs = getComputedStyle(el);
      if (!["fixed", "sticky", "absolute"].includes(cs.position)) continue;
      const r = el.getBoundingClientRect();
      if (r.height < 20 || r.width < 200) continue;
      if (r.height > vh * 0.4) continue;
      el.style.setProperty("display", "none", "important");
      hidden.push((el.tagName || "?") + (el.id ? "#" + el.id : "") +
        (el.getAttribute("data-hook") ? "[data-hook=" + el.getAttribute("data-hook") + "]" : ""));
    }
    return hidden;
  })()`;
}
