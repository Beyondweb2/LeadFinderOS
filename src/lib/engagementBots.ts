/* ============================================================
   IS THIS OPEN / CLICK A PERSON? — the one rule for report views and tracked-link clicks (Paul, 2026-11-22;
   docs/campaign-performance.md).

   Two filters, both needed:
   1. THE USER AGENT. Link-preview fetchers (WhatsApp, Facebook/Meta, Slack, Twitter/X, Telegram, Discord, LinkedIn,
      Skype, Google's preview/read-aloud fetchers, search crawlers, scripts) load the page with no person behind it.
      Marked at write time (bot_reason) so the raw log keeps them and every count can leave them out.
   2. TOO FAST, NO JAVASCRIPT. WhatsApp's own unfurl sometimes arrives with an ordinary phone browser agent the moment
      the message lands. A load within FAST_OPEN_MS of our send whose page script never ran (no js_at) is that, not a
      person. A load whose script ran is a real browser, however fast. A tracked-link click has no page script, so a
      click inside the window is always treated as a preview.

   ⚠️ Explicit .ts imports only: this file is reached by edge functions (render-audit-report, track-engagement,
   campaign-performance).
   ============================================================ */

/** The day the report view log went live. Before it, a report's FIRST open (ai_audits.first_opened_at, user-agent filter
 *  only) is the only record, and the campaign table uses it for opens before this moment. */
export const REPORT_VIEW_LOG_START = Date.parse('2026-11-22T00:00:00Z');

/** Milliseconds after our send inside which a no-JS load is a preview fetch. */
export const FAST_OPEN_MS = 5_000;

const BOT_RULES: ReadonlyArray<[string, RegExp]> = [
  ['whatsapp', /whatsapp/i],
  ['facebook', /facebookexternalhit|facebookcatalog|facebot|meta-externalagent|meta-externalfetcher/i],
  ['slack', /slack/i],
  ['telegram', /telegrambot/i],
  ['twitter', /twitterbot|xbot\//i],
  ['discord', /discordbot/i],
  ['linkedin', /linkedinbot/i],
  ['skype', /skypeuripreview/i],
  ['google', /google-pagerenderer|google-read-aloud|googleother|google-inspectiontool|googleweblight|adsbot-google|mediapartners-google|feedfetcher-google|google-safety|googlebot/i],
  ['apple', /applebot/i],
  ['bing', /bingpreview|bingbot/i],
  ['preview', /preview|embedly|iframely|outbrain|vkshare|pinterest|redditbot|snapchat|viber|line-poker|kakaotalk/i],
  ['script', /curl\/|wget\/|python-requests|python-urllib|go-http-client|node-fetch|axios\/|okhttp|java\/|libwww|httpclient|headlesschrome|phantomjs|puppeteer|playwright/i],
  /* "bot" as its own word or as a product name before a version ("Foobot/1.0"); never a phone model like "CUBOT X30". */
  ['crawler', /\bbot\b|\b[a-z]*bot\/|crawler|spider|scrapy/i],
];

/** Why this user agent is a machine, or null when it looks like a person's browser. An EMPTY agent is a machine:
 *  every real browser sends one. */
export function botReasonFor(userAgent: string | null | undefined): string | null {
  const ua = (userAgent ?? '').trim();
  if (!ua) return 'no_user_agent';
  for (const [reason, re] of BOT_RULES) if (re.test(ua)) return reason;
  return null;
}

export interface LoggedHit {
  /** ISO time of the load / click. */
  at: string;
  bot_reason: string | null;
  /** Report views only: when the page's own script pinged back. Absent for clicks. */
  js_at?: string | null;
}

/**
 * Was this hit a person? `sendTimesMs` = our real sends to that lead (ms, any order).
 * ⛔ Positive test: a marked bot is never a person; an unparseable time is never a person.
 */
export function isHumanHit(hit: LoggedHit, sendTimesMs: ReadonlyArray<number>): boolean {
  if (hit.bot_reason) return false;
  const at = Date.parse(hit.at);
  if (Number.isNaN(at)) return false;
  if (hit.js_at) return true;
  /* No script: too soon after a send we made → a preview fetch. */
  for (const s of sendTimesMs) if (at >= s && at - s < FAST_OPEN_MS) return false;
  return true;
}
