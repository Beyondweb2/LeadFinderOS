/* ════════════════════════════════════════════════════════════════════════════════════════════════
   PAGE ARCHITECTURE + REDIRECT MAP — pure helpers for the Architecture step.

   ⛔ NO FAKE PAGES. Seeding from a template creates one service page per VERIFIED service only, no
   location DETAIL pages at all (a town page needs genuinely local content, which only Paul can
   judge), and pricing / gallery only when their fact is verified. Seeding from the stored crawl
   lists the old URLs as `undecided` — a page nobody has classified never reads as Keep.
   ⛔ REDIRECTS ARE ONE HOP. A destination that is itself redirected is a CHAIN and blocks; a source
   that is also a live page in the plan would shadow it and blocks; a flood of redirects to the
   homepage is flagged, because that throws away the old page's search equity.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

import type { ArchPage, PageFamily, Redirect } from './websiteBuildState.ts';
import type { WebsiteTemplate } from './websiteTemplates.ts';
import type { FactRow } from './buildFacts.ts';
import { isPublishable } from './buildFacts.ts';

export function slugify(s: string): string {
  return s.toLowerCase().normalize('NFKD').replace(/[^\x00-\x7f]/g, '').replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 60);
}

/** URL or path → its path (+ query), so https://old.co.uk/a/ and /a/ compare equal. */
export function toPath(raw: string): string {
  const s = String(raw || '').trim();
  if (!s) return '';
  if (/^https?:\/\//i.test(s)) {
    try { const u = new URL(s); return (u.pathname || '/') + u.search; } catch { return s; }
  }
  return s.startsWith('/') ? s : `/${s}`;
}
/** Comparison key: case-folded, trailing slash dropped (except root). */
export function pathKey(raw: string): string {
  const p = toPath(raw).toLowerCase();
  return p.length > 1 ? p.replace(/\/+$/, '') || '/' : p;
}
const isExternal = (to: string) => /^https?:\/\//i.test(to.trim());

let counter = 0;
export const newPageId = () => `p${Date.now().toString(36)}${(counter++).toString(36)}`;

const blankPage = (over: Partial<ArchPage>): ArchPage => ({
  id: newPageId(), family: 'other', title: '', path: '', action: 'undecided', old_url: '', target: '', notes: '', ...over,
});

const factValues = (rows: FactRow[], key: string) => {
  const r = rows.find((x) => x.key === key);
  return r && isPublishable(r) ? r.value.split(',').map((v) => v.trim()).filter(Boolean) : [];
};

/** The template's page families for THIS client — only what the verified facts support. */
export function seedFromTemplate(template: WebsiteTemplate, rows: FactRow[]): ArchPage[] {
  const services = factValues(rows, 'services');
  const has = (key: string) => factValues(rows, key).length > 0;
  const out: ArchPage[] = [];
  for (const f of template.defaultPageFamilies) {
    if (f.family === 'service') {
      for (const s of services) out.push(blankPage({ family: 'service', title: s, path: `/services/${slugify(s)}/`, action: 'create' }));
      continue;
    }
    if (f.family === 'location' || f.family === 'commercial') continue;           // Paul decides these by hand
    if (f.family === 'locations_index' && !has('service_areas')) continue;
    if (f.family === 'pricing' && !has('prices')) continue;
    if (f.family === 'gallery' && !has('photos')) continue;
    out.push(blankPage({ family: f.family, title: f.title, path: f.path, action: 'create' }));
  }
  return out;
}

const KIND_FAMILY: Record<string, PageFamily> = { service: 'service', location: 'location', about: 'about', contact: 'contact' };

/** The old site's URLs Findable already stored (the crawl's checked pages), as undecided rows. */
export function seedFromCrawl(checkedPages: Array<{ url: string; kind?: string }> | null | undefined, existing: ArchPage[]): ArchPage[] {
  const have = new Set(existing.map((p) => pathKey(p.old_url || p.path)));
  const out: ArchPage[] = [];
  for (const c of checkedPages ?? []) {
    const key = pathKey(c.url);
    if (!key || have.has(key)) continue;
    have.add(key);
    const family: PageFamily = key === '/' ? 'homepage' : (KIND_FAMILY[c.kind ?? ''] ?? 'other');
    out.push(blankPage({ family, title: key === '/' ? 'Home' : '', old_url: c.url, path: '', action: 'undecided', notes: 'Seeded from the stored crawl — decide keep / consolidate / redirect / remove.' }));
  }
  return out;
}

