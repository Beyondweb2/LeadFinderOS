/* ════════════════════════════════════════════════════════════════════════════════════════════════
   FIND LEADS — MANY TOWNS (Paul, 2026-10-16: "switch to V2's Many towns mode"). The rules, pure.

   Behaviour ported from V2 (apps/web/src/pages/FindLeadsPage.tsx + packages/core/src/discovery/multiTown.ts), not
   its code:
     · Coverage's ticked towns open Find Leads in Many towns mode with those towns selected (manyTownsHref).
     · One press searches up to MANY_TOWNS_MAX_PER_PRESS of them, MANY_TOWNS_CONCURRENCY at a time; the rest stay
       selected for the next press.
     · EACH TOWN IS THE ORDINARY ONE-TOWN SEARCH (LeadSearchContext.fetchTown — the same search-leads call, filters,
       retries, exclusions, ordering and its own search_history run). Results land in the SAME Find Leads table, in
       town order, as each town finishes; a business found in two towns is shown once, under the first.
     · A refusal (pause, limit, spend guard, rate limit) stops new towns starting; what was found stays. One town
       failing never stops the others.
   ⛔ SPEND: every town is one search-leads call, so every server guard applies to EACH town exactly as before —
   guardAction('lead_search') (per-minute / per-hour bursts, per-person and team spend caps) and the function's own
   per-minute limiter. The press cap equals the per-minute burst on purpose: ten towns is the most one press can ask.
   Pure; no React.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */
import { findLeadsHref } from './coverageState.ts';

/** Towns searched per press (V2's MULTI_TOWN_MAX_TOWNS). Equal to the lead_search per-minute burst. */
export const MANY_TOWNS_MAX_PER_PRESS = 10;
/** Towns searched at the same time (V2's MULTI_TOWN_CONCURRENCY). */
export const MANY_TOWNS_CONCURRENCY = 2;
/** The longest town list Find Leads accepts from a link. */
export const MANY_TOWNS_MAX_SELECTED = 100;
export const MANY_TOWNS_PARAM = 'towns';
export const MANY_MODE_VALUE = 'many';

export type TownLineState = 'waiting' | 'searching' | 'done' | 'not_found' | 'failed' | 'not_searched';
export interface TownLine { town: string; state: TownLineState; found?: number; noWebsite?: number; duplicates?: number; message?: string }
export interface TownRun { keyword: string; towns: TownLine[]; later: string[]; running: boolean }

const key = (s: string) => s.replace(/\s+/g, ' ').trim().toLowerCase();

/** A town list: '|' between towns (or an array), blanks and repeats dropped (first spelling kept), capped. */
export function parseTownList(raw: string | readonly string[] | null | undefined): string[] {
  const parts = Array.isArray(raw) ? raw : String(raw ?? '').split('|');
  const seen = new Set<string>();
  const out: string[] = [];
  for (const p of parts) {
    const t = String(p).replace(/\s+/g, ' ').trim();
    if (!t || seen.has(key(t))) continue;
    seen.add(key(t)); out.push(t);
    if (out.length >= MANY_TOWNS_MAX_SELECTED) break;
  }
  return out;
}

/** Coverage → Find Leads. ONE ticked town = the single-row link, byte for byte (it runs at once, as it always has).
 *  Several = Many towns mode, the towns selected, NOTHING run until the person presses Find leads. */
export function manyTownsHref(trade: string, towns: readonly string[], country?: string, depth?: 'standard' | 'thorough'): string | null {
  const list = parseTownList(towns);
  if (!list.length) return null;
  if (list.length === 1) return findLeadsHref(trade, list[0], country, depth);
  const q = new URLSearchParams({ mode: MANY_MODE_VALUE, keyword: trade, [MANY_TOWNS_PARAM]: list.join('|') });
  if (country) q.set('country', country);
  if (depth) q.set('depth', depth);
  return `/find-leads?${q.toString()}`;
}

/** What one press searches now, and what stays selected for the next press. */
export function townsForPress<T>(selected: readonly T[], max = MANY_TOWNS_MAX_PER_PRESS): { run: T[]; later: T[] } {
  const cap = Math.max(1, Math.floor(max));
  return { run: selected.slice(0, cap), later: selected.slice(cap) };
}

/** Run `work` over `items`, at most `limit` at a time, in order of starting. */
export async function runPool<T>(items: readonly T[], limit: number, work: (item: T) => Promise<void>): Promise<void> {
  let next = 0;
  const lane = async () => { while (next < items.length) { const i = next++; await work(items[i]); } };
  await Promise.all(Array.from({ length: Math.max(1, Math.min(limit, items.length)) }, lane));
}

/** The minimum a result needs to be recognised as the same business found in another town. */
export interface TownLead { id: string; name: string; googleMapsUrl?: string | null; phone?: string | null }
export interface TownAnswerRow<L extends TownLead = TownLead> { town: string; leads: L[] }

const digits = (s: string | null | undefined) => (s ?? '').replace(/\D+/g, '');
function sameBusinessKeys(l: TownLead): string[] {
  const keys = [`id:${l.id}`];
  if (l.googleMapsUrl) keys.push(`m:${l.googleMapsUrl.trim()}`);
  const n = key(l.name).replace(/[^a-z0-9 ]+/g, '');
  const ph = digits(l.phone);
  if (n && ph.length >= 7) keys.push(`np:${n}|${ph.slice(-9)}`);
  return keys;
}

/** Every town's results in TOWN ORDER (the order they were selected, not the order they finished); a business found
 *  in more than one town is kept once, under the first. `alsoIn[town]` = how many of that town's results were already
 *  shown under an earlier town. */
export function mergeTownLeads<L extends TownLead>(order: readonly string[], answers: readonly TownAnswerRow<L>[]): { leads: L[]; alsoIn: Record<string, number> } {
  const byTown = new Map(answers.map((a) => [key(a.town), a]));
  const seen = new Set<string>();
  const leads: L[] = [];
  const alsoIn: Record<string, number> = {};
  for (const town of order) {
    const a = byTown.get(key(town));
    if (!a) continue;
    for (const l of a.leads) {
      const ks = sameBusinessKeys(l);
      if (ks.some((k) => seen.has(k))) { alsoIn[a.town] = (alsoIn[a.town] ?? 0) + 1; continue; }
      ks.forEach((k) => seen.add(k));
      leads.push(l);
    }
  }
  return { leads, alsoIn };
}

/** The words for one town's line. */
export function townLineWords(l: TownLine): string {
  switch (l.state) {
    case 'waiting': return 'waiting';
    case 'searching': return 'searching…';
    case 'done': return `${l.found ?? 0} found${l.duplicates ? ` (${l.duplicates} already shown above)` : ''}`;
    case 'not_found': return 'place not found';
    case 'failed': return 'failed';
    case 'not_searched': return 'not searched';
  }
}
