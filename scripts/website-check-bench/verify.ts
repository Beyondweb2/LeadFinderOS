// FIRST-PASS VERDICTS FROM THE INDEPENDENT READ (2026-11-15, docs/WEBSITE_CHECK_ACCURACY.md).
//
// For every finding a bench run produced, looks at what the real browser saw (evidence/<slug>.json.gz) and proposes
// true / false / check, with the evidence. A person then reads every proposal and writes the final verdict into
// truth.json — this file only speeds that up; it is never the ground truth on its own.
//   node --import tsx scripts/website-check-bench/verify.ts <bench results file> > proposals.txt
import { existsSync, readFileSync } from 'node:fs';
import { gunzipSync } from 'node:zlib';
import path from 'node:path';
import { BENCH_DIR } from './net.ts';

interface Page { status: number | null; title: string | null; metaDesc: string | null; viewport: string | null; robotsMeta: string | null; canonical: string | null; h1: string[]; h2: string[]; ld: string[]; links: Array<{ href: string; text: string }>; nav: string[]; tel: string[]; mailto: string[]; imgs: { total: number; noAlt: number }; forms: number; words: number; text: string }
interface Evidence { pages: Record<string, Page>; robots: any; sitemap: any }

export function loadEvidence(slug: string): Evidence | null {
  const f = path.join(BENCH_DIR, 'evidence', `${slug}.json.gz`);
  return existsSync(f) ? JSON.parse(gunzipSync(readFileSync(f)).toString('utf8')) : null;
}

const POSTCODE = /\b[A-Z]{1,2}\d[A-Z\d]?\s*\d[A-Z]{2}\b/i;
const PHONE = /(?:\+44\s?|\b0)(?:\d\s?){9,10}\b/;
const REVIEW = /testimonial|review|★|⭐|5[- ]star|five[- ]star|what (?:our )?(?:customers|clients) say|trustpilot|checkatrade|rated people|mybuilder|feedback/i;
const ACCRED = /NICEIC|NAPIT|Gas Safe|TrustMark|Which\?\s*Trusted|Checkatrade|ELECSA|Stroma|Federation of Master Builders|\bFMB\b|Competent ?Roofer|NFRC|DVSA|\bADI\b|Part P|City ?& ?Guilds|18th Edition|BS ?7671|CHAS|SafeContractor|Constructionline|PASMA|IPAF|Google Partner|Meta Partner|ISO ?9001|Chartered/i;
const ENTITY = /\b(?:est(?:ablished)?\.?|since|founded(?: in)?)\s*(?:in\s*)?(?:19|20)\d{2}\b|company (?:no|number|reg(?:istration)?(?: no| number)?)\.?:?\s*\d{6,8}|registered in england[^.]{0,60}\d{6,8}|\b\d{8}\b(?=[^.]{0,40}(?:companies house|registered))/i;
const AREAS = /areas? (?:we )?cover|covering|we cover|serving|service areas?|areas? served|based in|throughout|across (?:the )?[A-Z]/i;

const all = (e: Evidence) => Object.entries(e.pages).filter(([, p]) => p && (p.status ?? 200) < 400);
const ldTypes = (p: Page) => p.ld.flatMap((s) => { try { const j = JSON.parse(s); const list = Array.isArray(j) ? j : j['@graph'] ?? [j]; return list.map((x: any) => ([] as string[]).concat(x?.['@type'] ?? [])).flat(); } catch { return ['(invalid)']; } });
const pathOf = (u: string) => { try { return new URL(u).pathname.replace(/\/$/, '') || '/'; } catch { return u; } };
const find = (e: Evidence, u: string) => { const p = pathOf(u).toLowerCase(); return Object.entries(e.pages).find(([k]) => pathOf(k).toLowerCase() === p)?.[1] ?? null; };

