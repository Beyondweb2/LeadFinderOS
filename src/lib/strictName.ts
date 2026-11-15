/* ════════════════════════════════════════════════════════════════════════════════════════════════
   STRICT NAME MATCH FOR AUDIT VERDICTS (Paul, 2026-11-15; docs/AUDIT_RULES.md "Name match").

   An answer names the business only by:
     • its EXACT name (every word, in order, each word capitalised as a name is; "Ltd"/"Limited" optional), or
     • its website DOMAIN (in the answer text or a cited source), or
     • its Google profile (the lead's place_id, or a maps link carrying it).
   Never a common word alone: a one-word name counts only by domain or Google profile.

   A NEAR-NAME is the exact name with an extra word stuck to it ("MC Moments Wedding Content", "Moments Wedding
   Content Studio"), or the exact name next to a different home town or review count than the business's own
   (only when those facts are known). A near-name is FLAGGED for Paul and NOT counted: it may be another business.
   A clean match anywhere in the answer wins over a near-name elsewhere in it.

   Used by the report verdict rules (auditVerdict.ts) and the redesigned report's score for audits on rules v2.
   It does NOT change cellNamed (namedSignal.ts), which the guarantee and measurement read.
   Pure; relative imports carry .ts (imported by the render-audit-report edge function).
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export interface BusinessIdentity {
  name: string;
  /** Website hosts ("momentsweddingcontent.com"); any form, normalised here. */
  domains?: string[];
  /** Google place ids for the business's own profile. */
  placeIds?: string[];
  /** Home town / county the business is in, when known ("Mayo"). Unknown = no town check. */
  home?: string | null;
  /** Its Google review count, when known. Unknown = no review-count check. */
  reviews?: number | null;
}

export type NameMatch = 'named' | 'near' | 'no';
export interface NameCheck { match: NameMatch; how: 'name' | 'domain' | 'profile' | null; near: string[] }

type CellLike = { answer_text?: unknown; citations?: { url?: string }[] } | null | undefined;

const LEGAL = /[\s,]+(ltd|limited|llp|plc|inc)\.?$/i;
export const coreName = (n: string): string => n.trim().replace(LEGAL, '').replace(/\s+/g, ' ').trim();

