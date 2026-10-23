import { serviceCandidates, verifiedServices, pickServicesForQuestions } from '../src/lib/serviceEvidence.ts';
import { selectSamplePages, pageLinks } from '../src/lib/agencyDetect.ts';
import { extractSiteInfo } from '../src/lib/siteInfo.ts';
const UA = 'Mozilla/5.0 (compatible; LeadFinderOS-SiteCheck/1.0; +https://findable.live)';
const get = async (u: string) => { try { const r = await fetch(u, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(8000) }); return r.ok ? await r.text() : null; } catch { return null; } };
for (const [site, trade, town, name] of [
  ['https://www.parkesplumbing.co.uk/', 'Plumbers', 'Wakefield', 'Parkes Plumbing'],
  ['https://peteheatingserviceltd.co.uk/', 'Heating engineers', 'Tipton', 'Pete Heating Service'],
  ['https://www.smartplumbingheatingbristol.co.uk/', 'Plumbers', 'Bristol', 'Smart Plumbing and Heating'],
  ['https://www.locksmithsmanchester.co.uk/', 'Locksmiths', 'Manchester', 'Top Joiners'],
  ['http://www.gkplumbing.net/', 'Plumbers', 'Aylesbury', 'GK Plumbing'],
] as const) {
  const home = await get(site); if (!home) { console.log('FAIL', site); continue; }
  const pages: { url: string; html: string }[] = [];
  for (const u of selectSamplePages(site, pageLinks(home, site), 6)) { const h = await get(u); if (h) pages.push({ url: u, html: h }); }
  const ev = serviceCandidates(home, site, pages);
  const info = extractSiteInfo(home, { origin: new URL(site).origin, samplePages: pages });
  const v = verifiedServices(ev, { trade, towns: [town, ...info.towns], businessName: name });
  console.log(`\n== ${site} (${ev.candidates.length} candidates, ${pages.length} pages)`);
  console.log('  PICK:', pickServicesForQuestions(v, 3).map((x) => x.name).join(' · '));
  for (const x of v) console.log(`  ${x.score} ${x.name}  <- ${x.sources.map((s) => s.kind + ':' + s.url).join(', ')}`);
}
