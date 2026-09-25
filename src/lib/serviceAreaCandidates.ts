/* ════════════════════════════════════════════════════════════════════════════════════════════════
   SERVICE-AREA CANDIDATES — the recon's towns, offered for the canonical Service areas fact (F11).

   BS4 pilot (2026-09-25): the recon found 20 served towns, but the Service areas fact showed only the
   6 operator-entered onboarding towns; the recon towns lived in recon.towns where only the TEMPLATE
   mapping's Locations panel ever read them — a bespoke build could not approve them at all.

   ⛔ A CANDIDATE IS NEVER VERIFIED BY BEING FOUND. It reaches the fact only when the operator acts:
        Add      — the list is NOT verified yet: put the town in the proposed list (still needs approval)
        Approve  — the list IS verified: add this one town, and the list stays verified (the operator
                   approved it; the towns already verified are untouched)
        Ignore   — "does not serve this area" (mapping.locations[town].serves = false — the same
                   decision the template Locations panel shows)
   ⛔ Never overwrites a verified town; towns are compared case-insensitively.
   ⛔ SERVES AN AREA is not a DEDICATED PAGE. Nothing here creates a page; town pages are planned in
      Architecture only.
   Browser-only.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import type { FactRow } from './buildFacts.ts';
import type { BuildFact, WebsiteBuildState } from './websiteBuildState.ts';
import { townKey } from './templateMapping.ts';

/* The SAME key the template Locations panel uses, so an Ignore here is an unticked Serves there. */
export const townNorm = townKey;
export const splitAreas = (v: string) => v.split(/[,;\n]+/).map((x) => x.trim()).filter(Boolean);

export type AreaStatus = 'verified' | 'listed' | 'base' | 'ignored' | 'candidate';
export const AREA_STATUS_LABELS: Record<AreaStatus, string> = {
  verified: 'Verified area', listed: 'In the list — needs approval', base: 'Base location', ignored: 'Ignored', candidate: 'Recon candidate',
};
export interface AreaCandidate { key: string; name: string; source_url: string; context: string; status: AreaStatus }

export interface AreaView {
  /** The Service areas fact as it stands. */
  factStatus: FactRow['status'] | 'none';
  verified: string[];
  listed: string[];
  /** Every recon town, deduplicated, with where it stands. */
  candidates: AreaCandidate[];
  /** Add (unverified list) or Approve (verified list) — never both. */
  action: 'add' | 'approve';
}

function usable(r: FactRow | undefined) { return !!r && !!r.value && r.status !== 'rejected' && r.status !== 'not_applicable'; }

export function serviceAreaView(s: WebsiteBuildState, rows: FactRow[]): AreaView {
  const fact = rows.find((r) => r.key === 'service_areas');
  const base = rows.find((r) => r.key === 'primary_town');
  const inList = usable(fact) ? splitAreas(fact!.value) : [];
  const listKeys = new Set(inList.map(townNorm));
  const verified = fact?.status === 'verified' ? inList : [];
  const baseKey = usable(base) ? townNorm(base!.value.replace(/\(.*\)/, '')) : '';
  const seen = new Set<string>();
  const candidates: AreaCandidate[] = [];
  for (const c of s.recon.towns) {
    const key = townNorm(c.name);
    if (!key || seen.has(key)) continue;
    seen.add(key);
    /* "Bristol (Knowle West)" is the town Bristol with a note — compare without the bracket, on both
       sides (found on BS4's live record: the base town was offered as a candidate). */
    const bare = townNorm(c.name.replace(/\([^)]*\)/g, ''));
    const status: AreaStatus = listKeys.has(key) || listKeys.has(bare) ? (fact?.status === 'verified' ? 'verified' : 'listed')
      : key === baseKey || bare === baseKey ? 'base'
      : s.mapping.locations[key]?.serves === false ? 'ignored' : 'candidate';
    candidates.push({ key, name: c.name.trim(), source_url: c.source_url, context: c.context, status });
  }
  return { factStatus: fact ? fact.status : 'none', verified, listed: fact?.status === 'verified' ? [] : inList, candidates, action: fact?.status === 'verified' ? 'approve' : 'add' };
}

/**
 * The Service areas fact after adding towns. `approve` keeps a VERIFIED list verified (the operator
 * approved these towns); `add` proposes them (the list is, or stays, needs-approval). Adding to a
 * verified list with `add` is refused (null) — it would un-verify towns already verified.
 * Towns already in the list are skipped (case-insensitive); the list's existing order is kept.
 */
export function withAreas(fact: FactRow | undefined, names: string[], mode: 'add' | 'approve'): BuildFact | null {
  const verified = fact?.status === 'verified';
  if (mode === 'add' && verified) return null;
  if (mode === 'approve' && !verified) return null;
  const current = usable(fact) ? splitAreas(fact!.value) : [];
  const have = new Set(current.map(townNorm));
  const add: string[] = [];
  for (const n of names) { const k = townNorm(n); if (k && !have.has(k)) { have.add(k); add.push(n.trim()); } }
  return {
    key: 'service_areas', label: fact?.label || 'Service areas', value: [...current, ...add].join(', '),
    status: verified ? 'verified' : 'detected', source: fact?.source || 'source site (recon)',
    source_url: fact?.source_url ?? '', notes: fact?.notes ?? '', basis: verified ? 'operator' : '',
  };
}

/** Ignore / un-ignore a town: the "serves this area" decision the Locations panel also reads. Adding
 *  or approving a town clears an earlier Ignore. */
export function withServes(s: WebsiteBuildState, keys: string[], serves: boolean | undefined): WebsiteBuildState {
  const locations = { ...s.mapping.locations };
  for (const k of keys) {
    const cur = { ...(locations[k] ?? {}) };
    if (serves === undefined) delete (cur as { serves?: boolean }).serves; else cur.serves = serves;
    if (Object.keys(cur).length) locations[k] = cur; else delete locations[k];
  }
  return { ...s, mapping: { ...s.mapping, locations } };
}
