/* ════════════════════════════════════════════════════════════════════════════════════════════════
   SITE ENQUIRY — the rules behind a Findable client website's enquiry form (fn site-enquiry).
   The Findable quality standard (2026-09-25): a rebuilt site is never harder to contact than the old
   one, and a form must GENUINELY submit before production — never a fake form.

   ⛔ THE RECIPIENT IS NEVER FROM THE REQUEST. The form sends a site key; the recipient, the business
      name and the allowed origins come from the client's own Website Build record (website_build.form,
      src/lib/siteForm.ts — fix workstream 6, 2026-10-04: no more per-client code edit and deploy). A
      visitor can inject no recipient, and a key no Build client has switched on is refused.
   ⛔ ONLY THE PRODUCTION ORIGIN DELIVERS. A submission from a preview (*.pages.dev), localhost or any
      origin not listed as production is TEST MODE: it goes to Resend's test inbox, never to the
      client — so reviewing the preview can never hand the client a fake lead. Decided HERE, from the
      Origin header, never by the browser.
   Pure (no Deno, no fetch): the tests reach it; the edge function does the IO.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import { clientSiteFromRecord, SITE_KEY_RE, type ClientSite, type FormRecord } from "../../../src/lib/siteForm.ts";
export type { ClientSite } from "../../../src/lib/siteForm.ts";

/** ⚠️ TRANSITIONAL — BS4's form was registered in code before the registry existed. Used ONLY when no
 *  Website Build record claims the key. Once Paul switches BS4's form on in Website Build (key "bs4",
 *  recipient its verified email), that record wins and this entry is deleted. Never add another. */
export const LEGACY_CLIENT_SITES: Record<string, ClientSite> = {
  bs4: {
    key: 'bs4',
    businessName: 'BS4 Electrical Services Ltd',
    to: 'info@bs4electricalservices.co.uk',
    productionOrigins: ['https://bs4electricalservices.co.uk', 'https://www.bs4electricalservices.co.uk'],
    testOriginPatterns: [/^https:\/\/([a-z0-9-]+\.)?bs4-electrical-services\.pages\.dev$/, /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/],
    thanksPath: '/contact/?sent=1#enquiry',
  },
};

/** A site key worth a database read: the same shape the Website Build save stores. */
export const isSiteKey = (key: string) => SITE_KEY_RE.test(key);

export type SiteResolution = { site: ClientSite; source: 'registry' | 'legacy' } | { site: null; reason: string };
/**
 * The site for a key, from the Website Build records that claim it (already fetched by the function:
 * outreach_leads where website_build->form->>site_key = key, each with its route).
 * ⛔ Two records claiming one key → refused (never a guess which client's inbox). A record that claims
 *    the key but cannot be served → refused, never the legacy fallback. No record → the legacy entry,
 *    else unknown.
 */
export function resolveClientSite(key: string, records: ReadonlyArray<{ row: FormRecord; route: 'build' | 'optimise' | null }>): SiteResolution {
  const k = String(key ?? '').toLowerCase();
  if (!isSiteKey(k)) return { site: null, reason: 'unknown_site' };
  if (records.length > 1) return { site: null, reason: 'ambiguous_site_key' };
  if (records.length === 1) {
    const r = clientSiteFromRecord(k, records[0].row, records[0].route);
    return 'site' in r ? { site: r.site, source: 'registry' } : { site: null, reason: r.refused };
  }
  const legacy = LEGACY_CLIENT_SITES[k];
  return legacy ? { site: legacy, source: 'legacy' } : { site: null, reason: 'unknown_site' };
}

/** Resend's own test address: accepted and delivered to nobody. */
export const TEST_RECIPIENT = 'delivered@resend.dev';
export const FROM_ADDRESS = 'alerts@findable.live';
/** A human takes longer than this to fill the form; a bot posting instantly is dropped. */
export const MIN_FILL_MS = 3000;
export const MAX_PER_IP_PER_HOUR = 5;
export const MAX_PER_SITE_PER_DAY = 60;

