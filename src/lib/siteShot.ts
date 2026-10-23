/* SITE SHOT — the rules for taking ONE homepage picture per lead, for the prospect report's left card (2026-10-23).

   Pure and edge-reachable: no imports, no Deno, no DOM. The driver (Cloudflare Browser Rendering) is
   supabase/functions/_shared/mockup-shot.ts; the door is fn site-shot; the record is docs/site-shot.md.

   ⛔ A PICTURE CAPTIONED "YOUR HOMEPAGE" THAT SHOWS A CHALLENGE PAGE, A BLANK PAGE OR AN ERROR IS A FALSE CLAIM
      MADE TO THE ONE PERSON CERTAIN TO SPOT IT. So a shot is taken only for a real own website whose homepage our
      own check could actually read, and a result is refused when the image looks empty (siteShotImageProblem).
   ⛔ SPEND IS NEVER STARTED BY OPENING A REPORT. render-audit-report only READS a finished shot; a test fences that.
   ⛔ THE CAP AND THE SWITCH ARE DATABASE VALUES (site_shot_settings), read at call time; the defaults below only seed
      the migration (scripts/site-shot.test.ts holds the seed equal to these). Never write the cap as a number in prose. */

/** The private bucket (no storage policies: the service role only). */
export const SITE_SHOT_BUCKET = 'lead-site-shots';

/** What the migration seeds for the monthly cap. The live value is site_shot_settings.monthly_cap. */
export const SITE_SHOT_DEFAULT_MONTHLY_CAP = 600;

/** A picture counts as current for this long; a re-shoot happens only when a new audit finishes after it. */
export const SITE_SHOT_FRESH_DAYS = 30;
export const SITE_SHOT_FRESH_MS = SITE_SHOT_FRESH_DAYS * 86_400_000;

/** Tries before a lead's failure is left alone (a retry happens only at its next audit). */
export const SITE_SHOT_MAX_ATTEMPTS = 2;

/** One request is one lead, and the measurement door takes at most this many at a time. */
export const SITE_SHOT_MEASURE_MAX = 6;

/** The picture's shape: the same fixed viewport as the mockup shot (screenshot-policy), at 1x and JPEG, because
 *  the report shows it a few hundred pixels wide and a 2x PNG measured 1.5 to 1.9 MB. */
export const SITE_SHOT_JPEG_QUALITY = 80;
export const SITE_SHOT_SCALE = 1;

/** Below this many bytes a JPEG of a 1280x800 page is almost certainly blank or an error shell. PROVISIONAL until the
 *  20-site measurement sets it from real pictures. */
export const SITE_SHOT_MIN_BYTES = 15_000;

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Where a lead's picture lives in the bucket, or null for anything that is not a lead id (so a crafted id can
 *  never write outside its own folder). */
export function siteShotPath(leadId: string, measure = false): string | null {
  const id = String(leadId ?? '').trim();
  if (!UUID_RE.test(id)) return null;
  return measure ? `measure/${id.toLowerCase()}.jpg` : `${id.toLowerCase()}/homepage.jpg`;
}

export type SiteShotRefusal =
  | 'disabled' | 'all_stop' | 'no_website' | 'website_is_aggregator' | 'not_http'
  | 'no_crawl' | 'crawl_unreadable' | 'cap_reached';

export interface SiteShotGateInput {
  enabled: boolean;
  /** protection_settings.mode (running / prospecting_paused / all_stop). Anything but 'running' stops an automatic shot. */
  mode: string;
  /** screenshot-policy's shotRefusal() for the lead's website, passed in (that file is edge-only). */
  websiteRefusal: 'no_website' | 'website_is_aggregator' | 'not_http' | null;
  /** The lead's stored website check (usableCrawlSignals): null = none, or stale. */
  crawl: { fetchFailed: boolean; readableAs: string | null } | null;
  claimedThisMonth: number;
  monthlyCap: number;
}

