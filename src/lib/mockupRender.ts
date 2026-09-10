/* ════════════════════════════════════════════════════════════════════════════════════════════════
   THE MOCKUP SUBSTITUTION ENGINE — pure, no imports, no DOM, no React.

   Paul authors the template. This fills in values and escapes them. It makes NO layout decisions:
   it never picks a section, never reorders, never composes a fallback, and never calls an LLM.
   Anything not in the contract, it does not do.

   ⛔ FOUR CONSTRUCTS. THERE ARE NO OTHERS.
     {{ field }}                 text, HTML-escaped
     {{ url field }}             a URL, validated then attribute-escaped
     {{#if field}} … {{/if}}     drop the enclosed markup when the value is empty
     {{#each list}} … {{/each}}  repeat the enclosed markup per item

   ⛔ AND THERE IS DELIBERATELY NO RAW-HTML CONSTRUCT. Service names, descriptions and area names
   are SCRAPED FROM A STRANGER'S WEBSITE and passed through an LLM — untrusted text by definition.
   Every value is escaped, always. A template that needs bold inside a description supplies the
   markup around the value, never in it.

   ⛔ `{{#if}}` DROPS EXACTLY WHAT IS BETWEEN THE MARKERS, and the granularity is the template
   author's, decided by where the tags go. This is the property Paul asked to be certain of before
   designing, because HALF the businesses measured have no hero-capable photo:
       {{#if img hero}}<section class="hero">…</section>{{/if}}   → the whole SECTION disappears
       <section class="hero">{{#if img hero}}<img …>{{/if}}…</section> → only the IMG disappears
   Both are valid and they do different things. scripts/mockup-render.test.ts pins both, plus
   nesting and the empty-list case.
   ════════════════════════════════════════════════════════════════════════════════════════════════ */

export interface MockupService { name: string; price?: string; description?: string }

export interface MockupData {
  business: {
    name: string;
    trade: string;
    town: string;
    phone?: string | null;
    phone_link?: string | null;
    address?: string | null;
    email?: string | null;
    hours?: string | null;
  };
  services: MockupService[];
  areas: string[];
  /** slot name → URL. An UNASSIGNED slot is absent, and absent renders as nothing. */
  slots: Record<string, string>;
}

/** A required field that was missing. The render REFUSES rather than shipping a blank. */
export class MissingRequired extends Error {
  constructor(public readonly field: string) {
    super(`required field missing: ${field}`);
    this.name = "MissingRequired";
  }
}

/* ── Escaping ─────────────────────────────────────────────────────────────────────────────────
   ONE escaper for both text and quoted attributes. Escaping `"` and `'` as well as `& < >` is
   what makes a single construct safe in both positions, so a template author never has to think
   about which context they are in — the contract promises that and this is where it is kept. */
