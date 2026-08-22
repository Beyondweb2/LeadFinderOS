/* ============================================================
   SOURCE-TYPE CLASSIFIER — is a cited domain an AUTHORITY/INFO site or a BUSINESS?

   Used by the INTERNAL winnability signal (auditReport.ts): a question whose answer AI builds from
   NHS / NICE / regulators / journals is an information question — AI isn't shopping for a business
   there, so it is NOT a page target. A question whose sources are clinics / pharmacies / company
   sites is where a business can win a place.

   Deno-free and dependency-free (both the SPA and the edge report import it). Domains only — the
   caller unwraps redirects and extracts the host (citationDomain in auditReport.ts) before calling.

   ⚠️ HEURISTIC, NOT A REGISTRY. Authority is matched HIGH-confidence (a curated suffix list plus
   academic/government/charity TLDs); everything else on a commercial TLD is 'business'; anything
   left is 'other'. The winnability logic treats 'other' cautiously so an unknown domain never
   inflates a "winnable" claim. Extend AUTHORITY_SUFFIXES as real audits surface new info sites —
   this is expected to grow.
   ============================================================ */

export type SourceType = 'authority' | 'business' | 'other';

/* Well-known information/authority hosts, matched as a SUFFIX so subdomains count
   (www.nhs.uk, inspections.pharmacyregulation.org, portal.menopause.org). */
const AUTHORITY_SUFFIXES: string[] = [
  // UK public health / guidance
  'nhs.uk', 'nice.org.uk', 'gov.uk', 'gov.scot', 'gov.wales',
  // Menopause / women's-health societies & info (Solene's field; the shape generalises by trade)
  'thebms.org.uk', 'menopausematters.co.uk', 'womens-health-concern.org', 'menopause.org', 'nams.org',
  // Regulators / professional bodies
  'pharmacyregulation.org', 'cqc.org.uk', 'gmc-uk.org', 'gphc.org.uk', 'fda.gov', 'ema.europa.eu',
  'nmc.org.uk', 'hcpc-uk.org',
  // Encyclopaedic / journals / reference
  'wikipedia.org', 'who.int', 'nih.gov', 'ncbi.nlm.nih.gov', 'cochrane.org', 'bmj.com', 'thelancet.com',
  // Big consumer health-info publishers (info, not a local business)
  'mayoclinic.org', 'healthline.com', 'webmd.com', 'medicalnewstoday.com', 'patient.info',
  'clevelandclinic.org',
];

/* Commercial TLDs → a company / clinic / pharmacy site. Anchored to the END of the host. */
const COMMERCIAL_TLD = /\.(com|co\.uk|uk|io|net|shop|store|clinic|health|pharmacy|biz|me|ai|app)$/;

const norm = (d: string): string => (d ?? '').trim().toLowerCase().replace(/^www\./, '');
const endsWithAny = (host: string, suffixes: string[]): boolean =>
  suffixes.some((s) => host === s || host.endsWith('.' + s));

/** Classify one domain. Curated authority list first; then academic/gov/charity TLDs (info-leaning);
 *  then a commercial TLD → business; else 'other' (unknown — treated cautiously downstream). */
export function classifySource(domain: string): SourceType {
  const host = norm(domain);
  if (!host) return 'other';
  if (endsWithAny(host, AUTHORITY_SUFFIXES)) return 'authority';
  if (host.endsWith('.ac.uk') || host.endsWith('.edu') || host.endsWith('.gov')
    || host.includes('.gov.') || host.includes('.nhs.') || host.endsWith('.int')) return 'authority';
  // Charity/body TLDs lean information — but only when nothing commercial matched above.
  if (host.endsWith('.org.uk') || host.endsWith('.org')) return 'authority';
  if (COMMERCIAL_TLD.test(host)) return 'business';
  return 'other';
}

/** Fold a list of domains into counts by type — the input to the winnability source-mix rule. */
export function sourceMix(domains: string[]): { authority: number; business: number; other: number; total: number } {
  const mix = { authority: 0, business: 0, other: 0, total: 0 };
  for (const d of domains) {
    const t = classifySource(d);
    mix[t]++; mix.total++;
  }
  return mix;
}