/** Redirect rules implied by the pages Paul marked consolidate / redirect with a target. */
export function redirectsFromPages(pages: ArchPage[], existing: Redirect[]): Redirect[] {
  const have = new Set(existing.map((r) => pathKey(r.from)));
  const out: Redirect[] = [];
  for (const p of pages) {
    if ((p.action !== 'redirect' && p.action !== 'consolidate') || !p.old_url || !p.target) continue;
    const from = toPath(p.old_url);
    if (have.has(pathKey(from))) continue;
    have.add(pathKey(from));
    out.push({ from, to: isExternal(p.target) ? p.target.trim() : toPath(p.target), reason: p.notes || (p.action === 'consolidate' ? 'Consolidated into this page' : 'Moved') });
  }
  return out;
}

/* ── redirect text ⇄ rows ─────────────────────────────────────────────────────────────────────── */

/** "/old -> /new | reason" per line. Also accepts "→", or _redirects style "/old /new 301". */
export function parseRedirectText(text: string): Redirect[] {
  const out: Redirect[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/\s+#.*$/, '').trim();
    if (!line || line.startsWith('#')) continue;
    const [pair, ...reasonParts] = line.split('|');
    const reason = reasonParts.join('|').trim();
    let from = '', to = '';
    const arrow = pair.split(/\s*(?:->|→|=>)\s*/);
    if (arrow.length >= 2) { from = arrow[0]; to = arrow[1]; }
    else { const parts = pair.trim().split(/\s+/); from = parts[0] ?? ''; to = parts[1] ?? ''; }
    from = toPath(from.trim());
    to = to.trim().replace(/\s+30[12]$/, '');
    if (!from) continue;
    out.push({ from, to: isExternal(to) ? to : toPath(to), reason });
  }
  return out;
}

export function redirectsToText(rows: Redirect[]): string {
  return rows.map((r) => `${r.from} -> ${r.to}${r.reason ? ` | ${r.reason}` : ''}`).join('\n');
}

export interface ArchitectureIssue { level: 'error' | 'warning'; message: string }