export function escapeHtml(v: unknown): string {
  return String(v ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * A URL safe to put in an attribute, or "" if it is not one.
 *
 * ⛔ SCHEME ALLOWLIST, NOT A BLOCKLIST. `javascript:` and `data:` are the obvious ones to refuse,
 * but a blocklist of those two would still admit `vbscript:` and anything invented later. Only
 * http, https, tel and mailto pass — tel and mailto because the contract's `phone_link` and the
 * contact block need them.
 */
export function safeUrl(v: unknown): string {
  const raw = String(v ?? "").trim();
  if (!raw) return "";
  if (/^(?:tel:|mailto:)/i.test(raw)) return escapeHtml(raw);
  try {
    const u = new URL(raw);
    if (u.protocol !== "http:" && u.protocol !== "https:") return "";
    return escapeHtml(u.href);
  } catch {
    return "";
  }
}

/* ── Value resolution ─────────────────────────────────────────────────────────────────────── */

type Scope = Record<string, unknown>;

/**
 * Resolve one placeholder expression against the data and the current loop scope.
 *
 * Accepts: `business.name`, `services`, `areas`, `img hero`, `.name` (inside an each), `.`
 * (the current item, for a list of strings).
 */
function resolve(expr: string, data: MockupData, scope: Scope | null): unknown {
  const e = expr.trim();
  if (!e) return undefined;

  // `img NAME` — a slot. Absent slot → undefined, which {{#if}} reads as empty.
  const img = e.match(/^img\s+([A-Za-z0-9_-]+)$/);
  if (img) return data.slots?.[img[1]];

  // `.` — the current item itself (a list of strings).
  if (e === ".") return scope?.["."];
  // `.field` — a field of the current item.
  if (e.startsWith(".")) return scope ? (scope[e.slice(1)] as unknown) : undefined;

  // Dotted path from the root.
  let cur: unknown = data;
  for (const part of e.split(".")) {
    if (cur === null || cur === undefined || typeof cur !== "object") return undefined;
    cur = (cur as Record<string, unknown>)[part];
  }
  return cur;
}

/**
 * Is a resolved value "empty" for `{{#if}}` purposes?
 *
 * ⛔ AN EMPTY ARRAY IS EMPTY, and that is load-bearing rather than incidental: it is how
 * `{{#if areas}}<h2>Areas we cover</h2>…{{/if}}` makes the HEADING disappear too. Measured, two
 * of six real locksmiths name no areas at all, so a bare heading over nothing is the common case,
 * not the edge case.
 * ⚠️ Whitespace-only is empty. A scraped value of " " must not render a blank line and count as
 * present — the absent-value rule, on a document a prospect reads about themselves.
 */
function isEmpty(v: unknown): boolean {
  if (v === null || v === undefined || v === false) return true;
  if (typeof v === "string") return v.trim() === "";
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

/* ── Block parsing ───────────────────────────────────────────────────────────────────────────
   Hand-written scanner rather than a regex, because `{{#if}}` and `{{#each}}` NEST and a regex
   cannot match balanced delimiters. It walks the string once, tracking depth, so an inner
   `{{/if}}` cannot close an outer `{{#if}}`. */

const OPEN_RE = /\{\{#(if|each)\s+([^}]+?)\}\}/;

/** Find the matching close for a block opened at `openEnd`, honouring nesting. Returns null if
 *  the template is unbalanced — which is a template bug and must be reported, not guessed at. */
function findClose(src: string, openEnd: number, kind: "if" | "each"): { inner: string; after: number } | null {
  const openTag = new RegExp(`\\{\\{#${kind}\\s+[^}]+?\\}\\}`, "g");
  const closeTag = new RegExp(`\\{\\{/${kind}\\}\\}`, "g");
  let depth = 1;
  let i = openEnd;
  while (i < src.length) {
    openTag.lastIndex = i;
    closeTag.lastIndex = i;
    const o = openTag.exec(src);
    const c = closeTag.exec(src);
    if (!c) return null;                                   // unbalanced
    if (o && o.index < c.index) { depth++; i = o.index + o[0].length; continue; }
    depth--;
    if (depth === 0) return { inner: src.slice(openEnd, c.index), after: c.index + c[0].length };
    i = c.index + c[0].length;
  }
  return null;
}

/** Substitute the leaf placeholders — `{{ x }}` and `{{ url x }}` — in a block with no blocks left. */
function fillLeaves(src: string, data: MockupData, scope: Scope | null, required: Set<string>): string {
  return src.replace(/\{\{\s*([^#/][^}]*?)\s*\}\}/g, (_m, exprRaw: string) => {
    const expr = exprRaw.trim();
    const isUrl = /^url\s+/.test(expr);
    const inner = isUrl ? expr.replace(/^url\s+/, "").trim() : expr;
    const val = resolve(inner, data, scope);
    if (required.has(inner) && isEmpty(val)) throw new MissingRequired(inner);
    return isUrl ? safeUrl(val) : escapeHtml(val);
  });
}

/** Required placeholders. Missing → the render refuses; a mockup with no business name is worse
 *  than no mockup. Everything else is optional and renders as nothing. */
const REQUIRED = new Set(["business.name", "business.trade", "business.town"]);

/** Expand blocks and leaves recursively. */
function render(src: string, data: MockupData, scope: Scope | null): string {
  let out = "";
  let rest = src;
  for (;;) {
    const m = OPEN_RE.exec(rest);
    if (!m) { out += fillLeaves(rest, data, scope, REQUIRED); break; }
    out += fillLeaves(rest.slice(0, m.index), data, scope, REQUIRED);
    const kind = m[1] as "if" | "each";
    const expr = m[2].trim();
    const openEnd = m.index + m[0].length;
    const found = findClose(rest, openEnd, kind);
    if (!found) throw new Error(`unbalanced {{#${kind} ${expr}}} — no matching {{/${kind}}}`);
    const val = resolve(expr, data, scope);
    if (kind === "if") {
      // ⛔ The ENTIRE inner block is dropped when empty — see the header.
      out += isEmpty(val) ? "" : render(found.inner, data, scope);
    } else {
      const list = Array.isArray(val) ? val : [];
      for (const item of list) {
        const itemScope: Scope = typeof item === "object" && item !== null
          ? { ...(item as Record<string, unknown>), ".": item }
          : { ".": item };
        out += render(found.inner, data, itemScope);
      }
    }
    rest = rest.slice(found.after);
  }
  return out;
}

/** Extract one `<template data-page="NAME">…</template>` body. */
export function pageTemplate(file: string, page: string): string | null {
  const re = new RegExp(`<template\\s+data-page\\s*=\\s*["']${page}["']\\s*>([\\s\\S]*?)<\\/template>`, "i");
  const m = file.match(re);
  return m ? m[1] : null;
}

/**
 * Every image slot the template asks for, in first-appearance order.
 *
 * ⛔ THIS IS THE SLOT LIST — the picker shows one drop target per name it returns, and nothing
 * else declares them. Paul writes `{{url img van}}` and a "van" target appears: template plus
 * registry row, no code change. That is the contract's promise and this function is where it is
 * kept, so it must stay the ONLY definition of what slots exist.
 */
export function slotsIn(file: string): string[] {
  const out: string[] = [];
  for (const m of file.matchAll(/\{\{\s*(?:url\s+)?img\s+([A-Za-z0-9_-]+)\s*\}\}/g)) {
    if (!out.includes(m[1])) out.push(m[1]);
  }
  for (const m of file.matchAll(/\{\{#if\s+img\s+([A-Za-z0-9_-]+)\s*\}\}/g)) {
    if (!out.includes(m[1])) out.push(m[1]);
  }
  return out;
}

/** Apply the contract's caps. Truncation is the renderer's job so no template writes defensive
 *  markup — measured ranges were 2-37 services and 0-38 areas. */
export function capData(data: MockupData, caps: { services: number; areas: number }): MockupData {
  return {
    ...data,
    services: (data.services ?? []).slice(0, caps.services),
    areas: (data.areas ?? []).slice(0, caps.areas),
  };
}

/** Render one page of a template file. Throws MissingRequired, or on an unbalanced block. */
export function renderPage(file: string, page: string, data: MockupData): string {
  const tpl = pageTemplate(file, page);
  if (tpl === null) throw new Error(`template has no <template data-page="${page}">`);
  return render(tpl, data, null);
}