export type OriginMode = 'production' | 'test' | 'refused';
export function originMode(site: ClientSite, origin: string | null): OriginMode {
  const o = (origin ?? '').toLowerCase().replace(/\/+$/, '');
  if (!o) return 'refused';
  if (site.productionOrigins.includes(o)) return 'production';
  if (site.testOriginPatterns.some((re) => re.test(o))) return 'test';
  return 'refused';
}

export interface EnquiryFields { name: string; phone: string; email: string; service: string; location: string; message: string }
export type Validated =
  | { ok: true; fields: EnquiryFields }
  | { ok: false; reason: 'honeypot' | 'too_fast' | 'invalid'; problems: string[] };

const clean = (v: unknown, cap: number) => String(v ?? '').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '').trim().slice(0, cap);
const oneLine = (s: string) => s.replace(/[\r\n]+/g, ' ');

/** Validate the posted fields. The honeypot (a field humans never see) and the fill time are
 *  silent drops — the caller answers them as if they succeeded, so a bot learns nothing. */
export function validateEnquiry(raw: Record<string, unknown>, nowMs: number): Validated {
  if (clean(raw.company_website, 200)) return { ok: false, reason: 'honeypot', problems: [] };
  /* ⛔ A DURATION measured in the browser (fill_ms), never a browser timestamp compared with the
     server clock: visitors clocks are routinely tens of seconds out, and the first build silently
     dropped a real 20-second fill from a PC whose clock ran ahead (2026-09-27). No JavaScript = no
     fill_ms = not treated as a bot. */
  const fill = Number(raw.fill_ms);
  if (raw.fill_ms != null && raw.fill_ms !== '' && Number.isFinite(fill) && fill >= 0 && fill < MIN_FILL_MS) return { ok: false, reason: 'too_fast', problems: [] };
  void nowMs;
  const f: EnquiryFields = {
    name: oneLine(clean(raw.name, 100)),
    phone: oneLine(clean(raw.phone, 40)),
    email: oneLine(clean(raw.email, 200)),
    service: oneLine(clean(raw.service, 120)),
    location: oneLine(clean(raw.location, 120)),
    message: clean(raw.message, 4000),
  };
  const problems: string[] = [];
  if (!f.name) problems.push('name');
  if (!f.phone && !f.email) problems.push('phone or email');
  if (f.phone && !/^[+()\d\s-]{7,40}$/.test(f.phone)) problems.push('phone');
  if (f.email && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(f.email)) problems.push('email');
  if (!f.location) problems.push('location');
  if (!f.message) problems.push('message');
  return problems.length ? { ok: false, reason: 'invalid', problems } : { ok: true, fields: f };
}

/** The email to the business. Plain text; every value is the visitor's own words, labelled. */
export function enquiryEmail(site: ClientSite, f: EnquiryFields, mode: 'production' | 'test', origin: string) {
  const subject = (mode === 'test' ? '[TEST] ' : '') + 'Website enquiry: ' + (f.service || 'general') + ' — ' + f.location;
  const text = [
    'A new enquiry from your website (' + origin + ').',
    '',
    'Name: ' + f.name,
    'Phone: ' + (f.phone || '—'),
    'Email: ' + (f.email || '—'),
    'Service: ' + (f.service || '—'),
    'Property location: ' + f.location,
    '',
    f.message,
    '',
    '—',
    f.email ? 'Reply to this email to answer ' + f.name + ' directly.' : 'No email given — call ' + f.name + ' back on ' + f.phone + '.',
    'Sent by your website\'s enquiry form (Findable).',
  ].join('\n');
  return {
    from: site.businessName.replace(/["<>]/g, '') + ' website <' + FROM_ADDRESS + '>',
    to: [mode === 'production' ? site.to : TEST_RECIPIENT],
    reply_to: f.email || undefined,
    subject: subject.slice(0, 200),
    text,
  };
}

/** CORS for an allowed origin only. */
export function corsHeaders(origin: string | null, mode: OriginMode): Record<string, string> {
  if (mode === 'refused' || !origin) return {};
  return { 'Access-Control-Allow-Origin': origin, 'Access-Control-Allow-Methods': 'POST, OPTIONS', 'Access-Control-Allow-Headers': 'content-type', Vary: 'Origin' };
}