/** Every problem with the plan. Errors block the Architecture step; warnings are shown. */
export function checkArchitecture(pages: ArchPage[], redirects: Redirect[]): ArchitectureIssue[] {
  const issues: ArchitectureIssue[] = [];
  const live = new Map<string, ArchPage>();
  for (const p of pages) if ((p.action === 'keep' || p.action === 'create') && p.path) live.set(pathKey(p.path), p);

  const undecided = pages.filter((p) => p.action === 'undecided').length;
  if (undecided) issues.push({ level: 'error', message: `${undecided} page(s) still need a decision (keep / create / consolidate / redirect / remove).` });
  const noPath = pages.filter((p) => (p.action === 'keep' || p.action === 'create') && !p.path).length;
  if (noPath) issues.push({ level: 'error', message: `${noPath} kept / created page(s) have no path on the new site.` });
  const noTarget = pages.filter((p) => (p.action === 'redirect' || p.action === 'consolidate') && !p.target).length;
  if (noTarget) issues.push({ level: 'error', message: `${noTarget} consolidated / redirected page(s) have no destination.` });

  const dupPaths = new Map<string, number>();
  for (const p of pages) if ((p.action === 'keep' || p.action === 'create') && p.path) dupPaths.set(pathKey(p.path), (dupPaths.get(pathKey(p.path)) ?? 0) + 1);
  for (const [k, n] of dupPaths) if (n > 1) issues.push({ level: 'error', message: `Two pages own the same path ${k} — one primary page per intent.` });

  const froms = new Map<string, Redirect>();
  for (const r of redirects) {
    const k = pathKey(r.from);
    if (froms.has(k)) issues.push({ level: 'error', message: `${r.from} is redirected twice — keep one rule.` });
    froms.set(k, r);
  }
  const notInPlan: string[] = [], noSlash: string[] = [], noReason: string[] = [];
  for (const r of redirects) {
    const fk = pathKey(r.from);
    if (!r.to) { issues.push({ level: 'error', message: `${r.from} has no destination.` }); continue; }
    if (!isExternal(r.to) && pathKey(r.to) === fk) { issues.push({ level: 'error', message: `${r.from} redirects to itself.` }); continue; }
    if (live.has(fk)) issues.push({ level: 'error', message: `${r.from} is a live page in the plan AND redirected — the redirect would hide the page.` });
    if (!isExternal(r.to) && froms.has(pathKey(r.to))) {
      const next = froms.get(pathKey(r.to))!;
      issues.push({ level: 'error', message: `Chain: ${r.from} → ${r.to} → ${next.to}. Point ${r.from} straight at ${next.to}.` });
    }
    if (!isExternal(r.to) && live.size && !live.has(pathKey(r.to)) && pathKey(r.to) !== '/') {
      notInPlan.push(`${r.from} → ${r.to}`);
    }
    if (!isExternal(r.to) && r.to !== '/' && !/\/$/.test(toPath(r.to).split('?')[0]) && !/\.[a-z0-9]{2,5}$/i.test(r.to)) {
      noSlash.push(`${r.from} → ${r.to}`);
    }
    if (!r.reason) noReason.push(r.from);
  }
  const some = (xs: string[]) => xs.slice(0, 3).join('; ') + (xs.length > 3 ? ` and ${xs.length - 3} more` : '');
  if (notInPlan.length) issues.push({ level: 'warning', message: `${notInPlan.length} redirect(s) point at a path that is not a kept / created page in the plan: ${some(notInPlan)}.` });
  if (noSlash.length) issues.push({ level: 'warning', message: `${noSlash.length} destination(s) have no trailing slash — Astro serves /page/, so each costs a second hop: ${some(noSlash)}.` });
  if (noReason.length) issues.push({ level: 'warning', message: `${noReason.length} redirect(s) have no reason recorded: ${some(noReason)}.` });
  const toHome = redirects.filter((r) => !isExternal(r.to) && pathKey(r.to) === '/').length;
  if (toHome >= 3 && toHome / Math.max(1, redirects.length) > 0.3) {
    issues.push({ level: 'warning', message: `${toHome} of ${redirects.length} redirects go to the homepage. Send each old page to its closest real match instead.` });
  }
  const locations = pages.filter((p) => p.family === 'location' && (p.action === 'create' || p.action === 'keep')).length;
  if (locations > 12) issues.push({ level: 'warning', message: `${locations} location pages. Only keep towns with genuinely different local content — no doorway pages.` });
  return issues;
}

/**
 * The capture prompt's page list, pasted back:  action | family | /new-path/ | Title | old url | target | note
 * A line whose action or family is not a known token becomes `undecided` / `other` — never guessed.
 */
export function parsePageLines(text: string, actions: readonly string[], families: readonly string[]): ArchPage[] {
  const out: ArchPage[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/^\s*[-*]\s+/, '').trim();
    if (!line || line.startsWith('#') || !line.includes('|')) continue;
    const [action = '', family = '', path = '', title = '', oldUrl = '', target = '', ...rest] = line.split('|').map((c) => c.trim());
    const a = action.toLowerCase(), f = family.toLowerCase();
    if (a === 'action' && f === 'family') continue;                                     // a header row
    out.push(blankPage({
      action: (actions.includes(a) ? a : 'undecided') as ArchPage['action'],
      family: (families.includes(f) ? f : 'other') as ArchPage['family'],
      path: path ? toPath(path) : '', title, old_url: oldUrl, target: target ? (isExternal(target) ? target : toPath(target)) : '',
      notes: rest.join(' | '),
    }));
  }
  return out;
}