export function propose(id: string, saw: string, pages: string[], e: Evidence): { v: 'true' | 'false' | 'check'; why: string } {
  const P = all(e);
  const texts = P.map(([, p]) => p.text).join('\n');
  const say = (v: 'true' | 'false' | 'check', why: string) => ({ v, why });
  switch (id) {
    case 'no_address': { const m = P.map(([u, p]) => [u, POSTCODE.exec(p.text)?.[0]]).find(([, x]) => x); return m ? say('false', `postcode ${m[1]} on ${pathOf(m[0] as string)}`) : say('true', 'no postcode in browser text'); }
    case 'no_contact_details': case 'no_phone': { const m = P.find(([, p]) => p.tel.length || PHONE.test(p.text)); return m ? say('false', `phone on ${pathOf(m[0])}: ${m[1].tel[0] ?? PHONE.exec(m[1].text)?.[0]}`) : say('true', 'no phone seen'); }
    case 'no_reviews': case 'ct_no_proof': { const m = P.map(([u, p]) => [u, REVIEW.exec(p.text)?.[0], p.text.slice(Math.max(0, (REVIEW.exec(p.text)?.index ?? 0) - 60), (REVIEW.exec(p.text)?.index ?? 0) + 100)]).find(([, x]) => x); return m ? say('check', `"${m[1]}" on ${pathOf(m[0] as string)}: …${String(m[2]).replace(/\s+/g, ' ')}…`) : say('true', 'no review words in browser text'); }
    case 'no_business_schema': { const t = [...new Set(P.flatMap(([, p]) => ldTypes(p)))]; const biz = t.filter((x) => /Business|Organization|Contractor|Electrician|Plumber|Roofing|Store|Service|School|Agency/i.test(x)); return biz.length ? say('false', `types ${biz.join(',')}`) : say('true', `types: ${t.join(',') || 'none'}`); }
    case 'vs_business_schema': { const blocks = P.flatMap(([, p]) => p.ld).join(' '); return /"telephone"|"address"/.test(blocks) ? say('false', 'telephone/address present in some JSON-LD') : say('true', 'no telephone/address in any JSON-LD'); }
    case 'no_breadcrumbs': { const b = P.some(([, p]) => p.ld.some((s) => /BreadcrumbList/.test(s))); return b ? say('false', 'BreadcrumbList found') : say('true', 'no BreadcrumbList JSON-LD (microdata not checked)'); }
    case 'no_sitemap': { const ok = e.sitemap?.status === 200 && /<(urlset|sitemapindex)/i.test(e.sitemap.body ?? ''); const rob = /sitemap:/i.test(e.robots?.body ?? ''); return ok || rob ? say('false', `sitemap.xml ${e.sitemap?.status}; robots declares: ${rob}`) : say('true', `sitemap.xml ${e.sitemap?.status ?? e.sitemap?.error}`); }
    case 'no_robots': return e.robots?.status === 200 && !/<html/i.test(String(e.robots.body).slice(0, 300)) ? say('false', 'robots.txt 200') : say('true', `robots.txt ${e.robots?.status ?? e.robots?.error}`);
    case 'noindex_home': { const h = P[0]?.[1]; return /noindex/i.test(h?.robotsMeta ?? '') ? say('true', `robots meta ${h?.robotsMeta}`) : say('check', `browser robots meta: ${h?.robotsMeta}`); }
    case 'long_titles': { const c = pages.map((u) => find(e, u)).filter(Boolean) as Page[]; return c.length ? (c.every((p) => (p.title ?? '').length > 65) ? say('true', c.map((p) => (p.title ?? '').length).join(',')) : say('false', c.map((p) => `${(p.title ?? '').length}`).join(','))) : say('check', 'cited pages not read'); }
    case 'multiple_h1': { const c = pages.map((u) => find(e, u)).filter(Boolean) as Page[]; return c.length ? (c.every((p) => p.h1.length > 1) ? say('true', c.map((p) => p.h1.length).join(',')) : say('check', `h1 counts ${c.map((p) => p.h1.length).join(',')}`)) : say('check', 'cited pages not read'); }
    case 'vs_key_page_basics': case 'missing_h1': case 'missing_description': {
      const parts = saw.split(/;\s*/).map((s) => /^(homepage|\/[^:]+):\s*(.*)$/.exec(s.trim())).filter(Boolean) as RegExpExecArray[];
      const out: string[] = []; let bad = 0, seen = 0;
      for (const [, where, what] of parts) {
        const p = where === 'homepage' ? P[0]?.[1] : find(e, where);
        if (!p) { out.push(`${where}: not read`); continue; }
        seen++;
        if (/no H1/.test(what) && p.h1.length) { bad++; out.push(`${where}: browser H1 "${p.h1[0].slice(0, 40)}"`); }
        if (/no meta description/.test(what) && (p.metaDesc ?? '').trim()) { bad++; out.push(`${where}: browser meta "${(p.metaDesc ?? '').slice(0, 40)}"`); }
      }
      return !seen ? say('check', out.join('; ')) : bad ? say('false', out.join('; ')) : say('true', `confirmed on ${seen} page(s) ${out.join('; ')}`);
    }
    case 'one_page_site': { const host = (() => { try { return new URL(P[0][0]).hostname; } catch { return ''; } })(); const internal = new Set(P.flatMap(([, p]) => p.links.map((l) => l.href)).filter((h) => { try { const u = new URL(h); return u.hostname === host && pathOf(h) !== pathOf(P[0][0]) && !/\.(jpe?g|png|pdf)$/i.test(u.pathname); } catch { return false; } }).map(pathOf)); return internal.size ? say('false', `internal pages linked: ${[...internal].slice(0, 5).join(' ')}`) : say('true', 'no internal links in browser'); }
    case 'no_contact_page': { const m = P.find(([u]) => /contact|get-in-touch/i.test(u)) ?? P.flatMap(([, p]) => p.links).find((l) => /contact/i.test(l.text)); return m ? say('false', `contact: ${Array.isArray(m) ? m[0] : (m as any).href}`) : say('true', 'no contact page/link'); }
    case 'no_about_page': { const m = P.find(([u]) => /about|who-we-are|our-story|meet/i.test(u)) ?? P.flatMap(([, p]) => p.links).find((l) => /about/i.test(l.text)); return m ? say('false', `about: ${Array.isArray(m) ? m[0] : (m as any).href} ${Array.isArray(m) ? '' : (m as any).text}`) : say('true', 'no about page/link'); }
    case 'ct_missing_entity_facts': { const m = ENTITY.exec(texts); return m ? say('false', `"${m[0]}"`) : say('true', 'no founding year / company number pattern'); }
    case 'ct_no_accreditations': { const m = ACCRED.exec(texts); return m ? say('false', `"${m[0]}" in text`) : say('true', 'no accreditation names in text (logos not read)'); }
    case 'ct_areas_not_stated': { const m = AREAS.exec(texts); return m ? say('check', `"${texts.slice(Math.max(0, m.index - 40), m.index + 120).replace(/\s+/g, ' ')}"`) : say('true', 'no area wording'); }
    case 'ct_image_alt': { const c = P.reduce((s, [, p]) => ({ t: s.t + p.imgs.total, n: s.n + p.imgs.noAlt }), { t: 0, n: 0 }); return say(c.t && c.n / c.t > 0.5 ? 'true' : 'check', `browser: ${c.n} of ${c.t} img tags without alt`); }
    case 'name_unclear': case 'town_missing': return say('check', 'read manually');
    default: return say('check', 'read manually');
  }
}

if (process.argv[1]?.endsWith('verify.ts')) {
  const res = JSON.parse(readFileSync(process.argv[2], 'utf8')) as Array<{ slug: string; state: string; issues: Array<{ id: string; severity: string; saw: string; pages: string[] }> }>;
  for (const r of res) {
    const e = loadEvidence(r.slug);
    console.log(`\n# ${r.slug} (${r.state}) evidence pages: ${e ? Object.keys(e.pages).length : 'none'}`);
    for (const i of r.issues) {
      const p = e ? propose(i.id, i.saw, i.pages, e) : { v: 'check', why: 'no evidence' };
      console.log(`  ${p.v.padEnd(5)} ${i.severity[0]} ${i.id} :: ${p.why.slice(0, 220)}`);
    }
  }
}
