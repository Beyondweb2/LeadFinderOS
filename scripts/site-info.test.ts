/* ============================================================
   SITE INFO extraction — only what's ACTUALLY in the markup, never inferred. The two Paul reads
   first (who built it, which directories) get their own checks; a clean page proves every field
   comes back missing rather than guessed.

   Run: npx tsx scripts/site-info.test.ts
   ============================================================ */
import { extractSiteInfo } from '../src/lib/siteInfo.ts';

let f = 0;
const ok = (c: boolean, m: string) => { console.log(`${c ? 'PASS' : 'FAIL'} ${m}`); if (!c) f++; };

const ORIGIN = 'https://acme-locksmiths.co.uk';

const RICH = `<!doctype html><html><head>
  <meta name="generator" content="WordPress 6.4.2">
  <title>Acme Locksmiths | Emergency Locksmith in Huntingdon</title>
  <script type="application/ld+json">${JSON.stringify({
    '@type': 'LocalBusiness', telephone: '01480 123456', email: 'info@acme-locksmiths.co.uk',
    address: { '@type': 'PostalAddress', streetAddress: '1 High St', addressLocality: 'Huntingdon', postalCode: 'PE29 3TQ' },
    openingHours: ['Mo-Fr 09:00-17:00', 'Sa 09:00-12:00'],
  })}</script>
  </head><body>
  <nav><a href="/">Home</a><a href="/emergency-lockout">Emergency Lockout</a><a href="/lock-fitting">Lock Fitting</a><a href="/contact">Contact</a></nav>
  <a href="https://www.facebook.com/acmelocks">Facebook</a>
  <a href="https://instagram.com/acmelocks">Instagram</a>
  <a href="https://www.yell.com/biz/acme-locksmiths">Find us on Yell</a>
  <a href="https://www.checkatrade.com/acme">Checkatrade approved</a>
  <p>Registered in England and Wales, company number 09876543.</p>
  <footer>
    © 2026 Acme Locksmiths. Website by <a href="https://brightspark-digital.co.uk">Brightspark Digital</a>.
    <a href="tel:01480123456">Call us</a>
  </footer>
  </body></html>`;

const info = extractSiteInfo(RICH, {
  origin: ORIGIN,
  samplePages: [
    { url: `${ORIGIN}/locksmith-huntingdon`, html: '<title>Locksmith in Huntingdon | Acme</title>' },
    { url: `${ORIGIN}/locksmith-st-ives`, html: '<title>Locksmith in St Ives | Acme</title>' },
  ],
  clusterUrls: [`${ORIGIN}/locksmith-huntingdon`, `${ORIGIN}/locksmith-st-ives`, `${ORIGIN}/locksmith-godmanchester`],
});

console.log('\n── WHO BUILT IT (the one Paul reads first) ──');
ok(info.builtBy.credit === 'Brightspark Digital', `credit from "Website by X" (got ${JSON.stringify(info.builtBy.credit)})`);
ok(info.builtBy.platform === 'WordPress', `platform from the generator meta (got ${JSON.stringify(info.builtBy.platform)})`);
ok(info.builtBy.footerLinks.includes('brightspark-digital.co.uk'), `footer agency link captured (got ${JSON.stringify(info.builtBy.footerLinks)})`);

console.log('\n── DIRECTORIES (Yell first) ──');
ok(info.directories.includes('Yell'), 'Yell detected');
ok(info.directories.includes('Checkatrade'), 'Checkatrade detected');
ok(!info.directories.includes('Bark'), 'Bark NOT detected (it is not on the page)');

console.log('\n── CONTACT + SCHEMA ──');
ok(info.email === 'info@acme-locksmiths.co.uk', `email from JSON-LD (got ${info.email})`);
ok(info.phone === '01480 123456', `phone from JSON-LD (got ${info.phone})`);
ok(!!info.address && info.address.includes('Huntingdon') && info.address.includes('PE29 3TQ'), `address from JSON-LD (got ${info.address})`);
ok(!!info.openingHours && info.openingHours.length === 2, `opening hours from schema (got ${JSON.stringify(info.openingHours)})`);
ok(info.companyNumber === '09876543', `company number (got ${info.companyNumber})`);

console.log('\n── SOCIAL, SERVICES, TOWNS, STALENESS ──');
ok(info.socialLinks.some((s) => s.platform === 'Facebook') && info.socialLinks.some((s) => s.platform === 'Instagram'), 'social links found');
ok(info.services.includes('Emergency Lockout') && info.services.includes('Lock Fitting'), `services from nav (got ${JSON.stringify(info.services)})`);
ok(!info.services.some((s) => /^home$|^contact$/i.test(s)), 'generic nav items (Home/Contact) excluded');
ok(info.towns.includes('Huntingdon') && info.towns.includes('St Ives') && info.towns.includes('Godmanchester'),
  `towns from the cluster, "locksmith" stripped (got ${JSON.stringify(info.towns)})`);
ok(info.staleness.copyrightYear === 2026, `copyright year (got ${info.staleness.copyrightYear})`);

console.log('\n── A CLEAN PAGE: EVERY FIELD MISSING, NOTHING INVENTED ──');
const bare = extractSiteInfo('<!doctype html><html><head><title>Bob the Plumber</title></head><body><h1>Bob</h1><p>We do plumbing.</p></body></html>', { origin: 'https://bob.example' });
ok(bare.email === null && bare.phone === null && bare.address === null, 'no contact invented');
ok(bare.companyNumber === null && bare.openingHours === null, 'no company number / hours invented');
ok(bare.builtBy.credit === null && bare.builtBy.platform === null && bare.builtBy.footerLinks.length === 0, 'no builder invented');
ok(bare.directories.length === 0 && bare.socialLinks.length === 0 && bare.towns.length === 0, 'no directories / social / towns invented');
ok(bare.staleness.copyrightYear === null, 'no copyright year invented');

console.log('\n── A FOOTER LINK WITH NO WORDS IS STILL THE TELL (Paul) ──');
const wordless = extractSiteInfo(
  `<html><body><footer><a href="https://someagency.dev">Site</a></footer></body></html>`, { origin: 'https://client.co.uk' });
ok(wordless.builtBy.footerLinks.includes('someagency.dev'), 'a bare footer agency link is captured even with no "built by"');
ok(wordless.builtBy.credit === null, "and credit stays null — we don't invent the wording");

console.log('\n── SOCIAL AND DIRECTORY DOMAINS ARE NOT MISTAKEN FOR THE BUILDER ──');
const social = extractSiteInfo(
  `<html><body><footer><a href="https://facebook.com/x">FB</a><a href="https://yell.com/biz/x">Yell</a></footer></body></html>`, { origin: 'https://client.co.uk' });
ok(social.builtBy.footerLinks.length === 0, 'facebook/yell footer links are not counted as an agency');

console.log(f ? `\n${f} FAILURES` : '\nALL PASS');
if (f) throw new Error(`${f} failures`);
