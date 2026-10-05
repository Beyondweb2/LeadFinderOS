/* ════════════════════════════════════════════════════════════════════════════════════════════════
   SITE FORM — a generated client website's enquiry form, configured from the client's OWN Website
   Build record, never from a hard-coded per-client list (fix workstream 6, 2026-10-04; D-12 / M-039).

   Until now every new client's form needed an engineer to add a CLIENT_SITES entry in code and redeploy
   site-enquiry. Now Paul turns the form on in Website Build (website_build.form) and site-enquiry reads
   it from the database on each submission:

     website_build.form      { enabled, site_key, recipient, thanks_path, enabled_at } — Paul's switch
     readSiteForm()          the stored shape, allowlisted (the save rule and site-enquiry both use it)
     siteFormProblems()      why the form cannot be switched on / served (the screen and the server)
     clientSiteFromRecord()  the lead row + its route → the form's configuration, or a refusal

   ⛔ NO ARBITRARY RELAY. The recipient is never in the request: it is the VERIFIED business email Paul
      approved (the screen fills it; it must equal a verified email fact to switch on), stored on an
      admin-only row. Only a Build client, not ended, with the form switched on, a canonical domain and a
      Cloudflare project is served; anything else — unknown key, two leads claiming one key, an
      Optimise client, an unrecorded route — is REFUSED.
   ⛔ ONLY THE PRODUCTION ORIGIN DELIVERS — https://<canonical domain> and its www / apex twin. The
      client's own *.pages.dev previews and localhost are TEST mode (Resend's test inbox). Unchanged.
   ⚠️ Edge-reachable (site-enquiry): no imports. Pure. Never a backtick inside a template literal (§3).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export interface ClientSite {
  key: string;
  businessName: string;
  /** Where real enquiries go. */
  to: string;
  /** Origins that deliver for real (the live domain, with and without www). */
  productionOrigins: string[];
  /** Origins allowed to submit in TEST mode (preview, local dev). Anything else is refused. */
  testOriginPatterns: RegExp[];
  /** Where a no-JavaScript form post is sent back to (a path on the submitting origin). */
  thanksPath: string;
}