export function hostOfDomain(d: string): string {
  const s = d.trim().toLowerCase();
  if (!s) return '';
  try { return new URL(/^https?:\/\//.test(s) ? s : `https://${s}`).hostname.replace(/^www\./, ''); } catch { return ''; }
}

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* Words that may sit right before the name without making it another business's name (sentence and list words). */
const LEAD_OK = new Set(['the', 'a', 'an', 'and', 'or', 'with', 'by', 'from', 'like', 'as', 'try', 'see', 'visit', 'contact', 'call', 'check', 'consider',
  'including', 'include', 'includes', 'also', 'via', 'on', 'at', 'for', 'to', 'is', 'are', 'was', 'about', 'recommend', 'recommended', 'book', 'hire',
  'choose', 'such', 'out', 'options', 'option', 'top', 'pick', 'picks', 'favourite', 'favorite', 'here', 'of', 'in', 'near', 'between', 'vs', 'versus',
  'then', 'but', 'if', 'when', 'where', 'while', 'yes', 'no', 'not', 'only', 'just', 'both', 'either', 'eg', 'e.g', 'ie', 'i.e', 'yours', 'first', 'second',
  'third', 'next', 'last', 'then', 'perhaps', 'maybe', 'reach', 'follow', 'enquire', 'inquire', 'via', 'through', 'thru']);
/* Words that, right after the name, make it a longer business name ("… Wedding Content Creation"). */
const TAIL_NAME = /^(creations?|studios?|films?|media|productions?|photography|photo|video|videos|videography|weddings?|events?|co|company|companies|group|agency|collective|services?|solutions|ireland|uk|international|team|plus|pro|hq|official|irl|nyc)$/i;

function cleanText(t: string): string {
  // Markdown emphasis and escapes are not words; keep line breaks (a line break ends a name).
  return t.replace(/\\([.\-*_#])/g, '$1').replace(/\*\*|__|[*_`]/g, '').replace(/[ \t]+/g, ' ');
}

/** The places and review counts said about the name occurrence, from the rest of its line / list item. */
function contextAfter(text: string, end: number): string {
  const rest = text.slice(end, end + 260);
  const stop = rest.search(/\n\s*\n|\n\s*\d+[.)]\s|\n\s*[-•]\s+[A-Z]/);
  return stop >= 0 ? rest.slice(0, stop) : rest;
}

function placeConflict(ctx: string, home: string | null | undefined): boolean {
  if (!home) return false;
  const h = home.trim().toLowerCase();
  const m = ctx.match(/\b(?:[Bb]ased|[Ll]ocated)\s+(?:in|out of)\s+(?:[Cc]o\.?\s+|[Cc]ounty\s+)?([A-Z][a-zA-Z'’-]+(?:\s+[A-Z][a-zA-Z'’-]+)?)/) ?? ctx.match(/\((?:co\.?\s+|county\s+)([A-Z][a-zA-Z'’-]+)\)/i);
  if (!m) return false;
  const p = m[1].trim().toLowerCase();
  return !(p.includes(h) || h.includes(p));
}

function reviewConflict(ctx: string, reviews: number | null | undefined): boolean {
  if (reviews == null) return false;
  const m = ctx.match(/\(?(\d{1,5})\s+(?:google\s+)?reviews?\b/i);
  return !!m && Number(m[1]) !== reviews;
}

/** Does this one answer name the business? 'named' (counted), 'near' (flagged, not counted) or 'no'. */
export function checkName(cell: CellLike, id: BusinessIdentity): NameCheck {
  const raw = String((cell as { answer_text?: unknown } | null)?.answer_text ?? '');
  const cites = ((cell as { citations?: { url?: string }[] } | null)?.citations ?? []).map((c) => String(c?.url ?? '').toLowerCase());
  const hosts = (id.domains ?? []).map(hostOfDomain).filter((h) => h.length >= 4);
  // 1. The website domain, in the text or a cited source (a domain is unique to the business).
  const lowRaw = raw.toLowerCase();
  for (const h of hosts) {
    const re = new RegExp(`(^|[^a-z0-9-])(www\\.)?${esc(h)}($|[^a-z0-9-])`);
    if (re.test(lowRaw) || cites.some((u) => { try { return new URL(u).hostname.replace(/^www\./, '') === h; } catch { return false; } })) return { match: 'named', how: 'domain', near: [] };
  }
  // 2. The Google profile.
  for (const p of (id.placeIds ?? []).filter((x) => x && x.length >= 10)) {
    if (raw.includes(p) || cites.some((u) => u.includes(p.toLowerCase()))) return { match: 'named', how: 'profile', near: [] };
  }
  // 3. The exact name. A one-word name never counts by text (a common word alone).
  const core = coreName(id.name);
  const words = core.split(' ').filter(Boolean);
  if (words.length < 2) return { match: 'no', how: null, near: [] };
  const text = cleanText(raw.replace(/!?\[([^\]]*)\]\([^)]*\)/g, ' $1 '));
  const body = words.map((w) => esc(w)).join('[ \\t]*[-–]?[ \\t]*');
  const re = new RegExp(`${body}(?:[ \\t,]+(?:ltd|limited)\\.?)?`, 'gi');
  let clean = false; const near: string[] = [];
  for (let m = re.exec(text); m; m = re.exec(text)) {
    const hit = m[0];
    // Each word must be written as a name (capital first letter), so "london domestic maintenance" in prose is not her.
    const hitWords = hit.split(/[\s-–]+/).filter(Boolean).slice(0, words.length);
    if (!hitWords.every((w) => /^[A-Z0-9]/.test(w))) continue;
    const before = text.slice(Math.max(0, m.index - 40), m.index);
    const after = text.slice(m.index + hit.length, m.index + hit.length + 40);
    const prev = before.match(/([A-Za-z0-9&'’.]+)[ \t]$/)?.[1] ?? '';
    const next = after.match(/^[ \t]([A-Za-z][A-Za-z'’]*)/)?.[1] ?? '';
    const prevJoins = !!prev && /^[A-Z0-9]/.test(prev) && !LEAD_OK.has(prev.toLowerCase().replace(/[.']+$/, '')) && !/^\d+[.)]?$/.test(prev);
    const nextJoins = !!next && TAIL_NAME.test(next) && /^[A-Z]/.test(next);
    const ctx = contextAfter(text, m.index + hit.length);
    if (prevJoins || nextJoins) { near.push(`${prevJoins ? prev + ' ' : ''}${hit.trim()}${nextJoins ? ' ' + next : ''}`); continue; }
    if (placeConflict(ctx, id.home) || reviewConflict(ctx, id.reviews)) { near.push(`${hit.trim()} (different town or review count)`); continue; }
    clean = true;
  }
  if (clean) return { match: 'named', how: 'name', near: [] };
  if (near.length) return { match: 'near', how: null, near: [...new Set(near)] };
  return { match: 'no', how: null, near: [] };
}

/** Counted as named (the near-name and the no-match both count as not named). */
export const strictNamed = (cell: CellLike, id: BusinessIdentity): boolean => checkName(cell, id).match === 'named';
