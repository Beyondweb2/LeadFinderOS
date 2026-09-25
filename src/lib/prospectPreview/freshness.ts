/* ════════════════════════════════════════════════════════════════════════════════════════════════
   PROSPECT PREVIEW — when to reuse, when to rebuild.

   A preview is a function of: the lead, its website, the audit + run it quotes, the crawl and the
   research it read, the template (id@version) and this generator's version. Same inputs → REUSE
   (no spend, no re-render). Any input moved → STALE: the stored preview is still shown, marked
   stale with what changed, and only the operator's Regenerate rebuilds it. Nothing rebuilds on
   its own.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

/** Bump when the generator's output would change for the same inputs (copy, layout, rules). */
export const PROSPECT_PREVIEW_GENERATOR_VERSION = 2;

export interface FingerprintParts {
  leadId: string;
  website: string | null;
  auditId: string;
  runId: string | null;
  crawlAt: string | null;
  researchAt: string | null;
  template: string;
  generator: number;
}

export const FINGERPRINT_LABELS: Record<keyof FingerprintParts, string> = {
  leadId: 'lead', website: 'website', auditId: 'AI audit', runId: 'audit run', crawlAt: 'site crawl',
  researchAt: 'site research', template: 'template version', generator: 'generator version',
};

export function normaliseSite(u: string | null | undefined): string | null {
  const v = (u ?? '').trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '');
  return v || null;
}

export function fingerprint(p: FingerprintParts): string {
  const s = [p.leadId, normaliseSite(p.website) ?? '', p.auditId, p.runId ?? '', p.crawlAt ?? '', p.researchAt ?? '', p.template, String(p.generator)].join('|');
  let h1 = 0x811c9dc5, h2 = 0x01000193;
  for (let i = 0; i < s.length; i++) {
    const c = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ c, 0x01000193) >>> 0;
    h2 = Math.imul(h2 ^ c, 0x5bd1e995) >>> 0;
  }
  return `pp${p.generator}-${h1.toString(16).padStart(8, '0')}${h2.toString(16).padStart(8, '0')}`;
}

export type Freshness =
  | { state: 'none' }
  | { state: 'current' }
  | { state: 'stale'; changed: Array<keyof FingerprintParts> };

export function previewFreshness(stored: { status?: string | null; fingerprint_parts?: Partial<FingerprintParts> | null } | null, current: FingerprintParts): Freshness {
  if (!stored || stored.status !== 'ready' || !stored.fingerprint_parts) return { state: 'none' };
  const s = stored.fingerprint_parts;
  const changed = (Object.keys(current) as Array<keyof FingerprintParts>).filter((k) => {
    const a = k === 'website' ? normaliseSite(s[k] as string | null) : (s[k] ?? null);
    const b = k === 'website' ? normaliseSite(current[k]) : current[k];
    return String(a ?? '') !== String(b ?? '');
  });
  return changed.length ? { state: 'stale', changed } : { state: 'current' };
}

export type GeneratePlan =
  | { action: 'reuse'; stale: false }
  /** Inputs moved: the stored preview is returned MARKED stale. Only Regenerate rebuilds it. */
  | { action: 'reuse'; stale: true; changed: Array<keyof FingerprintParts> }
  | { action: 'build'; reason: 'first' | 'regenerate' | 'failed_before' };

export function planGenerate(stored: { status?: string | null; fingerprint_parts?: Partial<FingerprintParts> | null } | null, current: FingerprintParts, regenerate: boolean): GeneratePlan {
  if (regenerate) return { action: 'build', reason: 'regenerate' };
  if (!stored) return { action: 'build', reason: 'first' };
  if (stored.status === 'failed') return { action: 'build', reason: 'failed_before' };
  const f = previewFreshness(stored, current);
  if (f.state === 'current') return { action: 'reuse', stale: false };
  if (f.state === 'stale') return { action: 'reuse', stale: true, changed: f.changed };
  return { action: 'build', reason: 'first' };
}