/** May an AUTOMATIC shot be taken for this lead right now? Absent means "do not": an unknown state is never a yes.
 *  (The row's own freshness and attempts are decided by the claim_site_shot() write, not here.) */
export function siteShotGate(i: SiteShotGateInput): { ok: true } | { ok: false; reason: SiteShotRefusal } {
  if (i.enabled !== true) return { ok: false, reason: 'disabled' };
  if (i.mode !== 'running') return { ok: false, reason: 'all_stop' };
  if (i.websiteRefusal) return { ok: false, reason: i.websiteRefusal };
  if (!i.crawl) return { ok: false, reason: 'no_crawl' };
  if (i.crawl.fetchFailed || !i.crawl.readableAs) return { ok: false, reason: 'crawl_unreadable' };
  if (!(Number.isFinite(i.monthlyCap) && i.claimedThisMonth < i.monthlyCap)) return { ok: false, reason: 'cap_reached' };
  return { ok: true };
}

/** Is this the picture of a page, or of nothing? null = fine. */
export function siteShotImageProblem(bytes: Uint8Array | null | undefined, minBytes: number = SITE_SHOT_MIN_BYTES): 'empty' | 'not_jpeg' | 'too_small' | 'too_big' | null {
  if (!bytes || !bytes.length) return 'empty';
  if (!(bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff)) return 'not_jpeg';
  if (bytes.length < minBytes) return 'too_small';
  if (bytes.length > 2_097_152) return 'too_big';
  return null;
}

/** "Your homepage, as we saw it on 25 Oct 2026" — a DATE, because a site changes after we look. */
export function siteShotCaption(shotAtIso: string | null | undefined): string {
  const d = shotAtIso ? new Date(shotAtIso) : null;
  if (!d || Number.isNaN(d.getTime())) return 'Your homepage';
  const day = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', day: 'numeric', month: 'short', year: 'numeric' }).format(d);
  return `Your homepage, as we saw it on ${day}`;
}

/** The start of the current London calendar month, as an ISO instant — the cap's window (a UTC month would be wrong in BST). */
export function londonMonthStartIso(now: Date): string {
  const f = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', year: 'numeric', month: '2-digit' }).formatToParts(now);
  const y = Number(f.find((p) => p.type === 'year')?.value);
  const m = Number(f.find((p) => p.type === 'month')?.value);
  const cand = Date.UTC(y, m - 1, 1, 0, 0, 0);
  const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', hourCycle: 'h23' }).format(new Date(cand)));
  return new Date(cand - (h === 0 ? 0 : h) * 3_600_000).toISOString();
}

/** Cloudflare's own rate limit (HTTP 429, "Rate limit exceeded"): a refused burst is not a failed site, costs nothing and
 *  must never use up a lead's attempts. The driver puts the status in the detail, so this reads that. */
export function siteShotRateLimited(detail: string | null | undefined): boolean {
  return /\bHTTP 429\b/.test(String(detail ?? ''));
}

/** How long to wait before the next try after a rate limit: its Retry-After seconds when sent and sane, else the fallback. */
export function siteShotRetryAfterMs(detail: string | null | undefined, fallbackMs: number): number {
  const m = /retry-after=(\d{1,4})\b/.exec(String(detail ?? ''));
  const s = m ? Number(m[1]) : NaN;
  return Number.isFinite(s) && s >= 1 && s <= 120 ? s * 1000 : fallbackMs;
}

/* ── IS THE PICTURE A REAL PAGE? (measured 2026-10-23, the 20-site test) ───────────────────────────────────────
   Two of twenty "pictures" were not the business's homepage at all but a bot-challenge page — "Checking the site
   connection security" — 21 KB each, which PASSED the size floor above. A size can never tell a thin real page from a
   challenge, so a SMALL picture is checked against the page's own text (read by the same browser): a challenge, an
   access-denied page, an error, a parked domain or a server default page is refused, and so is a page with no words.
   ⛔ ABSENT MEANS "DO NOT": a small picture whose page text could not be read is refused, never shown. A refusal costs
   nothing but the neutral card; a challenge captioned "your homepage" is a false claim to the one person who will spot it. */

