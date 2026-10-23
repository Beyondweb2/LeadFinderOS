/* READ-ONLY RECON. Derive trade-marker tokens FROM THE DATA rather than from a hand-written word
   list — the word-list approach is what let medical nouns through the competitor filters (§8).
   A token marks trade T when the distinct firm names carrying it concentrate in T's audits AND it
   appears across several TOWNS, which is what separates a trade word from a place name. */
import fs from 'node:fs';
import { isUncleanedName, classifyKnownEntity } from '../src/lib/knownEntities';
import { isProvableJunkName, JUNK_NAMES_PROVING_UNCLEANED } from '../src/lib/competitorCleaning';

const SP = process.env.SP!;
export type Audit = { id: string; business_type: string | null; business_name: string | null; location_text: string | null;
  audit_purpose: string | null; baseline_target_runs: number | null; is_measurement: boolean | null;
  is_market: boolean | null; lead_id: string | null; created_at: string; baseline_completed_at: string | null };
export type Row = { id: number; audit_id: string; run_id: string; question: string; comp: Record<string, string[]>; named: Record<string, boolean> };

export const audits: Audit[] = JSON.parse(fs.readFileSync(`${SP}/audits.json`, 'utf8'));
export const rows: Row[] = JSON.parse(fs.readFileSync(`${SP}/rows.json`, 'utf8'));
export const byId = new Map(audits.map((a) => [a.id, a]));

/* ⛔ A NEVER-CLEANED FOLD CANNOT ANSWER A QUESTION ABOUT TRADES. Wakefield, Rowley Regis and the
   rest of the dirty markets (§8) store raw regex scrapings as competitors — "Map", "Rating",
   "West Yorkshire", scraped ids — and every one of them scores as "not in your trade", which turns
   this into a measurement of the 2026-08 cleaner outage rather than of question quality. The
   library's own threshold decides, not a judgement of mine. */
export const dirtyRow = (r: Row) => {
  const names = new Set(Object.values(r.comp).flat());
  let junk = 0; for (const n of names) if (isProvableJunkName(n)) junk++;
  return junk >= JUNK_NAMES_PROVING_UNCLEANED;
};
export const DIRTY = rows.filter(dirtyRow).length;

export const norm = (s: unknown) => String(s ?? '').toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim();
/* locksmiths/locksmith and plumbers/plumber are one trade stored two ways — 402 + 6 audits. */
export const tradeKey = (bt: unknown) => norm(bt).split(' ').map((w) => w.replace(/s$/, '')).join(' ');
export const townKey = (a: Audit | undefined) => norm(a?.location_text) || '(none)';

/* Junk, nationals and directories are not evidence about a trade: Timpson is named in locksmith
   audits and is a shoe-repair chain, Checkatrade is named in everything. */
/* ⛔ isProvableJunkName, NOT just isUncleanedName. Wakefield and the other dirty folds are full of
   "Mapbox", "OpenStreetMap" and scraped ids like "KZOOsptdCwWDCG" — none of which is a function
   word, so the marker-word test passes them straight through. Without the code-like test they
   dominate the off-trade finding and it becomes a measurement of the CLEANER outage instead. */
export const usableName = (n: string) => !!n && n.length >= 3 && !isProvableJunkName(n) && !classifyKnownEntity(n);

const STOP = new Set(['ltd','limited','the','and','services','service','co','company','uk','llp','group','solutions','of','in','for','your','local','24','7','247','plc','best','top','near','me']);
export const tokens = (name: string) => norm(name).split(' ').filter((w) => w.length >= 3 && !STOP.has(w) && !/^\d+$/.test(w));

/* token -> trade -> { names, towns }. DISTINCT names and DISTINCT towns, never mentions: one firm
   repeated across forty questions must not read as forty pieces of evidence. */
const tok = new Map<string, Map<string, { names: Set<string>; towns: Set<string> }>>();
for (const r of rows) {
  if (dirtyRow(r)) continue;
  const a = byId.get(r.audit_id);
  const t = tradeKey(a?.business_type);
  if (!t) continue;
  const town = townKey(a);
  for (const n of new Set(Object.values(r.comp).flat())) {
    if (!usableName(n)) continue;
    for (const w of new Set(tokens(n))) {
      let m = tok.get(w); if (!m) { m = new Map(); tok.set(w, m); }
      let s = m.get(t); if (!s) { s = { names: new Set(), towns: new Set() }; m.set(t, s); }
      s.names.add(norm(n)); s.towns.add(town);
    }
  }
}

export const MIN_NAMES = 6;     // support: fewer is anecdote
export const MIN_SHARE = 0.85;  // concentration: the token has to pick a side
export const MIN_TOWNS = 3;     /* ⛔ THE PLACE-NAME FILTER, AND IT IS LOAD-BEARING. Without it
   "thetford" scored as a 93% ELECTRICIAN marker — because one client's audits are most of that
   trade in the book — and every locksmith town in the country scored as a locksmith marker. A word
   that only ever appears in one town is a place, not a trade. */

export const MARKER = new Map<string, { trade: string; names: number; share: number; towns: number }>();
export const DROPPED_ONE_TOWN: string[] = [];
for (const [w, m] of tok) {
  let total = 0; let best = ''; let bestN = 0; let bestT = 0;
  for (const [t, s] of m) { total += s.names.size; if (s.names.size > bestN) { bestN = s.names.size; best = t; bestT = s.towns.size; } }
  if (bestN < MIN_NAMES) continue;
  const share = bestN / total;
  if (share < MIN_SHARE) continue;
  if (bestT < MIN_TOWNS) { DROPPED_ONE_TOWN.push(w); continue; }
  MARKER.set(w, { trade: best, names: bestN, share, towns: bestT });
}

/** The marker tokens that speak for a trade. */
export const markersFor = (trade: string) => new Set([...MARKER].filter(([, v]) => v.trade === trade).map(([w]) => w));

if (process.env.PRINT === '1') {
  console.log(`markers: ${MARKER.size} tokens (>=${MIN_NAMES} names, >=${MIN_SHARE * 100}% one trade, >=${MIN_TOWNS} towns)`);
  console.log(`dropped as place-or-single-town words: ${DROPPED_ONE_TOWN.length}\n`);
  const byTrade = new Map<string, string[]>();
  for (const [w, v] of MARKER) { const a = byTrade.get(v.trade) ?? []; a.push(w); byTrade.set(v.trade, a); }
  for (const [t, ws] of [...byTrade].sort((a, b) => b[1].length - a[1].length)) console.log(`${t} (${ws.length}): ${ws.sort().join(' ')}\n`);
}