export interface SiteFormState {
  enabled: boolean;
  /** The ?site= key the built form posts with. Lowercase letters, digits, dashes. */
  site_key: string;
  /** The verified business email enquiries go to. */
  recipient: string;
  thanks_path: string;
  enabled_at: string;
}
export const EMPTY_SITE_FORM: SiteFormState = { enabled: false, site_key: '', recipient: '', thanks_path: '', enabled_at: '' };
export const DEFAULT_THANKS_PATH = '/contact/?sent=1#enquiry';
export const SITE_KEY_RE = /^[a-z0-9][a-z0-9-]{1,39}$/;
const EMAIL_RE = /^[^\s@<>"',;]+@[^\s@<>"',;]+\.[a-z]{2,}$/i;
const DOMAIN_RE = /^(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,}$/;
const PROJECT_RE = /^[a-z0-9][a-z0-9-]{0,57}$/;

const s = (v: unknown, cap: number) => (typeof v === 'string' ? v : v == null ? '' : String(v)).trim().slice(0, cap);

/** The stored form switch, allowlisted. A malformed key / path is dropped, never kept as itself. */
export function readSiteForm(v: unknown): SiteFormState {
  const o = v && typeof v === 'object' && !Array.isArray(v) ? v as Record<string, unknown> : {};
  const key = s(o.site_key, 40).toLowerCase();
  const path = s(o.thanks_path, 200);
  return {
    enabled: o.enabled === true,
    site_key: SITE_KEY_RE.test(key) ? key : '',
    recipient: EMAIL_RE.test(s(o.recipient, 200)) ? s(o.recipient, 200).toLowerCase() : '',
    thanks_path: /^\/[^\s"'<>]*$/.test(path) && !path.startsWith('//') ? path : '',
    enabled_at: s(o.enabled_at, 40),
  };
}

/** "pengwernlocks.co.uk" → both the apex and the www origin, https only. */
export function productionOriginsFor(canonicalDomain: string): string[] {
  const d = s(canonicalDomain, 253).toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (!DOMAIN_RE.test(d)) return [];
  const apex = d.replace(/^www\./, '');
  return ['https://' + apex, 'https://www.' + apex];
}
/** The client's own Cloudflare Pages previews (every branch alias) and local development. */
export function testOriginPatternsFor(cloudflareProject: string): RegExp[] {
  const p = s(cloudflareProject, 58).toLowerCase();
  return [
    ...(PROJECT_RE.test(p) ? [new RegExp('^https:\\/\\/([a-z0-9-]+\\.)?' + p + '\\.pages\\.dev$')] : []),
    /^http:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/,
  ];
}

/** A suggestion Paul can accept: the Cloudflare project name, which is already unique to the client. */
export const suggestSiteKey = (cloudflareProject: string) => s(cloudflareProject, 40).toLowerCase().replace(/[^a-z0-9-]+/g, '-').replace(/^-+|-+$/g, '');

export interface SiteFormInput {
  form: SiteFormState;
  canonicalDomain: string;
  cloudflareProject: string;
  /** The VERIFIED email values in the fact ledger (the screen) — absent on the server, which trusts
   *  only what the admin-only save stored. */
  verifiedEmails?: readonly string[];
  /** The client's service route (websiteRoute.ts). */
  clientRoute: 'build' | 'optimise' | null;
  ended: boolean;
}
/** Why the form cannot be switched on (screen) or served (site-enquiry). Empty = it can. */
export function siteFormProblems(i: SiteFormInput): string[] {
  const out: string[] = [];
  if (i.clientRoute === 'optimise') out.push('Optimise client — the enquiry-form registry is for websites Findable builds');
  else if (i.clientRoute !== 'build') out.push('The client\'s route (Build / Optimise) is not recorded');
  if (i.ended) out.push('The engagement has ended');
  if (!SITE_KEY_RE.test(i.form.site_key)) out.push('Form key (lowercase letters, numbers and dashes)');
  if (!EMAIL_RE.test(i.form.recipient)) out.push('Recipient email');
  else if (i.verifiedEmails && !i.verifiedEmails.some((e) => e.trim().toLowerCase() === i.form.recipient.toLowerCase())) out.push('The recipient must be the business email verified in the fact ledger');
  if (!productionOriginsFor(i.canonicalDomain).length) out.push('Domain (canonical)');
  if (!PROJECT_RE.test(s(i.cloudflareProject, 58).toLowerCase())) out.push('Cloudflare project name');
  return out;
}

export interface FormRecord {
  business_name?: unknown;
  service_terminated_at?: unknown;
  website_build?: unknown;
}
/**
 * One lead row (already matched on the key) + its route → the ClientSite the function serves, or a
 * refusal. ⛔ The key must equal the stored one, the form must be switched on, and every problem must
 * be absent — the same list the screen shows.
 */
export function clientSiteFromRecord(key: string, row: FormRecord, route: 'build' | 'optimise' | null): { site: ClientSite } | { refused: string } {
  const wb = row.website_build && typeof row.website_build === 'object' && !Array.isArray(row.website_build) ? row.website_build as Record<string, unknown> : {};
  const form = readSiteForm(wb.form);
  if (!form.enabled) return { refused: 'form_not_enabled' };
  if (!form.site_key || form.site_key !== s(key, 40).toLowerCase()) return { refused: 'key_mismatch' };
  const problems = siteFormProblems({ form, canonicalDomain: s(wb.canonical_domain, 253), cloudflareProject: s(wb.cloudflare_project, 100), clientRoute: route, ended: !!row.service_terminated_at });
  if (problems.length) return { refused: 'not_servable: ' + problems.join('; ') };
  return {
    site: {
      key: form.site_key,
      businessName: s(row.business_name, 160) || form.site_key,
      to: form.recipient,
      productionOrigins: productionOriginsFor(s(wb.canonical_domain, 253)),
      testOriginPatterns: testOriginPatternsFor(s(wb.cloudflare_project, 100)),
      thanksPath: form.thanks_path || DEFAULT_THANKS_PATH,
    },
  };
}