/** A picture under this many bytes has its page text checked first (the challenge pages measured 21 KB; real pages
 *  measured 41 KB and up, and one real page 56 KB — so the line sits well above both). */
export const SITE_SHOT_VERIFY_BELOW_BYTES = 90_000;

export function siteShotNeedsVerify(bytes: number): boolean {
  return !(Number.isFinite(bytes) && bytes >= SITE_SHOT_VERIFY_BELOW_BYTES);
}

export type SiteShotPageProblem = 'bot_challenge' | 'access_denied' | 'error_page' | 'parked_domain' | 'server_default_page' | 'near_empty';

const PAGE_SIGNS: Array<[SiteShotPageProblem, string[]]> = [
  ['bot_challenge', ['checking the site connection security', 'just a moment', 'checking your browser', 'verify you are human', 'verifying you are human', 'are you a robot', 'enable javascript and cookies to continue', 'pardon our interruption', 'press & hold', 'complete the security check', 'ddos protection by', 'please wait while we verify']],
  ['access_denied', ['access denied', 'attention required', 'request blocked', 'you have been blocked', 'sucuri website firewall', 'incapsula incident', 'forbidden: you don']],
  ['error_page', ['404 not found', '403 forbidden', '502 bad gateway', '503 service unavailable', 'site currently unavailable', 'site is currently unavailable', 'temporarily unavailable', 'currently unavailable', 'under maintenance', 'down for maintenance', 'be right back', 'website is not available','this site can\'t be reached', 'page not found', 'site not found', 'account suspended', 'this account has been suspended', 'error establishing a database connection']],
  ['parked_domain', ['domain is for sale', 'this domain may be for sale', 'buy this domain', 'this domain is parked', 'domain parking']],
  ['server_default_page', ['welcome to nginx', 'apache2 ubuntu default page', 'it works!', 'default web site page', 'iis windows server']],
];

/** The words a visitor would read on this HTML: scripts and styles dropped, tags dropped, spaces collapsed. */
export function siteShotVisibleText(html: string): string {
  return String(html ?? '')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** What is wrong with this page, or null when it reads like the business's own site. Title and visible text are both searched. */
export function siteShotPageProblem(html: string | null | undefined): SiteShotPageProblem | null {
  const raw = String(html ?? '');
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(raw)?.[1] ?? '';
  const text = siteShotVisibleText(raw);
  const hay = `${title} ${text}`.toLowerCase().replace(/[‘’]/g, "'");
  for (const [problem, signs] of PAGE_SIGNS) {
    // A long page that merely MENTIONS a phrase (a blog about "404 not found") is not an error page: error and challenge pages are short.
    if (signs.some((s) => hay.includes(s)) && (text.length < 1500 || problem === 'bot_challenge' || problem === 'access_denied')) return problem;
  }
  if (text.length < 30) return 'near_empty';
  return null;
}

/** Cloudflare error 6004: the site's Content-Security-Policy refused our injected banner-hiding script, which fails the whole shot. */
export function siteShotCspBlocked(detail: string | null | undefined): boolean {
  return /"code":6004|Content Security Policy blocked/i.test(String(detail ?? ''));
}

/** A one-off browser failure worth ONE immediate retry: "Not attached to an active page" (error 6003) and a request blocked
 *  client-side. Measured 2026-10-23: both sites that hit these shot fine on the runs either side. A page that genuinely refuses
 *  the browser (an auth prompt, a closed connection, a TrustedScript policy) is not retried. */
export function siteShotTransient(detail: string | null | undefined): boolean {
  return /"code":6003|ERR_BLOCKED_BY_CLIENT|Not attached to an active page/i.test(String(detail ?? ''));
}
